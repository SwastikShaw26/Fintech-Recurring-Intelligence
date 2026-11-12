import { useState } from 'react'
import { buildCommitmentForecast } from './milestones'
import { ReminderPanel } from './ReminderPanel'
import { CashBufferPlanner } from './CashBufferPlanner'
import './ForecastPanel.css'

type RecordData = Record<string, unknown>

const indiaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', dateStyle: 'short' })
const dateLabel = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })

export function ForecastPanel({ commitments, transactions, nameFor, formatAmount, reportedFor, onSelect }: {
  commitments: RecordData[]
  transactions: RecordData[]
  nameFor: (item: RecordData) => string
  formatAmount: (amount: number) => string
  reportedFor: (item: RecordData) => boolean
  onSelect: (item: RecordData) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const today = indiaDate.format(new Date())
  const forecast = buildCommitmentForecast(commitments, today)
  const horizonTotal = forecast.entries.reduce((total, entry) => total + (entry.amount ?? 0), 0)
  const savings = forecast.annualized.reduce((total, entry) =>
    selected.includes(String(entry.commitment.commitment_id)) && !reportedFor(entry.commitment)
      ? total + entry.amount : total, 0)
  const observedMonths = new Map<string, number>()
  for (const row of transactions) {
    if (typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date))) continue
    const month = row.date.slice(0, 7)
    const amount = row.direction === 'debit' && typeof row.amount === 'number' && Number.isFinite(row.amount)
      ? Math.abs(row.amount) : 0
    observedMonths.set(month, (observedMonths.get(month) ?? 0) + amount)
  }
  const latestMonth = [...observedMonths.keys()].sort().pop()
  const previousDate = latestMonth ? new Date(latestMonth + '-01T00:00:00Z') : null
  previousDate?.setUTCMonth(previousDate.getUTCMonth() - 1)
  const previousMonth = previousDate?.toISOString().slice(0, 7)

  return (
    <section className="panel forecast-panel" aria-labelledby="forecast-heading">
      <h2 id="forecast-heading">Estimated obligations</h2>
      <p>Projections assume observed patterns continue. Amounts and posting dates can change. A user report does not establish that the issuer has stopped future charges.</p>
      <dl className="forecast-summary">
        <div><dt>Known estimates in 30 days</dt><dd>{formatAmount(horizonTotal)}</dd></div>
        <div><dt>Monthly equivalent</dt><dd>{formatAmount(forecast.annual / 12)}</dd></div>
        <div><dt>Annualized estimate</dt><dd>{formatAmount(forecast.annual)}</dd></div>
      </dl>
      {forecast.unestimated > 0 && <p>{forecast.unestimated} patterns lack enough date or amount evidence for an annual estimate.</p>}
      <h3>30-day debit calendar</h3>
      {forecast.entries.length ? (
        <ol className="forecast-calendar">
          {forecast.entries.map(({ date, commitment, amount, uncertainty }) => (
            <li key={String(commitment.commitment_id) + date}>
              <time dateTime={date}>{dateLabel.format(new Date(date))}</time>
              <div>
                <button type="button" className="text-button" onClick={() => onSelect(commitment)}>{nameFor(commitment)}</button>
                <span>{commitment.billing_anchor_date ? 'Fitted calendar date' : 'Based on last observed debit'}</span>
                {commitment.cadence === 'annual' && <span>Estimated annual renewal</span>}
                {!!uncertainty.length && <span>{uncertainty.join(' · ')}</span>}
                {reportedFor(commitment) && <span>Marked as revoked (user-reported)</span>}
              </div>
              <strong>{amount === null ? 'Amount unavailable' : formatAmount(amount)}</strong>
            </li>
          ))}
        </ol>
      ) : <p>No regular pattern projects a charge in this window.</p>}
      {latestMonth && previousMonth && (
        <>
          <h3>Recorded debits by month</h3>
          <p>Gross debits in the loaded statement. Months may be incomplete, and credits are excluded.</p>
          <dl className="forecast-summary">
            {[previousMonth, latestMonth].map(month => {
              const amount = observedMonths.get(month)
              return <div key={month}><dt>{month}</dt><dd>{amount === undefined ? 'No records loaded' : formatAmount(amount)}</dd></div>
            })}
          </dl>
        </>
      )}
      <h3>Explore potential savings</h3>
      <p>Select commitments you would consider cancelling. Estimates assume cancellation takes effect before another charge and incurs no fees.</p>
      {forecast.annualized.length > 0 && (
        <fieldset className="forecast-options">
          <legend>Commitments to compare</legend>
          {forecast.annualized.map(({ commitment, amount }) => {
            const id = String(commitment.commitment_id)
            const reported = reportedFor(commitment)
            return (
              <label key={id}>
                <input type="checkbox" checked={!reported && selected.includes(id)} disabled={reported}
                  onChange={event => setSelected(previous => event.target.checked ? [...previous, id] : previous.filter(item => item !== id))} />
                <span>{nameFor(commitment)}{reported ? ' · Revocation already reported' : ''}</span>
                <strong>{formatAmount(amount)} / yr</strong>
              </label>
            )
          })}
        </fieldset>
      )}
      <p aria-label="Estimated annual savings" aria-live="polite"><strong>{formatAmount(savings)}</strong> estimated annual savings if selected commitments stop.</p>
      <CashBufferPlanner entries={forecast.entries} nameFor={nameFor} formatAmount={formatAmount} reportedFor={reportedFor} />
      <ReminderPanel entries={forecast.entries} today={today} nameFor={nameFor} formatAmount={formatAmount} reportedFor={reportedFor} />
    </section>
  )
}
