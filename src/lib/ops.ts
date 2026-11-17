// Ops + Demand Planning mock data layered on top of data.ts
import { computeInventory, overallInventory, type Channel } from './data'

// ---- deterministic pseudo-random -------------------------------------
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
const int = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1))

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}-${m}-${y}`
}
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
export const TODAY = '2026-10-05'

const BRANDS = ['mCaffeine', 'Hyphen'] as const
export const FACILITIES = ['MUM_WAREHOUSE2', 'GGN_WAREHOUSE', 'HYP_SRGGN', 'BLR_WAREHOUSE'] as const
export const CITIES = ['Hyderabad', 'Mumbai', 'Bengaluru', 'Gurgaon', 'Delhi', 'Pune', 'Chennai', 'Kolkata'] as const
export const OPS_CHANNELS = ['Zepto', 'Blinkit', 'Swiggy', 'BigBasket', 'Amazon', 'Flipkart', 'Myntra', 'Nykaa', 'Firstcry', 'Purplle'] as const
const ST_PLANNING = ['Confirmed', 'Hold', 'Partial', 'Cancelled'] as const
export const ST_WAREHOUSE = ['Pending', 'Picking', 'Packed', 'RTS', 'Dispatched'] as const
const FINAL_STATUSES = ['Open', 'Working', 'RTS', 'In transit', 'Delivered', 'Closed', 'Cancelled'] as const
export const TRANSPORTERS = ['Delhivery', 'Blue Dart', 'Safexpress', 'Gati', 'Xpressbees', 'Own Fleet'] as const
const CHANNEL_TYPE: Record<string, string> = { Zepto: 'Quick-commerce', Blinkit: 'Quick-commerce', Swiggy: 'Quick-commerce', BigBasket: 'Quick-commerce', Amazon: 'Marketplace', Flipkart: 'Marketplace', Myntra: 'Marketplace', Nykaa: 'Beauty', Purplle: 'Beauty', Firstcry: 'Baby & kids' }

const SKUS = [
  { code: 'MCF-VITC-30', name: 'Vitamin C Face Serum 30ml', mrp: 699, w: 0.09 },
  { code: 'MCF-COFF-100', name: 'Coffee Body Scrub 100g', mrp: 399, w: 0.14 },
  { code: 'HYP-NIAC-30', name: 'Niacinamide Serum 30ml', mrp: 549, w: 0.08 },
  { code: 'MCF-UNDER-EYE', name: 'Under Eye Cream 30g', mrp: 499, w: 0.06 },
  { code: 'HYP-SUNSCR-50', name: 'SPF 50 Sunscreen 50ml', mrp: 449, w: 0.07 },
  { code: 'MCF-SHAMP-250', name: 'Coffee Shampoo 250ml', mrp: 399, w: 0.28 },
  { code: 'MCF-FACEWASH', name: 'Charcoal Face Wash 100g', mrp: 349, w: 0.12 },
  { code: 'MCF-BEARD-KIT', name: 'Beard Grooming Kit', mrp: 999, w: 0.42 },
]

// ---- Shipment Status (PO level) --------------------------------------
export interface Shipment {
  uid: string; entryDate: string; poDate: string; facility: string; channel: string; location: string; poNumber: string
  brand: string; totalUnits: number; updatedQty: number; updatedGmv: number; updatedPoValue: number
  remarksPlanning: string; specialRemarksCopt: string; newShipmentRef: string
  statusPlanning: string; statusWarehouse: string; statusLogistics: string
  channelInwardingRemarks: string; dispatchRemarksLogistics: string; dispatchRemarksWarehouse: string
  dispatchTentative: string; workingDate: string; rtsDate: string; dispatchDate: string
  currentApptDate: string; firstApptDate: string; boxes: number; orderNo1: string; orderNo2: string; orderNo3: string
  poInwardCwh: string; pickListNo: string; workingType: string; inventoryRemarks: string; b2bRemarks: string
  volumetricWeight: number; channelType: string
  t1: string; d1: string; t2: string; d2: string; t3: string; d3: string
  apptLetter: string; poExpiry: string; invoiceDate: string; invoiceLink: string; cnLink: string; ewayLink: string
  invoiceValue: number; accountsRemarks: string; invoiceNo: string; invoiceCheckedBy: string; customerCode: string
  poEntryCount: number; deliveryDate: string; rescheduleLag: string; finalRemarks: string
  shipmentWeight: number; chargeableWeight: number; deliveryCharges: number; halting: number; unloading: number
  dedicatedVehicle: string; otherCharges: number; document: string; pod: string; proofDelivery: string
  tat: number; criticalDispatch: string; ratePerKg: number; deliveryType: string
  apptShootedDate: string; apptRequestedDate: string; remarksWarehouse: string; status: string
}

function mkShipment(i: number): Shipment {
  const channel = i === 0 ? 'Zepto' : pick(OPS_CHANNELS)
  const poDate = addDays(TODAY, -int(1, 28))
  const units = i === 0 ? 839 : int(120, 3200)
  const updated = Math.round(units * (rnd() > 0.7 ? 0.6 + rnd() * 0.35 : 1))
  const mrp = pick(SKUS).mrp
  const final = pick(FINAL_STATUSES)
  const progressed = ['RTS', 'In transit', 'Delivered', 'Closed'].includes(final)
  const shipped = ['In transit', 'Delivered', 'Closed'].includes(final)
  const tp = pick(TRANSPORTERS)
  const rate = int(14, 38)
  const wt = Math.round(updated * 0.11)
  const appt = rnd() > 0.25 ? addDays(TODAY, int(-3, 9)) : ''
  return {
    uid: String(135290 + i), entryDate: addDays(poDate, 1), poDate, facility: i === 0 ? 'MUM_WAREHOUSE2' : pick(FACILITIES),
    channel, location: i === 0 ? 'Hyderabad' : pick(CITIES), poNumber: i === 0 ? '3100495853' : String(3100495853 + int(1, 900000)),
    brand: pick(BRANDS), totalUnits: units, updatedQty: updated, updatedGmv: updated * mrp, updatedPoValue: Math.round(updated * mrp * 0.68),
    remarksPlanning: rnd() > 0.6 ? pick(['Short on MCF-UNDER-EYE', 'Split dispatch approved', 'Await channel confirmation']) : '',
    specialRemarksCopt: rnd() > 0.8 ? 'Priority — category review week' : '', newShipmentRef: rnd() > 0.85 ? `R-${135290 + i}` : '',
    statusPlanning: final === 'Cancelled' ? 'Cancelled' : pick(ST_PLANNING.slice(0, 3)),
    statusWarehouse: progressed ? (shipped ? 'Dispatched' : 'RTS') : final === 'Working' ? pick(['Picking', 'Packed']) : 'Pending',
    statusLogistics: final === 'Delivered' || final === 'Closed' ? 'Delivered' : shipped ? 'In transit' : progressed ? 'Booked' : 'Not booked',
    channelInwardingRemarks: final === 'Delivered' && rnd() > 0.6 ? 'GRN short by 12 units' : '',
    dispatchRemarksLogistics: shipped ? `Picked by ${tp}` : '', dispatchRemarksWarehouse: progressed ? 'Boxes sealed & labelled' : '',
    dispatchTentative: addDays(poDate, 4), workingDate: final === 'Open' ? '' : addDays(poDate, 2), rtsDate: progressed ? addDays(poDate, 3) : '',
    dispatchDate: shipped ? addDays(poDate, 4) : '', currentApptDate: appt, firstApptDate: appt ? addDays(appt, -int(0, 3)) : '',
    boxes: progressed ? Math.ceil(updated / 48) : 0, orderNo1: final === 'Open' ? '' : String(2024120409 + i), orderNo2: rnd() > 0.8 ? String(2024120900 + i) : '', orderNo3: '',
    poInwardCwh: '', pickListNo: final === 'Open' ? '' : `PL-${48000 + i}`, workingType: pick(['Full', 'Partial', 'Kitting']),
    inventoryRemarks: rnd() > 0.8 ? 'Batch near expiry swapped' : '', b2bRemarks: '', volumetricWeight: Math.round(wt * 1.2), channelType: CHANNEL_TYPE[channel],
    t1: progressed ? tp : '', d1: progressed ? `DL${int(10000000, 99999999)}` : '', t2: shipped && rnd() > 0.5 ? pick(TRANSPORTERS) : '', d2: '', t3: '', d3: '',
    apptLetter: appt ? 'appt_letter.pdf' : '', poExpiry: addDays(poDate, int(5, 15)), invoiceDate: progressed ? addDays(poDate, 3) : '',
    invoiceLink: progressed ? '#' : '', cnLink: '', ewayLink: shipped ? '#' : '', invoiceValue: progressed ? Math.round(updated * mrp * 0.68) : 0,
    accountsRemarks: '', invoiceNo: progressed ? `INV/24-25/${9000 + i}` : '', invoiceCheckedBy: progressed ? pick(['R. Mehta', 'S. Iyer']) : '',
    customerCode: String(232042 + int(0, 40)), poEntryCount: 1, deliveryDate: final === 'Delivered' || final === 'Closed' ? addDays(poDate, 7) : '',
    rescheduleLag: '', finalRemarks: '', shipmentWeight: wt, chargeableWeight: Math.round(wt * 1.2), deliveryCharges: shipped ? Math.round(wt * 1.2 * rate) : 0,
    halting: 0, unloading: shipped ? 450 : 0, dedicatedVehicle: rnd() > 0.85 ? 'Yes' : 'No', otherCharges: 0,
    document: progressed ? 'docs.zip' : '', pod: shipped ? 'pod.jpg' : '', proofDelivery: final === 'Delivered' ? 'pod_signed.pdf' : '',
    tat: int(2, 9), criticalDispatch: appt ? addDays(appt, -2) : '', ratePerKg: rate, deliveryType: pick(['Surface', 'Air', 'FTL']),
    apptShootedDate: appt ? addDays(appt, -5) : '', apptRequestedDate: appt ? addDays(appt, -6) : '', remarksWarehouse: '', status: final,
  }
}
export const SHIPMENTS: Shipment[] = Array.from({ length: 64 }, (_, i) => mkShipment(i))

// [label, key, kind]
export type ColKind = 'text' | 'mono' | 'date' | 'num' | 'money' | 'link' | 'status'

// ---- PO Format Data (line level) -------------------------------------
export interface POLineRow {
  shipmentUid: string; entryDate: string; brand: string; channel: string; location: string; poDate: string; poNumber: string; srNo: number
  skuName: string; skuCode: string; channelSkuCode: string; quantity: number; gmv: number; poValue: number
  updatedQuantity: number; updatedGmv: number; updatedPoValue: number; facility: string; productWeight: number
  workingDate: string; dispatchDate: string; currentApptDate: string; statusPlanning: string; statusWarehouse: string; statusLogistics: string; status: string
}
export const PO_LINES: POLineRow[] = SHIPMENTS.flatMap((s) => {
  const n = int(1, 4)
  const skus = [...SKUS].sort(() => rnd() - 0.5).slice(0, n)
  return skus.map((k, j) => {
    const q = Math.max(24, Math.round(s.totalUnits / n))
    const uq = Math.round(q * (s.updatedQty / s.totalUnits))
    return {
      shipmentUid: s.uid, entryDate: s.entryDate, brand: s.brand, channel: s.channel, location: s.location, poDate: s.poDate, poNumber: s.poNumber, srNo: j + 1,
      skuName: k.name, skuCode: k.code, channelSkuCode: `${s.channel.slice(0, 3).toUpperCase()}-${int(10000, 99999)}`, quantity: q, gmv: q * k.mrp,
      poValue: Math.round(q * k.mrp * 0.68), updatedQuantity: uq, updatedGmv: uq * k.mrp, updatedPoValue: Math.round(uq * k.mrp * 0.68), facility: s.facility,
      productWeight: k.w, workingDate: s.workingDate, dispatchDate: s.dispatchDate, currentApptDate: s.currentApptDate,
      statusPlanning: s.statusPlanning, statusWarehouse: s.statusWarehouse, statusLogistics: s.statusLogistics, status: s.status,
    }
  })
})
export const PO_LINE_COLS: [string, keyof POLineRow, ColKind][] = [
  ['Shipment UID', 'shipmentUid', 'mono'], ['Entry Date', 'entryDate', 'date'], ['Brand', 'brand', 'text'], ['Channel', 'channel', 'text'], ['Location', 'location', 'text'],
  ['PO Date', 'poDate', 'date'], ['PO Number', 'poNumber', 'mono'], ['Sr No', 'srNo', 'num'], ['SKU Name', 'skuName', 'text'], ['SKU Code', 'skuCode', 'mono'],
  ['Channel SKU Code', 'channelSkuCode', 'mono'], ['Quantity', 'quantity', 'num'], ['GMV', 'gmv', 'money'], ['PO Value', 'poValue', 'money'],
  ['Updated Quantity', 'updatedQuantity', 'num'], ['Updated GMV', 'updatedGmv', 'money'], ['Updated PO Value', 'updatedPoValue', 'money'], ['Facility', 'facility', 'mono'],
  ['Product Weight', 'productWeight', 'num'], ['Working Date', 'workingDate', 'date'], ['Dispatch Date', 'dispatchDate', 'date'],
  ['Current Appointment Date', 'currentApptDate', 'date'], ['Status Planning', 'statusPlanning', 'status'], ['Status Warehouse', 'statusWarehouse', 'status'],
  ['Status Logistics', 'statusLogistics', 'status'],
]

export function statusTone(s: string): 'ok' | 'warn' | 'crit' | 'info' | 'neutral' | 'primary' {
  if (['Delivered', 'Closed', 'Confirmed', 'Dispatched', 'Booked', 'Processed', 'Approved'].includes(s)) return 'ok'
  if (['Hold', 'Partial', 'Pending', 'Not booked', 'Reattempt', 'In review'].includes(s)) return 'warn'
  if (['Cancelled', 'Rejected', 'Failed'].includes(s)) return 'crit'
  if (['RTS', 'Packed'].includes(s)) return 'primary'
  if (['In transit', 'Working', 'Picking'].includes(s)) return 'info'
  return 'neutral'
}

// ---- PO Processing & Review ------------------------------------------
export type IngestSource = 'API' | 'Webhook' | 'Email' | 'Manual' | 'Bulk order'
export interface ProcessedPO { id: string; poNumber: string; channel: string; brand: string; source: IngestSource; processedAt: string; lines: number; units: number; value: number; file: string; parser: string }
export interface ReviewField { field: string; parsed: string; expected?: string; error?: string }
export interface ReviewPO { id: string; poNumber: string; channel: string; brand: string; source: IngestSource; receivedAt: string; file: string; labels: string[]; fields: ReviewField[] }

// ---- PO Working ------------------------------------------------------
export const CHANNEL_PRIORITY_DEFAULT: Record<string, number> = { Zepto: 1, Blinkit: 2, Swiggy: 3, BigBasket: 4, Amazon: 5, Flipkart: 6, Nykaa: 7, Myntra: 8, Firstcry: 9, Purplle: 10 }
export function daysUntil(iso: string) {
  if (!iso) return null
  return Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(TODAY + 'T00:00:00').getTime()) / 86400000)
}
export function shipmentCriticality(s: Shipment, priority: number): { score: number; level: 'Critical' | 'High' | 'Medium' | 'Low' } {
  const d = daysUntil(s.currentApptDate)
  let score = d === null ? 15 : d <= 0 ? 50 : d <= 2 ? 38 : d <= 5 ? 20 : 6
  score += Math.max(0, 30 - (priority - 1) * 4)
  if (s.statusWarehouse === 'Pending') score += 10
  return { score, level: score >= 65 ? 'Critical' : score >= 45 ? 'High' : score >= 25 ? 'Medium' : 'Low' }
}

// ---- Approvals -------------------------------------------------------
export type ApprovalType = 'Appointment change' | 'Qty update' | 'Channel priority' | 'Manual PO upload' | 'Master change' | 'Logistics rate'
export interface Approval { id: string; type: ApprovalType; ref: string; field: string; from: string; to: string; reason: string; by: string; at: string; module: string; status: 'Pending' | 'Approved' | 'Rejected'; comment?: string }

// ---- Demand planning: DRR & aging ------------------------------------
export interface DrrRow { sku: string; name: string; soh: number; drr3: number; drr7: number; drr30: number; aging: number; deviation: number }
export const DRR_ROWS: DrrRow[] = overallInventory().map((o) => {
  const drr30 = o.drr
  const drr7 = Math.round(drr30 * (1 + o.drrDelta / 100))
  const drr3 = Math.round(drr7 * (0.85 + rnd() * 0.35))
  return { sku: o.sku, name: o.name, soh: o.soh, drr3, drr7, drr30, aging: drr7 ? Math.round(o.available / drr7) : 0, deviation: Math.round(((drr3 - drr30) / drr30) * 1000) / 10 }
})
export const DRR_HISTORY = Array.from({ length: 12 }, (_, w) => {
  const row: Record<string, number | string> = { week: `W${w + 29}` }
  for (const r of DRR_ROWS) row[r.sku] = Math.round(r.drr30 * (0.75 + w * 0.025 + rnd() * 0.18))
  for (const r of DRR_ROWS) row[`${r.sku}__aging`] = Math.round(r.aging * (1.3 - w * 0.03 + rnd() * 0.1))
  return row
})

export const channelInventory = () => {
  const m = new Map<string, { channel: Channel; skus: number; soh: number; inTransit: number; drr: number }>()
  for (const r of computeInventory()) {
    const e = m.get(r.channel) ?? { channel: r.channel, skus: 0, soh: 0, inTransit: 0, drr: 0 }
    e.skus += 1; e.soh += r.soh; e.inTransit += r.inTransit; e.drr += r.drr
    m.set(r.channel, e)
  }
  return [...m.values()].map((e) => ({ ...e, aging: Math.round((e.soh + e.inTransit) / e.drr) }))
}
