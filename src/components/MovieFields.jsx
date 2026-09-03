import { useState } from 'react'

import MovieConfig from './MovieConfig'
import { buttonClass, ghostButtonClass, helpClass, inputClass, labelClass } from './ui'
import { EMPTY_MOVIE } from '@/helper/library'
import { normalizeReferer, parseEpisodeLines } from '@/utils/url'

/**
 * The movie form itself, with no chrome of its own — `MovieForm` wraps it in a
 * dialog for the library page, the player renders it straight into its panel.
 */
export default function MovieFields({
  movie,
  defaults,
  onSave,
  onCancel,
  autoFocus = false,
  idPrefix = 'movie',
}) {
  // A new movie starts from the Referer last used, which is usually the same site.
  const [draft, setDraft] = useState({
    ...EMPTY_MOVIE,
    referer: defaults.lastReferer ?? '',
    ...(movie ?? {}),
  })
  // Editing starts from the saved episodes, so they can be renamed, fixed or
  // reordered as text; `parseEpisodeLines` splits on the last `|` to read it back.
  const [episodesText, setEpisodesText] = useState(
    (movie?.episodes ?? []).map((episode) => `${episode.title} | ${episode.src}`).join('\n'),
  )
  const [error, setError] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    const title = draft.title.trim()
    const { episodes, skipped } = parseEpisodeLines(episodesText)

    if (!title) {
      setError('Give the movie a title.')
      return
    }
    if (!episodes.length) {
      setError('Add at least one episode URL. Delete the movie to remove it entirely.')
      return
    }
    if (skipped) {
      setError(`${skipped} line(s) are not valid http(s) URLs.`)
      return
    }

    onSave({
      title,
      poster: draft.poster.trim(),
      referer: normalizeReferer(draft.referer),
      skipLeading: draft.skipLeading,
      skipTrailing: draft.skipTrailing,
      autoSkip: draft.autoSkip ?? null,
      episodes,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-title`}>
          Title
        </label>
        <input
          id={`${idPrefix}-title`}
          className={inputClass}
          value={draft.title}
          autoFocus={autoFocus}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-poster`}>
          Poster URL
        </label>
        <input
          id={`${idPrefix}-poster`}
          className={inputClass}
          spellCheck="false"
          placeholder="https://example.com/poster.jpg"
          value={draft.poster}
          onChange={(event) => setDraft({ ...draft, poster: event.target.value })}
        />
      </div>

      <MovieConfig
        movie={draft}
        defaults={defaults}
        onChange={(patch) => setDraft({ ...draft, ...patch })}
        idPrefix={idPrefix}
      />

      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-episodes`}>
          Episodes
        </label>
        <textarea
          id={`${idPrefix}-episodes`}
          rows={movie ? 8 : 4}
          spellCheck="false"
          className={`${inputClass} resize-y font-mono text-xs`}
          placeholder={'https://example.com/ep1.m3u8\nEpisode 2 | https://example.com/ep2.m3u8'}
          value={episodesText}
          onChange={(event) => setEpisodesText(event.target.value)}
        />
        <p className={helpClass}>
          One per line, optionally <code>Title | URL</code>. Untitled episodes are numbered;
          removing a line removes the episode.
        </p>
      </div>

      {error && <p className="text-danger text-xs">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className={ghostButtonClass}>
          Cancel
        </button>
        <button type="submit" className={buttonClass}>
          {movie ? 'Save' : 'Add movie'}
        </button>
      </div>
    </form>
  )
}
