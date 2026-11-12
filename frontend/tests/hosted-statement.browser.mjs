import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.FINSIGHT_PLAYWRIGHT
  ? pathToFileURL(process.env.FINSIGHT_PLAYWRIGHT).href : 'playwright')
const origin = process.env.FINSIGHT_SMOKE_ORIGIN ?? 'https://127.0.0.1:8028'
const alice = process.env.FINSIGHT_TEST_ALICE_TOKEN
const bob = process.env.FINSIGHT_TEST_BOB_TOKEN
assert.ok(alice && bob, 'Provide two synthetic hosted credentials.')
const browser = await chromium.launch({ executablePath: process.env.FINSIGHT_CHROME })
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, reducedMotion: 'reduce' })
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const openImport = () => page.getByRole('button', { name: 'Import statement', exact: true }).click()
  const workspace = page.getByRole('region', { name: 'Hosted workspace' })
  async function connect(credential) {
    const issued = page.waitForResponse(response =>
      response.url() === origin + '/api/hosted-session' && response.request().method() === 'POST')
    await workspace.getByLabel('Hosted access credential').fill(credential)
    await workspace.getByRole('button', { name: 'Connect hosted workspace' }).click()
    const response = await issued
    assert.ok(response.ok())
    await page.getByLabel('Statement CSV').waitFor()
    return (await response.json()).token
  }

  await page.goto(origin)
  await openImport()
  assert.equal(await page.getByLabel('Statement CSV').count(), 0)
  const firstSession = await connect(alice)
  const uploaded = []
  page.on('request', request => {
    if (request.url() === origin + '/api/hosted-statement' && request.method() === 'POST') {
      const payload = request.postDataJSON()
      if (payload.action === 'analyze') uploaded.push(payload.statement.csv)
    }
  })
  await page.getByLabel('Statement CSV').setInputFiles({
    name: 'hosted-synthetic.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('date,description,amount,private account\n2025-01-10,Synthetic Hosted Debit,-100,synthetic-private-value\n'),
  })
  await page.getByRole('region', { name: 'Statement preview' }).waitFor()
  assert.deepEqual(uploaded, [])
  await page.getByRole('button', { name: 'Analyze statement' }).click()
  await page.getByText('Private statement data', { exact: true }).waitFor()
  assert.equal(uploaded.length, 1)
  assert.doesNotMatch(uploaded[0], /private account|synthetic-private-value/)
  await openImport()
  await workspace.getByLabel('Keep saved copy for').selectOption('7')
  page.once('dialog', dialog => dialog.accept())
  await workspace.getByRole('button', { name: 'Save hosted copy' }).click()
  await workspace.getByRole('status').filter({ hasText: 'Hosted copy saved' }).waitFor()
  const hosted = await browser.newContext({ ignoreHTTPSErrors: true })
  try {
    const request = async data => {
      const response = await hosted.request.post(origin + '/api/hosted-statement', {
        headers: { Authorization: 'Bearer ' + firstSession }, data,
      })
      assert.ok(response.ok())
      return response.json()
    }
    const seed = {
      action: 'save', save_confirmed: true, retention_days: 30,
      statement: { csv: 'date,description,amount\n2025-01-10,Pagination fixture,-1\n',
        mapping: { date: 0, description: 1, amount: 2 } },
    }
    const ids = []
    for (let index = 0; index < 20; index++) ids.push((await request(seed)).statement_id)
    await workspace.getByRole('button', { name: 'Refresh hosted statements' }).click()
    await workspace.getByRole('button', { name: 'Next saved statements' }).click()
    const savedOptions = workspace.getByLabel('Saved hosted statement').locator('option')
    await savedOptions.filter({ hasText: ids[19] }).waitFor({ state: 'attached' })
    assert.deepEqual(await savedOptions.allTextContents(), [ids[19]])
    for (const id of ids) await request({ action: 'delete', statement_id: id })
  } finally {
    await hosted.close()
  }
  const revoked = page.waitForResponse(response =>
    response.url() === origin + '/api/hosted-session' && response.request().method() === 'DELETE')
  await page.getByRole('button', { name: 'Sign out of hosted workspace' }).click()
  assert.equal(await page.getByText('Private statement data', { exact: true }).count(), 0)
  assert.equal((await revoked).status(), 204)
  for (const unusable of [alice, firstSession]) {
    const response = await page.request.post(origin + '/api/hosted-statement', {
      headers: { Authorization: 'Bearer ' + unusable }, data: { action: 'list' },
    })
    assert.equal(response.status(), 401)
  }
  await connect(bob)
  assert.ok(await workspace.getByRole('button', { name: 'Restore hosted statement' }).isDisabled())
  await page.reload()
  await openImport()
  assert.equal(await page.getByLabel('Statement CSV').count(), 0)
  await connect(alice)
  await workspace.getByRole('button', { name: 'Restore hosted statement' }).click()
  await page.getByText('Private statement data', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Transactions', exact: true }).click()
  await page.getByText('Synthetic Hosted Debit', { exact: true }).waitFor()
  await openImport()
  await workspace.getByRole('button', { name: 'Refresh hosted statements' }).click()
  page.once('dialog', dialog => dialog.accept())
  await workspace.getByRole('button', { name: 'Delete hosted statement' }).click()
  await workspace.getByText('Hosted copy deleted.').waitFor()
  await page.route(origin + '/api/hosted-session', route => route.fulfill({ status: 503 }))
  await page.getByRole('button', { name: 'Sign out of hosted workspace' }).click()
  await page.getByRole('alert').filter({ hasText: 'The server could not confirm revocation.' }).waitFor()
  assert.equal(await page.getByLabel('Statement CSV').count(), 0)
  await page.unroute(origin + '/api/hosted-session')
  await page.clock.install()
  await connect(bob)
  await page.clock.fastForward(61 * 60 * 1000)
  await page.getByRole('alert').filter({ hasText: 'Your hosted session expired.' }).waitFor()
  assert.equal(await page.getByLabel('Statement CSV').count(), 0)
  assert.deepEqual(await page.evaluate(() => [Object.entries(localStorage), Object.entries(sessionStorage)]), [[], []])
  assert.deepEqual(errors, [])
  console.log('PASS: hosted session exchange, import, consented save, sign-out revocation, owner switch, reload, restore and deletion')
} finally {
  await browser.close()
}
