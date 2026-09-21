import { libraryStorage } from '.'
import { compilePattern } from '@/utils/playlist'
import { normalizeReferer, normalizeSource } from '@/utils/url'

/**
 * A movie owns its episodes and the config they play with. `referer: ''` and
 * `skipLeading/skipTrailing: null` mean "inherit the global setting".
 */
export const EMPTY_LIBRARY = { movies: [], lastPlayed: null }

export const EMPTY_MOVIE = {
  title: '',
  poster: '',
  referer: '',
  adPattern: '',
  skipLeading: null,
  skipTrailing: null,
  autoSkip: null,
}

export async function getLibrary() {
  const stored = (await libraryStorage.get()) || {}
  return {
    movies: Array.isArray(stored.movies) ? stored.movies : [],
    lastPlayed: stored.lastPlayed ?? null,
  }
}

export async function saveLibrary(next) {
  await libraryStorage.setValue(next)
  return next
}

export function findMovie(library, movieId) {
  return library.movies.find((movie) => movie.id === movieId) ?? null
}

export function findEpisode(movie, episodeId) {
  return movie?.episodes.find((episode) => episode.id === episodeId) ?? null
}

/** `sources` are `{ src, title }`; untitled episodes are numbered. */
export function buildEpisodes(sources, offset = 0) {
  return sources.map((source, position) => ({
    id: crypto.randomUUID(),
    title: source.title?.trim() || `Episode ${offset + position + 1}`,
    src: source.src,
  }))
}

function optionalNumber(value, field) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new Error(`"${field}" must be 0 or more.`)
  return Math.round(number)
}

/**
 * Reads a movie from pasted JSON, in the shape the library stores and the
 * export writes — so a movie lifted out of a backup file pastes straight in.
 * Throws with a message meant for the person who pasted it.
 */
export function parseMovieJson(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That is not valid JSON.')
  }
  if (Array.isArray(raw) || !raw || typeof raw !== 'object') {
    throw new Error('Expected a single movie object, like the example below.')
  }

  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!title) throw new Error('Give the movie a "title".')

  // Episodes may be bare URLs or `{ title, src }`; `url` is accepted for `src`
  // because that is what people reach for.
  const list = Array.isArray(raw.episodes) ? raw.episodes : []
  if (!list.length) throw new Error('Add an "episodes" array with at least one URL.')

  const episodes = list.map((entry, position) => {
    const value = typeof entry === 'string' ? entry : (entry?.src ?? entry?.url)
    const src = normalizeSource(value)
    if (!src) throw new Error(`Episode ${position + 1} has no valid http(s) URL.`)
    return { title: typeof entry?.title === 'string' ? entry.title.trim() : '', src }
  })

  const adPattern = typeof raw.adPattern === 'string' ? raw.adPattern.trim() : ''
  if (adPattern && !compilePattern(adPattern)) {
    throw new Error('"adPattern" is not a valid regular expression.')
  }
  if (raw.autoSkip !== undefined && raw.autoSkip !== null && typeof raw.autoSkip !== 'boolean') {
    throw new Error('"autoSkip" must be true, false or null.')
  }

  return {
    title,
    poster: typeof raw.poster === 'string' ? raw.poster.trim() : '',
    referer: normalizeReferer(raw.referer),
    adPattern,
    skipLeading: optionalNumber(raw.skipLeading, 'skipLeading'),
    skipTrailing: optionalNumber(raw.skipTrailing, 'skipTrailing'),
    autoSkip: raw.autoSkip ?? null,
    episodes,
  }
}

export async function addMovie({ episodes = [], ...config }) {
  const library = await getLibrary()
  const movie = {
    ...EMPTY_MOVIE,
    ...config,
    id: crypto.randomUUID(),
    title: config.title?.trim() || 'Untitled',
    episodes: buildEpisodes(episodes),
    addedAt: Date.now(),
  }
  await saveLibrary({ ...library, movies: [...library.movies, movie] })
  return movie
}

