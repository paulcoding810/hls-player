import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

/**
 * Stands in for what Vite does at build time: the `@/` alias, and imports
 * written without a file extension. Without this the modules under test would
 * have to be import-compatible with plain Node, which is not how they ship.
 *
 * Synchronous, because `registerHooks` runs hooks on the main thread.
 */
const SRC = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', '/'))
  .href

export function resolve(specifier, context, next) {
  const target = specifier.startsWith('@/') ? SRC + specifier.slice(2) : specifier

  for (const candidate of [target, `${target}.js`, `${target}/index.js`]) {
    try {
      return next(candidate, context)
    } catch {
      /* try the next spelling */
    }
  }
  return next(target, context)
}
