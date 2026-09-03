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
    const src = normalizeSource(separator > -1 ? trimmed.slice(separator + 1) : trimmed)

    if (!src) {
      skipped += 1
      return
    }
    if (seen.has(src)) return
    seen.add(src)
    episodes.push({ title, src })
  })

  return { episodes, skipped }
}

export function fileNameOf(src) {
  try {
    const { pathname, hostname } = new URL(src)
    return decodeURIComponent(pathname.split('/').filter(Boolean).pop() || hostname)
  } catch {
    return src
  }
}
