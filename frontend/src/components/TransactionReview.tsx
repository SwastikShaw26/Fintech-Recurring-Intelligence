import { useState } from 'react'

type RecordData = Record<string, unknown>
const kinds: Record<string, string> = {
  possible_duplicate: 'Possible duplicates',
  sustained_amount_change: 'Sustained amount changes',
  charge_after_gap: 'Charges after a gap',
  amount_deviation: 'Amount deviations',
  irregular_pattern: 'Irregular patterns',
}

export function TransactionReview({ alerts, transactions, commitments, formatAmount, onSelect }: {
  alerts: RecordData[]
  transactions: RecordData[]
  commitments: RecordData[]
  formatAmount: (amount: number) => string
  onSelect: (item: RecordData) => void
}) {
  const [kind, setKind] = useState('')
  const rows = new Map(transactions.map(item => [item.transaction_id, item]))
  const byCommitment = new Map(commitments.map(item => [item.commitment_id, item]))
  const filtered = kind ? alerts.filter(item => item.alert_type === kind) : alerts

  return (
    <section className="panel statement-import" aria-labelledby="transaction-review-title">
      <h2 id="transaction-review-title">Review transaction evidence</h2>
      <p>These signals describe patterns in the loaded records. Check statements or receipts to confirm what happened.</p>
      <div className="statement-mapping">
        <label>Review type
          <select aria-label="Review type" value={kind} onChange={event => setKind(event.target.value)}>
            <option value="">All review signals</option>
            {Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>
      <p role="status">{filtered.length} {filtered.length === 1 ? 'signal' : 'signals'}</p>
      {filtered.map((alert, index) => {
        const commitment = byCommitment.get(alert.commitment_id)
        const ids: unknown[] = Array.isArray(alert.transaction_ids) ? alert.transaction_ids
          : alert.transaction_id ? [alert.transaction_id] : []
        const evidence: unknown[] = Array.isArray(alert.evidence) ? alert.evidence : []
        return (
          <details key={String(alert.alert_id ?? index)} className="review-evidence">
            <summary>{String(alert.title ?? 'Review suggested')}</summary>
            <ul>{evidence.map((item, position) => <li key={position}>{String(item ?? '')}</li>)}</ul>
            {!!ids.length && <ul aria-label="Supporting transactions">
              {ids.map(id => {
                const row = rows.get(id)
                return <li key={String(id)}>{row
                  ? <>{String(row.date)} · {String(row.description)} · {formatAmount(Number(row.amount))}</>
                  : <>Transaction {String(id)} is outside the loaded records.</>}</li>
              })}
            </ul>}
            <p>{String(alert.recommended_action ?? '')}</p>
            {commitment && <button className="text-button" type="button" onClick={() => onSelect(commitment)}>Open commitment</button>}
          </details>
        )
      })}
    </section>
  )
}
