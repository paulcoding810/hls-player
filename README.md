[![Badge Commits]][Commit Rate]
[![Badge Issues]][Issues]
[![Badge License]][License]
[![Badge Mozilla]][Mozilla]
[![Badge Chrome]][Chrome]

---

<h1 align="center">
<sub>
<img src="public/img/logo-48.png" height="38" width="38">
</sub>
hls-player
</h1>

---

<p align="center">
<a href="https://addons.mozilla.org/en-US/firefox/addon/hls-player/"><img src="https://user-images.githubusercontent.com/585534/107280546-7b9b2a00-6a26-11eb-8f9f-f95932f4bfec.png" alt="Get hls-player for Firefox"></a>
<a href="https://chromewebstore.google.com/detail/hls-player/chome-id"><img src="https://user-images.githubusercontent.com/585534/107280622-91a8ea80-6a26-11eb-8d07-77c548b28665.png" alt="Get hls-player for Chromium"></a>
</p>

---

[Mozilla]: https://addons.mozilla.org/en-US/firefox/addon/hls-player/
[Chrome]: https://chromewebstore.google.com/detail/hls-player/chome-id
[License]: https://raw.githubusercontent.com/paulcoding810/hls-player/refs/heads/main/LICENSE
[Commit Rate]: https://github.com/paulcoding810/hls-player/commits/main
[Issues]: https://github.com/paulcoding810/hls-player/issues
[Badge Commits]: https://img.shields.io/github/commit-activity/m/paulcoding810/hls-player?label=Commits
[Badge Mozilla]: https://img.shields.io/amo/v/hls-player
[Badge Chrome]: https://img.shields.io/chrome-web-store/v/chome-id
[Badge License]: https://img.shields.io/badge/License-MIT-yellow.svg
[Badge Issues]: https://img.shields.io/github/issues/paulcoding810/hls-player/issues

# hls-player

> A library of HLS (`.m3u8`) and DASH (`.mpd`) movies and series, played with a custom `Referer`.

