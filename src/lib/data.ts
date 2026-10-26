// Mock data for Post FG ERP V1 — grounded in the PRD's channels, statuses and formulas.

export type Role = 'COPT' | 'DP' | 'Finance'

export const CHANNELS = [
  'Amazon', 'Flipkart', 'Myntra', 'Blinkit', 'Swiggy', 'Zepto',
  'Nykaa', 'Purplle', 'Firstcry', 'BigBasket', 'Tata 1mg', 'D2C',
] as const
export type Channel = (typeof CHANNELS)[number]

export const LOCATIONS = ['GGN MWH', 'MUM MWH', 'DarkStore', 'Return', 'D2C'] as const

// ---- Module 1: Inventory (Channel × SKU × Location) --------------------
export interface InventoryRow {
  sku: string
  name: string
  channel: Channel
  type: 'B2C' | 'D2C'
  location: string
  soh: number
  inTransit: number
  drr: number // daily run rate
  drrDelta: number // week-over-week %
}

export interface InventoryRowComputed extends InventoryRow {
  combined: number
  aging: number // days of cover = combined / drr
  signal: boolean // DRR moved > 5% WoW
}

const RAW_INV: InventoryRow[] = [
  { sku: 'MCF-VITC-30', name: 'Vitamin C Face Serum 30ml', channel: 'Amazon', type: 'B2C', location: 'GGN MWH', soh: 15040, inTransit: 4200, drr: 512, drrDelta: 8.7 },
  { sku: 'MCF-VITC-30', name: 'Vitamin C Face Serum 30ml', channel: 'Flipkart', type: 'B2C', location: 'MUM MWH', soh: 8820, inTransit: 1600, drr: 388, drrDelta: 2.1 },
  { sku: 'MCF-COFF-100', name: 'Coffee Body Scrub 100g', channel: 'Amazon', type: 'B2C', location: 'GGN MWH', soh: 3120, inTransit: 900, drr: 240, drrDelta: -6.4 },
  { sku: 'MCF-COFF-100', name: 'Coffee Body Scrub 100g', channel: 'Myntra', type: 'B2C', location: 'MUM MWH', soh: 1740, inTransit: 0, drr: 96, drrDelta: 1.0 },
  { sku: 'HYP-NIAC-30', name: 'Niacinamide Serum 30ml', channel: 'D2C', type: 'D2C', location: 'D2C', soh: 22400, inTransit: 3100, drr: 640, drrDelta: 12.3 },
  { sku: 'HYP-NIAC-30', name: 'Niacinamide Serum 30ml', channel: 'Flipkart', type: 'B2C', location: 'MUM MWH', soh: 640, inTransit: 2200, drr: 210, drrDelta: 5.9 },
  { sku: 'MCF-BEARD-KIT', name: 'Beard Grooming Kit', channel: 'Amazon', type: 'B2C', location: 'GGN MWH', soh: 980, inTransit: 300, drr: 150, drrDelta: -1.8 },
  { sku: 'MCF-UNDER-EYE', name: 'Under Eye Cream 30g', channel: 'Myntra', type: 'B2C', location: 'MUM MWH', soh: 210, inTransit: 0, drr: 88, drrDelta: 6.7 },
  { sku: 'HYP-SUNSCR-50', name: 'SPF 50 Sunscreen 50ml', channel: 'D2C', type: 'D2C', location: 'DarkStore', soh: 12600, inTransit: 5400, drr: 720, drrDelta: 4.2 },
  { sku: 'HYP-SUNSCR-50', name: 'SPF 50 Sunscreen 50ml', channel: 'Amazon', type: 'B2C', location: 'GGN MWH', soh: 4300, inTransit: 1200, drr: 305, drrDelta: -7.1 },
  { sku: 'MCF-SHAMP-250', name: 'Coffee Shampoo 250ml', channel: 'Flipkart', type: 'B2C', location: 'MUM MWH', soh: 5600, inTransit: 800, drr: 190, drrDelta: 0.4 },
  { sku: 'MCF-FACEWASH', name: 'Charcoal Face Wash 100g', channel: 'D2C', type: 'D2C', location: 'D2C', soh: 340, inTransit: 4000, drr: 260, drrDelta: 9.5 },
]

