import type { DailyItem, DayPlan, DaySummary, FetchStep, IntransitRun, InventoryRow, InventoryView, MasterItem, MasterVersion, SavedInput } from '../api/intransit'
import { PEPIMS_CONNECTOR, SOURCES, type Source } from '../constants/intransit'
import { PATHS } from '../constants/pages'

/*
 * DEV-ONLY preview of In-transit Stock and Inventory Calculation without the backend or a login (user, 2026-10-15).
 * On when VITE_INTRANSIT_PREVIEW=true in .env.local and only in `npm run dev` (import.meta.env.DEV is false in a
 * build). It takes over only when /auth/me fails: the person is then a preview user who can open just these two
 * pages, and their API calls are answered here with MADE-UP sample data (nothing is sent anywhere). A build or fetch
 * "runs" for a few seconds in memory. Delete this file and its three call sites when it is no longer wanted.
 */

export const PREVIEW_ENABLED = import.meta.env.DEV && import.meta.env.VITE_INTRANSIT_PREVIEW === 'true'

/** Set by AuthProvider when it falls back to the preview user; the API module then answers from here. */
export const preview = { on: false }

export const PREVIEW_USER = { id: 'preview', name: 'Preview (no login)', email: 'preview@localhost', roles: ['developer'], team: null }
export const PREVIEW_ACCESS = { [PATHS.PLANNING]: 'editor', [PATHS.INVENTORY]: 'editor', [PATHS.INTRANSIT_STOCK]: 'editor' } as const

const wait = <T>(v: T, ms = 250): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms))
const now = () => new Date().toISOString()
const DAY_MS = 86_400_000
const istDay = (ms: number) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10)
const today = () => istDay(Date.now())
const dayBefore = (d: string, n = 1) => new Date(Date.parse(`${d}T00:00:00Z`) - n * DAY_MS).toISOString().slice(0, 10)
/** Noon IST of a day, as ISO, plus `min` minutes. */
const onDay = (d: string, min = 0) => new Date(Date.parse(`${d}T06:30:00Z`) + min * 60000).toISOString()
const RIBBON_DAYS = 14
const PEOPLE = ['Ajay Singh', 'Priya Nair', 'Rohit Mehta']

// ---- catalog ----------------------------------------------------------------------------------------------------

const MASTERS: [string, string, 'daily' | 'on-change'][] = [
  ['Channel SKU Mapping.csv', 'Marketplace code -> SKU', 'on-change'],
  ['Final SKU Mapping.csv', 'Listing SKU -> Final SKU', 'on-change'],
  ['Split1.csv', 'Combo -> components (stage 1)', 'on-change'],
  ['Split2.csv', 'Combo -> components (stage 2)', 'on-change'],
  ['Sheet35(2).csv', 'SKU master (name, type, MRP, COGS)', 'on-change'],
  ['Location Master.csv', 'Channel + fulfilment centre -> city', 'on-change'],
  ['MyntraWHIDs.csv', 'Myntra warehouse id -> city', 'on-change'],
  ['SKU-Not To Consider.csv', 'SKUs flagged Consider? = No', 'on-change'],
  ['Intransit_Stock_Report.xlsx', 'Report template: the workbook whose formatting the report reuses', 'on-change'],
]

