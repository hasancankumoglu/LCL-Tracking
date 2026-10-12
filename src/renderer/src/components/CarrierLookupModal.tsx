import { useState, type ReactElement } from 'react'
import type {
  Booking,
  CarrierBookingSnapshot,
  CarrierLookupResult,
  CarrierName,
  CarrierReferenceType
} from '@shared/types'
import {
  CARRIER_LABELS,
  CARRIER_NAMES,
  CARRIER_REFERENCE_TYPE_LABELS,
  CARRIER_REFERENCE_TYPES
} from '@shared/types'
import { formatDate } from '../lib/format'

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
        setError('Bu referans numarasıyla armatör sisteminde bir kayıt bulunamadı.')
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
        setError('Genel takip sayfasında da bu referansla bir kayıt bulunamadı.')
      } else if (result.status === 'not_configured') {
        setError("Genel takip fallback'i bu armatör için desteklenmiyor.")
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
      setError(err instanceof Error ? err.message : 'Güncelleme sırasında bir hata oluştu.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel modal-panel--wide" onClick={(e) => e.stopPropagation()}>
        <h2>Armatörden Getir</h2>

        {step === 'form' && (
          <>
            <div className="form-grid">
              <div className="form-field">
                <label>Armatör</label>
                <select value={carrier} onChange={(e) => setCarrier(e.target.value as CarrierName)}>
                  {CARRIER_NAMES.map((c) => (
                    <option key={c} value={c}>
                      {CARRIER_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Referans Tipi</label>
                <select
                  value={referenceType}
                  onChange={(e) => setReferenceType(e.target.value as CarrierReferenceType)}
                >
                  {CARRIER_REFERENCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CARRIER_REFERENCE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field full">
                <label>{CARRIER_REFERENCE_TYPE_LABELS[referenceType]}</label>
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Örn. 277276388"
                />
              </div>
            </div>

            {error && (
              <div style={{ color: '#c0392b', marginTop: 12 }}>
                {error}
                <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button type="button" className="link-button" onClick={handleChangeCredentials}>
                    Kimlik bilgilerini güncelle
                  </button>
                </div>
              </div>
            )}

            {carrier === 'MAERSK' && (
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>
                Resmi API onayınız bekleniyorsa, aşağıdaki &quot;Genel Takip Sayfası&quot;
                seçeneğini kullanarak deneysel olarak sorgulayabilirsiniz.
              </div>
            )}

            <div className="form-actions">
              <button className="btn secondary" onClick={onClose} disabled={loading}>
                Vazgeç
              </button>
              {carrier === 'MAERSK' && (
                <button
                  className="btn secondary"
                  onClick={handlePublicFallbackLookup}
                  disabled={loading || !value.trim()}
                >
                  {loading ? 'Sorgulanıyor...' : 'Genel Takip Sayfasından Sorgula (deneysel)'}
                </button>
              )}
              <button className="btn" onClick={handleLookup} disabled={loading || !value.trim()}>
                {loading ? 'Sorgulanıyor...' : 'Resmi API ile Sorgula'}
              </button>
            </div>
          </>
        )}

        {step === 'credentials' && (
          <>
            <div className="empty-state" style={{ marginBottom: 12 }}>
              {CARRIER_LABELS[carrier]} API kimlik bilgileri henüz tanımlı değil. Devam etmek için
              Consumer-Key ve Consumer-Secret&apos;ı girin (bir kere girilir, sonraki sorgularda
              tekrar sorulmaz).
            </div>
            {carrier === 'MAERSK' && (
              <div style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="link-button"
                  onClick={handlePublicFallbackLookup}
                  disabled={loading}
                >
                  Kimlik bilgisi girmeden genel takip sayfasından dene (deneysel)
                </button>
              </div>
            )}
            <div className="form-grid">
              <div className="form-field full">
                <label>Consumer-Key</label>
                <input value={consumerKey} onChange={(e) => setConsumerKey(e.target.value)} />
              </div>
              <div className="form-field full">
                <label>Consumer-Secret</label>
                <input
                  type="password"
                  value={consumerSecret}
                  onChange={(e) => setConsumerSecret(e.target.value)}
                />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn secondary" onClick={onClose}>
                Vazgeç
              </button>
              <button
                className="btn"
                onClick={handleSaveCredentials}
                disabled={!consumerKey.trim() || !consumerSecret.trim()}
              >
                Kaydet ve Devam Et
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
                Bu veri resmi Maersk API&apos;sinden değil, halka açık takip sayfasından deneysel
                olarak alınmıştır; doğruluğu garanti edilmez, onaylamadan önce kontrol edin.
              </div>
            )}
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Alan</th>
                    <th>Mevcut</th>
                    <th>Armatörden Gelen</th>
                  </tr>
                </thead>
                <tbody>
                  {compareRow('Konşimento (BL) No', booking.blNumber, snapshot.blNumber)}
                  {compareRow('Booking Referans No', booking.bookingNo, snapshot.bookingReference)}
                  {compareRow('Gemi Adı', null, snapshot.vesselName)}
                  {compareRow('IMO No', null, snapshot.imoNumber)}
                  {compareRow('POL', booking.pol, snapshot.pol)}
                  {compareRow('Destination', booking.destination, snapshot.destination)}
                  {compareRow('ETD', formatDate(booking.etd), formatDate(snapshot.etd))}
                  {compareRow('ETA', formatDate(booking.eta), formatDate(snapshot.eta))}
                  {compareRow('Konşimento Durumu', booking.blStatus, snapshot.blStatus)}
                  {compareRow(
                    'Free Time Bitiş',
                    formatDate(booking.freeTimeEnd),
                    formatDate(snapshot.freeTimeEnd)
                  )}
                </tbody>
              </table>
            </div>

            <div className="import-preview-section">
              <strong>Konteynerlar ({snapshot.containers.length})</strong>
              <div className="table-scroll import-preview-table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Konteyner No</th>
                      <th>Ekipman Tipi</th>
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
                Yalnızca bu bookingdeki mevcut konteyner numaralarıyla eşleşenler güncellenecek;
                eşleşmeyen numaralar için yeni konteyner oluşturulmayacak.
              </div>
            </div>

            {error && <div style={{ color: '#c0392b', marginTop: 12 }}>{error}</div>}

            <div className="form-actions">
              <button className="btn secondary" onClick={() => setStep('form')} disabled={applying}>
                Geri
              </button>
              <button className="btn" onClick={handleApply} disabled={applying}>
                {applying ? 'Güncelleniyor...' : 'Onayla ve Güncelle'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
