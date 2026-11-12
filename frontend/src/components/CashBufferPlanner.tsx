import { useState } from 'react'
import { projectCashBuffer } from './cashBuffer'
import type { buildCommitmentForecast } from './milestones'

type Entry = ReturnType<typeof buildCommitmentForecast>['entries'][number]

export function CashBufferPlanner({ entries, nameFor, formatAmount, reportedFor }: {
  entries: Entry[]
  nameFor: (item: Entry['commitment']) => string
  formatAmount: (amount: number) => string
  reportedFor: (item: Entry['commitment']) => boolean
}) {
  const [balance, setBalance] = useState('')
  const [buffer, setBuffer] = useState('0')
  const [excluded, setExcluded] = useState<string[]>([])
  const supported = entries.filter(entry => entry.amount !== null
    && !entry.uncertainty.includes('No recent supporting debit'))
  const options = [...new Map(supported.map(entry => [String(entry.commitment.commitment_id), entry.commitment])).entries()]
  const starting = Number(balance)
  const minimum = Number(buffer)
  const valid = balance.trim() !== '' && buffer.trim() !== '' && minimum >= 0
    && [starting, minimum].every(value => Number.isFinite(value) && Math.abs(value) <= 1_000_000_000)
  const projection = valid ? projectCashBuffer(starting, minimum, supported.flatMap(entry =>
    entry.amount !== null && !reportedFor(entry.commitment) && !excluded.includes(String(entry.commitment.commitment_id))
      ? [{ date: entry.date, amount: entry.amount }] : [])) : []

  return (
    <section className="cash-buffer-planner" aria-labelledby="cash-buffer-heading">
      <h3 id="cash-buffer-heading">Cash buffer planner</h3>
      <p>Enter a balance for this visit. This 30-day scenario subtracts selected estimates and omits income, other spending, and stale charges. It does not read your bank balance.</p>
      <div className="cash-buffer-inputs">
        <label>Starting balance
          <input type="number" step="0.01" min="-1000000000" max="1000000000" value={balance}
            onChange={event => setBalance(event.target.value)} />
        </label>
        <label>Minimum balance buffer
          <input type="number" step="0.01" min="0" max="1000000000" value={buffer}
            onChange={event => setBuffer(event.target.value)} />
        </label>
      </div>
      {!!options.length && <fieldset className="forecast-options">
        <legend>Include these projected commitments</legend>
        {options.map(([id, commitment]) => {
          const reported = reportedFor(commitment)
          return <label key={id}>
            <input type="checkbox" checked={!reported && !excluded.includes(id)} disabled={reported}
              onChange={event => setExcluded(previous => event.target.checked
                ? previous.filter(item => item !== id) : [...previous, id])} />
            <span>{nameFor(commitment)}{reported ? ' · Revocation reported' : ''}</span>
          </label>
        })}
      </fieldset>}
      <div aria-live="polite">
        {!valid ? <p>Enter a starting balance and a nonnegative buffer to view the scenario.</p>
          : !projection.length ? <p>No selected charge estimates fall in this window. Starting balance: {formatAmount(starting)}.</p>
            : <ul className="cash-buffer-days">{projection.map(day => <li key={day.date}>
              <time dateTime={day.date}>{day.date}</time>
              <span>Estimated debits {formatAmount(day.debits)}</span>
              <strong>Projected balance {formatAmount(day.balance)}</strong>
              {day.belowBuffer && <span>Below buffer</span>}
            </li>)}</ul>}
      </div>
    </section>
  )
}