const DAILY: [string, 'upload' | 'api', string, Source | typeof PEPIMS_CONNECTOR | null, 'any-date' | 'today-only' | null][] = [
  ['Shipment_Status.csv', 'api', 'PEPIMS shipment tracker (shipment_orders), last 90 days, read at build', PEPIMS_CONNECTOR, 'today-only'],
  ['PO_Format.csv', 'api', 'PEPIMS PO lines (sku_orders) of those POs, read at build', PEPIMS_CONNECTOR, 'today-only'],
  ['FK_SOH.csv', 'upload', 'Flipkart Seller Hub - inventory (or the Seller Hub robot / Flipkart API)', 'flipkart', 'today-only'],
  ['FK_GRN.csv', 'upload', 'Flipkart Seller Hub - consignment GRN (or the Seller Hub robot)', 'flipkart', 'today-only'],
  ['Myntra_SOH.csv', 'upload', 'Myntra Partner Portal - inventory (or the Partner Portal robot)', 'myntra', 'today-only'],
  ['Myntra_GRN.csv', 'upload', 'Myntra Partner Portal - STR inward (or the Partner Portal robot)', 'myntra', 'today-only'],
  ['Amazon_SOH.csv', 'api', 'Amazon SP-API (inventory ledger)', 'amazon', 'any-date'],
  ['Amazon_GRN.csv', 'api', 'Amazon SP-API (inbound shipments)', 'amazon', 'today-only'],
  ['Export-B2B Sale Orders.csv', 'api', 'Uniware export: B2B Sale Orders', 'uniware', 'any-date'],
  ['Purchase_Order.csv', 'api', 'Uniware export: Purchase Orders', 'uniware', 'any-date'],
  ['Export-Inventory Snapshot.csv', 'api', 'Uniware export: Inventory Snapshot', 'uniware', 'today-only'],
]
const FETCH_KEY: Record<string, string> = {
  'FK_SOH.csv': 'soh', 'FK_GRN.csv': 'grn', 'Myntra_SOH.csv': 'soh', 'Myntra_GRN.csv': 'grn', 'Amazon_SOH.csv': 'soh', 'Amazon_GRN.csv': 'grn', 'Export-B2B Sale Orders.csv': 'b2b', 'Purchase_Order.csv': 'po', 'Export-Inventory Snapshot.csv': 'inventory',
}
/** Like the real setup on 2026-10-28: the Flipkart robot works, the Myntra robot's login is not proven yet. */
const CONFIGURED: Record<Source, boolean> = { amazon: true, uniware: true, flipkart: true, myntra: false }
const KEYS: Record<Source, string[]> = {
  amazon: ['SPAPI_CLIENT_ID', 'SPAPI_CLIENT_SECRET', 'SPAPI_REFRESH_TOKEN'], uniware: ['UNIWARE_TENANT', 'UNIWARE_USERNAME', 'UNIWARE_PASSWORD'],
  flipkart: ['FLIPKART_SELLER_USER', 'FLIPKART_SELLER_PASSWORD'], myntra: ['MYNTRA_PARTNER_USER', 'MYNTRA_PARTNER_PASSWORD'],
}

// ---- stored files -----------------------------------------------------------------------------------------------

type Stored = { at: string; by: string | null; via: MasterItem['via']; size: number }
const sizeOf = (name: string) => 40_000 + ((name.length * 7919) % 900) * 50_000
const masters = new Map<string, Stored & { versions: MasterVersion[] }>()
const daily = new Map<string, Map<string, Stored>>()

const seed = () => {
  const t = today()
  MASTERS.forEach(([name, , refresh], i) => {
    const at = refresh === 'daily' ? onDay(dayBefore(t), 60) : onDay(dayBefore(t, 3 + i), 30)
    const versions = Array.from({ length: i % 3 }, (_, k) => ({ version: `v${k + 1}`, at: onDay(dayBefore(t, 8 + k * 5)), size: sizeOf(name) - 2000 * (k + 1), byName: PEOPLE[k % 3], source: 'upload' as const }))
    masters.set(name, { at, by: PEOPLE[i % 3], via: 'upload', size: sizeOf(name), versions })
  })
  for (let back = RIBBON_DAYS - 1; back >= 0; back--) {
    const d = dayBefore(t, back)
    const m = new Map<string, Stored>()
    DAILY.forEach(([name, group, , connector], i) => {
      // a few gaps on past days, and today half done: the uploads but Myntra_GRN, Amazon fetched, Uniware not yet
      if (back === 0 && (name === 'Myntra_GRN.csv' || connector === 'uniware' || connector === PEPIMS_CONNECTOR)) return
      if (back > 0 && (back * 3 + i) % 11 === 0) return
      if (back === 5 || back === 12) return // nobody worked those days (a weekend)
      m.set(name, { at: onDay(d, 20 + i * 4), by: group === 'upload' ? PEOPLE[back % 3] : null, via: group === 'upload' ? 'upload' : connector, size: sizeOf(name) })
    })
    if (m.size) daily.set(d, m)
  }
}

