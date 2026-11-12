import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IMPORT_PRESETS, applyImportPreset, parseImportCsv, projectMappedCsv } from '../src/components/importQuality.ts'

test('browser preview reads quoted commas, doubled quotes, multiline fields and BOM', () => {
  const parsed = parseImportCsv('\ufeffDay,Payee,Value,Account\r\n2025-01-05,"Shop, ""Prime""\r\nCard",-42,secret\r\n\r\n')
  assert.deepEqual(parsed.columns, ['Day', 'Payee', 'Value', 'Account'])
  assert.deepEqual(parsed.rows, [['2025-01-05', 'Shop, "Prime"\r\nCard', '-42', 'secret']])
  assert.throws(() => parseImportCsv('A,B\n"x"extra,1'), /quoting/)
  assert.throws(() => parseImportCsv('A,B\nx'), /number of fields/)
})

test('projected CSV sends only mapped values and uses semantic headers and remapped indices', () => {
  const parsed = parseImportCsv('Day,Payee,Value,Private heading\n2025-01-05,"Shop, Prime",-42,secret')
  const projected = projectMappedCsv(parsed, { date: 0, description: 1, amount: 2 })
  assert.deepEqual(projected.mapping, { date: 0, description: 1, amount: 2 })
  assert.deepEqual(parseImportCsv(projected.csv).rows, [['2025-01-05', 'Shop, Prime', '-42']])
  assert.doesNotMatch(projected.csv, /Private heading|secret/)
  assert.throws(() => projectMappedCsv(parsed, { date: 0, description: 0 }), /different CSV column/)
})

test('versioned preset maps split bank fields and keeps ambiguous headers unmapped', () => {
  const preset = IMPORT_PRESETS.find(({ id }) => id === 'split-day-first-v1')
  assert.equal(preset?.dateFormat, 'dmy')
  assert.equal(preset?.split, true)
  const applied = applyImportPreset(['Posting Date', 'Narration', 'Withdrawal Amount', 'Deposit Amount', 'Balance'], preset)
  assert.deepEqual(applied, { date: 0, description: 1, debit_amount: 2, credit_amount: 3 })
  assert.equal(applyImportPreset(['Posting Date', 'Value Date'], preset).date, undefined)
})
