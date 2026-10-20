import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppUser, PermissionMap, UserRole } from '@shared/types'
import { PERMISSION_ACTIONS, USER_ROLES } from '@shared/types'
import UserFormModal from '../components/UserFormModal'
import UserPermissionsModal from '../components/UserPermissionsModal'
import { getErrorMessage } from '../lib/format'
import { useGlobalLoading } from '../lib/loadingOverlay'

type Tab = 'internal' | 'customers' | 'roleDefaults'

export default function UsersAdminPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('internal')
  const [users, setUsers] = useState<AppUser[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  useGlobalLoading(loading)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [permissionsUser, setPermissionsUser] = useState<AppUser | null>(null)
  const [revealedPassword, setRevealedPassword] = useState<{
    username: string
    password: string
  } | null>(null)
  const [emailEditUser, setEmailEditUser] = useState<AppUser | null>(null)
  const [emailInput, setEmailInput] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      setUsers(await window.api.users.list())
    } catch (err) {
      setError(getErrorMessage(err, t('usersAdmin.loadFailed')))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [])

  async function handleRegeneratePassword(user: AppUser): Promise<void> {
    if (!window.confirm(t('usersAdmin.regeneratePasswordConfirm', { username: user.username })))
      return
    try {
      const newPassword = await window.api.users.setPassword(user.id)
      setRevealedPassword({ username: user.username, password: newPassword })
      await refresh()
    } catch (err) {
      window.alert(getErrorMessage(err, t('usersAdmin.passwordRenewFailed')))
    }
  }

  function handleEditEmail(user: AppUser): void {
    setEmailEditUser(user)
    setEmailInput(user.email ?? '')
    setEmailError(null)
  }

  async function handleSubmitEmail(): Promise<void> {
    if (!emailEditUser) return
    const trimmed = emailInput.trim()
    if (!trimmed) {
      setEmailError(t('usersAdmin.emailEmptyError'))
      return
    }
    try {
      await window.api.users.setEmail(emailEditUser.id, trimmed)
      setEmailEditUser(null)
      await refresh()
    } catch (err) {
      setEmailError(getErrorMessage(err, t('usersAdmin.emailUpdateFailed')))
    }
  }

  async function handleRoleChange(user: AppUser, role: UserRole): Promise<void> {
    if (role === user.role) return
    if (
      !window.confirm(
        t('usersAdmin.roleChangeConfirm', {
          username: user.username,
          role: t(`enums.userRole.${role}`)
        })
      )
    )
      return
    try {
      await window.api.users.updateRole(user.id, role)
      await refresh()
    } catch (err) {
      window.alert(getErrorMessage(err, t('usersAdmin.roleChangeFailed')))
    }
  }

  async function handleToggleActive(user: AppUser): Promise<void> {
    const nextActive = !user.isActive
    const confirmMessage = nextActive
      ? t('usersAdmin.activateConfirm', { username: user.username })
      : t('usersAdmin.deactivateConfirm', { username: user.username })
    if (!window.confirm(confirmMessage)) return
    try {
      await window.api.users.setActive(user.id, nextActive)
      await refresh()
    } catch (err) {
      window.alert(getErrorMessage(err, t('usersAdmin.actionFailedGeneric')))
    }
  }

  function matchesSearch(user: AppUser): boolean {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return (
      user.username.toLowerCase().includes(term) ||
      (user.displayName ?? '').toLowerCase().includes(term) ||
      (user.email ?? '').toLowerCase().includes(term)
    )
  }

  const internalUsers = users.filter((u) => u.role !== 'CUSTOMER').filter(matchesSearch)
  const customerUsers = users.filter((u) => u.role === 'CUSTOMER').filter(matchesSearch)
  const visibleUsers = tab === 'customers' ? customerUsers : internalUsers

  return (
    <div>
      <div className="page-title">
        <h1>{t('nav.adminUsers')}</h1>
      </div>

      <div className="doc-tabs" style={{ padding: 0, marginBottom: 14 }}>
        <div
          className={`doc-tab ${tab === 'internal' ? 'active' : ''}`}
          onClick={() => setTab('internal')}
        >
          {t('usersAdmin.internalUsersTab')}
        </div>
        <div
          className={`doc-tab ${tab === 'customers' ? 'active' : ''}`}
          onClick={() => setTab('customers')}
        >
          {t('usersAdmin.customerUsersTab')}
        </div>
        <div
          className={`doc-tab ${tab === 'roleDefaults' ? 'active' : ''}`}
          onClick={() => setTab('roleDefaults')}
        >
          {t('usersAdmin.roleDefaultsTab')}
        </div>
      </div>

      {(tab === 'internal' || tab === 'customers') && (
        <>
          <div className="toolbar">
            <input
              className="search-input"
              placeholder={t('usersAdmin.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="toolbar__spacer" />
            {tab === 'internal' && (
              <button type="button" className="btn" onClick={() => setShowCreateModal(true)}>
                {t('usersAdmin.newUserButton')}
              </button>
            )}
          </div>

          {error && (
            <div className="form-error" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}

          <div className="surface table-scroll">
            {loading ? null : visibleUsers.length === 0 ? (
              <div className="empty-state">{t('bookings.noRecordsFound')}</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('usersAdmin.usernameColumn')}</th>
                    <th>{t('usersAdmin.fullNameColumn')}</th>
                    <th>{t('usersAdmin.emailColumn')}</th>
                    <th>{t('usersAdmin.roleColumn')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('usersAdmin.passwordColumn')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{user.username}</td>
                      <td>{user.displayName ?? '-'}</td>
                      <td>{user.email ?? '-'}</td>
                      <td>
                        {user.role === 'CUSTOMER' ? (
                          <span>{t('enums.userRole.CUSTOMER')}</span>
                        ) : (
                          <select
                            className="select-input"
                            value={user.role}
                            onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                          >
                            <option value="ADMIN">{t('enums.userRole.ADMIN')}</option>
                            <option value="OPERATOR">{t('enums.userRole.OPERATOR')}</option>
                            <option value="OPERATION_MANAGER">
                              {t('enums.userRole.OPERATION_MANAGER')}
                            </option>
                          </select>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${user.isActive ? 'badge-ok' : 'badge-critical'}`}>
                          {user.isActive
                            ? t('usersAdmin.activeStatus')
                            : t('usersAdmin.inactiveStatus')}
                        </span>
                      </td>
                      <td>
                        {user.mustChangePassword && (
                          <span className="badge badge-warning">
                            {t('usersAdmin.mustChangeBadge')}
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => handleEditEmail(user)}
                          >
                            {t('usersAdmin.editEmailButton')}
                          </button>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => handleRegeneratePassword(user)}
                          >
                            {t('usersAdmin.renewPasswordButton')}
                          </button>
                          {user.role !== 'CUSTOMER' && (
                            <button
                              type="button"
                              className="btn secondary small"
                              onClick={() => setPermissionsUser(user)}
                            >
                              {t('usersAdmin.permissionsButton')}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => handleToggleActive(user)}
                          >
                            {user.isActive
                              ? t('usersAdmin.deactivateButton')
                              : t('usersAdmin.activateButton')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'roleDefaults' && <RoleDefaultsPanel />}

      {showCreateModal && (
        <UserFormModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(username, password) => {
            setShowCreateModal(false)
            setRevealedPassword({ username, password })
            refresh()
          }}
        />
      )}

      {permissionsUser && (
        <UserPermissionsModal user={permissionsUser} onClose={() => setPermissionsUser(null)} />
      )}

      {revealedPassword && (
        <div className="modal-overlay" onClick={() => setRevealedPassword(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2>{t('usersAdmin.newPasswordTitle')}</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {t('usersAdmin.newPasswordExplainer', { username: revealedPassword.username })}
            </p>
            <div className="form-field">
              <input
                className="text-input"
                readOnly
                value={revealedPassword.password}
                onFocus={(e) => e.target.select()}
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => navigator.clipboard.writeText(revealedPassword.password)}
              >
                {t('usersAdmin.copyButton')}
              </button>
              <button type="button" className="btn" onClick={() => setRevealedPassword(null)}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {emailEditUser && (
        <div className="modal-overlay" onClick={() => setEmailEditUser(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2>{t('usersAdmin.editEmailButton')}</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {t('usersAdmin.emailForUser', { username: emailEditUser.username })}
            </p>
            {emailError && (
              <div className="form-error" style={{ marginBottom: 14 }}>
                {emailError}
              </div>
            )}
            <div className="form-field">
              <input
                className="text-input"
                autoFocus
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmitEmail()
                }}
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setEmailEditUser(null)}
              >
                {t('common.cancel')}
              </button>
              <button type="button" className="btn" onClick={() => handleSubmitEmail()}>
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const EDITABLE_ROLES: UserRole[] = USER_ROLES.filter((r) => r !== 'ADMIN' && r !== 'CUSTOMER')

function RoleDefaultsPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const [permissionsByRole, setPermissionsByRole] = useState<Partial<
    Record<UserRole, PermissionMap>
  > | null>(null)
  const [loading, setLoading] = useState(true)
  useGlobalLoading(loading)

  async function refresh(): Promise<void> {
    setLoading(true)
    const entries = await Promise.all(
      EDITABLE_ROLES.map(
        async (role) => [role, await window.api.users.getRolePermissions(role)] as const
      )
    )
    setPermissionsByRole(Object.fromEntries(entries))
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [])

  async function handleToggle(
    role: UserRole,
    action: (typeof PERMISSION_ACTIONS)[number],
    checked: boolean
  ): Promise<void> {
    await window.api.users.setRolePermission(role, action, checked)
    await refresh()
  }

  return (
    <>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 14 }}>
        {t('usersAdmin.roleDefaultsExplainer')}
      </p>
      {loading || !permissionsByRole ? null : (
        <div className="surface table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('users.actionColumn')}</th>
                <th>{t('usersAdmin.adminColumn')}</th>
                {EDITABLE_ROLES.map((role) => (
                  <th key={role}>{t(`enums.userRole.${role}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_ACTIONS.map((action) => (
                <tr key={action}>
                  <td>{t(`enums.permissionAction.${action.replace('.', '_')}`)}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked
                      disabled
                      title={t('usersAdmin.adminAlwaysFullTitle')}
                    />
                  </td>
                  {EDITABLE_ROLES.map((role) => (
                    <td key={role}>
                      <input
                        type="checkbox"
                        checked={permissionsByRole[role]?.[action] === true}
                        onChange={(e) => handleToggle(role, action, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
