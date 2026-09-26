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
<a href="https://addons.mozilla.org/en-US/firefox/addon/mighty-hls-player/"><img src="https://user-images.githubusercontent.com/585534/107280546-7b9b2a00-6a26-11eb-8f9f-f95932f4bfec.png" alt="Get hls-player for Firefox"></a>
<a href="https://chromewebstore.google.com/detail/pnbomekpcabpdagnahhmeonjbglglflj"><img src="https://user-images.githubusercontent.com/585534/107280622-91a8ea80-6a26-11eb-8d07-77c548b28665.png" alt="Get hls-player for Chromium"></a>
</p>

---

[Mozilla]: https://addons.mozilla.org/en-US/firefox/addon/mighty-hls-player/
[Chrome]: https://chromewebstore.google.com/detail/pnbomekpcabpdagnahhmeonjbglglflj
[License]: https://raw.githubusercontent.com/paulcoding810/hls-player/refs/heads/main/LICENSE
[Commit Rate]: https://github.com/paulcoding810/hls-player/commits/main
[Issues]: https://github.com/paulcoding810/hls-player/issues
[Badge Commits]: https://img.shields.io/github/commit-activity/m/paulcoding810/hls-player?label=Commits
[Badge Mozilla]: https://img.shields.io/amo/v/mighty-hls-player
[Badge Chrome]: https://img.shields.io/chrome-web-store/v/pnbomekpcabpdagnahhmeonjbglglflj
[Badge License]: https://img.shields.io/badge/License-MIT-yellow.svg
[Badge Issues]: https://img.shields.io/github/issues/paulcoding810/hls-player/issues

# hls-player

> A library of HLS (`.m3u8`) and DASH (`.mpd`) movies and series, played with a custom `Referer`.

