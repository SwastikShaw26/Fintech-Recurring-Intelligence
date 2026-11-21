import assert from 'node:assert/strict'
import { test } from 'node:test'
import { explainWithSarvam } from '../src/services/sarvamClient.ts'

test('Sarvam sends only allowlisted evidence and forwards the abort signal', async t => {
  const { signal } = new AbortController()
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    assert.equal(path, '/api/assistant/explain')
    assert.equal(options.signal, signal)
    assert.deepEqual(JSON.parse(options.body), {
      evidence_type: 'forecast', count: 2, days: 7, language: 'hi', consent: true,
    })
    return Response.json({ explanation: 'अनुमान', language: 'hi', source: 'sarvam' })
  })

  assert.equal(await explainWithSarvam({
    evidence_type: 'forecast', count: 2, days: 7, merchant: 'Private merchant',
  }, 'hi', signal), 'अनुमान')
})
