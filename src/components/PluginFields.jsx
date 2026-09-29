import { useState } from 'react'

import ModeSwitch from './ModeSwitch'
import {
  buttonClass,
  checkboxClass,
  checkboxRowClass,
  ghostButtonClass,
  helpClass,
  inputClass,
  labelClass,
} from './ui'
import { EMPTY_PLUGIN, pluginToJson } from '@/helper/plugins'
import { forgetManifest, searchStremio } from '@/helper/stremio'
import { compilePattern } from '@/utils/playlist'

const JSON_EXAMPLE = `{
  "name": "Cinemeta",
  "url": "https://v3-cinemeta.strem.io/manifest.json",
  "referer": "https://example.com/",
  "adPattern": "^/ads/.+\\.ts$"
}`

/**
 * A source is a Stremio addon and a manifest URL; the protocol supplies the
 * rest. **Test** runs a real search against it, which is the only way to know
 * the addon answers before saving it.
 */
export default function PluginFields({ plugin, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => structuredClone({ ...EMPTY_PLUGIN, ...(plugin ?? {}) }))
  const [error, setError] = useState('')
  const [json, setJson] = useState(null)
  const [test, setTest] = useState(null)

  const section = (name, patch) => setDraft({ ...draft, [name]: { ...draft[name], ...patch } })
  const fields = (name, patch) => section(name, { fields: { ...draft[name].fields, ...patch } })

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('Give the source a name.')
      return
    }
    if (!draft.url.trim()) {
      setError('Give the addon a manifest URL.')
      return
    }
    if (draft.adPattern.trim() && !compilePattern(draft.adPattern.trim())) {
      setError('The ad segment pattern is not a valid regular expression.')
      return
    }
    onSave({ ...draft, name: draft.name.trim() })
  }

  const readJson = () => {
    let parsed
    try {
      parsed = JSON.parse(json)
    } catch {
      throw new Error('That is not valid JSON.')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected a single source object.')
    }
    if (!String(parsed.name ?? '').trim()) throw new Error('Give the source a "name".')
    return { ...structuredClone(EMPTY_PLUGIN), ...parsed, name: String(parsed.name).trim() }
  }

  const handleJsonSubmit = (event) => {
    event.preventDefault()
    try {
      onSave(readJson())
    } catch (jsonError) {
      setError(jsonError.message)
    }
  }

  /**
   * The two views edit the same source, so each hands its state to the other
   * rather than discarding it — see the same pairing in `MovieFields`.
   */
  const toggleJson = () => {
    setError('')

    if (json === null) {
      setJson(plugin ? pluginToJson(draft) : '')
      return
    }

    if (!json.trim()) {
      setJson(null)
      return
    }

    try {
      setDraft(readJson())
      setJson(null)
    } catch (jsonError) {
      setError(jsonError.message)
    }
  }

  const runTest = async () => {
    setError('')
    setTest({ running: true })
    try {
      // An edited URL must not be answered from the manifest read before it.
      forgetManifest(draft)
      const results = await searchStremio(draft, 'test')
      setTest({ results })
    } catch (testError) {
      setTest({ error: testError.message })
    }
  }

  const mode = json === null ? 'form' : 'json'
  /** Both directions are the same hand-off, so re-picking the current mode is a no-op. */
  const chooseMode = (next) => {
    if (next !== mode) toggleJson()
  }

  const modeSwitch = (
    <ModeSwitch
      value={mode}
      onChange={chooseMode}
      label="Editing mode"
      options={[
        { value: 'form', label: 'Form' },
        { value: 'json', label: 'JSON' },
      ]}
    />
  )

  const actions = (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={onCancel} className={ghostButtonClass}>
        Cancel
      </button>
      <button type="submit" className={buttonClass}>
        {plugin ? 'Save' : 'Add source'}
      </button>
    </div>
  )

  if (json !== null) {
    return (
      <form onSubmit={handleJsonSubmit} className="flex flex-col gap-4">
        {modeSwitch}

        <div>
          <label className={labelClass} htmlFor="plugin-json">
            Source JSON
          </label>
          <textarea
            id="plugin-json"
            rows={14}
            spellCheck="false"
            autoFocus
            className={`${inputClass} resize-y font-mono text-xs`}
            placeholder={JSON_EXAMPLE}
            value={json}
            onChange={(event) => setJson(event.target.value)}
          />
          <p className={helpClass}>The same shape the export writes, so sources can be shared.</p>
        </div>
        {error && <p className="text-danger text-xs">{error}</p>}
        {actions}
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {modeSwitch}

      <div>
        <label className={labelClass} htmlFor="plugin-name">
          Name
        </label>
        <input
          id="plugin-name"
          className={inputClass}
          autoFocus
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="plugin-referer">
          Referer
        </label>
        <input
          id="plugin-referer"
          className={inputClass}
          spellCheck="false"
          placeholder="https://example.com/"
          value={draft.referer}
          onChange={(event) => setDraft({ ...draft, referer: event.target.value })}
        />
        <p className={helpClass}>
          Given to movies added from this source, for playback. It cannot be sent on the API calls
          below — <code>Referer</code> is a forbidden header for <code>fetch</code>.
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="plugin-adpattern">
          Ad segment pattern
        </label>
        <input
          id="plugin-adpattern"
          className={`${inputClass} font-mono text-xs`}
          spellCheck="false"
          placeholder="^/ads/.+\.ts$"
          value={draft.adPattern}
          onChange={(event) => setDraft({ ...draft, adPattern: event.target.value })}
        />
        <p className={helpClass}>
          Also given to movies added from this source. Segments whose URI matches are cut from the
          playlist — the pattern names the ads, not the content.
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="plugin-manifest">
          Manifest URL
        </label>
        <input
          id="plugin-manifest"
          className={`${inputClass} font-mono text-xs`}
          spellCheck="false"
          placeholder="https://v3-cinemeta.strem.io/manifest.json"
          value={draft.url}
          onChange={(event) => setDraft({ ...draft, url: event.target.value })}
        />
        <p className={helpClass}>
          Searching uses the addon&apos;s catalogs; each episode&apos;s stream is resolved when you
          play it. Torrent-only addons will not work — there is no client here.
        </p>
      </div>

      <label className={checkboxRowClass}>
        <input
          type="checkbox"
          className={checkboxClass}
          checked={draft.enabled}
          onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
        />
        Search this source
      </label>

      {error && <p className="text-danger text-xs">{error}</p>}

      <div className="border-line flex items-center gap-3 border-t pt-3">
        <button type="button" onClick={runTest} className={ghostButtonClass}>
          Test
        </button>
        {test?.running && <p className="text-ink-faint text-xs">Searching…</p>}
        {test?.error && <p className="text-danger text-xs">{test.error}</p>}
        {test?.results && (
          <div className="text-ink-faint min-w-0 text-xs">
            <p>
              {test.results.length} result(s) for “test”.
              {!test.results.length && ' Check the URL and the results path.'}
            </p>
            {test.results[0] && (
              <p className="text-ink-muted truncate font-mono">
                id={test.results[0].id} title={test.results[0].title}
                {test.results[0].poster ? ` poster=${test.results[0].poster}` : ''}
              </p>
            )}
          </div>
        )}
      </div>

      {actions}
    </form>
  )
}
