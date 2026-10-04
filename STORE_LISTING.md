# Store listing

Copy for the Chrome Web Store and addons.mozilla.org. Version 1.1.0. Character limits are noted
where a store enforces one.

## Name

HLS Player

## Short description

Chrome summary, at most 132 characters (this one is 122):

> Play HLS and DASH streams in a full-page player: keep a library, resume where you left off, skip intros and set a Referer.

Firefox summary, at most 250 characters (this one is 226):

> A full-page player for HLS (.m3u8) and DASH (.mpd) streams. Keep a library of movies and series, resume where you left off, skip intros and outros, load subtitles, and set the Referer a stream needs. Works with Stremio addons.

## Description

HLS Player plays HLS (.m3u8) and DASH (.mpd) streams in a clean, full-page player, and keeps the
things you watch in a library of their own.

**A library for streams**

- Keep movies and series, each with its own list of episodes.
- Pick up where you left off: every episode remembers its position, and Continue watching takes you
  back to the last one.
- Mark a movie as watched, and sort the library by recently watched, added, updated or title.
- Add a movie by pasting episode URLs, or as JSON.

**Plays what other players will not**

- Set the Referer a stream needs, for each movie or as a default. It applies only to the player's
  own tab.
- Open a .m3u8 or .mpd link straight in the player instead of seeing the raw playlist. This can be
  turned off.
- Remove server-side ad segments from a playlist by a pattern you choose.
- Plays segments that are disguised as images.

**Watching**

- Skip intros and outros, either automatically or with a button, and move on to the next episode
  with a short countdown you can cancel.
- Subtitles in WebVTT or SRT: show two languages at once, adjust their timing, size and position,
  and pick a preferred language.
- Choose the quality and playback speed.
- Keyboard shortcuts for play, seeking, volume, subtitles, speed, fullscreen and episodes.

**Stremio addons**

- Add a Stremio addon by its manifest URL, then search and browse its catalogs.
- See a title's details — plot, year, runtime, rating, cast — before adding it.
- Choose between the streams an addon offers, and keep that choice for the rest of the season.
- The next episode's streams are fetched before you reach the end, so moving on is quick.
- Only addons that offer HTTP streams can be played. Torrent-only addons are not supported.

**Your data stays with you**

Everything is stored in your browser. There is no account, no tracking and no analytics. Export
the whole library, your sources, your settings and every watch position to a file, and import it
on another browser.

HLS Player is not affiliated with or endorsed by Stremio. It does not provide any content: it plays
the URLs you give it and the streams the addons you add return.

## Category

- Chrome: Entertainment
- Firefox: Photos, Music & Videos

## Single purpose (Chrome)

Plays HLS and DASH video streams the user supplies, in a dedicated player page with a library, and
sets the Referer header those streams require.

## Permission justifications (Chrome)

| Permission                   | Why it is needed                                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                    | Saves the library, watch positions, settings and Stremio sources locally in the browser.                                                                                                                                                                            |
| `declarativeNetRequest`      | Sets the `Referer` header on the player's own requests. The rule is scoped to the player's tab and removed when that tab closes. Pages can't set `Referer` themselves, because browsers forbid it.                                                                  |
| `webNavigation`              | Notices when you open a link ending in `.m3u8` or `.mpd` and opens it in the player instead of showing the raw playlist. It can be turned off in the options.                                                                                                       |
| Host permission `<all_urls>` | Streams, subtitle files and Stremio addons are on whatever sites the user chooses, so they can't be listed in advance. Host access lets the player fetch them, rewrite the `Referer` on those requests, and load subtitles from hosts that don't send CORS headers. |

**Remote code:** No. All code ships in the package. Stremio addons return JSON data only, which is
read and never executed.

## Permission justifications (Firefox)

Firefox uses blocking `webRequest` and `webRequestBlocking` in place of `declarativeNetRequest`, for
the same purpose: setting `Referer` on requests from the player's tab only. `storage`,
`webNavigation` and the host permission are used as described above.

## Data usage

- Personal data collected: none.
- Data sent to the developer: none.
- Network requests go only to the stream, subtitle and addon URLs the user adds.

Chrome's data-usage form: tick none of the data types, and certify all three statements: data is
not sold, not used for anything unrelated to the item's purpose, and not used for credit decisions.

Firefox's `data_collection_permissions` is already set to `none` in the manifest.

## Privacy policy

> HLS Player stores your library, watch positions, settings and sources only in your browser's
> local storage. It collects no personal data, has no analytics, and sends nothing to the developer.
> It connects only to the stream, subtitle and Stremio addon addresses you add. Exporting writes a
> file to your device; nothing is uploaded.

## Screenshots to capture

At 1280×800:

1. The library with posters and the Continue watching panel.
2. The player with subtitles showing and the control bar visible.
3. The player with the episodes panel open.
4. The Sources page, with search results grouped by catalog.
5. A title's details dialog.
