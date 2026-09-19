import { useEffect, useRef, useState } from 'react'

import ConfirmDialog from '@components/ConfirmDialog'
import SettingsPanel from '@components/SettingsPanel'
import { AlertIcon, DownloadIcon, LibraryIcon, TrashIcon, UploadIcon } from '@components/icons'
import { buttonClass, dangerBannerClass, ghostButtonClass, warnBannerClass } from '@components/ui'
import { applyBackup, backupFileName, buildBackup, readBackup } from '@/helper/backup'
import { clearLibrary, getLibrary } from '@/helper/library'
import { openGallery } from '@/helper/player'
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '@/helper/settings'
import { hasHostPermission, requestHostPermission } from '@/utils/browser'

import '../index.css'

function countEpisodes(library) {
  return library.movies.reduce((total, movie) => total + movie.episodes.length, 0)
}

export const Options = () => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [stats, setStats] = useState({ movies: 0, episodes: 0 })
  const [granted, setGranted] = useState(true)
  const [clearing, setClearing] = useState(false)
  /** The parsed file, held until the import is confirmed. */
  const [pending, setPending] = useState(null)
  const [notice, setNotice] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    ;(async () => {
      const [storedSettings, library, permission] = await Promise.all([
        getSettings(),
        getLibrary(),
        hasHostPermission(),
      ])
      setSettings(storedSettings)
      setStats({ movies: library.movies.length, episodes: countEpisodes(library) })
      setGranted(permission)
    })()
  }, [])

  const update = (patch) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next)
  }

  const handleExport = async () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(await buildBackup(), null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = backupFileName()
    // Firefox only follows the click for an anchor that is in the document.
    document.body.append(link)
    link.click()
    link.remove()
    // Revoking while the download is still starting cancels it.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    // The same file picked twice fires no change event unless the input is reset.
    event.target.value = ''
    if (!file) return

    setNotice(null)
    try {
      setPending(readBackup(await file.text()))
    } catch (error) {
      setNotice({ tone: 'danger', message: error.message })
    }
  }

  const handleImport = async () => {
    const result = await applyBackup(pending)
    const library = await getLibrary()
    setPending(null)
    setSettings(await getSettings())
    setStats({ movies: library.movies.length, episodes: countEpisodes(library) })
    setNotice({
      tone: 'warn',
      message: `Imported ${result.added} new movie(s), updated ${result.updated}, and merged ${result.positions} watch position(s).`,
    })
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-6 flex items-center gap-2">
        <img src="/img/logo-32.png" alt="" className="h-6 w-6" />
        <h1 className="text-base font-semibold">HLS Player</h1>
        <button type="button" onClick={() => openGallery()} className={`${buttonClass} ml-auto`}>
          <LibraryIcon />
          Open library
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

      <section className="border-line mt-8 border-t pt-4">
        <h2 className="text-sm font-semibold">Data</h2>
        <p className="text-ink-faint mt-1 text-xs">
          The export holds the library, the settings and every watch position. Importing merges it
          in: a movie already here is updated, the rest are added.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleExport} className={ghostButtonClass}>
            <DownloadIcon className="h-3.5 w-3.5" />
            Export data
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={ghostButtonClass}
          >
            <UploadIcon className="h-3.5 w-3.5" />
            Import data
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={handleFile}
          />

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
        </div>

        {notice && (
          <p
            className={`${notice.tone === 'danger' ? dangerBannerClass : warnBannerClass} border-line mt-3 rounded-md border`}
          >
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {notice.message}
          </p>
        )}

        <p className="text-ink-muted mt-3 text-sm">
          {stats.movies === 0
            ? 'The library is empty.'
            : `${stats.movies} movie(s), ${stats.episodes} episode(s).`}
        </p>
      </section>

      {pending && (
        <ConfirmDialog
          title="Import this file?"
          body={`${pending.movies.length} movie(s) and ${Object.keys(pending.progress).length} watch position(s) are merged into the library${pending.settings ? ', and the saved settings are replaced' : ''}.`}
          confirmLabel="Import"
          onConfirm={handleImport}
          onCancel={() => setPending(null)}
        />
      )}

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
