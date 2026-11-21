import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeWorkspaces } from '../src/components/workspaceComparison.ts'

const monthly = { cadence: 'monthly', typical_amount: 50, last_observed_date: '2026-11-15' }

test('local overview estimates stay grouped by currency and use only the open account forecast', () => {
  const groups = summarizeWorkspaces([
    { account: 'Family', summary: { currency: 'INR', annual_estimate_count: 1, estimated_annual_cost: 600 } },
    { account: 'Business', summary: { currency: 'USD', annual_estimate_count: 1, estimated_annual_cost: 120 } },
    { account: 'Joint', summary: { currency: 'INR', annual_estimate_count: 1, estimated_annual_cost: 50 } },
  ], '2026-12-01', { local_account: 'Joint', commitments: [{ ...monthly, cadence: 'annual' }] })
  assert.deepEqual(groups.map(group => [group.currency, group.workspaces.map(row => [row.id, row.annual, row.nextDate])]), [
    ['INR', [['Family', 600, null], ['Joint', 50, '2027-11-15']]],
    ['USD', [['Business', 120, null]]],
  ])
})

test('unspecified units remain labelled and missing estimates stay unavailable', () => {
  const [group] = summarizeWorkspaces([
    { account: 'Incomplete', summary: { detected_pattern_count: 1 } },
  ], '2026-12-01', { local_account: 'Incomplete', commitments: [{ ...monthly, typical_amount: null }] })
  assert.equal(group.currency, 'unspecified')
  assert.equal(group.workspaces[0].annual, null)
  assert.equal(group.workspaces[0].omittedCount, 1)
  assert.equal(group.workspaces[0].nextDate, '2026-12-15')
})