export function computeInventory(rows: InventoryRow[] = RAW_INV): InventoryRowComputed[] {
  return rows.map((r) => {
    const combined = r.soh + r.inTransit
    return {
      ...r,
      combined,
      aging: r.drr > 0 ? Math.round(combined / r.drr) : 0,
      signal: Math.abs(r.drrDelta) > 5,
    }
  })
}

// ---- Module 2: Order Processing & PO Tracking --------------------------
export type IntakeSource = 'API' | 'Excel' | 'OCR'
export type POStage =
  | 'Intake' | 'Validated' | 'COPT Verify' | 'SO in Uniware'
  | 'WH Working' | 'Packed / RTS' | 'Invoiced' | 'Dispatched' | 'Delivered' | 'GRN'

export const PO_STAGES: POStage[] = [
  'Intake', 'Validated', 'COPT Verify', 'SO in Uniware', 'WH Working',
  'Packed / RTS', 'Invoiced', 'Dispatched', 'Delivered', 'GRN',
]

export interface POLine {
  srNo: number
  skuName: string
  skuCode: string
  channelSku: string
  qty: number
  gmv: number
  poValue: number
  updatedQty: number
  updatedGmv: number
  updatedPoValue: number
  productWeight: number
  statusPlanning: string
  statusWarehouse: string
  statusLogistics: string
}

export interface PO {
  poNo: string // kept as string — 13+ digit PO numbers must not collapse
  channel: Channel
  segment: 'B2B' | 'B2C' | 'D2C'
  source: IntakeSource
  stage: POStage
  value: number
  units: number
  shipped: number
  daysToExpiry: number
  appointment: string | null
  channelPriority: number // 1 (high) - 3
  blocked: boolean // would be blocked by short stock
  blockedSku?: string
  // CSV-shaped tracking fields
  entryDate: string
  poDate: string
  facility: string
  location: string
  brand: string
  workingDate: string | null
  dispatchDate: string | null
  lines: POLine[]
}

function mkLines(rows: Omit<POLine, 'gmv' | 'poValue' | 'updatedGmv' | 'updatedPoValue'>[]): POLine[] {
  return rows.map((r) => ({
    ...r,
    gmv: r.qty,
    poValue: r.qty,
    updatedGmv: r.updatedQty,
    updatedPoValue: r.updatedQty,
  }))
}

type RawPO = Omit<PO, 'entryDate' | 'poDate' | 'facility' | 'location' | 'brand' | 'workingDate' | 'dispatchDate' | 'lines'> & {
  facility: string
  brand: string
  lines: POLine[]
}

