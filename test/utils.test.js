import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { fillTemplate, readPath } from '@/utils/jsonPath'
import { labelFor, readSubtitles, toVtt } from '@/utils/subtitles'
import { findPayloadStart, stripDecoyPrefix, PNG_SIGNATURE } from '@/utils/segments'
import { formatTime } from '@/utils/time'
import { manifestMime, isManifestUrl, normalizeReferer, normalizeSource } from '@/utils/url'

describe('readPath', () => {
  const doc = { data: { play: [{ list: [{ name: 'One' }] }], zero: 0, nothing: null } }

  it('walks objects and [n] indices', () =>
    assert.equal(readPath(doc, 'data.play[0].list[0].name'), 'One'))
  it('keeps a falsy value', () => assert.equal(readPath(doc, 'data.zero'), 0))
  it('reads a bare index', () => assert.equal(readPath([9, 8], '[1]'), 8))

  // A wrong path runs inside a fetch handler, where a throw loses the search.
  for (const [name, path] of [
    ['a missing segment', 'data.nope.deep'],
    ['a path through null', 'data.nothing.deep'],
    ['an empty path', ''],
    ['an object where an array was expected', 'data.play.name'],
  ]) {
    it(`is undefined for ${name}`, () => assert.equal(readPath(doc, path), undefined))
  }

  it('never throws on junk', () => assert.equal(readPath(undefined, 'a.b[0].c'), undefined))
})

describe('fillTemplate', () => {
  it('percent-encodes {query}, which a person typed', () =>
    assert.equal(
      fillTemplate('https://s/?q={query}', { query: 'a b&c' }),
      'https://s/?q=a%20b%26c',
    ))
  it('leaves other values raw, being path fragments the API returned', () =>
    assert.equal(fillTemplate('https://s/{path}.m3u8', { path: 'a/b' }), 'https://s/a/b.m3u8'))
  it('fills a placeholder used twice', () =>
    assert.equal(fillTemplate('{id}-{id}', { id: 7 }), '7-7'))
  it('leaves an unknown placeholder visible rather than blanking it', () =>
    assert.equal(fillTemplate('https://s/{nope}', {}), 'https://s/{nope}'))
})

describe('toVtt', () => {
  const SRT = '1\n00:00:01,000 --> 00:00:04,000\nHello\n\n2\n0:00:05,500 --> 0:00:07,250\nWorld'

  it('adds the header and converts the decimal separator', () => {
    const out = toVtt(SRT)
    assert.ok(out.startsWith('WEBVTT\n\n'))
    assert.ok(out.includes('00:00:01.000 --> 00:00:04.000'))
    assert.ok(out.includes('0:00:05.500 --> 0:00:07.250'), 'single-digit hours convert too')
    assert.ok(out.includes('Hello') && out.includes('World'))
  })

  it('passes WebVTT through untouched', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nAlready fine'
    assert.equal(toVtt(vtt), vtt)
    assert.equal(toVtt(`\uFEFF${vtt}`), vtt, 'a BOM would stop WEBVTT being recognised')
  })

  for (const [name, input] of [
    ['empty', ''],
    ['null', null],
    ['whitespace', '  \n '],
  ]) {
    it(`yields nothing for ${name} input`, () => assert.equal(toVtt(input), ''))
  }
})

describe('labelFor', () => {
  it('names a track from its file', () =>
    assert.equal(labelFor('https://x.test/subs/English.vtt', 0), 'English'))
  it('decodes percent-escapes', () =>
    assert.equal(labelFor('https://x.test/Portugu%C3%AAs.vtt', 0), 'Português'))
  it('falls back when there is no file name', () =>
    assert.equal(labelFor('https://x.test/', 3), 'Subtitles 4'))
  it('falls back on junk', () => assert.equal(labelFor('not a url', 0), 'Subtitles 1'))
})

