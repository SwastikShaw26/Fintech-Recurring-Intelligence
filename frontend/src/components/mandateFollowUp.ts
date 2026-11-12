type RecordData = Record<string, unknown>
const reportDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', dateStyle: 'short' })

export function mandateFollowUp(transactions: RecordData[], transactionIds: unknown, reportedAt: string) {
  const timestamp = new Date(reportedAt)
  if (!Number.isFinite(timestamp.getTime())) return null
  const reportDate = reportDay.format(timestamp)
  const ids = new Set(Array.isArray(transactionIds) ? transactionIds : [])
  const debits = transactions.filter(row => row.direction === 'debit' && ids.has(row.transaction_id)
    && typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date)
    && Number.isFinite(Date.parse(row.date)) && row.date > reportDate)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return { reportDate, debits }
}
