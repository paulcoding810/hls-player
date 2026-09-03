import { settingsStorage } from '.'

export const DEFAULT_SETTINGS = {
  /** Sent as the `Referer` header for items that do not carry their own. */
  referer: '',
  /** Remembered UI state: the Referer last typed into the add form. */
  lastReferer: '',
  autoplay: true,
  muted: false,
  playbackRate: 1,
  /** Skip the windows below without asking; off turns them into buttons. */
  autoSkip: true,
  /** Seconds cut from the start of every item (intros). */
  skipLeading: 0,
  /** Seconds before the end at which the next item starts (credits). */
  skipTrailing: 0,
}

function toSeconds(value) {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0
}

export function sanitizeSettings(settings) {
  return {
    ...settings,
    referer: (settings.referer ?? '').trim(),
    lastReferer: (settings.lastReferer ?? '').trim(),
    autoplay: Boolean(settings.autoplay),
    muted: Boolean(settings.muted),
    autoSkip: Boolean(settings.autoSkip),
    playbackRate: Number(settings.playbackRate) > 0 ? Number(settings.playbackRate) : 1,
    skipLeading: toSeconds(settings.skipLeading),
    skipTrailing: toSeconds(settings.skipTrailing),
  }
}

export async function getSettings() {
  const stored = (await settingsStorage.get()) || {}
  return sanitizeSettings({ ...DEFAULT_SETTINGS, ...stored })
}

export async function saveSettings(patch) {
  const next = sanitizeSettings({ ...(await getSettings()), ...patch })
  await settingsStorage.setValue(next)
  return next
}
