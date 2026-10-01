import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { jsonReply, stubFetch, stubStorage } from './helpers.mjs'
import {
  browseCatalog,
  describeManifest,
  detailsOf,
  fetchStremioDetails,
  fetchStremioEpisodes,
  forgetManifest,
  listCatalogs,
  listStreams,
  pickStream,
  searchStremio,
} from '@/helper/stremio'
import { addMovie, episodeKey, getLibrary, setEpisodes } from '@/helper/library'
import { applyBackup, buildBackup, readBackup } from '@/helper/backup'

const ADDON = {
  id: 'p1',
  name: 'Addon',
  enabled: true,
  kind: 'stremio',
  url: 'https://addon.test/manifest.json',
}

const MANIFEST = {
  id: 'test.addon',
  name: 'Addon',
  resources: ['catalog', 'meta', 'stream'],
  types: ['series', 'movie'],
  catalogs: [
    { type: 'series', id: 'top', name: 'Top', extra: [{ name: 'search' }] },
    { type: 'movie', id: 'top', name: 'Top', extra: [{ name: 'search' }] },
    { type: 'movie', id: 'featured', name: 'Featured' },
  ],
}

/** Answers each endpoint from a map, recording what was asked. */
const serve = (routes) => {
  const asked = []
  stubFetch(async (url) => {
    asked.push(url)
    const match = Object.keys(routes).find((part) => url.includes(part))
    if (!match) return jsonReply({}, { ok: false, status: 404 })
    return jsonReply(routes[match])
  })
  return asked
}

beforeEach(() => {
  stubStorage()
  forgetManifest(ADDON)
})

describe('searchStremio', () => {
  const flat = (groups) => groups.flatMap((group) => group.results)

  it('asks only the catalogs that declare a search extra', async () => {
    const asked = serve({ manifest: MANIFEST, catalog: { metas: [] } })
    await searchStremio(ADDON, 'godzilla')

    const catalogs = asked.filter((url) => url.includes('/catalog/'))
    assert.equal(catalogs.length, 2, 'the catalog without a search extra is skipped')
    assert.ok(catalogs.every((url) => url.includes('search=godzilla')))
  })

  it('percent-encodes the query', async () => {
    const asked = serve({ manifest: MANIFEST, catalog: { metas: [] } })
    await searchStremio(ADDON, 'a b&c')
    assert.ok(
      asked.some((url) => url.includes('search=a%20b%26c')),
      asked.join('\n'),
    )
  })

  it('returns one group per searchable catalog, named', async () => {
    serve({ manifest: MANIFEST, catalog: { metas: [{ id: 'tt1', type: 'series', name: 'One' }] } })
    const groups = await searchStremio(ADDON, 'x')

    assert.equal(groups.length, 2)
    assert.deepEqual(
      groups.map((group) => [group.catalog.type, group.catalog.name]),
      [
        ['series', 'Top'],
        ['movie', 'Top'],
      ],
    )
  })

  it('keeps the same title in each catalog that returned it', async () => {
    // Merging used to hide that a title is in both; the groups are the answer.
    serve({ manifest: MANIFEST, catalog: { metas: [{ id: 'tt1', type: 'series', name: 'One' }] } })
    assert.equal(flat(await searchStremio(ADDON, 'x')).length, 2)
  })

  it('still drops a repeat within one catalog', async () => {
    serve({
      manifest: MANIFEST,
      catalog: {
        metas: [
          { id: 'tt1', type: 'series', name: 'One' },
          { id: 'tt1', type: 'series', name: 'One again' },
        ],
      },
    })
    assert.equal((await searchStremio(ADDON, 'x'))[0].results.length, 1)
  })

  it('reads the fields a result needs', async () => {
    serve({
      manifest: MANIFEST,
      catalog: {
        metas: [{ id: 'tt1', type: 'series', name: 'One', poster: 'https://p.test/1.jpg' }],
      },
    })
    const [result] = (await searchStremio(ADDON, 'x'))[0].results
    assert.deepEqual(
      [result.id, result.title, result.type, result.poster],
      ['tt1', 'One', 'series', 'https://p.test/1.jpg'],
    )
  })

  it('reports a failing catalog in its own group, keeping the other', async () => {
    let call = 0
    stubFetch(async (url) => {
      if (url.includes('manifest')) return jsonReply(MANIFEST)
      call += 1
      if (call === 1) return jsonReply({}, { ok: false, status: 404 })
      return jsonReply({ metas: [{ id: 'tt2', type: 'movie', name: 'Two' }] })
    })

    const groups = await searchStremio(ADDON, 'x')
    assert.equal(groups.length, 2)
    assert.match(groups[0].error, /answered 404/)
    assert.equal(groups[1].results.length, 1)
  })

  it('returns nothing when no catalog can be searched', async () => {
    serve({ manifest: { ...MANIFEST, catalogs: [{ type: 'movie', id: 'featured', name: 'F' }] } })
    assert.deepEqual(await searchStremio(ADDON, 'x'), [])
  })

  it('accepts a base URL without /manifest.json', async () => {
    const asked = serve({ manifest: MANIFEST, catalog: { metas: [] } })
    await searchStremio({ ...ADDON, url: 'https://addon.test' }, 'x')
    assert.ok(asked[0].endsWith('https://addon.test/manifest.json'), asked[0])
  })
})

