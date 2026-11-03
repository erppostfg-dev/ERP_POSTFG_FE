/*
 * The portals whose login the extension can hand to the ERP. A cookie of any other site is never read.
 * loginHost + loginCookies: the portal's own login (without one the robot lands on the login page).
 */
const PORTALS = {
  myntra: {
    label: 'Myntra Partner Portal',
    home: 'https://partners.myntrainfo.com/',
    domains: ['myntra.com', 'myntrainfo.com'],
    loginHost: 'partnersapi.myntrainfo.com',
    loginCookies: ['session', 'erp.at'],
    storageTabs: 'https://partners.myntrainfo.com/*',
  },
}

const isLoggedIn = (portal, cookies) =>
  cookies.some((c) => c.domain.replace(/^\./, '') === portal.loginHost && portal.loginCookies.includes(c.name))
