const status = document.getElementById('status')

chrome.runtime.sendMessage({ type: 'status', portal: 'myntra' }).then((r) => {
  if (r?.error) {
    status.textContent = `Could not check: ${r.error}`
    return
  }
  status.className = `status ${r?.loggedIn ? 'ok' : 'no'}`
  status.textContent = r?.loggedIn
    ? 'Logged in to the Myntra Partner Portal: press Connect Myntra in the ERP.'
    : 'Not logged in to the Myntra Partner Portal in this browser yet.'
})

document.getElementById('open').addEventListener('click', () => chrome.tabs.create({ url: PORTALS.myntra.home }))
