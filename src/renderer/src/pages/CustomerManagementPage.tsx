import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Customer, CustomerCreateResult } from '@shared/types'
import CustomerFormModal from '../components/CustomerFormModal'
import { getErrorMessage } from '../lib/format'
import { useGlobalLoading } from '../lib/loadingOverlay'

export default function CustomerManagementPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  useGlobalLoading(loading)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [revealedCredentials, setRevealedCredentials] = useState<CustomerCreateResult | null>(null)
  const [search, setSearch] = useState('')

  const filteredCustomers = customers.filter((c) => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return (
      c.taxNo.toLowerCase().includes(term) ||
      c.name.toLowerCase().includes(term) ||
      c.email.toLowerCase().includes(term) ||
      c.taxOffice.toLowerCase().includes(term)
    )
  })

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      setCustomers(await window.api.customers.list())
    } catch (err) {
      setError(getErrorMessage(err, t('customers.loadFailed')))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [])

  async function handleDelete(customer: Customer): Promise<void> {
    if (!window.confirm(t('customers.deleteConfirm', { name: customer.name }))) return
    try {
      await window.api.customers.remove(customer.id)
      await refresh()
    } catch (err) {
      window.alert(getErrorMessage(err, t('customers.deleteFailed')))
    }
  }

  return (
    <div>
      <div className="page-title">
        <h1>{t('customers.title')}</h1>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          placeholder={t('customers.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="toolbar__spacer" />
        <button type="button" className="btn" onClick={() => setShowCreateModal(true)}>
          {t('customers.newCustomerButton')}
        </button>
      </div>

      {error && (
        <div className="form-error" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}

      <div className="surface table-scroll">
        {loading ? null : filteredCustomers.length === 0 ? (
          <div className="empty-state">{t('customers.empty')}</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('customers.taxNoColumn')}</th>
                <th>{t('customers.nameColumn')}</th>
                <th>{t('customers.taxOfficeColumn')}</th>
                <th>{t('customers.addressColumn')}</th>
                <th>{t('customers.emailColumn')}</th>
                <th>{t('customers.phoneColumn')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((c) => (
                <tr key={c.id}>
                  <td>{c.taxNo}</td>
                  <td>{c.name}</td>
                  <td>{c.taxOffice}</td>
                  <td>{c.address ?? '-'}</td>
                  <td>{c.email}</td>
                  <td>{c.phone ?? '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => setEditingCustomer(c)}
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        type="button"
                        className="btn danger small"
                        onClick={() => handleDelete(c)}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreateModal && (
        <CustomerFormModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(result) => {
            setShowCreateModal(false)
            setRevealedCredentials(result)
            refresh()
          }}
          onSaved={() => {
            setShowCreateModal(false)
            refresh()
          }}
        />
      )}

      {editingCustomer && (
        <CustomerFormModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onCreated={() => setEditingCustomer(null)}
          onSaved={() => {
            setEditingCustomer(null)
            refresh()
          }}
        />
      )}

      {revealedCredentials && (
        <div className="modal-overlay" onClick={() => setRevealedCredentials(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2>{t('customers.newCredentialsTitle')}</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {t('customers.newCredentialsExplainer', { name: revealedCredentials.customer.name })}
            </p>
            <div className="form-field">
              <label>{t('customers.usernameLabel')}</label>
              <input
                className="text-input"
                readOnly
                value={revealedCredentials.username}
                onFocus={(e) => e.target.select()}
              />
            </div>
            <div className="form-field">
              <label>{t('users.tempPasswordRequired')}</label>
              <input
                className="text-input"
                readOnly
                value={revealedCredentials.password}
                onFocus={(e) => e.target.select()}
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() =>
                  navigator.clipboard.writeText(
                    `${revealedCredentials.username} / ${revealedCredentials.password}`
                  )
                }
              >
                {t('usersAdmin.copyButton')}
              </button>
              <button type="button" className="btn" onClick={() => setRevealedCredentials(null)}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
