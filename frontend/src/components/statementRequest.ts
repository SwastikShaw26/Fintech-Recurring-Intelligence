import type { StatementData } from './StatementImport'

export async function requestStatement<T>(api: string, payload: object, signal: AbortSignal, saved = false): Promise<T> {
  const endpoint = new URL(api + (saved ? '/api/local-statement' : '/api/private-statement'), window.location.href)
  const loopback = ['127.0.0.1', 'localhost', '[::1]']
  if (!loopback.includes(endpoint.hostname) || !loopback.includes(window.location.hostname)
    || !['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('Open FinSight and its FastAPI server on this computer before importing a statement.')
  }
  if (saved && endpoint.origin !== window.location.origin) {
    throw new Error('Open the app served by the local FastAPI launcher to manage saved statements.')
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
    cache: 'no-store',
    redirect: 'error',
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error(typeof detail?.detail === 'string' ? detail.detail : 'Start the local FastAPI server and try again.')
  }
  return response.json()
}
export function normalizedStatementCsv(rows: Record<string, unknown>[]) {
  const fields = ['date', 'description', 'amount', 'direction', 'payment_method']
  return [fields.join(','), ...rows.map(row =>
    fields.map(field => '"' + String(row[field] ?? '').replaceAll('"', '""') + '"').join(','),
  )].join('\n')
}

export function statementSnapshot(statement: StatementData) {
  return {
    csv: normalizedStatementCsv(statement.transactions),
    mapping: { date: 0, description: 1, amount: 2, direction: 3, payment_method: 4 },
    currency: statement.summary.currency,
    aliases: statement.merchant_links,
    merchant_dismissals: statement.merchant_dismissals,
    analysis_id: statement.analysis_id,
  }
}

export function downloadStatement(statement: StatementData) {
  const file = new Blob([JSON.stringify({ version: 1, ...statementSnapshot(statement) }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(file)
  const download = document.createElement('a')
  download.href = url
  download.download = 'finsight-private-statement.json'
  download.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function hostedRequest(path: string, token: string, method: 'POST' | 'DELETE', signal: AbortSignal, payload?: object) {
  const endpoint = new URL(path, window.location.origin)
  if (endpoint.protocol !== 'https:') throw new Error('Open the hosted workspace over HTTPS.')
  const response = await fetch(endpoint, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
    signal,
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok) {
    const result = await response.json().catch(() => null)
    throw new Error(typeof result?.detail === 'string' ? result.detail : 'Hosted workspace request failed.')
  }
  return response
}

export async function openHostedSession(credential: string, signal: AbortSignal): Promise<{ token: string; expires_at: string }> {
  return (await hostedRequest('/api/hosted-session', credential, 'POST', signal)).json()
}

export async function revokeHostedSession(token: string): Promise<void> {
  await hostedRequest('/api/hosted-session', token, 'DELETE', AbortSignal.timeout(5_000))
}

export async function requestHostedStatement<T>(token: string, payload: object, signal: AbortSignal): Promise<T> {
  return (await hostedRequest('/api/hosted-statement', token, 'POST', signal, payload)).json()
}

export function requestAnalysis<T>(api: string, payload: object, signal: AbortSignal, hostedToken?: string): Promise<T> {
  return hostedToken
    ? requestHostedStatement(hostedToken, { action: 'analyze', statement: payload }, signal)
    : requestStatement(api, payload, signal)
}

