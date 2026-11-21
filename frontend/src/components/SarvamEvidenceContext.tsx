import { useLayoutEffect, useRef, useState } from 'react'
import type { SarvamEvidence, SarvamLanguage } from '../services/sarvamClient'

export type SarvamContextRequest = (
  evidence: SarvamEvidence, language: SarvamLanguage, signal: AbortSignal,
) => Promise<string>

type Props = {
  evidence: SarvamEvidence
  contextKey: string
  requestExplanation: SarvamContextRequest
}

type Result =
  | { state: 'loading' }
  | { state: 'ready'; text: string }
  | { state: 'error' }

export function SarvamEvidenceContext(props: Props) {
  const { evidence, contextKey } = props
  const days = evidence.evidence_type === 'forecast' ? evidence.days : null
  return <SarvamEvidenceControls key={JSON.stringify([contextKey, evidence.evidence_type, evidence.count, days])} {...props} />
}

function SarvamEvidenceControls({ evidence, requestExplanation }: Props) {
  const [language, setLanguage] = useState<SarvamLanguage>('en')
  const [consent, setConsent] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const pending = useRef<AbortController | null>(null)
  const isForecast = evidence.evidence_type === 'forecast'

  useLayoutEffect(() => () => pending.current?.abort(), [])

  function clearResult() {
    pending.current?.abort()
    setResult(null)
  }

  async function explain() {
    if (!consent || result?.state === 'loading') return
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    setResult({ state: 'loading' })
    try {
      const safeEvidence: SarvamEvidence = evidence.evidence_type === 'forecast'
        ? { evidence_type: 'forecast', count: evidence.count, days: evidence.days }
        : { evidence_type: 'review', count: evidence.count }
      const explanation = await requestExplanation(safeEvidence, language, controller.signal)
      if (!controller.signal.aborted) setResult({ state: 'ready', text: explanation })
    } catch {
      if (!controller.signal.aborted) setResult({ state: 'error' })
    } finally {
      if (pending.current === controller) pending.current = null
    }
  }

  return (
    <details className="sarvam-evidence">
      <summary>AI context</summary>
      <p>Sarvam receives the evidence type, {isForecast ? 'estimate count and forecast window' : 'review-signal count'}, and selected language. Statement text, merchant names, dates, and amounts stay here.</p>
      <label>
        Explanation language
        <select value={language} onChange={event => {
          clearResult()
          setLanguage(event.target.value === 'hi' ? 'hi' : 'en')
        }}>
          <option value="en">English</option>
          <option value="hi" lang="hi">हिन्दी</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={consent} onChange={event => {
          clearResult()
          setConsent(event.target.checked)
        }} />
        {' '}Share this summary with Sarvam AI
      </label>
      <button type="button" className="secondary-button" disabled={!consent || result?.state === 'loading'} onClick={explain}>
        Generate context
      </button>
      <div role="status">
        {result?.state === 'loading' && <p>Generating context…</p>}
        {result?.state === 'ready' && <p lang={language}>{result.text}</p>}
      </div>
      {result?.state === 'error' && (
        <p role="alert">AI context is unavailable. Read the original English evidence here.</p>
      )}
    </details>
  )
}
