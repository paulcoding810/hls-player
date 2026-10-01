/**
 * Holds one episode's streams resolved ahead of time. One slot, because only
 * the next episode is ever wanted, and `take` empties it whatever it finds so
 * a stale entry can never be picked up twice.
 */
export function createPreloader({ ttl, now = Date.now }) {
  let held = null

  return {
    start(key, load) {
      if (held?.key === key) return
      const promise = Promise.resolve().then(load)
      held = { key, promise, at: now() }
      // A failed preload costs nothing: the load resolves afresh and reports.
      promise.catch(() => {
        if (held?.promise === promise) held = null
      })
    },

    take(key) {
      const entry = held
      held = null
      if (!entry || entry.key !== key || now() - entry.at > ttl) return null
      return entry.promise
    },
  }
}

/** Inside the outro window, or within `lead` seconds of a real end. */
export function preloadDue(time, duration, skipTrailing, lead) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(time)) return false
  const outro = skipTrailing > 0 && duration > skipTrailing ? skipTrailing : 0
  return duration - time <= Math.max(outro, lead)
}
