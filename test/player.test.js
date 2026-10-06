import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

/**
 * Just enough of the tabs API to see which tab opens, comes forward or
 * closes. Installed before the helpers load, since `api` is read at import.
 */
const tabs = new Map()
const session = {}
const state = { nextId: 1, current: null, removed: [], focused: [] }

globalThis.window = { location: { href: '' } }
globalThis.chrome = {
  runtime: { getURL: (path) => `chrome-extension://hls/${path}` },
  storage: {
    session: {
      get: async (key) => ({ [key]: session[key] }),
      set: async (values) => Object.assign(session, values),
    },
  },
  tabs: {
    create: async ({ url }) => {
      const tab = { id: state.nextId++, url, windowId: 1 }
      tabs.set(tab.id, tab)
      return tab
    },
    get: async (id) => {
      if (!tabs.has(id)) throw new Error(`No tab with id: ${id}`)
      return tabs.get(id)
    },
    update: async (id) => {
      state.focused.push(id)
      return tabs.get(id)
    },
    remove: async (id) => {
      tabs.delete(id)
      state.removed.push(id)
    },
    getCurrent: async () => state.current,
  },
  windows: { update: async () => {} },
}

const { leavePlayer, openHome, openPlayer, rememberHomeTab } = await import('@/helper/player')

beforeEach(() => {
  tabs.clear()
  for (const key of Object.keys(session)) delete session[key]
  Object.assign(state, { nextId: 1, current: null, removed: [], focused: [] })
  window.location.href = ''
})

describe('openPlayer', () => {
  it('opens the episode in a tab of its own', async () => {
    const tab = await openPlayer('m1', 'e2')
    assert.equal(tab.url, 'chrome-extension://hls/player.html?movie=m1&episode=e2')
    assert.equal(window.location.href, '', 'the library tab stays where it was')
  })
})

describe('leavePlayer', () => {
  it('brings the library forward and closes the player tab', async () => {
    const home = await openHome()
    state.current = await openPlayer('m1', 'e1')

    await leavePlayer()
    assert.ok(state.focused.includes(home.id))
    assert.deepEqual(state.removed, [state.current.id])
    assert.equal(window.location.href, '')
  })

  it('turns the player into the library when that tab is gone', async () => {
    const home = await openHome()
    state.current = await openPlayer('m1', 'e1')
    tabs.delete(home.id)

    await leavePlayer()
    assert.deepEqual(state.removed, [], 'nothing left to come back to, so nothing closes')
    assert.equal(window.location.href, 'home.html')
  })

  it('never closes the library tab itself', async () => {
    // A player reached in the library's own tab — a reload, a bookmark.
    const home = await openHome()
    state.current = home

    await leavePlayer()
    assert.deepEqual(state.removed, [])
    assert.equal(window.location.href, 'home.html')
  })
})

describe('rememberHomeTab', () => {
  it('makes a library opened any other way the one the toolbar icon returns to', async () => {
    const library = await chrome.tabs.create({ url: 'chrome-extension://hls/home.html' })
    state.current = library
    await rememberHomeTab()

    const opened = await openHome()
    assert.equal(opened.id, library.id, 'focused, not a second library')
    assert.equal(tabs.size, 1)
  })
})