describe('detailsOf', () => {
  it('reads what the addon filled in', () => {
    const details = detailsOf({
      name: ' Show ',
      poster: 'https://img.test/p.jpg',
      description: 'A plot.',
      releaseInfo: '2008–2013',
      runtime: '47 min',
      imdbRating: '9.5',
      genres: ['Drama', ' ', 'Crime'],
      cast: ['A', 'B'],
      director: ['C'],
      videos: [{ season: 1 }, { season: 1 }, { season: 2 }, { season: 0 }],
    })

    assert.equal(details.title, 'Show')
    assert.equal(details.released, '2008–2013')
    assert.equal(details.rating, 9.5, 'rating arrives as a string')
    assert.deepEqual(details.genres, ['Drama', 'Crime'])
    assert.equal(details.seasons, 2, 'specials (season 0) are not a season')
  })

  it('takes genres from links when the deprecated field is absent', () => {
    const details = detailsOf({
      links: [
        { name: 'Comedy', category: 'Genres' },
        { name: 'Someone', category: 'Cast' },
      ],
    })
    assert.deepEqual(details.genres, ['Comedy'])
  })

  it('leaves out what is missing rather than inventing it', () => {
    const details = detailsOf({ year: 1999 })
    assert.equal(details.released, '1999')
    assert.equal(details.rating, null)
    assert.equal(details.description, '')
    assert.deepEqual(details.cast, [])
    assert.equal(details.seasons, 0)
  })
})

describe('fetchStremioDetails', () => {
  it('returns details and episodes from one meta request', async () => {
    const calls = serve({
      meta: {
        meta: {
          id: 'tt1',
          name: 'Show',
          description: 'Plot',
          videos: [{ id: 'tt1:1:1', season: 1, episode: 1 }],
        },
      },
    })

    const { details, episodes } = await fetchStremioDetails(ADDON, { id: 'tt1', type: 'series' })
    assert.equal(details.description, 'Plot')
    assert.equal(episodes[0].stream.videoId, 'tt1:1:1')
    assert.equal(calls.filter((url) => url.includes('/meta/')).length, 1)
  })
})

describe('fetchStremioEpisodes', () => {
  it('turns a series into episodes naming their video', async () => {
    serve({
      meta: {
        meta: {
          id: 'tt1',
          type: 'series',
          name: 'Show',
          videos: [
            { id: 'tt1:1:1', title: 'Pilot', season: 1, episode: 1 },
            { id: 'tt1:1:2', season: 1, episode: 2 },
          ],
        },
      },
    })

    const episodes = await fetchStremioEpisodes(ADDON, { id: 'tt1', type: 'series' })
    assert.equal(episodes.length, 2)
    assert.equal(episodes[0].title, 'Pilot')
    assert.equal(episodes[1].title, 'S1E2', 'named from season and episode when it has no title')
    assert.deepEqual(episodes[0].stream, { pluginId: 'p1', type: 'series', videoId: 'tt1:1:1' })
    assert.ok(!('src' in episodes[0]), 'no URL until it is played')
  })

  it('turns a movie with no videos into one episode', async () => {
    serve({ meta: { meta: { id: 'tt9', type: 'movie', name: 'Film' } } })
    const episodes = await fetchStremioEpisodes(ADDON, { id: 'tt9', type: 'movie' })
    assert.equal(episodes.length, 1)
    assert.equal(episodes[0].stream.videoId, 'tt9')
  })

  it('reports a title with no details', async () => {
    serve({ meta: {} })
    await assert.rejects(
      () => fetchStremioEpisodes(ADDON, { id: 'x', type: 'movie' }),
      /no details/,
    )
  })
})

