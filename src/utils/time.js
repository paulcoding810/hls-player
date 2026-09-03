/** `1:05` / `1:02:03`; live or unknown durations render as `--:--`. */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'

  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const padded = String(secs).padStart(2, '0')

  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${padded}` : `${minutes}:${padded}`
}
