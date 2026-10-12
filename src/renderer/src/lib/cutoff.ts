export type CutoffLevel = 'ok' | 'warning' | 'critical' | 'none'

const WARNING_THRESHOLD_DAYS = 5
const CRITICAL_THRESHOLD_DAYS = 2

/**
 * En yakın (en erken) cutoff tarihine göre durum seviyesini hesaplar.
 * - critical: bugün dahil <= 2 gün kaldıysa veya tarih geçmişse
 * - warning: 2-5 gün arası kaldıysa
 * - ok: 5 günden fazla var
 * - none: tarih bilgisi yok
 */
export function getCutoffLevel(...dates: (string | null | undefined)[]): CutoffLevel {
  const validDates = dates
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))

  if (validDates.length === 0) return 'none'

  const earliest = validDates.reduce((min, d) => (d < min ? d : min))

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  earliest.setHours(0, 0, 0, 0)

  const diffDays = Math.round((earliest.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays <= CRITICAL_THRESHOLD_DAYS) return 'critical'
  if (diffDays <= WARNING_THRESHOLD_DAYS) return 'warning'
  return 'ok'
}

export function cutoffLevelToRowClass(level: CutoffLevel): string {
  if (level === 'critical') return 'row-critical'
  if (level === 'warning') return 'row-warning'
  return ''
}
