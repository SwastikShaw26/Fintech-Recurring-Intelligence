import { useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchGraphEvidence, type GraphEvidence } from '../services/graphEvidence'

type GraphState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; evidence: GraphEvidence }

export function GraphEvidencePanel({ api, analysisId, commitmentId, hosted, formatAmount }: {
  api: string
  analysisId?: string
  commitmentId: string
  hosted: boolean
  formatAmount: (amount: number) => string
}) {
  const { token } = useAuth()
  const [state, setState] = useState<GraphState | null>(null)
  const request = useRef<AbortController | null>(null)
  useLayoutEffect(() => () => request.current?.abort(), [])

  async function loadEvidence() {
    if (!analysisId || !commitmentId || hosted) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setState({ status: 'loading' })
    try {
      const evidence = await fetchGraphEvidence(api, analysisId, commitmentId, controller.signal, analysisId === 'demo' ? null : token)
      if (!controller.signal.aborted) setState({ status: 'ready', evidence })
    } catch (error) {
      if (!controller.signal.aborted) {
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not load graph evidence.' })
      }
    }
  }

  const evidence = state?.status === 'ready' ? state.evidence : null
  return (
    <section className="evidence-list" aria-labelledby="graph-evidence-heading">
      <h3 id="graph-evidence-heading">Relationship evidence</h3>
      {hosted ? <p>Graph evidence requires an account-scoped API for hosted statements.</p>
        : !analysisId ? <p>Import a statement to look up relationships for its detected commitments.</p>
          : <button type="button" className="secondary-button" disabled={state?.status === 'loading'}
            onClick={loadEvidence}>{state?.status === 'error' ? 'Retry graph evidence' : 'Load graph evidence'}</button>}
      {state?.status === 'loading' && <p role="status">Loading graph evidence…</p>}
      {state?.status === 'error' && <p role="alert">{state.message}</p>}
      {evidence && (
        <div aria-live="polite">
          <p>Evidence source: {evidence.source === 'neo4j' ? 'Neo4j'
            : analysisId === 'demo' ? 'Synthetic demo records'
              : evidence.source === 'memory' ? 'Current analysis cache' : 'Relationship evidence API'}</p>
          <p>{evidence.merchant.resolution_method === 'graph'
            ? <>Linked merchant: <strong>{evidence.merchant.display_name}</strong></>
            : 'Merchant link unresolved.'}</p>
          <h4>Statement descriptors</h4>
          {evidence.descriptors.length ? <ul>{evidence.descriptors.map(descriptor => <li key={descriptor}>{descriptor}</li>)}</ul>
            : <p>No descriptors recorded for this commitment.</p>}
          <h4>Supporting transactions</h4>
          {evidence.supporting_transactions.length ? (
            <ul>{evidence.supporting_transactions.map(row => (
              <li key={row.transaction_id}>{row.date} · {row.description} · {formatAmount(Math.abs(row.amount))}{row.direction ? ` · ${row.direction}` : ''}</li>
            ))}</ul>
          ) : <p>No supporting transactions found for this commitment.</p>}
          <p>Compare these transactions and statement descriptors to see which charges support the selected recurring pattern.</p>
        </div>
      )}
    </section>
  )
}
