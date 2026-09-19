/**
 * Server-side ad insertion splices ad segments straight into the media
 * playlist, so there is no URL to block — by the time VHS parses it the ads are
 * just more `#EXTINF` entries. What sets them apart is the URI, so a pattern
 * naming the ad segments is enough to cut them back out.
 */

/**
 * Tags that describe the segment that follows them, and so go with it when it
 * is dropped. Everything else is playlist state and is always kept.
 */
const SEGMENT_TAGS = [
  '#EXTINF',
  '#EXT-X-BYTERANGE',
  '#EXT-X-DISCONTINUITY',
  '#EXT-X-PROGRAM-DATE-TIME',
  '#EXT-X-GAP',
  '#EXT-X-BITRATE',
]

function isSegmentTag(line) {
  return SEGMENT_TAGS.some((tag) => line === tag || line.startsWith(`${tag}:`))
}

/** Only a finished playlist can be cut: a live window is addressed by sequence number. */
function isComplete(text) {
  return text.includes('#EXT-X-ENDLIST') || text.includes('#EXT-X-PLAYLIST-TYPE:VOD')
}

/**
 * Removes every segment whose URI matches `pattern`, along with the tags that
 * describe it. Returns the text unchanged when there is nothing to do, so the
 * caller can tell a rewrite from a pass-through by identity.
 */
export function stripAdSegments(text, pattern) {
  if (!pattern || typeof text !== 'string') return { text, removed: 0, total: 0 }
  // A main playlist lists renditions, not segments, and arrives as the same
  // request type.
  if (!text.includes('#EXTINF') || !isComplete(text)) return { text, removed: 0, total: 0 }

  const kept = []
  // Tags wait here until a URI closes the segment. Playlist state is `sticky`
  // and survives a dropped segment; buffering it rather than emitting it at
  // once is what keeps the tags in their original order.
  let pending = []
  let removed = 0
  let total = 0

  text.split('\n').forEach((line) => {
    const trimmed = line.trim()

    if (!trimmed) return
    if (trimmed.startsWith('#')) {
      pending.push({ line, sticky: !isSegmentTag(trimmed) })
      return
    }

    // Anything else closes a segment: the URI decides its fate and its tags'.
    total += 1
    const dropped = pattern.test(trimmed)
    if (dropped) removed += 1

    pending.forEach((tag) => {
      if (!dropped || tag.sticky) kept.push(tag.line)
    })
    if (!dropped) kept.push(line)
    pending = []
  })

  // Whatever trails the last segment — `#EXT-X-ENDLIST` and friends.
  pending.forEach((tag) => {
    if (tag.sticky) kept.push(tag.line)
  })

  // A pattern that matches everything is a mistake, not a request for silence.
  if (!removed || removed === total) return { text, removed: 0, total }

  return { text: `${kept.join('\n')}\n`, removed, total }
}

/** A pattern half-typed in the form must not throw inside an XHR callback. */
export function compilePattern(source) {
  if (!source) return null
  try {
    return new RegExp(source)
  } catch {
    return null
  }
}
