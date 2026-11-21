import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commitmentHistory } from '../src/components/forecastCardData.ts'

test('forecast history includes only linked observed debits in the commitment currency', () => {
  const commitment = { currency: 'USD', transaction_ids: ['linked', 'linked', 'absent', 'credit', 'future', 'other-currency'] }
  const result = commitmentHistory(commitment, [
    { transaction_id: 'linked', direction: 'debit', date: '2026-10-12', amount: -45 },
    { transaction_id: 'unlinked', direction: 'debit', date: '2026-10-12', amount: -99 },
    { transaction_id: 'credit', direction: 'credit', date: '2026-10-13', amount: 10 },
    { transaction_id: 'future', direction: 'debit', date: '2026-12-12', amount: 15 },
    { transaction_id: 'other-currency', direction: 'debit', date: '2026-10-13', amount: 15, currency: 'INR' },
  ], '2026-11-21', 'INR')
  assert.equal(result.currency, 'USD')
  assert.deepEqual(result.points, [{ id: 'linked', date: '2026-10-12', amount: 45 }])
  assert.equal(result.linkedCount, 5)
  assert.equal(result.missingCount, 1)
})
