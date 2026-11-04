import { ApiError } from '../api/client'
import type {
  D2cCounts, D2cDetail, D2cHeaderBody, D2cInvoiceRow, D2cInwardJob, D2cLine, D2cLineBody, D2cListItem, D2cOptions, D2cParams, D2cProposedTransfer, D2cSku,
  D2cSoJob, D2cStandIn, D2cStockCheck, D2cSyncStatus, D2cTimelineItem, D2cUploadPreview,
} from '../api/d2cTransfers'

/*
 * DEV-ONLY preview of D2C Internal Transfers without the backend (2026-11-03), switched on with the in-transit preview
 * (VITE_INTRANSIT_PREVIEW=true, `npm run dev` only; src/dev/intransitPreview.ts registers it). MADE-UP warehouses,
 * SKUs and transfers kept in memory: creating / editing / cancelling here never reaches a database.
 * Phase 5 (Uniware sale orders), also made up: the gate is "not live" with TEST_FACILITY as the only test warehouse;
 * stock is invented per SKU; Create SO answers created (refused for the gift kit Mcaf930); Close short cancels every
 * open line (one SKU is "already packed" and refused).
 * Phase 6 (Uniware status sync), made up: last good sync 7 min ago, Sync now "runs" for 2 s; the partly dispatched
 * transfer has a second package still PACKED; the packed one shows a per-transfer sync error.
 * Phase 7 (inward POs + GRN), made up: two TEST_FACILITY transfers are dispatched (one route has no vendor code), the
 * GRN transfer is short by 3% with no reason yet; Create inward PO answers created (status CREATED = waiting for the
 * warehouse's approval in Uniware); the variance reason closes the transfer when it was the last open one.
 */

const wait = <T>(v: T, ms = 200): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms))
const fail = (status: number, code: string, message: string, details?: unknown) => Promise.reject(new ApiError(status, code, message, details))
const DAY = 86_400_000
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const at = (d: string, min = 0) => new Date(Date.parse(`${d}T05:00:00Z`) + min * 60_000).toISOString()
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const PEOPLE = ['Neha P.', 'Ajay Singh', 'Rohit Mehta']
const TAGS: Record<string, string> = { screen: 'TOOL', bulk_csv: 'TOOL', tool_api: 'TOOL · API', uniware: 'UNIWARE', system: 'SYSTEM' }

// ---- masters ---------------------------------------------------------------------------------------------------
const SENDERS = [
  { id: 1, code: 'GGN_WAREHOUSE', name: 'Gurgaon mother warehouse' }, { id: 2, code: 'MUM_WAREHOUSE2', name: 'Mumbai mother warehouse' },
  { id: 3, code: 'KOL_WAREHOUSE', name: 'Kolkata mother warehouse' }, { id: 4, code: 'mCaff_Hyderabad2', name: 'Hyderabad D2C' },
  { id: 5, code: 'TEST_FACILITY', name: 'TEST FACILITY (Uniware test warehouse)' },
]
const GATE = { live: false, envWrites: false, open: false, testOnly: false, testFacilities: ['TEST_FACILITY'] }
/** The backend gate (not live): sender AND receiving warehouse must both be test warehouses. */
const gateAllows = (sender: string | null, receiving: string | null) =>
  GATE.open || (!!sender && !!receiving && GATE.testFacilities.includes(sender) && GATE.testFacilities.includes(receiving))
const gateText = (sender: string | null, receiving: string | null) => `Uniware changes are switched off for ${sender ?? '-'} -> ${receiving ?? '-'}`
/** [id, channel, location, receiving id, receiving code, PO prefix] */
const LOCS: [string, string, string, number, string, string][] = [
  ['101', 'McaffeineB2C', 'Kolkata3', 11, 'mCaff_Kolkata3', 'mCaff_Kolkata3'], ['102', 'McaffeineB2C', 'Bangalore2', 12, 'mCaff_Bangalore2', 'mCaff_Bangalore2'],
  ['103', 'McaffeineB2C', 'Hyderabad3', 13, 'mCaff_Hyderabad3', 'mCaff_Hyderabad3'], ['104', 'McaffeineB2C', 'Nagpur', 14, 'Mcaff_Nagpur', 'Mcaff_Nagpur'],
  ['201', 'HYP_Website', 'Chennai', 21, 'HYP_SPCHN', 'HYP_SPCHN'], ['202', 'HYP_Website', 'Nagpur', 22, 'HYP_DLNAG', 'HYP_Nagpur'],
  ['301', 'GGN_WAREHOUSE', 'Gurgaon', 1, 'GGN_WAREHOUSE', 'GGN_WAREHOUSE'], ['501', 'KOL_WAREHOUSE', 'Kolkata_MH', 3, 'KOL_WAREHOUSE', 'KOL_WAREHOUSE'],
  ['105', 'McaffeineB2C', 'DS_NCR_PD_MOTHERHUB', 15, 'DS_NCR_PD_MOTHERHUB', 'Mcaff_Motherhub'],
  // the fully test route (d2c-test-setup): TEST_FACILITY sends to itself
  ['106', 'McaffeineB2C', 'TEST', 5, 'TEST_FACILITY', 'TEST_FACILITY'],
]
const CHANNELS = ['McaffeineB2C', 'HYP_Website', 'GGN_WAREHOUSE', 'MUM_WAREHOUSE2', 'KOL_WAREHOUSE']
const TYPES = ['Regular', 'Internal', 'Freebee']
const TYPE_TAG: Record<string, string> = { Regular: '', Internal: 'Int', Freebee: 'Freebee' }
const STAGES = ['draft', 'sale_order', 'packed', 'ready_to_ship', 'invoiced', 'partly_dispatched', 'dispatched', 'inward_po_created', 'grn', 'closed', 'cancelled']
/**
 * The routes of sender + location (one per Uniware channel); the vendor code is missing on a few. GGN_WAREHOUSE ->
 * DS_NCR_PD_MOTHERHUB has TWO Uniware channels (as the user's sheet), so the form / upload must pick one.
 */
const routesOf = (senderId: number, locId: string) => {
  const loc = LOCS.find((l) => l[0] === locId)
  if (!loc || (loc[3] === senderId && !GATE.testFacilities.includes(loc[4])) || senderId === 4) return []
  const n = senderId * 7 + Number(locId)
  const base = { senderId, senderCode: SENDERS.find((s) => s.id === senderId)!.code, isActive: true, missingVendor: locId === '104' || n % 5 === 0, missingCustomer: locId === '202', missingChannel: false }
  if (locId === '105') return senderId === 1 ? [{ ...base, routeId: n, uniwareChannelCode: 'D2C_TRANSFER_MCAFF_L' }, { ...base, routeId: n + 1000, uniwareChannelCode: 'D2C_TRANSFER_HYP_L' }] : []
  return [{ ...base, routeId: n, uniwareChannelCode: loc[1] === 'McaffeineB2C' ? 'D2C_TRANSFER_MCAFF' : loc[1] === 'HYP_Website' ? 'D2C_TRANSFER_HYP' : 'MWH_TRANSFER' }]
}
/** The route a transfer uses: the only one, else the chosen route id / Uniware channel (null = missing or wrong). */
const routeOf = (senderId: number, locId: string, choice: { routeId?: number; channel?: string } = {}) => {
  const all = routesOf(senderId, locId)
  if (all.length < 2) return all[0] ?? null
  return all.find((r) => (choice.routeId !== undefined ? r.routeId === choice.routeId : !!choice.channel && r.uniwareChannelCode.toLowerCase() === choice.channel.toLowerCase())) ?? null
}
const options = (): D2cOptions => ({
  senders: SENDERS,
  receivingFacilities: [...new Map(LOCS.map((l) => [l[3], { id: l[3], code: l[4] }])).values()],
  channels: CHANNELS,
  locations: CHANNELS.map((channel) => ({
    channel,
    locations: LOCS.filter((l) => l[1] === channel).map(([id, , location, rid, rcode, prefix]) => ({
      id, location, poPrefix: prefix, isActive: true, receivingFacilityId: rid, receivingCode: rcode, receivingUsable: true,
      routes: SENDERS.flatMap((s) => routesOf(s.id, id)),
    })),
  })),
  types: TYPES, priorities: ['P1', 'P2', 'P3'], stages: STAGES, sources: ['screen', 'bulk_csv'],
  defaults: { priority: 'P2', type: 'Regular', poDate: today(), expiryDays: 15 }, live: false, uniwareGate: GATE,
})
const SKUS: D2cSku[] = ([
  ['Mcaf407', 'Coffee Body Scrub 100g', 'mCaffeine', 499], ['Mcaf112', 'Coffee Face Wash 100ml', 'mCaffeine', 349], ['Mcaf218', 'Espresso Body Wash 300ml', 'mCaffeine', 399],
  ['Mcaf301', 'Coffee Under Eye Cream 30ml', 'mCaffeine', 499], ['Mcaf520', 'Coffee Lip Balm 12g', 'mCaffeine', 249], ['Mcaf611', 'Naked & Raw Coffee Shampoo 250ml', 'mCaffeine', 449],
  ['Mcaf702', 'Green Tea Face Serum 30ml', 'mCaffeine', 599], ['Mcaf815', 'Coffee Hair Oil 100ml', 'mCaffeine', 399], ['HYP101', 'Hyphen Barrier Care Cream 50g', 'Hyphen', 549],
  ['HYP204', 'Hyphen SPF 50 Sunscreen 50ml', 'Hyphen', 499], ['HYP310', 'Hyphen Niacinamide Serum 30ml', 'Hyphen', 599], ['HYP415', 'Hyphen Ceramide Moisturiser 50g', 'Hyphen', 649],
  ['HYP520', 'Hyphen All I Need Sunstick 20g', 'Hyphen', 699], ['Mcaf930', 'Coffee Gift Kit (4 in 1)', 'mCaffeine', 1299],
] as const).map(([code, name, brand, mrp]) => ({ code, name, brand, mrp, soUnitPrice: Math.round(mrp * 15) / 100 }))

