/**
 * What the player banner says. Each failure gets the hint that fits it, not
 * one hint for all: a Referer only helps when the server refused the request.
 * `error` is a message of our own, or what video.js reports — a MediaError
 * that keeps VHS's request `status` and its `code`.
 */
export function describePlaybackError(error, { online = true } = {}) {
  // Offline explains everything else that is failing, so it is said alone.
  if (!online) {
    return {
      message: 'You are offline.',
      hint: 'Playback picks up where it stopped once you reconnect.',
    }
  }
  if (!error) return null
  if (typeof error === 'string') return { message: error, hint: '' }

  const status = Number(error.status)
  if (status === 401 || status === 403) {
    return {
      message: `The stream refused the request (${status}).`,
      hint: 'Streams that reject the request usually need a matching Referer — set one on the movie.',
    }
  }
  if (status === 404 || status === 410) {
    return {
      message: `The stream is no longer there (${status}).`,
      hint: 'Links from addons expire; try another stream, or play the episode again for a fresh one.',
    }
  }
  if (status >= 500) {
    return {
      message: `The stream's server failed (${status}).`,
      hint: 'Try again later, or another stream.',
    }
  }
  if (status >= 400) {
    return { message: `The stream answered ${status}.`, hint: '' }
  }

  // A request that never got an answer reports status 0.
  if (error.code === 2 || status === 0) {
    return {
      message: 'The stream could not be reached.',
      hint: 'Check the connection, or try another stream.',
    }
  }
  if (error.code === 3) {
    return { message: 'The video could not be decoded.', hint: 'Try another stream or quality.' }
  }
  if (error.code === 4) {
    return {
      message: 'This stream is in a format the player cannot open.',
      hint: 'Try another stream.',
    }
  }
  return { message: error.message || 'Playback failed.', hint: '' }
}
