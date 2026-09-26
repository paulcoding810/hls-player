import { useEffect, useMemo, useState } from 'react'

import ConfirmDialog from '@components/ConfirmDialog'
import MovieForm from '@components/MovieForm'
import SearchResults from '@components/SearchResults'
import {
  CheckIcon,
  EditIcon,
  FilmIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SettingsIcon,
  TrashIcon,
} from '@components/icons'
import {
  buttonClass,
  dangerBannerClass,
  ghostButtonClass,
  iconButtonClass,
  inputClass,
  selectClass,
  warnBannerClass,
} from '@components/ui'
import { SORT_ORDERS } from '@/helper/constants'
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '@/helper/settings'
import {
  addMovie,
  EMPTY_LIBRARY,
  findEpisode,
  findMovie,
  getLibrary,
  removeMovie,
  markWatched,
  movieToJson,
  resumeEpisodeId,
  setEpisodes,
  sortMovies,
  updateMovie,
} from '@/helper/library'
import { openOptions, playerUrlForEpisode } from '@/helper/player'
import { addMovie as addLibraryMovie } from '@/helper/library'
import { fetchEpisodes, getPlugins, loadMore, refreshMovie, searchAll } from '@/helper/plugins'
import { getAllProgress } from '@/helper/progress'
import { formatTime } from '@/utils/time'

/** Null unless the stored entry has a real duration to measure against. */
function percentOf(progress) {
  if (!progress || !Number.isFinite(progress.duration) || progress.duration <= 0) return null
  return Math.min(100, Math.round((progress.position / progress.duration) * 100))
}

function ProgressBar({ percent, className = '' }) {
  return (
    <span className={`bg-elevated block h-1 overflow-hidden rounded-full ${className}`}>
      <span className="bg-primary block h-full" style={{ width: `${Math.max(percent, 2)}%` }} />
    </span>
  )
}

function MovieCard({
  movie,
  positions = {},
  onPlay,
  onEdit,
  onDelete,
  onRefresh,
  onWatched,
  refreshing,
}) {
  const resumeId = resumeEpisodeId(movie)
  const resumeIndex = movie.episodes.findIndex((episode) => episode.id === resumeId)
  const resumeEpisode = movie.episodes[resumeIndex]
  const started = Boolean(movie.lastEpisodeId)
  const watched = Boolean(movie.watchedAt)
  const percent = resumeEpisode ? percentOf(positions[resumeEpisode.src]) : null

  return (
    <article className="border-line bg-panel flex flex-col overflow-hidden rounded-md border">
      <button
        type="button"
        onClick={() => onPlay(movie.id, resumeId)}
        disabled={!resumeId}
        title={`Play ${movie.title}`}
        className="group bg-elevated relative aspect-[2/3] w-full disabled:cursor-not-allowed"
      >
        {movie.poster ? (
          <img src={movie.poster} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-ink-faint absolute inset-0 grid place-items-center">
            <FilmIcon className="h-10 w-10" />
          </span>
        )}
        <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition group-hover:opacity-100">
          <PlayIcon className="text-ink h-10 w-10" />
        </span>
        {percent !== null && (
          <ProgressBar percent={percent} className="absolute inset-x-0 bottom-0 rounded-none" />
        )}
      </button>

      <div className="flex min-w-0 flex-col gap-1 p-3">
        <h3 className="truncate text-sm font-medium" title={movie.title}>
          {movie.title}
        </h3>
        <p className="text-ink-faint text-xs">
          {watched && <span className="text-primary">Watched · </span>}
          {movie.episodes.length} episode{movie.episodes.length === 1 ? '' : 's'}
          {!watched && resumeIndex > 0 && ` · at ${resumeEpisode.title}`}
        </p>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPlay(movie.id, resumeId)}
            disabled={!resumeId}
            className={ghostButtonClass}
          >
            <PlayIcon className="h-3.5 w-3.5" />
            {watched ? 'Play again' : started ? 'Resume' : 'Play'}
          </button>
          <button
            type="button"
            onClick={() => onWatched(movie)}
            className={`${iconButtonClass} ml-auto ${watched ? 'text-primary' : ''}`}
            aria-label={watched ? `Mark ${movie.title} unwatched` : `Mark ${movie.title} watched`}
            title={watched ? 'Mark as unwatched' : 'Mark as watched'}
          >
            <CheckIcon />
          </button>
          {movie.source && (
            <button
              type="button"
              onClick={() => onRefresh(movie)}
              disabled={refreshing}
              className={iconButtonClass}
              aria-label={`Refresh ${movie.title}`}
              title="Check the source for new episodes"
            >
              <RefreshIcon />
            </button>
          )}
          <button
            type="button"
            onClick={() => onEdit(movie.id)}
            className={iconButtonClass}
            aria-label={`Edit ${movie.title}`}
            title="Edit movie"
          >
            <EditIcon />
          </button>
          <button
            type="button"
            onClick={() => onDelete(movie.id)}
            className={iconButtonClass}
            aria-label={`Delete ${movie.title}`}
            title="Delete movie"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </article>
  )
}

