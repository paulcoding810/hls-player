import { FilmIcon, PlayIcon, PlusIcon } from './icons'
import { dangerBannerClass, ghostButtonClass } from './ui'

/**
 * Search results from every enabled source, grouped by the source they came
 * from. A source that failed keeps its group and shows why, so a broken one is
 * visible rather than silently missing.
 */
export default function SearchResults({
  groups,
  busy,
  added,
  adding,
  onAdd,
  onWatch,
  onMore,
  loadingMore,
}) {
  const total = groups.reduce((count, group) => count + group.results.length, 0)

  if (busy) return <p className="text-ink-faint text-sm">Searching…</p>

  return (
    <div className="flex flex-col gap-6">
      {total === 0 && groups.every((group) => !group.error) && (
        <p className="text-ink-faint text-sm">Nothing found.</p>
      )}

      {groups.map((group) => (
        <section key={group.plugin.id} className="flex flex-col gap-2">
          <h2 className="text-ink-faint text-[11px] font-medium tracking-wider uppercase">
            {group.plugin.name}
          </h2>

          {group.error ? (
            <p className={`${dangerBannerClass} border-line rounded-md border`}>{group.error}</p>
          ) : (
            group.results.length === 0 && <p className="text-ink-faint text-sm">No results.</p>
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
                <div className="bg-elevated h-16 w-11 shrink-0 overflow-hidden rounded-md">
                  {result.poster ? (
                    <img src={result.poster} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-ink-faint grid h-full place-items-center">
                      <FilmIcon />
                    </span>
                  )}
                </div>

                <h3 className="min-w-0 flex-1 truncate text-sm" title={result.title}>
                  {result.title}
                </h3>

                {movie ? (
                  <button type="button" onClick={() => onWatch(movie)} className={ghostButtonClass}>
                    <PlayIcon className="h-3.5 w-3.5" />
                    Watch
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAdd(group.plugin, result)}
                    disabled={adding === key}
                    className={ghostButtonClass}
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    {adding === key ? 'Adding…' : 'Add'}
                  </button>
                )}
              </article>
            )
          })}

          {!group.error && !group.done && (
            <button
              type="button"
              onClick={() => onMore(group)}
              disabled={loadingMore === group.plugin.id}
              className={`${ghostButtonClass} self-start`}
            >
              {loadingMore === group.plugin.id ? 'Loading…' : 'More'}
            </button>
          )}
        </section>
      ))}
    </div>
  )
}
