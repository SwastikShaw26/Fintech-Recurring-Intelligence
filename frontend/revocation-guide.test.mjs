import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepareRevocationGuide } from './src/components/revocationGuide.ts'

test('manual UPI guidance cannot report a mandate revoked', () => {
  const guide = prepareRevocationGuide('Standard UPI (One-Off / Manual)', ['Check billing'], [])
  assert.equal(guide.canReport, false)
  assert.deepEqual(guide.steps, ['Check billing'])
})

test('AutoPay guidance distinguishes revoke from pause and omits guarantees', () => {
  const guide = prepareRevocationGuide('UPI AutoPay', [
    "Tap the mandate to view details, then select 'Pause' or 'Revoke / Cancel Mandate'.",
    'Enter your 4 or 6-digit UPI PIN to confirm the cancellation.',
  ], ['Revoking an AutoPay mandate stops future automated debits immediately.'])
  assert.equal(guide.canReport, true)
  assert.match(guide.steps[0], /Revoke/)
  assert.doesNotMatch(guide.steps[0], /Pause/)
  assert.match(guide.steps[1], /official UPI app/)
  assert.deepEqual(guide.notes, [])
})
