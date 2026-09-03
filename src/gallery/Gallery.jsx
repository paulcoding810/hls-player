import { useEffect, useState } from 'react'

import ConfirmDialog from '@components/ConfirmDialog'
import MovieForm from '@components/MovieForm'
import { EditIcon, FilmIcon, PlayIcon, PlusIcon, TrashIcon } from '@components/icons'
import { buttonClass, ghostButtonClass, iconButtonClass } from '@components/ui'
import { PLAYER_PATH } from '@/helper/constants'
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '@/helper/settings'
import {
  addMovie,
  EMPTY_LIBRARY,
  getLibrary,
  removeMovie,
  resumeEpisodeId,
  setEpisodes,
  setLastPlayed,
  updateMovie,
} from '@/helper/library'

function MovieCard({ movie, onPlay, onEdit, onDelete }) {
  const resumeId = resumeEpisodeId(movie)
  const resumeIndex = movie.episodes.findIndex((episode) => episode.id === resumeId)
  const started = Boolean(movie.lastEpisodeId)

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
      </button>

      <div className="flex min-w-0 flex-col gap-1 p-3">
        <h3 className="truncate text-sm font-medium" title={movie.title}>
          {movie.title}
        </h3>
        <p className="text-ink-faint text-xs">
          {movie.episodes.length} episode{movie.episodes.length === 1 ? '' : 's'}
          {resumeIndex > 0 && ` · at ${movie.episodes[resumeIndex].title}`}
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
export default function Gallery() {
  const [library, setLibrary] = useState(EMPTY_LIBRARY)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  /** A movie id, or `new` while adding one. */
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    ;(async () => {
      const [storedLibrary, storedSettings] = await Promise.all([getLibrary(), getSettings()])
      setLibrary(storedLibrary)
      setSettings(storedSettings)
    })()
  }, [])

  /** Handing off to the player page, which starts from `lastPlayed`. */
  const play = async (movieId, episodeId) => {
    if (!episodeId) return
    await setLastPlayed(movieId, episodeId)
    window.location.href = PLAYER_PATH
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
          className={`${buttonClass} ml-auto`}
        >
          <PlusIcon />
          Add movie
        </button>
      </header>

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
          {library.movies.map((movie) => (
            <MovieCard
              key={movie.id}
              movie={movie}
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
