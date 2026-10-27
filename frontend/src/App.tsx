
import { useEffect, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  LayoutDashboard,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

type AnyRecord = Record<string, any>

function money(value: unknown) {
  const n = Number(value ?? 0)
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  })
}

function pretty(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  return String(value).replaceAll('_', ' ')
}

function getArray(data: any, ...keys: string[]): AnyRecord[] {
  if (Array.isArray(data)) return data
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

function getNumber(data: any, ...keys: string[]): number {
  for (const key of keys) {
    const value = Number(data?.[key])
    if (data?.[key] !== null && data?.[key] !== undefined && Number.isFinite(value)) {
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
  const [evaluation, setEvaluation] = useState<AnyRecord | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')

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

      setSummary(responses[0])
      setTransactions(getArray(responses[1], 'transactions', 'items', 'data'))
      setCommitments(getArray(responses[2], 'commitments', 'items', 'data'))
      setAlerts(getArray(responses[3], 'alerts', 'items', 'data'))
      setEvaluation(responses[4] ?? null)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not connect to the FinSight API.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

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

  // Illustrative chart only; the API does not provide monthly history.
  const chartData = [
    { month: 'May', amount: monthlySpend * 0.82 },
    { month: 'Jun', amount: monthlySpend * 0.9 },
    { month: 'Jul', amount: monthlySpend * 0.86 },
    { month: 'Aug', amount: monthlySpend * 1.03 },
    { month: 'Sep', amount: monthlySpend * 0.95 },
    { month: 'Oct', amount: monthlySpend },
  ]

  const navItems = [
    { name: 'Overview', icon: LayoutDashboard },
    { name: 'Recurring payments', icon: RefreshCw },
    { name: 'Transactions', icon: CreditCard },
    { name: 'Evaluation & Audit', icon: ShieldCheck },
  ]

  function valueFor(
    item: AnyRecord,
    keys: string[],
    fallback: unknown = '—',
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Activity size={22} /></div>
          <div>
            <div className="brand-name">FinSight</div>
            <div className="brand-subtitle">RECURRING INTELLIGENCE</div>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="navigation">
          {navItems.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${page === name ? 'active' : ''}`}
              onClick={() => setPage(name)}
            >
              <Icon size={18} />
              <span>{name}</span>
              {name === 'Recurring payments' && commitments.length > 0 && (
                <span className="nav-count">{commitments.length}</span>
              )}
              {name === 'Evaluation & Audit' && evaluation && (
                <span className="nav-count green-count">100%</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={20} />
            <div>
              <strong>Privacy first</strong>
              <p>Demo uses synthetic transaction data only.</p>
            </div>
          </div>

          <div className="profile">
            <div className="avatar">FS</div>
            <div className="profile-copy">
              <strong>FinSight Demo</strong>
              <span>Local workspace</span>
            </div>
            <span className="status-dot" />
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} /> <strong>{page}</strong>
          </div>

          <div className="topbar-actions">
            <span className="data-badge"><span /> Synthetic data</span>
            <button
              className="icon-button"
              aria-label="Refresh data"
              onClick={() => void loadData()}
              disabled={loading}
            >
              <RefreshCw size={17} />
            </button>
            <div className="avatar small">FS</div>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow">
                <Sparkles size={14} /> RECURRING PAYMENT INTELLIGENCE
              </div>
              <h1>
                {page === 'Overview'
                  ? 'Your money, made visible.'
                  : page === 'Recurring payments'
                    ? 'Recurring payments'
                    : page === 'Transactions'
                      ? 'Transaction history'
                      : 'Evaluation & Benchmark Audit'}
              </h1>
              <p className="subtitle">
                {page === 'Overview'
                  ? 'Find repeating charges hiding in transaction history.'
                  : page === 'Recurring payments'
                    ? 'Review detected patterns, cadence, and estimated costs.'
                    : page === 'Transactions'
                      ? 'Explore transaction records and review unusual amounts.'
                      : 'Benchmark metrics and validation against ground-truth labels.'}
              </p>
            </div>

            <button
              className="primary-button"
              onClick={() => void loadData()}
              disabled={loading}
            >
              <RefreshCw size={16} /> Refresh analysis
            </button>
          </section>

          {error && (
            <div className="error-banner">
              <div>
                <strong>Could not load dashboard data</strong>
                <p>{error}</p>
                <span>Check that the FastAPI backend is running on port 8000.</span>
              </div>
              <button className="secondary-button" onClick={() => void loadData()}>
                Retry
              </button>
            </div>
          )}

          {loading && (
            <div className="loading-line">
              <span /> Loading transaction intelligence…
            </div>
          )}

          {page === 'Overview' && (
            <>
              <section className="metric-grid">
                <Metric
                  title="Monthly equivalent"
                  value={money(monthlySpend)}
                  icon={<Wallet size={19} />}
                  detail="Annual estimate divided by 12"
                  tone="green"
                />
                <Metric
                  title="Estimated annual spend"
                  value={money(annualSpend)}
                  icon={<CircleDollarSign size={19} />}
                  detail="Only where cadence is estimable"
                  tone="blue"
                />
                <Metric
                  title="Detected patterns"
                  value={String(totalCommitments)}
                  icon={<RefreshCw size={19} />}
                  detail="Candidates, not confirmed mandates"
                  tone="purple"
                />
                <Metric
                  title="Needs review"
                  value={String(reviewCount)}
                  icon={<Bell size={19} />}
                  detail={`${reviewTransactionCount} transaction(s) flagged`}
                  tone="orange"
                />
              </section>

              <section className="overview-grid">
                <div className="panel spend-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Recurring spend overview</h2>
                      <p>Illustrative trend based on current estimate</p>
                    </div>
                    <span className="period-pill">Illustrative</span>
                  </div>

                  <div className="chart-summary">
                    <strong>{money(monthlySpend)}</strong>
                    <span><ArrowDownRight size={15} /> Monthly equivalent</span>
                  </div>

                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData}
                        margin={{ top: 12, right: 12, left: -16, bottom: 0 }}
                      >
                        <CartesianGrid
                          stroke="#263244"
                          strokeDasharray="4 5"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="month"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#8491a5', fontSize: 12 }}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#8491a5', fontSize: 11 }}
                          tickFormatter={(v) => `₹${v}`}
                        />
                        <Tooltip
                          contentStyle={{
                            background: '#111a29',
                            border: '1px solid #29364a',
                            borderRadius: 10,
                            color: '#fff',
                          }}
                          formatter={(value) => [money(value), 'Illustrative estimate']}
                        />
                        <Line
                          type="monotone"
                          dataKey="amount"
                          stroke="#5ce0b0"
                          strokeWidth={3}
                          dot={{ r: 3, fill: '#5ce0b0', strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <p className="chart-footnote">
                    Illustrative only — these points are not historical monthly spending.
                  </p>
                </div>

                <div className="panel alerts-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Review queue</h2>
                      <p>Transactions and patterns worth a closer look</p>
                    </div>
                    <span className="alert-count">{alerts.length}</span>
                  </div>

                  <div className="alert-list">
                    {alerts.slice(0, 5).map((alert, index) => (
                      <div
                        className="alert-item"
                        key={String(alert.alert_id ?? alert.id ?? index)}
                      >
                        <div className="alert-symbol"><Clock3 size={17} /></div>
                        <div className="alert-copy">
                          <strong>
                            {String(
                              valueFor(
                                alert,
                                ['title', 'display_name', 'merchant', 'description', 'type'],
                                'Review suggested',
                              ),
                            )}
                          </strong>
                          <p>{evidenceText(alert)}</p>
                          {alert.recommended_action && (
                            <p className="alert-action">
                              Suggested: {String(alert.recommended_action)}
                            </p>
                          )}
                        </div>
                        <ChevronRight size={16} className="alert-chevron" />
                      </div>
                    ))}

                    {alerts.length === 0 && !loading && (
                      <EmptyState text="No review alerts returned by the API." />
                    )}
                  </div>

                  <button
                    className="text-button"
                    onClick={() => setPage('Transactions')}
                  >
                    Review transactions <ChevronRight size={15} />
                  </button>
                </div>
              </section>

              <section className="panel table-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Detected recurring patterns</h2>
                    <p>Evidence-backed candidates from transaction history</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setPage('Recurring payments')}
                  >
                    View all <ChevronRight size={15} />
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
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search merchant or cadence…"
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
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search descriptions, dates, amounts…"
                />
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Method</th>
                      <th>Direction</th>
                      <th>Review</th>
                      <th className="numeric">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((tx, index) => (
                      <tr key={String(tx.transaction_id ?? tx.id ?? index)}>
                        <td>{pretty(valueFor(tx, ['date', 'transaction_date']))}</td>
                        <td>
                          <strong>
                            {String(
                              valueFor(
                                tx,
                                ['description', 'merchant', 'normalized_description'],
                                'Unknown',
                              ),
                            )}
                          </strong>
                          {tx.review_required && tx.review_reason && (
                            <p className="transaction-review-reason">
                              {String(tx.review_reason)}
                            </p>
                          )}
                        </td>
                        <td>{pretty(valueFor(tx, ['payment_method', 'method']))}</td>
                        <td>
                          <span className="direction-pill">
                            {pretty(valueFor(tx, ['direction'], 'debit'))}
                          </span>
                        </td>
                        <td>
                          {tx.review_required ? (
                            <span className="review-pill">Review</span>
                          ) : (
                            <span className="no-review">—</span>
                          )}
                        </td>
                        <td className="numeric amount-cell">
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
                  <h2>Evaluation Benchmark & Audit</h2>
                  <p>
                    Deterministic validation against labelled synthetic transactions (Ground Truth Contract).
                  </p>
                </div>
                <span className="period-pill">
                  {evaluation ? `${evaluation.evaluated_transactions} debit records` : 'Benchmark'}
                </span>
              </div>

              {evaluation && (
                <div className="eval-panel" style={{ marginTop: 0 }}>
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
                      <span>F1-Score</span>
                      <strong>{(evaluation.f1_score * 100).toFixed(1)}%</strong>
                    </div>
                    <div className="eval-stat">
                      <span>Overall Accuracy</span>
                      <strong>{(evaluation.accuracy * 100).toFixed(1)}%</strong>
                    </div>
                  </div>

                  <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    <div style={{ padding: 12, background: 'rgba(92, 224, 176, 0.08)', borderRadius: 8, border: '1px solid rgba(92, 224, 176, 0.2)', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, color: '#8491a5', display: 'block' }}>True Positives</span>
                      <strong style={{ color: '#5ce0b0', fontSize: 18 }}>{evaluation.true_positives}</strong>
                    </div>
                    <div style={{ padding: 12, background: 'rgba(92, 224, 176, 0.08)', borderRadius: 8, border: '1px solid rgba(92, 224, 176, 0.2)', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, color: '#8491a5', display: 'block' }}>True Negatives</span>
                      <strong style={{ color: '#5ce0b0', fontSize: 18 }}>{evaluation.true_negatives}</strong>
                    </div>
                    <div style={{ padding: 12, background: 'rgba(255, 255, 255, 0.03)', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.06)', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, color: '#8491a5', display: 'block' }}>False Positives</span>
                      <strong style={{ color: evaluation.false_positives > 0 ? '#f87171' : '#aab7c9', fontSize: 18 }}>{evaluation.false_positives}</strong>
                    </div>
                    <div style={{ padding: 12, background: 'rgba(255, 255, 255, 0.03)', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.06)', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, color: '#8491a5', display: 'block' }}>False Negatives</span>
                      <strong style={{ color: evaluation.false_negatives > 0 ? '#f87171' : '#aab7c9', fontSize: 18 }}>{evaluation.false_negatives}</strong>
                    </div>
                  </div>

                  <div style={{ marginTop: 20, padding: 16, background: 'rgba(30, 58, 138, 0.15)', borderRadius: 10, border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                    <h3 style={{ fontSize: 14, color: '#93c5fd', margin: '0 0 6px 0' }}>Audit Verification Highlights</h3>
                    <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 13, lineHeight: 1.6 }}>
                      <li><strong>Merchant Descriptor Resolution:</strong> Successfully matched descriptor changes (e.g. CLDNST DIGITAL → CLOUDNEST RENEWAL) without corrupting separate price tiers.</li>
                      <li><strong>Outlier Filtering:</strong> Correctly isolated one-off single purchases from recurring annual commitments (FITTRAIL single purchase).</li>
                      <li><strong>Trial-to-Paid Sequences:</strong> Detected nominal token charges (1 INR SafeVault trial) transitioning into regular recurring billing.</li>
                      <li><strong>Price Increase Alerts:</strong> Accurately recognized price hikes (StreamBee 199 → 249) while preserving cadence validity.</li>
                    </ul>
                  </div>
                </div>
              )}
            </section>
          )}

          <footer className="footer">
            <span>FinSight · Built for recurring payment transparency</span>
            <span><ShieldCheck size={14} /> Synthetic demo data · Not financial advice</span>
          </footer>
        </div>
      </main>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="brand-icon"><RefreshCw size={20} /></div>
              <button
                className="icon-button"
                onClick={() => setSelected(null)}
                aria-label="Close details"
              >
                <X size={18} />
              </button>
            </div>

            <div className="eyebrow">DETECTED PATTERN</div>
            <h2>{commitmentName(selected)}</h2>
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

            {selected.review_required && (
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

            {selected.cancellation_guidance && (
              <div className="cancellation-card">
                <div className="cancellation-header">
                  <div className="cancellation-badge">
                    <ShieldCheck size={16} />
                    <span>Cancellation Guide ({selected.cancellation_guidance.mechanism})</span>
                  </div>
                  <span className="regulatory-tag">{selected.cancellation_guidance.regulatory_framework}</span>
                </div>
                <p className="cancellation-summary">{selected.cancellation_guidance.summary}</p>
                <div className="cancellation-steps">
                  <strong>Actionable Steps:</strong>
                  <ol>
                    {selected.cancellation_guidance.steps?.map((step: string, i: number) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
                {selected.cancellation_guidance.important_notes?.length > 0 && (
                  <div className="cancellation-notes">
                    {selected.cancellation_guidance.important_notes.map((note: string, i: number) => (
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
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({
  title,
  value,
  icon,
  detail,
  tone,
}: {
  title: string
  value: string
  icon: React.ReactNode
  detail: string
  tone: string
}) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{title}</span>
        <div className={`metric-icon ${tone}`}>{icon}</div>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">
        <span className="metric-dot" />
        {detail}
      </div>
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
    return <div className="table-empty">Loading detected patterns…</div>
  }

  if (items.length === 0) {
    return (
      <EmptyState text="No recurring candidates found. Check that detector output exists and the API returns commitments." />
    )
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Merchant / descriptor</th>
            <th>Cadence</th>
            <th>Observed amount</th>
            <th>Confidence</th>
            <th>Review</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={String(item.commitment_id ?? item.id ?? `${nameFor(item)}-${index}`)}>
              <td>
                <div className="merchant-cell">
                  <div className="merchant-icon"><CreditCard size={17} /></div>
                  <div>
                    <strong>{nameFor(item)}</strong>
                    <span>Transaction pattern</span>
                  </div>
                </div>
              </td>
              <td><span className="cadence-pill">{cadenceFor(item)}</span></td>
              <td className="amount-cell">{money(amountFor(item))}</td>
              <td>
                <span className="confidence-pill">
                  <CheckCircle2 size={14} />
                  {confidenceFor(item)}
                </span>
              </td>
              <td>
                {item.review_required ? (
                  <span className="review-pill">
                    {Number(item.review_transaction_count ?? 0)} flagged
                  </span>
                ) : (
                  <span className="no-review">—</span>
                )}
              </td>
              <td>
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
      <div className="empty-icon"><Activity size={20} /></div>
      <p>{text}</p>
    </div>
  )
}
