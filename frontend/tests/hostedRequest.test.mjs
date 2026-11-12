import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openHostedSession, requestHostedStatement, revokeHostedSession } from '../src/components/statementRequest.ts'

test('hosted credential exchange and revocation use the session endpoint without a body', async (t) => {
  const session = { token: 'B'.repeat(43), expires_at: '2026-11-12T12:00:00Z' }
  const mockFetch = t.mock.method(globalThis, 'fetch', async (_url, options) =>
    options.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json(session))
  const previousWindow = globalThis.window
  globalThis.window = { location: { origin: 'https://finsight.example' } }
  try {
    const signal = new AbortController().signal
    assert.deepEqual(await openHostedSession('A'.repeat(43), signal), session)
    await revokeHostedSession(session.token)
    for (const [index, method] of ['POST', 'DELETE'].entries()) {
      const [url, options] = mockFetch.mock.calls[index].arguments
      assert.equal(String(url), 'https://finsight.example/api/hosted-session')
      assert.equal(options.method, method)
      assert.equal(options.headers.Authorization, 'Bearer ' + (index === 0 ? 'A'.repeat(43) : session.token))
      assert.equal(options.body, undefined)
      assert.equal(options.cache, 'no-store')
      assert.equal(options.redirect, 'error')
      assert.equal(options.credentials, 'omit')
    }
    globalThis.window.location.origin = 'http://finsight.example'
    await assert.rejects(openHostedSession('A'.repeat(43), signal), /HTTPS/)
    await assert.rejects(revokeHostedSession(session.token), /HTTPS/)
    assert.equal(mockFetch.mock.callCount(), 2)
  } finally {
    globalThis.window = previousWindow
  }
})

test('hosted statements use only the current HTTPS origin and refuse redirects', async (t) => {
  const mockFetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ statement_ids: [] }))
  const previousWindow = globalThis.window
  globalThis.window = { location: { origin: 'https://finsight.example' } }
  try {
    const signal = new AbortController().signal
    const token = 'A'.repeat(43)
    assert.deepEqual(await requestHostedStatement(token, { action: 'list' }, signal), { statement_ids: [] })
    const [endpoint, options] = mockFetch.mock.calls[0].arguments
    assert.equal(String(endpoint), 'https://finsight.example/api/hosted-statement')
    assert.equal(options.headers.Authorization, 'Bearer ' + token)
    assert.equal(options.credentials, 'omit')
    assert.equal(options.redirect, 'error')
    assert.equal(options.cache, 'no-store')
    globalThis.window.location.origin = 'http://finsight.example'
    await assert.rejects(requestHostedStatement(token, { action: 'list' }, signal), /HTTPS/)
    assert.equal(mockFetch.mock.callCount(), 1)
  } finally {
    globalThis.window = previousWindow
  }
})
