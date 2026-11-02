# ERP Robot Login (Chrome extension)

Myntra's bot check blocks the in-transit robot from logging in from the server. This extension lets the person who runs
the report log in to the Myntra Partner Portal in their own Chrome and hand that login to the ERP. The robot then uses
it until it expires.

## Install (once per computer)

1. Copy this folder (`extensions/erp-robot-login`) to the computer.
2. Open `chrome://extensions`, turn on **Developer mode** (top right).
3. **Load unpacked** → choose the folder. "ERP Robot Login" appears; pin it from the puzzle icon if you like.

## Use (whenever the Myntra fetch says the login is needed)

1. Log in at https://partners.myntrainfo.com and choose **FBM/PPMP/MDirect** (the extension's icon has a button for it).
2. In the ERP: **In-transit Stock → Daily run → Myntra → Connect Myntra**, and confirm.
3. The ERP saves the login and fetches Myntra_GRN.csv with it straight away: the Myntra row shows that fetch. When it is
   done, the login works; build or fetch as usual.

Logging in to the portal again later (on any computer) can end the robot's login: connect again after that.

## What it sends

Only the cookies of myntra.com / myntrainfo.com (and the localStorage of an open partners.myntrainfo.com tab), only
after you confirm, only to the ERP page you are on (`*.mcaffeine.com` and localhost, see `manifest.json`). Your
password is never read. The server keeps the login where only the robot reads it, and logs only how many cookies came.

## Files

- `manifest.json`: permissions (cookies of the two Myntra sites, the ERP pages the bridge runs on).
- `bridge.js`: runs on the ERP pages and answers the In-transit page (`src/lib/robotLogin.ts`).
- `background.js`, `portals.js`: read the portal's login.
- `popup.html`, `popup.js`: shows whether this browser is logged in to the portal.

The server side is `POST /intransit/robots/:source/login` (ERP_POSTFG_BE `src/modules/intransit/robot-login.ts`).
If the ERP moves to a domain outside `*.mcaffeine.com`, add it to `content_scripts.matches` and reload the extension.
