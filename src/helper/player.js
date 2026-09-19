import { GALLERY_PATH, PLAYER_PATH } from './constants'
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

/**
 * The library is the way in — it carries a Continue watching section for
 * whatever was playing last. Focuses the existing tab when there is one.
 */
export async function openGallery() {
  const stored = await session.get(TAB_KEY)
  const tabId = stored?.[TAB_KEY]

  if (typeof tabId === 'number') {
    try {
      const tab = await api.tabs.get(tabId)
      await api.tabs.update(tabId, { active: true })
      await api.windows?.update(tab.windowId, { focused: true })
      return tab
    } catch {
      // The tab is gone — fall through and open a new one.
    }
  }

  const tab = await api.tabs.create({ url: api.runtime.getURL(GALLERY_PATH) })
  await session.set({ [TAB_KEY]: tab.id })
  return tab
}
