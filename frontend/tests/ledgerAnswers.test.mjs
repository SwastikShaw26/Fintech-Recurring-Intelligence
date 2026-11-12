import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answerLedgerQuestion } from '../src/components/ledgerAnswers.ts'

test('assistant filters upcoming estimates by the requested date window', () => {
  const entries = [
    { date: '2026-11-12', commitment: { commitment_id: '1' }, amount: 40, uncertainty: [] },
    { date: '2026-11-19', commitment: { commitment_id: '2' }, amount: 80, uncertainty: [] },
  ]
  const answer = answerLedgerQuestion('What payments are expected next week?', '2026-11-12', entries, [])
  assert.equal(answer.kind, 'forecast')
  assert.deepEqual(answer.entries, entries.slice(0, 1))
})

test('assistant distinguishes increases from decreases and declines advice', () => {
  const alerts = [
    { alert_type: 'sustained_amount_change', change_ratio: 0.2, title: 'Increase' },
    { alert_type: 'sustained_amount_change', change_ratio: -0.2, title: 'Decrease' },
  ]
  const answer = answerLedgerQuestion('Which subscriptions became more expensive?', '2026-11-12', [], alerts)
  assert.equal(answer.kind, 'review')
  assert.deepEqual(answer.alerts, alerts.slice(0, 1))
  assert.equal(answerLedgerQuestion('Can I afford to cancel everything?', '2026-11-12', [], alerts).kind, 'unsupported')
})
