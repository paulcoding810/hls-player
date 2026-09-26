import { pluginStorage } from '.'
import { setEpisodes } from './library'
import { fillTemplate, readPath } from '@/utils/jsonPath'
import { readSubtitles } from '@/utils/subtitles'
import { normalizeSource } from '@/utils/url'

/**
 * A source plugin is the user's description of one site's JSON API — two URL
 * templates and the paths its values sit at. It holds no code: MV3 forbids
 * running any, so extraction is data. See `src/utils/jsonPath.js`.
 */
export const EMPTY_PLUGIN = {
  name: '',
  enabled: true,
  /** Both inherited by movies added from this source, for playback. */
  referer: '',
  adPattern: '',
  search: { url: '', list: '', fields: { id: '', title: '', poster: '' } },
  details: { url: '', episodes: '', fields: { title: '', src: '', subtitles: '' } },
}

/** A dead host must not hang the search. */
const TIMEOUT = 10_000

export async function getPlugins() {
  const stored = (await pluginStorage.get()) || {}
  return Array.isArray(stored.items) ? stored.items : []
}

export async function savePlugins(items) {
  await pluginStorage.setValue({ items })
  return items
}

export async function addPlugin(config) {
  const plugins = await getPlugins()
  const plugin = { ...EMPTY_PLUGIN, ...config, id: crypto.randomUUID() }
  await savePlugins([...plugins, plugin])
  return plugin
}

export async function updatePlugin(pluginId, patch) {
  const plugins = await getPlugins()
  return savePlugins(
    plugins.map((plugin) =>
      plugin.id === pluginId ? { ...plugin, ...patch, id: plugin.id } : plugin,
    ),
  )
}

export async function removePlugin(pluginId) {
  return savePlugins((await getPlugins()).filter((plugin) => plugin.id !== pluginId))
}

/**
 * A source as the text its JSON mode reads back, for sharing one. `id` is left
 * out because it is local to this install, and a blank optional field is
 * omitted rather than written empty — absent means "not set" on the way back.
 */
export function pluginToJson(plugin) {
  return JSON.stringify(
    {
      name: plugin.name,
      referer: plugin.referer || undefined,
      adPattern: plugin.adPattern || undefined,
      // Only worth stating when it is not the default.
      enabled: plugin.enabled === false ? false : undefined,
      search: plugin.search,
      details: plugin.details,
    },
    null,
    2,
  )
}

function text(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

async function fetchJson(url, label) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  try {
    // Each failure is caught where it happens, so a message this function
    // writes is never caught and labelled a second time on the way out.
    let response
    try {
      response = await fetch(url, { signal: controller.signal })
    } catch (error) {
      throw new Error(
        error.name === 'AbortError'
          ? `${label} did not answer in time.`
          : `${label}: ${error.message}`,
      )
    }

    if (!response.ok) throw new Error(`${label} answered ${response.status}.`)

    try {
      return await response.json()
    } catch {
      throw new Error(`${label} did not return JSON.`)
    }
  } finally {
    clearTimeout(timer)
  }
}

/** The array a `list`/`episodes` path points at, or an empty one. */
function listAt(payload, path) {
  const found = readPath(payload, path)
  return Array.isArray(found) ? found : []
}

/** A field is a path into the entry, unless it holds `{`, which makes it a template. */
function valueOf(entry, path) {
  if (!String(path).includes('{')) return readPath(entry, path)

  const filled = fillTemplate(path, entry)
  // A placeholder still standing means the entry had nothing for it. Returning
  // the half-built string would be worse than nothing: `new URL` accepts
  // `https://host/{path}.m3u8`, so it would pass for a real episode URL.
  return /\{\w+\}/.test(filled) ? '' : filled
}

function extract(entry, fields) {
  return Object.fromEntries(
    Object.entries(fields ?? {}).map(([name, path]) => [name, text(valueOf(entry, path))]),
  )
}

/** `page` is 1-based; a URL without `{page}` simply ignores it. */
export async function searchPlugin(plugin, query, page = 1) {
  const url = fillTemplate(plugin.search?.url, { query, page })
  const payload = await fetchJson(url, plugin.name || 'The source')

  return (
    listAt(payload, plugin.search?.list)
      .map((entry) => ({ ...extract(entry, plugin.search?.fields), plugin }))
      // Half a result is worse than none: it could neither be shown nor fetched.
      .filter((result) => result.id && result.title)
  )
}

/** Episodes for one search result, ready for `addMovie`/`setEpisodes`. */
export async function fetchEpisodes(plugin, item) {
  const url = fillTemplate(plugin.details?.url, item)
  const payload = await fetchJson(url, plugin.name || 'The source')

  return listAt(payload, plugin.details?.episodes)
    .map((entry) => {
      const fields = extract(entry, plugin.details?.fields)
      // The subtitles path may name one URL or a list, so the raw value is
      // read rather than the flattened text `extract` produces.
      const subtitles = readSubtitles(
        readPath(entry, plugin.details?.fields?.subtitles) ?? fields.subtitles,
        normalizeSource,
      )
      return {
        title: fields.title,
        src: normalizeSource(fields.src),
        ...(subtitles.length ? { subtitles } : {}),
      }
    })
    .filter((episode) => episode.src)
}

/**
 * Every enabled source at once. One that fails comes back with its `error` set
 * rather than taking the others down with it.
 */
export async function searchAll(plugins, query) {
  const enabled = plugins.filter((plugin) => plugin.enabled)

  return Promise.all(
    enabled.map(async (plugin) => {
      try {
        const results = await searchPlugin(plugin, query)
        // Nothing on page one means there is nothing to page through either.
        return { plugin, results, error: '', page: 1, done: results.length === 0 }
      } catch (error) {
        return { plugin, results: [], error: error.message, page: 1, done: true }
      }
    }),
  )
}

/**
 * The next page for one group, folded into the results it already has.
 * Duplicates are dropped by id, which is also what catches a search URL with no
 * `{page}` in it: the same page comes back, nothing is new, and paging stops
 * rather than offering More for ever.
 */
export async function loadMore(group, query) {
  const page = group.page + 1
  const seen = new Set(group.results.map((result) => result.id))
  const fresh = (await searchPlugin(group.plugin, query, page)).filter(
    (result) => !seen.has(result.id),
  )

  return { ...group, results: [...group.results, ...fresh], page, done: fresh.length === 0 }
}

/**
 * Re-reads a plugin-backed movie's episodes. `setEpisodes` keeps the id of any
 * URL still present, so `lastEpisodeId` and every stored watch position ride
 * through; nothing the user edited — title, poster, config — is touched.
 */
export async function refreshMovie(movie, plugins) {
  const plugin = plugins.find((item) => item.id === movie.source?.pluginId)
  if (!plugin) throw new Error('The source this movie came from is gone.')

  const episodes = await fetchEpisodes(plugin, { id: movie.source.itemId })
  if (!episodes.length) throw new Error(`${plugin.name || 'The source'} returned no episodes.`)

  const known = new Set(movie.episodes.map((episode) => episode.src))
  await setEpisodes(movie.id, episodes)

  return { added: episodes.filter((episode) => !known.has(episode.src)).length }
}
