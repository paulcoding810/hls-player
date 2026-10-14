/** How far into an episode the intro jump is offered, for intros that start at a different point each time. */
export const INTRO_JUMP_WINDOW = 600

/**
 * Where the intro jump lands from `time`, or null when it is not offered: no
 * intro length, past the opening stretch, no real end to stay short of.
 */
export function introJumpTarget(time, duration, introLength, window = INTRO_JUMP_WINDOW) {
  if (!(introLength > 0) || !Number.isFinite(duration) || duration <= 0) return null
  if (time >= window) return null
  const target = time + introLength
  return target < duration ? target : null
}
