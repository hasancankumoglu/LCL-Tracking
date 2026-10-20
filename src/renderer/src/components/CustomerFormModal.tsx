import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Customer, CustomerCreateResult, CustomerInput } from '@shared/types'
import { getErrorMessage } from '../lib/format'

interface Props {
  /** Verilirse düzenleme modu; verilmezse yeni müşteri oluşturma modu. */
  customer?: Customer
  onClose: () => void
  onCreated: (result: CustomerCreateResult) => void
  onSaved: () => void
}

const PASSWORD_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

/** Web Crypto API (crypto.getRandomValues) ile rastgele geçici şifre üretir. */
function generateRandomPassword(length = 12): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => PASSWORD_CHARSET[b % PASSWORD_CHARSET.length]).join('')
}

export default function CustomerFormModal({
  customer,
  onClose,
  onCreated,
  onSaved
}: Props): React.JSX.Element {
  const { t } = useTranslation()
  const isEdit = Boolean(customer)
  const [taxNo, setTaxNo] = useState(customer?.taxNo ?? '')
  const [name, setName] = useState(customer?.name ?? '')
  const [taxOffice, setTaxOffice] = useState(customer?.taxOffice ?? '')
  const [address, setAddress] = useState(customer?.address ?? '')
  const [email, setEmail] = useState(customer?.email ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [initialPassword, setInitialPassword] = useState(() => generateRandomPassword())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    const trimmedTaxNo = taxNo.trim()
    const trimmedName = name.trim()
    const trimmedTaxOffice = taxOffice.trim()
    const trimmedEmail = email.trim()
    if (!trimmedTaxNo || !trimmedName || !trimmedTaxOffice || !trimmedEmail) {
      setError(t('customers.requiredFieldsError'))
      return
    }
    const input: CustomerInput = {
      taxNo: trimmedTaxNo,
      name: trimmedName,
      taxOffice: trimmedTaxOffice,
      address: address.trim() || null,
      email: trimmedEmail,
      phone: phone.trim() || null
    }
    setSaving(true)
    try {
      if (isEdit && customer) {
        await window.api.customers.update(customer.id, input)
        onSaved()
      } else {
        const result = await window.api.customers.create(input, initialPassword)
        onCreated(result)
      }
    } catch (err) {
      setError(
        getErrorMessage(err, isEdit ? t('customers.updateFailed') : t('customers.createFailed'))
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? t('customers.editTitle') : t('customers.newCustomerButton')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>{t('customers.taxNoRequired')}</label>
              <input
                className="text-input"
                value={taxNo}
                onChange={(e) => setTaxNo(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label>{t('customers.nameRequired')}</label>
              <input
                className="text-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label>{t('customers.taxOfficeRequired')}</label>
              <input
                className="text-input"
                value={taxOffice}
                onChange={(e) => setTaxOffice(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label>{t('customers.emailRequired')}</label>
              <input
                type="email"
                className="text-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label>{t('customers.addressLabel')}</label>
              <input
                className="text-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>{t('customers.phoneLabel')}</label>
              <input
                className="text-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            {!isEdit && (
              <div className="form-field">
                <label>{t('users.tempPasswordRequired')}</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="text-input"
                    value={initialPassword}
                    onChange={(e) => setInitialPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => setInitialPassword(generateRandomPassword())}
                  >
                    {t('users.regenerate')}
                  </button>
                </div>
              </div>
            )}
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
