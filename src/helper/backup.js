import { EMPTY_MOVIE, getLibrary, saveLibrary } from './library'
import { getAllProgress, mergeProgress } from './progress'
import { EMPTY_PLUGIN, getPlugins, savePlugins } from './plugins'
import { getSettings, saveSettings } from './settings'
import { normalizeSource } from '@/utils/url'

export const BACKUP_FORMAT = 'hls-player-backup'
export const BACKUP_VERSION = 1

export async function buildBackup() {
  const [library, settings, progress, plugins] = await Promise.all([
    getLibrary(),
    getSettings(),
    getAllProgress(),
    getPlugins(),
  ])
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    library,
    settings,
    progress,
    plugins,
  }
}

export function backupFileName(date = new Date()) {
  return `hls-player-${date.toISOString().slice(0, 10)}.json`
}

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null
}

function string(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

/**
 * A backup is a file the user can edit, so every field is taken on suspicion:
 * anything unusable is dropped rather than stored and tripped over later.
 */
function sanitizeMovie(raw) {
  if (!raw || typeof raw !== 'object') return null

  const episodes = (Array.isArray(raw.episodes) ? raw.episodes : [])
    .map((episode, position) => ({
      id: string(episode?.id) || crypto.randomUUID(),
      title: string(episode?.title).trim() || `Episode ${position + 1}`,
      src: normalizeSource(episode?.src),
    }))
    .filter((episode) => episode.src)

  // A movie with no playable episode is not worth importing.
  if (!episodes.length) return null

  const lastEpisodeId = episodes.find((episode) => episode.id === raw.lastEpisodeId)?.id

  return {
    ...EMPTY_MOVIE,
    id: string(raw.id) || crypto.randomUUID(),
    title: string(raw.title).trim() || 'Untitled',
    poster: string(raw.poster),
    referer: string(raw.referer),
    adPattern: string(raw.adPattern),
    source: sanitizeSource(raw.source),
    skipLeading: numberOrNull(raw.skipLeading),
    skipTrailing: numberOrNull(raw.skipTrailing),
    autoSkip: typeof raw.autoSkip === 'boolean' ? raw.autoSkip : null,
    ...(lastEpisodeId ? { lastEpisodeId } : {}),
    episodes,
    addedAt: Number.isFinite(raw.addedAt) ? raw.addedAt : Date.now(),
    ...(Number.isFinite(raw.updatedAt) ? { updatedAt: raw.updatedAt } : {}),
    ...(Number.isFinite(raw.lastPlayedAt) ? { lastPlayedAt: raw.lastPlayedAt } : {}),
  }
}

/** The link back to a source plugin; anything malformed becomes "hand-made". */
function sanitizeSource(raw) {
  const pluginId = string(raw?.pluginId)
  const itemId = string(raw?.itemId)
  return pluginId && itemId ? { pluginId, itemId } : null
}

function sanitizeProgress(raw) {
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(
    Object.entries(raw).flatMap(([src, entry]) => {
      const position = Number(entry?.position)
      const duration = Number(entry?.duration)
      if (!normalizeSource(src) || !(position > 0) || !Number.isFinite(duration)) return []
      return [[src, { position, duration, updatedAt: Number(entry?.updatedAt) || 0 }]]
    }),
  )
}

/** A source plugin is config, so it travels with the rest of it. */
function sanitizePlugin(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = string(raw.name).trim()
  if (!name) return null

  const part = (section, keys) => ({
    url: string(raw[section]?.url).trim(),
    [keys]: string(raw[section]?.[keys]).trim(),
    fields: Object.fromEntries(
      Object.entries(raw[section]?.fields ?? {}).map(([key, value]) => [key, string(value).trim()]),
    ),
  })

  return {
    ...EMPTY_PLUGIN,
    id: string(raw.id) || crypto.randomUUID(),
    name,
    enabled: raw.enabled !== false,
    referer: string(raw.referer),
    search: part('search', 'list'),
    details: part('details', 'episodes'),
  }
}

/**
 * Parses an exported file. Throws with a message meant for the user, since a
 * failed import is nearly always a wrong file rather than a bug.
 */
export function readBackup(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }

  if (parsed?.format !== BACKUP_FORMAT) {
    throw new Error('That file is not an HLS Player export.')
  }
  if (Number(parsed.version) > BACKUP_VERSION) {
    throw new Error('That file was written by a newer version of the extension.')
  }

  const movies = (Array.isArray(parsed.library?.movies) ? parsed.library.movies : [])
    .map(sanitizeMovie)
    .filter(Boolean)
  const progress = sanitizeProgress(parsed.progress)
  const settings = parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : null
  const plugins = (Array.isArray(parsed.plugins) ? parsed.plugins : [])
    .map(sanitizePlugin)
    .filter(Boolean)

  if (!movies.length && !settings && !plugins.length && !Object.keys(progress).length) {
    throw new Error('That file holds nothing to import.')
  }

  return { movies, settings, progress, plugins }
}

/**
 * Folds a backup into what is already stored: a movie is replaced when the file
 * carries the same id, appended otherwise. Nothing local is dropped, so an
 * import can be undone by clearing the library and importing the older file.
 */
export async function applyBackup({ movies, settings, progress, plugins = [] }) {
  const library = await getLibrary()
  const byId = new Map(library.movies.map((movie) => [movie.id, movie]))
  const added = movies.filter((movie) => !byId.has(movie.id)).length

  movies.forEach((movie) => byId.set(movie.id, movie))
  await saveLibrary({ ...library, movies: [...byId.values()] })

  if (plugins.length) {
    const byPluginId = new Map((await getPlugins()).map((plugin) => [plugin.id, plugin]))
    plugins.forEach((plugin) => byPluginId.set(plugin.id, plugin))
    await savePlugins([...byPluginId.values()])
  }

  if (Object.keys(progress).length) await mergeProgress(progress)
  if (settings) await saveSettings(settings)

  return {
    added,
    updated: movies.length - added,
    positions: Object.keys(progress).length,
    plugins: plugins.length,
  }
}
