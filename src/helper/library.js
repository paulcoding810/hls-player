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
      movie.id === movieId ? { ...movie, ...patch, id: movie.id } : movie,
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
      movie.id === movieId ? { ...movie, lastEpisodeId: episodeId } : movie,
    ),
    lastPlayed: { movieId, episodeId },
  })
}

/**
 * Newest first. Movies stored before `addedAt` existed have no timestamp, so
 * they fall back to their position in the list, which was oldest-first.
 */
export function sortedByAdded(movies) {
  return movies
    .map((movie, index) => ({ movie, index }))
    .sort((a, b) => (b.movie.addedAt ?? 0) - (a.movie.addedAt ?? 0) || b.index - a.index)
    .map((entry) => entry.movie)
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
