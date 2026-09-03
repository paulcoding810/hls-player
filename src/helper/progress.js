import { progressStorage } from '.'

/** Below this many seconds in there is nothing worth resuming. */
export const RESUME_MIN_POSITION = 15

/** The last stretch of an item counts as watched. */
export const RESUME_TAIL = 30

/** Positions are written every few seconds, so the map is capped. */
const MAX_ENTRIES = 200

async function readAll() {
  return (await progressStorage.get()) || {}
}

export async function getProgress(src) {
  const entry = (await readAll())[src]
  return entry?.position > 0 ? entry : null
}

/**
 * Stores where playback stopped, or drops the entry when the position carries
 * no information — near the start, past the tail, or on a live stream.
 */
export async function saveProgress(src, position, duration) {
  if (!src) return

  const finished = Number.isFinite(duration) && position >= duration - RESUME_TAIL
  if (!Number.isFinite(duration) || position < RESUME_MIN_POSITION || finished) {
    return clearProgress(src)
  }

  const all = await readAll()
  all[src] = { position, duration, updatedAt: Date.now() }

  const entries = Object.entries(all)
  if (entries.length > MAX_ENTRIES) {
    entries.sort(([, a], [, b]) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    await progressStorage.setValue(Object.fromEntries(entries.slice(0, MAX_ENTRIES)))
    return
  }

  await progressStorage.setValue(all)
}

export async function clearProgress(src) {
  const all = await readAll()
  if (!(src in all)) return
  delete all[src]
  await progressStorage.setValue(all)
}