// ---- transfers ---------------------------------------------------------------------------------------------------
type Row = D2cDetail
const store: Row[] = []
let serial = 0
let uidN = 9000
const refSerial: Record<string, number> = {}
const refOf = (prefix: string, poDate: string, type: string) => {
  const k = `${prefix}|${poDate}`
  refSerial[k] = (refSerial[k] ?? 0) + 1
  const [y, m, d] = poDate.split('-')
  return `${prefix}|${d}${MONTHS[Number(m) - 1]}${y}|${TYPE_TAG[type] ?? ''}${refSerial[k]}`
}
const peekRef = (prefix: string, poDate: string, type: string) => {
  const [y, m, d] = poDate.split('-')
  return `${prefix}|${d}${MONTHS[Number(m) - 1]}${y}|${TYPE_TAG[type] ?? ''}${(refSerial[`${prefix}|${poDate}`] ?? 0) + 1}`
}
/** Transfer ID month = the day it is created (user, 2026-11-03). */
const codeOf = (created: string) => {
  const [y, m] = created.split('-').map(Number)
  const fy = m >= 4 ? y : y - 1
  return `IT-${String(fy % 100).padStart(2, '0')}${String((fy + 1) % 100).padStart(2, '0')}-${String(m).padStart(2, '0')}-${String(++serial).padStart(3, '0')}`
}
let logN = 1
const ev = (action: string, when: string, source: string, by: string | null, extra: Partial<D2cTimelineItem> = {}): D2cTimelineItem => ({
  id: String(logN++), at: when, by, byEmail: null, action, source, tag: TAGS[source] ?? source.toUpperCase(), field: null, lineId: null, oldValue: null,
  newValue: null, remark: null, uniwareStatus: null, batchId: null, ...extra,
})

const totalsOf = (lines: D2cLine[]) => {
  const t = lines.reduce((s, l) => ({
    lines: s.lines + 1, skus: s.skus + (l.updatedQty > 0 ? 1 : 0), qty: s.qty + l.qty, updatedQty: s.updatedQty + l.updatedQty, dispatched: s.dispatched + l.dispatched,
    received: s.received + l.received, gmv: s.gmv + (l.gmv ?? 0), poValue: s.poValue + (l.poValue ?? 0), updatedGmv: s.updatedGmv + (l.updatedGmv ?? 0), updatedPoValue: s.updatedPoValue + (l.updatedPoValue ?? 0),
  }), { lines: 0, skus: 0, qty: 0, updatedQty: 0, dispatched: 0, received: 0, gmv: 0, poValue: 0, updatedGmv: 0, updatedPoValue: 0 })
  return { ...t, openBalance: t.updatedQty - t.dispatched, cancelled: t.qty - t.updatedQty }
}
const refresh = (r: Row) => {
  r.totals = totalsOf(r.lines)
  const final = r.stage === 'closed' || r.stage === 'cancelled'
  r.expired = !final && !!r.expiryDate && r.expiryDate < today() && r.totals.openBalance > 0
  r.partly = r.totals.dispatched > 0 && r.totals.openBalance > 0
  const draft = r.stage === 'draft' && (!r.soState || r.soState === 'failed')
  const soOpen = r.soState === 'created' && !final
  const undispatched = ['sale_order', 'packed', 'ready_to_ship', 'invoiced'].includes(r.stage ?? '') && r.totals.dispatched === 0
  r.soNotFound = (r.soState === 'requested' || r.soState === 'unknown') && !!r.soRequestedAt && Date.now() - Date.parse(r.soRequestedAt) > 24 * 3600_000
  r.can = {
    edit: draft, cancel: draft || (soOpen && undispatched), changeExpiry: !final, createSo: draft, closeShort: soOpen && r.totals.openBalance > 0,
    uniwareWrite: gateAllows(r.sender.code, r.receiving.code),
  }
  r.editBlockedBecause = draft ? null : `only a draft can be changed here (it is ${r.stage})`
  r.editToken = `t${r.uid}-${r.timeline.length}`
}
const lineOf = (id: number, sku: D2cSku, qty: number, dispatched = 0, received = 0, n = 1): D2cLine => {
  const mrp = sku.mrp ?? 0
  const gmv = Math.round(mrp * qty * 100) / 100
  const po = Math.round(mrp * 0.15 * qty * 100) / 100
  return { id: String(id), srNo: String(n), skuCode: sku.code, skuName: sku.name, brand: sku.brand, qty, updatedQty: qty, cancelled: 0, dispatched, received, allocated: 0,
    variance: received - dispatched, mrp, gmv, poValue: po, updatedGmv: gmv, updatedPoValue: po, removed: false }
}
let lineN = 1

