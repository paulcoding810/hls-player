import { PLAYBACK_RATES } from '@/helper/constants'
import { checkboxClass, checkboxRowClass, helpClass, inputClass, labelClass } from './ui'

/** Controlled by the parent, which owns persistence. */
export default function SettingsPanel({ settings, onChange }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className={labelClass} htmlFor="default-referer">
          Default Referer
        </label>
        <input
          id="default-referer"
          className={inputClass}
          spellCheck="false"
          placeholder="https://example.com/"
          value={settings.referer}
          onChange={(event) => onChange({ referer: event.target.value })}
        />
        <p className={helpClass}>Used for items added without their own Referer.</p>
      </div>

      <div>
        <label className={labelClass} htmlFor="default-adpattern">
          Default ad segment pattern
        </label>
        <input
          id="default-adpattern"
          className={inputClass}
          spellCheck="false"
          placeholder="^/ads/.+\\.ts$"
          value={settings.adPattern}
          onChange={(event) => onChange({ adPattern: event.target.value })}
        />
        <p className={helpClass}>
          Server-side ad segments matching this regular expression are cut from every playlist that
          does not name its own. Complete (VOD) playlists only.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass} htmlFor="rate">
            Speed
          </label>
          <select
            id="rate"
            className={inputClass}
            value={settings.playbackRate}
            onChange={(event) => onChange({ playbackRate: Number(event.target.value) })}
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="skip-leading">
            Skip intro
          </label>
          <input
            id="skip-leading"
            className={inputClass}
            type="number"
            min="0"
            step="1"
            value={settings.skipLeading}
            onChange={(event) => onChange({ skipLeading: event.target.value })}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="skip-trailing">
            Skip credits
          </label>
          <input
            id="skip-trailing"
            className={inputClass}
            type="number"
            min="0"
            step="1"
            value={settings.skipTrailing}
            onChange={(event) => onChange({ skipTrailing: event.target.value })}
          />
        </div>
      </div>

      <p className={helpClass}>
        Seconds. Playback starts {settings.skipLeading || 0}s in and moves to the next item{' '}
        {settings.skipTrailing || 0}s before the end. Both are ignored for live streams.
      </p>

      <label className={checkboxRowClass}>
        <input
          type="checkbox"
          className={checkboxClass}
          checked={settings.autoSkip}
          onChange={(event) => onChange({ autoSkip: event.target.checked })}
        />
        Skip intro and outro automatically
      </label>
      <p className={`${helpClass} -mt-2`}>
        Off, the player offers a <b>Skip intro</b> / <b>Skip outro</b> button instead.
      </p>

      <label className={checkboxRowClass}>
        <input
          type="checkbox"
          className={checkboxClass}
          checked={settings.grabLinks}
          onChange={(event) => onChange({ grabLinks: event.target.checked })}
        />
        Open .m3u8 and .mpd links in the player
      </label>
      <p className={`${helpClass} -mt-2`}>
        Off, the browser shows or downloads the manifest as usual.
      </p>

      <label className={checkboxRowClass}>
        <input
          type="checkbox"
          className={checkboxClass}
          checked={settings.autoplay}
          onChange={(event) => onChange({ autoplay: event.target.checked })}
        />
        Start playing automatically
      </label>

      <label className={checkboxRowClass}>
        <input
          type="checkbox"
          className={checkboxClass}
          checked={settings.muted}
          onChange={(event) => onChange({ muted: event.target.checked })}
        />
        Start muted (browsers block unmuted autoplay)
      </label>
    </div>
  )
}
