type LedgerRecord = Record<string, unknown>

type AlertTransaction = {
  id: string
  date?: string
  description?: string
  amount?: number
  flagged?: boolean
}

export type AlertCardModel = {
  key: string
  id?: string
  title: string
  kind?: string
  severity?: string
  recommendation?: string
  evidence: string[]
  transactions: AlertTransaction[]
  commitmentId?: string
}

function textOf(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function textList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item.trim()) : []
}

export function buildAlertCards(alerts: LedgerRecord[], transactions: LedgerRecord[], commitments: LedgerRecord[]): AlertCardModel[] {
  const transactionsById = new Map(transactions.map(row => [row.transaction_id, row]))
  const commitmentIds = new Set(commitments.map(row => row.commitment_id))
  return alerts.map((alert, index) => {
    const id = textOf(alert.alert_id)
    const linkedCommitment = textOf(alert.commitment_id)
    const linkedTransaction = textOf(alert.transaction_id)
    const transactionIds = Array.isArray(alert.transaction_ids)
      ? textList(alert.transaction_ids) : linkedTransaction ? [linkedTransaction] : []
    return {
      key: JSON.stringify([id, index]),
      id,
      title: textOf(alert.title) ?? 'Review suggested',
      kind: textOf(alert.alert_type),
      severity: textOf(alert.severity),
      recommendation: textOf(alert.recommended_action),
      evidence: textList(alert.evidence),
      commitmentId: linkedCommitment && commitmentIds.has(linkedCommitment) ? linkedCommitment : undefined,
      transactions: [...new Set(transactionIds)].map(transactionId => {
        const row = transactionsById.get(transactionId)
        return row ? {
          id: transactionId,
          date: textOf(row.date),
          description: textOf(row.description),
          amount: typeof row.amount === 'number' && Number.isFinite(row.amount) ? row.amount : undefined,
          flagged: row.review_required === true,
        } : { id: transactionId }
      }),
    }
  })
}

export function alertAcknowledgementsKey(workspaceKey: string) {
  return `finsight:acknowledged-alerts:${encodeURIComponent(workspaceKey)}`
}

export function readAlertAcknowledgements(raw: string | null | undefined) {
  try {
    return new Set(textList(raw ? JSON.parse(raw) : null))
  } catch {
    return new Set<string>()
  }
}

export function countAcknowledgedAlerts(alerts: AlertCardModel[], acknowledged: ReadonlySet<string>) {
  const ids = new Set(alerts.flatMap(alert => alert.id ? [alert.id] : []))
  return { total: ids.size, acknowledged: [...ids].filter(id => acknowledged.has(id)).length }
}