describe('listStreams', () => {
  const stream = { pluginId: 'p1', type: 'series', videoId: 'tt1:1:1' }

  it('returns every playable stream, in the addon’s order', async () => {
    serve({
      stream: {
        streams: [
          { infoHash: 'abc', name: 'torrent' },
          { ytId: 'xyz', name: 'youtube' },
          { externalUrl: 'https://site.test/watch', name: 'external' },
          { name: '720p', url: 'https://cdn.test/a.m3u8' },
          { name: '1080p', url: 'https://cdn.test/b.m3u8' },
        ],
      },
    })

    const found = await listStreams(ADDON, stream)
    assert.deepEqual(
      found.map((entry) => entry.name),
      ['720p', '1080p'],
      'the three it cannot open are left out',
    )
    assert.equal(found[0].url, 'https://cdn.test/a.m3u8')
  })

  it('reads what the menu shows for each one', async () => {
    serve({
      stream: {
        streams: [
          {
            url: 'https://cdn.test/a.m3u8',
            name: '1080p',
            description: 'Provider A · 2.3 GB',
            behaviorHints: { bingeGroup: 'providerA-1080p' },
          },
          // `title` is the deprecated spelling of `description`.
          { url: 'https://cdn.test/b.m3u8', name: '720p', title: 'Provider B' },
        ],
      },
    })

    const [first, second] = await listStreams(ADDON, stream)
    assert.equal(first.description, 'Provider A · 2.3 GB')
    assert.equal(first.bingeGroup, 'providerA-1080p')
    assert.equal(second.description, 'Provider B')
    assert.equal(second.bingeGroup, '')
  })

  it('keeps each stream’s own Referer and subtitles', async () => {
    serve({
      stream: {
        streams: [
          {
            url: 'https://cdn.test/a.m3u8',
            behaviorHints: { proxyHeaders: { request: { Referer: 'https://one.test/' } } },
            subtitles: [{ id: '1', url: 'https://subs.test/en.srt', lang: 'eng' }],
          },
          { url: 'https://cdn.test/b.m3u8' },
        ],
      },
    })

    const [first, second] = await listStreams(ADDON, stream)
    assert.equal(first.referer, 'https://one.test/')
    assert.equal(first.subtitles.length, 1)
    assert.equal(second.referer, '', 'not inherited from the one before it')
    assert.deepEqual(second.subtitles, [])
  })

  it('carries the subtitles a stream ships with, labelled by language', async () => {
    serve({
      stream: {
        streams: [
          {
            url: 'https://cdn.test/a.m3u8',
            subtitles: [
              { id: '1', url: 'https://subs.test/en.srt', lang: 'eng' },
              { id: '2', url: 'https://subs.test/es.vtt', lang: 'spa' },
            ],
          },
        ],
      },
    })

    const [{ subtitles }] = await listStreams(ADDON, stream)
    assert.equal(subtitles.length, 2)
    assert.equal(subtitles[0].src, 'https://subs.test/en.srt')
    assert.equal(subtitles[0].label, 'eng', 'the language is what the menu shows')
  })

  it('falls back to the subtitle id when it has no language', async () => {
    serve({
      stream: {
        streams: [
          {
            url: 'https://cdn.test/a.m3u8',
            subtitles: [{ id: 'sub-7', url: 'https://subs.test/a.srt' }],
          },
        ],
      },
    })
    assert.equal((await listStreams(ADDON, stream))[0].subtitles[0].label, 'sub-7')
  })

  it('drops a subtitle with no usable URL, keeping the rest', async () => {
    serve({
      stream: {
        streams: [
          {
            url: 'https://cdn.test/a.m3u8',
            subtitles: [
              { id: '1', lang: 'eng' },
              { id: '2', url: 'not a url', lang: 'spa' },
              { id: '3', url: 'https://subs.test/fr.srt', lang: 'fra' },
            ],
          },
        ],
      },
    })
    const [{ subtitles }] = await listStreams(ADDON, stream)
    assert.equal(subtitles.length, 1)
    assert.equal(subtitles[0].lang, 'fra')
  })

  it('says so when every stream needs another app', async () => {
    serve({ stream: { streams: [{ infoHash: 'abc' }, { infoHash: 'def' }] } })
    await assert.rejects(() => listStreams(ADDON, stream), /torrents and external links/)
  })

  it('says so when there is nothing at all', async () => {
    serve({ stream: { streams: [] } })
    await assert.rejects(() => listStreams(ADDON, stream), /found no stream/)
  })

  it('rejects a stream whose URL is not http(s)', async () => {
    serve({ stream: { streams: [{ url: 'magnet:?xt=urn:btih:abc' }] } })
    await assert.rejects(() => listStreams(ADDON, stream), /no stream this player can open/)
  })
})

