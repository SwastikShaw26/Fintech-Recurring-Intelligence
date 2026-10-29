
import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  Bell,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import './App.css'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

type AnyRecord = Record<string, unknown>
type Evaluation = {
  precision: number
  recall: number
  f1_score: number
  accuracy: number
  true_positives: number
  true_negatives: number
  false_positives: number
  false_negatives: number
  evaluated_transactions: number
}
type CancellationGuidance = {
  mechanism: string
  regulatory_framework: string
  summary: string
  steps?: string[]
  important_notes?: string[]
}

function money(value: unknown) {
  const n = Number(value ?? 0)
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
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
  const [summary, setSummary] = useState<AnyRecord>({})
  const [transactions, setTransactions] = useState<AnyRecord[]>([])
  const [commitments, setCommitments] = useState<AnyRecord[]>([])
  const [alerts, setAlerts] = useState<AnyRecord[]>([])
  const [selected, setSelected] = useState<AnyRecord | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

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
        `${API}/api/evaluation`,
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
      setEvaluation((responses[4] as Evaluation | null) ?? null)
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

        <p className="sidebar-note">Demo workspace<br />Synthetic transaction records</p>
      </aside>

      <main className="main-area" id="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><strong>{pageLabel}</strong></div>

          <span className="data-source">Synthetic transaction data</span>
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
                      : 'How the detector performed'}
              </h1>
              <p className="subtitle">
                {page === 'Overview'
                  ? 'Estimated costs, observed amounts, and the patterns that need review.'
                  : page === 'Recurring payments'
                    ? 'Compare the observed amounts and cadence behind each candidate.'
                    : page === 'Transactions'
                      ? 'Synthetic transaction records with detector review flags.'
                      : 'Precision, recall, and error counts against labelled records.'}
              </p>
            </div>

            <button
              className="primary-button"
              onClick={() => void loadData()}
              disabled={loading}
              type="button"
            >
              <RefreshCw size={16} /> {loading ? 'Refreshing' : 'Refresh analysis'}
            </button>
          </section>

          {error && (
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

          {loading && (
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
                    loading={loading}
                    onSelect={setSelected}
                    nameFor={commitmentName}
                    amountFor={commitmentAmount}
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
                    onClick={() => setPage('Transactions')}
                    type="button"
                  >
                    Review transactions
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
                loading={loading}
                onSelect={setSelected}
                nameFor={commitmentName}
                amountFor={commitmentAmount}
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
                    Synthetic records with detector review flags where available.
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
                          {tx.review_required ? (
                            <span className="review-pill">Review</span>
                          ) : (
                            <span className="no-review">Not flagged</span>
                          )}
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

          {page === 'Evaluation & Audit' && (
            <section className="panel table-panel full-panel">
              <div className="panel-heading">
                <div>
                  <h2>Detector evaluation</h2>
                  <p>
                    Results against labelled synthetic transactions.
                  </p>
                </div>
                <span className="period-pill">
                  {evaluation ? `${evaluation.evaluated_transactions} debit records` : 'Benchmark'}
                </span>
              </div>

              {evaluation && (
                <div className="eval-panel">
                  <div className="eval-grid">
                    <div className="eval-stat">
                      <span>Precision</span>
                      <strong>{(evaluation.precision * 100).toFixed(1)}%</strong>
                    </div>
                    <div className="eval-stat">
                      <span>Recall</span>
                      <strong>{(evaluation.recall * 100).toFixed(1)}%</strong>
                    </div>
                    <div className="eval-stat">
                      <span>F1 score</span>
                      <strong>{(evaluation.f1_score * 100).toFixed(1)}%</strong>
                    </div>
                    <div className="eval-stat">
                      <span>Accuracy</span>
                      <strong>{(evaluation.accuracy * 100).toFixed(1)}%</strong>
                    </div>
                  </div>

                  <div className="audit-breakdown">
                    <div className="audit-count">
                      <span>True positives</span>
                      <strong>{evaluation.true_positives}</strong>
                    </div>
                    <div className="audit-count">
                      <span>True negatives</span>
                      <strong>{evaluation.true_negatives}</strong>
                    </div>
                    <div className={`audit-count ${evaluation.false_positives > 0 ? 'error' : ''}`}>
                      <span>False positives</span>
                      <strong>{evaluation.false_positives}</strong>
                    </div>
                    <div className={`audit-count ${evaluation.false_negatives > 0 ? 'error' : ''}`}>
                      <span>False negatives</span>
                      <strong>{evaluation.false_negatives}</strong>
                    </div>
                  </div>

                  <div className="audit-highlights">
                    <h3>Cases covered by the benchmark</h3>
                    <ul>
                      <li><strong>Changing merchant names:</strong> CLDNST DIGITAL and CLOUDNEST RENEWAL remain linked without merging separate price tiers.</li>
                      <li><strong>One-off purchases:</strong> A FITTRAIL single purchase stays separate from annual recurring charges.</li>
                      <li><strong>Trial charges:</strong> A ₹1 SafeVault token charge is followed through to regular billing.</li>
                      <li><strong>Price changes:</strong> StreamBee’s ₹199 to ₹249 increase is flagged while the monthly cadence remains intact.</li>
                    </ul>
                  </div>
                </div>
              )}
              {!evaluation && !loading && (
                <EmptyState text="No benchmark results are available for these records." />
              )}
            </section>
          )}

          <footer className="footer">
            Synthetic records only. Detected patterns are estimates, not proof of an active payment mandate.
          </footer>
        </div>
      </main>

      {selected && (
        <div className="modal-backdrop" onMouseDown={(event) => {
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

            {selectedGuidance && (
              <div className="cancellation-card">
                <div className="cancellation-header">
                  <div className="cancellation-badge">
                    <ShieldCheck size={16} />
                    <span>Cancellation guidance · {selectedGuidance.mechanism}</span>
                  </div>
                  <span className="regulatory-tag">{selectedGuidance.regulatory_framework}</span>
                </div>
                <p className="cancellation-summary">{selectedGuidance.summary}</p>
                <div className="cancellation-steps">
                  <strong>What to do</strong>
                  <ol>
                    {selectedGuidance.steps?.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
                {selectedGuidance.important_notes && selectedGuidance.important_notes.length > 0 && (
                  <div className="cancellation-notes">
                    {selectedGuidance.important_notes.map((note, i) => (
                      <p key={i}>• {note}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

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
  loading,
  onSelect,
  nameFor,
  amountFor,
  cadenceFor,
  confidenceFor,
}: {
  items: AnyRecord[]
  loading: boolean
  onSelect: (item: AnyRecord) => void
  nameFor: (item: AnyRecord) => string
  amountFor: (item: AnyRecord) => unknown
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
            <th scope="col">Review</th>
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
              <td data-label="Observed amount" className="amount-cell">{money(amountFor(item))}</td>
              <td data-label="Confidence">
                <span className="confidence-pill">
                  <CheckCircle2 size={14} />
                  {confidenceFor(item)}
                </span>
              </td>
              <td data-label="Review">
                {item.review_required ? (
                  <span className="review-pill">
                    {Number(item.review_transaction_count ?? 0)} flagged
                  </span>
                ) : (
                  <span className="no-review">Not flagged</span>
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
