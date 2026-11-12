import { useEffect, useRef, useState } from 'react'
import type { StatementData } from './StatementImport'
import { downloadStatement, openHostedSession, requestHostedStatement, revokeHostedSession, statementSnapshot } from './statementRequest'

interface HostedCopy {
  statement_id: string
  name?: string
  version: number
  start_date?: string
  end_date?: string
  period_source?: 'observed' | 'declared'
  currency?: string
  saved_at?: string
  expires_at: string
}

interface HostedComparison {
  start_date: string
  end_date: string
  includes_observed_period: boolean
  groups: {
    currency: string
    statements: {
      statement_id: string
      name: string
      transaction_count: number
      debits: string
      credits: string
      net_outflow: string
    }[]
  }[]
}

function copyLabel(copy: HostedCopy | undefined, id: string) {
  return copy?.name ? `${copy.name} · v${copy.version}` : id
}

export function HostedWorkspace({ token, statement, onConnect, onRestore }: {
  token: string
  statement: StatementData | null
  onConnect: (token: string, expiresAt: string) => void
  onRestore: (statement: StatementData) => void
}) {
  const pending = useRef<AbortController | null>(null)
  const credentialInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [ids, setIds] = useState<string[]>([])
  const [history, setHistory] = useState<Record<string, HostedCopy>>({})
  const [nextCursor, setNextCursor] = useState<string>()
  const [selected, setSelected] = useState('')
  const [days, setDays] = useState(30)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saveMode, setSaveMode] = useState('new')
  const [comparisonIds, setComparisonIds] = useState<string[]>([])
  const [comparison, setComparison] = useState<HostedComparison>()
  const selectedCopy = history[selected]
  useEffect(() => () => pending.current?.abort(), [])

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await action(controller.signal)
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Hosted request failed.')
    } finally {
      pending.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  async function list(credential: string, signal: AbortSignal, cursor?: string) {
    const result = await requestHostedStatement<{ statement_ids: string[]; history: HostedCopy[]; next_cursor?: string }>(
      credential, { action: 'list', cursor, include_history: true }, signal,
    )
    if (!signal.aborted) {
      setIds(result.statement_ids)
      setHistory(previous => ({
        ...Object.fromEntries(comparisonIds.flatMap(id => previous[id] ? [[id, previous[id]]] : [])),
        ...Object.fromEntries(result.history.map(copy => [copy.statement_id, copy])),
      }))
      setNextCursor(result.next_cursor)
      setSelected(previous => result.statement_ids.includes(previous) ? previous : (result.statement_ids[0] ?? ''))
      if (cursor && !result.statement_ids.length) setStatus('No more active copies. Refresh to return to the first page.')
    }
  }

  function removeFromComparison(id: string) {
    setComparisonIds(previous => previous.filter(item => item !== id))
    setComparison(undefined)
  }

  function saveCopy() {
    if (!statement) return
    const predecessor = saveMode === 'new' ? undefined : selected
    const replace = saveMode === 'replace'
    if (saveMode !== 'new' && !predecessor) return
    const confirmation = replace
      ? 'Replace the selected hosted copy with this new version? The selected copy will be deleted when the new copy is saved.'
      : `Save a new encrypted copy of mapped financial records on the hosted server for ${days} days?`
    if (!window.confirm(confirmation)) return
    void run(async signal => {
      const effectiveName = name.trim() || (predecessor ? history[predecessor]?.name : undefined)
      const saved = await requestHostedStatement<{ statement_id: string; expires_at: string }>(token, {
        action: 'save', save_confirmed: true, retention_days: days, statement: statementSnapshot(statement),
        name: effectiveName,
        start_date: startDate || undefined, end_date: endDate || undefined,
        predecessor_id: predecessor, replace, replace_confirmed: replace,
      }, signal)
      if (signal.aborted) return
      const { statement_id: id, expires_at } = saved
      const observed = statement.transactions.map(row => String(row.date)).sort()
      setIds(previous => [...previous.filter(item => !replace || item !== predecessor), id])
      setHistory(previous => ({ ...previous, [id]: {
        statement_id: id, expires_at, name: effectiveName,
        version: predecessor ? (previous[predecessor]?.version ?? 1) + 1 : 1,
        start_date: startDate || observed[0], end_date: endDate || observed.at(-1),
        period_source: startDate ? 'declared' : 'observed',
        currency: String(statement.summary.currency),
      } }))
      if (replace && predecessor) removeFromComparison(predecessor)
      setSelected(id)
      setStatus(`Hosted copy saved. Access expires ${new Date(expires_at).toLocaleString()}.`)
    })
  }

  return (
    <section className="panel statement-import ledger-assistant" aria-labelledby="hosted-workspace-title">
      <h2 id="hosted-workspace-title">Hosted workspace</h2>
      {token ? <>
        <p>Saved statements belong to your credential. You can restore or delete any active saved copy.</p>
        {statement && <p>Provide both dates to declare statement coverage, or leave both blank to use observed transaction dates.</p>}
        <div className="statement-mapping">
          <label>Saved hosted statement
            <select disabled={busy || !ids.length} value={selected} onChange={event => setSelected(event.target.value)}>
              {ids.length ? ids.map(id => <option key={id} value={id}>{copyLabel(history[id], id)}</option>) : <option value="">No statements listed</option>}
            </select>
          </label>
          {statement && <label>Keep saved copy for
            <select disabled={busy} value={days} onChange={event => setDays(Number(event.target.value))}>
              {[1, 7, 30, 90].map(value => <option key={value} value={value}>{value} days</option>)}
            </select>
          </label>}
          {statement && <>
            <label>Snapshot name
              <input disabled={busy} value={name} maxLength={80} onChange={event => setName(event.target.value)} />
            </label>
            <label>Save as
              <select disabled={busy} value={saveMode} onChange={event => setSaveMode(event.target.value)}>
                <option value="new">New snapshot history</option>
                <option value="version" disabled={!selected}>Next version of selected copy</option>
                <option value="replace" disabled={!selected}>Replace selected copy</option>
              </select>
            </label>
            <label>Statement start (optional)
              <input type="date" disabled={busy} value={startDate} onChange={event => setStartDate(event.target.value)} />
            </label>
            <label>Statement end (optional)
              <input type="date" disabled={busy} value={endDate} onChange={event => setEndDate(event.target.value)} />
            </label>
          </>}
        </div>
        {selectedCopy && <p>
          Version {selectedCopy.version}
          {selectedCopy.start_date && selectedCopy.end_date
            ? ` · ${selectedCopy.period_source === 'declared' ? 'Declared' : 'Observed'} period ${selectedCopy.start_date} to ${selectedCopy.end_date}`
            : ' · Period metadata unavailable for this copy'}
          {selectedCopy.currency ? ` · ${selectedCopy.currency === 'unspecified' ? 'Currency unspecified' : selectedCopy.currency}` : ''}
        </p>}
        <div className="statement-actions">
          <button className="secondary-button" type="button" disabled={busy}
            onClick={() => void run(signal => list(token, signal))}>Refresh hosted statements</button>
          {nextCursor && <button className="secondary-button" type="button" disabled={busy}
            onClick={() => void run(signal => list(token, signal, nextCursor))}>Next saved statements</button>}
          <button className="secondary-button" type="button" disabled={busy || !selected}
            onClick={() => {
              if (statement && !window.confirm('Replace the analysis in this tab?')) return
              void run(async signal => {
                const restored = await requestHostedStatement<StatementData>(token, { action: 'load', statement_id: selected }, signal)
                if (!signal.aborted) onRestore(restored)
              })
            }}>Restore hosted statement</button>
          <button className="secondary-button" type="button" disabled={busy || !selected}
            onClick={() => {
              if (!window.confirm('Delete this hosted copy? Any open analysis and downloaded exports stay with you.')) return
              void run(async signal => {
                await requestHostedStatement(token, { action: 'delete', statement_id: selected }, signal)
                if (!signal.aborted) {
                  setIds(previous => previous.filter(id => id !== selected))
                  setSelected('')
                  setSaveMode('new')
                  removeFromComparison(selected)
                  setStatus('Hosted copy deleted.')
                }
              })
            }}>Delete hosted statement</button>
          {statement && <>
            <button className="secondary-button" type="button"
              disabled={busy || Boolean(startDate) !== Boolean(endDate) || (saveMode !== 'new' && !selected)}
              onClick={saveCopy}>Save hosted copy</button>
            <button className="secondary-button" type="button" onClick={() => downloadStatement(statement)}>Export mapped data</button>
          </>}
          <button className="secondary-button" type="button"
            disabled={busy || !selected || comparisonIds.includes(selected) || comparisonIds.length >= 4}
            onClick={() => { setComparisonIds(previous => [...previous, selected]); setComparison(undefined) }}>
            Add selected copy to comparison
          </button>
        </div>
        {!!comparisonIds.length && <section aria-label="Hosted account comparison">
          <h3>Compare statement periods</h3>
          <ul>{comparisonIds.map(id => <li key={id}>{copyLabel(history[id], id)}{' '}
            <button type="button" className="text-button" onClick={() => removeFromComparison(id)} disabled={busy}
              aria-label={`Remove ${copyLabel(history[id], id)} from comparison`}>Remove</button>
          </li>)}</ul>
          <button className="secondary-button" type="button" disabled={busy || comparisonIds.length < 2}
            onClick={() => void run(async signal => {
              setComparison(undefined)
              const result = await requestHostedStatement<HostedComparison>(token, {
                action: 'compare', statement_ids: comparisonIds,
              }, signal)
              if (!signal.aborted) setComparison(result)
            })}>Compare selected periods</button>
          {comparison && <div aria-live="polite">
            <p>Shared period {comparison.start_date} to {comparison.end_date}. Amounts show observed transactions in each copy.</p>
            {comparison.includes_observed_period && <p>Some periods use the first and last recorded transaction. Missing days may be absent from the export.</p>}
            {comparison.groups.map(group => <div key={group.currency}>
              <h4>{group.currency === 'unspecified' ? 'Currency unspecified' : group.currency}</h4>
              <ul>{group.statements.map(item => <li key={item.statement_id}>
                {copyLabel(history[item.statement_id], item.statement_id)} · {item.transaction_count} transactions ·
                Debits {item.debits} · Credits {item.credits} · Net outflow {item.net_outflow}
              </li>)}</ul>
            </div>)}
          </div>}
        </section>}
      </> : <>
        <p>Enter the credential your FinSight operator gave you to start a session. Sign out to end the session. Reloading clears it from this tab.</p>
        <form autoComplete="off" onSubmit={event => {
          event.preventDefault()
          const credential = credentialInput.current?.value.trim() ?? ''
          if (credentialInput.current) credentialInput.current.value = ''
          void run(async signal => {
            const session = await openHostedSession(credential, signal)
            let connected = false
            try {
              await list(session.token, signal)
              if (!signal.aborted) {
                onConnect(session.token, session.expires_at)
                connected = true
              }
            } finally {
              if (!connected) void revokeHostedSession(session.token).catch(() => undefined)
            }
          })
        }}>
          <label>Hosted access credential
            <input ref={credentialInput} type="password" autoComplete="off" required disabled={busy} />
          </label>
          <button className="primary-button" type="submit" disabled={busy}>Connect hosted workspace</button>
        </form>
      </>}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert" className="statement-error">{error}</p>}
    </section>
  )
}
