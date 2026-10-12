import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  BookingWithStats,
  DashboardStats,
  BookingStatus,
  ContainerType,
  ReportBreakdownRow,
  ReportRange
} from '@shared/types'
import {
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  CONTAINER_TYPES,
  REPORT_RANGES,
  REPORT_RANGE_LABELS
} from '@shared/types'
import { formatDate } from '../lib/format'
import MissingDocsBadge from '../components/MissingDocsBadge'

const WEEKDAY_LABELS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

function isoDateOnly(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getCurrentWeekDates(): Date[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const mondayOffset = (today.getDay() + 6) % 7
  const monday = new Date(today)
  monday.setDate(monday.getDate() - mondayOffset)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return d
  })
}

const STATUS_COLORS: Record<BookingStatus, string> = {
  YUKLENMEDI: '#9aa5b1',
  YUKLEMEDE: '#2f6fce',
  EKSIK_EVRAK: '#c98a1f',
  TAMAMLANDI: '#1e7d34',
  CANCEL: '#b3261e'
}

const CONTAINER_TYPE_COLORS: Record<ContainerType, string> = {
  '40RF': '#1a4d8f',
  '40HC': '#1e7d34',
  '20DC': '#a35b1c'
}

function StatusPieChart({
  statusCounts
}: {
  statusCounts: Record<BookingStatus, number>
}): React.JSX.Element {
  const total = BOOKING_STATUSES.reduce((sum, s) => sum + statusCounts[s], 0)

  const gradient = useMemo(() => {
    if (total === 0) return 'var(--color-bg)'
    let cursor = 0
    const stops: string[] = []
    for (const status of BOOKING_STATUSES) {
      const count = statusCounts[status]
      if (count === 0) continue
      const start = (cursor / total) * 360
      cursor += count
      const end = (cursor / total) * 360
      stops.push(`${STATUS_COLORS[status]} ${start}deg ${end}deg`)
    }
    return `conic-gradient(${stops.join(', ')})`
  }, [statusCounts, total])

  return (
    <div className="pie-chart-row">
      <div className="pie-chart" style={{ background: gradient }} />
      <div className="pie-chart-legend">
        {BOOKING_STATUSES.map((s) => (
          <div key={s} className="pie-chart-legend__item">
            <span className="pie-chart-legend__swatch" style={{ background: STATUS_COLORS[s] }} />
            <span>
              {BOOKING_STATUS_LABELS[s]}: <strong>{statusCounts[s]}</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ContainerTypeBarChart({
  containerTypeCounts
}: {
  containerTypeCounts: Record<ContainerType, number>
}): React.JSX.Element {
  const max = Math.max(1, ...CONTAINER_TYPES.map((t) => containerTypeCounts[t]))
  return (
    <div className="bar-chart">
      {CONTAINER_TYPES.map((t) => {
        const value = containerTypeCounts[t]
        const pct = (value / max) * 100
        return (
          <div key={t} className="bar-chart__row">
            <span className="bar-chart__label">{t}</span>
            <div className="bar-chart__track">
              <div
                className="bar-chart__fill"
                style={{ width: `${pct}%`, background: CONTAINER_TYPE_COLORS[t] }}
              />
            </div>
            <span className="bar-chart__value">{value}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Hat / liman gibi serbest metin kırılımlarını (en çoktan aza) yatay çubuk grafik olarak gösterir. */
function BreakdownBarChart({ data }: { data: ReportBreakdownRow[] }): React.JSX.Element {
  if (data.length === 0) {
    return <div className="empty-state">Seçili dönem için veri yok.</div>
  }
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div className="bar-chart">
      {data.map((d) => {
        const pct = (d.count / max) * 100
        return (
          <div key={d.label} className="bar-chart__row">
            <span className="bar-chart__label bar-chart__label--wide" title={d.label}>
              {d.label}
            </span>
            <div className="bar-chart__track">
              <div
                className="bar-chart__fill"
                style={{ width: `${pct}%`, background: 'var(--color-navy)' }}
              />
            </div>
            <span className="bar-chart__value">{d.count}</span>
          </div>
        )
      })}
    </div>
  )
}

function WeeklyOperationsPlanner({
  weeklyPlan,
  onStatusChange
}: {
  weeklyPlan: BookingWithStats[]
  onStatusChange: (booking: BookingWithStats, status: BookingStatus) => void
}): React.JSX.Element {
  const navigate = useNavigate()
  const weekDates = useMemo(() => getCurrentWeekDates(), [])
  const todayOffset = useMemo(() => (new Date().getDay() + 6) % 7, [])
  const [activeTab, setActiveTab] = useState(todayOffset)

  const planByDate = useMemo(() => {
    const map = new Map<string, BookingWithStats[]>()
    for (const b of weeklyPlan) {
      if (!b.siCutOff) continue
      const date = b.siCutOff.slice(0, 10)
      if (!map.has(date)) map.set(date, [])
      map.get(date)!.push(b)
    }
    return map
  }, [weeklyPlan])

  const activeDate = weekDates[activeTab]
  const activeDateStr = isoDateOnly(activeDate)
  const rows = planByDate.get(activeDateStr) ?? []

  return (
    <div>
      <div className="week-tabs">
        {weekDates.map((date, i) => {
          const dateStr = isoDateOnly(date)
          const count = planByDate.get(dateStr)?.length ?? 0
          return (
            <button
              key={dateStr}
              type="button"
              className={`week-tab${i === activeTab ? ' active' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              <span className="week-tab__day">{WEEKDAY_LABELS[i]}</span>
              <span className="week-tab__date">{formatDate(dateStr)}</span>
              {count > 0 && <span className="week-tab__count">{count}</span>}
            </button>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">Bu gün için planlanmış booking yok.</div>
      ) : (
        <div className="table-scroll weekly-plan-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Liman</th>
                <th>Booking No</th>
                <th>Konteyner Tipi</th>
                <th>Yükleme Statüsü</th>
                <th>Hedef Liman</th>
                <th>Evrak</th>
                <th>Operasyon Notu / Sorumlu</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} onClick={() => navigate(`/bookings/${b.id}`)}>
                  <td>{b.pol || '-'}</td>
                  <td>
                    <strong>{b.bookingNo}</strong>
                  </td>
                  <td>{b.containerSizes || '-'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select
                      className={`status-select status-select--${b.status.toLowerCase()}`}
                      value={b.status}
                      onChange={(e) => onStatusChange(b, e.target.value as BookingStatus)}
                    >
                      {BOOKING_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {BOOKING_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{b.destination || '-'}</td>
                  <td>
                    <MissingDocsBadge missing={b.missingDocumentTypes} />
                  </td>
                  <td>{b.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Dashboard'daki ana bölümler (Planlama / Raporlar) için başlığa tıklayınca daralan/genişleyen kapsayıcı. */
function CollapsibleSection({
  id,
  title,
  collapsed,
  onToggle,
  children
}: {
  id: string
  title: string
  collapsed: boolean
  onToggle: (id: string) => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="surface dashboard-section">
      <div className="dashboard-section__header" onClick={() => onToggle(id)}>
        <span className="dashboard-section__toggle">{collapsed ? '▸' : '▾'}</span>
        <h2>{title}</h2>
      </div>
      {!collapsed && <div className="dashboard-section__body">{children}</div>}
    </div>
  )
}

export default function DashboardPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<ReportRange>('all')
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  async function refresh(r: ReportRange): Promise<void> {
    const s = await window.api.dashboard.stats(r)
    setStats(s)
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh(range)
  }, [range])

  function toggleSection(id: string): void {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleStatusChange(
    booking: BookingWithStats,
    status: BookingStatus
  ): Promise<void> {
    await window.api.bookings.update(booking.id, {
      bookingNo: booking.bookingNo,
      vesselDeparture: booking.vesselDeparture,
      declarationCutOff: booking.declarationCutOff,
      siCutOff: booking.siCutOff,
      category: booking.category,
      destination: booking.destination,
      line: booking.line,
      pol: booking.pol,
      status,
      archived: booking.archived,
      notes: booking.notes,
      blNumber: booking.blNumber,
      eta: booking.eta,
      etd: booking.etd,
      blStatus: booking.blStatus,
      freeTimeEnd: booking.freeTimeEnd,
      lastCarrierSyncAt: booking.lastCarrierSyncAt
    })
    await refresh(range)
  }

  const totalBookings = stats
    ? BOOKING_STATUSES.reduce((sum, s) => sum + stats.statusCounts[s], 0)
    : 0
  const totalContainers = stats
    ? CONTAINER_TYPES.reduce((sum, t) => sum + stats.containerTypeCounts[t], 0)
    : 0
  const activeBookings = stats
    ? totalBookings - stats.statusCounts.TAMAMLANDI - stats.statusCounts.CANCEL
    : 0

  return (
    <div>
      <div className="page-title">
        <h1>Dashboard</h1>
      </div>

      {loading || !stats ? (
        <div className="empty-state">Yükleniyor...</div>
      ) : (
        <>
          <CollapsibleSection
            id="planlama"
            title="Planlama"
            collapsed={collapsedSections.has('planlama')}
            onToggle={toggleSection}
          >
            <div className="dashboard-grid dashboard-grid--planning">
              <div className="dashboard-card">
                <h3>Yaklaşan Bookingler (7 gün)</h3>
                {stats.upcoming.length === 0 ? (
                  <div className="empty-state">Gelecek hafta için planlanmış booking yok.</div>
                ) : (
                  <div className="upcoming-list">
                    {stats.upcoming.map((b) => (
                      <div
                        key={b.id}
                        className="upcoming-item"
                        onClick={() => navigate(`/bookings/${b.id}`)}
                      >
                        <div className="upcoming-item__main">
                          <span className="upcoming-item__bookingno">{b.bookingNo}</span>
                          <span className="upcoming-item__meta">
                            {b.pol || '-'} → {b.destination || '-'}
                          </span>
                          <span className="upcoming-item__summary">
                            <span className={`badge badge-status-${b.status.toLowerCase()}`}>
                              {BOOKING_STATUS_LABELS[b.status]}
                            </span>
                            <span className="upcoming-item__containers">
                              {b.containerCount} konteyner
                              {b.containerSizes ? ` (${b.containerSizes})` : ''}
                            </span>
                          </span>
                        </div>
                        <span className="upcoming-item__date">{formatDate(b.vesselDeparture)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="dashboard-card">
                <h3>Haftalık Operasyon Planlama Tablosu</h3>
                <WeeklyOperationsPlanner
                  weeklyPlan={stats.weeklyPlan}
                  onStatusChange={handleStatusChange}
                />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            id="raporlar"
            title="Raporlar"
            collapsed={collapsedSections.has('raporlar')}
            onToggle={toggleSection}
          >
            <div className="report-filter">
              {REPORT_RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`report-filter__btn${range === r ? ' active' : ''}`}
                  onClick={() => setRange(r)}
                >
                  {REPORT_RANGE_LABELS[r]}
                </button>
              ))}
            </div>

            <div className="dashboard-kpis">
              <div className="dashboard-kpi">
                <span className="dashboard-kpi__value">{totalBookings}</span>
                <span className="dashboard-kpi__label">Toplam Booking</span>
              </div>
              <div className="dashboard-kpi">
                <span className="dashboard-kpi__value">{activeBookings}</span>
                <span className="dashboard-kpi__label">Aktif Booking</span>
              </div>
              <div className="dashboard-kpi">
                <span className="dashboard-kpi__value">{totalContainers}</span>
                <span className="dashboard-kpi__label">Toplam Konteyner</span>
              </div>
            </div>

            <div className="dashboard-grid">
              <div className="dashboard-card">
                <h3>Booking Statü Dağılımı</h3>
                <StatusPieChart statusCounts={stats.statusCounts} />
              </div>
              <div className="dashboard-card">
                <h3>Konteyner Tipi Dağılımı</h3>
                <ContainerTypeBarChart containerTypeCounts={stats.containerTypeCounts} />
              </div>
              <div className="dashboard-card">
                <h3>Hat Dağılımı</h3>
                <BreakdownBarChart data={stats.lineCounts} />
              </div>
              <div className="dashboard-card">
                <h3>Yükleme Limanı Dağılımı</h3>
                <BreakdownBarChart data={stats.polCounts} />
              </div>
            </div>
          </CollapsibleSection>
        </>
      )}
    </div>
  )
}
