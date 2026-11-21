import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCostBreakdown, breakdownCsv } from '../src/components/commitmentBreakdownData.ts'

test('groups per currency and collapses only known annualized estimates into top merchants plus Other', () => {
  const result = buildCostBreakdown([
    { currency: 'USD', merchant_id: 'a', name: 'A', cadence: 'monthly', estimated_annual_cost: 24 },
    { currency: 'USD', merchant_id: 'a', name: 'A Inc', cadence: 'monthly', estimated_annual_cost: 7 },
    { currency: 'USD', name: 'A', cadence: 'quarterly', estimated_annual_cost: 3 },
    { currency: 'USD', name: 'B', cadence: 'monthly', estimated_annual_cost: 5 },
    { currency: 'USD', name: 'C', cadence: 'monthly', estimated_annual_cost: null },
    { name: 'USD vendor on INR account', cadence: 'monthly', estimated_annual_cost: 500 },
  ], 'INR', item => item.name, 1)
  assert.deepEqual(result.map(group => [group.currency, group.total, group.included, group.excluded]), [
    ['INR', 500, 1, 0], ['USD', 39, 4, 1],
  ])
  assert.deepEqual(result[1].merchant.map(({ label, amount }) => [label, amount]), [['A', 31], ['Other merchants', 8]])
  assert.deepEqual(result[1].cadence.map(({ label, amount }) => [label, amount]), [['Monthly', 36], ['Quarterly', 3]])
})

test('CSV retains currency column and escapes merchant formula prefixes, commas, quotes and line breaks', () => {
  const groups = buildCostBreakdown([
    { name: '\t=1+1,"office"\nService', cadence: 'monthly', estimated_annual_cost: 10.01 },
  ], 'EUR', item => item.name)
  const csv = breakdownCsv(groups, { workspace: '=untrusted saved account', reviewSignals: 2 })
  assert.match(csv, /EUR,Merchant,"'\t=1\+1,""office""\nService",10\.01,1,0/)
  assert.ok(csv.includes('EUR,Total,Known annualized estimates,10.01,1,0'))
  assert.ok(csv.includes("Inferred,'=untrusted saved account,,,2"))
})
