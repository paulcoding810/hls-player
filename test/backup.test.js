import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { stubStorage } from './helpers.mjs'
import { applyBackup, buildBackup, readBackup } from '@/helper/backup'
import { addMovie, EMPTY_MOVIE, getLibrary, resolveConfig } from '@/helper/library'
import { addPlugin, getPlugins } from '@/helper/plugins'
import { saveProgress } from '@/helper/progress'
import { DEFAULT_SETTINGS, sanitizeSettings } from '@/helper/settings'

let store
beforeEach(() => {
  store = stubStorage()
})

const seed = async () => {
  const plugin = await addPlugin({
    name: 'Src',
    referer: 'https://ref.test/',
    adPattern: '^/ads/.+\\.ts$',
    search: {
      url: 'https://a/?q={query}',
      list: 'items',
      fields: { id: 'i', title: 't', poster: 'p' },
    },
    details: {
      url: 'https://a/{id}',
      episodes: 'eps',
      fields: { title: 'n', src: 'u', subtitles: 's' },
    },
  })
  const movie = await addMovie({
    title: 'From source',
    poster: 'https://p.test/c.jpg',
    referer: 'https://ref.test/',
    adPattern: '^/ads/.+\\.ts$',
    skipLeading: 40,
    skipTrailing: 30,
    autoSkip: false,
    episodes: [
      {
        title: 'E1',
        src: 'https://x.test/1.m3u8',
        subtitles: [{ label: 'EN', src: 'https://x.test/en.vtt' }],
      },
    ],
    source: { pluginId: plugin.id, itemId: '42' },
  })
  await saveProgress('https://x.test/1.m3u8', 300, 1800)
  return { plugin, movie }
}

describe('readBackup', () => {
  const rejects = {
    'a file that is not JSON': ['nope{', /not valid JSON/],
    "another app's file": [JSON.stringify({ movies: [] }), /not an HLS Player export/],
    'a newer format': [
      JSON.stringify({ format: 'hls-player-backup', version: 99 }),
      /newer version/,
    ],
    'a file with nothing in it': [
      JSON.stringify({ format: 'hls-player-backup', version: 1, library: { movies: [] } }),
      /nothing to import/,
    ],
  }

  for (const [name, [text, message]] of Object.entries(rejects)) {
    it(`refuses ${name}`, () => assert.throws(() => readBackup(text), message))
  }

  it('drops what it cannot use instead of storing it', () => {
    const parsed = readBackup(
      JSON.stringify({
        format: 'hls-player-backup',
        version: 1,
        library: {
          movies: [
            {
              title: 'Fine',
              episodes: [{ src: 'https://x.test/1.m3u8' }],
              source: { pluginId: '', itemId: 'x' },
            },
            { title: 'No episodes', episodes: [] },
            { title: 'Junk src', episodes: [{ src: 'javascript:alert(1)' }] },
            'not an object',
          ],
        },
        plugins: [{ name: '' }, { name: 'Ok', enabled: false }, null],
        progress: {
          'https://x.test/1.m3u8': { position: 90, duration: 600, updatedAt: 5 },
          'javascript:alert(1)': { position: 5, duration: 10, updatedAt: 9 },
        },
      }),
    )

    assert.equal(parsed.movies.length, 1, 'unplayable movies are dropped')
    assert.equal(parsed.movies[0].source, null, 'a half source becomes none')
    assert.equal(parsed.plugins.length, 1, 'a nameless source is dropped')
    assert.equal(parsed.plugins[0].enabled, false, 'enabled:false is preserved')
    assert.equal(Object.keys(parsed.progress).length, 1, 'a junk position key is dropped')
  })

  it('accepts a file holding only sources', () => {
    const parsed = readBackup(
      JSON.stringify({ format: 'hls-player-backup', version: 1, plugins: [{ name: 'Solo' }] }),
    )
    assert.equal(parsed.plugins.length, 1)
  })
})

