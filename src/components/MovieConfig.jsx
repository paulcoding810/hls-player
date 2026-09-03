import { helpClass, inputClass, labelClass } from './ui'

/**
 * Per-movie overrides. Every field is optional: left blank, the movie inherits
 * the matching value from the global settings.
 */
export default function MovieConfig({ movie, defaults, onChange, idPrefix = 'movie' }) {
  const number = (value) => (value === '' ? null : Number(value))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-referer`}>
          Referer
        </label>
        <input
          id={`${idPrefix}-referer`}
          className={inputClass}
          spellCheck="false"
          placeholder="https://example.com/"
          value={movie.referer ?? ''}
          onChange={(event) => onChange({ referer: event.target.value })}
        />
        <p className={helpClass}>
          Sent with every episode of this movie.
          {defaults.referer && ` Blank uses the default (${defaults.referer})`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-intro`}>
            Skip intro
          </label>
          <input
            id={`${idPrefix}-intro`}
            className={inputClass}
            type="number"
            min="0"
            step="1"
            placeholder={String(defaults.skipLeading ?? 0)}
            value={movie.skipLeading ?? ''}
            onChange={(event) => onChange({ skipLeading: number(event.target.value) })}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-outro`}>
            Skip outro
          </label>
          <input
            id={`${idPrefix}-outro`}
            className={inputClass}
            type="number"
            min="0"
            step="1"
            placeholder={String(defaults.skipTrailing ?? 0)}
            value={movie.skipTrailing ?? ''}
            onChange={(event) => onChange({ skipTrailing: number(event.target.value) })}
          />
        </div>
      </div>

      <p className={helpClass}>
        Seconds at the start and the end of every episode. Leave a field empty to use the default
        shown in it.
      </p>

      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-autoskip`}>
          Auto skip
        </label>
        <select
          id={`${idPrefix}-autoskip`}
          className={inputClass}
          value={movie.autoSkip == null ? '' : movie.autoSkip ? 'on' : 'off'}
          onChange={(event) =>
            onChange({
              autoSkip: event.target.value === '' ? null : event.target.value === 'on',
            })
          }
        >
          <option value="">Default ({defaults.autoSkip ? 'on' : 'off'})</option>
          <option value="on">On</option>
          <option value="off">Off</option>
        </select>
        <p className={helpClass}>
          On, those windows are jumped for this movie. Off, they are offered as buttons.
        </p>
      </div>
    </div>
  )
}
