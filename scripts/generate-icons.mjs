import { Jimp } from 'jimp'
import pngToIco from 'png-to-ico'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const root = process.cwd()
const source = join(root, 'palm-marine-logo.png')
const sizes = [16, 24, 32, 48, 64, 128, 256]

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function main() {
  const buffers = []

  for (const size of sizes) {
    const image = await Jimp.read(source)
    image.resize({ w: size, h: size })
    const buffer = await image.getBuffer('image/png')
    buffers.push(buffer)
  }

  const icoBuffer = await pngToIco(buffers)

  mkdirSync(join(root, 'build'), { recursive: true })
  mkdirSync(join(root, 'resources'), { recursive: true })

  writeFileSync(join(root, 'build', 'icon.ico'), icoBuffer)

  const png256 = await Jimp.read(source)
  png256.resize({ w: 256, h: 256 })
  await png256.write(join(root, 'build', 'icon.png'))
  await png256.write(join(root, 'resources', 'icon.png'))

  console.log('Icons generated: build/icon.ico, build/icon.png, resources/icon.png')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
