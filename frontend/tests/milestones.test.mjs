import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextProjectedDate, buildMilestones, buildCommitmentForecast } from '../src/components/milestones.ts'

test('calendar projections retain the anchor day after a short month', () => {
  assert.equal(nextProjectedDate('2024-01-31', 'monthly', '2024-02-01'), '2024-02-29')
  assert.equal(nextProjectedDate('2024-01-31', 'monthly', '2024-03-01'), '2024-03-31')
  assert.equal(nextProjectedDate('2024-11-30', 'quarterly', '2025-01-01'), '2025-02-28')
  assert.equal(nextProjectedDate('2024-02-29', 'annual', '2026-01-01'), '2026-02-28')
})

test('invalid, future observed, and irregular dates do not produce projections', () => {
  assert.equal(nextProjectedDate('2025-02-30', 'monthly', '2026-01-01'), null)
  assert.equal(nextProjectedDate('2025-12-31', 'irregular', '2026-01-01'), null)
  assert.equal(nextProjectedDate('2026-02-01', 'monthly', '2026-01-01'), null)
  assert.equal(nextProjectedDate('2025-12-01', 'monthly', '2026-01-01'), '2026-01-01')
})

test('milestones retain source records and distinguish estimates from observed amounts', () => {
  const commitment = { cadence: 'monthly', last_observed_date: '2025-12-03', typical_amount: 400, transaction_ids: ['1'] }
  const txs = [{ transaction_id: '1', date: '2025-12-03', amount: -500, review_required: true }]
  const milestones = buildMilestones([commitment], txs, '2026-01-01')
  assert.deepEqual(milestones.map(e => [e.kind, e.amount, e.date]), [
    ['charge', 400, '2026-01-03'], ['review', 500, '2025-12-03'],
  ])
  assert.equal(milestones[0].commitment, commitment)
  assert.equal(buildMilestones([{ ...commitment, typical_amount: null }], [], '2026-01-01')[0].amount, null)
})

test('fitted month end remains aligned after an early or late posting', () => {
  const commitment = { cadence: 'monthly', last_observed_date: '2025-06-02',
    billing_anchor_day: 31, billing_anchor_date: '2025-05-31', typical_amount: 400 }
  assert.equal(buildMilestones([commitment], [], '2025-06-03')[0].date, '2025-06-30')
  const early = { ...commitment, last_observed_date: '2025-06-28', billing_anchor_date: '2025-06-30' }
  assert.equal(buildMilestones([early], [], '2025-06-29')[0].date, '2025-07-31')
})

test('30-day forecast keeps both February and March estimates and marks limited evidence', () => {
  const item = { commitment_id: 'monthly', cadence: 'monthly', last_observed_date: '2025-01-28',
    typical_amount: 200, transaction_count: 3, amount_pattern: 'variable' }
  const forecast = buildCommitmentForecast([item, { ...item, cadence: 'irregular' }], '2025-02-27')
  assert.deepEqual(forecast.entries.map(entry => entry.date), ['2025-02-28', '2025-03-28'])
  assert.equal(forecast.entries[0].amount, 200)
  assert.deepEqual(forecast.entries[0].uncertainty, ['Short payment history', 'Observed amounts vary'])
  assert.equal(forecast.annual, 2400)
  assert.equal(forecast.unestimated, 1)
})

