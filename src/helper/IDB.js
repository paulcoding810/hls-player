export default class IndexedDBWrapper {
  constructor(dbName, storeName, version = 1, indexes = []) {
    this.dbName = dbName
    this.storeName = storeName
    this.version = version
    this.indexes = indexes // Array of { name: "indexName", keyPath: "fieldName", options: {} }
    this.db = null
  }

  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)

      request.onupgradeneeded = (event) => {
        this.db = event.target.result
        let store

        if (!this.db.objectStoreNames.contains(this.storeName)) {
          store = this.db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true })
        } else {
          store = event.target.transaction.objectStore(this.storeName)
        }

        // Create indexes if they don't exist
        this.indexes.forEach(({ name, keyPath, options = {} }) => {
          if (!store.indexNames.contains(name)) {
            store.createIndex(name, keyPath, options)
          }
        })
      }

      request.onsuccess = (event) => {
        this.db = event.target.result
        resolve(this.db)
      }

      request.onerror = (event) => {
        reject(event.target.error)
      }
    })
  }

  async getTransaction(mode) {
    if (!this.db) await this.open()
    return this.db.transaction(this.storeName, mode).objectStore(this.storeName)
  }

  async add(data) {
    return new Promise(async (resolve, reject) => {
      const store = await this.getTransaction('readwrite')
      const request = store.add(data)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async get(id) {
    return new Promise(async (resolve, reject) => {
      const store = await this.getTransaction('readonly')
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getByIndex(indexName, value) {
    return new Promise(async (resolve, reject) => {
      const store = await this.getTransaction('readonly')
      const index = store.index(indexName)
      const request = index.get(value)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        console.error('getByIndex failed', indexName, value, request.error)
        resolve(null)
      }
    })
  }

  async getAll() {
    return new Promise(async (resolve, reject) => {
      const store = await this.getTransaction('readonly')
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async update(data) {
    return new Promise(async (resolve, reject) => {
      const store = await this.getTransaction('readwrite')
      const request = store.put(data)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async delete(id) {
    return new Promise(async (resolve, reject) => {
      const store = await this.getTransaction('readwrite')
      const request = store.delete(id)

      request.onsuccess = () => resolve(true)
      request.onerror = () => reject(request.error)
    })
  }

  async clear() {
    return new Promise(async (resolve, reject) => {
      const store = await this.getTransaction('readwrite')
      const request = store.clear()

      request.onsuccess = () => resolve(true)
      request.onerror = () => reject(request.error)
    })
  }
}
