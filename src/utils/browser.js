import api from './api'

export function isFirefox() {
  return navigator.userAgent.includes('Firefox')
}

export const ALL_URLS = '<all_urls>'

/**
 * Firefox treats manifest host permissions as opt-in, so playback can fail
 * until the user grants them. On Chrome these calls resolve to `true`.
 */
export async function hasHostPermission() {
  try {
    return await api.permissions.contains({ origins: [ALL_URLS] })
  } catch {
    return true
  }
}

/** Must be called from a user gesture (a click in the popup or options page). */
export async function requestHostPermission() {
  try {
    return await api.permissions.request({ origins: [ALL_URLS] })
  } catch {
    return false
  }
}
