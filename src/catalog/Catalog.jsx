import { useEffect, useMemo, useState } from 'react'

import MovieDetails from '@components/MovieDetails'
import SearchResults from '@components/SearchResults'
import Toast from '@components/Toast'
import { FilmIcon, LibraryIcon, SearchIcon, SettingsIcon } from '@components/icons'
import {
  buttonClass,
  ghostButtonClass,
  iconButtonClass,
  inputClass,
  selectClass,
} from '@components/ui'
import { HOME_PATH } from '@/helper/constants'
import { addMovie, EMPTY_LIBRARY, getLibrary, movieToJson, resumeEpisodeId } from '@/helper/library'
import { openOptions, openPlayer } from '@/helper/player'
import { getPlugins, searchAll } from '@/helper/plugins'
import {
  browseCatalog,
  fetchStremioDetails,
  fetchStremioEpisodes,
  listCatalogs,
} from '@/helper/stremio'

/** What a catalog hands back in one go; the next page starts after it. */
const PAGE = 100

/** `pluginId:catalogType:catalogId`, so one `<select>` can name both. */
const catalogKey = (plugin, catalog) => `${plugin.id}:${catalog.type}:${catalog.id}`

/**
 * Sources, rather than the library: search every enabled addon at once, or
 * browse one of their catalogs. Adding from here lands in the library, which
 * is what `home.html` shows.
 */
