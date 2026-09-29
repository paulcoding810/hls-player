import { settingsStorage } from '.'
import { SORT_ORDERS } from './constants'

export const DEFAULT_SETTINGS = {
  /** Sent as the `Referer` header for items that do not carry their own. */
  referer: '',
  /** Regex matching the URI of an SSAI ad segment; blank strips nothing. */
  adPattern: '',
  /** Take over navigations to a `.m3u8` or `.mpd` URL. */
  grabLinks: true,
  /** How the library grid is arranged — one of `SORT_ORDERS`. */
  gallerySort: 'watched',
  autoplay: true,
  muted: false,
  /** Where the volume slider was left, 0-1. */
  volume: 1,
  /** Turn a subtitle track on by itself when the stream carries one. */
  subtitlesOn: false,
  /** Preferred track language, matched on the prefix so `en` finds `en-GB`. */
  subtitleLang: '',
  /** Cue scale, 0.75-2. */
  subtitleSize: 1,
  /** The shaded box behind the cue text. */
  subtitleBackground: true,
  /** Rem above the bottom edge — one of `SUBTITLE_POSITIONS`. */
  subtitlePosition: 4.5,
  playbackRate: 1,
  /** Skip the windows below without asking; off turns them into buttons. */
  autoSkip: true,
  /** Seconds cut from the start of every item (intros). */
  skipLeading: 0,
  /** Seconds before the end at which the next item starts (credits). */
  skipTrailing: 0,
}

/** A stored value outside its range would mute the player or make `volume()` throw. */
function clamp(value, low = 0, high = 1, fallback = 1) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(high, Math.max(low, number)) : fallback
}

function toSeconds(value) {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0
}

export function sanitizeSettings(settings) {
  return {
    ...settings,
    referer: (settings.referer ?? '').trim(),
    gallerySort: SORT_ORDERS.some((order) => order.value === settings.gallerySort)
      ? settings.gallerySort
      : DEFAULT_SETTINGS.gallerySort,
    adPattern: (settings.adPattern ?? '').trim(),
    autoplay: Boolean(settings.autoplay),
    muted: Boolean(settings.muted),
    volume: clamp(settings.volume),
    subtitlesOn: Boolean(settings.subtitlesOn),
    subtitleLang: (settings.subtitleLang ?? '').trim().toLowerCase(),
    subtitleSize: clamp(settings.subtitleSize, 0.75, 2, 1),
    subtitleBackground: settings.subtitleBackground !== false,
    subtitlePosition: clamp(settings.subtitlePosition, 1.5, 12, 4.5),
    autoSkip: Boolean(settings.autoSkip),
    grabLinks: Boolean(settings.grabLinks),
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