type Seed = { sender: number; loc: string; ago: number; prio: string; type?: string; stage: string; src?: string; skus: [number, number][]; ship?: number; recv?: number; expiryIn?: number }
const SEEDS: Seed[] = [
  { sender: 1, loc: '101', ago: 6, prio: 'P1', stage: 'draft', skus: [[0, 1200], [1, 800], [2, 600]], expiryIn: -2 },
  { sender: 1, loc: '104', ago: 2, prio: 'P1', stage: 'draft', src: 'bulk_csv', skus: [[3, 400], [4, 900]] },
  { sender: 2, loc: '102', ago: 3, prio: 'P2', stage: 'draft', skus: [[5, 350], [6, 240], [7, 300], [0, 500]] },
  { sender: 3, loc: '101', ago: 1, prio: 'P2', type: 'Internal', stage: 'draft', src: 'bulk_csv', skus: [[1, 1500]] },
  { sender: 1, loc: '201', ago: 0, prio: 'P3', stage: 'draft', skus: [[8, 200], [9, 260], [10, 180]] },
  { sender: 2, loc: '202', ago: 4, prio: 'P3', type: 'Freebee', stage: 'draft', src: 'bulk_csv', skus: [[13, 60]] },
  { sender: 1, loc: '103', ago: 8, prio: 'P1', stage: 'sale_order', skus: [[0, 700], [2, 450]] },
  { sender: 2, loc: '101', ago: 9, prio: 'P2', stage: 'packed', skus: [[5, 300], [7, 200]] },
  { sender: 3, loc: '102', ago: 10, prio: 'P2', stage: 'partly_dispatched', skus: [[1, 600], [4, 400]], ship: 0.7 },
  { sender: 1, loc: '202', ago: 12, prio: 'P2', stage: 'dispatched', skus: [[8, 300], [11, 220]], ship: 1 },
  { sender: 2, loc: '103', ago: 14, prio: 'P3', stage: 'inward_po_created', skus: [[6, 250]], ship: 1 },
  { sender: 1, loc: '102', ago: 18, prio: 'P1', stage: 'grn', skus: [[0, 900], [3, 300]], ship: 1, recv: 0.97 },
  { sender: 3, loc: '201', ago: 21, prio: 'P3', stage: 'closed', skus: [[9, 120]], ship: 1, recv: 1 },
  { sender: 2, loc: '101', ago: 5, prio: 'P2', stage: 'cancelled', skus: [[5, 100]] },
  // phase 5: the test warehouse (the only one the gate lets through), a refused draft, a request not found after 24 h
  { sender: 5, loc: '106', ago: 0, prio: 'P1', type: 'Internal', stage: 'draft', skus: [[0, 3], [3, 2]] },
  { sender: 5, loc: '106', ago: 1, prio: 'P2', type: 'Internal', stage: 'draft', skus: [[13, 2]] },
  { sender: 5, loc: '106', ago: 3, prio: 'P2', type: 'Internal', stage: 'sale_order', skus: [[1, 5], [4, 4]] },
  // phase 7: dispatched at the test warehouse, waiting for the inward PO (the Nagpur route has no vendor code)
  { sender: 5, loc: '106', ago: 2, prio: 'P1', type: 'Internal', stage: 'dispatched', skus: [[1, 6], [4, 2]], ship: 1 },
  { sender: 5, loc: '104', ago: 2, prio: 'P2', type: 'Internal', stage: 'dispatched', skus: [[0, 4]], ship: 1 },
]
const seed = () => {
  const t = today()
  for (const s of SEEDS) {
    const loc = LOCS.find((l) => l[0] === s.loc)!
    const sender = SENDERS.find((x) => x.id === s.sender)!
    const poDate = addDays(t, -s.ago)
    const type = s.type ?? 'Regular'
    const src = s.src ?? 'screen'
    const uid = String(++uidN)
    const shipped = s.ship ?? 0
    const lines = s.skus.map(([i, q], n) => {
      const d = Math.floor(q * shipped)
      return lineOf(lineN++, SKUS[i], q, d, Math.floor(d * (s.recv ?? 0)), n + 1)
    })
    const stageIdx = STAGES.indexOf(s.stage)
    const timeline: D2cTimelineItem[] = [ev('created', at(poDate), src, PEOPLE[s.sender % 3], { newValue: '' })]
    const step = (st: string, k: number, source: string, by: string | null, action = 'stage_changed') => {
      if (STAGES.indexOf(s.stage) >= STAGES.indexOf(st) && s.stage !== 'cancelled') timeline.push(ev(action, at(addDays(poDate, k), 60 * k), source, by, { field: 'transferStage', newValue: st, uniwareStatus: source === 'uniware' ? st.toUpperCase() : null }))
    }
    step('sale_order', 0, 'tool_api', PEOPLE[1], 'so_created')
    step('packed', 1, 'uniware', null)
    step('ready_to_ship', 1, 'uniware', null)
    step('invoiced', 2, 'uniware', null)
    if (stageIdx >= STAGES.indexOf('partly_dispatched')) step(s.stage === 'partly_dispatched' ? 'partly_dispatched' : 'dispatched', 2, 'uniware', null)
    step('inward_po_created', 3, 'tool_api', PEOPLE[0], 'inward_po_created')
    step('grn', 5, 'uniware', null, 'grn_received')
    if (s.stage === 'cancelled') timeline.push(ev('cancelled', at(addDays(poDate, 1)), 'screen', PEOPLE[0], { field: 'transferStage', oldValue: 'draft', newValue: 'cancelled', remark: 'Raised twice by mistake' }))
    const soCode = stageIdx >= 1 && s.stage !== 'cancelled' ? `erp_it_${poDate.replace(/-/g, '')}${String(uidN % 1000).padStart(3, '0')}` : null
    const invoiced = stageIdx >= STAGES.indexOf('invoiced') && s.stage !== 'cancelled'
    const dispatched = shipped > 0
    const inward = stageIdx >= STAGES.indexOf('inward_po_created') && s.stage !== 'cancelled'
    const r: Row = {
      uid, transferCode: codeOf(poDate), reference: refOf(loc[5], poDate, type), poDate, entryDate: poDate, expiryDate: addDays(poDate, s.expiryIn !== undefined ? s.ago + s.expiryIn : 15),
      sender: { id: sender.id, code: sender.code }, receiving: { id: loc[3], code: loc[4] }, channel: loc[1], location: loc[2], locationId: loc[0], priority: s.prio, type,
      uniwareChannel: routeOf(sender.id, loc[0])?.uniwareChannelCode ?? null, routeId: routeOf(sender.id, loc[0])?.routeId ?? null,
      stage: s.stage, stageAt: timeline.at(-1)!.at, soState: soCode ? 'created' : null, soError: null, soCode, invoiceNo: invoiced ? `PEP/IT/${18900 + uidN % 100}` : null,
      inwardPo: inward ? `${soCode}-1` : null, dispatchDate: dispatched ? addDays(poDate, 2) : null, grnDate: s.recv ? addDays(poDate, 5) : null, balanceClosedReason: null,
      rtsDate: stageIdx >= STAGES.indexOf('ready_to_ship') && s.stage !== 'cancelled' ? addDays(poDate, 1) : null,
      remarks: s.ago === 6 ? 'Festive top-up for Kolkata' : null, source: src, group: src === 'bulk_csv' ? 'G1' : null, totals: totalsOf(lines),
      invoices: [],
      expired: false, partly: false, syncError: s.stage === 'packed' ? 'Uniware read failed: 500 from /services/rest/v1/oms/saleorder/get: Internal Error' : null,
      lastSyncedAt: soCode ? new Date(Date.now() - 7 * 60_000).toISOString() : null, createdAt: at(poDate), updatedAt: timeline.at(-1)!.at,
      soRequestedAt: soCode ? at(poDate, 30) : null, soNotFound: false,
      lines, route: null, routeChannels: [], fileUrl: null, batchId: null, editToken: '',
      can: { edit: false, cancel: false, changeExpiry: false, createSo: false, closeShort: false, uniwareWrite: false }, editBlockedBecause: null, timeline,
    }
    const c = { invoices: invoiced ? 1 : 0, dispatched: dispatched ? 1 : 0, awaitingInwardPo: dispatched && !inward ? 1 : 0, inwardPos: inward ? 1 : 0, varianceOpen: s.stage === 'grn' ? 1 : 0 }
    store.push(withInvoices(r, c, invoiced, dispatched, inward, s))
  }
  // a refused draft and a lost request (made-up answers)
  const refused = store.find((r) => r.sender.code === 'TEST_FACILITY' && r.lines.some((l) => l.skuCode === 'Mcaf930'))
  if (refused) Object.assign(refused, { soState: 'failed', soCode: 'erp_it_20261102004', soRequestedAt: at(addDays(t, -1), 40), soError: 'INVALID_ITEM_SKU: Mcaf930 is a bundle at TEST_FACILITY' })
  const lost = store.find((r) => r.stage === 'draft' && r.sender.code === 'MUM_WAREHOUSE2' && r.priority === 'P3')
  if (lost) Object.assign(lost, { soState: 'unknown', soCode: 'erp_it_20261101002', soRequestedAt: at(addDays(t, -2)), soError: 'no answer from Uniware: The operation was aborted due to timeout' })
  store.forEach(refresh)
}
/** The list shape keeps invoice counts; the detail keeps invoice rows: one made-up invoice per shipped transfer. */
const counters = new Map<string, D2cListItem['invoices']>()
const withInvoices = (r: Row, c: D2cListItem['invoices'], invoiced: boolean, dispatched: boolean, inward: boolean, s: Seed): Row => {
  counters.set(r.uid, c)
  r.invoices = invoiced ? [{
    id: `inv${r.uid}`, saleOrderCode: r.soCode, shippingPackageCode: `PKG${r.uid}`, invoiceCode: r.invoiceNo, invoiceDisplayCode: r.invoiceNo, invoiceDate: r.updatedAt,
    packageStatus: dispatched ? 'DISPATCHED' : 'READY_TO_SHIP', dispatchedAt: dispatched ? at(r.dispatchDate as string) : null, units: r.totals.dispatched,
    inwardPoCode: inward ? r.inwardPo : null, inwardPoState: inward ? 'created' : null, inwardPoError: null, inwardPoStatus: inward ? 'APPROVED' : null,
    grnCodes: s.recv ? [{ code: `G${8200 + Number(r.uid) % 100}`, date: at(r.grnDate as string), units: r.totals.received, status: 'COMPLETE', rejected: 0 }] : null,
    receivedUnits: r.totals.received, grnCompletedAt: s.recv ? at(r.grnDate as string) : null, variance: s.recv ? r.totals.received - r.totals.dispatched : 0,
    varianceReason: s.stage === 'closed' && r.totals.received !== r.totals.dispatched ? 'short_received' : null, varianceNote: null,
    inwardPoRequestedAt: inward ? at(addDays(r.poDate as string, 3)) : null,
    varianceOpen: s.stage === 'grn' && r.totals.received !== r.totals.dispatched, canVarianceReason: !!s.recv && r.totals.received !== r.totals.dispatched,
  }] : []
  if (inward && r.invoices[0]) r.invoices[0].inwardPoStatus = s.recv ? 'COMPLETE' : 'APPROVED'
  // partly dispatched: the rest waits in a second package (packed, no invoice yet)
  if (s.stage === 'partly_dispatched') {
    r.invoices.push({
      id: `inv${r.uid}b`, saleOrderCode: r.soCode, shippingPackageCode: `PKG${r.uid}B`, invoiceCode: null, invoiceDisplayCode: null, invoiceDate: null, packageStatus: 'PACKED',
      dispatchedAt: null, units: r.totals.updatedQty - r.totals.dispatched, inwardPoCode: null, inwardPoState: null, inwardPoError: null, inwardPoStatus: null, grnCodes: null,
      receivedUnits: 0, grnCompletedAt: null, variance: 0, varianceReason: null, varianceNote: null,
    })
  }
  refresh(r)
  return r
}
const ensure = () => { if (!store.length) seed() }
const asListItem = (r: Row): D2cListItem => {
  const { lines: _l, invoices: _i, route: _r, routeChannels: _rc, fileUrl: _f, batchId: _b, editToken: _e, can: _c, editBlockedBecause: _x, timeline: _t, ...head } = r
  return { ...head, invoices: counters.get(r.uid) ?? { invoices: 0, dispatched: 0, awaitingInwardPo: 0, inwardPos: 0, varianceOpen: 0 } }
}

