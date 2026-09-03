import { useEffect, useRef } from 'react'

import { buttonClass, ghostButtonClass } from './ui'
import { PlayIcon } from './icons'
import { formatTime } from '@/utils/time'

/**
 * Native `<dialog>`, so focus trapping and Escape come from the platform.
 * Escape reads as "no, do not continue" and therefore starts over.
 */
export default function ResumeDialog({ position, duration, onResume, onRestart }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const close = (action) => () => {
    ref.current?.close()
    action()
  }

  const percent =
    Number.isFinite(duration) && duration > 0 ? Math.round((position / duration) * 100) : null

  return (
    <dialog
      ref={ref}
      onCancel={close(onRestart)}
      aria-labelledby="resume-title"
      className="border-line bg-panel text-ink w-[min(26rem,90vw)] rounded-md border p-5 shadow-xl backdrop:bg-black/70"
    >
      <h2 id="resume-title" className="text-sm font-semibold">
        Continue watching?
      </h2>
      <p className="text-ink-muted mt-2 text-sm">
        This stream was stopped at{' '}
        <span className="text-ink font-mono">{formatTime(position)}</span>
        {Number.isFinite(duration) && duration > 0 && ` of ${formatTime(duration)}`}
        {percent !== null && ` (${percent}%)`}.
      </p>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button type="button" onClick={close(onRestart)} className={ghostButtonClass}>
          Start over
        </button>
        <button type="button" onClick={close(onResume)} className={buttonClass} autoFocus>
          <PlayIcon />
          Resume
        </button>
      </div>
    </dialog>
  )
}
