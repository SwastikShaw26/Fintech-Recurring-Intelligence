import type { commitmentCards, ledgerKpis, linkedDebits, LedgerRow } from './ledgerViewModel'
import { ledgerMoney } from './ledgerViewModel'
import './LedgerDashboard.css'

type State = { loading: boolean; error: boolean }
const dateLabel = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export function LedgerKpis({ items, loading, error }: State & { items: ReturnType<typeof ledgerKpis> }) {
  return (
    <section aria-label="Recurring payment summary" className="ledger-kpis" aria-busy={loading}>
      {error ? <p role="alert">Summary is unavailable. Refresh analysis to retry.</p>
        : loading ? <p role="status">Loading recurring payment summary…</p>
          : <dl>{items.map(({ label, values, detail }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{values.length ? values.map(value => <strong key={value}>{value}</strong>) : 'No amounts available'}</dd>
              <dd className="ledger-kpi-detail">{detail}</dd>
            </div>
          ))}</dl>}
    </section>
  )
}

function Sparkline({ amounts }: { amounts: number[] }) {
  if (amounts.length < 2) return <span>Limited history</span>
  const min = Math.min(...amounts)
  const spread = Math.max(...amounts) - min
  const points = amounts.map((amount, i) => `${3 + i * 66 / (amounts.length - 1)},${spread === 0 ? 12 : 21 - 18 * (amount - min) / spread}`).join(' ')
  return (
    <svg viewBox="0 0 72 24" width="72" height="24" role="img" aria-label={`Observed debit trend across ${amounts.length} payments`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function CommitmentList({ groups, loading, error, onSelect }: State & {
  groups: ReturnType<typeof commitmentCards>; onSelect: (row: LedgerRow) => void
}) {
  if (error) return <p role="alert">Commitments are unavailable. Refresh analysis to retry.</p>
  if (loading) return <p role="status">Loading recurring commitments…</p>
  if (!groups.length) return <p>No recurring commitments match this view.</p>
  return (
    <div className="redesign-commitments">
      {groups.map(group => (
        <section key={group.key} aria-label={group.label}>
          <h3>{group.label}</h3>
          <ul>{group.items.map(row => (
            <li key={row.id}>
              <button type="button" aria-label={`View ${row.name}`} onClick={() => onSelect(row.source)}>
                <span><strong>{row.name}</strong>
                  {row.flagged && <small className="ledger-flag">Needs a closer look</small>}
                  {row.reported && <small>Revocation user-reported</small>}
                </span>
                <span>
                  <strong>{row.amount ?? 'Amount unavailable'}</strong>
                  <small>{row.confidence ? `Heuristic confidence ${row.confidence}` : 'Confidence unavailable'}</small>
                </span>
                <span className="ledger-sparkline"><Sparkline amounts={row.trend} /></span>
                <span className="ledger-next-date">
                  {row.next ? <><time dateTime={row.next}>{dateLabel.format(new Date(row.next))}</time><small>Inferred</small></>
                    : <small>No projected date</small>}
                </span>
              </button>
            </li>
          ))}</ul>
        </section>
      ))}
    </div>
  )
}

export function ObservedEvidence({ rows, currency, loading, error }: State & {
  rows: ReturnType<typeof linkedDebits>; currency: string
}) {
  return (
    <section className="evidence-list observed-evidence" aria-labelledby="observed-evidence-heading">
      <h3 id="observed-evidence-heading">Observed supporting debits</h3>
      {loading && <p role="status">Loading additional supporting debits…</p>}
      {error && <p role="alert">Additional evidence is unavailable. Loaded statement evidence is shown below.</p>}
      {!rows.length && !loading && <p>No linked debit rows are available in this workspace.</p>}
      <ul>{rows.map(row => <li key={row.id}>
        <time dateTime={row.date}>{dateLabel.format(new Date(row.date))}</time>
        <span>{row.description || 'Description unavailable'}</span>
        <strong>{ledgerMoney(row.amount, currency)}</strong>
      </li>)}</ul>
    </section>
  )
}