// ---- list ----------------------------------------------------------------------------------------------------------
const listOf = (p: D2cParams, k: string): string[] => (Array.isArray(p[k]) ? (p[k]) : typeof p[k] === 'string' && p[k] ? [p[k]] : [])
const inTab = (r: Row, tab: string) => {
  const c = counters.get(r.uid)
  if (tab === 'draft') return r.stage === 'draft'
  if (tab === 'sale_orders') return r.soState === 'created' && r.totals.openBalance > 0 && r.stage !== 'cancelled'
  if (tab === 'create_inward_po') return !!c && c.awaitingInwardPo > 0
  if (tab === 'inward_pos') return r.stage !== 'closed' && !!c && c.inwardPos > 0
  return true
}
const matches = (r: Row, p: D2cParams) => {
  const q = typeof p.q === 'string' ? p.q.toLowerCase() : ''
  if (q && ![r.transferCode, r.reference, r.soCode, r.invoiceNo, r.inwardPo, ...r.lines.map((l) => `${l.skuCode} ${l.skuName}`)].some((v) => (v ?? '').toLowerCase().includes(q))) return false
  const has = (k: string, v: string | null) => { const l = listOf(p, k); return !l.length || l.includes(v ?? '') }
  if (!has('stage', r.stage) || !has('priority', r.priority) || !has('sender', r.sender.code) || !has('receiving', r.receiving.code) || !has('source', r.source)
    || !has('channel', r.channel) || !has('type', r.type)) return false
  if (typeof p.dateFrom === 'string' && (r.poDate ?? '') < p.dateFrom) return false
  if (typeof p.dateTo === 'string' && (r.poDate ?? '') > p.dateTo) return false
  if (p.expired !== undefined && String(r.expired) !== p.expired) return false
  return true
}
const sorted = (rows: Row[]) => [...rows].sort((a, b) => (a.priority ?? 'P9').localeCompare(b.priority ?? 'P9') || (a.poDate ?? '').localeCompare(b.poDate ?? '') || Number(a.uid) - Number(b.uid))

// ---- form ----------------------------------------------------------------------------------------------------------
const problemsOf = (h: D2cHeaderBody, lines: D2cLineBody[]) => {
  const out: { row: number; field: string; message: string }[] = []
  const all = routesOf(h.senderId, h.locationId)
  if (!all.length) out.push({ row: 1, field: 'location', message: 'no route from this dispatch warehouse to this location' })
  else if (!routeOf(h.senderId, h.locationId, { routeId: h.routeId })) out.push({ row: 1, field: 'uniwareChannel', message: `the route has ${all.length} Uniware channels (${all.map((r) => r.uniwareChannelCode).join(', ')}): pick one` })
  lines.forEach((l, i) => {
    if (!SKUS.some((s) => s.code === l.skuCode)) out.push({ row: i + 1, field: 'skuCode', message: `SKU ${l.skuCode} is not an active SKU with an MRP` })
    if (!(l.qty > 0)) out.push({ row: i + 1, field: 'qty', message: 'qty must be a whole number above 0' })
  })
  return out
}
const linesFrom = (lines: D2cLineBody[]) => {
  const merged = new Map<string, number>()
  for (const l of lines) merged.set(l.skuCode, (merged.get(l.skuCode) ?? 0) + l.qty)
  return [...merged].map(([code, qty], n) => lineOf(lineN++, SKUS.find((s) => s.code === code)!, qty, 0, 0, n + 1))
}
const apply = (r: Row, h: D2cHeaderBody) => {
  const loc = LOCS.find((l) => l[0] === h.locationId)!
  const sender = SENDERS.find((s) => s.id === h.senderId)!
  const route = routeOf(h.senderId, h.locationId, { routeId: h.routeId })
  const all = routesOf(h.senderId, h.locationId)
  Object.assign(r, {
    uniwareChannel: route?.uniwareChannelCode ?? null, routeId: route?.routeId ?? null,
    route: route ? { id: route.routeId, uniwareChannelCode: route.uniwareChannelCode, customerCode: 'C', customerName: null, vendorCode: route.missingVendor ? null : 'V', isActive: true, missingVendor: route.missingVendor, missingCustomer: route.missingCustomer, missingChannel: false } : null,
    routeChannels: all.map((x) => ({ routeId: x.routeId, uniwareChannelCode: x.uniwareChannelCode })),
    sender: { id: sender.id, code: sender.code }, receiving: { id: loc[3], code: loc[4] }, channel: loc[1], location: loc[2], locationId: loc[0], poDate: h.poDate,
    priority: h.priority, type: h.type, expiryDate: h.expiry, remarks: h.remarks || null, updatedAt: new Date().toISOString(),
  })
}

