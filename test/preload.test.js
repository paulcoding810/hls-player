import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { createPreloader, preloadDue } from '@/helper/preload'

function clock() {
  let time = 0
  return { now: () => time, advance: (ms) => (time += ms) }
}

describe('createPreloader', () => {
  it('hands the streams over once, and only once', async () => {
    const preloader = createPreloader({ ttl: 1000 })
    preloader.start('a', async () => ['stream'])

    assert.deepEqual(await preloader.take('a'), ['stream'])
    assert.equal(preloader.take('a'), null)
  })

  it('misses on another episode and empties the slot', () => {
    const preloader = createPreloader({ ttl: 1000 })
    preloader.start('a', async () => [])

    assert.equal(preloader.take('b'), null)
    // Jumping elsewhere must not leave the old entry for a later visit.
    assert.equal(preloader.take('a'), null)
  })

  it('refuses an entry past its ttl', () => {
    const time = clock()
    const preloader = createPreloader({ ttl: 1000, now: time.now })
    preloader.start('a', async () => [])
    time.advance(1001)

    assert.equal(preloader.take('a'), null)
  })

  it('drops a load that failed', async () => {
    const preloader = createPreloader({ ttl: 1000 })
    preloader.start('a', async () => {
      throw new Error('down')
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.equal(preloader.take('a'), null)
  })

  it('loads a key once however often it is started', async () => {
    const preloader = createPreloader({ ttl: 1000 })
    let calls = 0
    const load = async () => (calls += 1)
    preloader.start('a', load)
    preloader.start('a', load)
    await preloader.take('a')

    assert.equal(calls, 1)
  })

  it('replaces a different key', async () => {
    const preloader = createPreloader({ ttl: 1000 })
    preloader.start('a', async () => 'a')
    preloader.start('b', async () => 'b')

    assert.equal(await preloader.take('b'), 'b')
  })
})

describe('preloadDue', () => {
  for (const duration of [Infinity, NaN, 0]) {
    it(`never fires without a real end (${duration})`, () =>
      assert.equal(preloadDue(10, duration, 0, 120), false))
  }

  it('waits until the lead before the end', () => {
    assert.equal(preloadDue(2000, 2400, 0, 120), false)
    assert.equal(preloadDue(2280, 2400, 0, 120), true)
  })

  it('starts with an outro window longer than the lead', () => {
    assert.equal(preloadDue(2100, 2400, 300, 120), true)
    assert.equal(preloadDue(2099, 2400, 300, 120), false)
  })

  it('ignores an outro longer than the episode', () =>
    assert.equal(preloadDue(100, 2400, 5000, 120), false))
})