describe('readSubtitles', () => {
  it('accepts a bare URL, a list, and objects alike', () => {
    const read = readSubtitles(
      [
        'https://x.test/en.vtt',
        { label: ' Spanish ', src: 'https://x.test/es.srt', lang: 'es' },
        { url: 'https://x.test/fr.vtt' },
      ],
      normalizeSource,
    )
    assert.equal(read.length, 3)
    assert.equal(read[0].label, 'en', 'labelled from the file when unnamed')
    assert.equal(read[1].label, 'Spanish', 'an explicit label wins and is trimmed')
    assert.equal(read[1].lang, 'es')
    assert.ok(!('lang' in read[0]), 'lang is omitted when not given')
    assert.equal(read[2].src, 'https://x.test/fr.vtt', '`url` works as an alias')
  })

  it('drops anything without a usable URL', () => {
    const read = readSubtitles(['javascript:alert(1)', { src: '' }, null], normalizeSource)
    assert.equal(read.length, 0)
  })

  it('reads a single string', () =>
    assert.equal(readSubtitles('https://x.test/en.vtt', normalizeSource).length, 1))
  it('is empty for nothing', () =>
    assert.equal(readSubtitles(undefined, normalizeSource).length, 0))
})

describe('segments', () => {
  const ts = (length) => {
    const bytes = new Uint8Array(length)
    for (let at = 0; at < length; at += 188) bytes[at] = 0x47
    return bytes
  }

  it('finds a transport stream by three sync bytes a packet apart', () =>
    assert.equal(findPayloadStart(ts(188 * 3)), 0))

  it('strips a PNG header from a disguised segment', () => {
    const payload = ts(188 * 3)
    const wrapped = new Uint8Array(PNG_SIGNATURE.length + 40 + payload.length)
    wrapped.set(PNG_SIGNATURE, 0)
    wrapped.set(payload, PNG_SIGNATURE.length + 40)

    const out = new Uint8Array(stripDecoyPrefix(wrapped.buffer))
    assert.equal(out.byteLength, payload.length)
    assert.equal(out[0], 0x47)
  })

  it('returns a plain segment unchanged, by identity', () => {
    const buffer = ts(188 * 3).buffer
    assert.equal(stripDecoyPrefix(buffer), buffer)
  })

  it('returns the original when a PNG hides no media', () => {
    const buffer = new Uint8Array([...PNG_SIGNATURE, ...new Array(64).fill(0)]).buffer
    assert.equal(stripDecoyPrefix(buffer), buffer)
  })
})

describe('url helpers', () => {
  it('picks the manifest type from the path, not the query', () => {
    assert.equal(manifestMime('https://x.test/a.mpd?t=1'), 'application/dash+xml')
    assert.equal(manifestMime('https://x.test/a.m3u8?t=1'), 'application/x-mpegURL')
    assert.equal(manifestMime('https://x.test/no-extension'), 'application/x-mpegURL')
  })

  it('recognises a manifest URL by its path', () => {
    assert.ok(isManifestUrl('https://x.test/a/index.m3u8?token=abc'))
    assert.ok(isManifestUrl('https://x.test/a/index.mpd'))
    assert.ok(!isManifestUrl('https://x.test/watch?v=index.m3u8'))
  })

  it('rejects anything that is not http(s)', () => {
    assert.equal(normalizeSource('javascript:alert(1)'), null)
    assert.equal(normalizeSource('  '), null)
    assert.equal(normalizeSource('https://x.test/a'), 'https://x.test/a')
  })

  it('accepts a bare domain as a Referer', () =>
    assert.equal(normalizeReferer('example.com'), 'https://example.com/'))
})

describe('formatTime', () => {
  const cases = [
    [0, '0:00'],
    [65, '1:05'],
    [3723, '1:02:03'],
    [Infinity, '--:--'],
    [NaN, '--:--'],
    [-1, '--:--'],
  ]
  for (const [seconds, expected] of cases) {
    it(`renders ${seconds} as ${expected}`, () => assert.equal(formatTime(seconds), expected))
  }
})
