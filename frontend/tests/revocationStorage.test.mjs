import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import {
  getStoredRevocationState,
  saveStoredRevocationState,
} from '../src/components/revocationStorage.ts'

const key = 'finsight_mandate_revocations_v1'
const oldRecord = {
  commitmentId: 'cloud',
  completedIndices: [0, 1],
  status: 'marked_revoked',
  lastUpdatedIso: '2026-11-12T00:00:00.000Z',
}

beforeEach(() => localStorage.clear())

test('preserves legacy progress without treating it as an attestation', () => {
  localStorage.setItem(key, JSON.stringify({ cloud: oldRecord }))
  const state = getStoredRevocationState('cloud', 2)
  assert.deepEqual(state.completedIndices, [0, 1])
  assert.equal(state.status, 'in_progress')
})

test('retains explicit attestation and isolates other commitments and resets', () => {
  assert.equal(saveStoredRevocationState({ ...oldRecord, totalSteps: 2, attested: true }), true)
  assert.equal(getStoredRevocationState('cloud', 2).status, 'marked_revoked')
  assert.equal(getStoredRevocationState('music', 2).status, 'not_started')
  saveStoredRevocationState({
    ...oldRecord, commitmentId: 'music', completedIndices: [1], status: 'in_progress', totalSteps: 2,
  })
  saveStoredRevocationState({
    ...oldRecord, completedIndices: [], status: 'not_started', totalSteps: 2,
  })
  assert.equal(getStoredRevocationState('cloud', 2).status, 'not_started')
  assert.deepEqual(getStoredRevocationState('music', 2).completedIndices, [1])
})

test('rejects invalid indices and invalidates attestation after the guide length changes', () => {
  localStorage.setItem(key, JSON.stringify({
    cloud: { ...oldRecord, totalSteps: 2, attested: true, completedIndices: [0, 1, -1, '2', 1, 8] },
  }))
  const state = getStoredRevocationState('cloud', 3)
  assert.deepEqual(state.completedIndices, [0, 1])
  assert.equal(state.status, 'in_progress')
})

test('recovers when a previous storage payload is corrupt', () => {
  localStorage.setItem(key, 'broken JSON')
  assert.equal(getStoredRevocationState('cloud').status, 'not_started')
  assert.equal(saveStoredRevocationState({ ...oldRecord, status: 'in_progress', totalSteps: 2 }), true)
  assert.deepEqual(getStoredRevocationState('cloud', 2).completedIndices, [0, 1])
})

test('revocation follow-up reports only linked debits after the local report day', async () => {
  const { mandateFollowUp } = await import('../src/components/mandateFollowUp.ts')
  const rows = [
    { transaction_id: 'same-day', date: '2025-02-02', direction: 'debit' },
    { transaction_id: 'later', date: '2025-02-03', direction: 'debit' },
    { transaction_id: 'credit', date: '2025-02-04', direction: 'credit' },
    { transaction_id: 'unrelated', date: '2025-02-05', direction: 'debit' },
  ]
  const result = mandateFollowUp(rows, ['same-day', 'later', 'credit'], '2025-02-01T20:30:00Z')
  assert.equal(result.reportDate, '2025-02-02')
  assert.deepEqual(result.debits.map(row => row.transaction_id), ['later'])
  assert.equal(mandateFollowUp(rows, [], 'invalid'), null)
})
