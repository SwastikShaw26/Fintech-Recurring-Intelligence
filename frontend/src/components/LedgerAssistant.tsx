import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { explainWithSarvam, type SarvamEvidence, type SarvamLanguage } from '../services/sarvamClient'
import { answerLedgerQuestion, ledgerQuestions } from './ledgerAnswers'
import { buildCommitmentForecast } from './milestones'

type RecordData = Record<string, unknown>
const indiaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', dateStyle: 'short' })

export function LedgerAssistant({ commitments, transactions, alerts, formatAmount, nameFor, onSelect, onNavigate }: {
  commitments: RecordData[]
  transactions: RecordData[]
  alerts: RecordData[]
  formatAmount: (amount: number) => string
  nameFor: (item: RecordData) => string
  onSelect: (item: RecordData) => void
  onNavigate: (page: 'Forecast' | 'Review') => void
}) {
  const [question, setQuestion] = useState('')
  const [submitted, setSubmitted] = useState('')
  const today = indiaDate.format(new Date())
  const answer = useMemo(() => submitted
    ? answerLedgerQuestion(submitted, today, buildCommitmentForecast(commitments, today).entries, alerts)
    : null, [submitted, today, commitments, alerts])
  const evidence = useMemo<SarvamEvidence | null>(() => {
    if (answer?.kind === 'forecast') {
      return { evidence_type: 'forecast', count: answer.entries.length, days: answer.days, question: submitted }
    }
    if (answer?.kind === 'review') {
      return { evidence_type: 'review', count: answer.alerts.length, question: submitted }
    }
    if (answer?.kind === 'unsupported' && submitted) {
      const topMerchants = commitments.slice(0, 5).map(c => nameFor(c)).filter(Boolean).join(', ')
      const contextSummary = `User has ${commitments.length} detected recurring payment commitments (${topMerchants || 'none specified'}). There are ${alerts.length} flagged transaction alerts requiring review.`
      return { evidence_type: 'custom', count: commitments.length, question: submitted, context_summary: contextSummary }
    }
    return null
  }, [answer, submitted, commitments, alerts, nameFor])
  const byTransaction = new Map(transactions.map(row => [row.transaction_id, row]))
  const byCommitment = new Map(commitments.map(row => [row.commitment_id, row]))

  return (
    <section className="panel statement-import ledger-assistant" aria-labelledby="ledger-assistant-heading">
      <h2 id="ledger-assistant-heading">Ask your ledger</h2>
      <p>Answers come from the currently loaded FinSight forecast and review signals. Questions and statement details stay in this browser.</p>
      <ul className="statement-actions" aria-label="Supported questions">
        {ledgerQuestions.map(prompt => (
          <li key={prompt}><button type="button" className="secondary-button" onClick={() => {
            setQuestion(prompt)
            setSubmitted(prompt)
          }}>{prompt}</button></li>
        ))}
      </ul>
      <form onSubmit={event => { event.preventDefault(); setSubmitted(question.trim()) }}>
        <div className="statement-mapping">
          <label>Your question
            <input type="text" maxLength={180} value={question} onChange={event => setQuestion(event.target.value)} />
          </label>
        </div>
        <button type="submit" className="primary-button" disabled={!question.trim()}>Show evidence</button>
      </form>

      {answer && (
        <section className="review-evidence" aria-labelledby="ledger-answer-heading" aria-live="polite">
          <h3 id="ledger-answer-heading">Ledger answer</h3>
          {answer.kind === 'unsupported' && (
            <p>✨ <strong>Ask Sarvam AI:</strong> This is a custom question — scroll down to the <em>AI explanation</em> panel, check consent, and click <strong>Explain with Sarvam AI</strong> to get a contextual answer from your loaded ledger.</p>
          )}
          {answer.kind === 'forecast' && (
            <>
              <p>{answer.entries.length} projected debits in {answer.days} days including today. These estimates assume observed patterns continue.</p>
              <ul>{answer.entries.slice(0, 12).map(entry => (
                <li key={String(entry.commitment.commitment_id) + entry.date}>
                  <button type="button" className="text-button" onClick={() => onSelect(entry.commitment)}>{nameFor(entry.commitment)}</button>
                  {' · '}{entry.date}{' · '}{entry.amount === null ? 'Amount unavailable' : formatAmount(entry.amount)}
                  {entry.uncertainty.length ? ' · ' + entry.uncertainty.join(' · ') : ''}
                </li>
              ))}</ul>
              {answer.entries.length > 12 && <p>Showing the first 12 entries.</p>}
              <button type="button" className="text-button" onClick={() => onNavigate('Forecast')}>Open Forecast</button>
            </>
          )}
          {answer.kind === 'review' && (
            <>
              <p>{answer.title}: {answer.alerts.length} signals in the loaded records. Verify suspected issues with the original records.</p>
              {answer.alerts.slice(0, 12).map((alert, index) => {
                const commitment = byCommitment.get(alert.commitment_id)
                const ids: unknown[] = Array.isArray(alert.transaction_ids) ? alert.transaction_ids : []
                const evidence: unknown[] = Array.isArray(alert.evidence) ? alert.evidence : []
                return (
                  <details className="review-evidence" key={String(alert.alert_id ?? index)}>
                    <summary>{String(alert.title ?? 'Review suggested')}</summary>
                    <ul>{evidence.map((item, position) => <li key={position}>{String(item)}</li>)}</ul>
                    <ul aria-label="Supporting transactions">{ids.map(id => {
                      const row = byTransaction.get(id)
                      return <li key={String(id)}>{row
                        ? `${String(row.date)} · ${String(row.description)} · ${formatAmount(Number(row.amount))}`
                        : `Transaction ${String(id)} is outside the loaded records.`}</li>
                    })}</ul>
                    {commitment && <button type="button" className="text-button" onClick={() => onSelect(commitment)}>Open commitment</button>}
                  </details>
                )
              })}
              {answer.alerts.length > 12 && <p>Showing the first 12 signals.</p>}
              <button type="button" className="text-button" onClick={() => onNavigate('Review')}>Open Review</button>
            </>
          )}
        </section>
      )}
      {evidence && <LedgerExplanation evidence={evidence} />}
    </section>
  )
}