// ---- runs -------------------------------------------------------------------------------------------------------

const SUMMARY = [
  ['GRN Done', 2310, 2_150_400], ['Partial GRN Done', 140, 210_800], ['PO Created', 380, 402_100], ['RTS', 210, 260_400],
  ['Intransit', 1450, 1_960_300], ['Working', 920, 1_120_700], ['Working Hold', 75, 61_200], ["Don't Consider", 160, 0],
  ['Manual Check', 1600, 935_000], ['GRN-Done(Delivered)', 220, 190_500],
] as const
const EXCLUDED = new Set(['GRN Done', 'Partial GRN Done', "Don't Consider", 'GRN-Done(Delivered)'])
const summary = (k = 1) => {
  const rows = SUMMARY.map(([s, n, u]) => ({ 'Final Status': s, Shipments: Math.round(n * k), 'Total Units': Math.round(u * k), 'Updated Qty': Math.round(u * k), 'Intransit?': EXCLUDED.has(s) ? 'No' : 'Yes' }))
  const t = rows.filter((r) => r['Intransit?'] === 'Yes')
  return [...rows, { 'Final Status': 'TOTAL INTRANSIT', Shipments: t.reduce((a, r) => a + r.Shipments, 0), 'Total Units': t.reduce((a, r) => a + r['Total Units'], 0), 'Updated Qty': t.reduce((a, r) => a + r['Updated Qty'], 0), 'Intransit?': 'TOTAL' }]
}
const SHEETS = ['Intransit_Stock', 'Full_Shipment_Enhanced', 'Summary_Dashboard', 'Duplicate_PO_Report', 'Export_B2B_InTransit_Orders', 'PO_Not_Found_in_Export_B2B', 'Combined_InTransit_Units', 'Current_Inventory', 'Combined_SOH_Intransit', 'Channel_Location_Master', 'Missing_Items_Report', 'SOH+Intransit-Split1', 'SOH+Intransit-Split2', 'Sheet35(2)', 'Final Sheet35(2)', 'SKU not available in Split1', 'SKU not available in Split2', 'SKU not available in Sheet35(2)', 'Final SKU Not Mapped', 'Final SKU Code Missing']
const sheetRows = () => Object.fromEntries(SHEETS.map((s, i) => [s, 50 + ((i * 104729) % 50000)]))
const user = { id: 0, name: 'Preview (no login)' }
const STAGES = ['lookups', 'shipments', 'quantities', 'duplicates', 'b2b_orders', 'combined_intransit', 'inventory', 'final_sku']

const COMBO_CHECK = {
  status: 'done' as const, checked: 412, unknownInUniware: 3, lookedUp: 40,
  combos: [
    { sku: 'CMB212', name: 'Coffee Scrub + Body Wash Combo', channelTypes: 'B2C', units: 340, foundBy: 'uniware+code' as const, uniwareType: 'BUNDLE', components: [{ sku: 'MCF-COFF-100', qty: 1 }, { sku: 'MCF-BODYWASH', qty: 1 }] },
    { sku: 'CMB47B2b', name: 'Vitamin C Duo (B2B pack)', channelTypes: 'D2C', units: 120, foundBy: 'variant' as const, uniwareType: 'SIMPLE', components: [],
      base: { sku: 'CMB47', name: 'Vitamin C Duo', components: [{ sku: 'MCF-VITC-30', qty: 2 }] } },
  ],
}

