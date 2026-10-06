import { HOME_PATH, PLAYER_PATH } from './constants'
import api from '@/utils/api'

const TAB_KEY = 'playerTabId'
const session = api.storage.session ?? api.storage.local

/** Addressable playback: the page can be bookmarked, reloaded and shared. */
export function playerUrlForEpisode(movieId, episodeId) {
  const params = new URLSearchParams({ movie: movieId, episode: episodeId })
  return `${PLAYER_PATH}?${params}`
}

/** Plays a URL straight away, without it entering the library. */
export function playerUrlFor(src) {
  return `${PLAYER_PATH}?src=${encodeURIComponent(src)}`
}

/** The global defaults live on the options page, not in a page of their own. */
export function openOptions() {
  return api.runtime.openOptionsPage()
}

/** Opens an episode in a tab of its own, so the library stays where it was. */
export function openPlayer(movieId, episodeId) {
  return api.tabs.create({ url: api.runtime.getURL(playerUrlForEpisode(movieId, episodeId)) })
}

/** The library tab, brought forward, or null when there is none any more. */
async function focusHomeTab() {
  const stored = await session.get(TAB_KEY)
  const tabId = stored?.[TAB_KEY]
  if (typeof tabId !== 'number') return null

  try {
    const tab = await api.tabs.get(tabId)
    await api.tabs.update(tabId, { active: true })
    await api.windows?.update(tab.windowId, { focused: true })
    return tab
  } catch {
    // The tab is gone.
    return null
  }
}

/**
 * Recorded by the library page itself, not only when the toolbar icon opens
 * it, so a player opened from any library tab can find its way back.
 */
export async function rememberHomeTab() {
  const tab = await api.tabs.getCurrent()
  if (typeof tab?.id === 'number') await session.set({ [TAB_KEY]: tab.id })
}

/**
 * The library is the way in — it carries a Continue watching section for
 * whatever was playing last. Focuses the existing tab when there is one.
 */
export async function openHome() {
  const existing = await focusHomeTab()
  if (existing) return existing

  const tab = await api.tabs.create({ url: api.runtime.getURL(HOME_PATH) })
  await session.set({ [TAB_KEY]: tab.id })
  return tab
}

/**
 * Leaving the player: it opened in its own tab, so that tab goes and the
 * library tab comes forward. With no library tab left, the player becomes one.
 */
export async function leavePlayer() {
  const [current, home] = await Promise.all([api.tabs.getCurrent(), focusHomeTab()])
  if (home && typeof current?.id === 'number' && current.id !== home.id) {
    await api.tabs.remove(current.id)
    return
  }
  window.location.href = HOME_PATH
}
