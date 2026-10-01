const KEY = 'tabHeaders'

/**
 * Per-tab header entries that survive the background being unloaded. Firefox's
 * MV3 background is an event page: it is dropped when idle, and a paused video
 * is idle. Kept only in memory, the map came back empty on the next segment
 * request and the stream lost its `Referer`. `storage.session` lives as long as
 * the browser does and no longer, which is exactly a tab's lifetime.
 */
export function createHeaderStore(session) {
  const tabs = new Map()
  let loaded = !session
  let loading = null

  const save = () => session?.set({ [KEY]: Object.fromEntries(tabs) })

  return {
    get loaded() {
      return loaded
    },

    /** Reads what an earlier life of the background stored; once. */
    load() {
      if (!session) return Promise.resolve()
      loading ??= (async () => {
        try {
          const stored = (await session.get(KEY))?.[KEY] ?? {}
          // A tab set since waking is newer than what was stored for it.
          Object.entries(stored).forEach(([tabId, entries]) => {
            if (!tabs.has(Number(tabId))) tabs.set(Number(tabId), entries)
          })
        } catch (error) {
          console.warn('failed to restore header rules', error)
        } finally {
          loaded = true
        }
      })()
      return loading
    },

    get(tabId) {
      return tabs.get(tabId)
    },

    async set(tabId, entries) {
      await this.load()
      tabs.set(tabId, entries)
      await save()
    },

    async delete(tabId) {
      await this.load()
      if (!tabs.delete(tabId)) return
      await save()
    },
  }
}
