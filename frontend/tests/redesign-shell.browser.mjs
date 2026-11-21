import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.FINSIGHT_PLAYWRIGHT
  ? pathToFileURL(process.env.FINSIGHT_PLAYWRIGHT).href : 'playwright')
const browser = await chromium.launch({ executablePath: process.env.FINSIGHT_CHROME })
const origin = process.env.FINSIGHT_SMOKE_ORIGIN ?? 'http://127.0.0.1:8000'

try {
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } })
  page.setDefaultTimeout(5000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin)
  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  const modes = page.getByRole('group', { name: 'Workspace layout' })
  const redesigned = modes.getByRole('button', { name: 'Redesigned' })
  const classic = modes.getByRole('button', { name: 'Classic' })
  await redesigned.click()
  await page.getByText('Synthetic transaction data', { exact: true }).waitFor()
  await page.getByText('Observed recurring debits', { exact: true }).waitFor()
  await page.getByRole('region', { name: 'Subscription timeline' }).locator('.milestone-event').first().waitFor()
  const summary = page.getByRole('region', { name: 'Workspace summary and recurring costs' })
  await summary.getByRole('button', { name: 'Merchant', exact: true }).click()
  await summary.getByRole('table', { name: 'By merchant' }).waitFor()
  const downloadEvent = page.waitForEvent('download')
  await summary.getByRole('button', { name: 'Download cost summary CSV' }).click()
  const download = await downloadEvent
  assert.equal(download.suggestedFilename(), 'finsight-recurring-cost-summary.csv')
  assert.match(await readFile(await download.path(), 'utf8'), /INR,Total,Known annualized estimates,.*Inferred,Synthetic demo/)
  assert.equal(await redesigned.getAttribute('aria-pressed'), 'true')
  await classic.focus()
  await classic.press('Enter')
  assert.equal(await classic.getAttribute('aria-pressed'), 'true')
  await page.getByRole('region', { name: 'Subscription timeline' }).locator('.milestone-event').first().waitFor()
  await redesigned.click()

  await navigation.getByRole('button', { name: 'Import statement' }).click()
  const stages = page.getByRole('list', { name: 'Statement import stages' })
  assert.equal(await stages.locator('[aria-current="step"]').innerText(), 'Choose CSV')
  const today = new Date()
  const billDay = today.getUTCDate() <= 23 ? today.getUTCDate() + 5 : 2
  const charges = [-3, -2, -1].map(month =>
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + month, billDay)).toISOString().slice(0, 10))
  await page.getByLabel('Statement CSV').setInputFiles({
    name: 'shell-synthetic.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      'Posted,Vendor,Value',
      ...charges.map(date => `${date},Demo Studio,-599`),
      ...Array.from({ length: 2 }, () => `${charges[2]},Demo Shop,-40`),
    ].join('\n')),
  })
  await page.getByLabel('Date', { exact: true }).selectOption('0')
  await page.getByLabel('Merchant or description').selectOption('1')
  await page.getByLabel('Amount', { exact: true }).selectOption('0')
  await page.getByText('Choose a different CSV column for each mapped field.', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Analyze statement' }).isDisabled(), true)
  await page.getByLabel('Amount', { exact: true }).selectOption('2')
  assert.equal(await stages.locator('[aria-current="step"]').innerText(), 'Analyze')
  await classic.click()
  assert.equal(await page.getByLabel('Merchant or description').inputValue(), '1')
  await page.getByRole('button', { name: 'Analyze statement' }).click()
  await page.getByText('Private statement data', { exact: true }).waitFor()
  await navigation.getByRole('button', { name: /^Recurring payments/ }).click()
  await redesigned.click()
  const commitment = page.getByRole('button', { name: 'View Demo Studio' })
  await commitment.click()
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Detection evidence', { exact: true }).waitFor()
  assert.equal(await dialog.getByRole('region', { name: 'Observed supporting debits' }).getByRole('listitem').count(), 3)
  const relationships = dialog.getByRole('region', { name: 'Relationship evidence' })
  await relationships.getByRole('button', { name: 'Load graph evidence' }).click()
  await relationships.getByText(/^Evidence source: (Neo4j|Current analysis cache|Relationship evidence API)$/).waitFor()
  await relationships.getByText('Supporting transactions', { exact: true }).waitFor()
  const expenseReview = dialog.getByRole('region', { name: 'Expense review' })
  for (const [category, totals] of [['Business', '1 business · 0 personal'], ['Personal', '0 business · 1 personal']]) {
    await expenseReview.getByRole('button', { name: category, exact: true }).click()
    await expenseReview.getByText(`This charge: ${category.toLowerCase()}. Statement totals: ${totals}.`).waitFor()
  }
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await commitment.evaluate(element => element === document.activeElement), true)

  await navigation.getByRole('button', { name: 'Review', exact: true }).click()
  await classic.click()
  assert.equal(await navigation.getByRole('button', { name: 'Review', exact: true }).getAttribute('aria-current'), 'page')
  await page.getByText('Possible duplicate debit: Demo Shop', { exact: true }).click()
  assert.equal(await page.getByRole('list', { name: 'Supporting transactions' }).getByRole('listitem').count(), 2)
  await redesigned.click()
  await page.getByRole('button', { name: 'Acknowledge alert: Possible duplicate debit: Demo Shop' }).click()
  assert.equal(await page.getByRole('progressbar', { name: 'Acknowledged this session' }).getAttribute('aria-valuenow'), '1')
  const duplicateCard = page.locator('.alert-card').filter({ hasText: 'Possible duplicate debit: Demo Shop' })
  await duplicateCard.getByText('Possible duplicate debit: Demo Shop', { exact: true }).click()
  await duplicateCard.getByText('AI context', { exact: true }).click()
  await duplicateCard.getByLabel('Explanation language').selectOption('hi')
  await duplicateCard.getByLabel('Share this summary with Sarvam AI').check()
  await duplicateCard.getByRole('button', { name: 'Generate context' }).click()
  await duplicateCard.getByText('AI context is unavailable. Read the original English evidence here.', { exact: true }).waitFor()
  assert.equal(await duplicateCard.getByRole('list', { name: 'Supporting transactions' }).getByRole('listitem').count(), 2)
  await navigation.getByRole('button', { name: 'Forecast', exact: true }).click()
  await redesigned.click()
  await page.getByRole('heading', { name: '30-day debit calendar' }).waitFor()
  await page.locator('.forecast-calendar').getByRole('button', { name: 'Demo Studio' }).waitFor()
  const chart = page.getByRole('region', { name: 'Payment history and forecast' })
  await chart.getByLabel('Recurring payment').selectOption({ label: 'Demo Studio' })
  const series = chart.getByRole('table')
  assert.equal(await series.getByRole('cell', { name: 'Observed', exact: true }).count(), 3)
  assert.ok(await series.getByRole('cell', { name: 'Inferred', exact: true }).count() >= 1)
  assert.equal(await chart.locator('.forecast-card-inferred').first().evaluate(element =>
    getComputedStyle(element).strokeDasharray !== 'none'), true)

  for (const [account, currency] of [['Demo Household', 'INR'], ['Demo Workspace', 'USD']]) {
    const saved = await page.request.post(`${origin}/api/local-statement`, {
      headers: { Origin: origin },
      data: { action: 'save', account, statement: {
        currency,
        csv: ['date,description,amount', ...charges.map(date => `${date},Synthetic service,-25`)].join('\n'),
        mapping: { date: 0, description: 1, amount: 2 },
      } },
    })
    assert.equal(saved.status(), 200)
  }
  const workspace = page.locator('.workspace-selector')
  await workspace.locator('summary').click()
  await workspace.getByRole('button', { name: 'List saved workspaces' }).click()
  const comparison = workspace.getByRole('region', { name: 'Household workspace comparison' })
  await comparison.getByRole('checkbox', { name: 'Demo Household' }).check()
  await comparison.getByRole('checkbox', { name: 'Demo Workspace' }).check()
  await comparison.getByRole('button', { name: 'Compare recurring commitments' }).click()
  await comparison.getByRole('heading', { name: 'INR', exact: true }).waitFor()
  await comparison.getByRole('heading', { name: 'USD', exact: true }).waitFor()
  assert.equal(await comparison.locator('time').count(), 2)
  await workspace.getByLabel('Saved workspace').selectOption('Demo Workspace')
  page.once('dialog', dialog => void dialog.accept())
  await workspace.getByRole('button', { name: 'Open saved workspace' }).click()
  await workspace.getByText('Workspace · Demo Workspace', { exact: true }).waitFor()
  await navigation.getByRole('button', { name: 'Forecast', exact: true }).click()

  await page.setViewportSize({ width: 320, height: 720 })
  await classic.click()
  await redesigned.click()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  assert.deepEqual(errors, [])
  console.log('PASS: demo and synthetic CSV journey in both layouts, retained mapping and workspace, keyboard switch, focus return, mobile shell')
} finally {
  await browser.close()
}
