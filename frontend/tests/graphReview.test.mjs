import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readGraphReview, classifyGraphCommitment } from '../src/services/graphReview.ts'

test('graph review reads the scoped list and summary and saves the selected category', async t => {
  const entry = { analysis_id: 'a&1', commitment_id: 'c/1', expense_category: 'business' }
  const signal = new AbortController().signal
  const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.signal, signal)
    assert.equal(options.redirect, 'error')
    assert.match(url, /analysis_id=a%261$/)
    if (url.includes('/classify?')) {
      assert.match(url, /c%2F1/)
      assert.equal(options.method, 'POST')
      assert.deepEqual(JSON.parse(options.body), { expense_category: 'business' })
      return Response.json(entry)
    }
    return Response.json(url.includes('/classified?')
      ? { analysis_id: 'a&1', commitments: [entry], count: 1 }
      : { analysis_id: 'a&1', total_business_commitments: 1, commitment_ids: ['c/1'] })
  })
  await classifyGraphCommitment('', 'a&1', 'c/1', 'business', signal)
  assert.deepEqual(await readGraphReview('', 'a&1', signal), { commitments: [entry], businessCount: 1 })
  assert.equal(mock.mock.callCount(), 3)
})

test('graph review rejects cross-analysis data', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ analysis_id: 'other' }))
  await assert.rejects(readGraphReview('', 'a', new AbortController().signal), /unexpected/i)
})
