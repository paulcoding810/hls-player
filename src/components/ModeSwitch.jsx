import { activeGhostClass, ghostButtonClass } from './ui'

/**
 * Two ways of editing the same thing. Both buttons stay live — the current one
 * is marked rather than disabled, so the pair reads as a choice instead of one
 * button that has stopped working.
 */
export default function ModeSwitch({ value, onChange, options, label }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`${ghostButtonClass} ${value === option.value ? activeGhostClass : ''}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
