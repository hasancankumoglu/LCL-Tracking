import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { getErrorMessage } from '../lib/format'

export default function ChangePasswordPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { user, changePassword, logout } = useAuth()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    if (newPassword.length < 8) {
      setError(t('auth.passwordTooShort'))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'))
      return
    }
    setSubmitting(true)
    try {
      await changePassword(oldPassword, newPassword)
    } catch (err) {
      setError(getErrorMessage(err, t('auth.changePasswordFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>{t('auth.changePasswordTitle')}</h1>
        <div className="auth-card__subtitle">
          {t('auth.changePasswordSubtitle', { name: user?.displayName ?? user?.username ?? '' })}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label>{t('auth.currentPassword')}</label>
            <input
              className="text-input"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="form-field">
            <label>{t('auth.newPassword')}</label>
            <input
              className="text-input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>{t('auth.confirmNewPassword')}</label>
            <input
              className="text-input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="form-error" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}
          <div className="form-actions" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn secondary" onClick={() => logout()}>
              {t('nav.logout')}
            </button>
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? t('auth.saving') : t('auth.changePasswordButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