export async function updateMovie(movieId, patch) {
  const library = await getLibrary()
  return saveLibrary({
    ...library,
    movies: library.movies.map((movie) =>
      movie.id === movieId ? { ...movie, ...patch, id: movie.id, updatedAt: Date.now() } : movie,
    ),
  })
}

export async function removeMovie(movieId) {
  const library = await getLibrary()
  return saveLibrary({
    movies: library.movies.filter((movie) => movie.id !== movieId),
    lastPlayed: library.lastPlayed?.movieId === movieId ? null : library.lastPlayed,
  })
}

/**
 * Replaces the episode list. An id is kept for every URL that is still there,
 * which is what carries `lastEpisodeId` and the resume position across an edit.
 */
export async function setEpisodes(movieId, sources) {
  const library = await getLibrary()
  const movie = findMovie(library, movieId)
  if (!movie) return library

  const known = new Map(movie.episodes.map((episode) => [episode.src, episode]))
  const episodes = sources.map((source, position) => {
    const existing = known.get(source.src)
    return {
      id: existing?.id ?? crypto.randomUUID(),
      title: source.title?.trim() || existing?.title || `Episode ${position + 1}`,
      src: source.src,
    }
  })

  return updateMovie(movieId, { episodes })
}

export async function clearLibrary() {
  return saveLibrary(EMPTY_LIBRARY)
}

/** Remembered both globally and on the movie, so each one keeps its own place. */
export async function setLastPlayed(movieId, episodeId) {
  const library = await getLibrary()
  return saveLibrary({
    movies: library.movies.map((movie) =>
      movie.id === movieId
        ? { ...movie, lastEpisodeId: episodeId, lastPlayedAt: Date.now() }
        : movie,
    ),
    lastPlayed: { movieId, episodeId },
  })
}

/**
 * When a movie last came up. `lastPlayedAt` is only stamped from the point it
 * was added, so a library from before then falls back to the freshest watch
 * position it has — which `saveProgress` drops once an episode finishes, hence
 * the pair rather than either alone. A movie that has never been played falls
 * back to when it was added, so adding one puts it at the top rather than
 * burying it under everything already watched.
 */
function watchedAt(movie, positions) {
  if (movie.lastPlayedAt) return movie.lastPlayedAt
  const fromProgress = movie.episodes.reduce(
    (latest, episode) => Math.max(latest, positions[episode.src]?.updatedAt ?? 0),
    0,
  )
  return fromProgress || movie.addedAt || 0
}

function sortKey(movie, order, positions) {
  if (order === 'updated') return movie.updatedAt ?? movie.addedAt ?? 0
  if (order === 'added') return movie.addedAt ?? 0
  return watchedAt(movie, positions)
}

/**
 * Sorted for display; the stored order is left alone. Every order but `title`
 * is newest first, and ties fall back to the reverse of the stored order so
 * movies saved before these timestamps existed still read newest first.
 */
export function sortMovies(movies, order = 'watched', positions = {}) {
  const decorated = movies.map((movie, index) => ({ movie, index }))

  if (order === 'title') {
    decorated.sort((a, b) => a.movie.title.localeCompare(b.movie.title) || a.index - b.index)
  } else {
    decorated.sort(
      (a, b) =>
        sortKey(b.movie, order, positions) - sortKey(a.movie, order, positions) ||
        b.index - a.index,
    )
  }

  return decorated.map((entry) => entry.movie)
}

/** Where opening a movie should start: where it was left, else the beginning. */
export function resumeEpisodeId(movie) {
  return findEpisode(movie, movie?.lastEpisodeId)?.id ?? movie?.episodes?.[0]?.id ?? null
}

/**
 * Movie config wins over the global settings; a blank override inherits.
 */
export function resolveConfig(movie, settings) {
  return {
    referer: movie?.referer || settings.referer,
    adPattern: movie?.adPattern || settings.adPattern,
    skipLeading: movie?.skipLeading ?? settings.skipLeading,
    skipTrailing: movie?.skipTrailing ?? settings.skipTrailing,
    autoSkip: movie?.autoSkip ?? settings.autoSkip,
    playbackRate: settings.playbackRate,
    autoplay: settings.autoplay,
    muted: settings.muted,
  }
}