describe('a full round trip', () => {
  it('restores the movie, the source and the link between them', async () => {
    const { plugin, movie } = await seed()
    const file = JSON.stringify(await buildBackup())

    delete store.library
    delete store.plugins
    await applyBackup(readBackup(file))

    const restoredMovie = (await getLibrary()).movies[0]
    const restoredPlugin = (await getPlugins())[0]

    assert.equal(restoredMovie.title, movie.title)
    assert.deepEqual(restoredMovie.source, { pluginId: plugin.id, itemId: '42' })
    assert.equal(restoredPlugin.id, plugin.id, 'so refresh still resolves the source')
    assert.equal(restoredPlugin.details.fields.subtitles, 's')
  })

  // This has been missed once per field added: `sanitizeMovie` names each one.
  it('carries every field a movie has, so none is silently dropped', async () => {
    await seed()
    const file = JSON.stringify(await buildBackup())
    const before = (await getLibrary()).movies[0]

    delete store.library
    await applyBackup(readBackup(file))
    const after = (await getLibrary()).movies[0]

    for (const key of Object.keys(EMPTY_MOVIE)) {
      assert.deepEqual(after[key], before[key], `movie.${key} did not survive the round trip`)
    }
    assert.deepEqual(after.episodes[0].subtitles, before.episodes[0].subtitles)
  })

  it('merges rather than duplicating when imported twice', async () => {
    await seed()
    const file = JSON.stringify(await buildBackup())

    await applyBackup(readBackup(file))
    await applyBackup(readBackup(file))

    assert.equal((await getLibrary()).movies.length, 1)
    assert.equal((await getPlugins()).length, 1)
  })

  it('keeps the newer of two watch positions', async () => {
    await seed()
    await applyBackup({
      movies: [],
      settings: null,
      progress: { 'https://x.test/1.m3u8': { position: 10, duration: 1800, updatedAt: 0 } },
    })
    assert.equal(store.progress['https://x.test/1.m3u8'].position, 300)
  })
})

describe('sanitizeSettings', () => {
  it('keeps a known sort order and refuses an unknown one', () => {
    assert.equal(
      sanitizeSettings({ ...DEFAULT_SETTINGS, gallerySort: 'title' }).gallerySort,
      'title',
    )
    assert.equal(
      sanitizeSettings({ ...DEFAULT_SETTINGS, gallerySort: 'evil' }).gallerySort,
      'watched',
    )
  })

  it('clamps a stored volume into range', () => {
    // `player.volume()` throws outside 0-1, so a hand-edited or corrupt value
    // must not reach it.
    const volume = (value) => sanitizeSettings({ ...DEFAULT_SETTINGS, volume: value }).volume
    assert.equal(volume(0.4), 0.4)
    assert.equal(volume(0), 0, 'silence is a real choice, not a missing value')
    assert.equal(volume(5), 1)
    assert.equal(volume(-1), 0)
    assert.equal(volume('nonsense'), 1)
    assert.equal(volume(undefined), 1)
  })

  it('defaults to full volume', () => {
    assert.equal(DEFAULT_SETTINGS.volume, 1)
  })

  it('keeps the subtitle settings inside their ranges', () => {
    const read = (patch) => sanitizeSettings({ ...DEFAULT_SETTINGS, ...patch })

    assert.equal(read({ subtitleSize: 1.5 }).subtitleSize, 1.5)
    assert.equal(read({ subtitleSize: 99 }).subtitleSize, 2, 'clamped to the largest offered')
    assert.equal(read({ subtitleSize: 0 }).subtitleSize, 0.75, 'clamped to the smallest')
    assert.equal(read({ subtitleSize: 'huge' }).subtitleSize, 1)

    assert.equal(read({ subtitleLang: '  EN-gb ' }).subtitleLang, 'en-gb', 'matched lowercase')
    assert.equal(read({ subtitlesOn: 'yes' }).subtitlesOn, true)
    assert.equal(
      read({ subtitleBackground: undefined }).subtitleBackground,
      true,
      'the box stays unless it is turned off',
    )
    assert.equal(read({ subtitleBackground: false }).subtitleBackground, false)

    assert.equal(read({ subtitlePosition: 8 }).subtitlePosition, 8)
    assert.equal(read({ subtitlePosition: 99 }).subtitlePosition, 12, 'clamped to the highest')
    assert.equal(read({ subtitlePosition: 0 }).subtitlePosition, 1.5, 'clamped to the lowest')
    assert.equal(read({ subtitlePosition: 'up' }).subtitlePosition, 4.5)
  })

  it('keeps the subtitle settings out of the per-movie config', () => {
    // `resolveConfig` is the set of fields a movie may override. Subtitles are
    // global only, so the player reads them from the settings directly.
    const config = resolveConfig(null, { ...DEFAULT_SETTINGS, subtitleSize: 1.25 })
    for (const key of ['subtitlesOn', 'subtitleLang', 'subtitleSize', 'subtitleBackground']) {
      assert.ok(!(key in config), `${key} should not be a per-movie field`)
    }
  })

  it('coerces the rest to usable values', () => {
    const clean = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      referer: '  https://x/  ',
      playbackRate: 0,
      skipLeading: -5,
      autoSkip: 'yes',
    })
    assert.equal(clean.referer, 'https://x/')
    assert.equal(clean.playbackRate, 1, 'a rate of zero is not playable')
    assert.equal(clean.skipLeading, 0)
    assert.equal(clean.autoSkip, true)
  })
})
