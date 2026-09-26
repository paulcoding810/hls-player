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
  if (/^WEBVTT/.test(body)) return body

  // SRT cue numbers are legal VTT cue identifiers, so only the times change.
  return `WEBVTT\n\n${body.replace(SRT_TIME, '$1.$2')}`
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
