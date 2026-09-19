/**
 * Every control in the UI is built from these strings — see the design rules
 * in CLAUDE.md. Extend this file instead of styling controls inline.
 */

export const inputClass =
  'w-full rounded-md border border-line bg-elevated px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-primary'

export const selectClass =
  'rounded-md border border-line bg-elevated px-2 py-1 text-xs text-ink outline-none transition focus:border-primary'

export const labelClass =
  'mb-1 block text-[11px] font-medium uppercase tracking-wider text-ink-muted'

export const helpClass = 'mt-1 text-xs text-ink-faint'

/** Solid red — at most one per view. */
export const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40'

/** The default for every secondary action, destructive ones included. */
export const ghostButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-muted transition hover:border-line-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40'

/** Added to `ghostButtonClass` when the button reflects an open/selected state. */
export const activeGhostClass = 'border-primary text-primary hover:border-primary'

/** Icon-only: always pair with `aria-label` and `title`. */
export const iconButtonClass =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint transition hover:bg-elevated hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-40'

export const linkButtonClass =
  'text-xs text-ink-muted underline-offset-2 transition hover:text-ink hover:underline'

export const checkboxRowClass = 'flex cursor-pointer items-center gap-2 text-sm text-ink'

export const checkboxClass = 'h-4 w-4 accent-primary'

/*
  A modal `<dialog>` is centered by the UA stylesheet's `margin: auto`, which
  Preflight resets away, so `m-auto` puts it back. Sizing stays with the caller.
*/
export const dialogClass =
  'm-auto rounded-md border border-line bg-panel p-5 text-ink shadow-xl backdrop:bg-black/70'

/*
  Banners carry no border of their own — the caller adds the edge it needs
  (`border-b border-line` in a page bar, `rounded-md border border-line` inline)
  so the two never fight over Tailwind's rule order.
*/
export const dangerBannerClass =
  'flex w-full items-start gap-2 bg-danger-soft px-4 py-2 text-left text-sm text-danger'

export const warnBannerClass =
  'flex w-full items-start gap-2 bg-warn-soft px-4 py-2 text-left text-sm text-warn'

/** The centered play affordance over a paused video. */
export const overlayPlayButtonClass =
  'grid h-16 w-16 place-items-center rounded-full bg-primary text-white shadow-lg transition hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none'

/** Sits over the video (Skip intro / Skip outro), so it carries its own ground. */
export const overlayButtonClass =
  'border-line text-ink inline-flex items-center gap-2 rounded-md border bg-black/70 px-4 py-2 text-sm backdrop-blur-sm transition hover:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none'
