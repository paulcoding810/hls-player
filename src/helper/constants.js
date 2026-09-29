export const MESSAGE = {
  APPLY_HEADERS: 'APPLY_HEADERS',
  CLEAR_HEADERS: 'CLEAR_HEADERS',
}

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

/** The orders the library grid can be arranged in, in the order they are offered. */
export const SORT_ORDERS = [
  { value: 'watched', label: 'Recently watched' },
  { value: 'added', label: 'Recently added' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'title', label: 'Title' },
]

/** Cue scales offered wherever subtitle size is set. */
export const SUBTITLE_SIZES = [
  { value: 0.75, label: 'Small' },
  { value: 1, label: 'Normal' },
  { value: 1.25, label: 'Large' },
  { value: 1.5, label: 'Larger' },
  { value: 2, label: 'Largest' },
]

/** How far the cues sit above the bottom edge, clear of the control bar. */
export const SUBTITLE_POSITIONS = [
  { value: 1.5, label: 'Low' },
  { value: 4.5, label: 'Normal' },
  { value: 8, label: 'High' },
  { value: 12, label: 'Highest' },
]

export const PLAYER_PATH = 'player.html'

export const GALLERY_PATH = 'gallery.html'
