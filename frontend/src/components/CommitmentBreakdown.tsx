import { useId, useState } from 'react'
import { breakdownCsv, buildCostBreakdown, type SummaryScope } from './commitmentBreakdownData'
import './CommitmentBreakdown.css'

type RecordData = Record<string, unknown>
type ChartSlice = ReturnType<typeof buildCostBreakdown>[number]['merchant'][number]

function CostDonut({ label, slices, total, formatAmount }: {
  label: string; slices: ChartSlice[]; total: number; formatAmount: (amount: number) => string
}) {
  const arcs: { key: string; index: number; length: number; offset: number }[] = []
  let offset = 0
  if (total > 0) {
    for (const [index, slice] of slices.entries()) {
      const length = slice.amount / total * 100
      if (length > 0) arcs.push({ key: slice.key, index, length, offset })
      offset += length
    }
  }
  return (
    <figure className="cost-donut">
      <figcaption>{label}</figcaption>
      {total > 0 && (
        <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <circle className="cost-donut-track" cx="50" cy="50" r="40" />
          {arcs.map(arc => (
            <circle key={arc.key} className={`cost-donut-color-${arc.index % 6}`}
              cx="50" cy="50" r="40" pathLength="100" strokeDasharray={`${arc.length} 100`}
              strokeDashoffset={-arc.offset} transform="rotate(-90 50 50)" />
          ))}
        </svg>
      )}
      <table>
        <caption>{label}</caption>
        <thead><tr><th scope="col">Group</th><th scope="col">Annual estimate</th><th scope="col">Share</th></tr></thead>
        <tbody>{slices.map((slice, index) => (
          <tr key={slice.key}>
            <th scope="row"><span className={`cost-donut-chip cost-donut-color-${index % 6}`} aria-hidden="true" />{slice.label}</th>
            <td>{formatAmount(slice.amount)}</td><td>{total > 0 ? `${(slice.amount / total * 100).toFixed(1)}%` : '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </figure>
  )
}

export function CommitmentBreakdown({ commitments, currency, nameFor, loading, error, scope }: {
  commitments: RecordData[]
  currency?: unknown
  nameFor: (item: RecordData) => string
  loading?: boolean
  error?: string | null
  scope: SummaryScope
}) {
  const headingId = useId()
  const [groupBy, setGroupBy] = useState<'cadence' | 'merchant'>('cadence')
  const groups = buildCostBreakdown(commitments, currency, nameFor)
  const hasMerchant = commitments.some(item => typeof item.display_name === 'string' && Boolean(item.display_name.trim()))
  const view = hasMerchant ? groupBy : 'cadence'

  function exportSummary() {
    const file = new Blob(['\ufeff', breakdownCsv(groups, scope)], { type: 'text/csv;charset=utf-8' })
    const href = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = href
    link.download = 'finsight-recurring-cost-summary.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  return (
    <section className="panel cost-breakdown" aria-labelledby={headingId}>
      <h2 id={headingId}>Workspace summary and recurring costs</h2>
      {loading ? <p role="status">Loading recurring costs…</p>
        : error ? <p role="alert">Recurring costs are unavailable. {error}</p>
          : groups.length ? (
            <>
              <dl className="cost-summary-scope">
                <div><dt>Workspace</dt><dd>{scope.workspace}</dd></div>
                <div><dt>Observed dates in loaded rows</dt><dd>{scope.observedFrom && scope.observedTo
                  ? <><time dateTime={scope.observedFrom}>{scope.observedFrom}</time> to <time dateTime={scope.observedTo}>{scope.observedTo}</time></>
                  : 'No dated rows loaded'}</dd></div>
                <div><dt>Review signals</dt><dd>{scope.reviewSignals}</dd></div>
              </dl>
              <p>Statement coverage is unverified. Annual totals are inferred from known costs for loaded commitments and shown separately by currency.</p>
              {hasMerchant && <div className="layout-switch cost-group-switch" role="group" aria-label="Group recurring costs">
                <button type="button" aria-pressed={view === 'cadence'} onClick={() => setGroupBy('cadence')}>Cadence</button>
                <button type="button" aria-pressed={view === 'merchant'} onClick={() => setGroupBy('merchant')}>Merchant</button>
              </div>}
              <button className="secondary-button" type="button" onClick={exportSummary}>Download cost summary CSV</button>
              {groups.map(group => {
                const known = group.currency !== 'unspecified'
                const number = new Intl.NumberFormat('en-IN', known
                  ? { style: 'currency', currency: group.currency } : { maximumFractionDigits: 2 })
                const formatAmount = (amount: number) => number.format(amount) + (known ? '' : ' units')
                return (
                  <div key={group.currency} className="cost-breakdown-group">
                    <h3>{known ? group.currency : 'Currency unspecified'}</h3>
                    {group.included > 0 ? (
                      <>
                        <p><strong>{formatAmount(group.total)}</strong> · Inferred annual cost across {group.included} commitments.</p>
                        <CostDonut label={view === 'cadence' ? 'By cadence' : 'By merchant'}
                          slices={group[view]} total={group.total} formatAmount={formatAmount} />
                      </>
                    ) : <p>No known annualized costs are available for this currency.</p>}
                    {group.excluded > 0 && <p>{group.excluded} commitments without a usable estimate are excluded from these totals.</p>}
                  </div>
                )
              })}
            </>
          ) : <p>No recurring commitments are available for a cost breakdown.</p>}
    </section>
  )
}
