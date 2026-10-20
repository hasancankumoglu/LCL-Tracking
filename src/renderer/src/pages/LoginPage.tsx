import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { getErrorMessage } from '../lib/format'
import logo from '../assets/palm-marine-logo.png'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function LoginPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    window.api.auth.getRememberedUsername().then((remembered) => {
      if (remembered) {
        setUsername(remembered)
        setRemember(true)
      }
    })
  }, [])

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const trimmedUsername = username.trim()
      await login(trimmedUsername, password)
      await window.api.auth.setRememberedUsername(remember ? trimmedUsername : null)
    } catch (err) {
      setError(getErrorMessage(err, t('auth.loginFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <LanguageSwitcher variant="login" />
        <img alt="Palm Marine Logistics" className="auth-card__logo" src={logo} />
        <h1>LCL-Tracking</h1>
        <div className="auth-card__subtitle">{t('auth.loginSubtitle')}</div>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label>{t('auth.username')}</label>
            <input
              className="text-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="form-field">
            <label>{t('auth.password')}</label>
            <input
              className="text-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <label className="auth-card__checkbox">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            {t('auth.rememberMe')}
          </label>
          {error && (
            <div className="form-error" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            className="btn"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={submitting}
          >
            {submitting ? t('auth.loggingIn') : t('auth.loginButton')}
          </button>
        </form>
      </div>
    </div>
  )
}
