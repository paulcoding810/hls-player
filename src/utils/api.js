/**
 * Firefox only returns promises from the `browser` namespace — its `chrome`
 * alias is callback-style — so every awaited extension call goes through this.
 */
export const api = globalThis.browser ?? globalThis.chrome

export default api
