import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const source = process.env.FINSIGHT_MONEYDATA_CSV
if (!source) throw new Error('Set FINSIGHT_MONEYDATA_CSV to the local MoneyData v1 CSV.')
const origin = process.env.FINSIGHT_SMOKE_ORIGIN ?? 'http://127.0.0.1:8000'
const { chromium } = await import(process.env.FINSIGHT_PLAYWRIGHT
  ? pathToFileURL(process.env.FINSIGHT_PLAYWRIGHT).href : 'playwright')

// Pass only the four mapped columns to Chromium. The source CSV remains local and unchanged.
const data = execFileSync(process.env.FINSIGHT_PYTHON ?? 'python', ['-c', `
import csv, sys
columns = ["Transaction Date", "Transaction Description", "Debit Amount", "Credit Amount"]
sys.stdout.reconfigure(encoding="utf-8", newline="")
with open(sys.argv[1], encoding="utf-8-sig", newline="") as source:
    writer = csv.DictWriter(sys.stdout, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(csv.DictReader(source))
`, source])
const browser = await chromium.launch({ executablePath: process.env.FINSIGHT_CHROME })
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  page.setDefaultTimeout(15000)
  const transfers = []
  page.on('request', request => { if (request.method() === 'POST') transfers.push(new URL(request.url()).origin) })
  await page.goto(origin)
  await page.getByRole('button', { name: 'Import statement' }).click()
  await page.getByLabel('Statement CSV').setInputFiles({ name: 'moneydata-minimized.csv', mimeType: 'text/csv', buffer: data })
  await page.getByRole('region', { name: 'Statement preview' }).waitFor()
  await page.getByText('Showing 5 of 6567 records.', { exact: false }).waitFor()
  assert.equal(await page.getByLabel('Amount layout').inputValue(), 'split')
  await page.getByLabel('Date', { exact: true }).selectOption('0')
  await page.getByLabel('Merchant or description').selectOption('1')
  await page.getByLabel('Date format').selectOption('dmy')
  await page.getByLabel('Statement currency').selectOption('unspecified')
  const analysis = page.waitForResponse(response => response.url().endsWith('/api/private-statement') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Analyze statement' }).click()
  const response = await analysis
  assert.equal(response.status(), 200)
  const result = await response.json()
  assert.equal(result.transactions.length, 6567)
  assert.equal(result.summary.debit_transaction_count, 6122)
  assert.equal(result.transactions.filter(row => row.direction === 'credit').length, 445)
  assert.equal(result.summary.currency, 'unspecified')
  assert.ok(result.commitments.length > 0)
  await page.getByText('Private statement data', { exact: true }).waitFor()
  const overview = page.getByRole('region', { name: 'Recurring payment summary' })
  assert.match(await overview.innerText(), /units/)
  assert.doesNotMatch(await overview.innerText(), /₹|INR/)
  assert.deepEqual(transfers, [new URL(origin).origin])
  const browserStore = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))
  assert.deepEqual(browserStore, { local: 0, session: 0 })
  await page.getByRole('button', { name: 'Clear private statement' }).click()
  await page.getByText('Synthetic transaction data', { exact: true }).waitFor()
  await page.reload()
  await page.getByText('Synthetic transaction data', { exact: true }).waitFor()
  console.log(`MoneyData workflow passed: ${result.transactions.length} rows, ${result.summary.debit_transaction_count} debits, 445 credits, ${result.commitments.length} inferred commitments.`)
  console.log('Verified minimized preview, mapping, source units, local-only POSTs, volatile state, clear and reload. No recurrence labels were available.')
} finally {
  await browser.close()
}
