import { useEffect } from 'react'

import { CloseIcon } from './icons'
import { iconButtonClass, toastClass, toastToneClass } from './ui'

/** Long enough to read; an error gets longer, since it may need acting on. */
const LINGER = { warn: 4000, danger: 8000 }

/**
 * A transient message, fixed over the page so showing one never moves the
 * content underneath. `notice` is `{ tone, message }`, or null for nothing.
 * Persistent state — a playback error, a missing permission — belongs in a
 * banner in the layout instead, where it cannot time out unnoticed.
 */
export default function Toast({ notice, onDismiss }) {
  // A fresh object each time means an identical repeated message still
  // restarts the clock rather than inheriting the old one.
  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(onDismiss, LINGER[notice.tone] ?? LINGER.warn)
    return () => clearTimeout(timer)
  }, [notice, onDismiss])

  if (!notice) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-end p-6"
      role="status"
      aria-live="polite"
    >
      <div className={`${toastClass} ${toastToneClass[notice.tone] ?? toastToneClass.warn}`}>
        <span className="min-w-0 flex-1">{notice.message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className={`${iconButtonClass} -mr-2`}
          aria-label="Dismiss"
          title="Dismiss"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
