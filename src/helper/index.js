import Storage from './Storage'

const settingsStorage = new Storage('settings')
const libraryStorage = new Storage('library')
const progressStorage = new Storage('progress')
const pluginStorage = new Storage('plugins')

// const indexedDB = new IndexedDBWrapper('MyAppDB', 'media', 2, [
//   { name: 'urlIndex', keyPath: 'url', options: { unique: true } },
// ])

export { libraryStorage, pluginStorage, progressStorage, settingsStorage }
