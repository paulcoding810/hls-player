import { useEffect, useRef, useState } from 'react'

import {
  FullscreenExitIcon,
  LayersIcon,
  MinusIcon,
  PlusIcon,
  SettingsIcon,
  FullscreenIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  VolumeIcon,
  VolumeMutedIcon,
} from './icons'
import {
  checkboxClass,
  checkboxRowClass,
  iconButtonClass,
  labelClass,
  linkButtonClass,
  selectClass,
} from './ui'
import { PLAYBACK_RATES, SUBTITLE_POSITIONS, SUBTITLE_SIZES } from '@/helper/constants'
import { formatTime } from '@/utils/time'
import './Controls.css'

const PLAYER_EVENTS = [
  'play',
  'pause',
  'timeupdate',
  'progress',
  'durationchange',
  'loadedmetadata',
  'volumechange',
  'ratechange',
  'seeking',
  'seeked',
  'emptied',
]

const EMPTY_STATE = {
  playing: false,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  volume: 1,
  muted: false,
  rate: 1,
}

function read(player) {
  return {
    playing: !player.paused(),
    currentTime: player.currentTime() || 0,
    duration: player.duration() || 0,
    buffered: player.bufferedEnd() || 0,
    volume: player.volume(),
    muted: player.muted(),
    rate: player.playbackRate(),
  }
}

/**
 * Lines above the bottom for a second track's cues. The primary sits on the
 * last line, so this clears a two-line cue beneath it.
 */
const SECOND_TRACK_LINE = -4

/** Nudging subtitles into sync: a quarter of a second reads as one press. */
const TIMING_STEP = 0.25
const TIMING_LIMIT = 30

/** Matches `.control-range`'s thumb in Controls.css. */
const THUMB_SIZE = 12

/** Fills the track up to `played`, with the buffered range a shade behind it. */
function trackBackground(played, buffered) {
  return {
    background: `linear-gradient(to right,
      var(--color-primary) 0 ${played}%,
      var(--color-line-strong) ${played}% ${Math.max(played, buffered)}%,
      var(--color-line) ${Math.max(played, buffered)}% 100%)`,
  }
}

