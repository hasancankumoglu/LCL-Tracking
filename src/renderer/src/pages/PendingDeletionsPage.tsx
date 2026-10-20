import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PendingBookingDeletion, PendingDeletionStatus } from '@shared/types'
import { useAuth } from '../auth/AuthContext'
import { formatDateTime, getErrorMessage } from '../lib/format'
import { useGlobalLoading } from '../lib/loadingOverlay'

const STATUS_LABEL_KEYS: Record<PendingDeletionStatus, string> = {
  PENDING: 'pendingDeletions.statusPending',
  APPROVED: 'pendingDeletions.statusApproved',
  REJECTED: 'pendingDeletions.statusRejected'
}

type StatusFilter = PendingDeletionStatus | 'ALL'

const STATUS_FILTER_OPTIONS: StatusFilter[] = ['PENDING', 'APPROVED', 'REJECTED', 'ALL']

function StatusBadge({ status }: { status: PendingDeletionStatus }): React.JSX.Element {
  const { t } = useTranslation()
  const variant = status === 'APPROVED' ? 'ok' : status === 'REJECTED' ? 'critical' : 'warning'
  return <span className={`badge badge-${variant}`}>{t(STATUS_LABEL_KEYS[status])}</span>
}

export default function PendingDeletionsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { user, hasPermission } = useAuth()
  const canManage = hasPermission('pending_deletions.manage')
  const [requests, setRequests] = useState<PendingBookingDeletion[]>([])
  const [loading, setLoading] = useState(true)
  useGlobalLoading(loading)
  const [error, setError] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<PendingBookingDeletion | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING')

  const filteredRequests =
    statusFilter === 'ALL' ? requests : requests.filter((r) => r.status === statusFilter)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      setRequests(await window.api.pendingDeletions.list())
    } catch (err) {
      setError(getErrorMessage(err, t('pendingDeletions.loadFailed')))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [])

  async function handleApprove(request: PendingBookingDeletion): Promise<void> {
    if (!window.confirm(t('pendingDeletions.approveConfirm', { bookingNo: request.bookingNo })))
      return
    try {
      await window.api.pendingDeletions.approve(request.id)
      await refresh()
    } catch (err) {
      window.alert(getErrorMessage(err, t('pendingDeletions.approveErrorGeneric')))
    }
  }

  function handleReject(request: PendingBookingDeletion): void {
    setRejectNote('')
    setRejectTarget(request)
  }

  async function handleConfirmReject(): Promise<void> {
    if (!rejectTarget) return
    const note = rejectNote.trim()
    try {
      await window.api.pendingDeletions.reject(rejectTarget.id, note || undefined)
      setRejectTarget(null)
      await refresh()
    } catch (err) {
      window.alert(getErrorMessage(err, t('pendingDeletions.rejectErrorGeneric')))
    }
  }

  async function handleWithdraw(request: PendingBookingDeletion): Promise<void> {
    if (!window.confirm(t('pendingDeletions.withdrawConfirm', { bookingNo: request.bookingNo })))
      return
    try {
      await window.api.pendingDeletions.withdraw(request.id)
      await refresh()
    } catch (err) {
      window.alert(getErrorMessage(err, t('pendingDeletions.withdrawErrorGeneric')))
    }
  }

  return (
    <div>
      <div className="page-title">
        <h1>{t('pendingDeletions.pageTitle')}</h1>
      </div>

      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 14 }}>
        {canManage
          ? t('pendingDeletions.explainerApprover')
          : t('pendingDeletions.explainerOperator')}
      </p>

      {error && (
        <div className="form-error" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}

      <div className="form-field" style={{ maxWidth: 220, marginBottom: 14 }}>
        <label>{t('pendingDeletions.statusFilterLabel')}</label>
        <select
          className="select-input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          {STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'ALL'
                ? t('pendingDeletions.statusFilterAll')
                : t(STATUS_LABEL_KEYS[option])}
            </option>
          ))}
        </select>
      </div>

      <div className="surface table-scroll">
        {loading ? null : filteredRequests.length === 0 ? (
          <div className="empty-state">{t('pendingDeletions.emptyState')}</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('pendingDeletions.bookingColumn')}</th>
                <th>{t('pendingDeletions.blNumberColumn')}</th>
                <th>{t('pendingDeletions.destinationColumn')}</th>
                <th>{t('pendingDeletions.lineColumn')}</th>
                <th>{t('pendingDeletions.requestedByColumn')}</th>
                <th>{t('pendingDeletions.requestedAtColumn')}</th>
                <th>{t('pendingDeletions.statusColumn')}</th>
                <th>{t('pendingDeletions.decidedByColumn')}</th>
                <th>{t('pendingDeletions.decidedAtColumn')}</th>
                <th>{t('pendingDeletions.noteColumn')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.bookingNo}</strong>
                  </td>
                  <td>{r.blNumber ?? '-'}</td>
                  <td>{r.destination ?? '-'}</td>
                  <td>{r.line ?? '-'}</td>
                  <td>{r.requestedBy}</td>
                  <td>{formatDateTime(r.requestedAt)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>{r.decidedBy ?? '-'}</td>
                  <td>{formatDateTime(r.decidedAt)}</td>
                  <td>{r.decisionNote ?? r.requestNote ?? '-'}</td>
                  <td>
                    {r.status === 'PENDING' && canManage && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => handleApprove(r)}
                        >
                          {t('pendingDeletions.approveButton')}
                        </button>
                        <button
                          type="button"
                          className="btn danger small"
                          onClick={() => handleReject(r)}
                        >
                          {t('pendingDeletions.rejectButton')}
                        </button>
                      </div>
                    )}
                    {r.status === 'PENDING' && !canManage && r.requestedBy === user?.username && (
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => handleWithdraw(r)}
                      >
                        {t('pendingDeletions.withdrawButton')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rejectTarget && (
        <div className="modal-overlay" onClick={() => setRejectTarget(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2>{t('pendingDeletions.rejectNoteModalTitle')}</h2>
            <div className="form-field">
              <label>{t('pendingDeletions.rejectNotePrompt')}</label>
              <textarea
                className="text-input"
                rows={4}
                autoFocus
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder={t('pendingDeletions.rejectNotePlaceholder')}
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn secondary" onClick={() => setRejectTarget(null)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="btn danger" onClick={handleConfirmReject}>
                {t('pendingDeletions.rejectButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
