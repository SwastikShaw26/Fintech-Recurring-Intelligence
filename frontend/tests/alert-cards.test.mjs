import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  alertAcknowledgementsKey,
  buildAlertCards,
  countAcknowledgedAlerts,
  readAlertAcknowledgements,
} from '../src/components/alertCardsModel.ts'

test('alert cards preserve evidence text and retain missing transaction references', () => {
  const cards = buildAlertCards([{
    alert_id: 'alert-one', title: 'Possible duplicate: Vendor ₹1,234.50',
    evidence: ['Two Vendor debits on 2026-11-05.'], alert_type: 'possible_duplicate',
    severity: 'warning', commitment_id: 'c1', transaction_ids: ['tx', 'missing'],
  }], [{ transaction_id: 'tx', description: 'Vendor', amount: 1234.5, date: '2026-11-05', review_required: true }],
  [{ commitment_id: 'c1' }])
  assert.equal(cards[0].title, 'Possible duplicate: Vendor ₹1,234.50')
  assert.deepEqual(cards[0].evidence, ['Two Vendor debits on 2026-11-05.'])
  assert.deepEqual(cards[0].transactions, [
    { id: 'tx', date: '2026-11-05', description: 'Vendor', amount: 1234.5, flagged: true },
    { id: 'missing' },
  ])
  assert.equal(cards[0].commitmentId, 'c1')
})

test('progress counts only distinct acknowledged IDs in the active analysis', () => {
  const storage = new Map([
    [alertAcknowledgementsKey('analysis/a'), JSON.stringify(['shared', 'removed', { title: 'Never restore me' }])],
    [alertAcknowledgementsKey('analysis/b'), JSON.stringify(['different'])],
  ])
  const cards = buildAlertCards([{ alert_id: 'shared' }, { alert_id: 'shared' }, { title: 'Missing ID' }], [], [])
  assert.deepEqual([...readAlertAcknowledgements(storage.get(alertAcknowledgementsKey('analysis/a')))], ['shared', 'removed'])
  assert.deepEqual(countAcknowledgedAlerts(cards, readAlertAcknowledgements(storage.get(alertAcknowledgementsKey('analysis/a')))), {
    total: 1, acknowledged: 1,
  })
  assert.deepEqual(countAcknowledgedAlerts(cards, readAlertAcknowledgements(storage.get(alertAcknowledgementsKey('analysis/b')))), {
    total: 1, acknowledged: 0,
  })
  assert.deepEqual([...readAlertAcknowledgements('broken JSON')], [])
})
