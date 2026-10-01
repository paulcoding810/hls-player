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
import { describeManifest, forgetManifest, readManifest } from '@/helper/stremio'
import { compilePattern } from '@/utils/playlist'

const JSON_EXAMPLE = `{
  "name": "My addon",
  "url": "https://addon.example.com/manifest.json",
  "referer": "https://example.com/",
  "adPattern": "^/ads/.+\\.ts$"
}`

/**
 * A source is a Stremio addon and a manifest URL; the protocol supplies the
 * rest. **Test** reads the manifest, which is what says whether the addon can
 * be searched and played here at all.
 */
export default function PluginFields({ plugin, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => structuredClone({ ...EMPTY_PLUGIN, ...(plugin ?? {}) }))
  const [error, setError] = useState('')
  const [json, setJson] = useState(null)
  const [test, setTest] = useState(null)

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('Give the addon a name — Test can fill it in.')
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
      throw new Error('Expected a single addon object.')
    }
    if (!String(parsed.name ?? '').trim()) throw new Error('Give the addon a "name".')
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
      const summary = describeManifest(await readManifest(draft))
      // The addon names itself; a blank name is filled rather than left to the user.
      if (!draft.name.trim() && summary.name)
        setDraft((current) => ({ ...current, name: summary.name }))
      setTest({ summary })
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
        {plugin ? 'Save' : 'Add addon'}
      </button>
    </div>
  )

  if (json !== null) {
    return (
      <form onSubmit={handleJsonSubmit} className="flex flex-col gap-4">
        {modeSwitch}

        <div>
          <label className={labelClass} htmlFor="plugin-json">
            Addon JSON
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
          <p className={helpClass}>The same shape the export writes, so addons can be shared.</p>
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
        <label className={labelClass} htmlFor="plugin-manifest">
          Manifest URL
        </label>
        <input
          id="plugin-manifest"
          className={`${inputClass} font-mono text-xs`}
          spellCheck="false"
          autoFocus
          placeholder="https://addon.example.com/manifest.json"
          value={draft.url}
          onChange={(event) => setDraft({ ...draft, url: event.target.value })}
        />
        <p className={helpClass}>
          The addon&apos;s install link; a <code>stremio://</code> one works too. It needs to offer
          streams over HTTP — torrent-only addons have nothing this player can open.
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="plugin-name">
          Name
        </label>
        <input
          id="plugin-name"
          className={inputClass}
          placeholder="Torrentio"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <p className={helpClass}>Left blank, Test fills in the name the addon gives itself.</p>
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
          Only for streams that need one and do not say so — an addon can name its own per stream,
          and that wins. Copied onto movies added from this source.
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

      <label className={checkboxRowClass}>
        <input
          type="checkbox"
          className={checkboxClass}
          checked={draft.enabled}
          onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
        />
        Search and browse this addon
      </label>

      {error && <p className="text-danger text-xs">{error}</p>}

      <div className="border-line flex items-center gap-3 border-t pt-3">
        <button type="button" onClick={runTest} className={ghostButtonClass}>
          Test
        </button>
        {test?.running && <p className="text-ink-faint text-xs">Reading the manifest…</p>}
        {test?.error && <p className="text-danger text-xs">{test.error}</p>}
        {test?.summary && (
          <div className="min-w-0 text-xs">
            <p className="text-ink-muted truncate">
              {test.summary.name || 'Unnamed addon'}
              {test.summary.version && (
                <span className="text-ink-faint"> v{test.summary.version}</span>
              )}
              <span className="text-ink-faint">
                {' '}
                · {test.summary.catalogs} catalog(s), {test.summary.searchable} searchable
              </span>
            </p>
            {test.summary.missing.length > 0 && (
              <p className="text-warn">
                Offers no {test.summary.missing.join(' or ')} —{' '}
                {test.summary.missing.includes('stream')
                  ? 'what it lists cannot be played here.'
                  : 'it will be missing from the Sources page.'}
              </p>
            )}
          </div>
        )}
      </div>

      {actions}
    </form>
  )
}
