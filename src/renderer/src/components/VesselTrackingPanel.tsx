import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContainerWithBooking } from '@shared/types'
import VesselTrackingSection from './VesselTrackingSection'

interface BookingGroup {
  bookingId: number
  bookingNo: string
  bookingPol: string | null
  bookingDestination: string | null
  bookingLine: string | null
  containers: ContainerWithBooking[]
}

interface Props {
  /** Takip edilecek konteynerler (booking bilgileriyle birlikte). */
  containers: ContainerWithBooking[]
  /** true ise soldaki liste Booking > Konteyner ağacı olarak gruplanır, aranabilir ve daraltılabilir (Gemi Takip sayfası). false ise düz bir konteyner listesi gösterilir (Booking Detay). */
  groupByBooking?: boolean
  /** Panel açılırken otomatik seçili gelecek konteyner id'si (ör. deep-link). */
  initialContainerId?: number | null
  /** Haritanın yüksekliği (CSS değeri). Varsayılan 420px. */
  mapHeight?: string | number
}

/** Bir konteynerin haritada takip edilebilmesi için en az bir gemi bilgisi (IMO, MMSI ya da isim) girilmiş olmalı. */
function hasVesselInfo(c: ContainerWithBooking): boolean {
  return Boolean(c.imoNumber || c.mmsiNumber || c.vesselName)
}

function VesselListItem({
  c,
  active,
  onClick
}: {
  c: ContainerWithBooking
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const trackable = hasVesselInfo(c)
  return (
    <div
      onClick={onClick}
      className={`upcoming-item ${active ? 'active' : ''} ${trackable ? '' : 'disabled'}`}
      title={trackable ? undefined : t('vesselTracking.noVesselInfo')}
    >
      <div className="upcoming-item__main">
        <span className="upcoming-item__bookingno">
          {c.vesselName || c.containerNo || t('vesselTracking.containerFallback')}
        </span>
        <span className="upcoming-item__meta">
          {c.containerNo || '-'} ({c.type})
        </span>
      </div>
    </div>
  )
}

export default function VesselTrackingPanel({
  containers,
  groupByBooking = false,
  initialContainerId = null,
  mapHeight = 420
}: Props): React.JSX.Element {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [collapsedBookingIds, setCollapsedBookingIds] = useState<Set<number>>(() => new Set())
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(initialContainerId)

  const groups = useMemo<BookingGroup[]>(() => {
    if (!groupByBooking) return []
    const map = new Map<number, BookingGroup>()
    for (const c of containers) {
      if (!map.has(c.bookingId)) {
        map.set(c.bookingId, {
          bookingId: c.bookingId,
          bookingNo: c.bookingNo,
          bookingPol: c.bookingPol,
          bookingDestination: c.bookingDestination,
          bookingLine: c.bookingLine,
          containers: []
        })
      }
      map.get(c.bookingId)!.containers.push(c)
    }
    return Array.from(map.values())
  }, [containers, groupByBooking])

  const query = search.trim().toLowerCase()

  const filteredGroups = useMemo(() => {
    if (!query) return groups
    return groups
      .map((g) => {
        const bookingMatches = g.bookingNo.toLowerCase().includes(query)
        const matchingContainers = bookingMatches
          ? g.containers
          : g.containers.filter((c) =>
              [c.vesselName, c.containerNo, c.imoNumber, c.mmsiNumber]
                .filter((v): v is string => Boolean(v))
                .some((v) => v.toLowerCase().includes(query))
            )
        return { ...g, containers: matchingContainers }
      })
      .filter((g) => g.containers.length > 0)
  }, [groups, query])

  const filteredContainers = useMemo(() => {
    if (groupByBooking || !query) return containers
    return containers.filter((c) =>
      [c.vesselName, c.containerNo, c.imoNumber, c.mmsiNumber]
        .filter((v): v is string => Boolean(v))
        .some((v) => v.toLowerCase().includes(query))
    )
  }, [containers, groupByBooking, query])

  const visibleTrackable = useMemo(
    () =>
      (groupByBooking ? filteredGroups.flatMap((g) => g.containers) : filteredContainers).filter(
        hasVesselInfo
      ),
    [groupByBooking, filteredGroups, filteredContainers]
  )

  // Seçili konteyner geçerli filtrede yoksa (ör. arama sonucu değiştiğinde) listedeki ilk gemiye düş —
  // amaç her zaman TEK bir harita göstermek, birden fazla haritayı aynı anda açmamak.
  const selected =
    (selectedContainerId != null && visibleTrackable.find((c) => c.id === selectedContainerId)) ||
    visibleTrackable[0] ||
    null

  function toggleGroup(bookingId: number): void {
    setCollapsedBookingIds((prev) => {
      const next = new Set(prev)
      if (next.has(bookingId)) next.delete(bookingId)
      else next.add(bookingId)
      return next
    })
  }

  function selectContainer(c: ContainerWithBooking): void {
    if (!hasVesselInfo(c)) return
    setSelectedContainerId(c.id)
  }

  if (containers.length === 0) {
    return <div className="empty-state">{t('vesselTracking.noTrackableContainers')}</div>
  }

  return (
    <div className="detail-grid" style={{ gridTemplateColumns: '320px 1fr' }}>
      <div className="surface">
        {groupByBooking && (
          <div className="vessel-tree-search">
            <input
              className="text-input"
              placeholder={t('vesselTracking.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        <div className="section-body vessel-tree">
          {groupByBooking
            ? filteredGroups.map((g) => {
                const expanded = Boolean(query) || !collapsedBookingIds.has(g.bookingId)
                return (
                  <div key={g.bookingId} className="vessel-tree-group">
                    <div
                      className="vessel-tree-group__header"
                      onClick={() => toggleGroup(g.bookingId)}
                    >
                      <span className="vessel-tree-group__caret">{expanded ? '▾' : '▸'}</span>
                      <div className="vessel-tree-group__title-block">
                        <span className="vessel-tree-group__bookingno">{g.bookingNo}</span>
                        <span className="vessel-tree-group__meta">
                          {g.bookingPol || '-'} → {g.bookingDestination || '-'}
                          {g.bookingLine ? ` - ${g.bookingLine}` : ''}
                        </span>
                      </div>
                    </div>
                    {expanded && (
                      <div className="vessel-tree-group__items">
                        {g.containers.map((c) => (
                          <VesselListItem
                            key={c.id}
                            c={c}
                            active={selected?.id === c.id}
                            onClick={() => selectContainer(c)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            : filteredContainers.map((c) => (
                <VesselListItem
                  key={c.id}
                  c={c}
                  active={selected?.id === c.id}
                  onClick={() => selectContainer(c)}
                />
              ))}
          {groupByBooking && filteredGroups.length === 0 && (
            <div className="empty-state">{t('vesselTracking.noResults')}</div>
          )}
        </div>
      </div>

      <div className="surface">
        <div className="section-title">
          <h2>
            {selected
              ? selected.vesselName ||
                t('vesselTracking.containerTitle', { no: selected.containerNo ?? '' })
              : t('vesselTracking.title')}
          </h2>
        </div>
        <div className="section-body">
          {selected ? (
            <VesselTrackingSection
              vesselName={selected.vesselName}
              imoNumber={selected.imoNumber}
              mmsiNumber={selected.mmsiNumber}
              height={mapHeight}
            />
          ) : (
            <div className="empty-state">{t('vesselTracking.noTrackableVessel')}</div>
          )}
        </div>
      </div>
    </div>
  )
}
