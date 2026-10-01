import { CopyIcon, FilmIcon, PlayIcon, PlusIcon } from './icons'
import { dangerBannerClass, ghostButtonClass, iconButtonClass } from './ui'

/** `Cinemeta · Top`, and the id when two catalogs of one addon share a name. */
function headingOf(group) {
  if (!group.catalog) return group.plugin.name
  return `${group.plugin.name} · ${group.catalog.name}`
}

/**
 * Search results grouped by the catalog they came from — an addon publishes one
 * per type, and "Series" and "Movies" are different answers to the same
 * question. A catalog that failed keeps its group and shows why, so a broken
 * one is visible rather than silently missing.
 */
export default function SearchResults({
  groups,
  busy,
  added,
  adding,
  onAdd,
  onWatch,
  onWatchNew,
  onCopy,
  copying,
  onOpen,
}) {
  // A catalog with nothing in it is noise once there are several per source;
  // when they are all empty the page says so once instead.
  const shown = groups.filter((group) => group.results.length || group.error)

  if (busy) return <p className="text-ink-faint text-sm">Searching…</p>

  return (
    <div className="flex flex-col gap-6">
      {shown.length === 0 && <p className="text-ink-faint text-sm">Nothing found.</p>}

      {shown.map((group) => (
        <section
          key={`${group.plugin.id}:${group.catalog?.type}:${group.catalog?.id}`}
          className="flex flex-col gap-2"
        >
          <h2 className="text-ink-faint text-[11px] font-medium tracking-wider uppercase">
            {headingOf(group)}
            {group.catalog && <span className="text-ink-faint/70"> · {group.catalog.type}</span>}
          </h2>

          {group.error && (
            <p className={`${dangerBannerClass} border-line rounded-md border`}>{group.error}</p>
          )}

          {group.results.map((result) => {
            const key = `${group.plugin.id}:${result.id}`
            // Already in the library: the useful action is to watch it, not to
            // be told it is there.
            const movie = added.get(key)
            return (
              <article
                key={key}
                className="border-line bg-panel flex items-center gap-3 rounded-md border p-2"
              >
                <button
                  type="button"
                  onClick={() => onOpen(group.plugin, result)}
                  className="hover:text-primary flex min-w-0 flex-1 items-center gap-3 rounded-md text-left transition"
                  title={`Details for ${result.title}`}
                >
                  <span className="bg-elevated block h-16 w-11 shrink-0 overflow-hidden rounded-md">
                    {result.poster ? (
                      <img src={result.poster} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-ink-faint grid h-full place-items-center">
                        <FilmIcon />
                      </span>
                    )}
                  </span>

                  <span className="min-w-0 flex-1 truncate text-sm">{result.title}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onCopy(group.plugin, result)}
                  disabled={copying === key}
                  className={iconButtonClass}
                  aria-label={`Copy ${result.title} as JSON`}
                  title="Copy as JSON"
                >
                  <CopyIcon />
                </button>

                {movie ? (
                  <button type="button" onClick={() => onWatch(movie)} className={ghostButtonClass}>
                    <PlayIcon className="h-3.5 w-3.5" />
                    Watch
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onAdd(group.plugin, result)}
                      disabled={adding === key}
                      className={ghostButtonClass}
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      {adding === key ? 'Adding…' : 'Add'}
                    </button>
                    {/* Adds it too: a movie is only playable from the library. */}
                    <button
                      type="button"
                      onClick={() => onWatchNew(group.plugin, result)}
                      disabled={adding === key}
                      className={ghostButtonClass}
                    >
                      <PlayIcon className="h-3.5 w-3.5" />
                      Watch
                    </button>
                  </>
                )}
              </article>
            )
          })}
        </section>
      ))}
    </div>
  )
}
