import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { compilePattern, stripAdSegments } from '@/utils/playlist'

const AD = compilePattern('^/v7/[0-9a-f]+/segment_\\d+\\.ts$')

/** A break fenced between two discontinuities, as SSAI actually delivers it. */
const WITH_ADS = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:3.0,
kQU7g4Qk.ts
#EXTINF:3.0,
mR2xP0aB.ts
#EXT-X-DISCONTINUITY
#EXT-X-KEY:METHOD=NONE
#EXTINF:3.72,
/v7/d61a03b1/segment_0001.ts
#EXTINF:0.16,
/v7/d61a03b1/segment_0002.ts
#EXT-X-DISCONTINUITY
#EXTINF:3.0,
zW9hT4nC.ts
#EXT-X-ENDLIST`

describe('stripAdSegments', () => {
  it('cuts the ad block and keeps the content', () => {
    const { text, removed, total } = stripAdSegments(WITH_ADS, AD)
    assert.equal(removed, 2)
    assert.equal(total, 5)
    assert.ok(!text.includes('/v7/'))
    for (const kept of ['kQU7g4Qk.ts', 'mR2xP0aB.ts', 'zW9hT4nC.ts']) assert.ok(text.includes(kept))
  })

  it('keeps EXT-X-KEY even when it sits inside the ad block', () => {
    // A key applies to everything after it, so dropping it would break the
    // next real segment rather than just tidying the output.
    assert.ok(stripAdSegments(WITH_ADS, AD).text.includes('#EXT-X-KEY:METHOD=NONE'))
  })

  it('collapses the fencing discontinuities to the one at the cut', () => {
    const { text } = stripAdSegments(WITH_ADS, AD)
    assert.equal(text.match(/#EXT-X-DISCONTINUITY/g).length, 1)
    assert.ok(text.indexOf('mR2xP0aB') < text.indexOf('#EXT-X-DISCONTINUITY'))
    assert.ok(text.indexOf('#EXT-X-DISCONTINUITY') < text.indexOf('zW9hT4nC'))
  })

  it('preserves the header and the endlist', () => {
    const { text } = stripAdSegments(WITH_ADS, AD)
    assert.ok(text.startsWith('#EXTM3U'))
    assert.ok(text.trim().endsWith('#EXT-X-ENDLIST'))
    assert.ok(text.includes('#EXT-X-TARGETDURATION:6'))
  })

  it('drops a segment-scoped tag with its segment', () => {
    const tagged = `#EXTM3U
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-PROGRAM-DATE-TIME:2026-01-01T00:00:00Z
#EXTINF:3.0,
/v7/aa/segment_0001.ts
#EXTINF:4.0,
keep.ts
#EXT-X-ENDLIST`
    assert.ok(!stripAdSegments(tagged, AD).text.includes('PROGRAM-DATE-TIME'))
  })

  describe('leaves the playlist alone when', () => {
    const cases = {
      'there is no pattern': [WITH_ADS, null],
      'nothing matches': [WITH_ADS, /nothing-here/],
      'every segment matches': [WITH_ADS, /\.ts$/],
      'the playlist is live': [
        WITH_ADS.replace('#EXT-X-PLAYLIST-TYPE:VOD\n', '').replace('\n#EXT-X-ENDLIST', ''),
        AD,
      ],
      'it is a main playlist': ['#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nindex.m3u8', AD],
    }

    for (const [name, [text, pattern]] of Object.entries(cases)) {
      it(name, () => {
        const result = stripAdSegments(text, pattern)
        assert.equal(result.text, text)
        assert.equal(result.removed, 0)
      })
    }
  })
})

describe('compilePattern', () => {
  it('compiles a usable pattern', () => assert.ok(compilePattern('^ad_\\d+$') instanceof RegExp))
  it('returns null for blank input', () => assert.equal(compilePattern(''), null))
  it('returns null rather than throwing on a half-typed pattern', () =>
    assert.equal(compilePattern('[unclosed'), null))
})
