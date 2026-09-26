import { readSubtitles } from './subtitles'

/** Returns a normalized http(s) URL, or `null` when the input is unusable. */
export function normalizeSource(input) {
  const value = (input || '').trim()
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** A `Referer` may be a bare origin, so it is normalized separately. */
export function normalizeReferer(input) {
  const value = (input || '').trim()
  if (!value) return ''
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try {
    return new URL(withScheme).href
  } catch {
    return ''
  }
}

/**
 * One episode per line, either a bare URL or `Title | https://…`. Titles may
 * contain anything, so the last `|` is the separator.
 *
 * After it come one or more URLs separated by whitespace: the video first, any
 * subtitle files after it. A URL cannot hold an unencoded space, so this stays
 * unambiguous, and a line carrying a single URL reads exactly as it always did.
 */
export function parseEpisodeLines(text) {
  const lines = (text || '').split(/\r?\n/)
  const episodes = []
  const seen = new Set()
  let skipped = 0

  lines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) return

    const separator = trimmed.lastIndexOf('|')
    const title = separator > -1 ? trimmed.slice(0, separator).trim() : ''
    const [first, ...rest] = (separator > -1 ? trimmed.slice(separator + 1) : trimmed)
      .split(/\s+/)
      .filter(Boolean)

    const src = normalizeSource(first)
    if (!src) {
      skipped += 1
      return
    }

    // A mistyped subtitle URL is reported rather than quietly dropped — losing
    // one without saying so is how a line silently loses half its meaning.
    const subtitles = readSubtitles(rest, normalizeSource)
    if (subtitles.length !== rest.length) {
      skipped += 1
      return
    }

    if (seen.has(src)) return
    seen.add(src)
    episodes.push({ title, src, ...(subtitles.length ? { subtitles } : {}) })
  })

  return { episodes, skipped }
}

export const HLS_MIME = 'application/x-mpegURL'
export const DASH_MIME = 'application/dash+xml'

/**
 * `.mpd` is DASH, everything else is assumed to be HLS — most stream URLs carry
 * no usable extension, and HLS is what they turn out to be.
 */
export function manifestMime(src) {
  try {
    return new URL(src).pathname.toLowerCase().endsWith('.mpd') ? DASH_MIME : HLS_MIME
  } catch {
    return HLS_MIME
  }
}

/** True when the URL *path* names a manifest, whatever the query string says. */
export function isManifestUrl(src) {
  try {
    const path = new URL(src).pathname.toLowerCase()
    return path.endsWith('.m3u8') || path.endsWith('.mpd')
  } catch {
    return false
  }
}

export function fileNameOf(src) {
  try {
    const { pathname, hostname } = new URL(src)
    return decodeURIComponent(pathname.split('/').filter(Boolean).pop() || hostname)
  } catch {
    return src
  }
}
