# hls-player

Chrome/Firefox MV3 extension (Vite + React 18 + Tailwind v4) that plays a library of HLS and DASH
movies in a dedicated page with a per-tab `Referer` override. `manifestMime()` in
`src/utils/url.js` picks the manifest type from the URL — `.mpd` is DASH, everything else HLS. See `README.md` for the behaviour and
`src/background/index.js` for the header-rewriting logic.

Navigations to a `.m3u8`/`.mpd` path are taken over in `src/background/index.js`
(`webNavigation.onBeforeNavigate`) and sent to `player.html?src=…`, which plays that URL outside
the library — the `grabbed`/`source` branch in `Player.jsx`, where `movie` stays null and the
global settings supply the config.

Two pages: `gallery.html` (`src/gallery/Gallery.jsx`) manages the library, `player.html`
(`src/player/Player.jsx`) plays what its own query string names —
`?movie=<id>&episode=<id|1-based index>`, or `?src=<url>` for a grabbed link — and sends you back to
the gallery when neither resolves. There is no router: the pages hand off by navigating to a URL
built with `playerUrlForEpisode()`/`playerUrlFor()` in `src/helper/player.js`. `lastPlayed` in
storage is the fallback for a bare `player.html` and what the gallery's Continue watching panel
reads; the player rewrites its own URL with `replaceState` when the episode changes. The toolbar
icon (`openGallery()`) always lands on the gallery. The data model lives in `src/helper/library.js` — `parseMovieJson()` there reads that same
shape back from pasted text for the form's JSON mode. A library holds
movies, a movie holds episodes plus its own config, and it carries three timestamps the gallery's
`sortMovies()` reads — `addedAt`, `updatedAt` (stamped by `updateMovie`) and `lastPlayedAt`
(stamped by `setLastPlayed`); sorting never rewrites the stored order. Blank config fields (`referer: ''`,
`skipLeading/skipTrailing: null`) inherit from the global settings via `resolveConfig`. Playback
positions live in a separate store (`src/helper/progress.js`) keyed by episode URL. Source plugins live in a
fourth store (`src/helper/plugins.js`): each one describes a site's JSON API as two URL templates
plus paths, read by `readPath`/`fillTemplate` in `src/utils/jsonPath.js`. A plugin can never hold
code — MV3 forbids `eval`, so extraction is data; do not "simplify" it into a callback. A plugin also carries the
site's `referer` and `adPattern`, copied onto each movie it adds rather than looked up later. A movie
added from one carries `source: { pluginId, itemId }`, which is what the gallery's refresh button
uses to re-read episodes through the existing `setEpisodes`. All three stores,
plus the settings, round-trip through `src/helper/backup.js` — `readBackup` sanitizes an untrusted
file and `applyBackup` merges it by movie id, behind the Data section of the options page.

```shell
pnpm build            # -> build/chrome
pnpm build:firefox    # -> build/firefox
pnpm exec eslint src
pnpm fmt
```

# Design rules

The look is **dark-only, red-accented, flat**. Two files are the source of truth — read them
before writing any UI, and extend them instead of inventing local styles:

- `src/index.css` — the `@theme` token block (all colors live here)
- `src/components/ui.js` — the class strings every control is built from
- `src/components/icons.jsx` — the icon set

## Color

Use the semantic token utilities. **Never** write a raw hex value in a component, and never reach
for Tailwind's stock palette (`neutral-800`, `sky-600`, `red-500`, …) — only `white`, `black`,
`transparent` and `current` are allowed outside the tokens.

| Token utility                           | Use for                                   |
| --------------------------------------- | ----------------------------------------- |
| `bg-surface`                            | the page background                       |
| `bg-panel`                              | side panels, banners, form wells          |
| `bg-elevated`                           | hover/selected rows, inputs               |
| `border-line` / `border-line-strong`    | dividers / hovered control borders        |
| `text-ink`                              | body and heading text                     |
| `text-ink-muted`                        | secondary text, labels, inactive controls |
| `text-ink-faint`                        | help text, counters, placeholders         |
| `bg-primary` / `hover:bg-primary-hover` | the one solid action per view             |
| `text-primary` / `border-primary`       | active and selected state, focus ring     |
| `bg-primary-soft`                       | tint behind a selected row                |
| `text-danger` / `bg-danger-soft`        | playback and permission errors            |
| `text-warn` / `bg-warn-soft`            | "action needed" notices                   |

Red is the **brand** color, so a red fill reads as "do this", not "careful". Destructive actions
(Clear playlist, remove item) therefore use `ghostButtonClass` or `iconButtonClass` — never a solid
red button. Errors are a tinted band with `text-danger`, never a red-filled block.

## Dark mode

Dark is the only theme. `:root` sets `color-scheme: dark`; do not add `dark:` variants, do not
query `prefers-color-scheme`, and do not add a theme toggle. Tokens already carry the dark values.

## Buttons

Every button is one of the four exports in `ui.js`, with `type="button"` unless it submits a form:

- `buttonClass` — solid red. **At most one per view** (the primary action).
- `ghostButtonClass` — bordered, transparent. The default for everything else.
- `iconButtonClass` — square, icon-only. Needs both `aria-label` and `title`.
- `linkButtonClass` — text-only, for tertiary actions.

