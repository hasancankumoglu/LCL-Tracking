import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Container, ContainerInput, ContainerType } from '@shared/types'
import { CONTAINER_TYPES } from '@shared/types'
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
  const { t } = useTranslation()
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
    if (!sealNo) missingFields.push(t('containers.sealFieldName'))
    if (missingFields.length > 0) {
      setError(t('containers.requiredFieldsMessage', { fields: missingFields.join(', ') }))
      return
    }

    const driverPhone = form.driverPhone
    if (driverPhone && driverPhone.trim().length > 0 && !isValidPhoneNumber(driverPhone)) {
      setPhoneError(t('containers.phoneInvalid'))
      return
    }

    const conflicts = await window.api.containers.findConflicts(containerNo, container?.id)
    if (conflicts.length > 0) {
      const list = conflicts
        .map((c) => `${c.bookingNo} (${t(`enums.bookingStatus.${c.bookingStatus}`)})`)
        .join(', ')
      const proceed = window.confirm(t('containers.duplicateWarning', { containerNo, list }))
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
        <h2>{container ? t('containers.editTitle') : t('containers.newTitle')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>{t('containers.containerNo')}</label>
              <input
                className="text-input"
                value={form.containerNo ?? ''}
                onChange={(e) => update('containerNo', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>{t('containers.typeRequired')}</label>
              <select
                className="select-input"
                value={form.type}
                onChange={(e) => update('type', e.target.value as ContainerType)}
              >
                {CONTAINER_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {ct}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>{t('containers.sealNoRequired')}</label>
              <input
                className="text-input"
                value={form.sealNo ?? ''}
                onChange={(e) => update('sealNo', e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label>{t('containers.truckPlate')}</label>
              <input
                className="text-input"
                value={form.truckPlate ?? ''}
                onChange={(e) => update('truckPlate', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>{t('containers.trailerPlate')}</label>
              <input
                className="text-input"
                value={form.trailerPlate ?? ''}
                onChange={(e) => update('trailerPlate', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>{t('containers.vesselName')}</label>
              <input
                className="text-input"
                value={form.vesselName ?? ''}
                onChange={(e) => update('vesselName', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>{t('containers.imoNo')}</label>
              <input
                className="text-input"
                placeholder={t('containers.imoPlaceholder')}
                value={form.imoNumber ?? ''}
                onChange={(e) => update('imoNumber', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>{t('containers.mmsiNo')}</label>
              <input
                className="text-input"
                placeholder={t('containers.mmsiPlaceholder')}
                value={form.mmsiNumber ?? ''}
                onChange={(e) => update('mmsiNumber', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>{t('containers.phone')}</label>
              <PhoneInput
                international
                defaultCountry="TR"
                flags={flags}
                className="phone-input"
                placeholder={t('containers.phonePlaceholder')}
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
              <label>{t('containers.statusNote')}</label>
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
              {t('common.dismiss')}
            </button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? t('auth.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
