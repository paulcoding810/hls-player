import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import videojs from 'video.js'
import '@videojs/http-streaming/dist/videojs-http-streaming-sync-workers.js'
import 'video.js/dist/video-js.css'

import Controls from '@components/Controls'
import EpisodeList from '@components/EpisodeList'
import MovieFields from '@components/MovieFields'
import ResumeDialog from '@components/ResumeDialog'
import {
  AlertIcon,
  EditIcon,
  LibraryIcon,
  NextIcon,
  PlaylistIcon,
  PlayIcon,
  PlusIcon,
} from '@components/icons'
import {
  activeGhostClass,
  dangerBannerClass,
  ghostButtonClass,
  linkButtonClass,
  overlayButtonClass,
  overlayPlayButtonClass,
  warnBannerClass,
} from '@components/ui'
import { GALLERY_PATH, MESSAGE } from '@/helper/constants'
import {
  addMovie,
  EMPTY_LIBRARY,
  findEpisode,
  findMovie,
  getLibrary,
  resolveConfig,
  resumeEpisodeId,
  setEpisodes,
  setLastPlayed,
  updateMovie,
} from '@/helper/library'
import { playerUrlForEpisode } from '@/helper/player'
import { clearProgress, getProgress, saveProgress } from '@/helper/progress'
import { DEFAULT_SETTINGS, getSettings, sanitizeSettings, saveSettings } from '@/helper/settings'
import api from '@/utils/api'
import { hasHostPermission, requestHostPermission } from '@/utils/browser'
import { compilePattern, stripAdSegments } from '@/utils/playlist'
import { stripDecoyPrefix } from '@/utils/segments'
import { fileNameOf, manifestMime, normalizeSource } from '@/utils/url'
import './Player.css'

/**
 * How many times a playlist may fail before playback is given up on. VHS
 * retries a broken playlist for ever when it is the only one it has
 * (videojs/video.js#5849): `excludePlaylist` returns from its
 * `playlists.length === 1` branch before `maxPlaylistRetries` is ever read, so
 * no error is emitted and the page spins. Almost every URL played here is a
 * single media playlist, so that branch is the normal path, not an edge case.
 */
const MAX_PLAYLIST_RETRIES = 3

const VIDEO_JS_OPTIONS = {
  // The playback UI is Controls.jsx — video.js is only the HLS engine here.
  controls: false,
  bigPlayButton: false,
  errorDisplay: false,
  preload: 'auto',
  fill: true,
  html5: {
    // Always play through videojs-http-streaming so the Referer override
    // applies to every playlist and segment request.
    // `maxPlaylistRetries` bounds the retry loop for a stream that has more
    // than one rendition; the single-rendition case is handled below.
    vhs: { overrideNative: true, maxPlaylistRetries: MAX_PLAYLIST_RETRIES },
    nativeAudioTracks: false,
    nativeVideoTracks: false,
  },
}

/** Segment bodies worth unwrapping — never `segment-key`, which is 16 bytes. */
const SEGMENT_TYPES = new Set(['segment', 'segment-media-initialization'])

/** Seconds of grace before an auto-skipped outro moves on, long enough to stop it. */
const OUTRO_COUNTDOWN = 5

const IDLE_DELAY = 2500

/** How often the playback position is written while watching. */
const PROGRESS_INTERVAL = 5

/** Header rules are scoped to this tab by the background script. */
async function applyHeaders(referer) {
  const response = await api.runtime.sendMessage({
    type: MESSAGE.APPLY_HEADERS,
    headers: { referer },
  })
  if (!response?.ok) {
    throw new Error(response?.error || 'Could not apply the Referer header.')
  }
}

/** `?src=` names a URL to play straight away, outside the library. */
const params = new URLSearchParams(window.location.search)
const grabbed = normalizeSource(params.get('src'))
/** `?movie=<id>&episode=<id|1-based index>`; falling back to `lastPlayed`. */
const requested = { movieId: params.get('movie'), episodeId: params.get('episode') }

