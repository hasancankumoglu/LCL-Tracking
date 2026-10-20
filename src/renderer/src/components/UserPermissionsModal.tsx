import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppUser, PermissionAction, UserPermissionsMap } from '@shared/types'
import { PERMISSION_ACTIONS } from '@shared/types'
import { getErrorMessage } from '../lib/format'

interface Props {
  user: AppUser
  onClose: () => void
}

type OverrideChoice = 'default' | 'allow' | 'deny'

function choiceFromOverride(override: boolean | null): OverrideChoice {
  if (override === null) return 'default'
  return override ? 'allow' : 'deny'
}

export default function UserPermissionsModal({ user, onClose }: Props): React.JSX.Element {
  const { t } = useTranslation()
  const [permissions, setPermissions] = useState<UserPermissionsMap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      setPermissions(await window.api.users.getUserPermissions(user.id))
    } catch (err) {
      setError(getErrorMessage(err, t('users.loadFailed')))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [])

  async function handleChange(action: PermissionAction, choice: OverrideChoice): Promise<void> {
    const allowed = choice === 'default' ? null : choice === 'allow'
    try {
      await window.api.users.setUserPermission(user.id, action, allowed)
      await refresh()
    } catch (err) {
      window.alert(getErrorMessage(err, t('users.updateFailed')))
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2>{t('users.permissionsTitle', { name: user.displayName ?? user.username })}</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 14 }}>
          {t('users.permissionsExplainer')}
        </p>
        {error && (
          <div className="form-error" style={{ marginBottom: 14 }}>
            {error}
          </div>
        )}
        {loading || !permissions ? (
          <div className="empty-state">{t('common.loading')}</div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('users.actionColumn')}</th>
                  <th>{t('users.roleDefaultColumn')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSION_ACTIONS.map((action) => {
                  const state = permissions[action]
                  return (
                    <tr key={action}>
                      <td>{t(`enums.permissionAction.${action.replace('.', '_')}`)}</td>
                      <td>
                        <span
                          className={`badge ${state.roleDefault ? 'badge-ok' : 'badge-critical'}`}
                        >
                          {state.roleDefault ? t('users.allowed') : t('users.notAllowed')}
                        </span>
                      </td>
                      <td>
                        <select
                          className="select-input"
                          value={choiceFromOverride(state.override)}
                          onChange={(e) => handleChange(action, e.target.value as OverrideChoice)}
                        >
                          <option value="default">{t('users.defaultRole')}</option>
                          <option value="allow">{t('users.allow')}</option>
                          <option value="deny">{t('users.deny')}</option>
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