/**
 * The page itself scrolls (`min-h-screen`, no inner scroll container), so the
 * grid grows with the library and no card is ever clipped.
 */
function ContinueWatching({ movie, episode, progress, onPlay }) {
  const percent = percentOf(progress)

  return (
    <section className="border-line bg-panel mb-6 flex items-center gap-4 rounded-md border p-4">
      <div className="bg-elevated h-24 w-16 shrink-0 overflow-hidden rounded-md">
        {movie.poster ? (
          <img src={movie.poster} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-ink-faint grid h-full place-items-center">
            <FilmIcon className="h-6 w-6" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-ink-faint text-[11px] font-medium tracking-wider uppercase">
          Continue watching
        </p>
        <h2 className="truncate text-sm font-medium" title={movie.title}>
          {movie.title}
        </h2>
        <p className="text-ink-muted truncate text-xs">
          {episode.title}
          {progress && ` · ${formatTime(progress.position)} of ${formatTime(progress.duration)}`}
        </p>
        {percent !== null && <ProgressBar percent={percent} className="mt-2 w-full max-w-sm" />}
      </div>

      <button
        type="button"
        onClick={() => onPlay(movie.id, episode.id)}
        className={`${buttonClass} shrink-0`}
      >
        <PlayIcon />
        Continue
      </button>
    </section>
  )
}

export default function Gallery() {
  const [library, setLibrary] = useState(EMPTY_LIBRARY)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  /** A movie id, or `new` while adding one. */
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  /** Stored positions keyed by episode URL. */
  const [positions, setPositions] = useState({})

  const [plugins, setPlugins] = useState([])
  const [query, setQuery] = useState('')
  /** Null until a search has run; then one group per enabled source. */
  const [groups, setGroups] = useState(null)
  const [searching, setSearching] = useState(false)
  /** `pluginId:itemId` of the result being added, and a page-level error. */
  const [adding, setAdding] = useState('')
  /** Plugin id whose next page is in flight. */
  const [loadingMore, setLoadingMore] = useState('')
  /** `pluginId:itemId` of the result being copied. */
  const [copying, setCopying] = useState('')
  /** `{ tone, message }`; errors are `danger`, confirmations `warn`. */
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    ;(async () => {
      const [storedLibrary, storedSettings, storedPlugins] = await Promise.all([
        getLibrary(),
        getSettings(),
        getPlugins(),
      ])
      setLibrary(storedLibrary)
      setSettings(storedSettings)
      setPlugins(storedPlugins)

      setPositions(await getAllProgress())
    })()
  }, [])

  const movies = useMemo(
    () => sortMovies(library.movies, settings.gallerySort, positions),
    [library.movies, settings.gallerySort, positions],
  )

  const lastMovie = findMovie(library, library.lastPlayed?.movieId)
  const lastEpisode =
    findEpisode(lastMovie, library.lastPlayed?.episodeId) ??
    findEpisode(lastMovie, resumeEpisodeId(lastMovie))

  /** The player reads what to play from its own URL. */
  const play = (movieId, episodeId) => {
    if (!episodeId) return
    window.location.href = playerUrlForEpisode(movieId, episodeId)
  }

  const editingMovie = library.movies.find((movie) => movie.id === editing) ?? null
  const deletingMovie = library.movies.find((movie) => movie.id === deleting) ?? null

  const refresh = async () => setLibrary(await getLibrary())

  /** Results already in the library, keyed so they offer Watch instead of Add. */
  const added = useMemo(
    () =>
      new Map(
        library.movies
          .filter((movie) => movie.source)
          .map((movie) => [`${movie.source.pluginId}:${movie.source.itemId}`, movie]),
      ),
    [library.movies],
  )

  const runSearch = async (event) => {
    event.preventDefault()
    const term = query.trim()
    if (!term) {
      setGroups(null)
      return
    }

    setNotice(null)
    setSearching(true)
    try {
      setGroups(await searchAll(plugins, term))
    } finally {
      setSearching(false)
    }
  }

  const showMore = async (group) => {
    setLoadingMore(group.plugin.id)
    setNotice(null)
    try {
      const next = await loadMore(group, query.trim())
      setGroups((current) =>
        current.map((item) => (item.plugin.id === group.plugin.id ? next : item)),
      )
    } catch (error) {
      setNotice({ tone: 'danger', message: error.message })
      // A page that failed should not leave More offering itself for ever.
      setGroups((current) =>
        current.map((item) =>
          item.plugin.id === group.plugin.id ? { ...item, done: true } : item,
        ),
      )
    } finally {
      setLoadingMore('')
    }
  }

  /** The same JSON the Add movie form's Paste JSON mode reads back. */
  const copyResult = async (plugin, result) => {
    const key = `${plugin.id}:${result.id}`
    setCopying(key)
    setNotice(null)
    try {
      const episodes = await fetchEpisodes(plugin, result)
      if (!episodes.length) throw new Error(`${plugin.name} returned no episodes for this title.`)

      await navigator.clipboard.writeText(
        movieToJson({
          title: result.title,
          poster: result.poster,
          referer: plugin.referer,
          adPattern: plugin.adPattern,
          episodes,
        }),
      )
      setNotice({
        tone: 'warn',
        message: `Copied “${result.title}” as JSON — ${episodes.length} episode(s).`,
      })
    } catch (error) {
      setNotice({ tone: 'danger', message: `Could not copy: ${error.message}` })
    } finally {
      setCopying('')
    }
  }

  const addResult = async (plugin, result) => {
    const key = `${plugin.id}:${result.id}`
    setAdding(key)
    setNotice(null)
    try {
      const episodes = await fetchEpisodes(plugin, result)
      if (!episodes.length) throw new Error(`${plugin.name} returned no episodes for this title.`)

      await addLibraryMovie({
        title: result.title,
        poster: result.poster,
        referer: plugin.referer,
        adPattern: plugin.adPattern,
        episodes,
        source: { pluginId: plugin.id, itemId: result.id },
      })
      await refresh()
    } catch (error) {
      setNotice({ tone: 'danger', message: error.message })
    } finally {
      setAdding('')
    }
  }

  const handleWatched = async (movie) => {
    setLibrary(await markWatched(movie.id, !movie.watchedAt))
    setPositions(await getAllProgress())
  }

  const handleRefresh = async (movie) => {
    setAdding(movie.id)
    setNotice(null)
    try {
      const { added: fresh } = await refreshMovie(movie, plugins)
      await refresh()
      setNotice({
        tone: 'warn',
        message: fresh
          ? `${movie.title}: ${fresh} new episode(s).`
          : `${movie.title} is already up to date.`,
      })
    } catch (error) {
      setNotice({ tone: 'danger', message: error.message })
    } finally {
      setAdding('')
    }
  }

  const handleSave = async ({ episodes, ...config }) => {
    if (editing === 'new') {
      await addMovie({ ...config, episodes })
    } else {
      await updateMovie(editing, config)
      await setEpisodes(editing, episodes)
    }
    if (config.referer !== settings.lastReferer) await saveSettings({ lastReferer: config.referer })
    await refresh()
  }

  const handleDelete = async () => {
    await removeMovie(deleting)
    setDeleting(null)
    await refresh()
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col p-6">
      <header className="mb-6 flex items-center gap-3">
        <img src="/img/logo-32.png" alt="" className="h-6 w-6" />
        <h1 className="text-base font-semibold">Library</h1>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className={`${ghostButtonClass} ml-auto`}
        >
          <PlusIcon />
          Add movie
        </button>
        {library.movies.length > 1 && (
          <select
            value={settings.gallerySort}
            onChange={(event) => {
              const gallerySort = event.target.value
              setSettings({ ...settings, gallerySort })
              saveSettings({ gallerySort })
            }}
            aria-label="Sort movies"
            title="Sort movies"
            className={selectClass}
          >
            {SORT_ORDERS.map((order) => (
              <option key={order.value} value={order.value}>
                {order.label}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => openOptions()}
          className={iconButtonClass}
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon />
        </button>
      </header>

      {plugins.some((plugin) => plugin.enabled) && (
        <form onSubmit={runSearch} className="mb-6 flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              // Emptying the box puts the library back.
              if (!event.target.value.trim()) setGroups(null)
            }}
            placeholder="Search your sources…"
            aria-label="Search sources"
            className={inputClass}
          />
          <button type="submit" disabled={!query.trim()} className={ghostButtonClass}>
            <SearchIcon className="h-3.5 w-3.5" />
            Search
          </button>
        </form>
      )}

      {notice && (
        <p
          className={`${notice.tone === 'danger' ? dangerBannerClass : warnBannerClass} border-line mb-6 rounded-md border`}
        >
          {notice.message}
        </p>
      )}

      {groups !== null ? (
        <SearchResults
          groups={groups}
          busy={searching}
          added={added}
          adding={adding}
          onAdd={addResult}
          onWatch={(movie) => play(movie.id, resumeEpisodeId(movie))}
          onMore={showMore}
          onCopy={copyResult}
          copying={copying}
          loadingMore={loadingMore}
        />
      ) : (
        <>
          {lastMovie && lastEpisode && (
            <ContinueWatching
              movie={lastMovie}
              episode={lastEpisode}
              progress={positions[lastEpisode.src]}
              onPlay={play}
            />
          )}

          {library.movies.length === 0 ? (
            <div className="text-ink-faint flex flex-1 flex-col items-center justify-center gap-3">
              <FilmIcon className="h-10 w-10" />
              <p className="text-sm">No movies yet.</p>
              <button type="button" onClick={() => setEditing('new')} className={buttonClass}>
                <PlusIcon />
                Add your first movie
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 content-start gap-4 sm:grid-cols-3 md:grid-cols-4">
              {movies.map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  positions={positions}
                  onPlay={play}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                  onRefresh={handleRefresh}
                  onWatched={handleWatched}
                  refreshing={adding === movie.id}
                />
              ))}
            </div>
          )}
        </>
      )}

      {editing && (
        <MovieForm
          movie={editingMovie}
          defaults={settings}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {deletingMovie && (
        <ConfirmDialog
          title={`Delete ${deletingMovie.title}?`}
          body={`Its ${deletingMovie.episodes.length} episode(s) and config are removed. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </main>
  )
}
