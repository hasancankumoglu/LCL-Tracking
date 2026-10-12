interface Props {
  src: string
  onClose: () => void
}

export default function Lightbox({ src, onClose }: Props): React.JSX.Element {
  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <img src={src} alt="Döküman önizleme" />
    </div>
  )
}
