import { useState } from 'react'
import type { Container, ContainerInput, ContainerType } from '@shared/types'
import { CONTAINER_TYPES, BOOKING_STATUS_LABELS } from '@shared/types'
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input'
import flags from 'react-phone-number-input/flags'
import 'react-phone-number-input/style.css'

interface Props {
  bookingId: number
  container?: Container
  onClose: () => void
  onSaved: () => void
}

const empty = (bookingId: number): ContainerInput => ({
  bookingId,
  containerNo: '',
  type: '40HC' as ContainerType,
  sealNo: '',
  truckPlate: '',
  trailerPlate: '',
  driverPhone: '',
  vesselName: '',
  imoNumber: '',
  mmsiNumber: '',
  notes: ''
})

export default function ContainerFormModal({
  bookingId,
  container,
  onClose,
  onSaved
}: Props): React.JSX.Element {
  const [form, setForm] = useState<ContainerInput>(
    container
      ? {
          bookingId: container.bookingId,
          containerNo: container.containerNo ?? '',
          type: container.type,
          sealNo: container.sealNo ?? '',
          truckPlate: container.truckPlate ?? '',
          trailerPlate: container.trailerPlate ?? '',
          driverPhone: container.driverPhone ?? '',
          vesselName: container.vesselName ?? '',
          imoNumber: container.imoNumber ?? '',
          mmsiNumber: container.mmsiNumber ?? '',
          notes: container.notes ?? ''
        }
      : empty(bookingId)
  )
  const [saving, setSaving] = useState(false)
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof ContainerInput>(key: K, value: ContainerInput[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setPhoneError(null)
    setError(null)

    const containerNo = (form.containerNo ?? '').trim()
    const sealNo = (form.sealNo ?? '').trim()
    const missingFields: string[] = []
    if (!containerNo) missingFields.push('Konteyner No')
    if (!sealNo) missingFields.push('Mühür (Seal No)')
    if (missingFields.length > 0) {
      setError(`Şu alanlar zorunludur: ${missingFields.join(', ')}.`)
      return
    }

    const driverPhone = form.driverPhone
    if (driverPhone && driverPhone.trim().length > 0 && !isValidPhoneNumber(driverPhone)) {
      setPhoneError(
        'Telefon numarası geçersiz. Ülke bayrağına tıklayıp seçin ve numarayı kontrol edin.'
      )
      return
    }

    const conflicts = await window.api.containers.findConflicts(containerNo, container?.id)
    if (conflicts.length > 0) {
      const list = conflicts
        .map((c) => `${c.bookingNo} (${BOOKING_STATUS_LABELS[c.bookingStatus]})`)
        .join(', ')
      const proceed = window.confirm(
        `Uyarı: "${containerNo}" konteyner numarası zaten aktif başka booking'lerde kayıtlı: ${list}.\n\nBu mükerrer giriş insan hatası olabilir. Yine de kaydetmek istiyor musunuz?`
      )
      if (!proceed) return
    }

    setSaving(true)
    try {
      const payload: ContainerInput = { ...form, driverPhone: driverPhone || null }
      if (container) {
        await window.api.containers.update(container.id, payload)
      } else {
        await window.api.containers.create(payload)
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2>{container ? 'Konteyner Düzenle' : 'Yeni Konteyner'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>Konteyner No *</label>
              <input
                className="text-input"
                value={form.containerNo ?? ''}
                onChange={(e) => update('containerNo', e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label>Tip *</label>
              <select
                className="select-input"
                value={form.type}
                onChange={(e) => update('type', e.target.value as ContainerType)}
              >
                {CONTAINER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Mühür (Seal No) *</label>
              <input
                className="text-input"
                value={form.sealNo ?? ''}
                onChange={(e) => update('sealNo', e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label>Çekici</label>
              <input
                className="text-input"
                value={form.truckPlate ?? ''}
                onChange={(e) => update('truckPlate', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>Dorse</label>
              <input
                className="text-input"
                value={form.trailerPlate ?? ''}
                onChange={(e) => update('trailerPlate', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>Gemi Adı</label>
              <input
                className="text-input"
                value={form.vesselName ?? ''}
                onChange={(e) => update('vesselName', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>IMO No</label>
              <input
                className="text-input"
                placeholder="ör. 9506291"
                value={form.imoNumber ?? ''}
                onChange={(e) => update('imoNumber', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>MMSI No</label>
              <input
                className="text-input"
                placeholder="ör. 224466900"
                value={form.mmsiNumber ?? ''}
                onChange={(e) => update('mmsiNumber', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>Telefon</label>
              <PhoneInput
                international
                defaultCountry="TR"
                flags={flags}
                className="phone-input"
                placeholder="Telefon numarası"
                value={form.driverPhone ?? ''}
                onChange={(value) => update('driverPhone', value ?? '')}
              />
              {phoneError && (
                <div className="form-error" style={{ marginTop: 4 }}>
                  {phoneError}
                </div>
              )}
            </div>
            <div className="form-field full">
              <label>Durum / Not</label>
              <textarea
                className="textarea-input"
                rows={2}
                value={form.notes ?? ''}
                onChange={(e) => update('notes', e.target.value)}
              />
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn secondary" onClick={onClose}>
              İptal
            </button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