const RAW_POS: RawPO[] = [
  { poNo: '4500000238841', channel: 'Blinkit', segment: 'B2B', source: 'API', stage: 'COPT Verify', value: 812400, units: 3200, shipped: 0, daysToExpiry: 1, appointment: null, channelPriority: 1, blocked: true, blockedSku: 'MCF-UNDER-EYE', facility: 'GGN_WAREHOUSE', brand: 'mCaffeine',
    lines: mkLines([
      { srNo: 1, skuName: 'Under Eye Cream 30g', skuCode: 'MCF-UNDER-EYE', channelSku: 'BLK-88201', qty: 1200, updatedQty: 900, productWeight: 0.06, statusPlanning: 'Confirmed', statusWarehouse: 'Pending', statusLogistics: '—' },
      { srNo: 2, skuName: 'Vitamin C Face Serum 30ml', skuCode: 'MCF-VITC-30', channelSku: 'BLK-88202', qty: 2000, updatedQty: 2000, productWeight: 0.09, statusPlanning: 'Confirmed', statusWarehouse: 'Allocated', statusLogistics: '—' },
    ]) },
  { poNo: '4500000238902', channel: 'Zepto', segment: 'B2B', source: 'Excel', stage: 'Validated', value: 540900, units: 2100, shipped: 0, daysToExpiry: 2, appointment: '2026-09-23', channelPriority: 1, blocked: false, facility: 'MUM_WAREHOUSE2', brand: 'Hyphen',
    lines: mkLines([
      { srNo: 1, skuName: 'Niacinamide Serum 30ml', skuCode: 'HYP-NIAC-30', channelSku: 'ZEP-4410', qty: 2100, updatedQty: 2100, productWeight: 0.08, statusPlanning: 'Confirmed', statusWarehouse: '—', statusLogistics: '—' },
    ]) },
  { poNo: '4500000239110', channel: 'Firstcry', segment: 'B2B', source: 'OCR', stage: 'Intake', value: 221000, units: 850, shipped: 0, daysToExpiry: 3, appointment: null, channelPriority: 2, blocked: true, blockedSku: 'MCF-FACEWASH', facility: 'GGN_WAREHOUSE', brand: 'mCaffeine',
    lines: mkLines([
      { srNo: 1, skuName: 'Charcoal Face Wash 100g', skuCode: 'MCF-FACEWASH', channelSku: 'FC-88213', qty: 850, updatedQty: 340, productWeight: 0.12, statusPlanning: 'Hold', statusWarehouse: '—', statusLogistics: '—' },
    ]) },
  { poNo: 'AMZ-PO-778120', channel: 'Amazon', segment: 'B2C', source: 'API', stage: 'WH Working', value: 402300, units: 1600, shipped: 640, daysToExpiry: 5, appointment: '2026-09-24', channelPriority: 2, blocked: false, facility: 'GGN_WAREHOUSE', brand: 'mCaffeine',
    lines: mkLines([
      { srNo: 1, skuName: 'Vitamin C Face Serum 30ml', skuCode: 'MCF-VITC-30', channelSku: 'B0VITC30', qty: 1000, updatedQty: 1000, productWeight: 0.09, statusPlanning: 'Confirmed', statusWarehouse: 'Processing', statusLogistics: '—' },
      { srNo: 2, skuName: 'Coffee Body Scrub 100g', skuCode: 'MCF-COFF-100', channelSku: 'B0COFF10', qty: 600, updatedQty: 600, productWeight: 0.14, statusPlanning: 'Confirmed', statusWarehouse: 'Packed', statusLogistics: 'Label pending' },
    ]) },
  { poNo: 'FK-PO-559034', channel: 'Flipkart', segment: 'B2C', source: 'API', stage: 'Dispatched', value: 198500, units: 900, shipped: 900, daysToExpiry: 8, appointment: '2026-09-21', channelPriority: 2, blocked: false, facility: 'MUM_WAREHOUSE2', brand: 'Hyphen',
    lines: mkLines([
      { srNo: 1, skuName: 'SPF 50 Sunscreen 50ml', skuCode: 'HYP-SUNSCR-50', channelSku: 'FKSUN50', qty: 900, updatedQty: 900, productWeight: 0.07, statusPlanning: 'Confirmed', statusWarehouse: 'Packed', statusLogistics: 'Dispatched' },
    ]) },
  { poNo: '4500000238455', channel: 'BigBasket', segment: 'B2B', source: 'Excel', stage: 'SO in Uniware', value: 690000, units: 2600, shipped: 0, daysToExpiry: 2, appointment: null, channelPriority: 1, blocked: true, blockedSku: 'HYP-NIAC-30', facility: 'MUM_WAREHOUSE2', brand: 'Hyphen',
    lines: mkLines([
      { srNo: 1, skuName: 'Niacinamide Serum 30ml', skuCode: 'HYP-NIAC-30', channelSku: 'BB-33110', qty: 1600, updatedQty: 640, productWeight: 0.08, statusPlanning: 'Confirmed', statusWarehouse: '—', statusLogistics: '—' },
      { srNo: 2, skuName: 'Coffee Shampoo 250ml', skuCode: 'MCF-SHAMP-250', channelSku: 'BB-33111', qty: 1000, updatedQty: 1000, productWeight: 0.28, statusPlanning: 'Confirmed', statusWarehouse: '—', statusLogistics: '—' },
    ]) },
  { poNo: 'MYN-PO-330218', channel: 'Myntra', segment: 'B2C', source: 'OCR', stage: 'Packed / RTS', value: 122000, units: 500, shipped: 300, daysToExpiry: 6, appointment: '2026-09-25', channelPriority: 3, blocked: false, facility: 'MUM_WAREHOUSE2', brand: 'mCaffeine',
    lines: mkLines([
      { srNo: 1, skuName: 'Beard Grooming Kit', skuCode: 'MCF-BEARD-KIT', channelSku: 'MYN-BRD01', qty: 500, updatedQty: 300, productWeight: 0.42, statusPlanning: 'Confirmed', statusWarehouse: 'Packed', statusLogistics: 'RTS' },
    ]) },
  { poNo: '4500000239277', channel: 'Nykaa', segment: 'B2B', source: 'API', stage: 'Delivered', value: 358000, units: 1400, shipped: 1330, daysToExpiry: 12, appointment: '2026-09-19', channelPriority: 2, blocked: false, facility: 'GGN_WAREHOUSE', brand: 'mCaffeine',
    lines: mkLines([
      { srNo: 1, skuName: 'Vitamin C Face Serum 30ml', skuCode: 'MCF-VITC-30', channelSku: 'NYK-VC30', qty: 1400, updatedQty: 1330, productWeight: 0.09, statusPlanning: 'Confirmed', statusWarehouse: 'Packed', statusLogistics: 'Delivered' },
    ]) },
  { poNo: 'D2C-77521', channel: 'D2C', segment: 'D2C', source: 'API', stage: 'GRN', value: 88000, units: 420, shipped: 420, daysToExpiry: 20, appointment: null, channelPriority: 3, blocked: false, facility: 'HYP_SRGGN', brand: 'Hyphen',
    lines: mkLines([
      { srNo: 1, skuName: 'Under Eye Cream 30g', skuCode: 'MCF-UNDER-EYE', channelSku: 'D2C-UE30', qty: 420, updatedQty: 420, productWeight: 0.06, statusPlanning: 'Confirmed', statusWarehouse: 'GRN Done', statusLogistics: 'Delivered' },
    ]) },
  { poNo: '4500000239301', channel: 'Swiggy', segment: 'B2B', source: 'Excel', stage: 'Intake', value: 455000, units: 1800, shipped: 0, daysToExpiry: 1, appointment: null, channelPriority: 1, blocked: false, facility: 'GGN_WAREHOUSE', brand: 'mCaffeine',
    lines: mkLines([
      { srNo: 1, skuName: 'SPF 50 Sunscreen 50ml', skuCode: 'HYP-SUNSCR-50', channelSku: 'SWG-SUN50', qty: 1800, updatedQty: 1800, productWeight: 0.07, statusPlanning: 'Confirmed', statusWarehouse: '—', statusLogistics: '—' },
    ]) },
]