Clicking the toolbar icon opens the **library** (`gallery.html`) — there is no popup. A
**Continue watching** panel sits above the grid with the movie and episode you were last on, how
far in you were, and a button to pick it back up; playing anything from the library opens the
player, and **Library** in the player header comes back. Streams play through [video.js](https://videojs.com/) — a URL ending in
`.mpd` is played as DASH, anything else as HLS — and the `Referer` override is scoped to the player
tab only, so the rest of your browsing is untouched. DRM (Widevine, PlayReady) is not supported, so
DASH streams have to be clear. The `User-Agent` is left
at the browser default.

## Grabbing links

Navigating to a URL whose **path** ends in `.m3u8` or `.mpd` opens it in the player instead of
letting the browser show or download the manifest — paste one in the address bar, or click such a
link on a page. The match is on the path, so `…/index.m3u8?token=abc` counts, while
`…/watch?file=video.m3u8` does not.

A grabbed link plays without entering the library. **Add to library** in the player header keeps it
as a movie named after the file; either way the watch position is stored against the URL, so a link
you keep resumes where the throwaway playback left off. Turn the takeover off with **Open .m3u8 and
.mpd links in the player** on the options page.

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

### Marking a movie watched

The tick on a card records it as finished: its stored positions go, the episode it was left on is
forgotten, and **Continue watching** moves on. The card then reads _Watched_ and its button says
**Play again**, which starts from the first episode. Under **Recently watched** it sorts as though
you had just seen it.

Clicking the tick again removes the mark, and opening the movie in the player removes it too —
watching it again means it is no longer finished. What unmarking cannot do is bring the watch
positions back: clearing them is the point of the action, and it is not undoable.

Without this, a finished movie and one you never started are the same thing as far as the library
is concerned — a position past the last 30 seconds is discarded rather than stored.

### Sorting

With more than one movie the header carries a sort control, remembered across sessions:

| Order                      | Sorted by                                              |
| -------------------------- | ------------------------------------------------------ |
| Recently watched (default) | when it was last opened, or added if it never has been |
| Recently added             | when the movie was added                               |
| Recently updated           | when it was last edited, or added if it never has been |
| Title                      | A–Z                                                    |

A movie you have just added has never been watched, so **Recently watched** falls back to its add
time rather than sinking it to the bottom — a new movie lands at the top and stays there until
something is watched more recently.

Only the display order changes — the library keeps its own order, so nothing is rewritten by
sorting. Movies stored before a given timestamp existed sort as oldest, except that ties still read
newest first.

### Adding a movie as JSON

**Add movie** opens the form, and **Paste JSON instead** swaps it for a textarea. The shape is the
one the library stores, so a movie copied out of an export file pastes in unchanged — its `id`,
`addedAt` and episode ids are ignored and issued fresh:

```json
{
  "title": "Example",
  "referer": "https://example.com/",
  "skipLeading": 40,
  "episodes": [
    "https://example.com/ep1.m3u8",
    { "title": "Episode 2", "src": "https://example.com/ep2.mpd" }
  ]
}
```

Only `title` and `episodes` are required, and an episode may be a bare URL string or an object
(`url` works in place of `src`). Everything else — `poster`, `referer`, `adPattern`, `skipLeading`,
`skipTrailing`, `autoSkip` — is optional and left blank inherits the global default, exactly as the
form does. A bad field is reported by name rather than silently dropped.

## Sources

A **source** describes one site's JSON API so the library can search it directly instead of you
pasting every episode URL. Sources are managed on the options page, and once one is enabled the
library grows a search bar: type a title, pick a result, and its episodes arrive filled in.

A source holds no code. MV3 pins extension pages to `script-src 'self'` with no `unsafe-eval`, so
there is no way to run a parse function you supply — the same rule behind the worker-less video.js
build below. Instead you say _where_ the values are:

```json
{
  "name": "Example",
  "referer": "https://example.com/",
  "adPattern": "^/ads/.+\\.ts$",
  "search": {
    "url": "https://api.example.com/search?q={query}&page={page}",
    "list": "data.items",
    "fields": { "id": "vod_id", "title": "vod_name", "poster": "vod_pic" }
  },
  "details": {
    "url": "https://api.example.com/detail/{id}",
    "episodes": "data.play[0].list",
    "fields": { "title": "name", "src": "https://cdn.example.com/{path}.m3u8" }
  }
}
```

- **Paths** are dots and `[0]` indices — `data.play[0].list`. A path that matches nothing yields
  nothing rather than an error, so a wrong one shows up as an empty result, not a crash.
- **`{page}`** in the search URL counts from 1 and drives the **More** button under each group
  of results. It is optional: leave it out and you get one page.
- **Templates** substitute `{name}` from the entry being read. `{query}` is percent-encoded
  because it is free text you typed; every other placeholder goes in raw, since those are path
  fragments the API returned. A field whose template still has an unfilled placeholder is dropped
  rather than half-built.
- A field is treated as a template if it contains `{`, and as a path otherwise — so `src` can be
  either `url` (a path to a ready-made URL) or the template above.

`referer` and `adPattern` describe the site rather than its API, so they are handed to every movie
added from the source and take effect during playback — see
[Server-side ad insertion](#server-side-ad-insertion) for what the pattern matches. They are copied
at the moment a movie is added, not looked up later: changing them on the source updates what new
movies inherit, and leaves movies already in the library alone, the same way editing a movie is
never undone by a refresh.

**Test** in the source form runs a real search for "test" and shows what it extracted. Getting the
paths right against someone else's JSON is the fiddly part; this is how you do it without guessing.

Searching queries every enabled source at once and groups the results. A source that fails shows
its error in its own group instead of taking the search down. A result already in the library
offers **Watch** instead of **Add**.

Each result also has a **copy** button, which fetches its episodes and puts the movie on the
clipboard in the same shape **Paste JSON instead** reads back — so a title can be shared, kept, or
tweaked by hand before adding. Blank fields are left out rather than written empty, since absent
means "inherit the global default" in that shape.

**More** under a group fetches that source's next page and appends it — each source pages
independently, since one may have more to give than another. Results already shown are not
repeated, which is also what stops a search URL with no `{page}` in it: the same page comes back,
nothing is new, and the button retires instead of offering itself for ever.

### Refreshing

A movie added from a source remembers where it came from and carries a refresh button. It
re-reads the details endpoint and updates **the episode list only** — your title, poster, Referer,
skip windows and ad pattern are yours and are never overwritten. Episodes whose URL is unchanged
keep their identity, so watch positions and "last episode" survive a refresh.

### Limits

- **JSON only.** A site that returns HTML cannot be scraped; that needs exactly the code execution
  MV3 forbids.
- **No `Referer` on the API call.** `Referer` is a forbidden header for `fetch`, just as it is for
  the player's XHR — which is why playback uses declarativeNetRequest instead. A source's
  `Referer` is given to the movies it adds, for playback. An API that rejects requests without one
  will not work.
- Firefox needs the host permission granted; the options page prompts for it.

## Player URLs

The player takes what to play from its query string, so a page can be bookmarked, reloaded or
shared between windows:

| URL                                   | Plays                               |
| ------------------------------------- | ----------------------------------- |
| `player.html?movie=<id>&episode=<id>` | that episode                        |
| `player.html?movie=<id>&episode=3`    | the third episode of that movie     |
| `player.html?movie=<id>`              | where that movie was left off       |
| `player.html?src=<url>`               | a URL directly, outside the library |
| `player.html`                         | the last movie and episode played   |

Switching episode rewrites the URL in place, so a reload stays on the episode you are watching.
Anything that does not resolve — an unknown id, a deleted movie — falls back to the last played
episode, and then to the library.

## Controls

The control bar is the extension's own — video.js supplies the playback engine, not the UI. It
carries play/pause, previous/next episode, elapsed and total time (a live stream shows **Live** and no
seek bar), a seek bar with the buffered range behind the played one, volume, speed, subtitles, the
quality menu and fullscreen. It fades out 2.5s after the pointer goes idle during playback and comes back
on the first move.

| Key           | Action                                    |
| ------------- | ----------------------------------------- |
| `space` / `k` | play or pause                             |
| `←` / `→`     | seek 5s                                   |
| `↑` / `↓`     | volume                                    |
| `m`           | mute                                      |
| `c`           | subtitles on / off                        |
| `,` / `.`     | slower / faster                           |
| `f`           | fullscreen                                |
| `p` / `n`     | previous / next episode                   |
| `esc`         | close the panel, else back to the library |

Clicking the video toggles playback, double-clicking toggles fullscreen.

### Subtitles

A stream that carries subtitle or caption tracks — an HLS `SUBTITLES` group, or in-band 608/708
captions — gets a menu in the control bar listing them, plus **Subtitles off**. `c` turns the first
track on and off without going to the menu. The menu only appears when the stream actually has a
track, and the list is watched rather than read once, since tracks arrive after the manifest is
parsed and a rendition change can add or drop them.

Subtitles are lifted clear of the control bar by a fixed amount. video.js drops them almost to the
bottom edge when its own skin is disabled, which is where our bar sits; lifting them only while the
bar is visible would make them jump every time it faded.

Subtitle **files** are not supported — only what the stream itself carries.

Speed steps through the same list the menu offers — 0.5× to 2× — rather than by a fixed amount,
so the keys and the menu can never disagree about which speeds exist. `<` and `>` work too, being
the same keys with shift. The chosen speed is remembered globally and carries to the next episode.

`esc` unwinds one layer at a time: it closes the episodes panel if that is open, otherwise it
stores the position and returns to the library. In fullscreen it is left to the browser, which is
already using it to leave fullscreen, and while the resume prompt is up it belongs to the dialog.

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

With **Auto skip** on (the default), _skip intro_ at 40 starts each episode at 0:40, and _skip
outro_ at 30 offers to move on 30 seconds before the end. The outro is not taken at once: a
**Next episode in 5** counter appears over the video, so there is time to press **Stay** and watch
the credits. The count holds while playback is paused and is dropped entirely if you seek back out
of the outro, so rewinding never pulls you forward. Turn Auto skip off and the same windows
become buttons: **Skip intro** sits above the controls for the first 40 seconds, **Skip outro** for
the last 30, and neither acts until clicked.

A movie can override it — its **Auto skip** is `Default`, `On` or `Off`, so a series whose intro
you would rather see can offer the button while everything else jumps automatically.

Either way the windows are ignored for live streams, where the duration is not finite, and the
outro is neither jumped nor offered on the last episode — there is nothing to skip to, so it plays
out and reaching the end advances as usual.

## Import and export

**Export data** on the options page writes a JSON file — `hls-player-YYYY-MM-DD.json` — holding
the library, the global settings and every watch position.

**Import data** merges such a file back in rather than replacing what is there: a movie whose id
is already in the library is updated from the file, the rest are appended, and a watch position is
taken only when it is newer than the stored one. The settings in the file replace the current ones.
Nothing local is lost, so importing twice changes nothing the second time; to restore a backup
exactly, **Clear library** first and then import.

The file is read defensively, since it is editable: a movie with no playable episode URL is
dropped, as is any position whose key is not an http(s) URL. A file that is not an export of this
extension is refused with a message rather than half-applied.

## Why the worker-less video.js build

MV3 pins extension pages to `script-src 'self'`, and neither Chrome nor Firefox lets a manifest
widen that to `blob:` — the only permitted values are `'self'`, `'none'` and `'wasm-unsafe-eval'`.
video.js's stock bundle builds the VHS transmuxer and AES decrypter as workers from `blob:` URLs,
so Firefox refuses them:

```
Content-Security-Policy: The page's settings blocked a worker script (worker-src) at
blob:moz-extension://…/… because it violates the following directive: "script-src 'self'"
```

The extension therefore imports `video.js/dist/alt/video.core.js`, which leaves VHS out, and adds
VHS back as `videojs-http-streaming-sync-workers.js` — an upstream build that runs the same worker
code on the page behind a mock `Worker`. Transmuxing MPEG-TS segments now costs main-thread time
rather than a worker thread; fragmented MP4 and DASH streams are handed to MSE untouched either
way, so they are unaffected.

## Segments disguised as images

Some hosts serve segments as PNGs to dodge filters — a small valid image with the real MPEG-TS or
fMP4 payload concatenated after it — which the transmuxer rejects. Those responses are detected by
their PNG signature and unwrapped before playback sees them, so such streams play without any
configuration. The console notes the first segment it unwraps. Segments merely _named_ `.png` with
ordinary contents never needed anything: playback goes by bytes, not by extension or MIME type.

## Server-side ad insertion

Some sites splice ad segments straight into the media playlist, so there is no URL to block — by
the time the player sees them the ads are just more `#EXTINF` entries. They usually give
themselves away in the URI, though. A break looks like this: a run of segments fenced between two
`#EXT-X-DISCONTINUITY` tags, on a path of their own, with the ragged durations of a spliced ad pod.

```
#EXTINF:3.0,
<random-name>.ts                            <- content, the site's own naming
#EXT-X-DISCONTINUITY
#EXT-X-KEY:METHOD=NONE
#EXTINF:3.72,
/<prefix>/<hash>/segment_0001.ts            <- the ad break: its own path, a dozen
...                                            segments, ragged durations, ≈30s in all
#EXTINF:0.16,
/<prefix>/<hash>/segment_0011.ts
#EXT-X-DISCONTINUITY
#EXTINF:3.0,
<random-name>.ts                            <- content resumes
```

**Ad segment pattern** — on the movie form, or on the options page as the default every movie
inherits — is a regular expression matched against each segment URI _as written in the playlist_,
not the resolved URL. For the break above, `^/<prefix>/[0-9a-f]+/segment_\d+\.ts$` names the ads.
Every matching segment is cut, along with the tags that describe it, before the playlist is
parsed.

Mind the direction: the pattern matches what is **thrown away**. Pointing it at the content instead
leaves you with a playlist of nothing but ads.

The pattern names the **ads**, not the content, so a pattern that is too narrow leaves an ad in
rather than deleting the movie. A pattern that matches every segment is treated as a mistake and
ignored. The player reports what it cut — "Removed 12 of 480 segments" — under the field in the
side panel, which is how you tune it.

Three things worth knowing:

- Only complete (VOD) playlists are rewritten. Removing segments from a live window would shift
  `#EXT-X-MEDIA-SEQUENCE` out from under the playlist loader.
- `#EXT-X-KEY` and the other playlist-level tags are always kept, even when they sit inside an ad
  block — a key applies to everything after it, so dropping one would break the next real segment.
  A `#EXT-X-DISCONTINUITY` is kept only where the cut actually happened.
- Cutting ads shortens the timeline, so stored watch positions shift if you change the pattern
  later. Progress is keyed by episode URL and has no way to know the timeline moved.

DASH is not covered: ad insertion there is a matter of separate periods in the MPD, not segments in
a playlist.

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
