import { useId, useState } from 'react'
import { buildCommitmentForecast } from './milestones'
import { commitmentHistory } from './forecastCardData'
import './ForecastCard.css'

type RecordData = Record<string, unknown>
type Point = { id: string; date: string; amount: number | null }

const indiaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', dateStyle: 'short' })
const shortDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const fullDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', dateStyle: 'medium' })

function ForecastChart({ observed, projected, formatAmount }: {
  observed: Point[]
  projected: Point[]
  formatAmount: (amount: number) => string
}) {
  const priced = [...observed, ...projected].flatMap(point => point.amount === null ? [] : [{ ...point, amount: point.amount }])
  if (!priced.length) return <p>No amounts are available to plot.</p>
  const first = priced[0].date
  const last = priced[priced.length - 1].date
  const firstTime = Date.parse(first)
  const duration = Date.parse(last) - firstTime
  const ceiling = Math.max(...priced.map(point => point.amount), 1)
  const x = (date: string) => duration ? 72 + (Date.parse(date) - firstTime) / duration * 486 : 315
  const y = (amount: number) => 152 - amount / ceiling * 122
  const coordinates = (points: Point[]) => points
    .flatMap(point => point.amount === null ? [] : [`${x(point.date)},${y(point.amount)}`]).join(' ')
  const inferred = projected.filter(point => point.amount !== null)
  return (
    <figure className="forecast-card-figure">
      <svg viewBox="0 0 592 185" aria-hidden="true" focusable="false">
        {[0, ceiling / 2, ceiling].map(value => (
          <g key={value} className="forecast-card-axis">
            <line x1="72" x2="558" y1={y(value)} y2={y(value)} />
            <text x="65" y={y(value) + 4} textAnchor="end">{formatAmount(value)}</text>
          </g>
        ))}
        <polyline className="forecast-card-observed" points={coordinates(observed)} />
        {inferred.length > 1 && <polyline className="forecast-card-inferred" points={coordinates(inferred)} />}
        {observed.map(point => point.amount !== null
          && <circle key={point.id} className="forecast-card-observed" cx={x(point.date)} cy={y(point.amount)} r="4" />)}
        {inferred.map(point => point.amount !== null && (
          <g key={point.id} className="forecast-card-inferred">
            <line x1={x(point.date)} x2={x(point.date)} y1={y(point.amount)} y2={152} />
            <circle cx={x(point.date)} cy={y(point.amount)} r="5" />
          </g>
        ))}
        <text x={x(first)} y="176" textAnchor={duration ? 'start' : 'middle'}>{shortDate.format(new Date(first))}</text>
        {duration > 0 && <text x={x(last)} y="176" textAnchor="end">{shortDate.format(new Date(last))}</text>}
      </svg>
      <figcaption>
        <span className="forecast-card-key">Observed</span>
        <span className="forecast-card-key forecast-card-key-inferred">Inferred</span>
      </figcaption>
    </figure>
  )
}

export function ForecastCard({ commitments, transactions, currency, loading, error, nameFor }: {
  commitments: RecordData[]
  transactions: RecordData[]
  currency?: unknown
  loading?: boolean
  error?: string | null
  nameFor?: (item: RecordData) => string
}) {
  const headingId = useId()
  const selectorId = useId()
  const [selected, setSelected] = useState('')
  const options = [...new Map(commitments.flatMap(item =>
    typeof item.commitment_id === 'string' && item.commitment_id ? [[item.commitment_id, item] as const] : [])).values()]
  const commitment = options.find(item => item.commitment_id === selected) ?? options[0]
  const today = indiaDate.format(new Date())
  const history = commitment ? commitmentHistory(commitment, transactions, today, currency) : null
  const forecast = commitment ? buildCommitmentForecast([commitment], today) : null
  const projected = forecast?.entries.map(entry => ({ ...entry, id: `inferred-${entry.date}` })) ?? []
  const notes = [...new Set(projected.flatMap(entry => entry.uncertainty))]
  const displayCurrency = history?.currency
  const money = typeof displayCurrency === 'string' && /^[A-Z]{3}$/.test(displayCurrency)
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: displayCurrency })
    : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
  const formatAmount = (amount: number) => money.format(amount)
    + (money.resolvedOptions().style === 'currency' ? '' : ' units')

  return (
    <section className="panel forecast-card" aria-labelledby={headingId}>
      <h2 id={headingId}>Payment history and forecast</h2>
      {loading ? <p role="status">Loading payment history…</p>
        : error ? <p role="alert">Payment history is unavailable. {error}</p>
          : commitment && history ? (
            <>
              <label htmlFor={selectorId}>Recurring payment</label>
              <select id={selectorId} value={String(commitment.commitment_id)} onChange={event => setSelected(event.target.value)}>
                {options.map(item => (
                  <option key={String(item.commitment_id)} value={String(item.commitment_id)}>
                    {nameFor?.(item) ?? String(item.display_name ?? item.merchant ?? item.commitment_id)}
                  </option>
                ))}
              </select>
              <p>Observed points come from linked debits in the loaded records. Inferred points estimate charges over the next 30 days.</p>
              {history.missingCount > 0 && (
                <p>{history.missingCount} of {history.linkedCount} linked transactions are outside the loaded records.</p>
              )}
              {history.points.length === 0 && <p>No linked debits with usable dates and amounts are loaded.</p>}
              <p>Coverage is unverified. Gaps between observations do not establish that there were no charges.</p>
              {projected.length === 0 && <p>No upcoming charge is projected in this window.</p>}
              {notes.length > 0 && <p>{notes.join(' · ')}</p>}
              {history.points.length + projected.length > 0 && (
                <>
                  <ForecastChart observed={history.points} projected={projected} formatAmount={formatAmount} />
                  <table className="forecast-card-table">
                    <caption>Payment history and estimates{typeof displayCurrency === 'string' && displayCurrency !== 'unspecified' ? ` (${displayCurrency})` : ''}</caption>
                    <thead><tr><th scope="col">Date</th><th scope="col">Basis</th><th scope="col">Amount</th></tr></thead>
                    <tbody>
                      {[...history.points, ...projected].map(point => (
                        <tr key={point.id}>
                          <td><time dateTime={point.date}>{fullDate.format(new Date(point.date))}</time></td>
                          <td>{'uncertainty' in point ? 'Inferred' : 'Observed'}</td>
                          <td>{point.amount === null ? 'Unavailable' : formatAmount(point.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          ) : <p>No recurring payments are available to chart.</p>}
    </section>
  )
}
