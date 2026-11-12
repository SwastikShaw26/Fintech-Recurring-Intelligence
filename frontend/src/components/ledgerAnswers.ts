type RecordData = Record<string, unknown>

interface ForecastEntry {
  date: string
  commitment: RecordData
  amount: number | null
  uncertainty: string[]
}

export const ledgerQuestions = [
  'What payments are expected in the next 7 days?',
  'What payments are expected in the next 30 days?',
  'Which subscriptions became more expensive?',
  'Which charges might be duplicates?',
  'Which charges appeared after a gap?',
]

export function answerLedgerQuestion(question: string, today: string, entries: ForecastEntry[], alerts: RecordData[]) {
  const query = question.toLowerCase().trim().replace(/[?.!]$/, '').replace(/\s+/g, ' ')
  const days = /^what payments are expected (?:in the next 7 days|next week)$/.test(query) ? 7
    : /^what payments are expected (?:in the next 30 days|next month)$/.test(query) ? 30 : 0
  if (days && Number.isFinite(Date.parse(today))) {
    const end = new Date(Date.parse(today) + days * 86_400_000).toISOString().slice(0, 10)
    return { kind: 'forecast' as const, days, entries: entries.filter(entry => entry.date >= today && entry.date < end) }
  }
  if (query === 'which subscriptions became more expensive') {
    return {
      kind: 'review' as const, title: 'Sustained increases',
      alerts: alerts.filter(alert => alert.alert_type === 'sustained_amount_change'
        && typeof alert.change_ratio === 'number' && alert.change_ratio > 0),
    }
  }
  if (query === 'which charges might be duplicates' || query === 'which charges appeared after a gap') {
    const duplicate = query.includes('duplicates')
    const kind = duplicate ? 'possible_duplicate' : 'charge_after_gap'
    return { kind: 'review' as const, title: duplicate ? 'Possible duplicates' : 'Charges after a gap',
      alerts: alerts.filter(alert => alert.alert_type === kind) }
  }
  return { kind: 'unsupported' as const }
}
