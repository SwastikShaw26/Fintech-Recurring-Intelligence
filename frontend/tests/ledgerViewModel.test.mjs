import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ledgerKpis, linkedDebits } from '../src/components/ledgerViewModel.ts'

test('linked evidence deduplicates debits and drops unrelated or invalid rows', () => {
  const debit = { transaction_id: 'd1', date: '2026-04-05', direction: 'debit', amount: 599, description: 'Demo' }
  assert.deepEqual(linkedDebits({ transaction_ids: ['d1', 'd2', 'd3'] }, [
    debit, debit, { ...debit, transaction_id: 'd2', direction: 'credit' },
    { ...debit, transaction_id: 'd3', date: '2026-02-31' }, { ...debit, transaction_id: 'other' },
  ]), [{ id: 'd1', date: '2026-04-05', amount: 599, description: 'Demo' }])
})

test('KPI does not double count shared observations or add across currencies', () => {
  const commitments = [
    { transaction_ids: ['r'], currency: 'INR' },
    { transaction_ids: ['r'], currency: 'INR' },
    { transaction_ids: ['u'], currency: 'USD' },
  ]
  const rows = [
    { transaction_id: 'r', date: '2026-04-05', direction: 'debit', amount: 120000 },
    { transaction_id: 'u', date: '2026-04-05', direction: 'debit', amount: 10 },
  ]
  assert.deepEqual(ledgerKpis({}, commitments, rows, [], '2026-05-01')[1].values, ['₹1,20,000.00', '$10.00'])
})
