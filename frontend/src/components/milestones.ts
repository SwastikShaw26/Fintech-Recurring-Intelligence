type RecordData = Record<string, unknown>

export interface Milestone {
  id: string
  date: string
  amount: number | null
  kind: 'charge' | 'renewal' | 'observed' | 'review'
  commitment: RecordData
}

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null
}

function amountOf(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0 ? Math.abs(value) : null
}

export function nextProjectedDate(anchor: unknown, cadence: unknown, asOf: string, fittedDay?: number) {
  const observed = parseDate(anchor)
  const today = parseDate(asOf)
  const interval = cadence === 'monthly' ? 1 : cadence === 'quarterly' ? 3 : cadence === 'annual' ? 12 : 0
  if (!observed || !today || observed > today || !interval) return null

  const year = observed.getUTCFullYear()
  const month = observed.getUTCMonth()
  const day = fittedDay ?? observed.getUTCDate()
  const distance = (today.getUTCFullYear() - year) * 12 + today.getUTCMonth() - month
  const cycle = Math.max(1, Math.floor(distance / interval))
  function dateFor(offset: number) {
    const result = new Date(0)
    result.setUTCFullYear(year, month + offset * interval, 1)
    const lastDay = new Date(result)
    lastDay.setUTCMonth(result.getUTCMonth() + 1, 0)
    result.setUTCDate(Math.min(day, lastDay.getUTCDate()))
    return result.toISOString().slice(0, 10)
  }
  const candidate = dateFor(cycle)
  return candidate >= asOf ? candidate : dateFor(cycle + 1)
}

export function nextCommitmentDate(commitment: RecordData, asOf: string) {
  const cadence = String(commitment.cadence ?? '').trim().toLowerCase()
  const observed = parseDate(commitment.last_observed_date)
  const today = parseDate(asOf)
  if (!observed || !today || observed > today) return null
  const fitted = parseDate(commitment.billing_anchor_date)
  const day = commitment.billing_anchor_day
  if (fitted && typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31
    && Math.abs(fitted.getTime() - observed.getTime()) <= 3 * 86_400_000) {
    const slot = fitted.toISOString().slice(0, 10)
    return nextProjectedDate(slot, cadence, slot > asOf ? slot : asOf, day)
  }
  return nextProjectedDate(commitment.last_observed_date, cadence, asOf)
}

export function buildCommitmentForecast(commitments: RecordData[], asOf: string) {
  const shiftDay = (date: string, days: number) => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10)
  const entries: { date: string; commitment: RecordData; amount: number | null; uncertainty: string[] }[] = []
  const annualized: { commitment: RecordData; amount: number }[] = []
  let unestimated = 0
  if (!parseDate(asOf)) return { entries, annualized, annual: 0, unestimated: commitments.length }
  const end = shiftDay(asOf, 30)
  for (const commitment of commitments) {
    const cadence = String(commitment.cadence ?? '').trim().toLowerCase()
    const frequency = cadence === 'monthly' ? 12 : cadence === 'quarterly' ? 4 : cadence === 'annual' ? 1 : 0
    const amount = amountOf(commitment.typical_amount)
    let next = nextCommitmentDate(commitment, asOf)
    if (amount !== null && frequency && next) annualized.push({ commitment, amount: amount * frequency })
    else unestimated++
    const uncertainty = []
    const ageDays = (Date.parse(asOf) - Date.parse(String(commitment.last_observed_date))) / 86_400_000
    if (frequency && ageDays > 2 * 31 * (12 / frequency)) uncertainty.push('No recent supporting debit')
    if (typeof commitment.transaction_count !== 'number' || commitment.transaction_count < 4) uncertainty.push('Short payment history')
    if (commitment.amount_pattern === 'variable') uncertainty.push('Observed amounts vary')
    if (amount === null) uncertainty.push('Amount unavailable')
    while (next && next < end) {
      entries.push({ date: next, amount, commitment, uncertainty })
      next = nextCommitmentDate(commitment, shiftDay(next, 1))
    }
  }
  return {
    entries: entries.sort((a, b) => a.date.localeCompare(b.date)),
    annualized,
    annual: annualized.reduce((total, item) => total + item.amount, 0),
    unestimated,
  }
}

export function buildMilestones(commitments: RecordData[], transactions: RecordData[], asOf: string): Milestone[] {
  const transactionById = new Map(transactions.filter(tx => tx.transaction_id != null).map(tx => [tx.transaction_id, tx]))
  return commitments.flatMap((commitment, index) => {
    const id = String(commitment.commitment_id ?? index)
    const cadence = String(commitment.cadence ?? '').trim().toLowerCase()
    const projected = nextCommitmentDate(commitment, asOf)
    const events: Milestone[] = []
    if (projected) {
      events.push({
        id: id + '-next', date: projected, amount: amountOf(commitment.typical_amount),
        kind: cadence === 'annual' ? 'renewal' : 'charge', commitment,
      })
    }

    const ids: unknown[] = Array.isArray(commitment.transaction_ids) ? commitment.transaction_ids : []
    const observed = [...new Set(ids)].flatMap(txId => {
      const tx = transactionById.get(txId)
      return tx && parseDate(tx.date) && tx.direction !== 'credit' ? [tx] : []
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)))

    for (const tx of observed.filter((tx, position) => position === 0 || tx.review_required === true)) {
      events.push({
        id: id + '-tx-' + String(tx.transaction_id), date: String(tx.date), amount: amountOf(tx.amount),
        kind: tx.review_required === true ? 'review' : 'observed', commitment,
      })
    }
    if (!observed.length && parseDate(commitment.last_observed_date)) {
      events.push({ id: id + '-last', date: String(commitment.last_observed_date), amount: null, kind: 'observed', commitment })
    }
    return events
  })
}
