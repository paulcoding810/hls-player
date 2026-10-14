import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { INTRO_JUMP_WINDOW, introJumpTarget } from '@/helper/skip'

describe('introJumpTarget', () => {
  it('jumps the intro length ahead of wherever playback is', () => {
    assert.equal(introJumpTarget(95, 2700, 90), 185)
    assert.equal(introJumpTarget(0, 2700, 90), 90)
  })

  it('is offered only in the opening stretch', () => {
    assert.equal(introJumpTarget(INTRO_JUMP_WINDOW - 1, 2700, 90), INTRO_JUMP_WINDOW + 89)
    assert.equal(introJumpTarget(INTRO_JUMP_WINDOW, 2700, 90), null)
  })

  it('is off without an intro length', () => {
    assert.equal(introJumpTarget(30, 2700, 0), null)
    assert.equal(introJumpTarget(30, 2700, null), null)
  })

  it('needs a real end, and never jumps past it', () => {
    assert.equal(introJumpTarget(30, Infinity, 90), null)
    assert.equal(introJumpTarget(30, NaN, 90), null)
    assert.equal(introJumpTarget(30, 100, 90), null)
  })
})
