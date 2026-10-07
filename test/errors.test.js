import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { describePlaybackError } from '@/utils/errors'

const refererHint = /Referer/

describe('describePlaybackError', () => {
  it('says offline above whatever else is failing', () => {
    const shown = describePlaybackError({ code: 2, status: 403 }, { online: false })
    assert.equal(shown.message, 'You are offline.')
    assert.doesNotMatch(shown.hint, refererHint)
  })

  it('shows offline even before anything has failed', () => {
    assert.equal(describePlaybackError('', { online: false }).message, 'You are offline.')
  })

  it('offers the Referer only when the server refused', () => {
    for (const status of [401, 403]) {
      const shown = describePlaybackError({ code: 2, status })
      assert.match(shown.message, new RegExp(String(status)))
      assert.match(shown.hint, refererHint)
    }
    for (const error of [
      { code: 2, status: 404 },
      { code: 4, status: 503 },
      { code: 2, status: 0 },
      { code: 3 },
      'The stream ended early.',
    ]) {
      assert.doesNotMatch(describePlaybackError(error).hint, refererHint, JSON.stringify(error))
    }
  })

  it('names a gone link, a failing server and an unreachable host', () => {
    assert.match(describePlaybackError({ code: 2, status: 404 }).message, /no longer there/)
    // VHS reports a 5xx as code 4; the status is what tells it apart from a bad format.
    assert.match(describePlaybackError({ code: 4, status: 502 }).message, /server failed \(502\)/)
    assert.match(describePlaybackError({ code: 2, status: 0 }).message, /could not be reached/)
  })

  it('tells a decode failure from an unsupported format', () => {
    assert.match(describePlaybackError({ code: 3 }).message, /decoded/)
    assert.match(describePlaybackError({ code: 4 }).message, /format/)
  })

  it('passes a message of our own through as written', () => {
    assert.deepEqual(describePlaybackError('Addon found no stream for this episode.'), {
      message: 'Addon found no stream for this episode.',
      hint: '',
    })
  })

  it('has nothing to say when nothing is wrong', () => {
    assert.equal(describePlaybackError(''), null)
  })
})