Disabled state comes from the class strings (`disabled:opacity-40`) — set the `disabled` attribute
rather than hiding the control, so the layout does not jump. Labels are sentence case
("Add to playlist", not "ADD TO PLAYLIST" or "Add To Playlist").

## Labels and form controls

- Every input gets a real `<label htmlFor>` with `labelClass` — no placeholder-as-label.
- Placeholders show an example value (`https://example.com/one.m3u8`), never a restatement.
- Help text sits under the field in `text-xs text-ink-faint`, one line where possible.
- Inputs use `inputClass`; it already carries the focus ring, so do not restyle focus per field.
- Checkboxes use `checkboxRowClass` on the wrapping `<label>` so the hit area covers the text.

## Dialogs

Confirmations use a native `<dialog>` with `showModal()` — focus trapping and Escape come from the
platform, so do not hand-roll an overlay and never use `window.confirm`/`alert` (a modal dialog
freezes the extension page). Escape maps to the **negative** answer, matching what the title asks;
the affirmative button is `buttonClass` with `autoFocus`, the negative one `ghostButtonClass`.
Give the dialog `aria-labelledby` pointing at its heading, and style the scrim with
`backdrop:bg-black/70`. See `src/components/ResumeDialog.jsx`.

## Icons

Inline SVG only — no icon package, no emoji, no text glyphs (`✕`, `‹`, `›`) as icons.

Add new icons to `src/components/icons.jsx` following the existing shape: a `24×24` viewBox,
`fill="none"`, `stroke="currentColor"`, `strokeWidth={1.5}`, round caps/joins, `aria-hidden`, and
size from the caller via `className` (`h-4 w-4` in controls, `h-5 w-5` standalone). Because they
inherit `currentColor`, never give an icon its own color — color the parent.

## Playback UI

Skipping an intro or outro is driven by the movie config: `skipAt()` in `src/player/Player.jsx`
returns which window the position falls in, and the global `autoSkip` setting decides whether the
player jumps it or offers an overlay button. An auto-skipped intro is taken at once, but the outro
runs an `OUTRO_COUNTDOWN` counter first that the viewer can decline; it is held while paused and
cleared when the position leaves the window, so it cannot fire on a rewatch. Both windows are
measured against `longestDuration()`, not `duration()`: a stream cut short ends its media source at
whatever was buffered, and the shrunken duration would drag the outro window into the middle of the
episode. For the same reason `ended` only advances when the position actually reached the end. The player page has no global settings UI — those live on the options page — but
the movie form itself (`MovieFields.jsx`) renders both as a modal on the library page and inline in
the player's side panel.

video.js is the HLS engine only — it is created with `controls: false`, `bigPlayButton: false` and
`errorDisplay: false`. It is imported as `video.js/dist/alt/video.core.js` (a
`vite.config.js` alias) plus VHS's `videojs-http-streaming-sync-workers.js`: the stock bundle
builds its transmuxer and decrypter as `blob:` workers, which MV3's `script-src 'self'` forbids —
Firefox blocks them outright. The sync build runs that same worker code on the page. Do not import
the plain `video.js` entry. The playback UI is `src/components/Controls.jsx`, driven by React state
subscribed to player events; errors surface in the page banner, not over the video. Do not
re-enable the video.js skin or add a video.js plugin for UI — extend `Controls.jsx`.

VHS response hooks (`videojs.Vhs.xhr.onResponse`) have two tenants. Playlist text is rewritten by
`stripAdSegments()` in `src/utils/playlist.js`, which cuts server-side ad segments named by the
movie's `adPattern` regex — the loader parses `request.responseText`, and the response hooks run
first, so the rewrite is shadowed onto the request the same way the segment bytes are. They are
also the extension point for reshaping segment bytes — see the PNG unwrapping in `src/player/Player.jsx` with the scanning in
`src/utils/segments.js`. A hook's return value is ignored and the segment loader reads
`request.response`, so a rewritten buffer has to be shadowed onto the request itself. Request hooks
cannot set `Referer`; that is a forbidden header and stays with declarativeNetRequest.

Sliders are native `<input type="range">` with `.control-range` from `Controls.css` (thumb rules
need per-engine selectors) and the filled portion drawn as an inline gradient of the color tokens.
Every control carries `aria-label`, and `title` names its keyboard shortcut where it has one.

## Layout

- 4px spacing scale (`gap-1/2/3/4`, `p-4` for panels, `px-4 py-2` for bars).
- `rounded-md` everywhere; `rounded-full` only for genuinely circular controls.
- Separate regions with a single `border-line` edge, not shadows or nested cards.
- Side panels are `w-80` and **overlay** the video (`absolute inset-y-0 right-0`, translucent
  `bg-panel/95` + `backdrop-blur-sm`), scrolling internally. The player's panel opens and closes on
  its **Episodes** button alone — it does not follow the control bar's idle fade, so choosing an
  episode or editing a movie is never interrupted. They must never take layout space:
  resizing the video element restarts quality selection and makes playback stutter. Anything
  anchored over the video (the control bar, centered affordances) keeps clear of the open panel
  rather than sitting under it.
- Text that can hold a URL is `truncate` with the full value in `title`.
