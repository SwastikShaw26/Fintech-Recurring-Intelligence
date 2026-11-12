import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.FINSIGHT_PLAYWRIGHT
  ? pathToFileURL(process.env.FINSIGHT_PLAYWRIGHT).href : 'playwright')
const origin = process.env.FINSIGHT_SMOKE_ORIGIN ?? 'http://127.0.0.1:8027'
const browser = await chromium.launch({ executablePath: process.env.FINSIGHT_CHROME })
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin)
  await page.getByText('Synthetic transaction data', { exact: true }).waitFor()
  await page.getByRole('region', { name: 'Subscription timeline' }).locator('.milestone-event').first().waitFor()
  assert.equal(await page.getByRole('button', { name: 'Import statement', exact: true }).count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS: deployment renders the synthetic timeline and hides statement import')
} finally {
  await browser.close()
}