let nextId = 40
const runs: IntransitRun[] = []
const blankRun = (kind: IntransitRun['kind'], asOf: string): IntransitRun => ({
  id: String(nextId++), kind, status: 'queued', asOf, options: {}, createdBy: user, createdAt: now(), startedAt: null, finishedAt: null,
  error: null, timings: null, summary: null, sheetRows: null, result: null, hasReport: false, logTail: [],
})

const seedRuns = () => {
  const t = today()
  for (let back = RIBBON_DAYS - 1; back >= 1; back--) {
    const d = dayBefore(t, back)
    if (!daily.has(d)) continue
    const failed = back === 9
    runs.unshift({
      ...blankRun('report', d), status: failed ? 'failed' : 'succeeded', createdBy: { id: 1, name: PEOPLE[back % 3] },
      createdAt: onDay(d, 120), startedAt: onDay(d, 120), finishedAt: onDay(d, failed ? 120.2 : 121.4),
      error: failed ? 'no copy of Myntra_GRN.csv for that day' : null, timings: failed ? null : { total: 24.6 },
      summary: failed ? null : summary(1 + ((back * 13) % 7) / 40), sheetRows: failed ? null : sheetRows(), hasReport: !failed,
      result: failed ? null : { comboCheck: back === 1 ? COMBO_CHECK : { ...COMBO_CHECK, combos: [] }, inputsUsed: { masters: 11, ofDate: [], earlier: [] }, fetched: [] },
      options: { fetchFirst: true, step: failed ? 'building' : 'done' },
    })
    if (back <= 3) runs.unshift({ ...blankRun('uniware', d), status: 'succeeded', createdAt: onDay(d, 60), startedAt: onDay(d, 60), finishedAt: onDay(d, 62), timings: { total: 111 }, options: { date: d }, result: { saved: ['Export-B2B Sale Orders.csv', 'Purchase_Order.csv', 'Export-Inventory Snapshot.csv'], rejected: {} } })
  }
}

const ensureSeeded = () => { if (!masters.size) { seed(); seedRuns() } }
const isActive = (r: IntransitRun) => r.status === 'queued' || r.status === 'running'

// ---- the day ----------------------------------------------------------------------------------------------------

const resolve = (date: string, name: string): [Stored, string] | null => {
  const days = [...daily.keys()].filter((d) => d <= date).sort().reverse()
  for (const d of days) { const s = daily.get(d)?.get(name); if (s) return [s, d] }
  return null
}

const longDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

