import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { jsonReply, stubFetch, stubStorage } from './helpers.mjs'
import { addMovie, getLibrary } from '@/helper/library'
import {
  EMPTY_PLUGIN,
  fetchEpisodes,
  loadMore,
  pluginToJson,
  refreshMovie,
  searchAll,
  searchPlugin,
} from '@/helper/plugins'

const PLUGIN = {
  id: 'p1',
  name: 'Example',
  enabled: true,
  referer: 'https://ex.test/',
  adPattern: '^/ads/.+\\.ts$',
  search: {
    url: 'https://api.test/s?q={query}&page={page}',
    list: 'data.items',
    fields: { id: 'vod_id', title: 'vod_name', poster: 'img.cover' },
  },
  details: {
    url: 'https://api.test/d/{id}',
    episodes: 'data.play[0].list',
    fields: { title: 'name', src: 'https://cdn.test/{path}.m3u8', subtitles: 'subs' },
  },
}

beforeEach(() => stubStorage())

describe('searchPlugin', () => {
  it('fills the query into the URL and reads the named fields', async () => {
    let asked = ''
    stubFetch(async (url) => {
      asked = url
      return jsonReply({
        data: { items: [{ vod_id: 42, vod_name: 'Godzilla', img: { cover: 'c.jpg' } }] },
      })
    })

    const [result] = await searchPlugin(PLUGIN, 'god zilla')
    assert.equal(asked, 'https://api.test/s?q=god%20zilla&page=1')
    assert.deepEqual([result.id, result.title, result.poster], ['42', 'Godzilla', 'c.jpg'])
    assert.equal(result.plugin.id, 'p1')
  })

  it('drops a half-formed result rather than showing one that cannot be fetched', async () => {
    stubFetch(async () =>
      jsonReply({
        data: { items: [{ vod_id: 1, vod_name: 'Fine' }, { vod_id: 2 }, { vod_name: 'No id' }] },
      }),
    )
    assert.equal((await searchPlugin(PLUGIN, 'x')).length, 1)
  })

  it('yields nothing, not a throw, when the list path matches nothing', async () => {
    stubFetch(async () => jsonReply({ wrong: 'shape' }))
    assert.equal((await searchPlugin(PLUGIN, 'x')).length, 0)
  })

  describe('reports a failure in words the user can act on', () => {
    const cases = {
      'a bad status': [
        async () => jsonReply({}, { ok: false, status: 404 }),
        /Example answered 404/,
      ],
      'a body that is not JSON': [
        async () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('bad')
          },
        }),
        /did not return JSON/,
      ],
      'a timeout': [
        async () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          throw error
        },
        /did not answer in time/,
      ],
      'a network error': [
        async () => {
          throw new TypeError('Failed to fetch')
        },
        /Failed to fetch/,
      ],
    }

    for (const [name, [handler, message]] of Object.entries(cases)) {
      it(name, async () => {
        stubFetch(handler)
        await assert.rejects(() => searchPlugin(PLUGIN, 'x'), message)
      })
    }

    it('names the source exactly once', async () => {
      stubFetch(async () => jsonReply({}, { ok: false, status: 404 }))
      const error = await searchPlugin(PLUGIN, 'x').catch((e) => e)
      assert.equal(error.message.match(/Example/g).length, 1)
    })
  })
})

describe('fetchEpisodes', () => {
  it('builds each episode URL from the template', async () => {
    let asked = ''
    stubFetch(async (url) => {
      asked = url
      return jsonReply({
        data: {
          play: [
            {
              list: [
                { name: 'Ep 1', path: 'x/1' },
                { name: 'Ep 2', path: 'x/2' },
              ],
            },
          ],
        },
      })
    })

    const episodes = await fetchEpisodes(PLUGIN, { id: '42' })
    assert.equal(asked, 'https://api.test/d/42')
    assert.equal(episodes[0].src, 'https://cdn.test/x/1.m3u8')
    assert.equal(episodes.length, 2)
  })

  it('drops an entry whose template could not be filled', async () => {
    // `new URL` accepts `https://cdn.test/{path}.m3u8`, so a half-built URL
    // would otherwise pass for a real one.
    stubFetch(async () => jsonReply({ data: { play: [{ list: [{ name: 'Bad', path: null }] }] } }))
    assert.equal((await fetchEpisodes(PLUGIN, { id: '1' })).length, 0)
  })

  it('reads subtitles when the source names them', async () => {
    stubFetch(async () =>
      jsonReply({
        data: {
          play: [{ list: [{ name: 'Ep 1', path: 'x/1', subs: ['https://cdn.test/en.vtt'] }] }],
        },
      }),
    )
    const [episode] = await fetchEpisodes(PLUGIN, { id: '1' })
    assert.equal(episode.subtitles.length, 1)
  })
})