describe('pickStream', () => {
  const streams = [
    { url: 'a', bingeGroup: 'providerA' },
    { url: 'b', bingeGroup: 'providerB' },
    { url: 'c', bingeGroup: '' },
  ]

  it('takes what the addon put first when nothing is remembered', () => {
    assert.equal(pickStream(streams, '').url, 'a')
    assert.equal(pickStream(streams, undefined).url, 'a')
  })

  it('follows the remembered group, so a choice lasts the season', () => {
    assert.equal(pickStream(streams, 'providerB').url, 'b')
  })

  it('falls back to the first when the group is not offered here', () => {
    assert.equal(pickStream(streams, 'providerZ').url, 'a')
  })

  it('never matches a stream that carries no group', () => {
    // Otherwise an empty remembered group would match every unmarked stream.
    assert.equal(pickStream([{ url: 'c', bingeGroup: '' }], '').url, 'c')
    assert.equal(pickStream(streams, '').url, 'a')
  })

  it('has nothing to pick from an empty list', () => {
    assert.equal(pickStream([], 'x'), null)
    assert.equal(pickStream(undefined, 'x'), null)
  })
})

describe('a failing addon', () => {
  // These messages moved here with `fetchJson`, which now lives beside the
  // protocol that produces them.
  const cases = {
    'a bad status': [async () => jsonReply({}, { ok: false, status: 404 }), /Addon answered 404/],
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
    it(`reports ${name}`, async () => {
      stubFetch(handler)
      // The manifest is the first request, so these still reject outright.
      await assert.rejects(() => searchStremio(ADDON, 'x'), message)
    })
  }

  it('names the addon exactly once', async () => {
    stubFetch(async () => jsonReply({}, { ok: false, status: 404 }))
    const error = await searchStremio(ADDON, 'x').catch((thrown) => thrown)
    assert.equal(error.message.match(/Addon/g).length, 1)
  })

  it('refuses a source with no manifest URL', async () => {
    await assert.rejects(() => searchStremio({ ...ADDON, url: '' }, 'x'), /manifest URL/)
  })
})

describe('episodeKey', () => {
  it('is the URL for an ordinary episode, so stored positions still resolve', () => {
    assert.equal(episodeKey({ src: 'https://x.test/1.m3u8' }), 'https://x.test/1.m3u8')
  })

  it('names the video when the URL is resolved on play', () => {
    assert.equal(
      episodeKey({ stream: { pluginId: 'p1', type: 'series', videoId: 'tt1:1:1' } }),
      'stremio:p1:tt1:1:1',
    )
  })

  it('is stable across two resolutions of the same episode', () => {
    const episode = { stream: { pluginId: 'p1', type: 'series', videoId: 'tt1:1:1' } }
    assert.equal(episodeKey(episode), episodeKey({ ...episode }))
  })
})

describe('a Stremio movie in the library', () => {
  const build = () =>
    addMovie({
      title: 'Show',
      source: { pluginId: 'p1', itemId: 'tt1', type: 'series' },
      episodes: [
        { title: 'Pilot', stream: { pluginId: 'p1', type: 'series', videoId: 'tt1:1:1' } },
        { title: 'S1E2', stream: { pluginId: 'p1', type: 'series', videoId: 'tt1:1:2' } },
      ],
    })

  it('keeps an episode id through a refresh, so its position survives', async () => {
    const movie = await build()
    const firstId = movie.episodes[0].id

    await setEpisodes(movie.id, [
      { title: 'Pilot', stream: { pluginId: 'p1', type: 'series', videoId: 'tt1:1:1' } },
      { title: 'S1E2', stream: { pluginId: 'p1', type: 'series', videoId: 'tt1:1:2' } },
      { title: 'S1E3', stream: { pluginId: 'p1', type: 'series', videoId: 'tt1:1:3' } },
    ])

    const after = (await getLibrary()).movies[0]
    assert.equal(after.episodes.length, 3)
    assert.equal(after.episodes[0].id, firstId)
  })

  it('survives an export and import', async () => {
    // `sanitizeMovie` used to require a `src`, which would delete all of these.
    await build()
    const file = JSON.stringify(await buildBackup())

    stubStorage()
    await applyBackup(readBackup(file))

    const restored = (await getLibrary()).movies[0]
    assert.equal(restored.episodes.length, 2)
    assert.deepEqual(restored.episodes[0].stream, {
      pluginId: 'p1',
      type: 'series',
      videoId: 'tt1:1:1',
    })
    assert.equal(restored.source.type, 'series', 'refresh needs the type back')
  })
})

