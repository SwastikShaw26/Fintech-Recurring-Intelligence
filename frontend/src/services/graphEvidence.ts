type SupportingTransaction = {
  transaction_id: string
  date: string
  description: string
  amount: number
  direction: string
}

type GraphMerchant = {
  merchant_id: string | null
  display_name: string
  resolution_method: 'graph' | 'unresolved'
}

export type GraphEvidence = {
  commitment_id: string
  graph_available: true
  merchant: GraphMerchant
  supporting_transactions: SupportingTransaction[]
  descriptors: string[]
}

function isTransaction(value: unknown): value is SupportingTransaction {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<SupportingTransaction>
  return typeof row.transaction_id === 'string' && typeof row.date === 'string'
    && typeof row.description === 'string' && typeof row.direction === 'string'
    && typeof row.amount === 'number' && Number.isFinite(row.amount)
}

export async function fetchGraphEvidence(api: string, analysisId: string, commitmentId: string, signal: AbortSignal): Promise<GraphEvidence> {
  const query = new URLSearchParams({ analysis_id: analysisId })
  const response = await fetch(`${api}/api/graph/commitment/${encodeURIComponent(commitmentId)}/evidence?${query}`, {
    signal, redirect: 'error',
  })
  if (response.status === 404 || response.status === 503) {
    throw new Error('Graph evidence is unavailable for this commitment. The local detection evidence is still available.')
  }
  if (!response.ok) throw new Error('Could not load graph evidence.')
  const result = await response.json() as Partial<GraphEvidence> | null
  const merchant = result?.merchant
  if (!result || result.commitment_id !== commitmentId || result.graph_available !== true
    || !merchant || typeof merchant.display_name !== 'string'
    || !(merchant.resolution_method === 'graph' && typeof merchant.merchant_id === 'string' && merchant.merchant_id
      || merchant.resolution_method === 'unresolved' && merchant.merchant_id === null)
    || !Array.isArray(result.supporting_transactions) || !result.supporting_transactions.every(isTransaction)
    || !Array.isArray(result.descriptors) || !result.descriptors.every(value => typeof value === 'string')) {
    throw new Error('The graph returned an unexpected response.')
  }
  return result as GraphEvidence
}
