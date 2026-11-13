
import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  Bell,
  CalendarDays,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { BenchmarkDashboard } from './components/BenchmarkDashboard'
import { RevocationTracker } from './components/RevocationTracker'
import { SubscriptionTimeline } from './components/SubscriptionTimeline'
import { emptyRevocationState, getStoredRevocationState, type RevocationState } from './components/revocationStorage'
import { StatementImport, type StatementData } from './components/StatementImport'
import { MerchantReview } from './components/MerchantReview'
import { SavedStatement } from './components/SavedStatement'
import { HostedWorkspace } from './components/HostedWorkspace'
import { revokeHostedSession } from './components/statementRequest'
import { ForecastPanel } from './components/ForecastPanel'
import { TransactionReview } from './components/TransactionReview'
import { LedgerAssistant } from './components/LedgerAssistant'
import { mandateFollowUp } from './components/mandateFollowUp'
import { buildCommitmentActivity } from './components/commitmentActivity'
import { CommitmentActivity } from './components/CommitmentActivityPanel'
import { prepareRevocationGuide } from './components/revocationGuide'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import './App.css'

gsap.registerPlugin(useGSAP)
const HOSTED = import.meta.env.VITE_FINSIGHT_HOSTED === 'true'
const API = HOSTED ? '' : (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')).replace(/\/+$/, '')

type AnyRecord = Record<string, unknown>
type CancellationGuidance = {
  mechanism: string
  regulatory_framework: string
  summary: string
  steps?: string[]
  important_notes?: string[]
}

function commitmentRevocation(item: AnyRecord, revocations: Record<string, RevocationState>, privateMode: boolean) {
  const guidance = item.cancellation_guidance as CancellationGuidance | undefined
  const guide = guidance && prepareRevocationGuide(guidance.mechanism, guidance.steps ?? [], [])
  const total = guide?.steps.length ?? 0
  const id = String(item.commitment_id ?? item.id ?? '')
  const state = revocations[id]?.totalSteps === total ? revocations[id] : privateMode
    ? emptyRevocationState(id, total) : getStoredRevocationState(id, total)
  return { state, total, reported: guide?.canReport === true && state.status === 'marked_revoked' }
}

function formatMoney(value: unknown, currency: unknown) {
  const n = Number(value ?? 0)
  if (currency === 'unspecified') return n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' units'
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: currency === 'GBP' || currency === 'USD' || currency === 'EUR' ? currency : 'INR',
    maximumFractionDigits: 2,
  })
}

function pretty(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not recorded'
  return String(value).replaceAll('_', ' ')
}

function getArray(data: unknown, ...keys: string[]): AnyRecord[] {
  const isRecord = (value: unknown): value is AnyRecord =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

  if (Array.isArray(data)) return data.filter(isRecord)
  for (const key of keys) {
    const value = isRecord(data) ? data[key] : undefined
    if (Array.isArray(value)) return value.filter(isRecord)
  }
  return []
}

function getNumber(data: AnyRecord, ...keys: string[]): number {
  for (const key of keys) {
    const rawValue = data[key]
    const value = Number(rawValue)
    if (rawValue !== null && rawValue !== undefined && Number.isFinite(value)) {
      return value
    }
  }
  return 0
}

function evidenceText(alert: AnyRecord): string {
  if (Array.isArray(alert.evidence)) {
    return alert.evidence.map(String).join(' ')
  }

  return String(
    alert.message ??
      alert.reason ??
      alert.detail ??
      'Review the transaction history before taking action.',
  )
}

