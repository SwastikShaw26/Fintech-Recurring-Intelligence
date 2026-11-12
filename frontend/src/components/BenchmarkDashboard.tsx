import { useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import results from './benchmark-results.json'
import './BenchmarkDashboard.css'

gsap.registerPlugin(useGSAP)

const matrix = [
  { key: 'tp', label: 'True positives' },
  { key: 'fn', label: 'False negatives' },
  { key: 'fp', label: 'False positives' },
  { key: 'tn', label: 'True negatives' },
] as const

type Outcome = typeof matrix[number]['key']
const isError = (key: string) => key === 'fp' || key === 'fn'
const classLabel = (recurring: boolean) => recurring ? 'Recurring' : 'Non-recurring'
const number = new Intl.NumberFormat('en-IN')
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
const percentValue = (value: number | null) => value === null ? null : value * 100
const kpis = [
  { label: 'Precision', value: percentValue(results.metrics.precision), percent: true },
  { label: 'Recall', value: percentValue(results.metrics.recall), percent: true },
  { label: 'F1 score', value: percentValue(results.metrics.f1), percent: true },
  { label: 'Evaluated debits', value: results.metrics.sample_count, percent: false },
]
const formatKpi = (value: number | null, percent: boolean) => value === null
  ? 'Unavailable'
  : percent ? value.toFixed(1) + '%' : number.format(Math.round(value))

export function BenchmarkDashboard() {
  const scope = useRef<HTMLElement>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [caseId, setCaseId] = useState(results.cases[0].id)
  const matching = results.cases.filter(item => !outcome || item.counts[outcome] > 0)
  const selected = matching.find(item => item.id === caseId) ?? matching[0]
  const transactions = selected?.transactions.filter(row => !outcome || row.outcome === outcome) ?? []

  useGSAP(() => {
    const motion = gsap.matchMedia()
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      const intro = gsap.timeline({ defaults: { ease: 'power2.out' } })
        .from('.benchmark-kpi', { opacity: 0.25, y: 10, stagger: 0.055, duration: 0.4 })
        .from('.benchmark-matrix button', { opacity: 0.25, y: 7, stagger: 0.045, duration: 0.32 }, 0.19)
      scope.current?.querySelectorAll<HTMLElement>('.benchmark-counter').forEach((counter, index) => {
        const kpi = kpis[index]
        if (kpi.value === null) return
        const state = { value: 0 }
        intro.to(state, {
          value: kpi.value, duration: 0.65,
          onUpdate: () => { counter.textContent = formatKpi(state.value, kpi.percent) },
          onComplete: () => { counter.textContent = formatKpi(kpi.value, kpi.percent) },
        }, index * 0.055)
      })
      return () => {
        scope.current?.querySelectorAll<HTMLElement>('.benchmark-counter').forEach((counter, index) => {
          counter.textContent = formatKpi(kpis[index].value, kpis[index].percent)
        })
      }
    })
    return () => motion.revert()
  }, { scope })

  useGSAP(() => {
    const motion = gsap.matchMedia()
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.benchmark-case-fill', { scaleX: 0.2, transformOrigin: 'left', duration: 0.38, stagger: 0.025 })
      gsap.from('.benchmark-evidence-content', { opacity: 0.3, y: 7, duration: 0.3 })
    })
    return () => motion.revert()
  }, { scope, dependencies: [outcome, selected?.id], revertOnUpdate: true })

  return (
    <section ref={scope} className="benchmark-dashboard" aria-labelledby="benchmark-title">
      <header className="benchmark-header">
        <div>
          <p className="benchmark-kicker">FinSight V3 · Detector evaluation</p>
          <h2 id="benchmark-title">Adversarial benchmark</h2>
        </div>
        <p>Preliminary evaluation on separately authored synthetic transactions. Each case includes the expected labels and the detector’s reasoning.</p>
      </header>

      <dl className="benchmark-kpis">
        {kpis.map(kpi => (
          <div className="benchmark-kpi" key={kpi.label}>
            <dt>{kpi.label}</dt>
            <dd aria-label={formatKpi(kpi.value, kpi.percent)}>
              <span className="benchmark-counter" aria-hidden="true">{formatKpi(kpi.value, kpi.percent)}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="benchmark-grid">
        <section className="benchmark-panel benchmark-confusion" aria-labelledby="benchmark-confusion">
          <h3 id="benchmark-confusion">Confusion matrix</h3>
          <p>Select a result to filter the challenge explorer.</p>
          <table className="benchmark-matrix">
            <thead><tr><td>Expected / predicted</td><th scope="col">Recurring</th><th scope="col">Non-recurring</th></tr></thead>
            <tbody>
              {[0, 2].map(start => (
                <tr key={start}>
                  <th scope="row">{classLabel(start === 0)}</th>
                  {matrix.slice(start, start + 2).map(cell => (
                    <td key={cell.key}>
                      <button type="button" aria-pressed={outcome === cell.key} data-error={isError(cell.key)}
                        onClick={() => setOutcome(outcome === cell.key ? null : cell.key)}>
                        <span>{cell.label}</span><strong>{results.counts[cell.key]}</strong>
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <button className="benchmark-clear" type="button" onClick={() => setOutcome(null)} disabled={!outcome}>Show all outcomes</button>
        </section>

        <section className="benchmark-panel" aria-labelledby="benchmark-challenges">
          <h3 id="benchmark-challenges">Challenge explorer</h3>
          <p aria-live="polite">{outcome ? matrix.find(cell => cell.key === outcome)?.label : 'Correct classifications per scenario'} · {matching.length} scenarios</p>
          <div className="benchmark-cases">
            {matching.map(item => {
              const total = item.transactions.length
              const count = outcome ? item.counts[outcome] : item.counts.tp + item.counts.tn
              return (
                <button key={item.id} type="button" aria-pressed={selected?.id === item.id}
                  onClick={() => setCaseId(item.id)} className="benchmark-case">
                  <span>{item.name}</span><strong>{count}/{total}</strong>
                  <span aria-hidden="true" className="benchmark-case-track">
                    <span className="benchmark-case-fill" data-error={isError(outcome ?? '')}
                      style={{ width: 100 * count / total + '%' }} />
                  </span>
                </button>
              )
            })}
            {!matching.length && <p>No cases produced this result.</p>}
          </div>
        </section>
      </div>

      <section className="benchmark-panel benchmark-evidence" aria-labelledby="benchmark-evidence">
        <h3 id="benchmark-evidence">Transaction evidence</h3>
        {selected ? (
          <div className="benchmark-evidence-content" key={selected.id + (outcome ?? '')}>
            <p><strong>{selected.name}.</strong> {selected.premise}</p>
            <div className="benchmark-rows">
              {transactions.map(row => (
                <article key={row.id} className="benchmark-row" data-error={isError(row.outcome)}>
                  <div>
                    <strong>{row.descriptor}</strong>
                    <span><time dateTime={row.date}>{row.date}</time> · {row.method} · {money.format(row.amount)}</span>
                  </div>
                  <div>
                    <span>{matrix.find(cell => cell.key === row.outcome)?.label}</span>
                    <strong>Expected {classLabel(row.expected).toLowerCase()} · Predicted {classLabel(row.predicted).toLowerCase()}</strong>
                    <span>Cadence {row.cadence} · Heuristic score {row.confidence.toFixed(3)}</span>
                    <p>{row.rationale}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : <p>Choose another matrix cell to inspect evidence.</p>}
      </section>

      <section className="benchmark-panel benchmark-method" aria-labelledby="benchmark-method">
        <h3 id="benchmark-method">Dataset and methodology</h3>
        <p>{results.suite} contains {results.metrics.sample_count} labeled debits in {results.cases.length} scenarios across {results.merchant_keys} detector merchant keys. The unmodified V3 detector groups by normalized or aliased descriptor, then checks intervals and amounts. Each debit contributes one result.</p>
        <p>Fixture merchant keys are disjoint from the original corpus. This small suite was authored with knowledge of the detector and has no independently collected banking data. Scores describe these cases. Heuristic scores are rule outputs, not calibrated probabilities.</p>
        <p>Detector fingerprint <code>{results.detector_sha256.slice(0, 12)}</code> · Fixture fingerprint <code>{results.fixture_sha256.slice(0, 12)}</code></p>
      </section>
    </section>
  )
}
