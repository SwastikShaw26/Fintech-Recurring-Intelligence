const dayMs = 86_400_000
export const staleHistoryDays = 90

export function commitmentFreshnessWarning(commitment: Record<string, unknown>) {
  const quality = commitment.forecast_quality
  if (!quality || typeof quality !== 'object' || !('staleness_warning' in quality)
    || quality.staleness_warning !== true) return null
  if (typeof commitment.last_observed_date !== 'string' || !commitment.last_observed_date) {
    return 'Last supporting debit date is unavailable.'
  }
  const reason = 'staleness_reason' in quality ? quality.staleness_reason : null
  return typeof reason === 'string' && reason.trim()
    ? reason.trim()
    : 'Recent supporting observations are limited.'
}

export function observedStatementWindow(rows: Record<string, unknown>[], asOf: string) {
  let first = ''
  let last = ''
  for (const { date } of rows) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > asOf) continue
    const timestamp = Date.parse(date)
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) continue
    if (!first || date < first) first = date
    if (date > last) last = date
  }
  if (!last) return null
  const ageDays = (Date.parse(asOf) - Date.parse(last)) / dayMs
  return { first, last, ageDays, stale: ageDays > staleHistoryDays }
}