export default function Catalog() {
  const [plugins, setPlugins] = useState([])
  const [library, setLibrary] = useState(EMPTY_LIBRARY)
  const [notice, setNotice] = useState(null)

  const [query, setQuery] = useState('')
  /** Null until a search has run; then one group per enabled source. */
  const [groups, setGroups] = useState(null)
  const [searching, setSearching] = useState(false)

  /** Every catalog every enabled source publishes, flattened for the picker. */
  const [catalogs, setCatalogs] = useState([])
  const [chosen, setChosen] = useState('')
  const [browsing, setBrowsing] = useState(false)
  const [results, setResults] = useState([])
  /** Null once a page comes back short — there is nothing further to ask for. */
  const [skip, setSkip] = useState(0)

  const [adding, setAdding] = useState('')
  const [copying, setCopying] = useState('')
  /** The result opened in the details view, and what its `/meta/` returned. */
  const [viewing, setViewing] = useState(null)

  useEffect(() => {
    ;(async () => {
      const [storedPlugins, storedLibrary] = await Promise.all([getPlugins(), getLibrary()])
      setPlugins(storedPlugins)
      setLibrary(storedLibrary)

      const enabled = storedPlugins.filter((plugin) => plugin.enabled)
      const lists = await Promise.all(
        enabled.map(async (plugin) => {
          try {
            return (await listCatalogs(plugin)).map((catalog) => ({ plugin, catalog }))
          } catch {
            // A source whose manifest will not load simply offers no catalogs;
            // searching it will report the failure in its own group.
            return []
          }
        }),
      )
      setCatalogs(lists.flat())
    })()
  }, [])

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

  const picked = catalogs.find((entry) => catalogKey(entry.plugin, entry.catalog) === chosen)

  /** In a tab of its own, so the search results stay where they were. */
  const play = (movieId, episodeId) => {
    if (episodeId) openPlayer(movieId, episodeId)
  }

  const runSearch = async (event) => {
    event.preventDefault()
    const term = query.trim()
    if (!term) return

    setNotice(null)
    setSearching(true)
    try {
      setGroups(await searchAll(plugins, term))
    } finally {
      setSearching(false)
    }
  }

  const openCatalog = async (key) => {
    setChosen(key)
    setGroups(null)
    setResults([])
    setSkip(0)

    const entry = catalogs.find((item) => catalogKey(item.plugin, item.catalog) === key)
    if (!entry) return

    setBrowsing(true)
    setNotice(null)
    try {
      const page = await browseCatalog(entry.plugin, entry.catalog)
      setResults(page)
      // Only a catalog that says it pages can be asked for more, and only when
      // this page was full — a short one is already the end.
      setSkip(entry.catalog.pageable && page.length >= PAGE ? page.length : null)
    } catch (error) {
      setNotice({ tone: 'danger', message: error.message })
      setSkip(null)
    } finally {
      setBrowsing(false)
    }
  }

  const loadMore = async () => {
    if (!picked || skip === null) return

    setBrowsing(true)
    try {
      const page = await browseCatalog(picked.plugin, picked.catalog, skip)
      const seen = new Set(results.map((result) => result.id))
      const fresh = page.filter((result) => !seen.has(result.id))

      setResults((current) => [...current, ...fresh])
      // Nothing new also catches an addon that ignores `skip` and repeats itself.
      setSkip(fresh.length ? skip + page.length : null)
    } catch (error) {
      setNotice({ tone: 'danger', message: error.message })
      setSkip(null)
    } finally {
      setBrowsing(false)
    }
  }

  const openDetails = async (plugin, result) => {
    const key = `${plugin.id}:${result.id}`
    setViewing({ key, plugin, result })
    try {
      const found = await fetchStremioDetails(plugin, result)
      // Closed, or another opened, while this one was loading.
      setViewing((current) => (current?.key === key ? { ...current, ...found } : current))
    } catch (error) {
      setViewing((current) =>
        current?.key === key ? { ...current, error: error.message } : current,
      )
    }
  }

  /** `known` is the episode list the details view already read, if it did. */
  const addResult = async (plugin, result, known) => {
    const key = `${plugin.id}:${result.id}`
    setAdding(key)
    setNotice(null)
    try {
      const episodes = known ?? (await fetchStremioEpisodes(plugin, result))
      if (!episodes.length) throw new Error(`${plugin.name} returned no episodes for this title.`)

      const movie = await addMovie({
        title: result.title,
        poster: result.poster,
        referer: plugin.referer,
        adPattern: plugin.adPattern,
        episodes,
        source: {
          pluginId: plugin.id,
          itemId: result.id,
          ...(result.type ? { type: result.type } : {}),
        },
      })
      setLibrary(await getLibrary())
      return movie
    } catch (error) {
      setNotice({ tone: 'danger', message: error.message })
      return null
    } finally {
      setAdding('')
    }
  }

  /** Playing needs a library entry — progress and the player's URL both name one. */
  const watchResult = async (plugin, result, known) => {
    const movie = await addResult(plugin, result, known)
    if (movie) play(movie.id, resumeEpisodeId(movie))
  }

  /** The same JSON the Add movie form's Paste JSON mode reads back. */
  const copyResult = async (plugin, result) => {
    const key = `${plugin.id}:${result.id}`
    setCopying(key)
    setNotice(null)
    try {
      const episodes = await fetchStremioEpisodes(plugin, result)
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

  const sources = plugins.some((plugin) => plugin.enabled)
  /** One group, so browse results reuse the search list and its buttons. */
  const browsed = picked
    ? [{ plugin: picked.plugin, catalog: picked.catalog, results, error: '' }]
    : []

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col p-6">
      <header className="mb-6 flex items-center gap-3">
        <img src="/img/logo-32.png" alt="" className="h-6 w-6" />
        <h1 className="text-base font-semibold">Sources</h1>
        <a href={HOME_PATH} className={`${ghostButtonClass} ml-auto`}>
          <LibraryIcon />
          Library
        </a>
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

      {!sources ? (
        <div className="text-ink-faint flex flex-1 flex-col items-center justify-center gap-3">
          <FilmIcon className="h-10 w-10" />
          <p className="text-sm">No sources yet.</p>
          <button type="button" onClick={() => openOptions()} className={buttonClass}>
            <SettingsIcon />
            Add one on the options page
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={runSearch} className="mb-4 flex items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search every enabled source…"
              aria-label="Search your sources"
              className={inputClass}
            />
            <button type="submit" disabled={!query.trim()} className={ghostButtonClass}>
              <SearchIcon className="h-3.5 w-3.5" />
              Search
            </button>
          </form>

          {catalogs.length > 0 && (
            <div className="mb-6 flex items-center gap-2">
              <label className="text-ink-faint text-xs" htmlFor="catalog">
                Or browse
              </label>
              <select
                id="catalog"
                value={chosen}
                onChange={(event) => openCatalog(event.target.value)}
                className={selectClass}
              >
                <option value="">Pick a catalog…</option>
                {catalogs.map(({ plugin, catalog }) => (
                  <option key={catalogKey(plugin, catalog)} value={catalogKey(plugin, catalog)}>
                    {plugin.name} · {catalog.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Toast notice={notice} onDismiss={() => setNotice(null)} />

          {viewing && (
            <MovieDetails
              key={viewing.key}
              result={viewing.result}
              details={viewing.details}
              episodes={viewing.episodes}
              error={viewing.error}
              movie={added.get(viewing.key)}
              adding={adding === viewing.key}
              copying={copying === viewing.key}
              onAdd={() => addResult(viewing.plugin, viewing.result, viewing.episodes)}
              onWatchNew={() => watchResult(viewing.plugin, viewing.result, viewing.episodes)}
              onWatch={(movie) => play(movie.id, resumeEpisodeId(movie))}
              onCopy={() => copyResult(viewing.plugin, viewing.result)}
              onClose={() => setViewing(null)}
            >
              <Toast notice={notice} onDismiss={() => setNotice(null)} />
            </MovieDetails>
          )}

          {groups !== null ? (
            <SearchResults
              groups={groups}
              busy={searching}
              added={added}
              adding={adding}
              onAdd={addResult}
              onWatch={(movie) => play(movie.id, resumeEpisodeId(movie))}
              onWatchNew={watchResult}
              onCopy={copyResult}
              copying={copying}
              onOpen={openDetails}
            />
          ) : picked ? (
            <div className="flex flex-col gap-4">
              <SearchResults
                groups={browsed}
                busy={browsing && results.length === 0}
                added={added}
                adding={adding}
                onAdd={addResult}
                onWatch={(movie) => play(movie.id, resumeEpisodeId(movie))}
                onWatchNew={watchResult}
                onCopy={copyResult}
                copying={copying}
                onOpen={openDetails}
              />
              {skip !== null && results.length > 0 && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={browsing}
                  className={`${ghostButtonClass} self-start`}
                >
                  {browsing ? 'Loading…' : 'More'}
                </button>
              )}
            </div>
          ) : (
            <p className="text-ink-faint text-sm">
              Search your sources, or pick a catalog to browse.
            </p>
          )}
        </>
      )}
    </main>
  )
}
