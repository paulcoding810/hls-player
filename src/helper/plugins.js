import { pluginStorage } from '.'
import { episodeKey, setEpisodes } from './library'
import { fetchStremioEpisodes, searchStremio } from './stremio'

/**
 * A source is a Stremio addon: one manifest URL, and the protocol supplies the
 * rest. `kind` carries its only value on purpose — it is what lets a source
 * stored before this, or imported from an older export, be recognised and
 * dropped rather than quietly kept.
 */
export const EMPTY_PLUGIN = {
  name: '',
  enabled: true,
  kind: 'stremio',
  /** The addon's manifest URL. */
  url: '',
  /** Both inherited by movies added from this source, for playback. */
  referer: '',
  adPattern: '',
}

export async function getPlugins() {
  const stored = (await pluginStorage.get()) || {}
  const items = Array.isArray(stored.items) ? stored.items : []

  // Sources described by hand-written paths are no longer readable. Dropping
  // them once and writing back beats re-deciding on every read.
  const addons = items.filter((plugin) => plugin.kind === 'stremio')
  if (addons.length !== items.length) await savePlugins(addons)
  return addons
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
      url: plugin.url || undefined,
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

/**
 * Every enabled source at once. One that fails comes back with its `error` set
 * rather than taking the others down with it.
 */
export async function searchAll(plugins, query) {
  const enabled = plugins.filter((plugin) => plugin.enabled)

  return Promise.all(
    enabled.map(async (plugin) => {
      try {
        return { plugin, results: await searchStremio(plugin, query), error: '' }
      } catch (error) {
        return { plugin, results: [], error: error.message }
      }
    }),
  )
}

/**
 * Re-reads a plugin-backed movie's episodes. `setEpisodes` keeps the id of any
 * URL still present, so `lastEpisodeId` and every stored watch position ride
 * through; nothing the user edited — title, poster, config — is touched.
 */
export async function refreshMovie(movie, plugins) {
  const plugin = plugins.find((item) => item.id === movie.source?.pluginId)
  if (!plugin) throw new Error('The source this movie came from is gone.')

  const episodes = await fetchStremioEpisodes(plugin, {
    id: movie.source.itemId,
    type: movie.source.type,
  })
  if (!episodes.length) throw new Error(`${plugin.name || 'The source'} returned no episodes.`)

  // By key, not URL: an addon's episodes have none, so counting by `src` made
  // every refresh report nothing new.
  const known = new Set(movie.episodes.map(episodeKey))
  await setEpisodes(movie.id, episodes)

  return { added: episodes.filter((episode) => !known.has(episodeKey(episode))).length }
}
