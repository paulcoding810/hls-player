import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { stubStorage } from './helpers.mjs'
import {
  addMovie,
  EMPTY_MOVIE,
  getLibrary,
  markWatched,
  movieToJson,
  parseMovieJson,
  resolveConfig,
  resumeEpisodeId,
  setEpisodes,
  setLastPlayed,
  sortMovies,
} from '@/helper/library'
import { getAllProgress, saveProgress } from '@/helper/progress'
import { DEFAULT_SETTINGS } from '@/helper/settings'
import { parseEpisodeLines } from '@/utils/url'

beforeEach(() => stubStorage())

describe('parseMovieJson', () => {
  const rejects = {
    'not JSON': ['nope{', 'not valid JSON'],
    'an array': ['[{"title":"a"}]', 'single movie object'],
    'no title': ['{"episodes":["https://x.test/1.m3u8"]}', 'title'],
    'no episodes': ['{"title":"a"}', 'episodes'],
    'an unusable episode URL': ['{"title":"a","episodes":["javascript:alert(1)"]}', 'Episode 1'],
    'a broken ad pattern': [
      '{"title":"a","adPattern":"[oops","episodes":["https://x.test/1.m3u8"]}',
      'regular expression',
    ],
    'a non-boolean autoSkip': [
      '{"title":"a","autoSkip":"yes","episodes":["https://x.test/1.m3u8"]}',
      'autoSkip',
    ],
    'a negative skip': [
      '{"title":"a","skipLeading":-5,"episodes":["https://x.test/1.m3u8"]}',
      'skipLeading',
    ],
  }

  for (const [name, [text, message]] of Object.entries(rejects)) {
    it(`names the problem for ${name}`, () =>
      assert.throws(() => parseMovieJson(text), new RegExp(message)))
  }

  it('reads the minimal shape, leaving optional fields inheriting', () => {
    const movie = parseMovieJson('{"title":"Minimal","episodes":["https://x.test/1.m3u8"]}')
    assert.equal(movie.title, 'Minimal')
    assert.equal(movie.referer, '')
    assert.equal(movie.adPattern, '')
    assert.equal(movie.skipLeading, null)
    assert.equal(movie.autoSkip, null)
  })

  it('accepts the lenient forms', () => {
    const movie = parseMovieJson(
      JSON.stringify({
        title: '  Spaced  ',
        referer: 'example.com',
        skipLeading: '40',
        skipTrailing: 30.6,
        autoSkip: false,
        episodes: [
          'https://x.test/1.m3u8',
          { title: ' Two ', src: 'https://x.test/2.mpd' },
          { title: 'Three', url: 'https://x.test/3.m3u8' },
        ],
      }),
    )
    assert.equal(movie.title, 'Spaced')
    assert.equal(movie.referer, 'https://example.com/', 'a bare domain is normalised')
    assert.equal(movie.skipLeading, 40, 'a numeric string is coerced')
    assert.equal(movie.skipTrailing, 31, 'fractional seconds round')
    assert.equal(movie.autoSkip, false, 'false is kept, not flattened to null')
    assert.equal(movie.episodes[2].src, 'https://x.test/3.m3u8', '`url` aliases `src`')
    assert.equal(movie.episodes[1].title, 'Two')
  })
})

