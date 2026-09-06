# hls-player

Chrome/Firefox MV3 extension (Vite + React 18 + Tailwind v4) that plays a library of HLS and DASH
movies in a dedicated page with a per-tab `Referer` override. `manifestMime()` in
`src/utils/url.js` picks the manifest type from the URL — `.mpd` is DASH, everything else HLS. See `README.md` for the behaviour and
`src/background/index.js` for the header-rewriting logic.

Two pages: `gallery.html` (`src/gallery/Gallery.jsx`) manages the library, `player.html`
(`src/player/Player.jsx`) plays the last episode recorded in `lastPlayed` and sends you back to the
gallery when there is nothing to continue. They hand off through storage and a plain navigation —
there is no router, so a page must persist what the other one needs before navigating. The data model lives in `src/helper/library.js` — a library holds
movies, a movie holds episodes plus its own config, and blank config fields (`referer: ''`,
`skipLeading/skipTrailing: null`) inherit from the global settings via `resolveConfig`. Playback
positions live in a separate store (`src/helper/progress.js`) keyed by episode URL.

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
player jumps it or offers an overlay button. The player page has no global settings UI — those live on the options page — but
the movie form itself (`MovieFields.jsx`) renders both as a modal on the library page and inline in
the player's side panel.

video.js is the HLS engine only — it is created with `controls: false`, `bigPlayButton: false` and
`errorDisplay: false`. The playback UI is `src/components/Controls.jsx`, driven by React state
subscribed to player events; errors surface in the page banner, not over the video. Do not
re-enable the video.js skin or add a video.js plugin for UI — extend `Controls.jsx`.

VHS response hooks (`videojs.Vhs.xhr.onResponse`) are the extension point for reshaping segment
bytes — see the PNG unwrapping in `src/player/Player.jsx` with the scanning in
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
  `bg-panel/95` + `backdrop-blur-sm`), scrolling internally. They must never take layout space:
  resizing the video element restarts quality selection and makes playback stutter. Anything
  anchored over the video (the control bar, centered affordances) keeps clear of the open panel
  rather than sitting under it.
- Text that can hold a URL is `truncate` with the full value in `title`.
