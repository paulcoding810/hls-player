import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { jsonReply, stubFetch, stubStorage } from './helpers.mjs'
import { addMovie, getLibrary } from '@/helper/library'
import {
  addPlugin,
  EMPTY_PLUGIN,
  getPlugins,
  pluginToJson,
  refreshMovie,
  savePlugins,
  searchAll,
} from '@/helper/plugins'

const ADDON = {
  id: 'p1',
  name: 'Addon',
  enabled: true,
  kind: 'stremio',
  url: 'https://addon.test/manifest.json',
  referer: 'https://ref.test/',
  adPattern: '^/ads/.+\\.ts$',
}

const MANIFEST = {
  name: 'Addon',
  resources: ['catalog', 'meta', 'stream'],
  types: ['series'],
  catalogs: [{ type: 'series', id: 'top', name: 'Top', extra: [{ name: 'search' }] }],
}

beforeEach(() => stubStorage())

describe('the source store', () => {
  it('drops a source described by hand-written paths', async () => {
    // Nothing reads those any more, so they are cleared out once.
    await savePlugins([
      { id: 'old', name: 'My API', enabled: true, search: { url: 'https://a/?q={query}' } },
      ADDON,
    ])

    const kept = await getPlugins()
    assert.deepEqual(
      kept.map((plugin) => plugin.id),
      ['p1'],
    )
  })

  it('writes the shorter list back, so it is not re-decided every read', async () => {
    const store = stubStorage()
    await savePlugins([{ id: 'old', name: 'My API', enabled: true }, ADDON])
    await getPlugins()
    assert.equal(store.plugins.items.length, 1)
  })

  it('leaves a store of addons alone', async () => {
    await savePlugins([ADDON])
    assert.equal((await getPlugins()).length, 1)
  })

  it('starts a new source as an addon', async () => {
    assert.equal(EMPTY_PLUGIN.kind, 'stremio')
    assert.equal((await addPlugin({ name: 'A', url: 'https://a.test' })).kind, 'stremio')
  })
})

describe('searchAll', () => {
  it('returns a group per catalog, carrying the source it came from', async () => {
    stubFetch(async (url) => {
      if (url.includes('manifest')) return jsonReply(MANIFEST)
      return jsonReply({ metas: [{ id: 'tt1', type: 'series', name: 'Hit' }] })
    })

    const groups = await searchAll([ADDON], 'q')
    assert.equal(groups.length, 1)
    assert.equal(groups[0].plugin.id, 'p1')
    assert.equal(groups[0].catalog.name, 'Top')
    assert.equal(groups[0].results.length, 1)
  })

  it('keeps a working source when another fails, and skips disabled ones', async () => {
    stubFetch(async (url) => {
      if (url.includes('bad.test')) throw new TypeError('Failed to fetch')
      if (url.includes('manifest')) return jsonReply(MANIFEST)
      return jsonReply({ metas: [{ id: 'tt1', type: 'series', name: 'Hit' }] })
    })

    const groups = await searchAll(
      [
        { ...ADDON, id: 'good', name: 'Good' },
        { ...ADDON, id: 'bad', name: 'Bad', url: 'https://bad.test/manifest.json' },
        { ...ADDON, id: 'off', enabled: false },
      ],
      'q',
    )

    assert.ok(!groups.some((group) => group.plugin.id === 'off'), 'a disabled source is skipped')
    assert.equal(groups.find((group) => group.plugin.id === 'good').results.length, 1)

    // The manifest failed, so which catalogs exist is unknown.
    const bad = groups.find((group) => group.plugin.id === 'bad')
    assert.equal(bad.catalog, null)
    assert.match(bad.error, /Failed to fetch/)
  })

  it('no longer reports paging, which the protocol does not have', async () => {
    stubFetch(async () => jsonReply(MANIFEST))
    const [group] = await searchAll([ADDON], 'q')
    assert.ok(!('page' in group) && !('done' in group))
  })
})

describe('refreshMovie', () => {
  const meta = (videos) => ({ meta: { id: 'tt1', type: 'series', name: 'Show', videos } })

  const build = async () => {
    stubFetch(async () => jsonReply(meta([{ id: 'tt1:1:1', title: 'Pilot' }])))
    return addMovie({
      title: 'Mine',
      source: { pluginId: 'p1', itemId: 'tt1', type: 'series' },
      episodes: [
        { title: 'Pilot', stream: { pluginId: 'p1', type: 'series', videoId: 'tt1:1:1' } },
      ],
    })
  }

  it('adds the new episodes and keeps what was there', async () => {
    const movie = await build()
    const firstId = movie.episodes[0].id

    stubFetch(async () =>
      jsonReply(
        meta([
          { id: 'tt1:1:1', title: 'Pilot' },
          { id: 'tt1:1:2', title: 'Second' },
        ]),
      ),
    )
    const { added } = await refreshMovie(movie, [ADDON])
    const after = (await getLibrary()).movies[0]

    assert.equal(added, 1)
    assert.equal(after.episodes.length, 2)
    assert.equal(after.episodes[0].id, firstId, 'so the stored position survives')
    assert.equal(after.title, 'Mine', 'the user title is not overwritten')
  })

  it('refuses when the source is gone', async () => {
    const movie = await build()
    await assert.rejects(() => refreshMovie(movie, []), /source this movie came from is gone/)
  })
})

describe('pluginToJson', () => {
  it('shares the addon without the local id', () => {
    const shared = JSON.parse(pluginToJson(ADDON))
    assert.ok(!('id' in shared), 'the receiving install issues its own')
    assert.ok(!('enabled' in shared), 'the default needs no stating')
    assert.equal(shared.url, ADDON.url)
    assert.equal(shared.adPattern, ADDON.adPattern)
  })

  it('carries nothing from the removed custom-API kind', () => {
    const shared = JSON.parse(pluginToJson({ ...ADDON, search: { url: 'x' }, details: {} }))
    assert.ok(!('search' in shared) && !('details' in shared))
  })

  it('states a source that is switched off', () => {
    assert.equal(JSON.parse(pluginToJson({ ...ADDON, enabled: false })).enabled, false)
  })

  it('round trips through the paste form', () => {
    const restored = { ...structuredClone(EMPTY_PLUGIN), ...JSON.parse(pluginToJson(ADDON)) }
    assert.equal(restored.url, ADDON.url)
    assert.equal(restored.enabled, true)
  })
})
