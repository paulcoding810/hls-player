import { useEffect, useRef, useState } from 'react'

import { LayersIcon } from '@components/icons'
import {
  activeGhostClass,
  checkboxClass,
  checkboxRowClass,
  ghostButtonClass,
  linkButtonClass,
} from '@components/ui'

/** What the button says the scope is. */
function summary(catalogs, chosen) {
  if (chosen.length === 0) return 'Every catalog'
  if (chosen.length > 1) return `${chosen.length} catalogs`
  const entry = catalogs.find((item) => item.key === chosen[0])
  return entry ? `${entry.plugin.name} · ${entry.catalog.name}` : 'Every catalog'
}

/**
 * The catalogs a search covers, as a checklist; none ticked is every one.
 * `catalogs` are `{ key, plugin, catalog }`, and `chosen` holds their keys.
 */
export default function CatalogPicker({ catalogs, chosen, onChange }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const away = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false)
    }
    const escape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const toggle = (key) =>
    onChange(chosen.includes(key) ? chosen.filter((item) => item !== key) : [...chosen, key])

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Catalogs to search"
        className={`${ghostButtonClass} max-w-72 ${open ? activeGhostClass : ''}`}
      >
        <LayersIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{summary(catalogs, chosen)}</span>
      </button>

      {open && (
        <div className="bg-panel border-line absolute right-0 z-20 mt-1 flex max-h-96 w-80 flex-col gap-1 overflow-y-auto rounded-md border p-3 shadow-xl">
          <div className="mb-1 flex items-center">
            <span className="text-ink-faint text-xs">
              One ticked is browsed; none searches every catalog.
            </span>
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={chosen.length === 0}
              className={`${linkButtonClass} ml-auto shrink-0 disabled:opacity-40`}
            >
              Clear
            </button>
          </div>
          {catalogs.map(({ key, plugin, catalog }) => (
            <label key={key} className={`${checkboxRowClass} py-1`}>
              <input
                type="checkbox"
                checked={chosen.includes(key)}
                onChange={() => toggle(key)}
                className={checkboxClass}
              />
              <span className="min-w-0 truncate" title={`${plugin.name} · ${catalog.name}`}>
                {plugin.name} · {catalog.name}
              </span>
              {!catalog.searchable && (
                <span className="text-ink-faint ml-auto shrink-0 text-xs">browse only</span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
