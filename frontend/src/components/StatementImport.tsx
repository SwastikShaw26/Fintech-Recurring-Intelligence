import { useEffect, useRef, useState } from 'react'
import { normalizedStatementCsv } from './statementRequest'
import { applyImportPreset, IMPORT_PRESETS, parseImportCsv, projectMappedCsv, selectImportFile, suggestImportMapping, type ImportCsv } from './importQuality'
import './StatementImport.css'

type RecordData = Record<string, unknown>
export interface StatementData {
  summary: RecordData
  transactions: RecordData[]
  commitments: RecordData[]
  alerts: RecordData[]
  analysis_id: string
  local_account?: string
  merchant_links: [string, string][]
  merchant_dismissals: [string, string][]
  merchant_suggestions: { source: string; target: string; reason: string; similarity?: number }[]
  duplicate_rows: number
  overlap_excluded_rows?: number
}
interface Preview {
  columns: string[]
  row_count: number
  sample: string[][]
}

interface OverlapEvidence {
  transaction_id: string
  date: string
  description: string
  amount: number
  direction: string
  payment_method: string
}

interface OverlapReview {
  exact_matches: number
  new_rows: number
  ambiguous_count: number
  conflicts: (OverlapEvidence & { existing: OverlapEvidence })[]
}

const fields = [
  { key: 'date', label: 'Date', required: true },
  { key: 'description', label: 'Merchant or description', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'debit_amount', label: 'Debit amount', required: true },
  { key: 'credit_amount', label: 'Credit amount', required: true },
  { key: 'direction', label: 'Debit or credit', required: false },
  { key: 'payment_method', label: 'Payment method', required: false },
]