export default function Controls({
  player,
  levels,
  level,
  onLevelChange,
  onRateChange,
  onPrevious,
  onNext,
  onHoldControls,
  subtitleSettings,
  onSubtitleSettings,
  streams = [],
  currentStream,
  onChooseStream,
  hasPrevious,
  hasNext,
  fullscreen,
  onToggleFullscreen,
}) {
  const [state, setState] = useState(EMPTY_STATE)
  /** Non-null while the seek bar is being dragged. */
  const [scrubbing, setScrubbing] = useState(null)
  // Mirrors `scrubbing` for the commit, which runs in a later event and so
  // cannot rely on the state update from this one having rendered yet.
  const pendingSeek = useRef(null)
  /** Where the pointer sits over the seek bar, as a 0-1 ratio of the track. */
  const [hover, setHover] = useState(null)
  /** Subtitle and caption tracks the stream carries, and which is showing. */
  const [tracks, setTracks] = useState([])
  const [tuning, setTuning] = useState(false)
  const [sourcing, setSourcing] = useState(false)
  /** A second track shown at the same time, above the first. */
  const [secondId, setSecondId] = useState('off')
  /** Seconds the cues are shifted by; positive shows them later. */
  const [offset, setOffset] = useState(0)
  /** Each cue's own times, so an offset is always measured from the original. */
  const cueTimes = useRef(new WeakMap())
  /** What each track already carries, to skip tracks that need no work. */
  const appliedOffset = useRef(new Map())

  useEffect(() => {
    if (!player) return
    const sync = () => setState(read(player))
    PLAYER_EVENTS.forEach((event) => player.on(event, sync))
    sync()
    return () => PLAYER_EVENTS.forEach((event) => player.off(event, sync))
  }, [player])

  // Tracks arrive after the manifest is parsed, and a rendition change can add
  // or drop them, so the list is watched rather than read once.
  useEffect(() => {
    if (!player) return undefined
    const list = player.textTracks()

    const sync = () => {
      const found = []
      for (let index = 0; index < list.length; index += 1) {
        const track = list[index]
        if (track.kind !== 'subtitles' && track.kind !== 'captions') continue
        found.push({
          id: track.id || `${track.language}-${index}`,
          label: track.label || track.language || `Track ${found.length + 1}`,
          track,
        })
      }
      setTracks(found)
      // The next episode brings different tracks, so a second one chosen for
      // the last is no longer in the list and must not linger in the menu.
      setSecondId((current) =>
        current === 'off' || found.some((entry) => entry.id === current) ? current : 'off',
      )
    }

    list.addEventListener('addtrack', sync)
    list.addEventListener('removetrack', sync)
    list.addEventListener('change', sync)
    sync()

    return () => {
      list.removeEventListener('addtrack', sync)
      list.removeEventListener('removetrack', sync)
      list.removeEventListener('change', sync)
    }
  }, [player])

  /**
   * A second track's cues default to the last line, exactly where the first
   * one sits. Lifting them stacks the pair rather than printing them on top of
   * each other.
   */
  useEffect(() => {
    const track = tracks.find((entry) => entry.id === secondId)?.track
    if (!track) return undefined

    const lift = () => {
      const cues = track.cues
      if (!cues || !cues.length) return false
      for (let index = 0; index < cues.length; index += 1) {
        cues[index].snapToLines = true
        cues[index].line = SECOND_TRACK_LINE
      }
      return true
    }

    // Putting the line back matters when this track is later promoted to the
    // first one: cues left at -4 would render high up the frame.
    const restore = () => {
      const cues = track.cues
      for (let index = 0; index < (cues?.length ?? 0); index += 1) cues[index].line = 'auto'
    }

    // Cues only load once a track is showing, so the first attempt often finds
    // none and the first `cuechange` is when they are all there.
    if (lift()) return restore

    const retry = () => {
      if (lift()) track.removeEventListener('cuechange', retry)
    }
    track.addEventListener('cuechange', retry)
    return () => {
      track.removeEventListener('cuechange', retry)
      restore()
    }
  }, [tracks, secondId])

  /**
   * Subtitles running ahead of or behind the audio are fixed by moving the cues
   * themselves — the only timing a text track exposes. Every cue is set from
   * the times it was born with rather than nudged from where it is now: a cue
   * near the start clamps at zero, and adding the difference back would not
   * return it to where it began. A track whose cues arrive later is caught by
   * its own `cuechange`.
   */
  useEffect(() => {
    const applied = appliedOffset.current
    const original = cueTimes.current

    const sync = () => {
      tracks.forEach(({ track }) => {
        const cues = track.cues
        if (!cues || !cues.length) return
        if (applied.get(track) === offset) return

        for (let index = 0; index < cues.length; index += 1) {
          const cue = cues[index]
          let born = original.get(cue)
          if (!born) {
            born = { startTime: cue.startTime, endTime: cue.endTime }
            original.set(cue, born)
          }
          cue.startTime = Math.max(0, born.startTime + offset)
          cue.endTime = Math.max(0, born.endTime + offset)
        }
        applied.set(track, offset)
      })
    }

    sync()
    const detach = tracks.map(({ track }) => {
      track.addEventListener('cuechange', sync)
      return () => track.removeEventListener('cuechange', sync)
    })
    return () => detach.forEach((off) => off())
  }, [offset, tracks])

  if (!player) return null

  const isLive = state.duration === Infinity
  const seekable = Number.isFinite(state.duration) && state.duration > 0
  const position = scrubbing ?? state.currentTime
  const played = seekable ? (position / state.duration) * 100 : 0
  const buffered = seekable ? (state.buffered / state.duration) * 100 : 0

  const startSeek = () => {
    pendingSeek.current = state.currentTime
    onHoldControls?.(true)
  }

  const moveSeek = (event) => {
    pendingSeek.current = Number(event.target.value)
    setScrubbing(pendingSeek.current)
  }

  const commitSeek = (event) => {
    if (pendingSeek.current === null) return
    // A click that lands on the thumb leaves the value alone, so no change event
    // fires; the element itself holds whatever the browser settled on.
    const value = Number(event.currentTarget.value)
    const target = Number.isFinite(value) ? value : pendingSeek.current
    player.currentTime(target)
    pendingSeek.current = null
    // `state` only moves when the player emits, so dropping `scrubbing` before
    // then would render the pre-seek time and snap the thumb backwards.
    setState((current) => ({ ...current, currentTime: target }))
    setScrubbing(null)
    onHoldControls?.(false)
  }

  // The thumb's centre only spans `width - THUMB_SIZE`, inset by half of it at
  // each end, so the raw pointer ratio would drift from where the thumb lands.
  const trackHover = (event) => {
    if (!seekable) return
    const rect = event.currentTarget.getBoundingClientRect()
    const usable = rect.width - THUMB_SIZE
    if (usable <= 0) return

    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left - THUMB_SIZE / 2) / usable))
    setHover(ratio)
  }

  const second = tracks.find((entry) => entry.id === secondId)
  const showing = tracks.find((entry) => entry.track.mode === 'showing' && entry.id !== secondId)

  const apply = (primary, secondary) => {
    tracks.forEach((entry) => {
      const wanted = entry.id === primary || (secondary !== 'off' && entry.id === secondary)
      entry.track.mode = wanted ? 'showing' : 'disabled'
    })
    // `change` does not fire for every engine, so the list is re-read here too.
    setTracks((current) => [...current])
  }

  const chooseTrack = (id) => {
    // Picking the second track as the first leaves nothing stacked above it.
    if (id === secondId) setSecondId('off')
    apply(id, id === secondId ? 'off' : secondId)
  }

  /** Rounded to the step, so repeated presses cannot drift off it. */
  const nudge = (delta) => {
    setOffset((current) => {
      const next = Math.round((current + delta) / TIMING_STEP) * TIMING_STEP
      return Math.min(TIMING_LIMIT, Math.max(-TIMING_LIMIT, next))
    })
  }

  const chooseSecond = (id) => {
    setSecondId(id)
    apply(showing?.id ?? 'off', id)
  }

  const cancelSeek = () => {
    pendingSeek.current = null
    setScrubbing(null)
    onHoldControls?.(false)
  }

  return (
    <div className="flex flex-col gap-1.5 bg-gradient-to-t from-black/85 to-transparent px-4 pt-8 pb-3">
      <div className="relative">
        {hover !== null && seekable && (
          <div
            className="border-line bg-elevated text-ink pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-md border px-1.5 py-0.5 font-mono text-xs"
            style={{ left: `calc(${THUMB_SIZE / 2}px + ${hover} * (100% - ${THUMB_SIZE}px))` }}
            aria-hidden="true"
          >
            {formatTime(hover * state.duration)}
          </div>
        )}
        <input
          type="range"
          min={0}
          max={seekable ? state.duration : 1}
          step={0.1}
          value={seekable ? position : 0}
          disabled={!seekable}
          aria-label="Seek"
          className="control-range w-full"
          style={trackBackground(played, buffered)}
          onPointerDown={startSeek}
          onChange={moveSeek}
          onPointerUp={commitSeek}
          onPointerCancel={cancelSeek}
          onKeyUp={commitSeek}
          onBlur={commitSeek}
          onPointerMove={trackHover}
          onPointerLeave={() => setHover(null)}
        />
      </div>

      <div className="text-ink flex items-center gap-2">
        <button
          type="button"
          onClick={() => (state.playing ? player.pause() : player.play()?.catch(() => {}))}
          className={iconButtonClass}
          aria-label={state.playing ? 'Pause' : 'Play'}
          title={state.playing ? 'Pause (space)' : 'Play (space)'}
        >
          {state.playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
        </button>

        <button
          type="button"
          onClick={onPrevious}
          disabled={!hasPrevious}
          className={iconButtonClass}
          aria-label="Previous item"
          title="Previous item (p)"
        >
          <PrevIcon />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          className={iconButtonClass}
          aria-label="Next item"
          title="Next item (n)"
        >
          <NextIcon />
        </button>

        <span className="text-ink-muted ml-1 font-mono text-xs">
          {isLive
            ? 'Live'
            : `${formatTime(seekable ? position : NaN)} / ${formatTime(state.duration || NaN)}`}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => player.muted(!state.muted)}
              className={iconButtonClass}
              aria-label={state.muted ? 'Unmute' : 'Mute'}
              title={state.muted ? 'Unmute (m)' : 'Mute (m)'}
            >
              {state.muted || state.volume === 0 ? <VolumeMutedIcon /> : <VolumeIcon />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={state.muted ? 0 : state.volume}
              aria-label="Volume"
              className="control-range w-20"
              style={trackBackground((state.muted ? 0 : state.volume) * 100, 0)}
              onChange={(event) => {
                const volume = Number(event.target.value)
                player.volume(volume)
                player.muted(volume === 0)
              }}
            />
          </div>

          <select
            value={state.rate}
            onChange={(event) => onRateChange(Number(event.target.value))}
            aria-label="Speed"
            title="Playback speed (, and .)"
            className={selectClass}
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>

          {streams.length > 1 && (
            <div className="relative flex items-center">
              {sourcing && (
                <div className="border-line bg-panel/95 absolute right-0 bottom-full mb-2 flex max-h-72 w-72 flex-col gap-1 overflow-y-auto rounded-md border p-2 backdrop-blur-sm">
                  {streams.map((entry) => (
                    <button
                      key={entry.url}
                      type="button"
                      onClick={() => {
                        onChooseStream?.(entry)
                        setSourcing(false)
                        onHoldControls?.(false)
                      }}
                      className={`flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition ${
                        entry.url === currentStream
                          ? 'border-primary text-primary'
                          : 'border-line text-ink hover:bg-elevated'
                      }`}
                    >
                      <span className="w-full truncate text-sm">{entry.name || 'Stream'}</span>
                      {entry.description && (
                        <span className="text-ink-faint w-full text-xs whitespace-pre-line">
                          {entry.description}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  const next = !sourcing
                  setSourcing(next)
                  // The bar fades on idle; an open menu must outlast that.
                  onHoldControls?.(next)
                }}
                className={`${iconButtonClass} ${sourcing ? 'text-primary' : ''}`}
                aria-label="Stream source"
                aria-expanded={sourcing}
                title="Stream source"
              >
                <LayersIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {tracks.length > 0 && (
            <div className="relative flex items-center gap-1">
              {tuning && (
                <div className="border-line bg-panel/95 absolute right-0 bottom-full mb-2 flex w-64 flex-col gap-3 rounded-md border p-3 backdrop-blur-sm">
                  {tracks.length > 1 && (
                    <div>
                      <label className={labelClass} htmlFor="subtitle-second">
                        Second subtitles
                      </label>
                      <select
                        id="subtitle-second"
                        className={selectClass}
                        value={secondId}
                        onChange={(event) => chooseSecond(event.target.value)}
                      >
                        <option value="off">None</option>
                        {tracks
                          .filter((entry) => entry.id !== showing?.id)
                          .map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.label}
                            </option>
                          ))}
                      </select>
                      <p className="text-ink-faint mt-1 text-xs">Shown above the first.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass} htmlFor="subtitle-scale">
                        Size
                      </label>
                      <select
                        id="subtitle-scale"
                        className={selectClass}
                        value={subtitleSettings?.subtitleSize ?? 1}
                        onChange={(event) =>
                          onSubtitleSettings?.({ subtitleSize: Number(event.target.value) })
                        }
                      >
                        {SUBTITLE_SIZES.map((size) => (
                          <option key={size.value} value={size.value}>
                            {size.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={labelClass} htmlFor="subtitle-position">
                        Position
                      </label>
                      <select
                        id="subtitle-position"
                        className={selectClass}
                        value={subtitleSettings?.subtitlePosition ?? 4.5}
                        onChange={(event) =>
                          onSubtitleSettings?.({ subtitlePosition: Number(event.target.value) })
                        }
                      >
                        {SUBTITLE_POSITIONS.map((spot) => (
                          <option key={spot.value} value={spot.value}>
                            {spot.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <span className={labelClass}>Timing</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => nudge(-TIMING_STEP)}
                        className={iconButtonClass}
                        aria-label="Show subtitles earlier"
                        title="Show subtitles earlier"
                      >
                        <MinusIcon className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-ink min-w-14 text-center font-mono text-xs">
                        {offset > 0 ? '+' : ''}
                        {offset.toFixed(2)}s
                      </span>
                      <button
                        type="button"
                        onClick={() => nudge(TIMING_STEP)}
                        className={iconButtonClass}
                        aria-label="Show subtitles later"
                        title="Show subtitles later"
                      >
                        <PlusIcon className="h-3.5 w-3.5" />
                      </button>
                      {offset !== 0 && (
                        <button
                          type="button"
                          onClick={() => setOffset(0)}
                          className={`${linkButtonClass} ml-auto`}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  <label className={checkboxRowClass}>
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={subtitleSettings?.subtitleBackground ?? true}
                      onChange={(event) =>
                        onSubtitleSettings?.({ subtitleBackground: event.target.checked })
                      }
                    />
                    Shaded box
                  </label>

                  <p className="text-ink-faint text-xs">
                    Size, position and the box apply to every movie.
                  </p>
                </div>
              )}

              <select
                value={showing?.id ?? 'off'}
                onChange={(event) => chooseTrack(event.target.value)}
                aria-label="Subtitles"
                title="Subtitles (c)"
                className={selectClass}
              >
                <option value="off">Subtitles off</option>
                {tracks.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  const next = !tuning
                  setTuning(next)
                  // The bar fades on idle; an open popover must outlast that.
                  onHoldControls?.(next)
                }}
                className={`${iconButtonClass} ${tuning ? 'text-primary' : ''}`}
                aria-label="Subtitle appearance"
                aria-expanded={tuning}
                title="Subtitle appearance"
              >
                <SettingsIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {levels.length > 1 && (
            <select
              value={level}
              onChange={onLevelChange}
              aria-label="Quality"
              title="Quality"
              className={selectClass}
            >
              <option value="auto">Auto</option>
              {levels.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={onToggleFullscreen}
            className={iconButtonClass}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={fullscreen ? 'Exit fullscreen (f)' : 'Fullscreen (f)'}
          >
            {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </button>
        </div>
      </div>
    </div>
  )
}
