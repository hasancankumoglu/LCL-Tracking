import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { UserCreateInput, UserRole } from '@shared/types'
import { getErrorMessage } from '../lib/format'

interface Props {
  onClose: () => void
  onCreated: (username: string, password: string) => void
}

const PASSWORD_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

/** Web Crypto API (crypto.getRandomValues) ile - Math.random değil - rastgele geçici şifre üretir. */
function generateRandomPassword(length = 12): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => PASSWORD_CHARSET[b % PASSWORD_CHARSET.length]).join('')
}

export default function UserFormModal({ onClose, onCreated }: Props): React.JSX.Element {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('OPERATOR')
  const [initialPassword, setInitialPassword] = useState(() => generateRandomPassword())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    const trimmedUsername = username.trim()
    const trimmedDisplayName = displayName.trim()
    const trimmedEmail = email.trim()
    if (!trimmedUsername || !trimmedDisplayName) {
      setError(t('users.usernameAndNameRequired'))
      return
    }
    if (!trimmedEmail) {
      setError(t('users.emailRequiredError'))
      return
    }
    if (initialPassword.length < 8) {
      setError(t('users.passwordMinLength'))
      return
    }
    setSaving(true)
    try {
      const input: UserCreateInput = {
        username: trimmedUsername,
        displayName: trimmedDisplayName,
        email: trimmedEmail,
        role,
        initialPassword
      }
      await window.api.users.create(input)
      onCreated(trimmedUsername, initialPassword)
    } catch (err) {
      setError(getErrorMessage(err, t('users.createFailed')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2>{t('users.newUserTitle')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>{t('users.usernameRequired')}</label>
              <input
                className="text-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('users.usernamePlaceholder')}
                required
              />
            </div>
            <div className="form-field">
              <label>{t('users.fullNameRequired')}</label>
              <input
                className="text-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label>{t('users.emailRequired')}</label>
              <input
                type="email"
                className="text-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('users.emailPlaceholder')}
                required
              />
            </div>
            <div className="form-field">
              <label>{t('users.roleRequired')}</label>
              <select
                className="select-input"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                <option value="ADMIN">{t('enums.userRole.ADMIN')}</option>
                <option value="OPERATOR">{t('enums.userRole.OPERATOR')}</option>
                <option value="OPERATION_MANAGER">{t('enums.userRole.OPERATION_MANAGER')}</option>
              </select>
            </div>
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
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn secondary" onClick={onClose}>
              {t('common.dismiss')}
            </button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? t('auth.saving') : t('users.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