describe('describeManifest', () => {
  it('counts catalogs and the searchable ones', () => {
    const summary = describeManifest(MANIFEST)
    assert.equal(summary.name, 'Addon')
    assert.ok(summary.catalogs > 0)
    assert.ok(summary.searchable <= summary.catalogs)
    assert.deepEqual(summary.missing, [])
  })

  it('names what a catalog-only addon cannot do here', () => {
    const summary = describeManifest({
      name: 'Cinemeta',
      resources: ['catalog', { name: 'meta', types: ['movie'] }],
      catalogs: [],
    })
    assert.deepEqual(summary.missing, ['stream'], 'object-form resources count too')
  })

  it('survives a manifest with nothing in it', () => {
    assert.deepEqual(describeManifest(null), {
      name: '',
      version: '',
      catalogs: 0,
      searchable: 0,
      missing: ['catalog', 'meta', 'stream'],
    })
  })
})

describe('stremio:// install links', () => {
  it('are read over https', async () => {
    const asked = serve({ manifest: MANIFEST })
    await listCatalogs({ ...ADDON, url: 'stremio://addon.test/manifest.json' })
    assert.equal(asked[0], 'https://addon.test/manifest.json')
  })
})

describe('listCatalogs', () => {
  it('lists every catalog, not only the searchable ones', async () => {
    serve({
      manifest: {
        ...MANIFEST,
        catalogs: [
          { type: 'series', id: 'top', name: 'Top', extra: [{ name: 'search' }, { name: 'skip' }] },
          { type: 'movie', id: 'featured', name: 'Featured' },
        ],
      },
    })

    const catalogs = await listCatalogs(ADDON)
    assert.equal(catalogs.length, 2, 'browsing does not need a search extra')
    assert.equal(catalogs[0].pageable, true, 'it declares skip')
    assert.equal(catalogs[1].pageable, false)
    assert.equal(catalogs[1].name, 'Featured')
  })

  it('names a catalog by its id when it has no name', async () => {
    serve({ manifest: { ...MANIFEST, catalogs: [{ type: 'movie', id: 'top' }] } })
    assert.equal((await listCatalogs(ADDON))[0].name, 'top')
  })

  it('drops a malformed catalog', async () => {
    serve({ manifest: { ...MANIFEST, catalogs: [{ name: 'No type or id' }] } })
    assert.deepEqual(await listCatalogs(ADDON), [])
  })
})

describe('browseCatalog', () => {
  const catalog = { type: 'series', id: 'top', name: 'Top', pageable: true }

  it('asks for the bare path at the start', async () => {
    const asked = serve({ catalog: { metas: [{ id: 'tt1', name: 'One' }] } })
    await browseCatalog(ADDON, catalog)
    // Some addons answer `/top.json` but not `/top/skip=0.json`.
    assert.ok(asked.at(-1).endsWith('/catalog/series/top.json'), asked.at(-1))
  })

  it('asks for a skip on later pages', async () => {
    const asked = serve({ catalog: { metas: [] } })
    await browseCatalog(ADDON, catalog, 100)
    assert.ok(asked.at(-1).endsWith('/catalog/series/top/skip=100.json'), asked.at(-1))
  })

  it('reads the metas into result rows', async () => {
    serve({
      catalog: { metas: [{ id: 'tt1', name: 'One', poster: 'https://p.test/1.jpg' }] },
    })
    const [result] = await browseCatalog(ADDON, catalog)
    assert.deepEqual(
      [result.id, result.title, result.poster, result.type],
      ['tt1', 'One', 'https://p.test/1.jpg', 'series'],
    )
    assert.equal(result.plugin.id, 'p1', 'so Add knows which source to ask')
  })

  it('falls back to the catalog type when a meta omits one', async () => {
    serve({ catalog: { metas: [{ id: 'tt1', name: 'One' }] } })
    assert.equal((await browseCatalog(ADDON, catalog))[0].type, 'series')
  })

  it('drops a meta with no id or name', async () => {
    serve({ catalog: { metas: [{ id: 'tt1' }, { name: 'No id' }, { id: 'tt2', name: 'Two' }] } })
    assert.equal((await browseCatalog(ADDON, catalog)).length, 1)
  })
})
