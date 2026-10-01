import { readSubtitles } from '@/utils/subtitles'
import { normalizeSource } from '@/utils/url'

/**
 * Stremio addons describe content rather than hand over URLs: `/meta/` names
 * videos, and a separate `/stream/` call resolves something playable for one of
 * them. Those URLs are often short-lived, so an episode stores the video it
 * names and the player resolves it on play — see `episodeKey` in `library.js`
 * for what that means for stored positions.
 */

/** A dead host must not hang the search. */
const TIMEOUT = 10_000

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

/** A manifest changes rarely, and a search asks for it once per catalog. */
const manifests = new Map()

/** `https://host/path/manifest.json` and `https://host/path` both work. */
function baseOf(plugin) {
  return String(plugin.url ?? '')
    .trim()
    .replace(/\/manifest\.json\/?$/i, '')
    .replace(/\/$/, '')
}

export async function readManifest(plugin) {
  const base = baseOf(plugin)
  if (!base) throw new Error('Give the addon a manifest URL.')

  if (!manifests.has(base)) {
    manifests.set(base, await fetchJson(`${base}/manifest.json`, plugin.name || 'The addon'))
  }
  return manifests.get(base)
}

/** Forgets a cached manifest, so editing a source re-reads it. */
export function forgetManifest(plugin) {
  manifests.delete(baseOf(plugin))
}

/** One result row, shared by searching and browsing. */
function toResult(meta, plugin) {
  return {
    id: meta.id,
    title: meta.name,
    poster: normalizeSource(meta.poster) ?? '',
    type: meta.type || 'movie',
    plugin,
  }
}

function hasExtra(catalog, name) {
  return (catalog?.extra ?? []).some((extra) => extra?.name === name)
}

/** Every catalog an addon publishes, for the browse picker. */
export async function listCatalogs(plugin) {
  const manifest = await readManifest(plugin)

  return (manifest?.catalogs ?? [])
    .filter((catalog) => catalog?.type && catalog?.id)
    .map((catalog) => ({
      type: catalog.type,
      id: catalog.id,
      name: catalog.name || catalog.id,
      /** Only a catalog that declares `skip` can be paged past its first page. */
      pageable: hasExtra(catalog, 'skip'),
    }))
}

/**
 * One page of a catalog. `skip` counts items, not pages, and is left out
 * entirely at the start — some addons answer a bare path but not `skip=0`.
 */
export async function browseCatalog(plugin, catalog, skip = 0) {
  const base = baseOf(plugin)
  const path = skip > 0 ? `${catalog.id}/skip=${skip}` : catalog.id
  const payload = await fetchJson(
    `${base}/catalog/${catalog.type}/${path}.json`,
    plugin.name || 'The addon',
  )

  return (payload?.metas ?? [])
    .filter((meta) => meta?.id && meta?.name)
    .map((meta) => toResult({ ...meta, type: meta.type || catalog.type }, plugin))
}

function searchable(manifest) {
  return (manifest?.catalogs ?? []).filter((catalog) => hasExtra(catalog, 'search'))
}

/**
 * One entry per catalog that declares a `search` extra, rather than a merged
 * list: an addon publishes a catalog per type, and "Series" and "Movies" are
 * different answers to the same question. A catalog that fails reports itself
 * instead of vanishing into the others.
 */
export async function searchStremio(plugin, query) {
  const manifest = await readManifest(plugin)
  const base = baseOf(plugin)
  const label = plugin.name || manifest?.name || 'The addon'

  return Promise.all(
    searchable(manifest).map(async (catalog) => {
      const url = `${base}/catalog/${catalog.type}/${catalog.id}/search=${encodeURIComponent(query)}.json`
      const named = { id: catalog.id, type: catalog.type, name: catalog.name || catalog.id }

      try {
        const metas = (await fetchJson(url, label))?.metas ?? []
        const seen = new Set()
        const results = metas
          .filter((meta) => meta?.id && meta?.name && !seen.has(meta.id) && seen.add(meta.id))
          .map((meta) => toResult(meta, plugin))

        return { catalog: named, results, error: '' }
      } catch (error) {
        return { catalog: named, results: [], error: error.message }
      }
    }),
  )
}

/** `S1E2` when an episode has no title of its own. */
function titleOf(video, position) {
  const named = typeof video.title === 'string' ? video.title.trim() : ''
  if (named) return named
  if (video.season != null && video.episode != null) return `S${video.season}E${video.episode}`
  return `Episode ${position + 1}`
}

async function readMeta(plugin, item) {
  const base = baseOf(plugin)
  const type = item.type || 'movie'
  const payload = await fetchJson(
    `${base}/meta/${type}/${encodeURIComponent(item.id)}.json`,
    plugin.name || 'The addon',
  )

  const meta = payload?.meta
  if (!meta) throw new Error(`${plugin.name || 'The addon'} returned no details for this title.`)
  return { meta, type }
}

