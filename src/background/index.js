import { MESSAGE } from '@/helper/constants'
import { openPlayer } from '@/helper/player'
import api from '@/utils/api'

/**
 * Chrome rewrites request headers through declarativeNetRequest session rules,
 * Firefox through a blocking webRequest listener (the API it kept in MV3).
 * `convert.js` decides which permission ships, so feature detection picks the
 * implementation here.
 */
const useWebRequest = typeof api.webRequest?.onBeforeSendHeaders?.addListener === 'function'

const RESOURCE_TYPES = ['main_frame', 'sub_frame', 'xmlhttprequest', 'media', 'other']

/** tabId -> [[headerName, value], ...] */
const tabHeaders = new Map()

function toEntries(headers) {
  return Object.entries(headers || {})
    .map(([name, value]) => [name.toLowerCase(), typeof value === 'string' ? value.trim() : ''])
    .filter(([, value]) => value !== '')
}

async function applyHeaders(tabId, headers) {
  const entries = toEntries(headers)
  if (!entries.length) return clearHeaders(tabId)

  tabHeaders.set(tabId, entries)
  if (useWebRequest) return

  // The tab id doubles as the rule id: one rule per player tab, always unique.
  await api.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [tabId],
    addRules: [
      {
        id: tabId,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: entries.map(([header, value]) => ({ header, operation: 'set', value })),
        },
        condition: { tabIds: [tabId], resourceTypes: RESOURCE_TYPES },
      },
    ],
  })
}

async function clearHeaders(tabId) {
  tabHeaders.delete(tabId)
  if (useWebRequest) return
  await api.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] })
}

/** Session rules outlive the service worker, so drop the ones whose tab is gone. */
async function dropOrphanRules() {
  if (useWebRequest) return
  try {
    const [rules, tabs] = await Promise.all([
      api.declarativeNetRequest.getSessionRules(),
      api.tabs.query({}),
    ])
    const liveTabIds = new Set(tabs.map((tab) => tab.id))
    const orphans = rules.map((rule) => rule.id).filter((id) => !liveTabIds.has(id))
    if (orphans.length) {
      await api.declarativeNetRequest.updateSessionRules({ removeRuleIds: orphans })
    }
  } catch (error) {
    console.warn('failed to clean up header rules', error)
  }
}

if (useWebRequest) {
  api.webRequest.onBeforeSendHeaders.addListener(
    ({ tabId, requestHeaders }) => {
      const entries = tabHeaders.get(tabId)
      if (!entries || !requestHeaders) return
      const overridden = entries.map(([name]) => name)
      const headers = requestHeaders.filter(
        (header) => !overridden.includes(header.name.toLowerCase()),
      )
      entries.forEach(([name, value]) => headers.push({ name, value }))
      return { requestHeaders: headers }
    },
    { urls: ['<all_urls>'] },
    ['blocking', 'requestHeaders'],
  )
}

api.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab?.id

  if (request?.type === MESSAGE.APPLY_HEADERS || request?.type === MESSAGE.CLEAR_HEADERS) {
    if (tabId === undefined) {
      sendResponse({ ok: false, error: 'header rules can only be scoped to a tab' })
      return
    }
    const task =
      request.type === MESSAGE.APPLY_HEADERS
        ? applyHeaders(tabId, request.headers)
        : clearHeaders(tabId)

    task
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message ?? String(error) }))
    return true
  }
})

api.tabs.onRemoved.addListener((tabId) => {
  clearHeaders(tabId).catch(() => {})
})

api.action.onClicked.addListener(() => {
  openPlayer().catch((error) => console.warn('failed to open the player', error))
})

api.runtime.onInstalled.addListener((details) => {
  dropOrphanRules()
  if (details.reason === 'install') openPlayer()
})

api.runtime.onStartup?.addListener(dropOrphanRules)