export default function App() {
  const [page, setPage] = useState('Overview')
  const [demoSummary, setSummary] = useState<AnyRecord>({})
  const [demoTransactions, setTransactions] = useState<AnyRecord[]>([])
  const [demoCommitments, setCommitments] = useState<AnyRecord[]>([])
  const [demoAlerts, setAlerts] = useState<AnyRecord[]>([])
  const [statement, setStatement] = useState<StatementData | null>(null)
  const [hostedToken, setHostedToken] = useState('')
  const [hostedExpiresAt, setHostedExpiresAt] = useState('')
  const [hostedSession, setHostedSession] = useState(0)
  const [hostedSignOutError, setHostedSignOutError] = useState('')
  const activeHostedSession = useRef(0)
  const hostedConnected = useRef(false)
  const privateMode = statement !== null
  const summary = statement?.summary ?? demoSummary
  const money = (value: unknown) => formatMoney(value, summary.currency)
  const transactions = statement?.transactions ?? demoTransactions
  const commitments = statement?.commitments ?? demoCommitments
  const alerts = statement?.alerts ?? demoAlerts
  const [selected, setSelected] = useState<AnyRecord | null>(null)
  const [revocations, setRevocations] = useState<Record<string, RevocationState>>({})
  const modalRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!hostedExpiresAt) return
    const generation = activeHostedSession.current
    const timer = window.setTimeout(() => {
      if (activeHostedSession.current !== generation) return
      hostedConnected.current = false
      activeHostedSession.current += 1
      setHostedSession(activeHostedSession.current)
      setHostedToken('')
      setHostedExpiresAt('')
      setStatement(null)
      setSelected(null)
      setRevocations({})
      setSearch('')
      setPage('Import statement')
      setHostedSignOutError('Your hosted session expired. Connect again to continue.')
    }, Math.max(0, Date.parse(hostedExpiresAt) - Date.now()))
    return () => window.clearTimeout(timer)
  }, [hostedExpiresAt])

  function changeStatement(data: StatementData | null) {
    setStatement(data)
    setSelected(null)
    if (data?.analysis_id !== statement?.analysis_id) setRevocations({})
    setSearch('')
    setPage('Overview')
  }

  function updateMerchantLinks(previous: StatementData, next: StatementData) {
    const nextCommitments = new Map(next.commitments.map(item => [item.commitment_id, item]))
    const changed = new Set(previous.commitments.filter(item => {
      const updated = nextCommitments.get(item.commitment_id)
      return !updated || JSON.stringify(item.transaction_ids) !== JSON.stringify(updated.transaction_ids)
        || JSON.stringify(item.observed_descriptors) !== JSON.stringify(updated.observed_descriptors)
    }).map(item => String(item.commitment_id)))
    setRevocations((saved) => Object.fromEntries(Object.entries(saved).filter(([id]) => !changed.has(id))))
    setStatement((current) => current?.analysis_id === next.analysis_id
      ? { ...next, local_account: current.local_account } : current)
  }

  async function loadData(showLoading = true) {
    if (showLoading) {
      setLoading(true)
      setError('')
    }

    try {
      const endpoints = [
        `${API}/api/summary`,
        `${API}/api/transactions`,
        `${API}/api/commitments`,
        `${API}/api/alerts`,
      ]

      const responses = await Promise.all(
        endpoints.map(async (url) => {
          const response = await fetch(url)
          if (!response.ok) {
            throw new Error(`${response.status}: ${url}`)
          }
          return response.json()
        }),
      )

      setSummary(responses[0] as AnyRecord)
      setTransactions(getArray(responses[1], 'transactions', 'items', 'data'))
      setCommitments(getArray(responses[2], 'commitments', 'items', 'data'))
      setAlerts(getArray(responses[3], 'alerts', 'items', 'data'))
    } catch {
      setError('The dashboard could not retrieve the latest records. Check that the local data service is running, then try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') return
    // Initial loading synchronizes view state with the API response below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData(false)
  }, [])

  useGSAP(() => {
    if (!selected || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .from(modalRef.current, { opacity: 0, duration: 0.24 })
      .from('.detail-modal', { y: 24, scale: 0.985, duration: 0.35 }, '-=0.16')
      .from('.tracker-header', { opacity: 0, y: 12, duration: 0.3 }, '-=0.2')
      .from('.tracker-shield-col', { scale: 0.8, rotation: -9, duration: 0.48, ease: 'back.out(1.3)' }, '<')
      .from('.tracker-step-item', { opacity: 0, x: -10, stagger: 0.045, duration: 0.26 }, '-=0.18')
      .from('.tracker-progress-track', { opacity: 0, duration: 0.25 }, '<')
  }, { scope: modalRef, dependencies: [selected], revertOnUpdate: true })

  useEffect(() => {
    if (!selected) return

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    closeButtonRef.current?.focus()

    function handleDialogKeys(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelected(null)
        return
      }

      if (event.key !== 'Tab') return
      const focusable = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.detail-modal button:not(:disabled), .detail-modal a[href], .detail-modal input:not(:disabled), .detail-modal [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleDialogKeys)
    return () => {
      document.removeEventListener('keydown', handleDialogKeys)
      previouslyFocusedRef.current?.focus()
    }
  }, [selected])

  const filteredTransactions = transactions.filter((tx) =>
    Object.values(tx).some((value) =>
      String(value ?? '').toLowerCase().includes(search.toLowerCase()),
    ),
  )

  const filteredCommitments = commitments.filter((item) =>
    Object.values(item).some((value) =>
      String(value ?? '').toLowerCase().includes(search.toLowerCase()),
    ),
  )

  // The API exposes annualised estimates. Monthly equivalent is derived,
  // not historical monthly spending.
  const annualSpend = getNumber(summary, 'estimated_annual_cost')
  const monthlySpend = annualSpend / 12

  const totalCommitments = commitments.length
  const reviewCount = alerts.length
  const reviewTransactionCount = getNumber(
    summary,
    'review_required_transaction_count',
  )

  const navItems = [
    { name: 'Overview', icon: LayoutDashboard },
    { name: 'Recurring payments', icon: RefreshCw },
    { name: 'Transactions', icon: CreditCard },
    { name: 'Forecast', icon: CalendarDays },
    { name: 'Review', icon: Bell },
    { name: 'Ask FinSight', icon: Search },
    ...(import.meta.env.VITE_FINSIGHT_DEMO === 'true' ? [] : [{ name: 'Import statement', icon: CreditCard }]),
    { name: 'Evaluation & Audit', icon: ShieldCheck },
  ]

  function valueFor(
    item: AnyRecord,
    keys: string[],
    fallback: unknown = 'Not recorded',
  ) {
    for (const key of keys) {
      if (item[key] !== undefined && item[key] !== null) return item[key]
    }
    return fallback
  }

  function commitmentName(item: AnyRecord) {
    return String(
      valueFor(
        item,
        ['display_name', 'merchant', 'name', 'description', 'normalized_description', 'commitment_id'],
        'Unknown merchant',
      ),
    )
  }

  function commitmentAmount(item: AnyRecord) {
    return valueFor(
      item,
      ['typical_amount', 'amount', 'median_amount', 'estimated_amount'],
      0,
    )
  }

  function commitmentCadence(item: AnyRecord) {
    return pretty(valueFor(item, ['cadence', 'frequency', 'interval'], 'Recurring'))
  }

  function confidence(item: AnyRecord) {
    const value = valueFor(
      item,
      ['confidence_score', 'heuristic_confidence', 'confidence'],
      null,
    )

    if (value === null) return 'Heuristic'

    const n = Number(value)
    return Number.isFinite(n)
      ? `${Math.round(n <= 1 ? n * 100 : n)}%`
      : String(value)
  }

  const selectedGuidance = selected?.cancellation_guidance as CancellationGuidance | undefined
  const selectedId = String(selected?.commitment_id ?? selected?.id ?? '')
  const selectedRevocation = selected ? commitmentRevocation(selected, revocations, privateMode) : null
  const followUp = selected && selectedRevocation?.reported
    ? mandateFollowUp(transactions, selected.transaction_ids, selectedRevocation.state.lastUpdatedIso) : null
  const activity = selected ? buildCommitmentActivity(selected, transactions, alerts, followUp) : []
  const selectedGuide = selectedGuidance && prepareRevocationGuide(
    selectedGuidance.mechanism, selectedGuidance.steps ?? [], selectedGuidance.important_notes ?? [],
  )
  const pageLabel = page === 'Evaluation & Audit' ? 'Evaluation & audit' : page

  if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
    return (
      <main className="not-found">
        <p className="not-found-brand">FinSight</p>
        <h1>This page isn’t in the ledger.</h1>
        <p>FinSight is a single workspace for reviewing recurring payment evidence.</p>
        <a className="primary-button" href="/">Back to overview</a>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-name">FinSight</div>
          <div className="brand-subtitle">Payment evidence</div>
        </div>

        <nav className="navigation" aria-label="Main navigation">
          {navItems.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${page === name ? 'active' : ''}`}
              onClick={() => setPage(name)}
              aria-current={page === name ? 'page' : undefined}
              type="button"
            >
              <Icon size={18} strokeWidth={1.75} />
              <span>{name === 'Evaluation & Audit' ? 'Evaluation & audit' : name}</span>
              {name === 'Recurring payments' && commitments.length > 0 && (
                <span className="nav-count">{commitments.length}</span>
              )}
            </button>
          ))}
        </nav>

        <p className="sidebar-note">{privateMode ? 'Private workspace' : 'Demo workspace'}<br />{privateMode ? 'Statement in this tab' : 'Synthetic transaction records'}</p>
      </aside>

      <main className="main-area" id="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><strong>{pageLabel}</strong></div>

          <span className="data-source">{privateMode ? 'Private statement data' : 'Synthetic transaction data'}</span>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <h1>
                {page === 'Overview'
                  ? 'Recurring charges in your history.'
                  : page === 'Recurring payments'
                    ? 'Patterns found in your transactions.'
                    : page === 'Transactions'
                      ? 'Transaction history'
                      : page === 'Forecast' ? 'What could be due next?'
                      : page === 'Review' ? 'Which charges need a closer look?'
                      : page === 'Ask FinSight' ? 'What does your statement show?'
                      : page === 'Import statement' ? 'Private statement workspace' : 'How the detector performed'}
              </h1>
              <p className="subtitle">
                {page === 'Overview'
                  ? 'Estimated costs, observed amounts, and the patterns that need review.'
                  : page === 'Recurring payments'
                    ? 'Compare the observed amounts and cadence behind each candidate.'
                    : page === 'Transactions'
                      ? 'Transaction records with detector review flags.'
                      : page === 'Forecast' ? 'Review projected charges and compare cancellation scenarios.'
                      : page === 'Review' ? 'Inspect the statement evidence behind each review signal.'
                      : page === 'Ask FinSight' ? 'Explore supported questions about forecasts and review signals.'
                      : page === 'Import statement' ? 'Preview and analyze your own transaction history.'
                        : 'Precision, recall, and error counts against labelled synthetic records.'}
              </p>
            </div>

            {privateMode ? <button type="button" className="secondary-button" onClick={() => changeStatement(null)}>Clear private statement</button>
            : page !== 'Import statement' && <button
              className="primary-button"
              onClick={() => void loadData()}
              disabled={loading}
              type="button"
            >
              <RefreshCw size={16} /> {loading ? 'Refreshing' : 'Refresh analysis'}
            </button>}
            {HOSTED && hostedToken && <button type="button" className="secondary-button" onClick={() => {
              hostedConnected.current = false
              activeHostedSession.current += 1
              const generation = activeHostedSession.current
              setHostedSession(generation)
              setHostedToken('')
              setHostedExpiresAt('')
              setHostedSignOutError('')
              changeStatement(null)
              setPage('Import statement')
              void revokeHostedSession(hostedToken).catch(() => {
                if (activeHostedSession.current === generation && !hostedConnected.current) {
                  setHostedSignOutError('Signed out of this tab. The server could not confirm revocation. That session may remain active until it expires.')
                }
              })
            }}>Sign out of hosted workspace</button>}
          </section>

          {!privateMode && page !== 'Import statement' && error && (
            <div className="error-banner" role="alert">
              <div>
                <strong>Dashboard data is unavailable</strong>
                <p>{error}</p>
                <span>Start the local data service, then retry.</span>
              </div>
              <button className="secondary-button" onClick={() => void loadData()} disabled={loading} type="button">
                Retry
              </button>
            </div>
          )}

          {!privateMode && page !== 'Import statement' && loading && (
            <div className="loading-line" role="status" aria-live="polite">
              <span aria-hidden="true" /> Loading transaction data
            </div>
          )}

          {page === 'Overview' && (
            <>
              <section className="summary-ledger" aria-label="Recurring payment summary">
                <div className="lead-amount">
                  <span className="stat-label">Estimated monthly equivalent</span>
                  <strong>{money(monthlySpend)}</strong>
                  <span className="stat-note">Annual estimate divided by 12</span>
                </div>
                <dl className="summary-facts">
                  <div>
                    <dt>Estimated annual cost</dt>
                    <dd>{money(annualSpend)}<span>Where cadence can be estimated</span></dd>
                  </div>
                  <div>
                    <dt>Detected patterns</dt>
                    <dd>{totalCommitments}<span>Candidates from transaction history</span></dd>
                  </div>
                  <div>
                    <dt>Transactions flagged</dt>
                    <dd>{reviewTransactionCount}<span>{reviewCount} review items</span></dd>
                  </div>
                </dl>
              </section>

              <SubscriptionTimeline
                formatAmount={money}
                commitments={commitments}
                transactions={transactions}
                loading={loading}
                nameFor={commitmentName}
                cadenceFor={commitmentCadence}
                reportedFor={(item) => commitmentRevocation(item, revocations, privateMode).reported}
                onSelect={setSelected}
              />

              <section className="overview-grid">
                <section className="panel ledger-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Detected patterns</h2>
                      <p>Transaction evidence behind each recurring candidate</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setPage('Recurring payments')}
                      type="button"
                    >
                      View all
                    </button>
                  </div>
                  <CommitmentTable
                    items={commitments.slice(0, 5)}
                    revocations={revocations}
                    privateMode={privateMode}
                    loading={loading}
                    onSelect={setSelected}
                    nameFor={commitmentName}
                    amountFor={(item) => money(commitmentAmount(item))}
                    cadenceFor={commitmentCadence}
                    confidenceFor={confidence}
                  />
                </section>

                <section className="panel alerts-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Needs a closer look</h2>
                      <p>Flags from the transaction detector</p>
                    </div>
                    <span className="alert-count">{alerts.length}</span>
                  </div>
                  <div className="alert-list">
                    {alerts.slice(0, 5).map((alert, index) => (
                      <div className="alert-item" key={String(alert.alert_id ?? alert.id ?? index)}>
                        <div className="alert-copy">
                          <strong>
                            {String(valueFor(
                              alert,
                              ['title', 'display_name', 'merchant', 'description', 'type'],
                              'Review suggested',
                            ))}
                          </strong>
                          <p>{evidenceText(alert)}</p>
                          {Boolean(alert.recommended_action) && (
                            <p className="alert-action">
                              Next check: {String(alert.recommended_action)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {loading && alerts.length === 0 && (
                      <div className="alert-skeletons" role="status" aria-label="Loading review items">
                        <span /><span /><span />
                      </div>
                    )}
                    {alerts.length === 0 && !loading && (
                      <EmptyState text="No unusual transactions need review." />
                    )}
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setPage('Review')}
                    type="button"
                  >
                    See all review signals
                  </button>
                </section>
              </section>
            </>
          )}

          {page === 'Recurring payments' && (
            <section className="panel table-panel full-panel">
              <div className="panel-heading">
                <div>
                  <h2>Detected recurring patterns</h2>
                  <p>
                    Statistical candidates, not proof of active subscriptions or mandates.
                  </p>
                </div>
                <span className="period-pill">
                  {filteredCommitments.length} patterns
                </span>
              </div>

              <div className="search-box">
                <Search size={17} />
                <input
                  type="search"
                  aria-label="Search recurring payments"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search merchant or cadence"
                />
              </div>

              <CommitmentTable
                items={filteredCommitments}
                revocations={revocations}
                privateMode={privateMode}
                loading={loading}
                onSelect={setSelected}
                nameFor={commitmentName}
                amountFor={(item) => money(commitmentAmount(item))}
                cadenceFor={commitmentCadence}
                confidenceFor={confidence}
              />
            </section>
          )}

          {page === 'Transactions' && (
            <section className="panel table-panel full-panel">
              <div className="panel-heading">
                <div>
                  <h2>All transactions</h2>
                  <p>
                    {privateMode ? 'Imported' : 'Synthetic'} records with detector review flags where available.
                  </p>
                </div>
                <span className="period-pill">
                  {filteredTransactions.length} records
                </span>
              </div>

              <div className="search-box">
                <Search size={17} />
                <input
                  type="search"
                  aria-label="Search transactions"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search descriptions, dates, or amounts"
                />
              </div>

              <div className="table-scroll">
                <table className="transaction-table" aria-label="Transactions">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Description</th>
                      <th scope="col">Method</th>
                      <th scope="col">Direction</th>
                      <th scope="col">Review</th>
                      <th className="numeric" scope="col">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((tx, index) => (
                      <tr key={String(tx.transaction_id ?? tx.id ?? index)}>
                        <td data-label="Date">{pretty(valueFor(tx, ['date', 'transaction_date']))}</td>
                        <td data-label="Description">
                          <strong>
                            {String(
                              valueFor(
                                tx,
                                ['description', 'merchant', 'normalized_description'],
                                'Unknown',
                              ),
                            )}
                          </strong>
                          {Boolean(tx.review_required && tx.review_reason) && (
                            <p className="transaction-review-reason">
                              {String(tx.review_reason)}
                            </p>
                          )}
                        </td>
                        <td data-label="Method">{pretty(valueFor(tx, ['payment_method', 'method']))}</td>
                        <td data-label="Direction">
                          <span className="direction-pill">
                            {pretty(valueFor(tx, ['direction'], 'debit'))}
                          </span>
                        </td>
                        <td data-label="Review">
                          {tx.refund_status === 'matched_credit' || tx.refund_status === 'matched_debit' ? (
                            <span className="review-pill" title="A single same-amount debit matched this labeled credit within 30 days.">
                              {tx.refund_status === 'matched_credit' ? 'Possible refund' : 'Possible refunded debit'}
                            </span>
                          ) : tx.refund_status === 'review' ? (
                            <span className="review-pill">Review refund credit</span>
                          ) : null}
                          {tx.review_required ? (
                            <span className="review-pill">Review</span>
                          ) : !tx.refund_status ? (
                            <span className="no-review">Not flagged</span>
                          ) : null}
                        </td>
                        <td data-label="Amount" className="numeric amount-cell">
                          {money(valueFor(tx, ['amount'], 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredTransactions.length === 0 && !loading && (
                  <EmptyState text="No transactions match this search." />
                )}
              </div>
            </section>
          )}

          {page === 'Evaluation & Audit' && <BenchmarkDashboard />}
          {page === 'Review' && <TransactionReview key={statement?.analysis_id ?? 'demo'}
            alerts={alerts} transactions={transactions} commitments={commitments} formatAmount={money} onSelect={setSelected} />}
          {page === 'Ask FinSight' && <LedgerAssistant key={statement?.analysis_id ?? 'demo'}
            alerts={alerts} transactions={transactions} commitments={commitments}
            formatAmount={money} nameFor={commitmentName} onSelect={setSelected} onNavigate={setPage} />}
          {page === 'Forecast' && (
            <ForecastPanel key={statement?.analysis_id ?? 'demo'} commitments={commitments} transactions={transactions}
              nameFor={commitmentName} formatAmount={money}
              reportedFor={(item) => commitmentRevocation(item, revocations, privateMode).reported}
              onSelect={setSelected} />
          )}
          {page === 'Import statement' && (
            <>
              {HOSTED && hostedSignOutError && <div role="alert" className="error-banner"><p>{hostedSignOutError}</p></div>}
              {(!HOSTED || hostedToken) && <StatementImport api={API} existing={statement} hostedToken={hostedToken} onAnalyze={(next) => {
                if (HOSTED && hostedSession !== activeHostedSession.current) return
                if (statement?.analysis_id === next.analysis_id) {
                  updateMerchantLinks(statement, next)
                  setSearch('')
                  setPage('Overview')
                } else {
                  changeStatement(next)
                }
              }} />}
              {statement && <MerchantReview key={`merchant-${statement.analysis_id}`} api={API} statement={statement}
                hostedToken={hostedToken}
                onAnalyze={(next) => {
                  if (!HOSTED || hostedSession === activeHostedSession.current) updateMerchantLinks(statement, next)
                }} />}
              {HOSTED ? <HostedWorkspace key={hostedSession} token={hostedToken}
                statement={statement}
                onConnect={(token, expiresAt) => {
                  if (hostedSession !== activeHostedSession.current) return
                  hostedConnected.current = true
                  setHostedToken(token)
                  setHostedExpiresAt(expiresAt)
                  setHostedSignOutError('')
                }}
                onRestore={next => {
                  if (hostedSession === activeHostedSession.current) changeStatement(next)
                }} />
                : <SavedStatement key={`saved-${statement?.analysis_id ?? 'unsaved'}`} api={API} statement={statement} onRestore={changeStatement}
                onSaved={(analysisId, account) => setStatement(current => current?.analysis_id === analysisId
                  ? { ...current, local_account: account } : current)} />}
            </>
          )}
          {page === 'Overview' && !!statement?.duplicate_rows && (
            <p className="evidence-note" role="status">Combined statement exports. Skipped {statement.duplicate_rows} matching rows.</p>
          )}

          <footer className="footer">
            {privateMode ? (HOSTED ? 'This analysis is open in your hosted workspace.' : 'Private results are held in this tab.') : 'Synthetic demo records.'} Detected patterns are estimates, not proof of an active payment mandate.
          </footer>
        </div>
      </main>

      {selected && (
        <div ref={modalRef} className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelected(null)
        }}>
          <section
            className="detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
          >
            <div className="modal-header">
              <p>Pattern record</p>
              <button
                className="icon-button"
                onClick={() => setSelected(null)}
                aria-label="Close details"
                ref={closeButtonRef}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <h2 id="detail-title">{commitmentName(selected)}</h2>
            <p className="modal-description">
              This pattern was inferred from transaction history. It does not
              establish whether a subscription or payment mandate is currently active.
            </p>

            <div className="detail-stats">
              <div>
                <span>Typical observed amount</span>
                <strong>{money(commitmentAmount(selected))}</strong>
              </div>
              <div>
                <span>Detected cadence</span>
                <strong>{commitmentCadence(selected)}</strong>
              </div>
              <div>
                <span>Heuristic indicator</span>
                <strong>{confidence(selected)}</strong>
              </div>
            </div>

            {Boolean(selected.review_required) && (
              <div className="review-detail-note">
                <Bell size={18} />
                <span>
                  {Number(selected.review_transaction_count ?? 0)} transaction(s)
                  in this pattern need review. Check the transaction evidence before
                  drawing conclusions.
                </span>
              </div>
            )}

            {Array.isArray(selected.evidence) && selected.evidence.length > 0 && (
              <div className="evidence-list">
                <strong>Detection evidence</strong>
                <ul>
                  {selected.evidence.map((item: unknown, index: number) => (
                    <li key={index}>{String(item)}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedGuidance?.summary && <p className="tracker-summary">{selectedGuidance.summary}</p>}
            {selectedGuide && selectedGuide.steps.length > 0 && selectedId && (
              <RevocationTracker
                key={selectedId}
                commitmentId={selectedId}
                merchantName={commitmentName(selected)}
                paymentMethod={selectedGuidance?.mechanism || 'Payment guidance'}
                steps={selectedGuide.steps}
                canReport={selectedGuide.canReport}
                persist={!privateMode}
                importantNotes={selectedGuide.notes}
                initialState={revocations[selectedId]?.totalSteps === selectedGuide.steps.length
                  ? revocations[selectedId] : undefined}
                onStatusChange={(state) => setRevocations((previous) => ({ ...previous, [selectedId]: state }))}
              />
            )}

            <CommitmentActivity events={activity} currency={summary.currency} formatAmount={money} />
            <div className="evidence-note">
              <ShieldCheck size={18} />
              <span>
                Verify current payment status with your bank, UPI app, card issuer,
                or merchant account before taking action.
              </span>
            </div>

            <button
              className="primary-button modal-button"
              onClick={() => setSelected(null)}
            >
              Done
            </button>
          </section>
        </div>
      )}
    </div>
  )
}

function CommitmentTable({
  items,
  revocations,
  privateMode,
  loading,
  onSelect,
  nameFor,
  amountFor,
  cadenceFor,
  confidenceFor,
}: {
  items: AnyRecord[]
  revocations: Record<string, RevocationState>
  privateMode: boolean
  loading: boolean
  onSelect: (item: AnyRecord) => void
  nameFor: (item: AnyRecord) => string
  amountFor: (item: AnyRecord) => string
  cadenceFor: (item: AnyRecord) => string
  confidenceFor: (item: AnyRecord) => string
}) {
  if (loading && items.length === 0) {
    return (
      <div className="table-loading" role="status" aria-label="Loading recurring patterns">
        {[0, 1, 2].map((row) => (
          <div className="skeleton-row" key={row} aria-hidden="true">
            <span className="skeleton-marker" />
            <span className="skeleton-line" />
            <span className="skeleton-line short" />
            <span className="skeleton-line medium" />
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState text="No recurring patterns were detected in these records." />
    )
  }

  return (
    <div className="table-scroll">
      <table aria-label="Detected recurring payment patterns">
        <thead>
          <tr>
            <th scope="col">Merchant / descriptor</th>
            <th scope="col">Cadence</th>
            <th scope="col">Observed amount</th>
            <th scope="col">Confidence</th>
            <th scope="col">Mandate tracking</th>
            <th scope="col"><span className="sr-only">Details</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={String(item.commitment_id ?? item.id ?? `${nameFor(item)}-${index}`)}>
              <td data-label="Merchant">
                <div className="merchant-cell">
                  <div>
                    <strong>{nameFor(item)}</strong>
                    <span>From transaction history</span>
                  </div>
                </div>
              </td>
              <td data-label="Cadence"><span className="cadence-pill">{cadenceFor(item)}</span></td>
              <td data-label="Observed amount" className="amount-cell">{amountFor(item)}</td>
              <td data-label="Confidence">
                <span className="confidence-pill">
                  <CheckCircle2 size={14} />
                  {confidenceFor(item)}
                </span>
              </td>
              <td data-label="Mandate tracking">
                {(() => {
                  const { state: revState, total, reported } = commitmentRevocation(item, revocations, privateMode)
                  if (reported) {
                    return (
                      <span className="revocation-pill pill-revoked">
                        Marked as revoked (user-reported)
                      </span>
                    )
                  }
                  if (revState.status === 'in_progress') {
                    return (
                      <span className="revocation-pill pill-progress">
                        {revState.completedIndices.length === total
                          ? 'Checklist complete'
                          : <>Tracking ({revState.completedIndices.length}/{total})</>}
                      </span>
                    )
                  }
                  return item.review_required ? null : <span className="no-review">Detected pattern</span>
                })()}
                {Boolean(item.review_required) && (
                  <span className="review-pill mandate-review-pill">
                    {Number(item.review_transaction_count ?? 0)} flagged
                  </span>
                )}
              </td>
              <td data-label="Details">
                <button
                  className="row-button"
                  onClick={() => onSelect(item)}
                  aria-label={`View ${nameFor(item)}`}
                >
                  <ChevronRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <p>{text}</p>
    </div>
  )
}