const plan = (date: string): DayPlan => {
  const t = today()
  const masterItems: MasterItem[] = MASTERS.map(([name, source, refresh]) => {
    const m = masters.get(name)
    return {
      name, source, refresh, present: !!m, updatedAt: m?.at ?? null, updatedBy: m?.by ?? null, via: m?.via ?? null, size: m?.size ?? null,
      sha256: m ? `preview-${name}-${m.at}` : null, stale: !!m && refresh === 'daily' && istDay(Date.parse(m.at)) < date, versions: m?.versions.length ?? 0, problems: [],
    }
  })
  const dailyItems: DailyItem[] = DAILY.map(([name, group, source, connector, fetchable]) => {
    const r = resolve(date, name)
    let notFetchable: string | null = null
    if (connector === PEPIMS_CONNECTOR) { if (date !== t) notFetchable = 'PEPIMS holds the current statuses only: read when building today' }
    else if (connector && !CONFIGURED[connector]) notFetchable = `${connector} is not set up yet`
    else if (connector && fetchable === 'today-only' && date !== t) notFetchable = 'the API gives the current state only: fetchable for today'
    return {
      name, group, source, connector, fetchable: !!connector && !notFetchable, notFetchable: connector ? notFetchable : null,
      on: r ? (r[1] === date ? 'date' : 'earlier') : 'missing', fileDate: r?.[1] ?? null,
      updatedAt: r?.[0].at ?? null, updatedBy: r?.[0].by ?? null, via: r?.[0].via ?? null, size: r?.[0].size ?? null, problems: [],
    }
  })
  const toFetch: FetchStep[] = []
  for (const d of dailyItems.filter((x) => x.on !== 'date' && x.fetchable && x.connector !== PEPIMS_CONNECTOR)) {
    let s = toFetch.find((x) => x.source === d.connector)
    if (!s) toFetch.push((s = { source: d.connector as Source, only: [], files: [] }))
    s.files.push(d.name)
    s.only.push(FETCH_KEY[d.name])
  }
  const blockers: string[] = []
  const warnings: string[] = []
  for (const m of masterItems) if (m.stale) warnings.push(`${m.name} last updated ${longDay(istDay(Date.parse(m.updatedAt as string)))} (expected daily)`)
  const fetchRequired: string[] = []
  for (const d of dailyItems) {
    if (d.connector === PEPIMS_CONNECTOR && d.fetchable) continue // read from PEPIMS at the build
    if (d.on === 'missing') (d.fetchable ? fetchRequired : blockers).push(d.fetchable ? d.name : `${d.name}: upload it for ${longDay(date)}`)
    else if (d.on === 'earlier' && !d.fetchable) warnings.push(`${d.name}: using the ${longDay(d.fileDate as string)} copy`)
  }
  const days: DaySummary[] = Array.from({ length: RIBBON_DAYS }, (_, i) => {
    const d = dayBefore(t, RIBBON_DAYS - 1 - i)
    const rep = runs.find((r) => r.kind === 'report' && r.asOf === d)
    return { date: d, ofDate: daily.get(d)?.size ?? 0, total: DAILY.length, report: rep ? { id: rep.id, status: rep.status } : null }
  })
  return {
    date, today: t, days,
    masters: { ok: masterItems.filter((m) => m.present && !m.stale).length, total: masterItems.length, items: masterItems },
    daily: { ok: dailyItems.filter((d) => d.on === 'date').length, total: dailyItems.length, items: dailyItems },
    sources: SOURCES.map((source) => {
      const own = DAILY.filter((d) => d[3] === source)
      return {
        source, configured: CONFIGURED[source], missingKeys: CONFIGURED[source] ? [] : KEYS[source],
        files: own.map((d) => d[0]), fetchable: CONFIGURED[source] ? own.filter((d) => d[4] === 'any-date' || date === t).map((d) => d[0]) : [],
      }
    }),
    build: {
      ready: !blockers.length,
      uses: { masters: masterItems.filter((m) => m.present).length, ofDate: dailyItems.filter((d) => d.on === 'date').length, earlier: dailyItems.filter((d) => d.on === 'earlier').map((d) => ({ name: d.name, date: d.fileDate as string })) },
      toFetch, fetchRequired, blockers, warnings, spread: [],
    },
    latestReport: runs.find((r) => r.kind === 'report' && r.asOf === date) ?? null,
    running: runs.filter(isActive),
  }
}

export const previewDay = (date: string) => { ensureSeeded(); return wait(plan(date)) }

export const previewUpload = async (name: string, file: File, date: string, onProgress?: (p: number) => void): Promise<SavedInput> => {
  ensureSeeded()
  for (const p of [0.25, 0.5, 0.75, 1]) { await wait(null, 120); onProgress?.(p) }
  const m = masters.get(name)
  if (MASTERS.some(([n]) => n === name)) {
    if (m && m.size === file.size) return { name, unchanged: true }
    masters.set(name, { at: now(), by: user.name, via: 'upload', size: file.size, versions: m ? [{ version: `v${m.versions.length + 1}`, at: m.at, size: m.size, byName: m.by, source: m.via }, ...m.versions] : [] })
    return { name, unchanged: false }
  }
  if (!DAILY.some(([n]) => n === name)) throw new Error(`${name} is not an in-transit input`)
  if (!daily.has(date)) daily.set(date, new Map())
  daily.get(date)!.set(name, { at: now(), by: user.name, via: 'upload', size: file.size })
  return { name, unchanged: false }
}

