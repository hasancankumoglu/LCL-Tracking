import { useTranslation } from 'react-i18next'
import type { DocumentType } from '@shared/types'

/**
 * Bir booking için eksik döküman durumunu hızlıca gösteren rozet.
 * Hiç eksik yoksa yeşil "Tam" rozeti, eksik varsa kırmızı sayı rozeti gösterir
 * ve üzerine gelindiğinde (title) eksik döküman tiplerini listeler.
 */
export default function MissingDocsBadge({
  missing
}: {
  missing: DocumentType[]
}): React.JSX.Element {
  const { t } = useTranslation()
  if (missing.length === 0) {
    return <span className="badge badge-docs-complete">{t('misc.missingDocsComplete')}</span>
  }
  const labels = missing.map((d) => t(`enums.documentType.${d}`)).join(', ')
  return (
    <span className="badge badge-docs-missing" title={t('misc.missingDocsTitle', { labels })}>
      {t('misc.missingDocsBadge', { count: missing.length })}
    </span>
  )
}
