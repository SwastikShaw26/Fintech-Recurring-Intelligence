import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchGraphEvidence } from '../src/services/graphEvidence.ts'
import { observedStatementWindow } from '../src/components/forecastReliability.ts'
import { publicMetadata } from '../src/publicMetadata.ts'

test('graph lookup encodes scope and preserves the API merchant distinction', async t => {
  const payload = {
    commitment_id: 'c/1', graph_available: true, error: null,
    merchant: { merchant_id: null, display_name: 'Unresolved', resolution_method: 'unresolved' },
    supporting_transactions: [], descriptors: [],
  }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/graph/commitment/c%2F1/evidence?analysis_id=a%26b')
    assert.equal(options.redirect, 'error')
    return Response.json(payload)
  })
  assert.deepEqual(await fetchGraphEvidence('', 'a&b', 'c/1', new AbortController().signal), payload)
})

test('graph HTTP errors and mismatched results cannot appear as evidence', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }))
  const lookup = () => fetchGraphEvidence('', 'a', 'c', new AbortController().signal)
  await assert.rejects(lookup(), /unavailable/i)
  mock.mock.mockImplementation(async () => Response.json({ commitment_id: 'other', graph_available: true }))
  await assert.rejects(lookup(), /unexpected/i)
})

test('observed window uses valid non-future dates and a labelled 90-day freshness threshold', () => {
  assert.deepEqual(observedStatementWindow([
    { date: '2026-01-01' }, { date: '2026-02-30' }, { date: '2027-01-01' }, { date: '2026-08-01' },
  ], '2026-11-21'), { first: '2026-01-01', last: '2026-08-01', ageDays: 112, stale: true })
  assert.equal(observedStatementWindow([], '2026-11-21'), null)
})

test('public metadata indexes only the approved HTTPS homepage', () => {
  assert.equal(publicMetadata(undefined).robots, 'User-agent: *\nDisallow: /\n')
  assert.equal(publicMetadata('https://example.org/private').root, null)
  const metadata = publicMetadata('https://example.org')
  assert.equal(metadata.root, 'https://example.org/')
  assert.match(metadata.robots, /Disallow: \/api\//)
  assert.deepEqual([...metadata.sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]), [metadata.root])
})
