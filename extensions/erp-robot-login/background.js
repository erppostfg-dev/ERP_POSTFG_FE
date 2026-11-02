/*
 * Reads a portal's login (its cookies, and the localStorage of an open portal tab) when the ERP page asks through
 * bridge.js, after the person confirmed it there. Only messages of this extension's own scripts arrive here.
 */
importScripts('portals.js')

const MAX_STORAGE_VALUE = 100_000

const portalCookies = async (portal) => {
  const all = (await Promise.all(portal.domains.map((domain) => chrome.cookies.getAll({ domain })))).flat()
  const seen = new Set()
  return all
    .filter((c) => {
      const k = `${c.name}|${c.domain}|${c.path}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .map(({ name, value, domain, path, expirationDate, httpOnly, secure, sameSite }) => ({ name, value, domain, path, expirationDate, httpOnly, secure, sameSite }))
}

/** The localStorage of an open portal tab (none open: nothing; the cookies alone are the login). */
const portalStorage = async (portal) => {
  try {
    const [tab] = await chrome.tabs.query({ url: portal.storageTabs })
    if (!tab?.id) return []
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (max) => Object.keys(localStorage).map((name) => ({ name, value: localStorage.getItem(name) ?? '' })).filter((i) => i.value.length <= max),
      args: [MAX_STORAGE_VALUE],
    })
    return res?.result ?? []
  } catch {
    return []
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false
  const portal = PORTALS[msg?.portal]
  if (!portal) return false
  if (msg.type === 'status') {
    portalCookies(portal).then((cookies) => reply({ loggedIn: isLoggedIn(portal, cookies) }), (err) => reply({ error: String(err?.message ?? err) }))
    return true
  }
  if (msg.type === 'login') {
    ;(async () => {
      const cookies = await portalCookies(portal)
      if (!isLoggedIn(portal, cookies)) return { error: `not logged in to the ${portal.label} in this browser: log in at ${portal.home} first` }
      return { cookies, localStorage: await portalStorage(portal) }
    })().then(reply, (err) => reply({ error: String(err?.message ?? err) }))
    return true
  }
  return false
})