export default function Player() {
  const containerRef = useRef(null)
  const stageRef = useRef(null)
  const playerRef = useRef(null)
  /** Movie config merged over the global settings, for the video callbacks. */
  const configRef = useRef(resolveConfig(null, DEFAULT_SETTINGS))
  /** Last compiled ad pattern, so a playlist request does not recompile it. */
  const patternRef = useRef({ source: '', regexp: null })
  /** What the last rewritten playlist cost, shown under the pattern field. */
  const [stripped, setStripped] = useState(null)
  const advanceRef = useRef(() => {})
  const hasNextRef = useRef(false)
  /** Guards the automatic outro jump against repeat `timeupdate` calls. */
  const skippedRef = useRef(false)
  const idleTimer = useRef(null)
  const srcRef = useRef(null)
  const savedAtRef = useRef(0)
  /** Set while the resume prompt owns the starting position. */
  const holdRef = useRef(false)

  const [player, setPlayer] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [pointerActive, setPointerActive] = useState(true)
  // The idle timer must not pull the controls out from under a seek in progress.
  const [seeking, setSeeking] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [library, setLibrary] = useState(EMPTY_LIBRARY)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [watching, setWatching] = useState(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [levels, setLevels] = useState([])
  const [level, setLevel] = useState('auto')
  /** `episodes`, `edit`, or null when the panel is closed. */
  const [panel, setPanel] = useState(null)
  /** `intro`, `outro` or null — which skip button the position calls for. */
  const [skip, setSkip] = useState(null)
  /** Seconds left before the outro advances, or null when nothing is pending. */
  const [countdown, setCountdown] = useState(null)
  const [granted, setGranted] = useState(true)
  const [resume, setResume] = useState(null)
  /** Set once a grabbed link has been kept. */
  const [saved, setSaved] = useState(null)

  const movie = findMovie(library, watching?.movieId)
  const episode = findEpisode(movie, watching?.episodeId)
  const episodeIndex = movie?.episodes.findIndex((item) => item.id === episode?.id) ?? -1
  /** What is playing: a grabbed URL, otherwise the queued episode. */
  const source = useMemo(
    () => (grabbed ? { id: grabbed, title: fileNameOf(grabbed), src: grabbed } : episode),
    [episode],
  )
  // Inputs keep their raw text; playback reads sanitized numbers.
  const config = resolveConfig(movie, sanitizeSettings(settings))

  useEffect(() => {
    configRef.current = config
  }, [config])

  useEffect(() => {
    // video.js replaces the element it is handed, so it gets one React does
    // not own — otherwise disposing on unmount fights with React's cleanup.
    const element = document.createElement('video-js')
    element.setAttribute('playsinline', '')
    containerRef.current.appendChild(element)

    const instance = videojs(element, VIDEO_JS_OPTIONS)
    playerRef.current = instance
    setPlayer(instance)

    // Segments disguised as PNGs carry their payload behind an image header.
    // The hook's return value is ignored and the loader reads `request.response`,
    // so the trimmed buffer is shadowed onto the request itself.
    let unwrapped = false
    const unwrapSegment = (request) => {
      if (!SEGMENT_TYPES.has(request.requestType) || request.responseType !== 'arraybuffer') return

      const stripped = stripDecoyPrefix(request.response)
      if (stripped === request.response) return

      Object.defineProperty(request, 'response', { value: stripped, configurable: true })
      if (!unwrapped) {
        unwrapped = true
        console.info(
          `[hls-player] stripped a PNG header from ${request.uri} ` +
            `(${request.bytesReceived ?? '?'} bytes in, payload at ${stripped.byteLength} bytes)`,
        )
      }
    }

    videojs.Vhs.xhr.onResponse(unwrapSegment)

    // Server-side ad insertion leaves the ads in the playlist, so they come out
    // of the text before VHS parses it — the loader reads `responseText`, and
    // the response hooks run first.
    const stripAds = (request) => {
      if (request.requestType !== 'hls-playlist') return

      const source = configRef.current.adPattern
      if (!source) return
      if (source !== patternRef.current.source) {
        patternRef.current = { source, regexp: compilePattern(source) }
      }
      const { regexp } = patternRef.current
      if (!regexp) return

      const result = stripAdSegments(request.responseText, regexp)
      if (!result.removed) return

      Object.defineProperty(request, 'responseText', {
        value: result.text,
        configurable: true,
      })
      setStripped({ removed: result.removed, total: result.total })
      console.info(
        `[hls-player] removed ${result.removed} of ${result.total} segments from ${request.uri}`,
      )
    }

    videojs.Vhs.xhr.onResponse(stripAds)

    instance.on('play', () => setPlaying(true))
    instance.on('pause', () => {
      setPlaying(false)
      // Keep the stored position fresh when someone stops mid-episode.
      if (srcRef.current && !holdRef.current) {
        saveProgress(srcRef.current, instance.currentTime(), instance.duration())
      }
    })
    instance.on('error', () => setError(instance.error()?.message || 'Playback failed.'))

    // Count the retries VHS will not count itself, and stop when they run out.
    // `reset()` tears the tech down, which is what actually ends the loop —
    // it plays first unless the player is already paused, hence the pause.
    let retries = 0
    let guarded = null
    const onRetry = () => {
      retries += 1
      if (retries < MAX_PLAYLIST_RETRIES) return
      retries = 0
      // Out of the event dispatch: `reset()` rebuilds the tech, and doing that
      // while the tech is still delivering this event is its own crash.
      setTimeout(() => {
        if (playerRef.current !== instance) return
        instance.pause()
        instance.reset()
        setError('The stream stopped responding after several attempts.')
      }, 0)
    }
    // The tech is rebuilt by `reset()`, so the listener is re-attached per load.
    const guardTech = () => {
      const tech = instance.tech({ IWillNotUseThisInPlugins: true })
      if (!tech || tech === guarded) return
      guarded = tech
      tech.on('retryplaylist', onRetry)
    }
    instance.on('loadstart', guardTech)
    // A playlist that loads again clears the tally, so an hour of playback
    // cannot accumulate unrelated blips into a shutdown.
    instance.on('playing', () => {
      retries = 0
    })

    instance.on('loadedmetadata', () => {
      setError('')
      setLevels(readLevels(instance))

      const { autoSkip, skipLeading, playbackRate } = configRef.current
      instance.playbackRate(playbackRate)
      const duration = instance.duration()
      if (
        autoSkip &&
        !holdRef.current &&
        skipLeading > 0 &&
        Number.isFinite(duration) &&
        skipLeading < duration
      ) {
        instance.currentTime(skipLeading)
      }
    })

    instance.on('timeupdate', () => {
      const time = instance.currentTime()
      if (srcRef.current && Math.abs(time - savedAtRef.current) >= PROGRESS_INTERVAL) {
        savedAtRef.current = time
        saveProgress(srcRef.current, time, instance.duration())
      }

      const window = skipAt(time, instance.duration(), configRef.current)
      if (!configRef.current.autoSkip) {
        // Turning auto skip off mid-countdown hands the choice back over.
        setCountdown(null)
        setSkip(window)
        return
      }

      setSkip(null)
      // Seeking back out of the outro takes the pending jump with it, so a
      // rewatch is not yanked forward. React bails when it is already null.
      if (window !== 'outro') setCountdown(null)
      // Nothing to jump to on the last episode, so it plays out instead.
      if (window === 'outro' && hasNextRef.current && !skippedRef.current) {
        skippedRef.current = true
        setCountdown(OUTRO_COUNTDOWN)
      }
    })

    instance.on('ended', () => {
      if (srcRef.current) clearProgress(srcRef.current)
      advanceRef.current()
    })

    return () => {
      videojs.Vhs.xhr.offResponse(unwrapSegment)
      videojs.Vhs.xhr.offResponse(stripAds)
      instance.dispose()
      playerRef.current = null
      setPlayer(null)
    }
  }, [])

  // Opening the page continues where it was left, or shows the library.
  useEffect(() => {
    ;(async () => {
      const [storedSettings, storedLibrary, permission] = await Promise.all([
        getSettings(),
        getLibrary(),
        hasHostPermission(),
      ])
      setSettings(storedSettings)
      setLibrary(storedLibrary)
      setGranted(permission)

      if (grabbed) {
        configRef.current = resolveConfig(null, storedSettings)
        setReady(true)
        return
      }

      const asked =
        findMovie(storedLibrary, requested.movieId) ??
        findMovie(storedLibrary, storedLibrary.lastPlayed?.movieId)
      const episodeId = asked
        ? (episodeIdIn(asked, requested.episodeId) ??
          episodeIdIn(asked, storedLibrary.lastPlayed?.episodeId) ??
          resumeEpisodeId(asked))
        : null

      if (!asked || !episodeId) {
        // `replace`, so Back does not bounce straight back here.
        window.location.replace(GALLERY_PATH)
        return
      }

      setWatching({ movieId: asked.id, episodeId })
      configRef.current = resolveConfig(asked, storedSettings)
      setReady(true)
      // The toolbar icon and the library both read this to resume.
      setLibrary(await setLastPlayed(asked.id, episodeId))
    })()
  }, [])

  /** Keeps this page in step with edits made on the options page. */
  useEffect(() => {
    const listener = (changes, area) => {
      if (area !== 'local') return
      const next = changes.settings?.newValue
      if (!next || sameSettings(next, settings)) return
      setSettings({ ...DEFAULT_SETTINGS, ...next })
    }
    api.storage.onChanged.addListener(listener)
    return () => api.storage.onChanged.removeListener(listener)
  }, [settings])

  useEffect(() => {
    const listener = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', listener)
    return () => document.removeEventListener('fullscreenchange', listener)
  }, [])

  // Load whenever what is playing changes.
  useEffect(() => {
    if (!ready || !source) return
    let cancelled = false

    ;(async () => {
      srcRef.current = source.src
      savedAtRef.current = 0
      skippedRef.current = false
      holdRef.current = false
      setResume(null)
      setSkip(null)
      setCountdown(null)
      setError('')
      setLevels([])
      setLevel('auto')
      try {
        await applyHeaders(configRef.current.referer)
      } catch (headerError) {
        setError(headerError.message)
        return
      }
      if (cancelled) return

      const instance = playerRef.current
      if (!instance) return

      const stored = await getProgress(source.src)
      if (cancelled) return

      const { autoplay, muted, playbackRate } = configRef.current
      holdRef.current = Boolean(stored)
      instance.src({ src: source.src, type: manifestMime(source.src) })
      instance.muted(Boolean(muted))
      instance.playbackRate(playbackRate)

      if (stored) {
        // Playback waits for the answer instead of starting at zero and jumping.
        setResume(stored)
      } else if (autoplay) {
        // Autoplay is blocked without a gesture unless the stream is muted.
        instance.play()?.catch(() => {})
      }
    })()

    return () => {
      cancelled = true
    }
  }, [ready, source?.id, source?.src, config.referer])

  useEffect(() => {
    if (!source) document.title = 'HLS Player'
    else document.title = movie ? `${source.title} – ${movie.title}` : source.title
  }, [source, movie?.title])

  const play = useCallback(async (movieId, episodeId) => {
    if (!episodeId) return
    setWatching({ movieId, episodeId })
    window.history.replaceState(null, '', playerUrlForEpisode(movieId, episodeId))
    setLibrary(await setLastPlayed(movieId, episodeId))
  }, [])

  useEffect(() => {
    if (grabbed || !ready || !watching?.movieId || !movie || episode) return
    // The episode being watched was edited away.
    const fallback = resumeEpisodeId(movie)
    if (fallback) play(movie.id, fallback)
    else window.location.href = GALLERY_PATH
  }, [ready, watching?.movieId, movie, episode, play])

  const goToEpisode = useCallback(
    (episodeId) => {
      if (watching?.movieId) play(watching.movieId, episodeId)
    },
    [play, watching?.movieId],
  )

  useEffect(() => {
    const next = movie?.episodes[episodeIndex + 1]
    hasNextRef.current = Boolean(next)
    advanceRef.current = () => {
      if (next) goToEpisode(next.id)
      else playerRef.current?.pause()
    }
  }, [movie, episodeIndex, goToEpisode])

  // Counts the outro down, then advances. Paused playback holds the count
  // where it is: counting on while someone reads the credits would jump them.
  useEffect(() => {
    if (countdown === null) return undefined
    if (countdown <= 0) {
      setCountdown(null)
      advanceRef.current()
      return undefined
    }
    if (!playing) return undefined

    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown, playing])

  /** Hides the controls while playback is left alone. */
  const wake = useCallback(() => {
    setPointerActive(true)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setPointerActive(false), IDLE_DELAY)
  }, [])

  useEffect(() => () => clearTimeout(idleTimer.current), [])

  useEffect(() => {
    if (playing) wake()
  }, [playing, wake])

  useEffect(() => {
    if (!source) playerRef.current?.pause()
  }, [source])

  /** Seeking before metadata lands does not stick, so it waits when needed. */
  const startAt = useCallback((time) => {
    const instance = playerRef.current
    if (!instance) return

    const apply = () => {
      instance.currentTime(time)
      holdRef.current = false
      savedAtRef.current = time
      instance.play()?.catch(() => {})
    }

    if (instance.readyState() >= 1) apply()
    else instance.one('loadedmetadata', apply)
  }, [])

  const handleResume = useCallback(() => {
    const position = resume?.position ?? 0
    setResume(null)
    startAt(position)
  }, [resume, startAt])

  const handleRestart = useCallback(() => {
    setResume(null)
    if (srcRef.current) clearProgress(srcRef.current)
    const { autoSkip, skipLeading } = configRef.current
    startAt(autoSkip ? skipLeading || 0 : 0)
  }, [startAt])

  const togglePlay = useCallback(() => {
    const instance = playerRef.current
    if (!instance) return
    if (instance.paused()) instance.play()?.catch(() => {})
    else instance.pause()
  }, [])

  /** Navigating away kills the player, so the position is stored first. */
  const goToLibrary = useCallback(async () => {
    const instance = playerRef.current
    if (instance && srcRef.current && !holdRef.current) {
      instance.pause()
      await saveProgress(srcRef.current, instance.currentTime(), instance.duration())
    }
    window.location.href = GALLERY_PATH
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen()
    else stageRef.current?.requestFullscreen?.()
  }, [])

  const updateSettings = useCallback((patch) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  /**
   * Saving does not re-point playback at the new entry: the URL is already what
   * is playing and progress is written against it, so switching would only
   * restart the stream.
   */
  const addToLibrary = async () => {
    const movieAdded = await addMovie({
      title: fileNameOf(grabbed),
      episodes: [{ src: grabbed, title: fileNameOf(grabbed) }],
    })
    setSaved(movieAdded.id)
  }

  const saveMovie = async ({ episodes, ...patch }) => {
    await updateMovie(movie.id, patch)
    setLibrary(await setEpisodes(movie.id, episodes))
    setPanel('episodes')
  }

  const skipIntro = useCallback(() => {
    playerRef.current?.currentTime(configRef.current.skipLeading)
    setSkip(null)
  }, [])

  const skipOutro = useCallback(() => advanceRef.current(), [])

  const hasPrevious = episodeIndex > 0
  const hasNext = episodeIndex > -1 && episodeIndex + 1 < (movie?.episodes.length ?? 0)
  // On the last episode the outro leads nowhere, so it is not offered.
  const skipAction = skip === 'outro' && !hasNext ? null : skip

  // Keyboard shortcuts, unless a form control has focus.
  useEffect(() => {
    const listener = (event) => {
      if (resume || panel === 'edit' || !source) return
      const target = event.target
      if (target?.closest?.('input, textarea, select, [contenteditable]')) return

      // Space is playback's, never a re-press of the button that was clicked
      // last, so the focus it is holding is dropped. Enter still activates.
      if (event.key === ' ') target?.blur?.()
      else if (event.key === 'Enter' && target?.closest?.('button, a')) return

      const instance = playerRef.current
      if (!instance) return

      const seek = (delta) => instance.currentTime(Math.max(0, instance.currentTime() + delta))
      const setVolume = (delta) =>
        instance.volume(Math.min(1, Math.max(0, instance.volume() + delta)))

      const handlers = {
        ' ': togglePlay,
        k: togglePlay,
        ArrowLeft: () => seek(-5),
        ArrowRight: () => seek(5),
        ArrowUp: () => setVolume(0.05),
        ArrowDown: () => setVolume(-0.05),
        m: () => instance.muted(!instance.muted()),
        f: toggleFullscreen,
        n: () => hasNext && goToEpisode(movie.episodes[episodeIndex + 1].id),
        p: () => hasPrevious && goToEpisode(movie.episodes[episodeIndex - 1].id),
      }

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      const handler = handlers[key]
      if (!handler) return
      event.preventDefault()
      wake()
      handler()
    }

    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [
    togglePlay,
    toggleFullscreen,
    goToEpisode,
    wake,
    hasNext,
    hasPrevious,
    movie,
    episodeIndex,
    resume,
    panel,
    episode,
  ])

  const handleLevelChange = (event) => {
    const value = event.target.value
    setLevel(value)
    representationsOf(playerRef.current).forEach((representation) => {
      representation.enabled(value === 'auto' || String(representation.id) === value)
    })
  }

  const showControls = !playing || pointerActive || seeking
  // The editor must not vanish mid-typing, so only the episode list fades.
  const panelVisible = showControls || panel === 'edit'

  return (
    <>
      <main className="player-shell bg-surface text-ink flex h-screen flex-col">
        <header className="border-line flex items-center gap-3 border-b px-4 py-2">
          <button
            type="button"
            onClick={goToLibrary}
            className={ghostButtonClass}
            title="Back to the library"
          >
            <LibraryIcon />
            Library
          </button>

          <span className="truncate text-sm" title={source?.src || ''}>
            {movie?.title ?? source?.title}
            {movie && source && <span className="text-ink-faint"> · {source.title}</span>}
          </span>
          {movie?.episodes.length > 1 && episodeIndex > -1 && (
            <span className="text-ink-faint shrink-0 text-xs">
              {episodeIndex + 1} / {movie.episodes.length}
            </span>
          )}

          {grabbed ? (
            <button
              type="button"
              onClick={addToLibrary}
              disabled={Boolean(saved)}
              className={`${ghostButtonClass} ml-auto`}
            >
              <PlusIcon />
              {saved ? 'Added to library' : 'Add to library'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPanel(panel ? null : 'episodes')}
              className={`${ghostButtonClass} ml-auto ${panel ? activeGhostClass : ''}`}
            >
              <PlaylistIcon />
              Episodes
            </button>
          )}
        </header>

        {!granted && (
          <button
            type="button"
            onClick={async () => setGranted(await requestHostPermission())}
            className={`${warnBannerClass} border-line border-b`}
          >
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            Access to websites is not granted yet — click to allow it, otherwise streams cannot be
            fetched.
          </button>
        )}

        {error && (
          <p className={`${dangerBannerClass} border-line border-b`}>
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error} Streams that reject the request usually need a matching Referer.</span>
          </p>
        )}

        <div
          className="relative flex min-h-0 flex-1"
          onPointerMove={wake}
          onPointerLeave={() => setPointerActive(false)}
        >
          <div
            ref={stageRef}
            className={`relative min-w-0 flex-1 bg-black ${showControls ? '' : 'cursor-none'}`}
          >
            <div ref={containerRef} className="absolute inset-0" data-vjs-player />

            {source && (
              <button
                type="button"
                tabIndex={-1}
                onClick={togglePlay}
                onDoubleClick={toggleFullscreen}
                aria-label="Play or pause"
                className="absolute inset-0 cursor-pointer"
              />
            )}

            {source && !playing && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label="Play"
                  className={`${overlayPlayButtonClass} pointer-events-auto`}
                >
                  <PlayIcon className="ml-1 h-7 w-7" />
                </button>
              </div>
            )}

            {countdown !== null && (
              <div className="border-line absolute right-6 bottom-24 z-20 flex items-center gap-3 rounded-md border bg-black/70 px-4 py-2 text-sm backdrop-blur-sm">
                <span className="text-ink">
                  Next episode in <span className="font-mono">{countdown}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setCountdown(null)}
                  className={linkButtonClass}
                >
                  Stay
                </button>
              </div>
            )}

            {skipAction && (
              <button
                type="button"
                onClick={skipAction === 'intro' ? skipIntro : skipOutro}
                className={`${overlayButtonClass} absolute right-6 bottom-24 z-20`}
              >
                <NextIcon />
                {skipAction === 'intro' ? 'Skip intro' : 'Skip outro'}
              </button>
            )}

            {/* The bar spans the full width and sits above the panel: resizing it
                as the panel toggles moved every control under the pointer. */}
            {source && (
              <div
                className={`absolute inset-x-0 bottom-0 z-20 transition-opacity duration-200 ${
                  showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
              >
                <Controls
                  player={player}
                  levels={levels}
                  level={level}
                  onLevelChange={handleLevelChange}
                  onRateChange={(playbackRate) => {
                    playerRef.current?.playbackRate(playbackRate)
                    updateSettings({ playbackRate })
                  }}
                  onPrevious={() => goToEpisode(movie.episodes[episodeIndex - 1].id)}
                  onNext={() => goToEpisode(movie.episodes[episodeIndex + 1].id)}
                  hasPrevious={hasPrevious}
                  hasNext={hasNext}
                  onSeekingChange={setSeeking}
                  fullscreen={fullscreen}
                  onToggleFullscreen={toggleFullscreen}
                />
              </div>
            )}
          </div>

          {panel && !grabbed && (
            <aside
              onPointerEnter={() => {
                clearTimeout(idleTimer.current)
                setPointerActive(true)
              }}
              onPointerLeave={wake}
              className={`border-line bg-panel/95 absolute inset-y-0 right-0 z-10 flex w-80 max-w-[85%] flex-col gap-4 overflow-y-auto border-l p-4 pb-24 backdrop-blur-sm transition-opacity duration-200 ${
                panelVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              {panel === 'edit' ? (
                <>
                  <h2 className="text-ink-muted text-[11px] font-medium tracking-wider uppercase">
                    Edit movie
                  </h2>
                  <MovieFields
                    movie={movie}
                    defaults={settings}
                    idPrefix="panel"
                    removed={
                      stripped && (
                        <p className="text-ink-muted mt-1 text-xs">
                          Removed {stripped.removed} of {stripped.total} segments from the last
                          playlist.
                        </p>
                      )
                    }
                    onSave={saveMovie}
                    onCancel={() => setPanel('episodes')}
                  />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h2 className="text-ink-muted text-[11px] font-medium tracking-wider uppercase">
                      Episodes ({movie?.episodes.length ?? 0})
                    </h2>
                    <button
                      type="button"
                      onClick={() => setPanel('edit')}
                      className={`${ghostButtonClass} ml-auto`}
                    >
                      <EditIcon className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </div>
                  <EpisodeList
                    episodes={movie?.episodes ?? []}
                    currentId={source?.id}
                    onSelect={goToEpisode}
                  />
                </>
              )}
            </aside>
          )}
        </div>
      </main>

      {resume && source && (
        <ResumeDialog
          position={resume.position}
          duration={resume.duration}
          onResume={handleResume}
          onRestart={handleRestart}
        />
      )}
    </>
  )
}

/** Which skip the current position offers, if any. */
function skipAt(time, duration, { skipLeading, skipTrailing }) {
  // Both need a real end: a live stream has none, and an intro longer than the
  // episode would seek past it.
  if (!Number.isFinite(duration) || duration <= 0) return null
  if (skipLeading > 0 && skipLeading < duration && time < skipLeading) return 'intro'
  if (skipTrailing > 0 && duration > skipTrailing && time >= duration - skipTrailing) {
    return 'outro'
  }
  return null
}

/** Accepts an episode id or a 1-based position; null when neither matches. */
function episodeIdIn(movie, value) {
  if (!value) return null

  const byId = findEpisode(movie, value)
  if (byId) return byId.id

  const position = Number(value)
  if (!Number.isInteger(position)) return null
  return movie.episodes[position - 1]?.id ?? null
}

function sameSettings(left, right) {
  return Object.keys(DEFAULT_SETTINGS).every((key) => left[key] === right[key])
}

function representationsOf(player) {
  try {
    return player?.tech({ IWillNotUseThisInPlugins: true })?.vhs?.representations?.() ?? []
  } catch {
    return []
  }
}

function readLevels(player) {
  return representationsOf(player)
    .map((representation) => ({
      id: String(representation.id),
      height: representation.height,
      bandwidth: representation.bandwidth,
      label: representation.height
        ? `${representation.height}p`
        : `${Math.round((representation.bandwidth || 0) / 1000)} kbps`,
    }))
    .sort((a, b) => (b.height || b.bandwidth || 0) - (a.height || a.bandwidth || 0))
}
