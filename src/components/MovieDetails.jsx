import { useEffect, useRef } from 'react'

import { CloseIcon, CopyIcon, FilmIcon, PlayIcon, PlusIcon } from './icons'
import { buttonClass, dialogClass, ghostButtonClass, iconButtonClass } from './ui'

/**
 * A search result opened up: the addon's `/meta/` read for this title, with
 * Add or Watch. Opens on what the result already carries, so the title and
 * poster are there while the rest loads. Escape closes, like the close button.
 */
export default function MovieDetails({
  result,
  details,
  episodes,
  error,
  movie,
  adding,
  copying,
  onAdd,
  onWatch,
  onWatchNew,
  onCopy,
  onClose,
  children,
}) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const close = () => {
    ref.current?.close()
    onClose()
  }

  const title = details?.title || result.title
  const poster = details?.poster || result.poster
  const facts = [
    details?.released,
    details?.runtime,
    details?.rating ? `IMDb ${details.rating}` : '',
    details?.seasons > 1 ? `${details.seasons} seasons` : '',
    episodes?.length > 1 ? `${episodes.length} episodes` : '',
  ].filter(Boolean)

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      aria-labelledby="details-title"
      className={`${dialogClass} max-h-[85vh] w-[min(40rem,92vw)] overflow-y-auto`}
    >
      <div className="flex items-start gap-4">
        <div className="bg-elevated h-36 w-24 shrink-0 overflow-hidden rounded-md">
          {poster ? (
            <img src={poster} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-ink-faint grid h-full place-items-center">
              <FilmIcon />
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start gap-2">
            <h2 id="details-title" className="min-w-0 flex-1 text-base font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={close}
              className={iconButtonClass}
              aria-label="Close"
              title="Close (Esc)"
            >
              <CloseIcon />
            </button>
          </div>

          {facts.length > 0 && <p className="text-ink-muted text-xs">{facts.join(' · ')}</p>}
          {details?.genres.length > 0 && (
            <p className="text-ink-faint text-xs">{details.genres.join(', ')}</p>
          )}
        </div>
      </div>

      {!details && !error && <p className="text-ink-faint mt-4 text-sm">Loading details…</p>}
      {error && <p className="text-danger mt-4 text-sm">{error}</p>}

      {details?.description && (
        <p className="text-ink mt-4 text-sm leading-relaxed">{details.description}</p>
      )}

      {(details?.director.length > 0 || details?.cast.length > 0) && (
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {details.director.length > 0 && (
            <>
              <dt className="text-ink-faint">Director</dt>
              <dd className="text-ink-muted">{details.director.join(', ')}</dd>
            </>
          )}
          {details.cast.length > 0 && (
            <>
              <dt className="text-ink-faint">Cast</dt>
              <dd className="text-ink-muted">{details.cast.join(', ')}</dd>
            </>
          )}
        </dl>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCopy}
          disabled={copying}
          className={iconButtonClass}
          aria-label={`Copy ${title} as JSON`}
          title="Copy as JSON"
        >
          <CopyIcon />
        </button>
        {movie ? (
          <button type="button" onClick={() => onWatch(movie)} className={buttonClass} autoFocus>
            <PlayIcon className="h-3.5 w-3.5" />
            Watch
          </button>
        ) : (
          <>
            <button type="button" onClick={onAdd} disabled={adding} className={ghostButtonClass}>
              <PlusIcon className="h-3.5 w-3.5" />
              {adding ? 'Adding…' : 'Add to library'}
            </button>
            <button
              type="button"
              onClick={onWatchNew}
              disabled={adding}
              className={buttonClass}
              autoFocus
            >
              <PlayIcon className="h-3.5 w-3.5" />
              Watch
            </button>
          </>
        )}
      </div>

      {/* A modal sits in the top layer, so the page's toast would be under the scrim. */}
      {children}
    </dialog>
  )
}
