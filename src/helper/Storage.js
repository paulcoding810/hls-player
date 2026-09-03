export default class Storage {
  constructor(namespace = '') {
    this.namespace = namespace
  }

  async set(key, value) {
    const data = await this.get()
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [this.namespace]: { ...data, [key]: value } }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError)
        } else {
          resolve(true)
        }
      })
    })
  }

  async setValue(value) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [this.namespace]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError)
        } else {
          resolve(true)
        }
      })
    })
  }

  async get(key = null) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(this.namespace, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError)
        } else {
          resolve(key ? result[this.namespace]?.[key] : result[this.namespace])
        }
      })
    })
  }

  async clear() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(this.namespace, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError)
        } else {
          resolve(true)
        }
      })
    })
  }
}
