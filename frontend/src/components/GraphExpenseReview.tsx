import { useEffect, useRef, useState } from 'react'
import { classifyGraphCommitment, readGraphReview, type ExpenseCategory, type GraphReview } from '../services/graphReview'

export function GraphExpenseReview({ api, analysisId, commitmentId }: {
  api: string
  analysisId: string
  commitmentId: string
}) {
  const [review, setReview] = useState<GraphReview | null>(null)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState('')
  const lifetime = useRef<AbortController | null>(null)

  async function refresh(signal: AbortSignal, category?: ExpenseCategory) {
    setPending(true)
    setError('')
    try {
      if (category) await classifyGraphCommitment(api, analysisId, commitmentId, category, signal)
      const nextReview = await readGraphReview(api, analysisId, signal)
      if (!signal.aborted) setReview(nextReview)
    } catch {
      if (!signal.aborted) {
        setReview(null)
        setError(category ? 'Could not confirm the category. Refresh the review to check what was saved.'
          : 'Could not load the expense review.')
      }
    } finally {
      if (!signal.aborted) setPending(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    void readGraphReview(api, analysisId, controller.signal).then(nextReview => {
      if (!controller.signal.aborted) setReview(nextReview)
    }).catch(() => {
      if (!controller.signal.aborted) setError('Could not load the expense review.')
    }).finally(() => {
      if (!controller.signal.aborted) setPending(false)
    })
    return () => controller.abort()
  }, [api, analysisId])

  const category = review?.commitments.find(entry => entry.commitment_id === commitmentId)?.expense_category
  return (
    <section className="evidence-list" aria-labelledby="graph-expense-heading">
      <h3 id="graph-expense-heading">Expense review</h3>
      <p>Tag this recurring charge as business or personal. Tags are kept until the analysis server restarts.</p>
      <div role="group" aria-label="Expense category">
        {(['business', 'personal'] as const).map(option => (
          <button key={option} type="button" className="secondary-button" disabled={pending || !review}
            aria-pressed={category === option} onClick={() => {
              if (lifetime.current) void refresh(lifetime.current.signal, option)
            }}>{option === 'business' ? 'Business' : 'Personal'}</button>
        ))}
      </div>
      {pending && <p role="status">Updating expense review…</p>}
      {error && <>
        <p role="alert">{error}</p>
        <button type="button" className="secondary-button" onClick={() => {
          if (lifetime.current) void refresh(lifetime.current.signal)
        }}>Refresh expense review</button>
      </>}
      {review && <p aria-live="polite">This charge: {category ?? 'unclassified'}. Statement totals: {review.businessCount} business · {review.commitments.filter(entry => entry.expense_category === 'personal').length} personal.</p>}
    </section>
  )
}
