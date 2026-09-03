import { crx } from '@crxjs/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { patchManifest } from './src/convert.js'
import manifest from './src/manifest.js'
import svgr from 'vite-plugin-svgr'

const browser = process.env.BROWSER ?? 'chrome'
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const convertedManifest = browser === 'firefox' ? patchManifest(manifest) : manifest

  return {
    build: {
      emptyOutDir: true,
      outDir: `build/${browser}`,
      rollupOptions: {
        // Neither page is reachable from the manifest — the extension opens them
        // itself — so both are declared as entry points.
        input: { player: 'player.html', gallery: 'gallery.html' },
        output: {
          chunkFileNames: 'assets/chunk-[hash].js',
        },
      },
    },

    resolve: {
      alias: [
        { find: '@', replacement: '/src' },
        { find: '@assets', replacement: '/src/assets' },
        { find: '@components', replacement: '/src/components' },
      ],
    },

    plugins: [crx({ manifest: convertedManifest, browser }), react(), svgr()],
    legacy: {
      skipWebSocketTokenCheck: true,
    },
  }
})
