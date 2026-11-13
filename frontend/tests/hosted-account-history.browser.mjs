import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.FINSIGHT_PLAYWRIGHT
  ? pathToFileURL(process.env.FINSIGHT_PLAYWRIGHT).href : 'playwright')
const origin = process.env.FINSIGHT_SMOKE_ORIGIN ?? 'https://127.0.0.1:8028'
const credential = process.env.FINSIGHT_TEST_HISTORY_TOKEN
assert.ok(credential, 'Provide a synthetic hosted credential.')
const browser = await chromium.launch({ executablePath: process.env.FINSIGHT_CHROME })
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, reducedMotion: 'reduce' })
  page.setDefaultTimeout(8000)
  const workspace = page.getByRole('region', { name: 'Hosted workspace' })
  const openImport = () => page.getByRole('button', { name: 'Import statement', exact: true }).click()
  const savedOptions = workspace.getByLabel('Saved hosted statement')
  async function importCopy(rows) {
    await page.getByLabel('Statement CSV').setInputFiles({
      name: 'hosted-history-fixture.csv', mimeType: 'text/csv',
      buffer: Buffer.from('date,description,amount\n' + rows),
    })
    await page.getByRole('button', { name: 'Analyze statement' }).click()
    await page.getByRole('heading', { name: 'Recurring charges in your history.', exact: true }).waitFor()
    await openImport()
  }
  async function saveCopy(name) {
    await workspace.getByLabel('Snapshot name').fill(name)
    page.once('dialog', dialog => dialog.accept())
    await workspace.getByRole('button', { name: 'Save hosted copy' }).click()
    await workspace.getByRole('status').filter({ hasText: 'Hosted copy saved' }).waitFor()
  }
  await page.goto(origin)
  await openImport()
  await workspace.getByLabel('Hosted access credential').fill(credential)
  await workspace.getByRole('button', { name: 'Connect hosted workspace' }).click()
  await importCopy('2025-01-01,Outside,-90\n2025-02-03,Daily debit,-20\n')
  await saveCopy('Daily account')
  await importCopy('2025-02-01,Travel debit,-40\n2025-03-01,Outside,-90\n')
  await saveCopy('Travel account')
  await workspace.getByRole('button', { name: 'Refresh hosted statements' }).click()
  await savedOptions.selectOption({ label: 'Travel account · v1' })
  await workspace.getByRole('button', { name: 'Add selected copy to comparison' }).click()
  await savedOptions.selectOption({ label: 'Daily account · v1' })
  await workspace.getByRole('button', { name: 'Add selected copy to comparison' }).click()
  await workspace.getByRole('button', { name: 'Compare selected periods' }).click()
  await workspace.getByText('Shared period 2025-02-01 to 2025-02-03.', { exact: false }).waitFor()
  await workspace.getByText(/Daily account · v1 · 1 transactions · Debits 20.0/).waitFor()
  await workspace.getByText(/Travel account · v1 · 1 transactions · Debits 40.0/).waitFor()
  await workspace.getByLabel('Save as').selectOption('replace')
  await saveCopy('Daily replacement')
  assert.equal(await savedOptions.locator('option').filter({ hasText: 'Daily account · v1' }).count(), 0)
  assert.equal(await savedOptions.locator('option').filter({ hasText: 'Daily replacement · v2' }).count(), 1)
  for (const label of ['Travel account · v1', 'Daily replacement · v2']) {
    await savedOptions.selectOption({ label })
    page.once('dialog', dialog => dialog.accept())
    await workspace.getByRole('button', { name: 'Delete hosted statement' }).click()
    await workspace.getByText('Hosted copy deleted.').waitFor()
  }
  await page.getByRole('button', { name: 'Sign out of hosted workspace' }).click()
  console.log('PASS: hosted account names, common-period comparison, atomic replacement and deletion')
} finally {
  await browser.close()
}
