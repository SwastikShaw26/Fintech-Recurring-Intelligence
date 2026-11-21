import { useId, useState } from 'react'
import {
  alertAcknowledgementsKey, countAcknowledgedAlerts, readAlertAcknowledgements,
  type AlertCardModel,
} from './alertCardsModel'
import { SarvamEvidenceContext, type SarvamContextRequest } from './SarvamEvidenceContext'
import './AlertCards.css'

const labels: Record<string, string> = {
  possible_duplicate: 'Possible duplicates',
  sustained_amount_change: 'Sustained amount changes',
  charge_after_gap: 'Charges after a gap',
  amount_deviation: 'Amount deviations',
  irregular_pattern: 'Irregular patterns',
}

type Props = {
  alerts: AlertCardModel[]
  workspaceKey: string
  loading: boolean
  error?: string
  formatAmount: (value: number) => string
  onSelectCommitment: (id: string) => void
  onRetry: () => void
  requestExplanation: SarvamContextRequest
  previewLimit?: number
}

export function AlertCards(props: Props) {
  return <WorkspaceAlertCards key={props.workspaceKey} {...props} />
}

function WorkspaceAlertCards({ alerts, workspaceKey, loading, error, formatAmount, onSelectCommitment, onRetry, requestExplanation, previewLimit }: Props) {
  const headingId = useId()
  const storageKey = alertAcknowledgementsKey(workspaceKey)
  const [acknowledged, setAcknowledged] = useState(() => {
    try {
      return readAlertAcknowledgements(sessionStorage.getItem(storageKey))
    } catch {
      return new Set<string>()
    }
  })
  const [kind, setKind] = useState('')
  const counts = countAcknowledgedAlerts(alerts, acknowledged)
  const kinds = [...new Set(alerts.flatMap(alert => alert.kind ? [alert.kind] : []))]
  const filtered = previewLimit === undefined ? (kind ? alerts.filter(alert => alert.kind === kind) : alerts) : alerts.slice(0, previewLimit)

  function toggleAcknowledgement(id: string) {
    const next = new Set(acknowledged)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setAcknowledged(next)
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...next]))
    } catch {
      // The open view can still record acknowledgements when browser storage is unavailable.
    }
  }

  return (
    <section className="panel alert-cards" aria-labelledby={headingId}>
      <header className="alert-cards-header">
        <div>
          <h2 id={headingId}>Review signals</h2>
          <p>Check these patterns against your statement or receipts.</p>
        </div>
        {!loading && !error && counts.total > 0 && (
          <div className="alert-cards-progress">
            <div className="alert-progress-ring" role="progressbar" aria-label="Acknowledged this session"
              aria-valuemin={0} aria-valuemax={counts.total} aria-valuenow={counts.acknowledged}
              aria-valuetext={`${counts.acknowledged} of ${counts.total} alerts`}
              style={{ backgroundImage: `conic-gradient(var(--evergreen) ${100 * counts.acknowledged / counts.total}%, var(--inset) 0)` }}>
              <span aria-hidden="true">{counts.acknowledged}/{counts.total}</span>
            </div>
            <div>
              <strong>Acknowledged this session</strong>
              <p>Acknowledging leaves detector flags active.</p>
            </div>
          </div>
        )}
      </header>
      {loading ? <p role="status">Loading review signals…</p>
        : error ? <div role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={onRetry}>Retry</button></div>
          : !alerts.length ? <p role="status">No review signals in the loaded records.</p>
            : (
              <>
                {previewLimit === undefined && <label className="alert-cards-filter">
                  Review type
                  <select value={kind} onChange={event => setKind(event.target.value)}>
                    <option value="">All review signals</option>
                    {kinds.map(type => <option value={type} key={type}>{labels[type] ?? type}</option>)}
                  </select>
                </label>}
                <p role="status">{previewLimit === undefined
                  ? `${filtered.length} ${filtered.length === 1 ? 'signal' : 'signals'}`
                  : `Showing ${filtered.length} of ${alerts.length} signals`}</p>
                {!filtered.length && <p>No signals match this filter.</p>}
                <ul className="alert-cards-list">
                  {filtered.map(alert => (
                    <li key={alert.key} className="alert-card">
                      <details>
                        <summary>{alert.title}</summary>
                        {alert.evidence.length > 0
                          ? <ul>{alert.evidence.map((line, index) => <li key={index}>{line}</li>)}</ul>
                          : <p>No additional evidence was supplied for this signal.</p>}
                        {alert.transactions.length > 0 && (
                          <ul aria-label="Supporting transactions">
                            {alert.transactions.map(row => (
                              <li key={row.id}>
                                {row.flagged === undefined
                                  ? <>Transaction {row.id} is outside the loaded records.</>
                                  : <>{row.date} · {row.description ?? row.id} · {row.amount === undefined ? 'Amount unavailable' : formatAmount(row.amount)}
                                    {row.flagged && ' · Flagged for review'}</>}
                              </li>
                            ))}
                          </ul>
                        )}
                        {alert.recommendation && <p>{alert.recommendation}</p>}
                        {alert.commitmentId && <button className="text-button" type="button" onClick={() => onSelectCommitment(alert.commitmentId!)}>
                          Open commitment
                        </button>}
                        <SarvamEvidenceContext contextKey={alert.key} evidence={{ evidence_type: 'review', count: 1 }}
                          requestExplanation={requestExplanation} />
                      </details>
                      <div className="alert-card-status">
                        {alert.severity && <span className="alert-card-severity">{alert.severity}</span>}
                        {alert.id && (
                          <button type="button" className="secondary-button"
                            aria-label={`Acknowledge alert: ${alert.title}`}
                            aria-pressed={acknowledged.has(alert.id)} onClick={() => toggleAcknowledgement(alert.id!)}>
                            {acknowledged.has(alert.id) ? 'Acknowledged' : 'Acknowledge'}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
    </section>
  )
}
