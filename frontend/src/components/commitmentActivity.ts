type RecordData = Record<string, unknown>
type FollowUp = { reportDate: string; debits: RecordData[] }
type Activity = {
  kind: 'later-debit' | 'billing-gap' | 'revocation-report' | 'price-change'
  date: string
  amount?: number
  earlierAmount?: number
  elapsedDays?: number
}

export function buildCommitmentActivity(commitment: RecordData, transactions: RecordData[], alerts: RecordData[], followUp: FollowUp | null): Activity[] {
  const ids = new Set(Array.isArray(commitment.transaction_ids) ? commitment.transaction_ids : [])
  const evidence = new Map(transactions.filter(row => ids.has(row.transaction_id) && row.direction === 'debit'
    && typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(Date.parse(row.date)))
    .map(row => [row.transaction_id, row]))
  const events: Activity[] = []
  if (followUp) {
    events.push({ kind: 'revocation-report', date: followUp.reportDate })
    for (const debit of followUp.debits) {
      const row = evidence.get(debit.transaction_id)
      if (row && String(row.date) > followUp.reportDate && typeof row.amount === 'number' && Number.isFinite(row.amount)) {
        events.push({ kind: 'later-debit', date: String(row.date), amount: row.amount })
      }
    }
  }
  for (const alert of alerts) {
    if (alert.commitment_id !== commitment.commitment_id) continue
    const kind = alert.alert_type === 'charge_after_gap' ? 'billing-gap'
      : alert.alert_type === 'sustained_amount_change' ? 'price-change' : null
    if (!kind || !Array.isArray(alert.transaction_ids) || !alert.transaction_ids.length
      || !alert.transaction_ids.every(id => evidence.has(id))) continue
    const scoped = alert.transaction_ids.map(id => evidence.get(id)!).sort((a, b) => String(a.date).localeCompare(String(b.date)))
    const last = scoped.at(-1)
    if (!last) continue
    const event: Activity = { kind, date: String(last.date) }
    if (kind === 'billing-gap' && scoped.length >= 2) {
      event.elapsedDays = (Date.parse(event.date) - Date.parse(String(scoped.at(-2)?.date))) / 86_400_000
    } else if (kind === 'price-change') {
      const first = scoped[0].amount
      if (typeof first === 'number' && Number.isFinite(first)) event.earlierAmount = first
      if (typeof last.amount === 'number' && Number.isFinite(last.amount)) event.amount = last.amount
    }
    events.push(event)
  }
  return events.sort((a, b) => b.date.localeCompare(a.date))
}
