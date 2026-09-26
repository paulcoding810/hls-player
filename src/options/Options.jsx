import { useEffect, useRef, useState } from 'react'

import ConfirmDialog from '@components/ConfirmDialog'
import PluginForm from '@components/PluginForm'
import SettingsPanel from '@components/SettingsPanel'
import {
  AlertIcon,
  CopyIcon,
  DownloadIcon,
  EditIcon,
  LibraryIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from '@components/icons'
import {
  buttonClass,
  checkboxClass,
  dangerBannerClass,
  ghostButtonClass,
  iconButtonClass,
  warnBannerClass,
} from '@components/ui'
import { applyBackup, backupFileName, buildBackup, readBackup } from '@/helper/backup'
import { clearLibrary, getLibrary } from '@/helper/library'
import { addPlugin, getPlugins, pluginToJson, removePlugin, updatePlugin } from '@/helper/plugins'
import { openGallery } from '@/helper/player'
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '@/helper/settings'
import api from '@/utils/api'
import { hasHostPermission, requestHostPermission } from '@/utils/browser'

import '../index.css'

/** From the manifest, so it is the version actually running, not a build-time copy. */
const VERSION = api.runtime?.getManifest?.()?.version ?? ''

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
  const [plugins, setPlugins] = useState([])
  /** A plugin id, or `new` while adding one. */
  const [editing, setEditing] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    ;(async () => {
      const [storedSettings, library, permission, storedPlugins] = await Promise.all([
        getSettings(),
        getLibrary(),
        hasHostPermission(),
        getPlugins(),
      ])
      setSettings(storedSettings)
      setStats({ movies: library.movies.length, episodes: countEpisodes(library) })
      setGranted(permission)
      setPlugins(storedPlugins)
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
    setPlugins(await getPlugins())
    setNotice({
      tone: 'warn',
      message:
        `Imported ${result.added} new movie(s), updated ${result.updated}, ` +
        `merged ${result.positions} watch position(s) and ${result.plugins} source(s).`,
    })
  }

  const savePlugin = async (values) => {
    if (editing === 'new') await addPlugin(values)
    else await updatePlugin(editing, values)
    setPlugins(await getPlugins())
    setEditing(null)
  }

  const togglePlugin = async (plugin) => {
    await updatePlugin(plugin.id, { enabled: !plugin.enabled })
    setPlugins(await getPlugins())
  }

  const copyPlugin = async (plugin) => {
    setNotice(null)
    try {
      await navigator.clipboard.writeText(pluginToJson(plugin))
      setNotice({ tone: 'warn', message: `Copied “${plugin.name}” as JSON.` })
    } catch (error) {
      setNotice({ tone: 'danger', message: `Could not copy: ${error.message}` })
    }
  }

  const deletePlugin = async (plugin) => {
    await removePlugin(plugin.id)
    setPlugins(await getPlugins())
  }

  const editingPlugin = plugins.find((plugin) => plugin.id === editing) ?? null

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-6 flex items-center gap-2">
        <img src="/img/logo-32.png" alt="" className="h-6 w-6" />
        <h1 className="text-base font-semibold">HLS Player</h1>
        {VERSION && <span className="text-ink-faint text-xs">v{VERSION}</span>}
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
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Sources</h2>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className={`${ghostButtonClass} ml-auto`}
          >
            <PlusIcon />
            Add source
          </button>
        </div>
        <p className="text-ink-faint mt-1 text-xs">
          A source describes one site&apos;s JSON API — a search URL, a details URL, and where the
          values sit in each response. The library&apos;s search bar queries every enabled one.
        </p>

        {plugins.length === 0 ? (
          <p className="text-ink-muted mt-3 text-sm">No sources yet.</p>
        ) : (
          <ul className="border-line mt-3 divide-y divide-[var(--color-line)] rounded-md border">
            {plugins.map((plugin) => (
              <li key={plugin.id} className="flex items-center gap-3 px-3 py-2">
                <input
                  type="checkbox"
                  className={checkboxClass}
                  checked={plugin.enabled}
                  onChange={() => togglePlugin(plugin)}
                  aria-label={`Search ${plugin.name}`}
                  title={`Search ${plugin.name}`}
                />
                <span className="min-w-0 flex-1 truncate text-sm" title={plugin.search.url}>
                  {plugin.name}
                </span>
                <button
                  type="button"
                  onClick={() => copyPlugin(plugin)}
                  className={iconButtonClass}
                  aria-label={`Copy ${plugin.name} as JSON`}
                  title="Copy as JSON"
                >
                  <CopyIcon />
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(plugin.id)}
                  className={iconButtonClass}
                  aria-label={`Edit ${plugin.name}`}
                  title="Edit"
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  onClick={() => deletePlugin(plugin)}
                  className={iconButtonClass}
                  aria-label={`Delete ${plugin.name}`}
                  title="Delete"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-line mt-8 border-t pt-4">
        <h2 className="text-sm font-semibold">Data</h2>
        <p className="text-ink-faint mt-1 text-xs">
          The export holds the library, the sources, the settings and every watch position.
          Importing merges it in: a movie or source already here is updated, the rest are added.
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

      {editing && (
        <PluginForm plugin={editingPlugin} onSave={savePlugin} onClose={() => setEditing(null)} />
      )}

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