export const previewDeleteInput = (name: string, date: string) => { daily.get(date)?.delete(name); return wait(undefined) }
export const previewMasterHistory = (name: string) => { ensureSeeded(); return wait(masters.get(name)?.versions ?? []) }
export const previewRestore = (name: string, version: string) => {
  const m = masters.get(name)
  const v = m?.versions.find((x) => x.version === version)
  if (m && v) Object.assign(m, { at: now(), by: user.name, via: 'restore', size: v.size })
  return wait({ name, unchanged: false })
}

// ---- jobs -------------------------------------------------------------------------------------------------------

/** A fake fetch: the source's files appear in the day after a few seconds. */
const playFetch = (run: IntransitRun, files: string[], ms: number, onLine?: (l: string) => void): Promise<void> =>
  new Promise((done) => {
    const date = run.asOf as string
    const jobs = run.kind === 'uniware' ? 134 : 2
    setTimeout(() => Object.assign(run, { status: 'running', startedAt: now() }), 300)
    for (let i = 1; i <= 6; i++) {
      setTimeout(() => {
        const line = run.kind === 'uniware' ? `export jobs done ${Math.round((jobs * i) / 6)}/${jobs}` : `report ${i}/6 …`
        run.logTail?.push(line)
        onLine?.(line)
      }, 300 + (i * ms) / 7)
    }
    setTimeout(() => {
      if (!daily.has(date)) daily.set(date, new Map())
      for (const f of files) daily.get(date)!.set(f, { at: now(), by: null, via: run.kind as Source, size: sizeOf(f) })
      Object.assign(run, { status: 'succeeded', finishedAt: now(), result: { saved: files, rejected: {} } })
      done()
    }, 400 + ms)
  })

export const previewStartReport = ({ asOf, fetchFirst }: { asOf: string; fetchFirst: boolean }) => {
  ensureSeeded()
  const p = plan(asOf)
  const blockers = [...p.build.blockers, ...(fetchFirst ? [] : p.build.fetchRequired)]
  if (blockers.length) return Promise.reject(new Error(`Upload these first: ${blockers.join('; ')}`))
  const steps = fetchFirst ? p.build.toFetch : []
  const run: IntransitRun = { ...blankRun('report', asOf), options: { fetchFirst, toFetch: steps, step: steps.length ? `fetching ${steps[0].source}` : 'building', progress: null } }
  runs.unshift(run)
  void (async () => {
    await wait(null, 600)
    Object.assign(run, { status: 'running', startedAt: now() })
    const fetched = []
    if (asOf === today()) {
      // like the real build: Shipment_Status / PO_Format read from PEPIMS first (last 90 days)
      run.options = { ...run.options, step: `fetching ${PEPIMS_CONNECTOR}`, progress: 'PEPIMS: POs with Entry Date … (90 days)' }
      await wait(null, 1500)
      if (!daily.has(asOf)) daily.set(asOf, new Map())
      for (const [name, , , connector] of DAILY) if (connector === PEPIMS_CONNECTOR) daily.get(asOf)!.set(name, { at: now(), by: null, via: PEPIMS_CONNECTOR, size: sizeOf(name) })
      fetched.push({ source: PEPIMS_CONNECTOR, runId: null, status: 'succeeded', files: ['Shipment_Status.csv', 'PO_Format.csv'], error: null })
    }
    for (const s of steps) {
      run.options = { ...run.options, step: `fetching ${s.source}` }
      const f = { ...blankRun(s.source, asOf), options: { date: asOf, only: s.only } }
      runs.unshift(f)
      await playFetch(f, s.files, s.source === 'uniware' ? 6000 : 2500, (line) => { run.options = { ...run.options, progress: line } })
      fetched.push({ source: s.source, runId: f.id, status: 'succeeded', files: s.files, error: null })
    }
    run.options = { ...run.options, step: 'building' }
    for (const [i, st] of STAGES.entries()) {
      await wait(null, 450)
      run.options = { ...run.options, progress: `=== ${st} === (${i + 1}/${STAGES.length})` }
      run.logTail?.push(`=== ${st} ===`)
    }
    const used = plan(asOf).build.uses
    Object.assign(run, {
      status: 'succeeded', finishedAt: now(), summary: summary(), sheetRows: sheetRows(), hasReport: true, timings: { total: 24.1 },
      options: { ...run.options, step: 'done' },
      result: { comboCheck: COMBO_CHECK, inputsUsed: { masters: used.masters, ofDate: [], earlier: used.earlier }, fetched },
    })
  })()
  return wait(run)
}

