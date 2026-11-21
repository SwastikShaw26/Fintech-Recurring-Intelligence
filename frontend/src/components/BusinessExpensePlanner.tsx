import { useState } from 'react'
import { buildCommitmentForecast } from './milestones'

type Commitment = Record<string, unknown>
const indiaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', dateStyle: 'short' })

export function BusinessExpensePlanner({ commitments, nameFor, formatAmount, onSelect }: {
  commitments: Commitment[]
  nameFor: (item: Commitment) => string
  formatAmount: (amount: number) => string
  onSelect: (item: Commitment) => void
}) {
  const [included, setIncluded] = useState<ReadonlySet<string>>(() => new Set())
  const [businessOnly, setBusinessOnly] = useState(false)
  const eligible = commitments.filter(item => typeof item.commitment_id === 'string' && item.commitment_id)
  const business = eligible.filter(item => included.has(String(item.commitment_id)))
  const forecast = buildCommitmentForecast(business, indiaDate.format(new Date()))
  const visible = businessOnly ? business : eligible

  function changeSelection(id: string, checked: boolean) {
    setIncluded(previous => {
      const next = new Set(previous)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <details className="review-evidence">
      <summary>Freelancer business-cost planner</summary>
      <p>Choose recurring payments to include in a business-cost estimate. Selections reset when you leave this view or refresh. Saved personal and business labels require account storage.</p>
      {eligible.length ? (
        <>
          <label><input type="checkbox" checked={businessOnly}
            onChange={event => setBusinessOnly(event.target.checked)} /> Show included business expenses only</label>
          <p role="status">{business.length === 0 ? 'No business expenses selected.'
            : forecast.annualized.length === 0 ? 'The selected expenses lack enough evidence for a cost estimate.'
              : `${formatAmount(forecast.annual / 12)} monthly equivalent · ${formatAmount(forecast.annual)} annualized estimate.`}</p>
          {forecast.unestimated > 0 && <p>{forecast.unestimated} selected patterns lack a usable date or amount and are excluded from the total.</p>}
          {business.length > 0 && <p>Estimates assume the selected payment patterns continue. Actual charges can vary.</p>}
          {visible.length > 0 && <fieldset className="forecast-options">
            <legend>Recurring payments</legend>
            {visible.map(item => {
              const id = String(item.commitment_id)
              return <div key={id}>
                <label><input type="checkbox" checked={included.has(id)} onChange={event => changeSelection(id, event.target.checked)} />
                  <span>Include {nameFor(item)} in business estimate</span></label>
                <button type="button" className="text-button" onClick={() => onSelect(item)}>View details for {nameFor(item)}</button>
              </div>
            })}
          </fieldset>}
        </>
      ) : <p>No recurring payments are available. Import a statement with repeated debits to start.</p>}
    </details>
  )
}
