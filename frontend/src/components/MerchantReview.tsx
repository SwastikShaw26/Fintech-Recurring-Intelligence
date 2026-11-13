import { useEffect, useRef, useState } from 'react'
import type { StatementData } from './StatementImport'
import { normalizedStatementCsv, requestAnalysis } from './statementRequest'

export function MerchantReview({ api, statement, onAnalyze, hostedToken }: {
  api: string
  statement: StatementData
  onAnalyze: (data: StatementData) => void
  hostedToken?: string
}) {
  const [source, setSource] = useState('')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef<AbortController | null>(null)
  const descriptors = [...new Map(statement.transactions
    .filter(row => row.direction === 'debit')
    .map(row => [String(row.description).toUpperCase(), String(row.description)])).values()].sort()
  const links = statement.merchant_links

  useEffect(() => () => {
    pending.current?.abort()
    pending.current = null
  }, [])

  async function apply(next: [string, string][], dismissals = statement.merchant_dismissals) {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError('')
    try {
      const csv = normalizedStatementCsv(statement.transactions)
      const updated = await requestAnalysis<StatementData>(api, {
        csv, analysis_id: statement.analysis_id, aliases: next, currency: statement.summary.currency,
        merchant_dismissals: dismissals,
        mapping: { date: 0, description: 1, amount: 2, direction: 3, payment_method: 4 },
      }, controller.signal, hostedToken)
      if (controller.signal.aborted) return
      setSource('')
      setTarget('')
      onAnalyze(updated)
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not review merchants.')
    } finally {
      if (pending.current === controller) {
        pending.current = null
        setBusy(false)
      }
    }
  }

  return (
    <section className="panel statement-import" aria-labelledby="merchant-review-title">
      <h2 id="merchant-review-title">Review merchant descriptors</h2>
      <p>Link two descriptors only if they represent the same merchant. FinSight keeps the original descriptions in transaction history and recalculates recurring patterns for this tab.</p>
      {statement.merchant_suggestions.length > 0 && (
        <ul aria-label="Suggested merchant links">
          {statement.merchant_suggestions.map(({ source, target, reason, similarity }) => (
            <li key={JSON.stringify([source, target])}>
              <strong>{source} → {target}</strong>
              <p>{reason}{similarity === undefined ? '' : ` (${Math.round(similarity * 100)}% text similarity)`}.</p>
              <button className="secondary-button" type="button" disabled={busy}
                aria-label={`Confirm ${source} → ${target}`}
                onClick={() => void apply([...links, [source, target]])}>Confirm link</button>{' '}
              <button className="text-button" type="button" disabled={busy}
                aria-label={`Dismiss ${source} → ${target}`}
                onClick={() => void apply(links, [...statement.merchant_dismissals, [source, target]])}>Dismiss</button>
            </li>
          ))}
        </ul>
      )}
      {statement.merchant_dismissals.length > 0 && (
        <ul aria-label="Dismissed merchant suggestions">
          {statement.merchant_dismissals.map(([variant, canonical], index) => (
            <li key={JSON.stringify([variant, canonical])}>{variant} / {canonical}{' '}
              <button type="button" className="text-button" disabled={busy}
                onClick={() => void apply(links, statement.merchant_dismissals.filter((_, position) => position !== index))}>
                Restore suggestion
              </button>
            </li>
          ))}
        </ul>
      )}
      {links.length > 0 && (
        <ul aria-label="Merchant links">
          {links.map(([variant, canonical]) => (
            <li key={variant}>{variant} → {canonical}{' '}
              <button type="button" className="text-button" disabled={busy}
                aria-label={'Remove link for ' + variant}
                onClick={() => void apply(links.filter(([existing]) => existing !== variant))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {descriptors.length < 2 ? <p>At least two distinct debit descriptors are needed.</p> : (
        <form onSubmit={event => {
          event.preventDefault()
          void apply([...links.filter(([existing]) => existing.toUpperCase() !== source.toUpperCase()), [source, target]])
        }}>
          <fieldset className="statement-mapping" disabled={busy}>
            <legend>Confirm a descriptor link</legend>
            <label>Variant descriptor
              <select aria-label="Variant descriptor" value={source} onChange={event => setSource(event.target.value)} required>
                <option value="">Choose a descriptor</option>
                {descriptors.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>Keep as merchant
              <select aria-label="Keep as merchant" value={target} onChange={event => setTarget(event.target.value)} required>
                <option value="">Choose a descriptor</option>
                {descriptors.map(value => <option key={value} disabled={value === source}>{value}</option>)}
              </select>
            </label>
          </fieldset>
          <button type="submit" className="primary-button" disabled={busy || !source || !target || source === target}>
            {busy ? 'Analyzing…' : 'Link and reanalyze'}
          </button>
        </form>
      )}
      {error && <p role="alert" className="statement-error">{error}</p>}
    </section>
  )
}
