/**
 * A plugin describes where its data sits rather than carrying code to find it:
 * MV3 pins extension pages to `script-src 'self'`, so there is no `eval` and no
 * `new Function` to run a parse function someone pasted in. These two are the
 * whole extraction language.
 */

const SEGMENT = /[^.[\]]+|\[\d+\]/g

/**
 * The value at `data.play[0].list`, or `undefined` as soon as anything along
 * the way is missing. A wrong path must come back empty, never throw — this
 * runs inside a fetch handler where a throw would lose the whole search.
 */
export function readPath(value, path) {
  if (!path) return undefined

  return (String(path).match(SEGMENT) ?? []).reduce((current, segment) => {
    if (current === null || current === undefined) return undefined
    const key = segment.startsWith('[') ? Number(segment.slice(1, -1)) : segment
    return current[key]
  }, value)
}

/** Cuts on the first separator only, so an argument may contain more of them. */
function splitOnce(text, separator) {
  const at = text.indexOf(separator)
  return at === -1 ? [text, undefined] : [text.slice(0, at), text.slice(at + separator.length)]
}

/**
 * What a source returns is often near the playable URL rather than it. These
 * reshape it — they are the whole transformation language, since MV3 forbids
 * running a function a plugin supplied.
 */
const FILTERS = {
  /**
   * `replace:from,to`, on every occurrence rather than the first as JS would:
   * swapping a token is the usual intent, and a longer `from` narrows it.
   * A missing `to` removes — `replace:vod-,`.
   */
  replace: (value, argument) => {
    const [from, to = ''] = splitOnce(String(argument ?? ''), ',')
    return from ? value.split(from).join(to) : value
  },
  lower: (value) => value.toLowerCase(),
  upper: (value) => value.toUpperCase(),
  trim: (value) => value.trim(),
  /** For a value going into a query string rather than a path. */
  encode: (value) => encodeURIComponent(value),
}

/**
 * Substitutes `{name}` from `values`, optionally through `|` filters:
 * `{url|replace:video,stream}`. `{query}` is percent-encoded because it is free
 * text someone typed into the search bar; every other placeholder goes in raw,
 * since those are path fragments the API itself returned and encoding them
 * again would corrupt them.
 *
 * A missing value or an unknown filter leaves the whole placeholder standing.
 * That is what makes a mistake visible: `valueOf` in `helper/plugins.js` drops
 * any field still holding one, so a typo yields nothing rather than a URL built
 * around a literal `{url|replce:a,b}` — which `new URL` would accept.
 */
export function fillTemplate(text, values) {
  return String(text ?? '').replace(/\{([^{}]+)\}/g, (whole, body) => {
    const [name, ...steps] = body.split('|')
    const value = values?.[name.trim()]
    if (value === null || value === undefined) return whole

    let result = String(value)
    for (const step of steps) {
      const [filterName, argument] = splitOnce(step.trim(), ':')
      const filter = FILTERS[filterName]
      if (!filter) return whole
      result = filter(result, argument)
    }

    return name.trim() === 'query' ? encodeURIComponent(result) : result
  })
}
