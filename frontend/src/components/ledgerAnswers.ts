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
  const query = question.toLowerCase().trim().replace(/[?.!]+$/, '').replace(/\s+/g, ' ')

  const is7Days = /^what payments are expected (?:in the next 7 days|next week)$/.test(query)
    || /^(?:what is due|what's due|what charges are due|what payments are due|what are my payments) (?:in the next 7 days|in 7 days|next week)$/.test(query)
    || (query.includes('7 days') && (query.includes('due') || query.includes('expected') || query.includes('payment') || query.includes('charge')))
    || (query.includes('next week') && (query.includes('due') || query.includes('expected') || query.includes('payment') || query.includes('charge')))

  const is30Days = /^what payments are expected (?:in the next 30 days|next month)$/.test(query)
    || /^(?:what is due|what's due|what charges are due|what payments are due|what are my payments) (?:in the next 30 days|in 30 days|next month)$/.test(query)
    || (query.includes('30 days') && (query.includes('due') || query.includes('expected') || query.includes('payment') || query.includes('charge')))
    || (query.includes('next month') && (query.includes('due') || query.includes('expected') || query.includes('payment') || query.includes('charge')))

  const days = is7Days ? 7 : is30Days ? 30 : 0
  if (days && Number.isFinite(Date.parse(today))) {
    const end = new Date(Date.parse(today) + days * 86_400_000).toISOString().slice(0, 10)
    return { kind: 'forecast' as const, days, entries: entries.filter(entry => entry.date >= today && entry.date < end) }
  }
  if (
    query === 'which subscriptions became more expensive'
    || query === 'which charges became more expensive'
    || ((query.includes('expensive') || query.includes('increase') || query.includes('hike') || query.includes('costlier'))
        && (query.includes('subscription') || query.includes('charge') || query.includes('payment') || query.includes('which')))
  ) {
    return {
      kind: 'review' as const, title: 'Sustained increases',
      alerts: alerts.filter(alert => alert.alert_type === 'sustained_amount_change'
        && typeof alert.change_ratio === 'number' && alert.change_ratio > 0),
    }
  }
  if (
    query === 'which charges might be duplicates'
    || query === 'which charges are duplicates'
    || ((query.includes('duplicate') || query.includes('duplicates') || query.includes('double charge'))
        && (query.includes('charge') || query.includes('payment') || query.includes('which')))
  ) {
    return { kind: 'review' as const, title: 'Possible duplicates',
      alerts: alerts.filter(alert => alert.alert_type === 'possible_duplicate') }
  }
  if (
    query === 'which charges appeared after a gap'
    || (query.includes('gap') && (query.includes('charge') || query.includes('payment') || query.includes('which') || query.includes('appeared')))
  ) {
    return { kind: 'review' as const, title: 'Charges after a gap',
      alerts: alerts.filter(alert => alert.alert_type === 'charge_after_gap') }
  }
  return { kind: 'unsupported' as const }
}
