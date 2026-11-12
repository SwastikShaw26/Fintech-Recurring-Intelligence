import { useEffect, useRef, useState } from 'react'
import type { StatementData } from './StatementImport'
import { downloadStatement, requestStatement, statementSnapshot } from './statementRequest'

interface AccountTotals {
  currency: string
  transaction_count: number
  detected_pattern_count: number
  annual_estimate_count: number
  estimated_annual_cost: number
}

interface AccountOverview {
  accounts: { account: string; summary: AccountTotals }[]
  totals: AccountTotals[]
}

function accountTotals(summary: AccountTotals) {
  const estimate = summary.currency === 'unspecified'
    ? `${summary.estimated_annual_cost.toLocaleString('en-IN')} in unspecified units`
    : summary.estimated_annual_cost.toLocaleString('en-IN', { style: 'currency', currency: summary.currency })
  return `${summary.transaction_count} transactions · ${summary.detected_pattern_count} inferred commitments · ${
    summary.annual_estimate_count ? `${estimate} estimated annually for ${summary.annual_estimate_count} commitments` : 'No annual estimate'
  }`
}

export function SavedStatement({ api, statement, onRestore, onSaved }: {
  api: string
  statement: StatementData | null
  onRestore: (data: StatementData) => void
  onSaved: (analysisId: string, account: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [account, setAccount] = useState(statement?.local_account ?? 'Default workspace')
  const [accounts, setAccounts] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [overview, setOverview] = useState<AccountOverview | null>(null)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])

  async function act(action: 'save' | 'load' | 'delete' | 'list' | 'overview') {
    if (action === 'save' && !statement) return
    if (action === 'save' && !window.confirm('Save mapped financial records and merchant links to this computer?')) return
    if (action === 'load' && statement && !window.confirm('Replace the current tab analysis with the saved statement?')) return
    if (action === 'delete' && !window.confirm(`Delete the saved statement for “${account.trim()}” from this computer? The current tab and original CSV are unaffected.`)) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setStatus('')
    setError('')
    setOverview(null)
    try {
      const payload = { action, account: account.trim(), ...(action === 'save' && statement ? { statement: statementSnapshot(statement) } : {}) }
      if (action === 'load') {
        const restored = await requestStatement<StatementData>(api, payload, controller.signal, true)
        if (!controller.signal.aborted) onRestore(restored)
      } else if (action === 'overview') {
        const result = await requestStatement<AccountOverview>(api, { action, accounts: selected }, controller.signal, true)
        if (!controller.signal.aborted) setOverview(result)
      } else if (action === 'list') {
        const result = await requestStatement<{ accounts: string[] }>(api, payload, controller.signal, true)
        if (!controller.signal.aborted) {
          setAccounts(result.accounts)
          setSelected(previous => previous.filter(name => result.accounts.includes(name)))
          setStatus(result.accounts.length ? 'Choose a saved account or enter a new nickname.' : 'No saved accounts.')
        }
      } else if (action === 'save') {
        const result = await requestStatement<StatementData>(api, payload, controller.signal, true)
        const savedAccount = result.local_account
        if (!controller.signal.aborted && savedAccount) {
          setAccount(savedAccount)
          onSaved(result.analysis_id, savedAccount)
          setAccounts(previous => [...new Set([...previous, savedAccount])].sort())
          setStatus('Statement saved locally.')
        }
      } else {
        const result = await requestStatement<{ accounts: string[] }>(api, payload, controller.signal, true)
        if (!controller.signal.aborted) {
          setAccounts(result.accounts)
          setSelected(previous => previous.filter(name => result.accounts.includes(name)))
          setStatus('Saved statement deleted.')
        }
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not manage the saved statement.')
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <section className="panel statement-import" aria-labelledby="saved-statement-title">
      <h2 id="saved-statement-title">Local saved statement</h2>
      <p>Saving is optional. Each account nickname holds a separate statement and merchant links on this computer. Restore an account to view its analysis.</p>
      {statement?.local_account && <p>Current analysis nickname: {statement.local_account}</p>}
      <div className="statement-mapping">
        <label>Saved account nickname
          <input aria-label="Saved account nickname" value={account} maxLength={48} list="saved-account-nicknames"
            disabled={busy} onChange={event => setAccount(event.target.value)} />
        </label>
        <datalist id="saved-account-nicknames">{accounts.map(name => <option key={name} value={name} />)}</datalist>
      </div>
      {accounts.length > 0 && <ul aria-label="Saved accounts">
        {accounts.map(name => <li key={name}>
          <button type="button" className="text-button" disabled={busy}
            onClick={() => setAccount(name)} aria-pressed={account === name}>{name}</button>
        </li>)}
      </ul>}
      <div className="statement-actions">
        <button className="secondary-button" type="button" disabled={busy} onClick={() => void act('list')}>List saved accounts</button>
        <button className="secondary-button" type="button" disabled={busy || !statement || !account.trim()} onClick={() => void act('save')}>Save locally</button>
        <button className="secondary-button" type="button" disabled={busy || !account.trim()} onClick={() => void act('load')}>Restore saved statement</button>
        <button className="secondary-button" type="button" disabled={busy || !statement} onClick={() => statement && downloadStatement(statement)}>Export mapped data</button>
        <button className="secondary-button" type="button" disabled={busy || !account.trim()} onClick={() => void act('delete')}>Delete saved statement</button>
      </div>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert" className="statement-error">{error}</p>}
      {accounts.length > 1 && <section className="saved-account-overview" aria-labelledby="account-overview-title">
        <h3 id="account-overview-title">Combined account overview</h3>
        <p>Choose up to eight saved accounts. Estimates use each account’s own recurring patterns. Totals group statements by currency. Statements with unspecified currencies appear only in the account breakdown.</p>
        <fieldset className="saved-account-selection" disabled={busy}>
          <legend>Accounts to compare</legend>
          {accounts.map(name => <label key={name}>
            <input type="checkbox" checked={selected.includes(name)}
              disabled={selected.length >= 8 && !selected.includes(name)}
              onChange={event => {
                setSelected(event.target.checked ? [...selected, name] : selected.filter(item => item !== name))
                setOverview(null)
              }} />
            {name}
          </label>)}
        </fieldset>
        <button className="secondary-button" type="button" disabled={busy || selected.length < 2}
          onClick={() => void act('overview')}>Compare selected accounts</button>
        <div aria-live="polite">{overview && <>
          <h4>By account</h4>
          <ul>{overview.accounts.map(item => <li key={item.account}>
            <strong>{item.account}</strong> · {accountTotals(item.summary)}
          </li>)}</ul>
          {overview.totals.length > 0 && <>
            <h4>Totals by currency</h4>
            <ul>{overview.totals.map(total => <li key={total.currency}>
              <strong>{total.currency}</strong> · {accountTotals(total)}
            </li>)}</ul>
          </>}
        </>}</div>
      </section>}
    </section>
  )
}
