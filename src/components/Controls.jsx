import { useEffect, useRef, useState } from 'react'

import {
  FullscreenExitIcon,
  FullscreenIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  VolumeIcon,
  VolumeMutedIcon,
} from './icons'
import { iconButtonClass, selectClass } from './ui'
import { PLAYBACK_RATES } from '@/helper/constants'
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
  onSeekingChange,
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

  useEffect(() => {
    if (!player) return
    const sync = () => setState(read(player))
    PLAYER_EVENTS.forEach((event) => player.on(event, sync))
    sync()
    return () => PLAYER_EVENTS.forEach((event) => player.off(event, sync))
  }, [player])

  if (!player) return null

  const isLive = state.duration === Infinity
  const seekable = Number.isFinite(state.duration) && state.duration > 0
  const position = scrubbing ?? state.currentTime
  const played = seekable ? (position / state.duration) * 100 : 0
  const buffered = seekable ? (state.buffered / state.duration) * 100 : 0

  const startSeek = () => {
    pendingSeek.current = state.currentTime
    onSeekingChange?.(true)
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
    onSeekingChange?.(false)
  }

  const cancelSeek = () => {
    pendingSeek.current = null
    setScrubbing(null)
    onSeekingChange?.(false)
  }

  return (
    <div className="flex flex-col gap-1.5 bg-gradient-to-t from-black/85 to-transparent px-4 pt-8 pb-3">
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
      />

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
            title="Playback speed"
            className={selectClass}
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>

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