// ---- upload ----------------------------------------------------------------------------------------------------------
const TEMPLATE = ['Channel', 'Location', 'PO Date', 'PO Number', 'Sr No', 'SKU Name', 'SKU Code', 'Channel SKU Code', 'Qty', 'GMV', 'PO Value', 'Dispatch Location', 'Priority', 'Group', 'Type', 'PO Expiry Date', 'Uniware Channel']
const cells = (line: string) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
const dayOf = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : /^(\d{2})-(\d{2})-(\d{4})$/.test(v) ? v.replace(/^(\d{2})-(\d{2})-(\d{4})$/, '$3-$2-$1') : null)
const previewFile = async (file: File): Promise<D2cUploadPreview> => {
  const [head = '', ...body] = (await file.text()).replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  const cols = cells(head).map((c) => c.toLowerCase().replace(/[^a-z]/g, ''))
  const col = (r: string[], name: string) => r[cols.indexOf(name.toLowerCase().replace(/[^a-z]/g, ''))] ?? ''
  const groups = new Map<string, D2cProposedTransfer>()
  const rows = body.map((line, i) => {
    const r = cells(line)
    const row = i + 2
    const errors: { field: string; message: string }[] = []
    const warnings: { field: string; message: string }[] = []
    const channel = col(r, 'Channel')
    const loc = LOCS.find((l) => l[1].toLowerCase() === channel.toLowerCase() && (l[2].toLowerCase() === col(r, 'Location').toLowerCase() || l[4].toLowerCase() === col(r, 'Location').toLowerCase()))
    const sender = SENDERS.find((s) => s.code.toLowerCase() === col(r, 'Dispatch Location').toLowerCase())
    const sku = SKUS.find((s) => s.code.toLowerCase() === col(r, 'SKU Code').toLowerCase())
    const qty = Number(col(r, 'Qty'))
    const poDate = dayOf(col(r, 'PO Date'))
    const priority = col(r, 'Priority') || 'P2'
    const type = col(r, 'Type') || 'Regular'
    if (!CHANNELS.some((c) => c.toLowerCase() === channel.toLowerCase())) errors.push({ field: 'Channel', message: `${channel || '(empty)'} is not a transfer channel` })
    else if (!loc) errors.push({ field: 'Location', message: `${col(r, 'Location') || '(empty)'} is not a transfer location of ${channel}` })
    if (!sender) errors.push({ field: 'Dispatch Location', message: `${col(r, 'Dispatch Location') || '(empty)'} is not a warehouse allowed for transfers` })
    if (!sku) errors.push({ field: 'SKU Code', message: `${col(r, 'SKU Code') || '(empty)'} is not an active SKU with an MRP` })
    if (!Number.isInteger(qty) || qty <= 0) errors.push({ field: 'Qty', message: 'must be a whole number above 0' })
    if (!poDate) errors.push({ field: 'PO Date', message: 'must be a date (YYYY-MM-DD or DD-MM-YYYY)' })
    if (!['P1', 'P2', 'P3'].includes(priority)) errors.push({ field: 'Priority', message: 'must be P1, P2 or P3' })
    if (sku && col(r, 'SKU Name') && col(r, 'SKU Name') !== sku.name) warnings.push({ field: 'SKU Name', message: `differs from the master (${sku.name}): the master name is used` })
    const all = sender && loc ? routesOf(sender.id, loc[0]) : []
    const route = sender && loc ? routeOf(sender.id, loc[0], { channel: col(r, 'Uniware Channel') }) : null
    if (sender && loc && !all.length) errors.push({ field: 'Dispatch Location', message: `no route from ${sender.code} to ${loc[2]}` })
    else if (sender && loc && !route) errors.push({ field: 'Uniware Channel', message: `route has ${all.length} Uniware channels (${all.map((x) => x.uniwareChannelCode).join(', ')}), fill Uniware Channel` })
    if (route?.missingVendor) warnings.push({ field: 'Route', message: 'vendor code missing: the inward PO is blocked until it is filled in Masters' })
    const key = col(r, 'Group') || `${sender?.code}|${loc?.[0]}|${route?.routeId ?? ''}|${poDate}|${priority}`
    const g = groups.get(key) ?? {
      key, group: col(r, 'Group') || null, rows: [], valid: true, senderId: sender?.id ?? null, senderCode: sender?.code ?? null, channel: loc?.[1] ?? channel, locationId: loc?.[0] ?? null,
      location: loc?.[2] ?? null, receivingId: loc?.[3] ?? null, receivingCode: loc?.[4] ?? null, prefix: loc?.[5] ?? null, poDate, priority, type,
      expiry: poDate ? addDays(poDate, 15) : null, remarks: null, route: route ? { id: route.routeId, customerCode: 'C', vendorCode: route.missingVendor ? null : 'V', uniwareChannelCode: route.uniwareChannelCode } : null,
      routeChannels: all.map((x) => x.uniwareChannelCode),
      lines: [], totalUnits: 0, referencePreview: null,
    }
    g.rows.push(row)
    if (errors.length) g.valid = false
    if (sku && qty > 0) {
      const mrp = sku.mrp ?? 0
      g.lines.push({ skuCode: sku.code, skuName: sku.name, brand: sku.brand, qty, mrp, gmv: mrp * qty, poValue: Math.round(mrp * 15 * qty) / 100, rows: [row] })
      g.totalUnits += qty
    }
    groups.set(key, g)
    return { row, errors, warnings }
  })
  const transfers = [...groups.values()]
  for (const t of transfers) if (t.valid && t.prefix && t.poDate) t.referencePreview = peekRef(t.prefix, t.poDate, t.type ?? 'Regular')
  const errorCount = rows.reduce((n, r) => n + r.errors.length, 0)
  return wait({ fileName: file.name, rowCount: rows.length, canImport: errorCount === 0 && rows.length > 0, errorCount, warningCount: rows.reduce((n, r) => n + r.warnings.length, 0), rows, transfers }, 500)
}

