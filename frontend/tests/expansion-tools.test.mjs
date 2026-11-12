import assert from 'node:assert/strict'
import { test } from 'node:test'
import { projectCashBuffer } from '../src/components/cashBuffer.ts'
import { buildCommitmentActivity } from '../src/components/commitmentActivity.ts'

test('cash buffer groups same-day debits and never uses unselected amounts', () => {
  const result = projectCashBuffer(50, 10, [
    { date: '2026-12-01', amount: 19.99 },
    { date: '2026-12-01', amount: 20.02 },
    { date: '2026-12-02', amount: 12 },
  ])
  assert.deepEqual(result, [
    { date: '2026-12-01', debits: 40.01, balance: 9.99, belowBuffer: true },
    { date: '2026-12-02', debits: 12, balance: -2.01, belowBuffer: true },
  ])
})

test('activity is scoped to the selected commitment and treats gaps as observations', () => {
  const commitment = { commitment_id: 'one', transaction_ids: ['a', 'b'] }
  const rows = [
    { transaction_id: 'a', date: '2026-10-01', direction: 'debit', amount: 100 },
    { transaction_id: 'b', date: '2026-12-01', direction: 'debit', amount: 120 },
    { transaction_id: 'c', date: '2026-12-02', direction: 'debit', amount: 500, description: 'unrelated' },
  ]
  const alerts = [
    { commitment_id: 'one', alert_type: 'charge_after_gap', transaction_ids: ['a', 'b'] },
    { commitment_id: 'one', alert_type: 'sustained_amount_change', transaction_ids: ['b', 'c'] },
  ]
  const events = buildCommitmentActivity(commitment, rows, alerts, { reportDate: '2026-11-01', debits: rows.slice(1) })
  assert.deepEqual(events.map(({ kind, date }) => [kind, date]), [
    ['later-debit', '2026-12-01'], ['billing-gap', '2026-12-01'], ['revocation-report', '2026-11-01'],
  ])
  assert.ok(!JSON.stringify(events).includes('unrelated'))
})
