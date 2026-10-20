import { Jimp } from 'jimp'
import { join } from 'path'

const root = process.cwd()
const source = join(root, 'palm-marine-logo.png')

// Classic "white to alpha" trick: alpha = 255 - darkest channel, so pure white
// becomes fully transparent while the logo's navy/red ink stays opaque.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function whiteToAlpha(image, opacityScale) {
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (_x, _y, idx) {
    const r = this.bitmap.data[idx + 0]
    const g = this.bitmap.data[idx + 1]
    const b = this.bitmap.data[idx + 2]
    const alpha = 255 - Math.min(r, g, b)
    this.bitmap.data[idx + 3] = Math.round(alpha * opacityScale)
  })
  return image
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function main() {
  // Watermark: full logo, transparent bg, alpha baked down to ~16% for a visible
  // but still subtle app-wide background image.
  const watermark = await Jimp.read(source)
  whiteToAlpha(watermark, 0.16)
  watermark.resize({ w: 900, h: 900 })
  await watermark.write(join(root, 'src/renderer/src/assets/plm-watermark.png'))

  // Spinner: just the "PLM" monogram + script, bottom "LOGISTICS" caption band
  // cropped off so the rotating mark doesn't carry rotated text, full opacity.
  const spinner = await Jimp.read(source)
  whiteToAlpha(spinner, 1)
  const fullHeight = spinner.bitmap.height
  spinner.crop({ x: 0, y: 0, w: spinner.bitmap.width, h: Math.round(fullHeight * 0.78) })
  const scale = 320 / spinner.bitmap.width
  spinner.resize({ w: 320, h: Math.round(spinner.bitmap.height * scale) })
  await spinner.write(join(root, 'src/renderer/src/assets/plm-spinner.png'))

  console.log('Loading assets generated: plm-watermark.png, plm-spinner.png')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