// ---- phase 5: Uniware sale orders (made up) --------------------------------------------------------------------------
const stockOf = (sku: string) => {
  const h = [...sku].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7)
  const inventory = h % 1700
  const openSale = h % 230
  const inventoryBlocked = h % 90
  return { inventory, openSale, inventoryBlocked, available: Math.max(0, inventory - openSale - inventoryBlocked) }
}
const stockCheckOf = (ids: string[]): D2cStockCheck => {
  ensure()
  const rows = ids.map((id) => store.find((r) => r.uid === id)).filter((r): r is Row => !!r)
  const total = new Map<string, number>()
  for (const r of rows) for (const l of r.lines) if (l.updatedQty > 0) total.set(`${r.sender.code}|${l.skuCode}`, (total.get(`${r.sender.code}|${l.skuCode}`) ?? 0) + l.updatedQty)
  return {
    formula: 'available = inventory - openSale - inventoryBlocked (never below 0)',
    transfers: rows.map((r) => {
      const lines = r.lines.filter((l) => l.updatedQty > 0).map((l) => {
        const s = stockOf(l.skuCode ?? '')
        return { lineId: l.id, skuCode: l.skuCode ?? '', needed: l.updatedQty, ...s, short: l.updatedQty > s.available, shortOverall: (total.get(`${r.sender.code}|${l.skuCode}`) ?? 0) > s.available }
      })
      return { uid: r.uid, transferCode: r.transferCode, facility: r.sender.code, stage: r.stage, error: null, short: lines.some((l) => l.short || l.shortOverall), lines }
    }),
  }
}
const jobs = new Map<string, D2cSoJob>()
let soSerial = 0
const soCodeOf = () => `erp_it_${today().replace(/-/g, '')}${String(++soSerial).padStart(3, '0')}`
/** One transfer through reserve -> call -> confirm, in memory. */
const sendSo = (r: Row, warning: string | undefined): D2cSoJob['results'][number] => {
  const now = new Date().toISOString()
  if (warning) r.timeline.push(ev('stock_warning', now, 'tool_api', 'Preview (no login)', { remark: warning }))
  r.soCode = r.soCode ?? soCodeOf()
  r.soRequestedAt = now
  r.timeline.push(ev('so_requested', now, 'tool_api', 'Preview (no login)', { field: 'orderNo1', newValue: r.soCode }))
  if (r.lines.some((l) => l.skuCode === 'Mcaf930' && l.updatedQty > 0)) {
    Object.assign(r, { soState: 'failed', soError: 'INVALID_ITEM_SKU: Mcaf930 is a bundle at TEST_FACILITY' })
    r.timeline.push(ev('so_failed', now, 'tool_api', 'Preview (no login)', { field: 'soState', oldValue: 'requested', newValue: 'failed', remark: r.soError }))
    refresh(r)
    return { uid: r.uid, transferCode: r.transferCode, outcome: 'failed', soCode: r.soCode, error: r.soError }
  }
  Object.assign(r, { soState: 'created', soError: null, stage: 'sale_order', stageAt: now, updatedAt: now })
  r.timeline.push(ev('so_created', now, 'tool_api', 'Preview (no login)', { field: 'soState', oldValue: 'requested', newValue: 'created', uniwareStatus: `CREATED: ${r.lines.map((l) => `L${l.id} CREATED`).join(', ')}` }))
  r.timeline.push(ev('stage_changed', now, 'tool_api', 'Preview (no login)', { field: 'transferStage', oldValue: 'draft', newValue: 'sale_order' }))
  refresh(r)
  return { uid: r.uid, transferCode: r.transferCode, outcome: 'created', soCode: r.soCode, error: null }
}
const startJob = (ids: string[], warnings: Record<string, string>): Promise<D2cSoJob> => {
  ensure()
  const rows = ids.map((id) => store.find((r) => r.uid === id))
  const job: D2cSoJob = { id: `job${Date.now()}`, status: 'running', total: ids.length, done: 0, startedAt: new Date().toISOString(), finishedAt: null, results: [] }
  const todo: Row[] = []
  ids.forEach((id, i) => {
    const r = rows[i]
    if (!r) job.results.push({ uid: id, transferCode: null, outcome: 'skipped', soCode: null, error: `No internal transfer ${id}`, code: 'D2C_NOT_FOUND' })
    else if (!gateAllows(r.sender.code, r.receiving.code)) job.results.push({ uid: id, transferCode: r.transferCode, outcome: 'skipped', soCode: null, error: gateText(r.sender.code, r.receiving.code), code: 'D2C_NOT_LIVE' })
    else todo.push(r)
  })
  job.done = job.results.length
  if (!todo.length && job.results.every((x) => x.code === 'D2C_NOT_LIVE')) return fail(409, 'D2C_NOT_LIVE', 'Uniware changes are switched off: only the test warehouses may be used until D2C transfers go live')
  jobs.set(job.id, job)
  todo.forEach((r, i) => setTimeout(() => {
    job.results.push(sendSo(r, warnings[r.uid]))
    job.done += 1
    if (job.done >= job.total) Object.assign(job, { status: 'done', finishedAt: new Date().toISOString() })
  }, 900 * (i + 1)))
  if (!todo.length) Object.assign(job, { status: 'done', finishedAt: new Date().toISOString() })
  return wait(job)
}
const closeShortOf = (id: string, reason: string) => {
  const r = store.find((x) => x.uid === id)
  if (!r) return fail(404, 'D2C_NOT_FOUND', `No internal transfer ${id}`)
  if (!gateAllows(r.sender.code, r.receiving.code)) return fail(409, 'D2C_NOT_LIVE', `${gateText(r.sender.code, r.receiving.code)}: only the test warehouses may be used until D2C transfers go live`)
  const open = r.lines.filter((l) => l.updatedQty > l.dispatched)
  // made up: the first open line of a packed transfer is "already packed" in Uniware
  const refusedLine = r.stage === 'packed' ? open[0] : undefined
  const cancelled = open.filter((l) => l !== refusedLine)
  const updated = cancelled.map((l) => `${l.skuCode} ${l.updatedQty} -> ${l.dispatched}`)
  for (const l of cancelled) { l.updatedQty = l.dispatched; l.cancelled = l.qty - l.updatedQty }
  const now = new Date().toISOString()
  const dispatched = r.lines.reduce((n, l) => n + l.dispatched, 0)
  const stage = dispatched === 0 && !refusedLine ? 'cancelled' : r.stage === 'partly_dispatched' && !refusedLine ? 'dispatched' : r.stage
  r.timeline.push(ev('balance_closed', now, 'tool_api', 'Preview (no login)', { field: 'balanceClosedReason', newValue: 'close_short', remark: `${reason} | cancelled in Uniware: ${cancelled.map((l) => l.skuCode).join(', ')}`, uniwareStatus: 'PROCESSING' }))
  if (stage !== r.stage) r.timeline.push(ev('stage_changed', now, 'tool_api', 'Preview (no login)', { field: 'transferStage', oldValue: r.stage, newValue: stage }))
  Object.assign(r, { balanceClosedReason: 'close_short', stage, updatedAt: now })
  refresh(r)
  return wait({
    ...r, closeShort: {
      uid: r.uid, stage: r.stage as string, cancelled: cancelled.map((l) => ({ itemCode: `L${l.id}`, sku: l.skuCode ?? '' })),
      refused: refusedLine ? [{ itemCode: `L${refusedLine.id}`, sku: refusedLine.skuCode ?? '', why: 'Uniware: SALE_ORDER_ITEM_NOT_CANCELLABLE (already packed)' }] : [], skipped: [], updated,
    },
  })
}