describe('movieToJson', () => {
  it('round trips through parseMovieJson', () => {
    const source = {
      title: 'Godzilla',
      poster: 'https://p.test/c.jpg',
      referer: 'https://ref.test/',
      adPattern: '^/ads/.+\\.ts$',
      episodes: [
        {
          title: 'Ep 1',
          src: 'https://x.test/1.m3u8',
          subtitles: [{ label: 'EN', src: 'https://x.test/en.vtt' }],
        },
        { title: 'Ep 2', src: 'https://x.test/2.m3u8' },
      ],
    }
    const back = parseMovieJson(movieToJson(source))
    assert.equal(back.title, source.title)
    assert.equal(back.adPattern, source.adPattern)
    assert.equal(back.episodes[0].subtitles[0].label, 'EN')
    assert.ok(!('subtitles' in back.episodes[1]))
  })

  it('omits blank fields, because absent means inherit', () => {
    const bare = JSON.parse(
      movieToJson({
        title: 'Bare',
        poster: '',
        referer: '',
        adPattern: '',
        skipLeading: null,
        autoSkip: null,
        episodes: [],
      }),
    )
    for (const key of ['poster', 'referer', 'adPattern', 'skipLeading', 'autoSkip']) {
      assert.ok(!(key in bare), `${key} should be omitted`)
    }
  })

  it('keeps values that are falsy but meaningful', () => {
    const zeros = JSON.parse(
      movieToJson({ title: 'Z', skipLeading: 0, autoSkip: false, episodes: [] }),
    )
    assert.equal(zeros.skipLeading, 0)
    assert.equal(zeros.autoSkip, false)
  })

  it('leaves local-only fields out of a shareable blob', () => {
    const shared = JSON.parse(
      movieToJson({
        title: 'X',
        id: 'abc',
        addedAt: 1,
        watchedAt: 2,
        source: { pluginId: 'p' },
        episodes: [{ id: 'e', title: 'E', src: 'https://x.test/1.m3u8', extra: 'junk' }],
      }),
    )
    for (const key of ['id', 'addedAt', 'watchedAt', 'source']) assert.ok(!(key in shared))
    assert.deepEqual(Object.keys(shared.episodes[0]).sort(), ['src', 'title'])
  })
})

describe('sortMovies', () => {
  const movies = [
    { title: 'A', addedAt: 100, updatedAt: 900, lastPlayedAt: 300, episodes: [] },
    { title: 'C', addedAt: 300, updatedAt: 400, episodes: [] },
    { title: 'B', addedAt: 200, lastPlayedAt: 800, episodes: [] },
  ]
  const order = (o, positions) =>
    sortMovies(movies, o, positions)
      .map((m) => m.title)
      .join(' ')

  it('defaults to recently watched', () => assert.equal(order(undefined), order('watched')))
  it('sorts by add time', () => assert.equal(order('added'), 'C B A'))
  it('falls back to add time when never edited', () => assert.equal(order('updated'), 'A C B'))
  it('sorts by title', () => assert.equal(order('title'), 'A B C'))
  it('falls back to watched for an unknown order', () =>
    assert.equal(order('nonsense'), order('watched')))

  it('interleaves an unwatched movie by when it was added', () => {
    // Otherwise a movie you just added would sink beneath everything watched.
    assert.equal(order('watched'), 'B C A')
  })

  it('reads a stored position when the movie predates lastPlayedAt', () => {
    const legacy = [
      { title: 'X', addedAt: 1, episodes: [{ src: 'x1' }, { src: 'x2' }] },
      { title: 'Y', addedAt: 2, episodes: [{ src: 'y1' }] },
    ]
    const positions = { x2: { updatedAt: 50 }, y1: { updatedAt: 10 } }
    assert.equal(sortMovies(legacy, 'watched', positions)[0].title, 'X')
  })

  it('leaves the stored order alone', () => {
    sortMovies(movies, 'title')
    assert.equal(movies.map((m) => m.title).join(' '), 'A C B')
  })
})

describe('markWatched', () => {
  const build = async () => {
    const movie = await addMovie({
      title: 'Series',
      episodes: [
        { title: 'E1', src: 'https://x.test/1.m3u8' },
        { title: 'E2', src: 'https://x.test/2.m3u8' },
      ],
    })
    await setLastPlayed(movie.id, movie.episodes[1].id)
    await saveProgress(movie.episodes[1].src, 300, 1800)
    await saveProgress('https://other.test/keep.m3u8', 100, 1800)
    return movie
  }
  const find = async (id) => (await getLibrary()).movies.find((m) => m.id === id)

  it('records it finished and clears what that implies', async () => {
    const movie = await build()
    await markWatched(movie.id)
    const marked = await find(movie.id)

    assert.ok(Number.isFinite(marked.watchedAt))
    assert.equal(marked.lastEpisodeId, null)
    assert.equal(resumeEpisodeId(marked), marked.episodes[0].id, 'Play again starts at one')
    assert.equal((await getLibrary()).lastPlayed, null, 'continue watching moves off it')
    assert.ok(!(await getAllProgress())['https://x.test/2.m3u8'])
  })

  it('leaves other movies’ positions alone', async () => {
    const movie = await build()
    await markWatched(movie.id)
    assert.ok((await getAllProgress())['https://other.test/keep.m3u8'])
  })

  it('is cleared by opening the movie again', async () => {
    const movie = await build()
    await markWatched(movie.id)
    await setLastPlayed(movie.id, movie.episodes[0].id)
    assert.equal((await find(movie.id)).watchedAt, null)
  })

  it('unmarks without resurrecting the positions', async () => {
    const movie = await build()
    await markWatched(movie.id)
    await markWatched(movie.id, false)
    assert.equal((await find(movie.id)).watchedAt, null)
    assert.ok(!(await getAllProgress())['https://x.test/2.m3u8'])
  })

  it('does nothing for an unknown id', async () => {
    await build()
    await markWatched('no-such-movie')
    assert.equal((await getLibrary()).movies.length, 1)
  })
})

