/**
 * Subtitle files are fetched by the extension rather than handed to a `<track>`
 * element, because track loading is CORS-governed and subtitle hosts rarely
 * send the headers — `fetch` is exempt through the host permissions. Having the
 * text in hand makes SRT free to support, since the two formats differ by a
 * header line and a decimal separator.
 */

/** SRT and WebVTT time codes differ only in `,` versus `.` for milliseconds. */
const SRT_TIME = /(\d+:\d{2}:\d{2}),(\d{3})/g

export function toVtt(text) {
  // A BOM before `WEBVTT` makes the parser reject the whole file.
  const body = String(text ?? '')
    .replace(/^\uFEFF/, '')
    .trim()

  if (!body) return ''

  // The header is not evidence of the times: files announcing WEBVTT and then
  // using SRT's comma are common, and the parser rejects every cue in one.
  // SRT cue numbers are legal VTT cue identifiers, so only the times change.
  const cues = body.replace(SRT_TIME, '$1.$2')
  return /^WEBVTT/.test(cues) ? cues : `WEBVTT\n\n${cues}`
}

/** A label for a track the user never named, from the file name. */
export function labelFor(src, position) {
  try {
    const name = decodeURIComponent(new URL(src).pathname.split('/').filter(Boolean).pop() ?? '')
    return name.replace(/\.[^.]+$/, '') || `Subtitles ${position + 1}`
  } catch {
    return `Subtitles ${position + 1}`
  }
}

/**
 * `{ label, src }` entries from what a movie or a plugin supplied: one URL, a
 * list of URLs, or a list of objects. Anything without a usable URL is dropped.
 */
export function readSubtitles(value, normalize) {
  const list = Array.isArray(value) ? value : [value]

  return list
    .map((entry, position) => {
      const raw = typeof entry === 'string' ? entry : (entry?.src ?? entry?.url)
      const src = normalize(raw)
      if (!src) return null

      const label = typeof entry?.label === 'string' ? entry.label.trim() : ''
      return {
        label: label || labelFor(src, position),
        src,
        ...(typeof entry?.lang === 'string' && entry.lang ? { lang: entry.lang.trim() } : {}),
      }
    })
    .filter(Boolean)
}

/**
 * The track to turn on, and whether it settles the choice. A fallback to the
 * first track does not: the preferred language may simply not have arrived yet.
 */
export function preferredTrack(tracks, wanted) {
  const lang = (wanted ?? '').trim().toLowerCase()
  const match = lang
    ? tracks.find((track) => (track.language ?? '').toLowerCase().startsWith(lang))
    : null
  return { track: match ?? tracks[0] ?? null, settled: Boolean(match) || !lang }
}
