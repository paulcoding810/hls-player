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

function searchable(manifest) {
  return (manifest?.catalogs ?? []).filter((catalog) =>
    (catalog.extra ?? []).some((extra) => extra?.name === 'search'),
  )
}

/**
 * Every catalog that declares a `search` extra, merged. An addon usually
 * publishes one per type, so a series and a movie catalog both answer.
 */
export async function searchStremio(plugin, query) {
  const manifest = await readManifest(plugin)
  const catalogs = searchable(manifest)
  if (!catalogs.length) return []

  const base = baseOf(plugin)
  const label = plugin.name || manifest?.name || 'The addon'
  const pages = await Promise.all(
    catalogs.map(async (catalog) => {
      const url = `${base}/catalog/${catalog.type}/${catalog.id}/search=${encodeURIComponent(query)}.json`
      try {
        return (await fetchJson(url, label))?.metas ?? []
      } catch {
        // One catalog answering 404 for an unsupported search must not lose
        // the results of the others.
        return []
      }
    }),
  )

  const seen = new Set()
  return pages
    .flat()
    .filter((meta) => meta?.id && meta?.name && !seen.has(meta.id) && seen.add(meta.id))
    .map((meta) => ({
      id: meta.id,
      title: meta.name,
      poster: normalizeSource(meta.poster) ?? '',
      type: meta.type || 'movie',
      plugin,
    }))
}

/** `S1E2` when an episode has no title of its own. */
function titleOf(video, position) {
  const named = typeof video.title === 'string' ? video.title.trim() : ''
  if (named) return named
  if (video.season != null && video.episode != null) return `S${video.season}E${video.episode}`
  return `Episode ${position + 1}`
}

/**
 * Episodes carrying the video they name rather than a URL. A movie has no
 * `videos`, so its own id is the one episode.
 */
export async function fetchStremioEpisodes(plugin, item) {
  const base = baseOf(plugin)
  const type = item.type || 'movie'
  const payload = await fetchJson(
    `${base}/meta/${type}/${encodeURIComponent(item.id)}.json`,
    plugin.name || 'The addon',
  )

  const meta = payload?.meta
  if (!meta) throw new Error(`${plugin.name || 'The addon'} returned no details for this title.`)

  const videos = Array.isArray(meta.videos) ? meta.videos : []
  const entries = videos.length ? videos : [{ id: meta.id, title: meta.name }]

  return entries
    .filter((video) => video?.id)
    .map((video, position) => ({
      title: titleOf(video, position),
      stream: { pluginId: plugin.id, type, videoId: String(video.id) },
    }))
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
 * The first playable stream for one video, with whatever it carries.
 * `proxyHeaders` is how an addon says the stream wants a `Referer`, which is
 * exactly what the header override does.
 */
export async function resolveStream(plugin, stream) {
  const base = baseOf(plugin)
  const label = plugin.name || 'The addon'
  const payload = await fetchJson(
    `${base}/stream/${stream.type}/${encodeURIComponent(stream.videoId)}.json`,
    label,
  )

  const streams = Array.isArray(payload?.streams) ? payload.streams : []
  const found = streams.find(playable)

  if (!found) {
    throw new Error(
      streams.length
        ? `${label} offered no stream this player can open — torrents and external links need another app.`
        : `${label} found no stream for this episode.`,
    )
  }

  const headers = found.behaviorHints?.proxyHeaders?.request ?? {}
  const referer = headers.Referer ?? headers.referer ?? ''

  return {
    url: normalizeSource(found.url),
    referer,
    name: found.name || found.title || '',
    subtitles: subtitlesOf(found),
  }
}