describe('setEpisodes', () => {
  it('keeps the id of a URL that is still there, so progress survives', async () => {
    const movie = await addMovie({
      title: 'M',
      episodes: [{ title: 'E1', src: 'https://x.test/1.m3u8' }],
    })
    const firstId = movie.episodes[0].id

    await setEpisodes(movie.id, [
      { title: 'E1', src: 'https://x.test/1.m3u8' },
      { title: 'E2', src: 'https://x.test/2.m3u8' },
    ])

    const after = (await getLibrary()).movies[0]
    assert.equal(after.episodes.length, 2)
    assert.equal(after.episodes[0].id, firstId)
  })

  it('keeps stored subtitles when a refresh brings none', async () => {
    const movie = await addMovie({
      title: 'M',
      episodes: [
        {
          title: 'E1',
          src: 'https://x.test/1.m3u8',
          subtitles: [{ label: 'EN', src: 'https://x.test/en.vtt' }],
        },
      ],
    })
    await setEpisodes(movie.id, [{ title: 'E1', src: 'https://x.test/1.m3u8' }])
    assert.equal((await getLibrary()).movies[0].episodes[0].subtitles.length, 1)
  })
})

describe('resolveConfig', () => {
  it('lets the movie win and a blank field inherit', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      referer: 'https://global/',
      adPattern: 'global',
      skipLeading: 5,
    }
    const config = resolveConfig({ referer: '', adPattern: 'own', skipLeading: 0 }, settings)

    assert.equal(config.referer, 'https://global/', 'blank inherits')
    assert.equal(config.adPattern, 'own', 'set overrides')
    assert.equal(config.skipLeading, 0, 'zero is a value, not a blank')
  })

  it('falls back entirely for a grabbed link with no movie', () => {
    const config = resolveConfig(null, { ...DEFAULT_SETTINGS, referer: 'https://global/' })
    assert.equal(config.referer, 'https://global/')
  })
})

describe('parseEpisodeLines', () => {
  it('splits the title on the last pipe', () => {
    const { episodes } = parseEpisodeLines('A | B | https://x.test/1.m3u8')
    assert.equal(episodes[0].title, 'A | B')
  })

  it('reads subtitle URLs after the video URL', () => {
    const { episodes, skipped } = parseEpisodeLines(
      'Ep 1 | https://x.test/1.m3u8 https://x.test/en.vtt https://x.test/es.srt',
    )
    assert.equal(skipped, 0)
    assert.equal(episodes[0].src, 'https://x.test/1.m3u8')
    assert.equal(episodes[0].subtitles.length, 2)
  })

  it('still reads a plain line exactly as before', () => {
    const { episodes } = parseEpisodeLines('https://x.test/1.m3u8')
    assert.equal(episodes[0].src, 'https://x.test/1.m3u8')
    assert.ok(!('subtitles' in episodes[0]))
  })

  it('collapses duplicates', () =>
    assert.equal(
      parseEpisodeLines('https://x.test/1.m3u8\nhttps://x.test/1.m3u8').episodes.length,
      1,
    ))

  it('reports a mistyped subtitle rather than dropping it quietly', () => {
    const { episodes, skipped } = parseEpisodeLines('Ep | https://x.test/1.m3u8 htps://typo.vtt')
    assert.equal(skipped, 1)
    assert.equal(episodes.length, 0)
  })
})

describe('EMPTY_MOVIE', () => {
  it('starts every optional field at its inherit value', () => {
    assert.equal(EMPTY_MOVIE.referer, '')
    assert.equal(EMPTY_MOVIE.adPattern, '')
    assert.equal(EMPTY_MOVIE.skipLeading, null)
    assert.equal(EMPTY_MOVIE.autoSkip, null)
    assert.equal(EMPTY_MOVIE.source, null)
  })
})
