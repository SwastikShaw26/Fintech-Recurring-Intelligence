import assert from 'node:assert/strict'
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
  await page.getByText('Synthetic transaction data', { exact: true }).waitFor()
  await page.getByText('Observed recurring debits', { exact: true }).waitFor()
  await page.getByRole('region', { name: 'Subscription timeline' }).locator('.milestone-event').first().waitFor()
  assert.equal(await redesigned.getAttribute('aria-pressed'), 'true')
  await classic.focus()
  await classic.press('Enter')
  assert.equal(await classic.getAttribute('aria-pressed'), 'true')
  await page.getByRole('region', { name: 'Subscription timeline' }).locator('.milestone-event').first().waitFor()
  await redesigned.click()

  await navigation.getByRole('button', { name: 'Import statement' }).click()
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
  await page.getByLabel('Amount', { exact: true }).selectOption('2')
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

  await page.setViewportSize({ width: 320, height: 720 })
  await classic.click()
  await redesigned.click()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  assert.deepEqual(errors, [])
  console.log('PASS: demo and synthetic CSV journey in both layouts, retained mapping and workspace, keyboard switch, focus return, mobile shell')
} finally {
  await browser.close()
}
