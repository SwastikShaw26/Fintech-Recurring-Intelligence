export type ExpenseCategory = 'business' | 'personal'

type Classification = {
  analysis_id: string
  commitment_id: string
  expense_category: ExpenseCategory
}

export type GraphReview = { commitments: Classification[]; businessCount: number }

function isClassification(value: unknown, analysisId: string): value is Classification {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<Classification>
  return entry.analysis_id === analysisId && typeof entry.commitment_id === 'string'
    && (entry.expense_category === 'business' || entry.expense_category === 'personal')
}

async function request(api: string, path: string, analysisId: string, options: RequestInit) {
  const query = new URLSearchParams({ analysis_id: analysisId })
  const response = await fetch(`${api}/api/graph/${path}?${query}`, { ...options, redirect: 'error' })
  if (!response.ok) throw new Error('Could not complete the expense review request.')
  const result = await response.json()
  if (result?.analysis_id !== analysisId) throw new Error('The expense review returned an unexpected response.')
  return result
}

export async function readGraphReview(api: string, analysisId: string, signal: AbortSignal): Promise<GraphReview> {
  const [list, summary] = await Promise.all([
    request(api, 'commitments/classified', analysisId, { signal }),
    request(api, 'summary/business', analysisId, { signal }),
  ])
  if (!Array.isArray(list.commitments)
    || !list.commitments.every((entry: unknown) => isClassification(entry, analysisId))
    || !Number.isSafeInteger(summary.total_business_commitments) || summary.total_business_commitments < 0) {
    throw new Error('The expense review returned an unexpected response.')
  }
  return { commitments: list.commitments, businessCount: summary.total_business_commitments }
}

export async function classifyGraphCommitment(api: string, analysisId: string, commitmentId: string,
  category: ExpenseCategory, signal: AbortSignal) {
  const entry = await request(api, `commitment/${encodeURIComponent(commitmentId)}/classify`, analysisId, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expense_category: category }), signal,
  })
  if (!isClassification(entry, analysisId) || entry.commitment_id !== commitmentId || entry.expense_category !== category) {
    throw new Error('The expense review returned an unexpected response.')
  }
}