const locFor = (f: string) => (f.includes('WAREHOUSE') ? 'Consumption' : f.startsWith('HYP') ? 'D2C' : 'Consumption')

export const POS: PO[] = RAW_POS.map((p) => ({
  ...p,
  entryDate: '2026-09-20',
  poDate: '2026-09-20',
  location: locFor(p.facility),
  workingDate: p.stage === 'Intake' ? null : '2026-09-22',
  dispatchDate: ['Dispatched', 'Delivered', 'GRN'].includes(p.stage) ? '2026-09-23' : null,
}))

export interface ErrorRow {
  poNo: string
  channel: Channel
  sku: string
  type:
    | 'Wrong margin / MRP' | 'Customer not found' | 'SKU not found'
    | 'Reading / processing issue' | 'Same location, multiple WH' | 'File not readable'
  detail: string
  detectedAt: string
  source: IntakeSource
}

export const ERROR_QUEUE: ErrorRow[] = [
  { poNo: '4500000239110', channel: 'Firstcry', sku: 'FC-88213', type: 'SKU not found', detail: 'Channel SKU "FC-88213" has no internal mapping', detectedAt: '2026-09-22 08:14', source: 'OCR' },
  { poNo: '4500000239301', channel: 'Swiggy', sku: 'HYP-SUNSCR-50', type: 'Wrong margin / MRP', detail: 'Computed MRP ₹499 vs channel master ₹549', detectedAt: '2026-09-22 08:31', source: 'Excel' },
  { poNo: 'PUR-PO-11029', channel: 'Purplle', sku: 'MCF-VITC-30', type: 'Customer not found', detail: 'Channel code changed on edit — customer missing in master', detectedAt: '2026-09-22 09:02', source: 'API' },
  { poNo: 'MYN-PO-330911', channel: 'Myntra', sku: 'MCF-COFF-100', type: 'Reading / processing issue', detail: 'OCR failed to read destination pincode', detectedAt: '2026-09-22 09:10', source: 'OCR' },
  { poNo: '4500000238777', channel: 'BigBasket', sku: 'HYP-NIAC-30', type: 'Same location, multiple WH', detail: 'Ambiguous fulfilment — GGN & MUM both eligible', detectedAt: '2026-09-22 09:22', source: 'Excel' },
  { poNo: 'AMZ-PO-778999', channel: 'Amazon', sku: '—', type: 'File not readable', detail: 'Corrupt PDF attachment — request resend', detectedAt: '2026-09-22 09:40', source: 'OCR' },
]

