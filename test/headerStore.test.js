import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { createHeaderStore } from '@/background/headerStore'

/** `storage.session` as Firefox exposes it: promise-based get/set of whole keys. */
function fakeSession(initial = {}) {
  const data = structuredClone(initial)
  return {
    data,
    async get(key) {
      return key in data ? { [key]: structuredClone(data[key]) } : {}
    },
    async set(values) {
      Object.assign(data, structuredClone(values))
    },
  }
}

const REFERER = [['referer', 'https://site.test/']]

describe('createHeaderStore', () => {
  it('outlives the background being unloaded', async () => {
    // The bug: a paused video let Firefox unload the background, and the next
    // segment request found no Referer for its tab.
    const session = fakeSession()
    await createHeaderStore(session).set(7, REFERER)

    const woken = createHeaderStore(session)
    assert.equal(woken.loaded, false)
    assert.equal(woken.get(7), undefined, 'nothing until the stored rules are read')
    await woken.load()
    assert.deepEqual(woken.get(7), REFERER)
  })

  it('forgets a tab that was cleared', async () => {
    const session = fakeSession()
    const store = createHeaderStore(session)
    await store.set(7, REFERER)
    await store.delete(7)

    const woken = createHeaderStore(session)
    await woken.load()
    assert.equal(woken.get(7), undefined)
  })

  it('lets a tab set after waking win over what was stored', async () => {
    const session = fakeSession({ tabHeaders: { 7: [['referer', 'https://old.test/']] } })
    const store = createHeaderStore(session)
    await store.set(7, REFERER)
    assert.deepEqual(store.get(7), REFERER)
  })

  it('reads the stored rules once however often it is asked', async () => {
    const session = fakeSession()
    let reads = 0
    const get = session.get
    session.get = (key) => {
      reads += 1
      return get(key)
    }
    const store = createHeaderStore(session)
    await Promise.all([store.load(), store.load(), store.set(1, REFERER)])
    assert.equal(reads, 1)
  })

  it('works in memory without a session area', async () => {
    const store = createHeaderStore(null)
    assert.equal(store.loaded, true, 'Chrome never waits')
    await store.set(3, REFERER)
    assert.deepEqual(store.get(3), REFERER)
  })

  it('survives a session area that fails to read', async () => {
    const store = createHeaderStore({
      get: async () => {
        throw new Error('gone')
      },
      set: async () => {},
    })
    await store.load()
    assert.equal(store.loaded, true, 'a failed restore must not block every request')
  })
})
