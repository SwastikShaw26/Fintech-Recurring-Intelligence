export function commitmentHistory(
  commitment: Record<string, unknown>,
  transactions: Record<string, unknown>[],
  today: string,
  statementCurrency: unknown,
) {
  const currency = commitment.currency ?? statementCurrency
  const linkedIds = new Set(Array.isArray(commitment.transaction_ids)
    ? commitment.transaction_ids.filter(id => typeof id === 'string' && id) : [])
  const byId = new Map(transactions.map(row => [row.transaction_id, row]))
  const points: { id: string; date: string; amount: number }[] = []
  let missingCount = 0
  for (const id of linkedIds) {
    const transaction = byId.get(id)
    if (!transaction) {
      missingCount++
      continue
    }
    const { date, amount, direction } = transaction
    if (direction !== 'debit' || (transaction.currency != null && transaction.currency !== currency)
      || typeof amount !== 'number' || !Number.isFinite(amount)
      || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) continue
    const timestamp = Date.parse(date)
    if (Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date) {
      points.push({ id, date, amount: Math.abs(amount) })
    }
  }
  points.sort((left, right) => left.date.localeCompare(right.date))
  return { currency, points, linkedCount: linkedIds.size, missingCount }
}
