import type { DocumentType } from '@shared/types'
import { DOCUMENT_TYPE_LABELS } from '@shared/types'

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
  if (missing.length === 0) {
    return <span className="badge badge-docs-complete">Tam</span>
  }
  const labels = missing.map((t) => DOCUMENT_TYPE_LABELS[t]).join(', ')
  return (
    <span className="badge badge-docs-missing" title={`Eksik: ${labels}`}>
      {missing.length} Eksik
    </span>
  )
}
