import { useEffect, useRef } from 'react'

import MovieFields from './MovieFields'

/** `MovieFields` in a modal, for adding or editing from the library page. */
export default function MovieForm({ movie, defaults, onSave, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const close = () => {
    ref.current?.close()
    onClose()
  }

  return (
    <dialog
      ref={ref}
      onCancel={close}
      aria-labelledby="movie-form-title"
      className="border-line bg-panel text-ink max-h-[85vh] w-[min(34rem,92vw)] overflow-y-auto rounded-md border p-5 shadow-xl backdrop:bg-black/70"
    >
      <h2 id="movie-form-title" className="mb-4 text-sm font-semibold">
        {movie ? 'Edit movie' : 'Add movie'}
      </h2>

      <MovieFields
        movie={movie}
        defaults={defaults}
        autoFocus
        onSave={(values) => {
          onSave(values)
          close()
        }}
        onCancel={close}
      />
    </dialog>
  )
}