Clicking the toolbar icon opens the player — there is no popup. It picks up the movie and episode
you watched last; with nothing to continue it opens the **library** (`gallery.html`), a gallery of
the movies you have added. **Library** in the player header goes back to it, and playing a movie
from there returns to the player. Streams play through [video.js](https://videojs.com/) — a URL ending in
`.mpd` is played as DASH, anything else as HLS — and the `Referer` override is scoped to the player
tab only, so the rest of your browsing is untouched. DRM (Widevine, PlayReady) is not supported, so
DASH streams have to be clear. The `User-Agent` is left
at the browser default.

## Library

A **movie** is a title, an optional poster, a list of **episodes**, and the config those episodes
play with. Add one with **Add movie**, pasting episode URLs one per line:

```
https://example.com/ep1.m3u8
Episode 2 | https://example.com/ep2.m3u8
```

A line may be a bare URL or `Title | URL`; untitled episodes are numbered. Cards show the episode
count and where you left off, and **Resume** opens that episode. The pencil reopens the same form
with everything filled in — the episode box holds the saved list as `Title | URL` lines, so
episodes are renamed, corrected, reordered or removed by editing the text. An episode keeps its
watched position as long as its URL stays the same. The `Referer` of a new movie is prefilled with
the one you used last.

Each movie carries its own `Referer`, _skip intro_ and _skip outro_. Leave a field blank and it
inherits the global default shown in it, so a series that needs a particular `Referer` or has a
40-second intro is configured once and every episode follows. The same form is reachable while watching —
**Episodes → Edit** opens it in the player's side panel — and **Library** in the player header
comes back to this page.

## Controls

The control bar is the extension's own — video.js supplies the playback engine, not the UI. It
carries play/pause, previous/next episode, elapsed and total time (a live stream shows **Live** and no
seek bar), a seek bar with the buffered range behind the played one, volume, speed, the quality
menu and fullscreen. It fades out 2.5s after the pointer goes idle during playback and comes back
on the first move.

| Key           | Action                  |
| ------------- | ----------------------- |
| `space` / `k` | play or pause           |
| `←` / `→`     | seek 5s                 |
| `↑` / `↓`     | volume                  |
| `m`           | mute                    |
| `f`           | fullscreen              |
| `p` / `n`     | previous / next episode |

Clicking the video toggles playback, double-clicking toggles fullscreen.

## Resume

The playback position of each episode is stored every 5 seconds (and when you pause), keyed by
URL. Opening an episode that has a stored position asks whether to continue from it before
playback starts, so the video never begins at zero and jumps:

- **Resume** seeks to the stored position.
- **Start over** — also what Escape does — discards it and starts from the beginning.

Positions inside the first 15 seconds or the last 30 are not worth keeping, so they are dropped,
as is the entry for an episode that plays to the end. Live streams are not tracked. The store keeps
the 200 most recent entries.

Separately, each movie remembers which episode it was on, and the library remembers which movie
was played last — that pair is what the player opens with.

## Configuration

Per-movie config is edited in the movie form on the library page and wins over the global
defaults, which live on the options page:

| Setting          | Effect                                                | Per movie |
| ---------------- | ----------------------------------------------------- | --------- |
| Referer          | sent with every request for that stream               | yes       |
| Skip intro       | length of the intro window at the start of an episode | yes       |
| Skip outro       | length of the outro window before the end             | yes       |
| Auto skip        | jump those windows without asking, on by default      | yes       |
| Speed            | playback rate applied to every episode                | no        |
| Autoplay / muted | how playback begins (browsers block unmuted autoplay) | no        |

With **Auto skip** on (the default), _skip intro_ at 40 starts each episode at 0:40 and _skip
outro_ at 30 moves to the next episode 30 seconds before the end. Turn it off and the same windows
become buttons: **Skip intro** sits above the controls for the first 40 seconds, **Skip outro** for
the last 30, and neither acts until clicked.

A movie can override it — its **Auto skip** is `Default`, `On` or `Off`, so a series whose intro
you would rather see can offer the button while everything else jumps automatically.

Either way the windows are ignored for live streams, where the duration is not finite, and the
outro is neither jumped nor offered on the last episode — there is nothing to skip to, so it plays
out and reaching the end advances as usual.

## Segments disguised as images

Some hosts serve segments as PNGs to dodge filters — a small valid image with the real MPEG-TS or
fMP4 payload concatenated after it — which the transmuxer rejects. Those responses are detected by
their PNG signature and unwrapped before playback sees them, so such streams play without any
configuration. The console notes the first segment it unwraps. Segments merely _named_ `.png` with
ordinary contents never needed anything: playback goes by bytes, not by extension or MIME type.

## How the Referer override works

`Referer` is a forbidden header for `fetch`/XHR, so it is rewritten at the network layer instead:

| Browser | Mechanism                                                                  |
| ------- | -------------------------------------------------------------------------- |
| Chrome  | a `declarativeNetRequest` session rule scoped to the player tab (`tabIds`) |
| Firefox | a blocking `webRequest.onBeforeSendHeaders` listener filtered by tab id    |

`src/convert.js` swaps the `declarativeNetRequest` permission for `webRequest` +
`webRequestBlocking` when building for Firefox. Rules are removed when the player tab closes.

The extension requests `<all_urls>` host access. Chrome grants it at install time; on Firefox it
is opt-in, so the player and options page offer a button to grant it.

## Installing

1. Check if your `Node.js` version is >= **14**.
2. Run `pnpm` to install the dependencies.

## Developing

```shell
cd hls-player
pnpm dev
```

### Chrome Extension Developer Mode

1. set your Chrome browser 'Developer mode' up
2. click 'Load unpacked', and select `hls-player/build/chrome` folder

### Firefox Extension Developer Mode

1. Build your project firstly by running `pnpm build:firefox`
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`
3. Click on 'Load Temporary Add-on' and select `hls-player/build/firefox` folder

## Packing

```shell
pnpm zip # for chrome
pnpm zip:firefox # for firefox
```

---

Generated by [gen-ext](https://github.com/paulcoding810/gen-ext)
