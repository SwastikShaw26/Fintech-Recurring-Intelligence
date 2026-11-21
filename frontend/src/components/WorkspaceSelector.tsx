import { useLayoutEffect, useRef, useState } from 'react'
import type { StatementData } from './StatementImport'
import type { WorkspaceRequest } from '../services/workspaceRead'
import { nextWorkspaceDebit, summarizeWorkspaces } from './workspaceComparison'
import type { SavedAccountSummary } from './workspaceComparison'
import './WorkspaceSelector.css'

type Mode = 'demo' | 'local' | 'hosted'
type HostedStatement = StatementData & { statement_id?: string }
type HostedCopy = {
  statement_id: string
  name?: string
  version: number
}
type SavedChoice = { id: string; label: string }
type HostedComparison = {
  start_date: string
  end_date: string
  includes_observed_period: boolean
  groups: {
    currency: string
    statements: { statement_id: string; name: string; debits: string; credits: string; net_outflow: string }[]
  }[]
}

const indiaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', dateStyle: 'short' })
const dateLabel = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', dateStyle: 'medium' })

function labelDate(date: string) {
  const value = new Date(date + 'T00:00:00Z')
  return Number.isNaN(value.getTime()) ? date : dateLabel.format(value)
}

function hostedChoice(copy: HostedCopy): SavedChoice {
  return {
    id: copy.statement_id,
    label: copy.name ? `${copy.name} (v${copy.version})` : `Snapshot ${copy.statement_id.slice(0, 8)}`,
  }
}

function money(amount: number, currency: string) {
  return currency === 'unspecified'
    ? `${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} statement units`
    : amount.toLocaleString('en-IN', { style: 'currency', currency })
}