/** Episodes carrying the video they name rather than a URL; a movie is its own one. */
function episodesOf(meta, plugin, type) {
  const videos = Array.isArray(meta.videos) ? meta.videos : []
  const entries = videos.length ? videos : [{ id: meta.id, title: meta.name }]

  return entries
    .filter((video) => video?.id)
    .map((video, position) => ({
      title: titleOf(video, position),
      stream: { pluginId: plugin.id, type, videoId: String(video.id) },
    }))
}

export async function fetchStremioEpisodes(plugin, item) {
  const { meta, type } = await readMeta(plugin, item)
  return episodesOf(meta, plugin, type)
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function names(value) {
  return (Array.isArray(value) ? value : []).map(text).filter(Boolean)
}

/**
 * What a details view shows, read defensively: addons fill a different subset
 * of the meta each. `genres` is the deprecated spelling some still send.
 */
export function detailsOf(meta) {
  const genreLinks = (Array.isArray(meta?.links) ? meta.links : [])
    .filter((link) => link?.category === 'Genres')
    .map((link) => link.name)
  const seasons = new Set(
    (Array.isArray(meta?.videos) ? meta.videos : [])
      .map((video) => Number(video?.season))
      .filter((season) => Number.isFinite(season) && season > 0),
  )
  const rating = Number(meta?.imdbRating)

  return {
    title: text(meta?.name),
    poster: normalizeSource(meta?.poster) ?? '',
    background: normalizeSource(meta?.background) ?? '',
    description: text(meta?.description),
    released: text(meta?.releaseInfo) || (meta?.year ? String(meta.year) : ''),
    runtime: text(meta?.runtime),
    genres: names(meta?.genres).length ? names(meta.genres) : names(genreLinks),
    rating: Number.isFinite(rating) && rating > 0 ? rating : null,
    cast: names(meta?.cast),
    director: names(meta?.director),
    seasons: seasons.size,
  }
}

/** Details and episodes from one request, so adding from the view costs no second. */
export async function fetchStremioDetails(plugin, item) {
  const { meta, type } = await readMeta(plugin, item)
  return { details: detailsOf(meta), episodes: episodesOf(meta, plugin, type) }
}

/** What this player can open: everything else needs a torrent client or a browser. */
function playable(stream) {
  return Boolean(normalizeSource(stream?.url))
}

/**
 * Stremio subtitles are `{ id, url, lang }`; ours want a label, and the language
 * is the only thing worth showing in the menu.
 */
function subtitlesOf(stream) {
  const list = Array.isArray(stream?.subtitles) ? stream.subtitles : []

  return readSubtitles(
    list.map((entry) => ({
      src: entry?.url,
      label: entry?.lang || entry?.id || '',
      lang: entry?.lang || '',
    })),
    normalizeSource,
  )
}

/**
 * Every playable stream for one video, in the order the addon gave them —
 * addons put their own preference first. `proxyHeaders` is how one says the
 * stream wants a `Referer`, which is exactly what the header override does.
 */
export async function listStreams(plugin, stream) {
  const base = baseOf(plugin)
  const label = plugin.name || 'The addon'
  const payload = await fetchJson(
    `${base}/stream/${stream.type}/${encodeURIComponent(stream.videoId)}.json`,
    label,
  )

  const streams = Array.isArray(payload?.streams) ? payload.streams : []
  const found = streams.filter(playable)

  if (!found.length) {
    throw new Error(
      streams.length
        ? `${label} offered no stream this player can open — torrents and external links need another app.`
        : `${label} found no stream for this episode.`,
    )
  }

  return found.map((entry) => {
    const headers = entry.behaviorHints?.proxyHeaders?.request ?? {}
    return {
      // Streams carry no id, and two pointing at one URL are one stream.
      url: normalizeSource(entry.url),
      referer: headers.Referer ?? headers.referer ?? '',
      name: entry.name || '',
      // `title` is the deprecated spelling of `description`.
      description: entry.description || entry.title || '',
      bingeGroup: entry.behaviorHints?.bingeGroup || '',
      subtitles: subtitlesOf(entry),
    }
  })
}

/**
 * Which of them to play. A `bingeGroup` is the addon's own way of saying "the
 * same provider and quality as last time", so a choice made once follows the
 * season; anything else falls back to what the addon put first.
 */
export function pickStream(streams, bingeGroup) {
  if (!streams?.length) return null
  return (bingeGroup && streams.find((entry) => entry.bingeGroup === bingeGroup)) || streams[0]
}
