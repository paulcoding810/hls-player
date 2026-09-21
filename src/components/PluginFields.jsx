import { useState } from 'react'

import {
  buttonClass,
  checkboxClass,
  checkboxRowClass,
  ghostButtonClass,
  helpClass,
  inputClass,
  labelClass,
  linkButtonClass,
} from './ui'
import { EMPTY_PLUGIN, searchPlugin } from '@/helper/plugins'

const JSON_EXAMPLE = `{
  "name": "Example",
  "referer": "https://example.com/",
  "search": {
    "url": "https://api.example.com/search?q={query}",
    "list": "data.items",
    "fields": { "id": "vod_id", "title": "vod_name", "poster": "vod_pic" }
  },
  "details": {
    "url": "https://api.example.com/detail/{id}",
    "episodes": "data.play[0].list",
    "fields": { "title": "name", "src": "https://cdn.example.com/{path}.m3u8" }
  }
}`

/** One field of a plugin's `search`/`details` section. */
function Field({ id, label, help, value, placeholder, onChange }) {
  return (
    <div>
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`${inputClass} font-mono text-xs`}
        spellCheck="false"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {help && <p className={helpClass}>{help}</p>}
    </div>
  )
}

/**
 * A source is described, never programmed — MV3 forbids running code a user
 * supplies, so every box here is a path or a URL template. Testing against the
 * real API is the only practical way to get those paths right, hence **Test**.
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
    if (!draft.search.url.trim().includes('{query}')) {
      setError('The search URL needs a {query} placeholder.')
      return
    }
    onSave({ ...draft, name: draft.name.trim() })
  }

  const handleJsonSubmit = (event) => {
    event.preventDefault()
    try {
      const parsed = JSON.parse(json)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Expected a single source object.')
      }
      if (!String(parsed.name ?? '').trim()) throw new Error('Give the source a "name".')
      onSave({ ...structuredClone(EMPTY_PLUGIN), ...parsed, name: String(parsed.name).trim() })
    } catch (jsonError) {
      setError(jsonError instanceof SyntaxError ? 'That is not valid JSON.' : jsonError.message)
    }
  }

  const runTest = async () => {
    setError('')
    setTest({ running: true })
    try {
      const results = await searchPlugin(draft, 'test')
      setTest({ results })
    } catch (testError) {
      setTest({ error: testError.message })
    }
  }

  const actions = (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        className={`${linkButtonClass} mr-auto`}
        onClick={() => {
          setError('')
          setJson(json === null ? '' : null)
        }}
      >
        {json === null ? 'Paste JSON instead' : 'Use the form instead'}
      </button>
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

      <fieldset className="border-line flex flex-col gap-3 rounded-md border p-3">
        <legend className="text-ink-muted px-1 text-[11px] font-medium tracking-wider uppercase">
          Search
        </legend>
        <Field
          id="plugin-search-url"
          label="URL"
          placeholder="https://api.example.com/search?q={query}"
          help="{query} is replaced with what was typed, percent-encoded."
          value={draft.search.url}
          onChange={(url) => section('search', { url })}
        />
        <Field
          id="plugin-search-list"
          label="Results path"
          placeholder="data.items"
          help="Where the array of results sits. Dots and [0] indices."
          value={draft.search.list}
          onChange={(list) => section('search', { list })}
        />
        <div className="grid grid-cols-3 gap-3">
          <Field
            id="plugin-search-id"
            label="Id"
            placeholder="vod_id"
            value={draft.search.fields.id}
            onChange={(id) => fields('search', { id })}
          />
          <Field
            id="plugin-search-title"
            label="Title"
            placeholder="vod_name"
            value={draft.search.fields.title}
            onChange={(title) => fields('search', { title })}
          />
          <Field
            id="plugin-search-poster"
            label="Poster"
            placeholder="vod_pic"
            value={draft.search.fields.poster}
            onChange={(poster) => fields('search', { poster })}
          />
        </div>
      </fieldset>

      <fieldset className="border-line flex flex-col gap-3 rounded-md border p-3">
        <legend className="text-ink-muted px-1 text-[11px] font-medium tracking-wider uppercase">
          Details
        </legend>
        <Field
          id="plugin-details-url"
          label="URL"
          placeholder="https://api.example.com/detail/{id}"
          help="{id} is the id extracted above."
          value={draft.details.url}
          onChange={(url) => section('details', { url })}
        />
        <Field
          id="plugin-details-episodes"
          label="Episodes path"
          placeholder="data.play[0].list"
          value={draft.details.episodes}
          onChange={(episodes) => section('details', { episodes })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="plugin-details-title"
            label="Episode title"
            placeholder="name"
            value={draft.details.fields.title}
            onChange={(title) => fields('details', { title })}
          />
          <Field
            id="plugin-details-src"
            label="Episode URL"
            placeholder="url"
            help="A path, or a template like https://cdn.example.com/{path}.m3u8"
            value={draft.details.fields.src}
            onChange={(src) => fields('details', { src })}
          />
        </div>
      </fieldset>

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
