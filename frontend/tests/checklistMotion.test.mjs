import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shouldCelebrateChecklist } from '../src/components/checklistMotion.ts'

test('seal turns when the last step is checked, without replaying on report or revisit', () => {
  assert.equal(shouldCelebrateChecklist(3, 4, 4), true)
  assert.equal(shouldCelebrateChecklist(4, 4, 4), false)
  assert.equal(shouldCelebrateChecklist(4, 3, 4), false)
  assert.equal(shouldCelebrateChecklist(0, 0, 0), false)
})