// ---- Detailed view: one flat row per PO SKU-line ----------------------
export type FinalStatus =
  | 'GRN Done' | 'GRN-Done Delivered' | 'PO Created' | 'RTS'
  | 'Working' | 'Manual Check' | 'Intransit' | 'Working Hold' | 'Do not consider'

const finalStatusTone: Record<FinalStatus, 'ok' | 'warn' | 'crit' | 'info' | 'neutral' | 'primary'> = {
  'GRN Done': 'ok', 'GRN-Done Delivered': 'ok', 'PO Created': 'neutral', RTS: 'primary',
  Working: 'info', 'Manual Check': 'warn', Intransit: 'info', 'Working Hold': 'warn', 'Do not consider': 'neutral',
}
export const finalStatusColor = (s: FinalStatus) => finalStatusTone[s]

function deriveFinalStatus(warehouse: string, logistics: string, stage: POStage): FinalStatus {
  if (warehouse === 'GRN Done') return logistics === 'Delivered' ? 'GRN-Done Delivered' : 'GRN Done'
  if (logistics === 'RTS' || logistics === 'Label pending') return 'RTS'
  if (logistics === 'Delivered') return 'Intransit'
  if (logistics === 'Dispatched') return 'Intransit'
  if (warehouse === 'Processing' || warehouse === 'Packed') return 'Working'
  if (warehouse === 'Allocated') return 'Working'
  if (stage === 'Intake') return 'PO Created'
  return 'Manual Check'
}

export interface DetailedRow {
  shipmentUid: string
  entryDate: string
  brand: string
  channel: Channel
  location: string
  poDate: string
  poNo: string
  srNo: number
  skuName: string
  skuCode: string
  channelSku: string
  qty: number
  gmv: number
  poValue: number
  updatedQty: number
  updatedGmv: number
  updatedPoValue: number
  facility: string
  finalStatus: FinalStatus
}

export function detailedRows(): DetailedRow[] {
  let n = 0
  return POS.flatMap((p) =>
    p.lines.map((l) => {
      n += 1
      return {
        shipmentUid: `SH-${String(100000 + n)}`,
        entryDate: p.entryDate, brand: p.brand, channel: p.channel, location: p.location,
        poDate: p.poDate, poNo: p.poNo, srNo: l.srNo, skuName: l.skuName, skuCode: l.skuCode,
        channelSku: l.channelSku, qty: l.qty, gmv: l.gmv, poValue: l.poValue,
        updatedQty: l.updatedQty, updatedGmv: l.updatedGmv, updatedPoValue: l.updatedPoValue,
        facility: p.facility, finalStatus: deriveFinalStatus(l.statusWarehouse, l.statusLogistics, p.stage),
      }
    }),
  )
}

// ---- Inventory: overall (SKU) aggregation + facility pivot ------------
export interface OverallSku {
  sku: string
  name: string
  soh: number
  inTransit: number
  available: number
  drr: number
  drrDelta: number
  aging: number
  signal: boolean
}