export const previewStartConnector = (source: Source, { date, only }: { date: string; only?: string[] }) => {
  ensureSeeded()
  if (runs.some((r) => r.kind === source && isActive(r))) return Promise.reject(new Error(`The ${source} fetch is already running`))
  if (!CONFIGURED[source]) return Promise.reject(new Error(`The ${source} connector is not set up yet`))
  const t = today()
  const files = DAILY.filter((d) => d[3] === source && (date === t || d[4] === 'any-date') && (!only?.length || only.includes(FETCH_KEY[d[0]]))).map((d) => d[0])
  if (!files.length) return Promise.reject(new Error(`${source} only gives the current state: it can be fetched for today, not ${date}`))
  const run: IntransitRun = { ...blankRun(source, date), options: { date, only } }
  runs.unshift(run)
  void playFetch(run, files, source === 'uniware' ? 6000 : 2500)
  return wait(run)
}

export const previewListRuns = (kind?: string) => { ensureSeeded(); return wait(runs.filter((r) => !kind || r.kind === kind)) }
export const previewGetRun = (id: string) => wait(runs.find((r) => r.id === id) ?? runs[0])
export const previewDeleteRun = (id: string) => {
  const i = runs.findIndex((r) => r.id === id)
  if (i >= 0) runs.splice(i, 1)
  return wait(undefined)
}
export const previewDownload = () => Promise.reject(new Error('Preview mode: there is no real file to download. Start the backend to build a real report.'))

/** Preview: pretend the variants were mapped. */
export const previewMapVariants = (variants: { variant: string; base: string }[]) =>
  wait({ mapped: variants.map((v) => ({ variant: v.variant, base: v.base })), skipped: [] as { variant: string; reason: string }[], split1: { added: [] as { combo: string; rows: number }[], skipped: [] as { combo: string; reason: string }[] } })

/** Preview: pretend the combos were added to Split1. */
export const previewAddToSplit1 = (combos: { combo: string; components: { sku: string; qty: number }[] }[]) =>
  wait({ added: combos.map((c) => ({ combo: c.combo, rows: c.components.reduce((t, x) => t + x.qty, 0) })), skipped: [] as { combo: string; reason: string }[] })

/** A made-up CSV page for the viewer: 240 rows of sample columns, searchable. */
export const previewCsv = (name: string, page: { offset: number; limit: number; q: string }) => {
  const columns = ['SKU', 'Name', 'Facility', 'Quantity', 'Status']
  const all = Array.from({ length: 240 }, (_, i) => [SKUS[i % SKUS.length][0], SKUS[i % SKUS.length][1], PLACES[i % PLACES.length][2], String((i * 37) % 500), i % 3 ? 'OPEN' : 'CLOSED'])
  const q = page.q.trim().toLowerCase()
  const rows = q ? all.filter((r) => r.join(' ').toLowerCase().includes(q)) : all
  return wait({ name, size: 48_213, modified: now(), columns, rows: rows.slice(page.offset, page.offset + page.limit), total: rows.length, totalRows: all.length, offset: page.offset, limit: page.limit })
}

// ---- inventory ---------------------------------------------------------------------------------------------------

