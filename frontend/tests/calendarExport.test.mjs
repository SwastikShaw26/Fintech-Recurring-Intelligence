import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarExportEntries, serializeCalendar } from '../src/components/calendarExport.ts'

test('calendar export excludes stale, incomplete, unsupported and reported entries', () => {
  const entry = { date: '2026-11-20', amount: 149, commitment: { cadence: 'monthly' }, uncertainty: [] }
  assert.deepEqual(calendarExportEntries([
    entry,
    { ...entry, date: '2026-11-01' },
    { ...entry, date: '2026-11-31' },
    { ...entry, uncertainty: ['No recent supporting debit'] },
    { ...entry, amount: null },
    { ...entry, commitment: { cadence: 'irregular' } },
    { ...entry, commitment: { cadence: 'monthly', reported: true } },
  ], '2026-11-12', item => item.reported === true), [entry])
})

test('calendar uses all-day estimates and safely folds and escapes custom disclosure', () => {
  const title = '₹'.repeat(30) + ', Pay; \\ today\r\nATTENDEE:someone'
  const payload = serializeCalendar([
    { id: 'one', date: '2026-11-20', title: 'Estimated payment', description: 'Date may change.' },
    { id: 'two', date: '2026-11-21', title, description: 'Estimated amount ₹149' },
  ], new Date('2026-11-12T12:00:00Z'))
  assert.match(payload, /DTSTART;VALUE=DATE:20261120\r\n/)
  assert.match(payload, /DTSTAMP:20261112T120000Z\r\n/)
  assert.match(payload, /SUMMARY:Estimated payment\r\n/)
  assert.ok(payload.split('\r\n').every(line => Buffer.byteLength(line, 'utf8') <= 75))
  assert.doesNotMatch(payload, /\r\nATTENDEE:/)
  assert.match(payload.replaceAll('\r\n ', ''), /Pay\\; \\\\ today\\nATTENDEE:someone/)
  assert.match(payload, /END:VCALENDAR\r\n$/)
})