export function WorkspaceSelector({ request, mode, connected, statement, onSwitch, onImport }: {
  request: WorkspaceRequest
  mode: Mode
  connected: boolean
  statement: HostedStatement | null
  onSwitch: (statement: StatementData | null) => void
  onImport: () => void
}) {
  const pending = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [choices, setChoices] = useState<SavedChoice[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [target, setTarget] = useState('')
  const [cursor, setCursor] = useState<string>()
  const [accountSummaries, setAccountSummaries] = useState<SavedAccountSummary[]>()
  const comparison = accountSummaries && summarizeWorkspaces(accountSummaries, indiaDate.format(new Date()), statement)
  const [hostedComparison, setHostedComparison] = useState<HostedComparison>()
  const hostedCopy = statement?.statement_id
  const activeLabel = statement
    ? statement.local_account ?? (mode === 'hosted'
      ? choices.find(choice => choice.id === hostedCopy)?.label ?? (hostedCopy ? 'Hosted snapshot' : 'Hosted analysis')
      : 'Imported statement')
    : 'Synthetic demo'
  const canList = mode === 'local' || mode === 'hosted' && connected
  const maxSelection = mode === 'hosted' ? 4 : 8

  useLayoutEffect(() => () => pending.current?.abort(), [])

  async function run(task: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setStatus('')
    setError('')
    try {
      await task(controller.signal)
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Workspace request failed.')
    } finally {
      pending.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  function listSaved(nextPage?: string) {
    if (!canList) return
    void run(async signal => {
      let next: SavedChoice[]
      let nextCursor: string | undefined
      if (mode === 'hosted') {
        const result = await request<{ history: HostedCopy[]; next_cursor?: string }>(
          { action: 'list', include_history: true, cursor: nextPage }, signal,
        )
        next = result.history.map(hostedChoice)
        nextCursor = result.next_cursor
      } else {
        const result = await request<{ accounts: string[] }>({ action: 'list' }, signal)
        next = result.accounts.map(account => ({ id: account, label: account }))
      }
      if (signal.aborted) return
      const listed = nextPage ? [...new Map([...choices, ...next].map(choice => [choice.id, choice])).values()] : next
      setChoices(listed)
      setCursor(nextCursor)
      setTarget(previous => listed.some(choice => choice.id === previous) ? previous : listed[0]?.id ?? '')
      setSelected(previous => previous.filter(id => listed.some(choice => choice.id === id)))
      setAccountSummaries(undefined)
      setHostedComparison(undefined)
      setStatus(listed.length ? `${listed.length} saved workspaces available.` : 'No saved workspaces found.')
    })
  }

  function loadSaved(id: string, signal: AbortSignal) {
    return mode === 'hosted'
      ? request<HostedStatement>({ action: 'load', statement_id: id }, signal)
      : request<StatementData>({ action: 'load', account: id }, signal)
  }

  function restore() {
    if (!target || !canList || statement && !window.confirm('Replace the current analysis in this tab with the saved workspace?')) return
    void run(async signal => {
      const next = await loadSaved(target, signal)
      if (!signal.aborted) onSwitch(next)
    })
  }

  function compare() {
    if (!canList || selected.length < 2) return
    setAccountSummaries(undefined)
    setHostedComparison(undefined)
    void run(async signal => {
      if (mode === 'hosted') {
        const result = await request<HostedComparison>({
          action: 'compare', statement_ids: selected,
        }, signal)
        if (!signal.aborted) {
          setHostedComparison(result)
          setStatus('Workspace comparison ready.')
        }
        return
      }
      const today = indiaDate.format(new Date())
      const results = await Promise.all(selected.map(async account => {
        const saved = await loadSaved(account, signal)
        return { account, summary: saved.summary, nextDate: nextWorkspaceDebit(saved.commitments, today) }
      }))
      if (!signal.aborted) {
        setAccountSummaries(results)
        setStatus('Workspace comparison ready.')
      }
    })
  }

  if (mode === 'demo') return <p className="workspace-selector">Workspace · {activeLabel}</p>

  return (
    <details className="panel workspace-selector">
      <summary>Workspace · {activeLabel}</summary>
      <div className="workspace-selector-content">
        <div className="statement-actions">
          {statement && <button type="button" className="secondary-button" disabled={busy} onClick={() => {
            if (window.confirm('Leave this analysis and return to the synthetic demo? Unsaved analysis will be cleared.')) onSwitch(null)
          }}>Switch to synthetic demo</button>}
          <button type="button" className="secondary-button" disabled={busy} onClick={onImport}>
            {mode === 'hosted' && !connected ? 'Connect hosted workspace' : 'Import or manage statements'}
          </button>
          {canList && <button type="button" className="secondary-button" disabled={busy} onClick={() => listSaved()}>
            {choices.length ? 'Refresh saved workspaces' : 'List saved workspaces'}
          </button>}
        </div>
        {choices.length > 0 && (
          <div className="statement-actions workspace-switch-actions">
            <label>Saved workspace
              <select value={target} disabled={busy} onChange={event => setTarget(event.target.value)}>
                {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
              </select>
            </label>
            <button type="button" className="secondary-button" disabled={busy || !target} onClick={restore}>Open saved workspace</button>
            {cursor && <button type="button" className="secondary-button" disabled={busy} onClick={() => listSaved(cursor)}>
              List more snapshots
            </button>}
          </div>
        )}
        {choices.length > 1 && <section aria-label="Household workspace comparison" className="workspace-comparison">
          <h2>Household comparison</h2>
          <p>{mode === 'hosted'
            ? 'Compare observed spending across authorized snapshots using their shared statement dates.'
            : 'Compare recurring estimates across saved household or individual workspaces. Each estimate uses its own statement history.'}
            {' '}Currencies are shown separately.</p>
          <fieldset className="saved-account-selection" disabled={busy}>
            <legend>Choose up to {maxSelection} workspaces</legend>
            {choices.map(choice => <label key={choice.id}>
              <input type="checkbox" checked={selected.includes(choice.id)}
                disabled={selected.length >= maxSelection && !selected.includes(choice.id)}
                onChange={event => {
                  setSelected(event.target.checked ? [...selected, choice.id] : selected.filter(id => id !== choice.id))
                  setAccountSummaries(undefined)
                  setHostedComparison(undefined)
                }} />
              {choice.label}
            </label>)}
          </fieldset>
          <button type="button" className="secondary-button" disabled={busy || selected.length < 2} onClick={compare}>
            {mode === 'hosted' ? 'Compare hosted statement periods' : 'Compare recurring commitments'}
          </button>
          {comparison && <div aria-live="polite" className="workspace-comparison-results">
            {comparison.map(group => <div key={group.currency}>
              <h3>{group.currency === 'unspecified' ? 'Unspecified currency' : group.currency}</h3>
              <ul>{group.workspaces.map(row => <li key={row.id}>
                <strong>{row.label}</strong>
                {row.annual === null ? <span>Annual estimate unavailable</span> : <span>
                  {money(row.annual, group.currency)} estimated annually across {row.estimatedCount} {row.estimatedCount === 1 ? 'commitment' : 'commitments'}
                </span>}
                {row.omittedCount > 0 && <span>{row.omittedCount} {row.omittedCount === 1 ? 'pattern lacks' : 'patterns lack'} an annual estimate</span>}
                <span>{row.nextDate ? <>Next debit · Inferred <time dateTime={row.nextDate}>{labelDate(row.nextDate)}</time></>
                  : row.isOpen ? 'No projected debit date in the available analysis' : 'Open this workspace to see its next estimated debit'}</span>
              </li>)}</ul>
            </div>)}
          </div>}
          {hostedComparison && <div aria-live="polite" className="workspace-comparison-results">
            <p>Shared period <time dateTime={hostedComparison.start_date}>{labelDate(hostedComparison.start_date)}</time>
              {' to '}<time dateTime={hostedComparison.end_date}>{labelDate(hostedComparison.end_date)}</time>.
              {hostedComparison.includes_observed_period && ' Some coverage is based on recorded dates and may have gaps.'}
            </p>
            <p>Recurring estimates and upcoming debit dates are unavailable for hosted comparisons. Open an individual saved workspace to view its forecast.</p>
            {hostedComparison.groups.map(group => <div key={group.currency}>
              <h3>{group.currency === 'unspecified' ? 'Unspecified currency' : group.currency}</h3>
              <ul>{group.statements.map(row => <li key={row.statement_id}>
                <strong>{choices.find(choice => choice.id === row.statement_id)?.label ?? row.name}</strong>
                <span>Debits {row.debits} · Credits {row.credits} · Net outflow {row.net_outflow}</span>
              </li>)}</ul>
            </div>)}
          </div>}
        </section>}
        <div role="status">{busy ? 'Loading workspace data…' : status}</div>
        {error && <p role="alert" className="statement-error">{error}</p>}
      </div>
    </details>
  )
}
