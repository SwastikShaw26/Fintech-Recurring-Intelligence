import { requestHostedStatement, requestStatement } from '../components/statementRequest'

export type WorkspaceRequest = <T>(payload: object, signal: AbortSignal) => Promise<T>

export function workspaceRequest(base: string, hosted: boolean, token: string): WorkspaceRequest {
  return hosted
    ? (payload, signal) => requestHostedStatement(token, payload, signal)
    : (payload, signal) => requestStatement(base, payload, signal, true)
}

async function readJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`${response.status}: ${url}`)
  return response.json()
}

export function readDemoWorkspace(base: string) {
  return Promise.all(
    ['summary', 'transactions', 'commitments', 'alerts'].map(path => readJson(`${base}/api/${path}`)),
  )
}

export async function readDemoEvidence(base: string, commitmentId: string, signal: AbortSignal) {
  const result = await readJson(`${base}/api/commitments/${encodeURIComponent(commitmentId)}`, signal)
  if (!result || typeof result !== 'object' || !('commitment_id' in result)
    || result.commitment_id !== commitmentId || !('transactions' in result) || !Array.isArray(result.transactions)) {
    throw new Error('Unexpected commitment evidence response')
  }
  return result.transactions.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row))
}
