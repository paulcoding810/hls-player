import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Guards on the built output, for things no unit test can see. Run after a
 * build; skipped otherwise, so `pnpm test` still works on a clean checkout.
 * CI builds first, which is where these actually bite.
 */
const ROOT = path.join(import.meta.dirname, '..')
const built = (browser) => path.join(ROOT, 'build', browser)
const has = (browser) => existsSync(path.join(built(browser), 'manifest.json'))

const manifest = (browser) =>
  JSON.parse(readFileSync(path.join(built(browser), 'manifest.json'), 'utf8'))

const scripts = (browser) => {
  const assets = path.join(built(browser), 'assets')
  return readdirSync(assets)
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(path.join(assets, name), 'utf8'))
}

describe(
  'the built extension',
  { skip: has('chrome') ? false : 'no build — run pnpm build first' },
  () => {
    it('asks for declarativeNetRequest on Chrome', () => {
      const { permissions } = manifest('chrome')
      assert.ok(permissions.includes('declarativeNetRequest'))
      assert.ok(!permissions.includes('webRequest'))
    })

    it('never builds a worker from a blob', () => {
      // MV3 pins extension pages to `script-src 'self'`, which Firefox enforces
      // for workers. Reverting to the stock video.js entry breaks playback there
      // and nowhere else, so this is the only thing that would catch it.
      for (const source of scripts('chrome')) {
        assert.ok(!source.includes('new Worker('), 'a blob worker is back in the bundle')
      }
    })

    it('carries the version from package.json', () => {
      const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
      assert.equal(manifest('chrome').version, version)
    })
  },
)

describe(
  'the Firefox build',
  { skip: has('firefox') ? false : 'no build — run pnpm build:firefox first' },
  () => {
    it('swaps declarativeNetRequest for blocking webRequest', () => {
      // `src/convert.js` does this; nothing else verifies it happened.
      const { permissions } = manifest('firefox')
      assert.ok(permissions.includes('webRequest'))
      assert.ok(permissions.includes('webRequestBlocking'))
      assert.ok(!permissions.includes('declarativeNetRequest'))
    })

    it('declares an add-on id, without which it will not install', () => {
      assert.match(manifest('firefox').browser_specific_settings?.gecko?.id ?? '', /@/)
    })

    it('uses background scripts rather than a service worker', () => {
      const { background } = manifest('firefox')
      assert.ok(Array.isArray(background.scripts))
      assert.ok(!background.service_worker)
    })

    it('never builds a worker from a blob', () => {
      for (const source of scripts('firefox')) {
        assert.ok(!source.includes('new Worker('), 'a blob worker is back in the bundle')
      }
    })
  },
)
