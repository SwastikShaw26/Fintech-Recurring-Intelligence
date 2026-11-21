import { buildCommitmentForecast, nextCommitmentDate } from './milestones.ts'

export type LedgerRow = Record<string, unknown>

export function ledgerCurrency(value: unknown, fallback?: unknown) {
  const currency = value ?? fallback
  return currency === 'INR' || currency === 'USD' || currency === 'GBP' || currency === 'EUR' ? currency : 'unspecified'
}

export function ledgerMoney(amount: number, currency: string) {
  if (currency === 'unspecified') return `${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} units`
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', { style: 'currency', currency }).format(amount)
}

export function linkedDebits(commitment: LedgerRow, transactions: LedgerRow[]) {
  const ids = new Set(Array.isArray(commitment.transaction_ids) ? commitment.transaction_ids : [])
  const rows = new Map<string, { id: string; date: string; description: string; amount: number }>()
  for (const tx of transactions) {
    const { transaction_id: id, date, amount } = tx
    if (typeof id !== 'string' || !ids.has(id) || tx.direction !== 'debit' || typeof date !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof amount !== 'number' || !Number.isFinite(amount)) continue
    const timestamp = Date.parse(date)
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) continue
    rows.set(id, { id, date, amount: Math.abs(amount), description: typeof tx.description === 'string' ? tx.description : '' })
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function commitmentCards(commitments: LedgerRow[], transactions: LedgerRow[], currency: unknown, asOf: string,
  nameFor: (row: LedgerRow) => string, confidenceFor: (row: LedgerRow) => string, reportedFor: (row: LedgerRow) => boolean) {
  const groups = new Map<string, { key: string; label: string; items: {
    source: LedgerRow; id: string; name: string; amount: string | null; confidence: string | null
    trend: number[]; next: string | null; flagged: boolean; reported: boolean
  }[] }>()
  for (const [index, row] of commitments.entries()) {
    const code = ledgerCurrency(row.currency, currency)
    const cadence = typeof row.cadence === 'string' && row.cadence.trim() ? row.cadence.trim().toLowerCase() : 'unknown'
    const key = `${code}/${cadence}`
    const group = groups.get(key) ?? {
      key, label: `${cadence === 'unknown' ? 'Cadence unknown' : cadence[0].toUpperCase() + cadence.slice(1)} · ${code === 'unspecified' ? 'Statement units' : code}`, items: [],
    }
    group.items.push({
      source: row, id: String(row.commitment_id ?? index), name: nameFor(row),
      amount: typeof row.typical_amount === 'number' && Number.isFinite(row.typical_amount) ? ledgerMoney(Math.abs(row.typical_amount), code) : null,
      confidence: typeof row.confidence_score === 'number' && Number.isFinite(row.confidence_score) ? confidenceFor(row) : null,
      trend: linkedDebits(row, transactions).slice(-8).map(tx => tx.amount),
      next: nextCommitmentDate(row, asOf), flagged: row.review_required === true, reported: reportedFor(row),
    })
    groups.set(key, group)
  }
  return [...groups.values()]
}

export function ledgerKpis(summary: LedgerRow, commitments: LedgerRow[], transactions: LedgerRow[], alerts: LedgerRow[], asOf: string) {
  const codes = new Set(commitments.map(row => ledgerCurrency(row.currency, summary.currency)))
  const observed = new Map<string, number>()
  const inferred = new Map<string, number>()
  const seen = new Set<string>()
  const start = new Date(Date.parse(asOf) - 30 * 86_400_000).toISOString().slice(0, 10)
  for (const commitment of commitments) {
    const code = ledgerCurrency(commitment.currency, summary.currency)
    for (const tx of linkedDebits(commitment, transactions)) {
      if (tx.date < start || tx.date >= asOf) continue
      const key = JSON.stringify([code, tx.id])
      if (seen.has(key)) continue
      seen.add(key)
      observed.set(code, (observed.get(code) ?? 0) + tx.amount)
    }
  }
  for (const { commitment, amount } of buildCommitmentForecast(commitments, asOf).entries) {
    if (amount === null) continue
    const code = ledgerCurrency(commitment.currency, summary.currency)
    inferred.set(code, (inferred.get(code) ?? 0) + amount)
  }
  const amounts = (values: Map<string, number>) => [...codes].flatMap(code =>
    values.has(code) ? [ledgerMoney(values.get(code)!, code)] : [])
  return [
    { label: 'Detected patterns', values: [String(summary.detected_pattern_count ?? commitments.length)], detail: 'Inferred from loaded history' },
    { label: 'Observed recurring debits', values: amounts(observed), detail: 'Prior 30 days · loaded linked debits' },
    { label: 'Upcoming debits', values: amounts(inferred), detail: 'Inferred · next 30 days' },
    { label: 'Review signals', values: [String(alerts.length)], detail: 'Detector flags in this workspace' },
  ]
}