type ExplanationState =
  | { status: 'loading' }
  | { status: 'success'; text: string }
  | { status: 'error'; text: string }

function LedgerExplanation({ evidence }: { evidence: SarvamEvidence }) {
  const [language, setLanguage] = useState<SarvamLanguage>('en')
  const [consent, setConsent] = useState(false)
  const [result, setResult] = useState<{ evidence: SarvamEvidence; state: ExplanationState } | null>(null)
  const request = useRef<AbortController | null>(null)
  const state = result?.evidence === evidence ? result.state : null

  useLayoutEffect(() => {
    return () => request.current?.abort()
  }, [evidence])

  function clearExplanation() {
    request.current?.abort()
    setResult(null)
  }

  async function generateExplanation() {
    if (!consent) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setResult({ evidence, state: { status: 'loading' } })
    try {
      const text = await explainWithSarvam(evidence, language, controller.signal)
      if (!controller.signal.aborted) {
        setResult({ evidence, state: { status: 'success', text } })
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const text = error instanceof Error ? error.message : 'Unable to generate an AI explanation.'
        setResult({ evidence, state: { status: 'error', text } })
      }
    } finally {
      if (request.current === controller) request.current = null
    }
  }

  return (
    <section className="review-evidence" aria-labelledby="ledger-ai-heading">
      <h3 id="ledger-ai-heading">AI explanation</h3>
      <div className="statement-mapping">
        <label>Explanation language
          <select value={language} onChange={event => {
            clearExplanation()
            setLanguage(event.target.value === 'hi' ? 'hi' : 'en')
          }}>
            <option value="en">English</option>
            <option value="hi" lang="hi">हिन्दी</option>
          </select>
        </label>
      </div>
      <p><label>
        <input type="checkbox" checked={consent} onChange={event => {
          clearExplanation()
          setConsent(event.target.checked)
        }} />
        {' '}I agree to share the evidence type, count, and any forecast window with Sarvam AI.
      </label></p>
      <button type="button" className="secondary-button" disabled={!consent || state?.status === 'loading'}
        onClick={generateExplanation}>Explain with Sarvam AI</button>
      <div role="status">
        {state?.status === 'loading' && <p>Generating explanation…</p>}
        {state?.status === 'success' && <p lang={language}>{state.text}</p>}
      </div>
      {state?.status === 'error' && <p role="alert">{state.text}</p>}
    </section>
  )
}
