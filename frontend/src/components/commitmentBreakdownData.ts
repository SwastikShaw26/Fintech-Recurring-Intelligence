type RecordData = Record<string, unknown>
type Slice = { key: string; label: string; amount: number; count: number }
type Group = { currency: string; total: number; included: number; excluded: number; cadence: Slice[]; merchant: Slice[] }
export type SummaryScope = { workspace: string; observedFrom?: string; observedTo?: string; reviewSignals: number }

function currencyCode(value: unknown) {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : 'unspecified'
}

function addSlice(slices: Map<string, Slice>, key: string, label: string, cents: number) {
  const existing = slices.get(key)
  if (existing) {
    existing.amount += cents
    existing.count++
  } else {
    slices.set(key, { key, label, amount: cents, count: 1 })
  }
}

function ranked(slices: Map<string, Slice>) {
  return [...slices.values()].sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))
}

export function buildCostBreakdown(
  commitments: RecordData[], statementCurrency: unknown, nameFor: (item: RecordData) => string, merchantLimit = 5,
): Group[] {
  const groups = new Map<string, {
    total: number; included: number; excluded: number; cadence: Map<string, Slice>; merchant: Map<string, Slice>
  }>()
  for (const item of commitments) {
    const currency = currencyCode(item.currency ?? statementCurrency)
    let group = groups.get(currency)
    if (!group) {
      group = { total: 0, included: 0, excluded: 0, cadence: new Map(), merchant: new Map() }
      groups.set(currency, group)
    }
    const amount = item.estimated_annual_cost
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0
      || !Number.isSafeInteger(Math.round(amount * 100))) {
      group.excluded++
      continue
    }
    const cents = Math.round(amount * 100)
    group.total += cents
    group.included++
    const cadence = typeof item.cadence === 'string' ? item.cadence.trim().toLowerCase() : ''
    const cadenceLabel = cadence ? cadence[0].toUpperCase() + cadence.slice(1) : 'Unspecified cadence'
    addSlice(group.cadence, cadence, cadenceLabel, cents)
    const name = nameFor(item)
    const label = name.trim() ? name : 'Unknown merchant'
    const merchantId = item.merchant_id
    const key = typeof merchantId === 'string' && merchantId ? 'id:' + merchantId : 'label:' + label.trim().toLowerCase()
    addSlice(group.merchant, key, label, cents)
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, group]) => {
    const merchant = ranked(group.merchant)
    const other = merchant.splice(merchantLimit)
    if (other.length) merchant.push({
      key: 'other', label: 'Other merchants',
      amount: other.reduce((sum, slice) => sum + slice.amount, 0),
      count: other.reduce((sum, slice) => sum + slice.count, 0),
    })
    const toCurrencyUnits = (slice: Slice) => ({ ...slice, amount: slice.amount / 100 })
    return {
      currency, total: group.total / 100, included: group.included, excluded: group.excluded,
      cadence: ranked(group.cadence).map(toCurrencyUnits), merchant: merchant.map(toCurrencyUnits),
    }
  })
}

function csvText(value: string) {
  const prefixed = /^[\t\r\n]|^\s*[=+\-@]/.test(value) ? "'" + value : value
  return /[,\r\n"]/.test(prefixed) ? '"' + prefixed.replaceAll('"', '""') + '"' : prefixed
}

export function breakdownCsv(groups: Group[], scope?: SummaryScope) {
  const rows = ['Currency,Breakdown,Label,Estimated annual amount,Included commitments,Without estimate,Basis,Workspace,Observed from,Observed to,Review signals in loaded workspace']
  const metadata = ['Inferred', csvText(scope?.workspace ?? ''), scope?.observedFrom ?? '', scope?.observedTo ?? '', scope?.reviewSignals ?? '']
  for (const group of groups) {
    const currency = group.currency === 'unspecified' ? 'Unspecified' : group.currency
    rows.push([currency, 'Total', 'Known annualized estimates', group.total.toFixed(2), group.included, group.excluded, ...metadata].join(','))
    for (const [kind, slices] of [['Cadence', group.cadence], ['Merchant', group.merchant]] as const) {
      for (const slice of slices) {
        rows.push([currency, kind, csvText(slice.label), slice.amount.toFixed(2), slice.count, 0, ...metadata].join(','))
      }
    }
  }
  return rows.join('\r\n') + '\r\n'
}