describe('searchAll', () => {
  it('keeps a working source when another fails, and skips disabled ones', async () => {
    stubFetch(async (url) => {
      if (url.includes('bad.test')) throw new TypeError('Failed to fetch')
      return jsonReply({ data: { items: [{ vod_id: 1, vod_name: 'Hit' }] } })
    })

    const groups = await searchAll(
      [
        { ...PLUGIN, id: 'good', name: 'Good' },
        {
          ...PLUGIN,
          id: 'bad',
          name: 'Bad',
          search: { ...PLUGIN.search, url: 'https://bad.test/{query}' },
        },
        { ...PLUGIN, id: 'off', enabled: false },
      ],
      'q',
    )

    assert.equal(groups.length, 2, 'a disabled source is not queried')
    const bad = groups.find((g) => g.plugin.id === 'bad')
    assert.equal(groups.find((g) => g.plugin.id === 'good').results.length, 1)
    assert.match(bad.error, /Failed to fetch/)
    assert.equal(bad.done, true, 'a failed source must not offer More')
  })
})

describe('loadMore', () => {
  const pages = { 1: ['A', 'B'], 2: ['C', 'D'], 3: [] }
  const paged = () =>
    stubFetch(async (url) => {
      const page = Number(new URL(url).searchParams.get('page'))
      return jsonReply({
        data: {
          items: (pages[page] ?? []).map((t, i) => ({ vod_id: `${page}${i}`, vod_name: t })),
        },
      })
    })

  it('appends the next page', async () => {
    paged()
    let [group] = await searchAll([PLUGIN], 'x')
    group = await loadMore(group, 'x')
    assert.deepEqual(
      group.results.map((r) => r.title),
      ['A', 'B', 'C', 'D'],
    )
    assert.equal(group.page, 2)
    assert.equal(group.done, false)
  })

  it('stops when a page brings nothing', async () => {
    paged()
    let [group] = await searchAll([PLUGIN], 'x')
    group = await loadMore(await loadMore(group, 'x'), 'x')
    assert.equal(group.results.length, 4)
    assert.equal(group.done, true)
  })

  it('stops instead of looping when the URL has no {page}', async () => {
    stubFetch(async () => jsonReply({ data: { items: [{ vod_id: 1, vod_name: 'A' }] } }))
    const unpaged = { ...PLUGIN, search: { ...PLUGIN.search, url: 'https://api.test/s?q={query}' } }
    let [group] = await searchAll([unpaged], 'x')
    group = await loadMore(group, 'x')
    assert.equal(group.results.length, 1, 'the repeated page is not appended')
    assert.equal(group.done, true)
  })
})

describe('refreshMovie', () => {
  const build = async () => {
    stubFetch(async () =>
      jsonReply({ data: { play: [{ list: [{ name: 'Ep 1', path: 'x/1' }] }] } }),
    )
    return addMovie({
      title: 'Mine',
      episodes: await fetchEpisodes(PLUGIN, { id: '42' }),
      source: { pluginId: 'p1', itemId: '42' },
    })
  }

  it('adds new episodes while keeping the ones already there', async () => {
    const movie = await build()
    const firstId = movie.episodes[0].id

    stubFetch(async () =>
      jsonReply({
        data: {
          play: [
            {
              list: [
                { name: 'Ep 1', path: 'x/1' },
                { name: 'Ep 2', path: 'x/2' },
              ],
            },
          ],
        },
      }),
    )
    const { added } = await refreshMovie(movie, [PLUGIN])
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

  it('refuses rather than emptying the movie', async () => {
    const movie = await build()
    stubFetch(async () => jsonReply({ data: { play: [{ list: [] }] } }))
    await assert.rejects(() => refreshMovie(movie, [PLUGIN]), /returned no episodes/)
  })
})

describe('pluginToJson', () => {
  it('shares everything but the local id', () => {
    const shared = JSON.parse(pluginToJson(PLUGIN))
    assert.ok(!('id' in shared), 'the receiving install issues its own')
    assert.ok(!('enabled' in shared), 'the default needs no stating')
    assert.equal(shared.adPattern, PLUGIN.adPattern)
    assert.equal(shared.details.fields.src, 'https://cdn.test/{path}.m3u8')
  })

  it('states a source that is switched off', () => {
    assert.equal(JSON.parse(pluginToJson({ ...PLUGIN, enabled: false })).enabled, false)
  })

  it('round trips through the paste form', () => {
    const restored = { ...structuredClone(EMPTY_PLUGIN), ...JSON.parse(pluginToJson(PLUGIN)) }
    assert.equal(restored.search.url, PLUGIN.search.url)
    assert.equal(restored.enabled, true)
  })
})
