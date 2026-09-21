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

/**
 * Substitutes `{name}` from `values`. `{query}` is percent-encoded because it
 * is free text someone typed into the search bar; every other placeholder goes
 * in raw, since those are path fragments the API itself returned and encoding
 * them again would corrupt them. An unknown placeholder is left alone, so a
 * typo shows up in the URL instead of silently becoming an empty string.
 */
export function fillTemplate(text, values) {
  return String(text ?? '').replace(/\{(\w+)\}/g, (whole, name) => {
    const value = values?.[name]
    if (value === null || value === undefined) return whole
    return name === 'query' ? encodeURIComponent(value) : String(value)
  })
}
