import { useTranslation } from 'react-i18next'

interface Props {
  src: string
  onClose: () => void
}

export default function Lightbox({ src, onClose }: Props): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <img src={src} alt={t('misc.documentAlt')} />
    </div>
  )
}
