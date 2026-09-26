/** The slice of `chrome.storage.local` that `src/helper/Storage.js` uses. */
export function stubStorage(initial = {}) {
  const store = { ...initial }

  globalThis.chrome = {
    runtime: {},
    storage: {
      local: {
        get: (namespace, done) => done({ [namespace]: store[namespace] }),
        set: (values, done) => {
          Object.assign(store, values)
          done()
        },
        remove: (namespace, done) => {
          delete store[namespace]
          done()
        },
      },
    },
  }

  return store
}

/** Nothing under test may reach the network; every suite says what it returns. */
export function stubFetch(handler) {
  globalThis.fetch = handler
}

export const jsonReply = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
})
