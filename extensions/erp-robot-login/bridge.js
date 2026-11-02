/*
 * Runs on the ERP's pages only (manifest content_scripts). The In-transit page asks with window.postMessage:
 *   { type: 'erp-robot-login:ping', id }                    -> { type: 'erp-robot-login:reply', id, version }
 *   { type: 'erp-robot-login:request', id, portal: 'myntra' } -> { ..., cookies, localStorage } or { ..., error }
 * A login is handed over only after the person confirms it, and only to this page's own window.
 */
const VERSION = chrome.runtime.getManifest().version
const LABELS = { myntra: 'Myntra Partner Portal' }

window.addEventListener('message', async (event) => {
  if (event.source !== window || event.origin !== location.origin) return
  const msg = event.data
  if (!msg || typeof msg !== 'object' || typeof msg.id !== 'string') return
  const reply = (body) => window.postMessage({ type: 'erp-robot-login:reply', id: msg.id, ...body }, location.origin)

  if (msg.type === 'erp-robot-login:ping') return reply({ version: VERSION })
  if (msg.type !== 'erp-robot-login:request' || !LABELS[msg.portal]) return

  const ok = window.confirm(
    `Hand your ${LABELS[msg.portal]} login to the ERP at ${location.host}?\n\n`
    + 'The in-transit robot will use it to download the files from the portal. Your password is not sent.',
  )
  if (!ok) return reply({ error: 'cancelled' })
  try {
    reply(await chrome.runtime.sendMessage({ type: 'login', portal: msg.portal }))
  } catch (err) {
    reply({ error: `the ERP Robot Login extension did not answer (${err?.message ?? err}); reload this page and try again` })
  }
})
