import { useState } from 'react'

import ModeSwitch from './ModeSwitch'
import MovieConfig from './MovieConfig'
import { buttonClass, ghostButtonClass, helpClass, inputClass, labelClass } from './ui'
import { EMPTY_MOVIE, movieToJson, parseMovieJson } from '@/helper/library'
import { compilePattern } from '@/utils/playlist'
import { normalizeReferer, parseEpisodeLines } from '@/utils/url'

const JSON_EXAMPLE = `{
  "title": "Example",
  "referer": "https://example.com/",
  "skipLeading": 40,
  "episodes": [
    "https://example.com/ep1.m3u8",
    { "title": "Episode 2", "src": "https://example.com/ep2.mpd" }
  ]
}`

/** Episodes as the textarea holds them: `Title | URL` plus any subtitle URLs. */
function episodesToText(episodes) {
  return (episodes ?? [])
    .map((episode) =>
      [`${episode.title} | ${episode.src}`, ...(episode.subtitles ?? []).map((s) => s.src)].join(
        ' ',
      ),
    )
    .join('\n')
}

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
  removed,
}) {
  // A new movie starts from the Referer last used, which is usually the same site.
  const [draft, setDraft] = useState({
    ...EMPTY_MOVIE,
    referer: defaults.lastReferer ?? '',
    ...(movie ?? {}),
  })
  // Editing starts from the saved episodes, so they can be renamed, fixed or
  // reordered as text; `parseEpisodeLines` splits on the last `|` to read it back,
  // then on whitespace, so any subtitle files follow the video URL on the line.
  const [episodesText, setEpisodesText] = useState(episodesToText(movie?.episodes))
  const [error, setError] = useState('')
  // Pasting is an alternative to filling the form, so it is offered only when
  // adding — editing already has the saved values laid out in the fields.
  const [json, setJson] = useState(null)

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
    if (draft.adPattern.trim() && !compilePattern(draft.adPattern.trim())) {
      setError('The ad segment pattern is not a valid regular expression.')
      return
    }

    onSave({
      title,
      poster: draft.poster.trim(),
      referer: normalizeReferer(draft.referer),
      adPattern: draft.adPattern.trim(),
      skipLeading: draft.skipLeading,
      skipTrailing: draft.skipTrailing,
      autoSkip: draft.autoSkip ?? null,
      episodes,
    })
  }

  const handleJsonSubmit = (event) => {
    event.preventDefault()
    try {
      onSave(parseMovieJson(json))
    } catch (jsonError) {
      setError(jsonError.message)
    }
  }

  /**
   * The two views edit the same movie, so each hands its state to the other:
   * opening JSON serialises what is on screen, and returning to the form reads
   * it back. Discarding either way would silently lose whatever was typed.
   */
  const toggleJson = () => {
    setError('')

    if (json === null) {
      const { episodes } = parseEpisodeLines(episodesText)
      // A new movie starts from the placeholder rather than an empty skeleton.
      setJson(movie ? movieToJson({ ...draft, episodes }) : '')
      return
    }

    if (!json.trim()) {
      setJson(null)
      return
    }

    try {
      const { episodes, ...config } = parseMovieJson(json)
      setDraft({ ...draft, ...config })
      setEpisodesText(episodesToText(episodes))
      setJson(null)
    } catch (jsonError) {
      // Stay put: switching back would throw the edited text away.
      setError(jsonError.message)
    }
  }

  const mode = json === null ? 'form' : 'json'
  /** Both directions are the same hand-off, so re-picking the current mode is a no-op. */
  const chooseMode = (next) => {
    if (next !== mode) toggleJson()
  }

  const modeSwitch = (
    <ModeSwitch
      value={mode}
      onChange={chooseMode}
      label="Editing mode"
      options={[
        { value: 'form', label: 'Form' },
        { value: 'json', label: 'JSON' },
      ]}
    />
  )

  const actions = (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={onCancel} className={ghostButtonClass}>
        Cancel
      </button>
      <button type="submit" className={buttonClass}>
        {movie ? 'Save' : 'Add movie'}
      </button>
    </div>
  )

  if (json !== null) {
    return (
      <form onSubmit={handleJsonSubmit} className="flex flex-col gap-4">
        {modeSwitch}

        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-json`}>
            Movie JSON
          </label>
          <textarea
            id={`${idPrefix}-json`}
            rows={12}
            spellCheck="false"
            autoFocus
            className={`${inputClass} resize-y font-mono text-xs`}
            placeholder={JSON_EXAMPLE}
            value={json}
            onChange={(event) => setJson(event.target.value)}
          />
          <p className={helpClass}>
            Only <code>title</code> and <code>episodes</code> are required; an episode may be a bare
            URL string. A movie copied out of an export file pastes in as it is.
          </p>
        </div>

        {error && <p className="text-danger text-xs">{error}</p>}

        {actions}
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {modeSwitch}

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
        removed={removed}
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
          placeholder={
            'https://example.com/ep1.m3u8\n' +
            'Episode 2 | https://example.com/ep2.mpd https://example.com/ep2.en.vtt'
          }
          value={episodesText}
          onChange={(event) => setEpisodesText(event.target.value)}
        />
        <p className={helpClass}>
          HLS (<code>.m3u8</code>) or DASH (<code>.mpd</code>), one per line, optionally{' '}
          <code>Title | URL</code>. Untitled episodes are numbered; removing a line removes the
          episode. Subtitle files (<code>.vtt</code> or <code>.srt</code>) follow the video URL on
          the same line, separated by spaces — use <strong>Paste JSON instead</strong> to name or
          label them.
        </p>
      </div>

      {error && <p className="text-danger text-xs">{error}</p>}

      {actions}
    </form>
  )
}
