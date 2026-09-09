import { GALLERY_PATH, PLAYER_PATH } from './constants'
import { findEpisode, findMovie, getLibrary } from './library'
import api from '@/utils/api'

const TAB_KEY = 'playerTabId'
const session = api.storage.session ?? api.storage.local

/** Plays a URL straight away, without it entering the library. */
export function playerUrlFor(src) {
  return `${PLAYER_PATH}?src=${encodeURIComponent(src)}`
}

/** The player continues the last episode; with nothing to continue, the library. */
async function landingPath() {
  const library = await getLibrary()
  const movie = findMovie(library, library.lastPlayed?.movieId)
  const episode = findEpisode(movie, library.lastPlayed?.episodeId)
  return episode || movie?.episodes.length ? PLAYER_PATH : GALLERY_PATH
}

/** Focuses the existing tab when there is one, otherwise opens it. */
export async function openPlayer() {
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

  const tab = await api.tabs.create({ url: api.runtime.getURL(await landingPath()) })
  await session.set({ [TAB_KEY]: tab.id })
  return tab
}
