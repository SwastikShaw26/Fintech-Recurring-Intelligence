export interface ImportCsv {
  columns: string[]
  rows: string[][]
}

interface ImportPreset {
  id: string
  label: string
  dateFormat: string
  sign: string
  split: boolean
  fields: string[]
}

const headerAliases: Record<string, string[]> = {
  date: ['transaction_date', 'posting_date', 'posted_date', 'value_date'],
  description: ['transaction_description', 'merchant', 'narration', 'particulars'],
  amount: ['transaction_amount', 'signed_amount'],
  debit_amount: ['debit', 'withdrawal', 'withdrawal_amount', 'money_out'],
  credit_amount: ['credit', 'deposit', 'deposit_amount', 'money_in'],
  direction: ['debit_credit', 'dr_cr'],
  payment_method: ['payment_mode', 'payment_channel'],
}

export const IMPORT_PRESETS: ImportPreset[] = [
  { id: 'split-day-first-v1', label: 'Day-first withdrawal / deposit · v1', dateFormat: 'dmy',
    sign: 'negative_debit', split: true, fields: ['debit_amount', 'credit_amount'] },
  { id: 'signed-iso-v1', label: 'ISO date with signed amount · v1', dateFormat: 'iso',
    sign: 'negative_debit', split: false, fields: ['amount'] },
  { id: 'direction-day-first-v1', label: 'Day-first amount with Dr/Cr · v1', dateFormat: 'dmy',
    sign: 'negative_debit', split: false, fields: ['amount', 'direction'] },
]

function suggestedMapping(columns: string[], fields: string[]) {
  const normalized = columns.map(column => column.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
  return Object.fromEntries(fields.flatMap(key => {
    const matches = normalized.flatMap((name, index) => name === key || headerAliases[key]?.includes(name) ? [index] : [])
    return matches.length === 1 ? [[key, matches[0]]] : []
  }))
}

export function suggestImportMapping(columns: string[]) {
  return suggestedMapping(columns, Object.keys(headerAliases))
}

export function applyImportPreset(columns: string[], preset: ImportPreset) {
  return suggestedMapping(columns, ['date', 'description', ...preset.fields, 'payment_method'])
}

export function parseImportCsv(text: string): ImportCsv {
  if (text.includes('\0')) throw new Error('Choose a UTF-8 CSV statement.')
  const source = text.replace(/^\ufeff/, '')
  const rows: string[][] = []
  let columns: string[] | null = null
  let row: string[] = []
  let field = ''
  let state: 'plain' | 'quoted' | 'closed' = 'plain'
  let line = 1

  function endField() {
    row.push(field)
    if (row.length > 64) throw new Error('Use at most 64 CSV columns.')
    field = ''
    state = 'plain'
  }

  function endRow() {
    endField()
    if (!columns) {
      columns = row.map(value => value.trim())
      if (columns.some(value => !value || value.length > 150)) {
        throw new Error('The first CSV row must contain column names.')
      }
    } else if (row.some(value => value.trim())) {
      if (row.length !== columns.length) throw new Error(`CSV row ending on line ${line} has a different number of fields.`)
      if (rows.length >= 10_000) throw new Error('Use a statement with at most 10,000 transactions.')
      rows.push(row)
    }
    row = []
  }

  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (state === 'quoted') {
      if (character === '"' && source[index + 1] === '"') {
        field += '"'
        index++
      } else if (character === '"') {
        state = 'closed'
      } else {
        field += character
        if (character === '\n' || (character === '\r' && source[index + 1] !== '\n')) line++
      }
    } else if (character === ',') {
      endField()
    } else if (character === '\r' || character === '\n') {
      endRow()
      if (character === '\r' && source[index + 1] === '\n') index++
      line++
    } else if (state === 'closed') {
      throw new Error('The statement contains invalid CSV quoting.')
    } else if (character === '"' && field === '') {
      state = 'quoted'
    } else {
      field += character
    }
  }
  if (state === 'quoted') throw new Error('The statement contains invalid CSV quoting.')
  if (field || row.length || state === 'closed') endRow()
  if (!columns) throw new Error('The first CSV row must contain column names.')
  if (!rows.length) throw new Error('The statement has no transactions.')
  return { columns, rows }
}

export function projectMappedCsv(statement: ImportCsv, selected: Record<string, number>) {
  const fields = Object.keys(selected)
  const indices = fields.map(key => selected[key])
  if (!fields.length || indices.some(index => !Number.isInteger(index) || index < 0 || index >= statement.columns.length)
      || new Set(indices).size !== indices.length) {
    throw new Error('Choose a different CSV column for each mapped field.')
  }
  const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"'
  return {
    csv: [fields.join(','), ...statement.rows.map(row => indices.map(index => quote(row[index])).join(','))].join('\n'),
    mapping: Object.fromEntries(fields.map((field, index) => [field, index])),
  }
}