// ---- phase 7: inward POs + GRN (made up) ---------------------------------------------------------------------------
const invoiceRowsOf = (tab: string, p: D2cParams): D2cInvoiceRow[] => sorted(store.filter((r) => matches(r, p))).flatMap((r) => r.invoices.flatMap((i) => {
  const state = i.inwardPoState
  const wanted = tab === 'create_inward_po' ? !!i.dispatchedAt && (!state || state === 'failed') : r.stage !== 'closed' && ['requested', 'created', 'unknown'].includes(state ?? '')
  if (!wanted) return []
  const route = routeOf(r.sender.id ?? 0, r.locationId ?? '', { routeId: r.routeId ?? undefined })
  const vendorCode = route && !route.missingVendor ? `${(r.receiving.code ?? '').slice(0, 14)}_V` : null
  const blocked = state === 'created' || state === 'requested' || state === 'unknown' ? `inward PO ${state}`
    : !vendorCode ? `vendor code missing on route ${r.sender.code ?? '-'} -> ${r.receiving.code ?? '-'}: fill it in Masters`
      : !gateAllows(r.sender.code, r.receiving.code) ? gateText(r.sender.code, r.receiving.code) : null
  return [{
    id: i.id, uid: r.uid, transferCode: r.transferCode, reference: r.reference, soCode: r.soCode, stage: r.stage, priority: r.priority, sender: r.sender.code,
    receiving: r.receiving.code, vendorCode, vendorMissing: !vendorCode, invoiceNo: i.invoiceDisplayCode ?? i.invoiceCode, shippingPackageCode: i.shippingPackageCode ?? '',
    invoiceDate: i.invoiceDate, dispatchedAt: i.dispatchedAt, units: i.units, inwardPoCode: i.inwardPoCode, inwardPoState: state, inwardPoError: i.inwardPoError,
    inwardPoStatus: i.inwardPoStatus, inwardPoRequestedAt: i.inwardPoRequestedAt ?? null, grnCodes: i.grnCodes, receivedUnits: i.receivedUnits, grnCompletedAt: i.grnCompletedAt,
    variance: i.variance, varianceOpen: !!i.varianceOpen, varianceReason: i.varianceReason, varianceNote: i.varianceNote,
    canCreate: blocked === null, createBlockedBecause: blocked, canVarianceReason: !!i.canVarianceReason,
  }]
}))
const inwardJobs = new Map<string, D2cInwardJob>()
/** Stage of a dispatched transfer from its invoices (the backend's deriveStage, short). */
const restage = (r: Row) => {
  if (r.totals.openBalance > 0) return
  const shipped = r.invoices.filter((i) => i.dispatchedAt)
  const stage = shipped.some((i) => i.inwardPoState !== 'created') ? 'dispatched' : shipped.some((i) => !i.grnCompletedAt) ? 'inward_po_created'
    : shipped.some((i) => i.variance !== 0 && !i.varianceReason) ? 'grn' : 'closed'
  if (stage !== r.stage) {
    r.timeline.push(ev('stage_changed', new Date().toISOString(), 'tool_api', 'Preview (no login)', { field: 'transferStage', oldValue: r.stage, newValue: stage }))
    r.stage = stage
  }
}
const countersOf = (r: Row): D2cListItem['invoices'] => ({
  invoices: r.invoices.length, dispatched: r.invoices.filter((i) => i.dispatchedAt).length,
  awaitingInwardPo: r.invoices.filter((i) => i.dispatchedAt && (!i.inwardPoState || i.inwardPoState === 'failed')).length,
  inwardPos: r.invoices.filter((i) => ['requested', 'created', 'unknown'].includes(i.inwardPoState ?? '')).length,
  varianceOpen: r.invoices.filter((i) => i.varianceOpen).length,
})
const startInwardJob = (ids: string[]): Promise<D2cInwardJob> => {
  ensure()
  const job: D2cInwardJob = { id: `ipo${Date.now()}`, kind: 'inward_po', status: 'running', total: ids.length, done: 0, startedAt: new Date().toISOString(), finishedAt: null, results: [] }
  const todo: { r: Row; i: Row['invoices'][number] }[] = []
  for (const id of ids) {
    const r = store.find((x) => x.invoices.some((i) => i.id === id))
    const i = r?.invoices.find((x) => x.id === id)
    if (!r || !i) job.results.push({ invoiceId: id, uid: null, transferCode: null, invoiceNo: null, outcome: 'skipped', inwardPoCode: null, error: `No invoice ${id} of an internal transfer`, code: 'D2C_INVOICE_NOT_FOUND' })
    else if (!gateAllows(r.sender.code, r.receiving.code)) job.results.push({ invoiceId: id, uid: r.uid, transferCode: r.transferCode, invoiceNo: i.invoiceDisplayCode, outcome: 'skipped', inwardPoCode: null, error: gateText(r.sender.code, r.receiving.code), code: 'D2C_NOT_LIVE' })
    else todo.push({ r, i })
  }
  job.done = job.results.length
  if (!todo.length && job.results.length && job.results.every((x) => x.code === 'D2C_NOT_LIVE')) return fail(409, 'D2C_NOT_LIVE', 'Uniware changes are switched off: only the test warehouses may be used until D2C transfers go live')
  inwardJobs.set(job.id, job)
  todo.forEach(({ r, i }, k) => setTimeout(() => {
    const now = new Date().toISOString()
    const n = Math.max(0, ...r.invoices.map((x) => Number((x.inwardPoCode ?? '').split('-').pop()) || 0)) + 1
    i.inwardPoCode = i.inwardPoCode ?? `${r.soCode ?? 'erp_it_x'}-${n}`
    Object.assign(i, { inwardPoState: 'created', inwardPoStatus: 'CREATED', inwardPoError: null, inwardPoRequestedAt: now })
    r.timeline.push(ev('inward_po_requested', now, 'tool_api', 'Preview (no login)', { field: 'inwardPoCode', newValue: i.inwardPoCode, remark: i.invoiceDisplayCode }))
    r.timeline.push(ev('inward_po_created', now, 'tool_api', 'Preview (no login)', { field: 'inwardPoState', oldValue: 'requested', newValue: 'created', remark: `${i.invoiceDisplayCode ?? ''} | ${i.inwardPoCode}`, uniwareStatus: 'PO CREATED' }))
    r.inwardPo = r.invoices.filter((x) => x.inwardPoState === 'created').map((x) => x.inwardPoCode).join(', ')
    restage(r)
    counters.set(r.uid, countersOf(r))
    refresh(r)
    job.results.push({ invoiceId: i.id, uid: r.uid, transferCode: r.transferCode, invoiceNo: i.invoiceDisplayCode, outcome: 'created', inwardPoCode: i.inwardPoCode, error: null })
    job.done += 1
    if (job.done >= job.total) Object.assign(job, { status: 'done', finishedAt: new Date().toISOString() })
  }, 900 * (k + 1)))
  if (!todo.length) Object.assign(job, { status: 'done', finishedAt: new Date().toISOString() })
  return wait(job)
}
const varianceReasonOf = (invoiceId: string, reason: string, note: string) => {
  ensure()
  const r = store.find((x) => x.invoices.some((i) => i.id === invoiceId))
  const i = r?.invoices.find((x) => x.id === invoiceId)
  if (!r || !i) return fail(404, 'D2C_INVOICE_NOT_FOUND', `No invoice ${invoiceId} of an internal transfer`)
  if (!i.grnCompletedAt || i.variance === 0) return fail(409, 'D2C_NOT_EDITABLE', `${r.transferCode} invoice ${i.invoiceDisplayCode ?? ''} cannot be changed: no variance`)
  const old = i.varianceReason
  if (reason === 'other' && !note) return fail(400, 'VALIDATION_FAILED', 'Validation failed', [{ field: 'note', message: 'a note is required when the reason is "other"' }])
  Object.assign(i, { varianceReason: reason, varianceNote: note || null, varianceOpen: false, canVarianceReason: true })
  r.timeline.push(ev('variance_reason', new Date().toISOString(), 'screen', 'Preview (no login)', { field: 'varianceReason', oldValue: old, newValue: reason, remark: `${i.invoiceDisplayCode ?? ''} | variance ${i.variance}${note ? ` | ${note}` : ''}` }))
  restage(r)
  counters.set(r.uid, countersOf(r))
  refresh(r)
  return wait(r)
}

const csv = (rows: (string | number | null)[][]) => rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(',')).join('\r\n')

/** The stand-in, answering while `on()` (the preview user is signed in). */
/** The made-up sync status: last good sync 7 min before the page opened; Sync now "runs" for 2 s. */
const sync: D2cSyncStatus = {
  lastStartedAt: null, lastEndedAt: null, lastOkAt: new Date(Date.now() - 7 * 60_000).toISOString(), lastError: null,
  counts: { reconciled: 0, candidates: 6, read: 6, changed: 1, unchanged: 4, errors: 1, notStarted: 0 }, nextDelayMin: 30, trigger: 'timer', timerOn: true,
  running: false, queued: false, nextRunAt: new Date(Date.now() + 23 * 60_000).toISOString(), syncMinutes: 30, minutesAgo: 7,
}
const syncView = (): D2cSyncStatus => ({ ...sync, minutesAgo: sync.lastOkAt ? Math.floor((Date.now() - Date.parse(sync.lastOkAt)) / 60_000) : null })
const syncNowOf = () => {
  if (sync.running) return wait({ ...syncView(), queued: true, state: 'queued' as const })
  sync.running = true
  sync.lastStartedAt = new Date().toISOString()
  setTimeout(() => {
    sync.running = false
    sync.lastOkAt = sync.lastEndedAt = new Date().toISOString()
    sync.trigger = 'manual'
  }, 2000)
  return wait({ ...syncView(), state: 'started' as const })
}

