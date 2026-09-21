import { useEffect, useRef } from 'react'

import PluginFields from './PluginFields'
import { dialogClass } from './ui'

/** `PluginFields` in a modal, matching `MovieForm`. */
export default function PluginForm({ plugin, onSave, onClose }) {
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
      aria-labelledby="plugin-form-title"
      className={`${dialogClass} max-h-[85vh] w-[min(40rem,92vw)] overflow-y-auto`}
    >
      <h2 id="plugin-form-title" className="mb-4 text-sm font-semibold">
        {plugin ? 'Edit source' : 'Add source'}
      </h2>

      <PluginFields
        plugin={plugin}
        onSave={(values) => {
          onSave(values)
          close()
        }}
        onCancel={close}
      />
    </dialog>
  )
}
