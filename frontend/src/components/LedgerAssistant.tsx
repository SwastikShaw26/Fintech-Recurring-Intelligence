import { useState } from 'react'
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
  const answer = submitted ? answerLedgerQuestion(submitted, today, buildCommitmentForecast(commitments, today).entries, alerts) : null
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
          {answer.kind === 'unsupported' && <p>Choose one of the supported questions above. This view explains recorded evidence and estimates.</p>}
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
    </section>
  )
}
