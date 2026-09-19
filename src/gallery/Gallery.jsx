import { useEffect, useMemo, useState } from 'react'

import ConfirmDialog from '@components/ConfirmDialog'
import MovieForm from '@components/MovieForm'
import { EditIcon, FilmIcon, PlayIcon, PlusIcon, TrashIcon } from '@components/icons'
import { buttonClass, ghostButtonClass, iconButtonClass } from '@components/ui'
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '@/helper/settings'
import {
  addMovie,
  EMPTY_LIBRARY,
  findEpisode,
  findMovie,
  getLibrary,
  removeMovie,
  resumeEpisodeId,
  setEpisodes,
  sortedByAdded,
  updateMovie,
} from '@/helper/library'
import { playerUrlForEpisode } from '@/helper/player'
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

function MovieCard({ movie, positions = {}, onPlay, onEdit, onDelete }) {
  const resumeId = resumeEpisodeId(movie)
  const resumeIndex = movie.episodes.findIndex((episode) => episode.id === resumeId)
  const resumeEpisode = movie.episodes[resumeIndex]
  const started = Boolean(movie.lastEpisodeId)
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
          {movie.episodes.length} episode{movie.episodes.length === 1 ? '' : 's'}
          {resumeIndex > 0 && ` · at ${resumeEpisode.title}`}
        </p>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPlay(movie.id, resumeId)}
            disabled={!resumeId}
            className={ghostButtonClass}
          >
            <PlayIcon className="h-3.5 w-3.5" />
            {started ? 'Resume' : 'Play'}
          </button>
          <button
            type="button"
            onClick={() => onEdit(movie.id)}
            className={`${iconButtonClass} ml-auto`}
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

  useEffect(() => {
    ;(async () => {
      const [storedLibrary, storedSettings] = await Promise.all([getLibrary(), getSettings()])
      setLibrary(storedLibrary)
      setSettings(storedSettings)

      setPositions(await getAllProgress())
    })()
  }, [])

  const movies = useMemo(() => sortedByAdded(library.movies), [library.movies])

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
      </header>

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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] content-start gap-4">
          {movies.map((movie) => (
            <MovieCard
              key={movie.id}
              movie={movie}
              positions={positions}
              onPlay={play}
              onEdit={setEditing}
              onDelete={setDeleting}
            />
          ))}
        </div>
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
