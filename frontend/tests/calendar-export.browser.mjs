import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { text } from 'node:stream/consumers'

const { chromium } = await import(process.env.FINSIGHT_PLAYWRIGHT
  ? pathToFileURL(process.env.FINSIGHT_PLAYWRIGHT).href : 'playwright')
const origin = process.env.FINSIGHT_SMOKE_ORIGIN ?? 'http://127.0.0.1:8000'
const browser = await chromium.launch({ executablePath: process.env.FINSIGHT_CHROME })
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await page.clock.setFixedTime(new Date('2026-11-12T12:00:00Z'))
  const example = {
    commitment_id: 'calendar-fixture', display_name: 'Private Calendar Merchant', cadence: 'monthly',
    last_observed_date: '2026-10-20', typical_amount: 149, transaction_count: 4, amount_pattern: 'stable',
  }
  await page.route('**/api/commitments', route => route.fulfill({
    json: { commitments: [example, {
      ...example, commitment_id: 'stale-fixture', display_name: 'Stale Calendar Merchant', last_observed_date: '2025-10-20',
    }] },
  }))
  await page.goto(origin)
  await page.getByRole('button', { name: 'Forecast', exact: true }).click()
  await page.getByText('Export calendar reminders', { exact: true }).click()
  const chooser = page.getByRole('group', { name: 'Payments to export' })
  await chooser.getByRole('checkbox', { name: /Private Calendar Merchant/ }).check()
  assert.equal(await chooser.getByRole('checkbox', { name: /Stale Calendar Merchant/ }).count(), 0)
  const preview = page.getByRole('list', { name: 'Calendar file preview' })
  await preview.getByText(/Estimated payment/).waitFor()
  assert.doesNotMatch(await preview.innerText(), /Private Calendar Merchant|149/)

  async function downloadCalendar() {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download calendar file' }).click()
    const download = await pending
    assert.equal(download.suggestedFilename(), 'finsight-estimated-payments.ics')
    return text(await download.createReadStream())
  }
  const generic = await downloadCalendar()
  assert.match(generic, /SUMMARY:Estimated payment\r\n/)
  assert.match(generic, /DTSTART;VALUE=DATE:20261120/)
  assert.doesNotMatch(generic, /Private Calendar Merchant|149|calendar-fixture/)
  await page.getByRole('checkbox', { name: 'Include merchant names' }).check()
  await page.getByRole('checkbox', { name: 'Include estimated amounts' }).check()
  assert.match(await preview.innerText(), /Private Calendar Merchant.*149/)
  const disclosed = await downloadCalendar()
  assert.match(disclosed, /Private Calendar Merchant/)
  assert.match(disclosed, /Estimated amount.*149/)
  assert.equal(disclosed.match(/UID:[^\r]+/)[0], generic.match(/UID:[^\r]+/)[0])
  console.log('PASS: private calendar selection, redacted default, optional preview, and iCalendar download')
} finally {
  await browser.close()
}