export function overallInventory(): OverallSku[] {
  const map = new Map<string, OverallSku>()
  for (const r of computeInventory()) {
    const e = map.get(r.sku) ?? { sku: r.sku, name: r.name, soh: 0, inTransit: 0, available: 0, drr: 0, drrDelta: r.drrDelta, aging: 0, signal: false }
    e.soh += r.soh
    e.inTransit += r.inTransit
    e.drr += r.drr
    e.drrDelta = Math.abs(r.drrDelta) > Math.abs(e.drrDelta) ? r.drrDelta : e.drrDelta
    map.set(r.sku, e)
  }
  return [...map.values()].map((e) => {
    e.available = e.soh + e.inTransit
    e.aging = e.drr > 0 ? Math.round(e.available / e.drr) : 0
    e.signal = Math.abs(e.drrDelta) > 5
    return e
  })
}

export const PIVOT_FACILITIES = ['GGN MWH', 'MUM MWH', 'DarkStore', 'D2C', 'Return']

export function agingBand(days: number): { band: 'At-risk' | 'Watch' | 'Healthy'; tone: 'crit' | 'warn' | 'ok' } {
  if (days < 7) return { band: 'At-risk', tone: 'crit' }
  if (days <= 21) return { band: 'Watch', tone: 'warn' }
  return { band: 'Healthy', tone: 'ok' }
}

// In-transit composition (for inventory drawer)
export const INTRANSIT_STATES = ['Working', 'Manual Check', 'RTS', 'Intransit', 'Working Hold'] as const

// ---- Analytics --------------------------------------------------------
export function fillRateByChannel() {
  const map = new Map<string, { ordered: number; shipped: number }>()
  for (const p of POS) {
    const e = map.get(p.channel) ?? { ordered: 0, shipped: 0 }
    e.ordered += p.units
    e.shipped += p.shipped
    map.set(p.channel, e)
  }
  return [...map.entries()].map(([channel, v]) => ({ channel, fill: v.ordered ? Math.round((v.shipped / v.ordered) * 100) : 0 }))
}

export const PO_TO_DELIVERY = [
  { channel: 'Amazon', days: 9.2 }, { channel: 'Flipkart', days: 10.1 }, { channel: 'Myntra', days: 12.6 },
  { channel: 'Blinkit', days: 8.4 }, { channel: 'Zepto', days: 7.9 }, { channel: 'BigBasket', days: 11.3 },
  { channel: 'Nykaa', days: 13.1 }, { channel: 'Firstcry', days: 12.2 },
]
export const PO_TO_DELIVERY_TARGET = 12

// PO-expiry windows by channel (days) — shorter = higher urgency
export const EXPIRY_WINDOWS: { channel: string; window: number }[] = [
  { channel: 'Blinkit', window: 2 },
  { channel: 'Zepto', window: 2 },
  { channel: 'Swiggy', window: 2 },
  { channel: 'BigBasket', window: 3 },
  { channel: 'Firstcry', window: 4 },
  { channel: 'Nykaa', window: 5 },
  { channel: 'Amazon', window: 7 },
]

export function criticality(po: PO): { score: number; level: 'Critical' | 'High' | 'Medium' | 'Low' } {
  let score = 0
  if (po.daysToExpiry <= 1) score += 40
  else if (po.daysToExpiry <= 3) score += 25
  else if (po.daysToExpiry <= 6) score += 12
  if (po.blocked) score += 30
  if (po.channelPriority === 1) score += 20
  else if (po.channelPriority === 2) score += 10
  if (!po.appointment && po.segment === 'B2B') score += 12
  const level = score >= 60 ? 'Critical' : score >= 40 ? 'High' : score >= 20 ? 'Medium' : 'Low'
  return { score, level }
}

export function fillRate(po: PO): number {
  return po.units > 0 ? po.shipped / po.units : 0
}

// ---- Masters: SKU Management (matches channel-level mgmt screen) --------
/** Masters menu (2026-10-16, user): Title Case; Channel Master (was Channel / Customer master); Channel Location Master
 *  (was the Channel warehouses sub-tab of Warehouses). */
