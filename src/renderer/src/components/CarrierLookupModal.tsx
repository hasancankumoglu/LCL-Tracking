import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  Booking,
  CarrierBookingSnapshot,
  CarrierLookupResult,
  CarrierName,
  CarrierReferenceType
} from '@shared/types'
import { CARRIER_NAMES, CARRIER_REFERENCE_TYPES } from '@shared/types'
import { formatDate, getErrorMessage } from '../lib/format'

interface Props {
  booking: Booking
  onClose: () => void
  onApplied: () => void | Promise<void>
}

type Step = 'form' | 'credentials' | 'preview'

function compareRow(label: string, current: string | null, incoming: string | null): ReactElement {
  const changed = Boolean(incoming) && incoming !== current
  return (
    <tr>
      <td>{label}</td>
      <td>{current || '-'}</td>
      <td className={changed ? 'carrier-preview__changed' : undefined}>{incoming || '-'}</td>
    </tr>
  )
}

export default function CarrierLookupModal({
  booking,
  onClose,
  onApplied
}: Props): React.JSX.Element {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('form')
  const [carrier, setCarrier] = useState<CarrierName>('MAERSK')
  const [referenceType, setReferenceType] = useState<CarrierReferenceType>('BL')
  const [value, setValue] = useState(booking.blNumber ?? '')
  const [consumerKey, setConsumerKey] = useState('')
  const [consumerSecret, setConsumerSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<CarrierBookingSnapshot | null>(null)

  async function handleLookup(): Promise<void> {
    if (!value.trim()) return
    setError(null)
    setLoading(true)
    try {
      const result: CarrierLookupResult = await window.api.carriers.lookup(
        carrier,
        referenceType,
        value.trim()
      )
      if (result.status === 'found') {
        setSnapshot(result.snapshot)
        setStep('preview')
      } else if (result.status === 'not_found') {
        setError(t('carriers.recordNotFound'))
      } else if (result.status === 'not_configured') {
        setStep('credentials')
      } else {
        setError(result.message)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveCredentials(): Promise<void> {
    if (!consumerKey.trim() || !consumerSecret.trim()) return
    await window.api.carriers.setCredentials(carrier, consumerKey.trim(), consumerSecret.trim())
    setConsumerSecret('')
    setError(null)
    setStep('form')
  }

  async function handleChangeCredentials(): Promise<void> {
    await window.api.carriers.clearCredentials(carrier)
    setConsumerKey('')
    setConsumerSecret('')
    setError(null)
    setStep('credentials')
  }

  async function handlePublicFallbackLookup(): Promise<void> {
    if (!value.trim()) return
    setError(null)
    setLoading(true)
    try {
      const result: CarrierLookupResult = await window.api.carriers.lookupPublicFallback(
        carrier,
        referenceType,
        value.trim()
      )
      if (result.status === 'found') {
        setSnapshot(result.snapshot)
        setStep('preview')
      } else if (result.status === 'not_found') {
        setError(t('carriers.publicFallbackNotFound'))
      } else if (result.status === 'not_configured') {
        setError(t('carriers.publicFallbackNotSupported'))
      } else {
        setError(result.message)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleApply(): Promise<void> {
    if (!snapshot) return
    setApplying(true)
    setError(null)
    try {
      await window.api.carriers.apply(booking.id, snapshot)
      await onApplied()
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, t('carriers.updateErrorGeneric')))
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel modal-panel--wide" onClick={(e) => e.stopPropagation()}>
        <h2>{t('carriers.fetchFromCarrier')}</h2>

        {step === 'form' && (
          <>
            <div className="form-grid">
              <div className="form-field">
                <label>{t('carriers.carrierLabel')}</label>
                <select value={carrier} onChange={(e) => setCarrier(e.target.value as CarrierName)}>
                  {CARRIER_NAMES.map((c) => (
                    <option key={c} value={c}>
                      {t(`enums.carrier.${c}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>{t('carriers.referenceTypeLabel')}</label>
                <select
                  value={referenceType}
                  onChange={(e) => setReferenceType(e.target.value as CarrierReferenceType)}
                >
                  {CARRIER_REFERENCE_TYPES.map((t2) => (
                    <option key={t2} value={t2}>
                      {t(`enums.carrierReferenceType.${t2}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field full">
                <label>{t(`enums.carrierReferenceType.${referenceType}`)}</label>
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={t('carriers.referencePlaceholder')}
                />
              </div>
            </div>

            {error && (
              <div style={{ color: '#c0392b', marginTop: 12 }}>
                {error}
                <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button type="button" className="link-button" onClick={handleChangeCredentials}>
                    {t('carriers.updateCredentials')}
                  </button>
                </div>
              </div>
            )}

            {carrier === 'MAERSK' && (
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>
                {t('carriers.officialApiPendingNote')}
              </div>
            )}

            <div className="form-actions">
              <button className="btn secondary" onClick={onClose} disabled={loading}>
                {t('common.cancel')}
              </button>
              {carrier === 'MAERSK' && (
                <button
                  className="btn secondary"
                  onClick={handlePublicFallbackLookup}
                  disabled={loading || !value.trim()}
                >
                  {loading ? t('carriers.querying') : t('carriers.publicFallbackButton')}
                </button>
              )}
              <button className="btn" onClick={handleLookup} disabled={loading || !value.trim()}>
                {loading ? t('carriers.querying') : t('carriers.officialApiButton')}
              </button>
            </div>
          </>
        )}

        {step === 'credentials' && (
          <>
            <div className="empty-state" style={{ marginBottom: 12 }}>
              {t('carriers.credentialsNotConfigured', { carrier: t(`enums.carrier.${carrier}`) })}
            </div>
            {carrier === 'MAERSK' && (
              <div style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="link-button"
                  onClick={handlePublicFallbackLookup}
                  disabled={loading}
                >
                  {t('carriers.tryWithoutCredentials')}
                </button>
              </div>
            )}
            <div className="form-grid">
              <div className="form-field full">
                <label>{t('carriers.consumerKey')}</label>
                <input value={consumerKey} onChange={(e) => setConsumerKey(e.target.value)} />
              </div>
              <div className="form-field full">
                <label>{t('carriers.consumerSecret')}</label>
                <input
                  type="password"
                  value={consumerSecret}
                  onChange={(e) => setConsumerSecret(e.target.value)}
                />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn secondary" onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button
                className="btn"
                onClick={handleSaveCredentials}
                disabled={!consumerKey.trim() || !consumerSecret.trim()}
              >
                {t('carriers.saveAndContinue')}
              </button>
            </div>
          </>
        )}

        {step === 'preview' && snapshot && (
          <>
            {snapshot.source === 'public-fallback' && (
              <div
                className="empty-state"
                style={{ marginBottom: 12, borderColor: '#c0392b', color: '#c0392b' }}
              >
                {t('carriers.publicFallbackWarning')}
              </div>
            )}
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('carriers.fieldColumn')}</th>
                    <th>{t('carriers.currentColumn')}</th>
                    <th>{t('carriers.fromCarrierColumn')}</th>
                  </tr>
                </thead>
                <tbody>
                  {compareRow(
                    t('enums.carrierReferenceType.BL'),
                    booking.blNumber,
                    snapshot.blNumber
                  )}
                  {compareRow(
                    t('enums.carrierReferenceType.BOOKING'),
                    booking.bookingNo,
                    snapshot.bookingReference
                  )}
                  {compareRow(t('carriers.vesselName'), null, snapshot.vesselName)}
                  {compareRow(t('carriers.imoNo'), null, snapshot.imoNumber)}
                  {compareRow(t('reports.pol'), booking.pol, snapshot.pol)}
                  {compareRow(t('reports.destination'), booking.destination, snapshot.destination)}
                  {compareRow('ETD', formatDate(booking.etd), formatDate(snapshot.etd))}
                  {compareRow('ETA', formatDate(booking.eta), formatDate(snapshot.eta))}
                  {compareRow(t('carriers.blStatus'), booking.blStatus, snapshot.blStatus)}
                  {compareRow(
                    t('carriers.freeTimeEnd'),
                    formatDate(booking.freeTimeEnd),
                    formatDate(snapshot.freeTimeEnd)
                  )}
                </tbody>
              </table>
            </div>

            <div className="import-preview-section">
              <strong>
                {t('carriers.containersCount', { count: snapshot.containers.length })}
              </strong>
              <div className="table-scroll import-preview-table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('carriers.containerNo')}</th>
                      <th>{t('carriers.equipmentType')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.containers.map((c) => (
                      <tr key={c.containerNo}>
                        <td>{c.containerNo}</td>
                        <td>{c.equipmentTypeCode || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
                {t('carriers.matchNote')}
              </div>
            </div>

            {error && <div style={{ color: '#c0392b', marginTop: 12 }}>{error}</div>}

            <div className="form-actions">
              <button className="btn secondary" onClick={() => setStep('form')} disabled={applying}>
                {t('common.back')}
              </button>
              <button className="btn" onClick={handleApply} disabled={applying}>
                {applying ? t('carriers.updating') : t('carriers.confirmAndUpdate')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
