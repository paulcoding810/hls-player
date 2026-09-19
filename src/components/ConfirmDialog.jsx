import { useEffect, useRef } from 'react'

import { buttonClass, dialogClass, ghostButtonClass } from './ui'

/**
 * Native `<dialog>`, so focus trapping and Escape come from the platform.
 * Escape always cancels.
 */
export default function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const close = (action) => () => {
    ref.current?.close()
    action()
  }

  return (
    <dialog
      ref={ref}
      onCancel={close(onCancel)}
      aria-labelledby="confirm-title"
      className={`${dialogClass} w-[min(26rem,90vw)]`}
    >
      <h2 id="confirm-title" className="text-sm font-semibold">
        {title}
      </h2>
      {body && <p className="text-ink-muted mt-2 text-sm">{body}</p>}

      <div className="mt-5 flex items-center justify-end gap-2">
        <button type="button" onClick={close(onCancel)} className={ghostButtonClass} autoFocus>
          {cancelLabel}
        </button>
        <button type="button" onClick={close(onConfirm)} className={buttonClass}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