export const MASTER_TABS = ['PEP SKU Master', 'Channel SKU Master', 'Channel Master', 'Channel Location Master', 'Warehouses']

export const SKU_CHANNEL_PILLS = [
  'Blinkit', 'Zepto', 'BigBasket', 'Flipkart Qcom', 'Myntra', 'Nykaa', 'Purplle',
  'Flipkart', 'Amazon', 'Myntra-OR', 'FirstCry', 'Purplle SOR', 'Purplle SDR',
  'Tata 1MG', 'Scootsy Logistics', 'Reliance / Tira', 'Avenue Supermarts Ltd',
  'Avenue E-Commerce', 'Default B2B', 'All Channels',
]

export interface SkuMaster {
  brand: 'mCaffeine' | 'Hyphen'
  pepCode: string
  finalSkuLive: 'Continued' | 'Discontinued'
  productName: string
  mrp: number
  channelCode: string
  marginPct: number
  ean: string
}

const rateAfter = (mrp: number, m: number) => Math.round(mrp * (1 - m / 100) * 100) / 100
export function rateAfterMargin(s: SkuMaster) {
  return rateAfter(s.mrp, s.marginPct)
}

export const SKU_MASTER: SkuMaster[] = [
  { brand: 'mCaffeine', pepCode: 'MTOOL1_JD_S', finalSkuLive: 'Continued', productName: 'MCaffeine Jade Face Massager', mrp: 1799, channelCode: '10129779', marginPct: 27, ean: '8906087651234' },
  { brand: 'Hyphen', pepCode: 'HYPMUBX020F030', finalSkuLive: 'Continued', productName: 'Advanced De-Pigmentation Serum', mrp: 649, channelCode: '10165694', marginPct: 27, ean: '8906112340021' },
  { brand: 'mCaffeine', pepCode: '75MCaf42_WB', finalSkuLive: 'Continued', productName: 'mCaffeine Espresso Coffee Deep Exfoliating Face Scrub', mrp: 229, channelCode: '10109907', marginPct: 27, ean: '8906087650012' },
  { brand: 'mCaffeine', pepCode: 'MCVITC30_A', finalSkuLive: 'Continued', productName: 'mCaffeine Vitamin C Face Serum 30ml', mrp: 699, channelCode: '10112238', marginPct: 30, ean: '8906087653019' },
  { brand: 'Hyphen', pepCode: 'HYPSUN50_C', finalSkuLive: 'Continued', productName: 'Hyphen SPF 50 Sunscreen 50ml', mrp: 449, channelCode: '10165701', marginPct: 28, ean: '8906112340199' },
  { brand: 'mCaffeine', pepCode: 'MCBEARD_KIT2', finalSkuLive: 'Discontinued', productName: 'mCaffeine Beard Grooming Kit', mrp: 999, channelCode: '10098120', marginPct: 25, ean: '8906087659887' },
  { brand: 'Hyphen', pepCode: 'HYPNIAC30_B', finalSkuLive: 'Continued', productName: 'Hyphen Niacinamide Serum 30ml', mrp: 549, channelCode: '10165688', marginPct: 27, ean: '8906112340052' },
  { brand: 'mCaffeine', pepCode: 'MCSHAMP250', finalSkuLive: 'Continued', productName: 'mCaffeine Coffee Shampoo 250ml', mrp: 399, channelCode: '10110455', marginPct: 26, ean: '8906087652077' },
]

// ---- Masters overview -------------------------------------------------
export const MASTERS = [
  { name: 'Overall SKU master', rows: 4210, synced: '2 min ago', issues: 3 },
  { name: 'Channel SKU master', rows: 9840, synced: '2 min ago', issues: 11 },
  { name: 'Channel / customer master', rows: 342, synced: '18 min ago', issues: 1 },
  { name: 'Location master', rows: 63, synced: '1 hr ago', issues: 0 },
  { name: 'Channel–SKU mapping', rows: 8720, synced: '2 min ago', issues: 27 },
]