export function StatementImport({ request, onAnalyze, existing, hostedToken }: {
  request: <T>(payload: object, signal: AbortSignal) => Promise<T>
  onAnalyze: (data: StatementData) => void
  existing: StatementData | null
  hostedToken?: string
  redesigned?: boolean
}) {
  const parsed = useRef<ImportCsv | null>(null)
  const pending = useRef<AbortController | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<Record<string, number>>({})
  const [dateFormat, setDateFormat] = useState('iso')
  const [sign, setSign] = useState('negative_debit')
  const [split, setSplit] = useState(false)
  const [currency, setCurrency] = useState('INR')
  const [merge, setMerge] = useState(false)
  const [presetId, setPresetId] = useState('')
  const [review, setReview] = useState<{ result: OverlapReview; payload: object } | null>(null)
  const [excluded, setExcluded] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: number } | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const dragDepth = useRef(0)
  const [phase, setPhase] = useState('')

  useEffect(() => () => { pending.current?.abort(); parsed.current = null }, [])

  const visibleFields = fields.filter(({ key }) => split
    ? !['amount', 'direction'].includes(key) : !['debit_amount', 'credit_amount'].includes(key))
  const assignedFields = visibleFields.flatMap(({ key }) => (mapping[key] ?? -1) >= 0 ? [[key, mapping[key]] as const] : [])
  const duplicateMapping = new Set(assignedFields.map(([, index]) => index)).size !== assignedFields.length
  const missingRequired = visibleFields.filter(({ key, required }) => required && (mapping[key] ?? -1) < 0)
  const ready = missingRequired.length === 0 && !duplicateMapping
  const currentStage = !preview ? 'Choose CSV' : ready ? 'Analyze' : 'Map columns'

  function chooseFiles(files: File[]) {
    if (busy) return
    try {
      void send(selectImportFile(files))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Choose one UTF-8 CSV file.')
    }
  }

  function clearPreview() {
    parsed.current = null
    setPreview(null)
    setSelectedFile(null)
    setReview(null)
    setExcluded([])
    setError('')
    setPhase('')
  }

  function cancel() {
    pending.current?.abort()
    pending.current = null
    setBusy(false)
    setPhase('Cancelled. You can retry or choose another file.')
    if (!parsed.current) setSelectedFile(null)
  }

  async function send(file?: File) {
    const controller = new AbortController()
    pending.current?.abort()
    pending.current = controller
    setBusy(true)
    setPhase(file ? 'Reading CSV locally…' : review ? 'Applying overlap decisions…'
      : merge ? 'Reviewing statement overlap…' : 'Analyzing mapped rows…')
    setError('')
    if (file) {
      setSelectedFile({ name: file.name, size: file.size })
      parsed.current = null
      setPreview(null)
      setMapping({})
      setMerge(false)
      setReview(null)
      setExcluded([])
      setPresetId('')
      setDateFormat('iso')
      setSign('negative_debit')
    }
    try {
      if (file) {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
        if (controller.signal.aborted) return
        const next = parseImportCsv(text)
        parsed.current = next
        setPreview({
          columns: next.columns, row_count: next.rows.length,
          sample: next.rows.slice(0, 5).map(row => row.map(value => value.slice(0, 160))),
        })
        const suggested = suggestImportMapping(next.columns)
        setMapping(suggested)
        setSplit(suggested.debit_amount >= 0 && suggested.credit_amount >= 0)
        setPhase('CSV ready to preview. No data has been submitted.')
        return
      }
      if (!parsed.current) return
      const selectedFields = Object.fromEntries(assignedFields)
      const mapped = projectMappedCsv(parsed.current, selectedFields)
      const payload = review ? { ...review.payload, overlap_excluded: excluded } : {
        csv: mapped.csv,
        currency: merge && existing ? existing.summary.currency : currency,
        mapping: { ...mapped.mapping, date_format: dateFormat, amount_sign: sign },
        ...(merge && existing ? {
          overlap_csv: normalizedStatementCsv(existing.transactions),
          overlap_confirmed: true,
          analysis_id: existing.analysis_id,
          aliases: existing.merchant_links,
          merchant_dismissals: existing.merchant_dismissals,
        } : {}),
      }
      if (merge && !review) {
        const next = await request<{ overlap_review: OverlapReview }>(
          { ...payload, overlap_preview: true }, controller.signal,
        )
        if (!controller.signal.aborted) {
          setReview({ result: next.overlap_review, payload })
          setPhase('Overlap ready for review.')
        }
        return
      }
      const next = await request<StatementData>(payload, controller.signal)
      if (controller.signal.aborted) return
      parsed.current = null
      setPreview(null)
      setSelectedFile(null)
      setReview(null)
      onAnalyze(next)
    } catch (failure) {
      if (controller.signal.aborted) return
      if (file) {
        parsed.current = null
        setSelectedFile(null)
      }
      setPhase('')
      setError(failure instanceof Error ? failure.message : 'The statement could not be read.')
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <section className="panel statement-import" aria-labelledby="statement-import-title">
      <h2 id="statement-import-title">Import a bank statement</h2>
      <p>Choose a UTF-8 CSV with a header row. Preview stays in this tab. {hostedToken
        ? 'The hosted server receives only mapped columns when you review or analyze. Save explicitly to keep a mapped copy.'
        : 'The local server analyzes only mapped columns, and results stay in this tab until you clear it or reload.'}</p>
      <ol className="import-stages" aria-label="Statement import stages">
        {['Choose CSV', 'Map columns', 'Analyze'].map(stage => (
          <li key={stage} aria-current={currentStage === stage ? 'step' : undefined}>{stage}</li>
        ))}
      </ol>
      <div className={`statement-dropzone${dragActive ? ' is-dragging' : ''}`} role="region" aria-label="CSV dropzone" aria-busy={busy}
        onDragEnter={event => {
          event.preventDefault()
          if (!busy && event.dataTransfer.types.includes('Files')) {
            dragDepth.current += 1
            setDragActive(true)
          }
        }}
        onDragOver={event => {
          event.preventDefault()
          event.dataTransfer.dropEffect = busy ? 'none' : 'copy'
        }}
        onDragLeave={event => {
          event.preventDefault()
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (!dragDepth.current) setDragActive(false)
        }}
        onDrop={event => {
          event.preventDefault()
          dragDepth.current = 0
          setDragActive(false)
          chooseFiles(Array.from(event.dataTransfer.files))
        }}>
      <p id="statement-drop-hint">{dragActive ? 'Drop one CSV to preview it' : 'Drop one CSV here, or choose a file. Up to 2 MB.'}</p>
      <label className="statement-file">
        <span>Statement CSV</span>
        <input type="file" accept=".csv,text/csv" aria-describedby="statement-drop-hint" disabled={busy} onChange={event => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          if (files.length) chooseFiles(files)
        }} />
      </label>
      {selectedFile && <p className="statement-selection">Selected: <strong>{selectedFile.name}</strong> ({selectedFile.size.toLocaleString()} bytes)</p>}
      </div>
      <p role="status" aria-live="polite">{phase}</p>
      {busy && <button className="secondary-button" type="button" onClick={cancel}>Cancel processing</button>}
      {error && <p role="alert" className="statement-error">{error}</p>}
      {preview && (
        <form onSubmit={event => { event.preventDefault(); void send() }}>
          <h3>Preview and map fields</h3>
          <p>Showing {preview.sample.length} of {preview.row_count} records. Unmapped fields are excluded from analysis.</p>
          {existing && <label>
            <input type="checkbox" checked={merge} disabled={busy || !!review} onChange={event => setMerge(event.target.checked)} />
            Combine with the current statement. Both exports are for the same account and currency, and cover complete days.
          </label>}
          {merge && <p>Matching rows across exports are counted once per occurrence. Leave this unchecked if either export is filtered or covers only part of a day.</p>}
          <div className="import-mapping-grid">
            <div className="statement-preview" tabIndex={0} role="region" aria-label="Statement preview">
              <table>
                <thead><tr>{preview.columns.map((column, index) => <th key={index} scope="col">{column}</th>)}</tr></thead>
                <tbody>{preview.sample.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <fieldset className="statement-mapping" aria-describedby="import-mapping-status"
              disabled={busy || !!review}>
              <legend>Column mapping</legend>
              <label>CSV layout preset
                <select value={presetId} onChange={event => {
                  const id = event.target.value
                  setPresetId(id)
                  const preset = IMPORT_PRESETS.find(item => item.id === id)
                  if (!preset) return
                  setMapping(applyImportPreset(preview.columns, preset))
                  setDateFormat(preset.dateFormat)
                  setSign(preset.sign)
                  setSplit(preset.split)
                }}>
                  <option value="">Custom mapping</option>
                  {IMPORT_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                </select>
              </label>
              <label>Amount layout
                <select aria-label="Amount layout" value={split ? 'split' : 'single'}
                  onChange={event => setSplit(event.target.value === 'split')}>
                  <option value="single">One amount column</option><option value="split">Separate debit and credit columns</option>
                </select>
              </label>
              <label>Statement currency
                <select aria-label="Statement currency" value={merge && existing ? String(existing.summary.currency) : currency}
                  disabled={merge} onChange={event => setCurrency(event.target.value)}>
                  <option value="INR">INR</option><option value="GBP">GBP</option><option value="USD">USD</option>
                  <option value="EUR">EUR</option><option value="unspecified">Unspecified (statement units)</option>
                </select>
              </label>
              {visibleFields.map(({ key, label, required }) => (
                <label key={key}>{label}
                  <select aria-label={label} required={required} value={(mapping[key] ?? -1) < 0 ? '' : mapping[key]}
                    onChange={event => setMapping(previous => ({ ...previous, [key]: event.target.value === '' ? -1 : Number(event.target.value) }))}>
                    <option value="">{required ? 'Choose a column' : 'No column'}</option>
                    {preview.columns.map((column, index) => <option key={index} value={index}>{column}</option>)}
                  </select>
                </label>
              ))}
              <label>Date format
                <select aria-label="Date format" value={dateFormat} onChange={event => setDateFormat(event.target.value)}>
                  <option value="iso">YYYY-MM-DD</option><option value="dmy">DD/MM/YYYY</option><option value="mdy">MM/DD/YYYY</option>
                </select>
              </label>
              {!split && (mapping.direction ?? -1) < 0 && <label>Amount sign
                <select aria-label="Amount sign" value={sign} onChange={event => setSign(event.target.value)}>
                  <option value="negative_debit">Debits are negative</option><option value="positive_debit">Debits are positive</option>
                </select>
              </label>}
            </fieldset>
          </div>
          <p id="import-mapping-status" role="status" className={duplicateMapping ? 'statement-error' : undefined}>
            {duplicateMapping ? 'Choose a different CSV column for each mapped field.'
              : missingRequired.length ? `Map required columns: ${missingRequired.map(field => field.label).join(', ')}.`
                : 'Required columns mapped. Your statement is ready to analyze.'}
          </p>
          {review && <section className="review-evidence" aria-labelledby="overlap-review-title">
            <h3 id="overlap-review-title">Review overlapping rows</h3>
            <p role="status">{review.result.exact_matches} exact matches to skip, {review.result.new_rows} other rows to add, and {review.result.ambiguous_count} possible conflicts.</p>
            {review.result.conflicts.length > 0 && <>
              <p>Same-day entries with a matching descriptor can be separate payments. FinSight keeps both unless you exclude the incoming row.</p>
              {review.result.ambiguous_count > review.result.conflicts.length && <p>
                Showing the first {review.result.conflicts.length} conflicts. Unlisted rows will be kept.
              </p>}
              <div className="statement-preview" tabIndex={0} role="region" aria-label="Overlap conflicts">
                <table>
                  <thead><tr><th scope="col">Incoming</th><th scope="col">Already imported</th><th scope="col">Decision</th></tr></thead>
                  <tbody>{review.result.conflicts.map(row => <tr key={row.transaction_id}>
                    <td>{row.date} · {row.description} · {row.amount} {row.direction} · {row.payment_method || 'Unknown method'}</td>
                    <td>{row.existing.description} · {row.existing.amount} {row.existing.direction} · {row.existing.payment_method || 'Unknown method'}</td>
                    <td><label><input type="checkbox" checked={excluded.includes(row.transaction_id)} disabled={busy}
                      onChange={event => setExcluded(current => event.target.checked ? [...current, row.transaction_id] : current.filter(id => id !== row.transaction_id))} />
                      Exclude incoming row
                    </label></td>
                  </tr>)}</tbody>
                </table>
              </div>
            </>}
          </section>}
          <div className="statement-actions">
            <button className="primary-button" disabled={!ready || busy} type="submit">
              {review ? 'Apply reviewed overlap' : merge ? 'Review overlap' : 'Analyze statement'}
            </button>
            {review && <button className="secondary-button" disabled={busy} type="button" onClick={() => { setReview(null); setExcluded([]) }}>Edit mapping</button>}
            <button className="secondary-button" disabled={busy} type="button" onClick={clearPreview}>Clear preview</button>
          </div>
        </form>
      )}
    </section>
  )
}