const SKUS: [string, string][] = [
  ['MCF-VITC-30', 'Vitamin C Face Serum 30ml'], ['MCF-COFF-100', 'Coffee Body Scrub 100g'], ['HYP-NIAC-30', 'Niacinamide Serum 30ml'],
  ['MCF-BEARD-KIT', 'Beard Grooming Kit'], ['MCF-UNDER-EYE', 'Under Eye Cream 30g'], ['HYP-SUNSCR-50', 'SPF 50 Sunscreen 50ml'],
  ['MCF-SHAMP-250', 'Coffee Shampoo 250ml'], ['MCF-FACEWASH', 'Charcoal Face Wash 100g'], ['MCF-LIPBALM', 'Coffee Lip Balm 12g'],
  ['HYP-CERA-MOIST', 'Ceramide Moisturiser 50g'], ['MCF-BODYWASH', 'Coffee Body Wash 300ml'], ['MCF-HAIROIL', 'Coffee Hair Oil 100ml'],
]
/** [channel, channel type, location] */
const PLACES: [string, string, string][] = [
  ['Amazon', 'B2C', 'Gurgaon'], ['Amazon', 'B2C', 'Bangalore'], ['Flipkart', 'B2C', 'Kolkata'], ['Myntra', 'B2C', 'Mumbai'],
  ['D2C', 'D2C', 'Mumbai'], ['D2C', 'D2C', 'Hyderabad'], ['DarkStore', 'DarkStore', 'Delhi'], ['GGNMWH', 'GGNMWH', 'gurgaon'],
  ['MUMMWH', 'MUMMWH', 'mumbai'], ['Return', 'Return', 'mumbai'],
]
const inventory = (): InventoryView => {
  ensureSeeded()
  const rows: InventoryRow[] = []
  SKUS.forEach(([sku, name], i) => PLACES.forEach(([ch, type, loc], j) => {
    const s = (i * 31 + j * 17) % 23
    if (s % 4 === 0) return
    rows.push([sku, name, ch, type, loc, s * 137, j < 4 && s % 3 ? s * 41 : 0])
  }))
  const latest = runs.find((r) => r.kind === 'report' && r.status === 'succeeded')
  return { runId: latest?.id ?? null, asOf: latest?.asOf ?? null, builtAt: latest?.finishedAt ?? null, rows }
}

/** The preview's Daily Snapshot: Sheet35(2) made from the same rows (component level, Stock Type per row). */
const PREVIEW_SHEET35 = 'preview:Sheet35(2).csv'
export const previewSnapshot = (day?: string) => {
  const inv = inventory()
  const requested = day ?? today()
  return wait({
    requested,
    shown: inv.runId ? { day: inv.asOf as string, runId: inv.runId, builtAt: inv.builtAt as string } : null,
    latestMissing: inv.asOf !== requested,
    files: inv.runId ? [{ name: 'Sheet35(2)', key: PREVIEW_SHEET35, etag: `p${inv.rows.length}`, size: 0 }] : [],
  })
}
export const previewSnapshotFile = (key: string) => {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const lines = ['Split2 SKU,SKU Name,Final Location,Channel Name,Channel type,Stock Type,Consider?,Final Units,Found in Sheet35 Master']
  inventory().rows.forEach(([sku, name, ch, type, loc, soh, it], i) => {
    const found = i % 29 === 0 ? 'No' : 'Yes'
    if (soh) lines.push([sku, name, loc, ch, type, 'SOH', 'Yes', soh, found].map(q).join(','))
    if (it) lines.push([sku, name, loc, ch, type, 'Intransit', 'Yes', it, found].map(q).join(','))
  })
  return wait({ text: `${lines.join('\r\n')}\r\n`, etag: key })
}
export const previewPeriods = () => wait([
  { kind: 'weekly' as const, fy: 'FY26-27', label: 'W43', from: '2026-10-19', key: 'inventory/Weekly Snapshot/FY26-27/W43.xlsx', size: 41_000_000, modified: now() },
  { kind: 'monthly' as const, fy: 'FY26-27', label: 'September', from: '2026-09-01', key: 'inventory/Monthly Snapshot/FY26-27/September.xlsx', size: 40_500_000, modified: now() },
])