export const d2cStandIn = (on: () => boolean): D2cStandIn => ({
  on,
  list: (p) => {
    ensure()
    const all = sorted(store.filter((r) => inTab(r, String(p.tab ?? 'overview')) && matches(r, p)))
    const page = Number(p.page ?? 1)
    const size = Number(p.pageSize ?? 100)
    return wait({ data: all.slice((page - 1) * size, page * size).map(asListItem), meta: { total: all.length } })
  },
  counts: (p) => {
    ensure()
    const rows = store.filter((r) => matches(r, p))
    // the two invoice tabs count invoices (the rows they show), the others transfers
    return wait(Object.fromEntries(['draft', 'sale_orders', 'create_inward_po', 'inward_pos', 'overview'].map((t) => [t,
      t === 'create_inward_po' || t === 'inward_pos' ? invoiceRowsOf(t, p).length : rows.filter((r) => inTab(r, t)).length])) as D2cCounts)
  },
  options: () => wait(options()),
  skus: (q) => wait(SKUS.filter((s) => !q || `${s.code} ${s.name}`.toLowerCase().includes(q.toLowerCase())), 150),
  nextReference: ({ locationId, poDate, type }) => {
    const loc = LOCS.find((l) => l[0] === locationId)
    return loc ? wait({ reference: peekRef(loc[5], poDate, type), note: 'may change on save' }) : fail(422, 'D2C_NO_MAPPING', 'No transfer location: add it in Masters')
  },
  get: (id) => { ensure(); const r = store.find((x) => x.uid === id); return r ? wait(r) : fail(404, 'D2C_NOT_FOUND', `No internal transfer ${id}`) },
  create: (h, lines) => {
    ensure()
    const problems = problemsOf(h, lines)
    if (problems.length) return fail(422, 'D2C_INVALID', `The transfer was not saved: ${problems.length} problem(s), see details`, problems)
    const loc = LOCS.find((l) => l[0] === h.locationId)!
    const now = new Date().toISOString()
    const r = {
      ...structuredClone(store[0]), uid: String(++uidN), transferCode: codeOf(today()), reference: refOf(loc[5], h.poDate, h.type), stage: 'draft', soState: null, soCode: null, invoiceNo: null,
      inwardPo: null, dispatchDate: null, grnDate: null, source: 'screen', group: null, createdAt: now, stageAt: now, lines: linesFrom(lines), invoices: [],
      timeline: [ev('created', now, 'screen', 'Preview (no login)')],
    } as Row
    apply(r, h)
    counters.set(r.uid, { invoices: 0, dispatched: 0, awaitingInwardPo: 0, inwardPos: 0, varianceOpen: 0 })
    refresh(r)
    store.push(r)
    const route = routeOf(h.senderId, h.locationId)
    return wait({ ...r, warnings: route?.missingVendor ? [{ row: 1, field: 'route', message: 'vendor code missing on this route' }] : [] })
  },
  edit: (id, token, h, lines) => {
    const r = store.find((x) => x.uid === id)
    if (!r) return fail(404, 'D2C_NOT_FOUND', `No internal transfer ${id}`)
    if (r.editToken !== token) return fail(409, 'D2C_STALE', `${r.transferCode} was changed by someone else since you opened it: reload it and try again`)
    const problems = problemsOf(h, lines)
    if (problems.length) return fail(422, 'D2C_INVALID', `The transfer was not saved: ${problems.length} problem(s), see details`, problems)
    const retake = r.locationId !== h.locationId || r.poDate !== h.poDate || r.type !== h.type
    apply(r, h)
    if (retake) r.reference = refOf(LOCS.find((l) => l[0] === h.locationId)![5], h.poDate, h.type)
    r.lines = linesFrom(lines)
    r.timeline.push(ev('field_changed', new Date().toISOString(), 'screen', 'Preview (no login)', { field: 'qty', newValue: 'edited' }))
    refresh(r)
    return wait({ ...r, changed: ['qty'] })
  },
  cancel: (id, reason) => {
    const r = store.find((x) => x.uid === id)
    if (!r) return fail(404, 'D2C_NOT_FOUND', `No internal transfer ${id}`)
    const withSo = r.soState === 'created'
    if (withSo && !gateAllows(r.sender.code, r.receiving.code)) return fail(409, 'D2C_NOT_LIVE', `${gateText(r.sender.code, r.receiving.code)}: only the test warehouses may be used until D2C transfers go live`)
    const was = r.stage
    r.stage = 'cancelled'
    r.lines.forEach((l) => { l.updatedQty = 0; l.cancelled = l.qty })
    r.timeline.push(ev('cancelled', new Date().toISOString(), withSo ? 'tool_api' : 'screen', 'Preview (no login)', {
      field: 'transferStage', oldValue: was, newValue: 'cancelled', remark: withSo ? `${reason} | Uniware: cancelled ${r.lines.map((l) => `L${l.id}`).join(', ')}` : reason,
      uniwareStatus: withSo ? `CANCELLED: ${r.lines.map((l) => `L${l.id} CANCELLED`).join(', ')}` : null,
    }))
    refresh(r)
    return wait(r)
  },
  expiry: (id, date, remark) => {
    const r = store.find((x) => x.uid === id)
    if (!r) return fail(404, 'D2C_NOT_FOUND', `No internal transfer ${id}`)
    r.timeline.push(ev('expiry_changed', new Date().toISOString(), 'screen', 'Preview (no login)', { field: 'labelsLink', oldValue: r.expiryDate, newValue: date, remark: remark || null }))
    r.expiryDate = date
    refresh(r)
    return wait(r)
  },
  stockCheck: (ids) => wait(stockCheckOf(ids), 600),
  createSo: startJob,
  soJob: (jobId) => { const j = jobs.get(jobId); return j ? wait(j, 50) : fail(404, 'D2C_JOB_NOT_FOUND', `No sale order job ${jobId}`) },
  closeShort: closeShortOf,
  syncStatus: () => wait(syncView(), 100),
  syncNow: () => syncNowOf(),
  invoices: (p) => {
    ensure()
    const all = invoiceRowsOf(String(p.tab ?? ''), p)
    const page = Number(p.page ?? 1)
    const size = Number(p.pageSize ?? 100)
    return wait({ data: all.slice((page - 1) * size, page * size), meta: { total: all.length } })
  },
  createInwardPo: startInwardJob,
  inwardJob: (jobId) => { const j = inwardJobs.get(jobId); return j ? wait(j, 50) : fail(404, 'D2C_JOB_NOT_FOUND', `No job ${jobId}`) },
  varianceReason: varianceReasonOf,
  preview: previewFile,
  importFile: async (file) => {
    ensure()
    const p = await previewFile(file)
    if (!p.canImport) return fail(422, 'D2C_INVALID', `The transfer was not saved: ${p.errorCount} problem(s), see details`)
    const made = p.transfers.map((t) => {
      const lines = t.lines.map((l) => ({ skuCode: l.skuCode, qty: l.qty }))
      const h = { senderId: t.senderId as number, channel: t.channel as string, locationId: t.locationId as string, poDate: t.poDate as string, priority: t.priority as string, type: t.type as string, expiry: t.expiry as string, remarks: '', routeId: t.route?.id }
      const loc = LOCS.find((l) => l[0] === h.locationId)!
      const now = new Date().toISOString()
      const r = { ...structuredClone(store[0]), uid: String(++uidN), transferCode: codeOf(today()), reference: refOf(loc[5], h.poDate, h.type), stage: 'draft', soState: null, soCode: null,
        invoiceNo: null, inwardPo: null, dispatchDate: null, grnDate: null, source: 'bulk_csv', group: t.group, createdAt: now, stageAt: now, lines: linesFrom(lines), invoices: [],
        timeline: [ev('created', now, 'bulk_csv', 'Preview (no login)')] } as Row
      apply(r, h)
      counters.set(r.uid, { invoices: 0, dispatched: 0, awaitingInwardPo: 0, inwardPos: 0, varianceOpen: 0 })
      refresh(r)
      store.push(r)
      return { uid: r.uid, transferCode: r.transferCode, reference: r.reference as string, group: t.group, rows: t.rows }
    })
    return wait({ batchId: 'preview', fileUrl: null, notices: ['Preview: nothing was saved anywhere'], transfers: made, warnings: p.rows.flatMap((r) => r.warnings.map((w) => ({ row: r.row, ...w }))) })
  },
  template: () => `${TEMPLATE.join(',')}\r\n`,
  exportCsv: (p, level) => {
    ensure()
    const rows = sorted(store.filter((r) => inTab(r, String(p.tab ?? 'overview')) && matches(r, p)))
    const head = ['Transfer ID', 'Reference ID', 'PO Date', 'PO Expiry Date', 'Dispatch WH', 'Receiving WH', 'Channel', 'Location', 'Type', 'Priority', 'Stage']
    const h = (r: Row) => [r.transferCode, r.reference, r.poDate, r.expiryDate, r.sender.code, r.receiving.code, r.channel, r.location, r.type, r.priority, r.stage]
    if (level === 'sku') {
      return wait(csv([[...head, 'Sr No', 'SKU Code', 'SKU Name', 'Qty', 'Dispatched', 'Received', 'GMV', 'PO Value'],
        ...rows.flatMap((r) => r.lines.map((l) => [...h(r), l.srNo, l.skuCode, l.skuName, l.updatedQty, l.dispatched, l.received, l.updatedGmv, l.updatedPoValue]))]))
    }
    return wait(csv([[...head, 'SKUs', 'Total qty', 'Dispatched', 'Received', 'GMV', 'PO Value', 'Expired', 'Source'],
      ...rows.map((r) => [...h(r), r.totals.skus, r.totals.updatedQty, r.totals.dispatched, r.totals.received, r.totals.updatedGmv, r.totals.updatedPoValue, r.expired ? 'Yes' : 'No', r.source])]))
  },
})
