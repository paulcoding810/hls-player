import { useEffect, useState } from 'react'

import ConfirmDialog from '@components/ConfirmDialog'
import SettingsPanel from '@components/SettingsPanel'
import { AlertIcon, PlayIcon, TrashIcon } from '@components/icons'
import { buttonClass, ghostButtonClass, warnBannerClass } from '@components/ui'
import { clearLibrary, getLibrary } from '@/helper/library'
import { openPlayer } from '@/helper/player'
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '@/helper/settings'
import { hasHostPermission, requestHostPermission } from '@/utils/browser'

import '../index.css'

export const Options = () => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [stats, setStats] = useState({ movies: 0, episodes: 0 })
  const [granted, setGranted] = useState(true)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [storedSettings, library, permission] = await Promise.all([
        getSettings(),
        getLibrary(),
        hasHostPermission(),
      ])
      setSettings(storedSettings)
      setStats({
        movies: library.movies.length,
        episodes: library.movies.reduce((total, movie) => total + movie.episodes.length, 0),
      })
      setGranted(permission)
    })()
  }, [])

  const update = (patch) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next)
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-6 flex items-center gap-2">
        <img src="/img/logo-32.png" alt="" className="h-6 w-6" />
        <h1 className="text-base font-semibold">HLS Player</h1>
        <button type="button" onClick={() => openPlayer()} className={`${buttonClass} ml-auto`}>
          <PlayIcon />
          Open player
        </button>
      </header>

      {!granted && (
        <button
          type="button"
          onClick={async () => setGranted(await requestHostPermission())}
          className={`${warnBannerClass} border-line mb-6 rounded-md border`}
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          Grant access to all websites — required to fetch streams and set the Referer header.
        </button>
      )}

      <SettingsPanel settings={settings} onChange={update} />

      <section className="border-line mt-8 flex items-center gap-3 border-t pt-4">
        <p className="text-ink-muted text-sm">
          {stats.movies === 0
            ? 'The library is empty.'
            : `${stats.movies} movie(s), ${stats.episodes} episode(s).`}
        </p>
        {stats.movies > 0 && (
          <button
            type="button"
            onClick={() => setClearing(true)}
            className={`${ghostButtonClass} ml-auto`}
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Clear library
          </button>
        )}
      </section>

      {clearing && (
        <ConfirmDialog
          title="Clear the library?"
          body={`All ${stats.movies} movie(s) and their config are removed. This cannot be undone.`}
          confirmLabel="Clear"
          onConfirm={async () => {
            await clearLibrary()
            setStats({ movies: 0, episodes: 0 })
            setClearing(false)
          }}
          onCancel={() => setClearing(false)}
        />
      )}
    </main>
  )
}

export default Options
