import type { buildCommitmentActivity } from './commitmentActivity'

const labels = {
  'later-debit': 'Observed debit after report',
  'billing-gap': 'Possible skipped billing cycle',
  'revocation-report': 'Marked as revoked (user-reported)',
  'price-change': 'Sustained observed price change',
}

export function CommitmentActivity({ events, currency, formatAmount }: {
  events: ReturnType<typeof buildCommitmentActivity>
  currency: unknown
  formatAmount: (amount: number) => string
}) {
  if (!events.length) return null
  return (
    <section className="statement-import" aria-labelledby="commitment-activity-title">
      <h3 id="commitment-activity-title">Commitment activity</h3>
      <p>Gaps can reflect incomplete statement coverage. Verify current mandate status with your provider.</p>
      <ol>
        {events.map((event, index) => <li key={event.kind + event.date + index}>
          <time dateTime={event.date}>{event.date}</time> · {labels[event.kind]}
          {event.earlierAmount !== undefined && ' · ' + formatAmount(event.earlierAmount) + ' earlier'}
          {event.amount !== undefined && ' · ' + formatAmount(event.amount) + (event.kind === 'price-change' ? ' latest' : '')}
          {event.elapsedDays !== undefined && ` · ${event.elapsedDays} days between observed debits`}
        </li>)}
      </ol>
      {events.some(event => event.kind === 'revocation-report') && !events.some(event => event.kind === 'later-debit')
        && <p>No linked debits appear after that day in the loaded records.</p>}
      <button type="button" className="secondary-button" onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify({
          version: 1, currency, events, scope: 'Selected commitment activity. Issuer status unverified.',
        }, null, 2)], { type: 'application/json' }))
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = 'finsight-commitment-activity.json'
        anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}>Download this activity</button>
    </section>
  )
}
