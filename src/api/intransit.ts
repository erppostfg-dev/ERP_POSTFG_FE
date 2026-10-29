import { api, ApiError, apiUrl } from './client'
import { ERROR_CODE } from '../constants/auth'
import { INTRANSIT_ENDPOINT, PEPIMS_CONNECTOR, type RunStatus, type Source } from '../constants/intransit'
import * as P from '../dev/intransitPreview'

/* In-transit stock API (POST_FG src/routes/intransit.routes.ts). */

/** Where a stored input came from. */
export type InputOrigin = 'upload' | Source | typeof PEPIMS_CONNECTOR | 'restore' | 'edit' | 'migrated'

/** A master: kept once, replaced by uploading a new version (the old one is kept and can be restored). */
export interface MasterItem {
  name: string
  source: string
  /** daily = expected to be updated every day (Shipment_Status, PO_Format). */
  refresh: 'daily' | 'on-change'
  present: boolean
  updatedAt: string | null
  updatedBy: string | null
  via: InputOrigin | null
  size: number | null
  sha256: string | null
  /** A daily master last updated before the day. */
  stale: boolean
  versions: number
  problems: string[]
}

/** A daily file of the day: the day's own copy, an earlier day's copy, or none. */
export interface DailyItem {
  name: string
  /** upload = from a portal by hand; api = fetched by a connector */
  group: 'upload' | 'api'
  source: string
  /** 'pepims' = read from PEPIMS when the report is built (Shipment_Status, PO_Format). */
  connector: Source | typeof PEPIMS_CONNECTOR | null
  fetchable: boolean
  notFetchable: string | null
  on: 'date' | 'earlier' | 'missing'
  fileDate: string | null
  updatedAt: string | null
  updatedBy: string | null
  via: InputOrigin | null
  size: number | null
  problems: string[]
}

export interface FetchStep {
  source: Source
  only: string[]
  files: string[]
}

/** One day of the ribbon: how many of its daily files are its own, and its latest report. */
export interface DaySummary {
  date: string
  ofDate: number
  total: number
  report: { id: string; status: RunStatus } | null
}

/** GET /intransit/day?date=: everything the Daily run page shows for a day. */
export interface DayPlan {
  date: string
  today: string
  /** The last days, oldest first, ending with today. */
  days: DaySummary[]
  masters: { ok: number; total: number; items: MasterItem[] }
  daily: { ok: number; total: number; items: DailyItem[] }
  sources: { source: Source; configured: boolean; missingKeys: string[]; files: string[]; fetchable: string[] }[]
  build: {
    ready: boolean
    uses: { masters: number; ofDate: number; earlier: { name: string; date: string }[] }
    toFetch: FetchStep[]
    fetchRequired: string[]
    blockers: string[]
    warnings: string[]
    /** The day's files saved far apart (INTRANSIT_INPUT_SPREAD_WARN_HOURS): a report mixing two moments. */
    spread: string[]
  }
  /** The newest report run of the day, if any. */
  latestReport: IntransitRun | null
  /** Builds and fetches queued or running now. */
  running: IntransitRun[]
}

export interface MasterVersion {
  version: string
  at: string
  size: number
  byName: string | null
  source: InputOrigin | null
}

export interface SavedInput {
  name: string
  unchanged: boolean
}

export interface IntransitRun {
  id: string
  kind: 'report' | Source
  status: RunStatus
  asOf: string | null
  /** Report: { fetchFirst, toFetch, step: 'fetching <source>' | 'building' | 'done', progress: last log line }. Fetch: { date, only }. */
  options: Record<string, unknown> | null
  createdBy: { id: number; name: string } | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  error: string | null
  timings: Record<string, number> | null
  /** Summary_Dashboard rows: Final Status, Shipments, Total Units, Updated Qty, Intransit?. */
  summary: Record<string, string | number>[] | null
  sheetRows: Record<string, number> | null
  /** Connector: { saved, rejected }. Report: { comboCheck, inputsUsed, fetched }. */
  result: {
    saved?: string[]; rejected?: Record<string, string[]>; comboCheck?: ComboCheck | null
    inputsUsed?: { masters: number; ofDate: string[]; earlier: { name: string; date: string }[] }
    fetched?: { source: Source | typeof PEPIMS_CONNECTOR; runId: string | null; status: string; files: string[]; error: string | null }[]
  } | null
  hasReport: boolean
  /**
   * S3 store: the workbook is kept 90 days from its day (expired: the week's / month's copy holds the period's final
   * build); weekly / monthly = "FY26-27/W44", "FY26-27/October".
   */
  report?: { state: 'stored' | 'expired'; expiresOn: string; weekly: string; monthly: string } | null
  logTail?: string[]
}

/**
 * Combos missing from Split1, checked after each build against Uniware's item master (Uniware BUNDLE among the SKUs of
 * "SKU not available in Split1").
 */
export interface ComboCheck {
  status: 'done' | 'skipped' | 'failed'
  reason?: string
  checked: number
  /** foundBy: uniware+code / uniware = Uniware BUNDLE (confirmed); code-only = CMB/SCMB/COMB in the code only. */
  combos: { sku: string; name: string; channelTypes: string; units: number; foundBy: 'uniware+code' | 'uniware' | 'variant' | 'code-only'; uniwareType: string; components: { sku: string; qty: number }[]; inSplit1?: boolean
    /** variant (CMB47B2b): its base combo (CMB47) with Uniware's components; mapped = in Final SKU Mapping by now. */
    base?: { sku: string; name: string; components: { sku: string; qty: number }[]; inSplit1?: boolean }; mapped?: boolean }[]
  unknownInUniware: number
  lookedUp: number
}

/** [sku, name, channel, channel type, location, soh, in-transit] */
export type InventoryRow = [string, string, string, string, string, number, number]

export interface InventoryView {
  runId: string | null
  asOf: string | null
  builtAt: string | null
  rows: InventoryRow[]
}

const E = INTRANSIT_ENDPOINT
const enc = encodeURIComponent

// DEV-ONLY: with the in-transit preview on (no backend / login), every call below is answered by src/dev/intransitPreview.ts.
const pv = () => P.preview.on

export const getDay = (date: string, signal?: AbortSignal) => pv() ? P.previewDay(date) : api<DayPlan>(`${E}/day?date=${date}`, { signal })

/**
 * POST /intransit/inputs/:name?date= (multipart "file"), with upload progress (0..1): a master replaces the current
 * one (unchanged when it is the same file), a daily file becomes the day's copy.
 */
export function uploadInput(name: string, file: File, date: string, onProgress?: (p: number) => void): Promise<SavedInput> {
  if (pv()) return P.previewUpload(name, file, date, onProgress)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', apiUrl(`${E}/inputs/${enc(name)}?date=${date}`))
    xhr.withCredentials = true
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    xhr.onerror = () => reject(new ApiError(0, ERROR_CODE.NETWORK, 'Cannot reach the server'))
    xhr.onload = () => {
      let body: { data?: SavedInput; error?: { code: string; message: string; details?: unknown } } | null = null
      try { body = JSON.parse(xhr.responseText) } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && body?.data) return resolve(body.data)
      const err = body?.error
      reject(new ApiError(xhr.status, err?.code ?? `HTTP_${xhr.status}`, err?.message ?? xhr.statusText, err?.details))
    }
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}

/** DELETE /intransit/inputs/:name?date=: remove a daily file of the day (the day then uses an earlier copy). */
export const deleteInput = (name: string, date: string) => pv() ? P.previewDeleteInput(name, date) : api<void>(`${E}/inputs/${enc(name)}?date=${date}`, { method: 'DELETE' })
export const getMasterHistory = (name: string, signal?: AbortSignal) => pv() ? P.previewMasterHistory(name) : api<MasterVersion[]>(`${E}/inputs/${enc(name)}/history`, { signal })
export const restoreMaster = (name: string, version: string) =>
  pv() ? P.previewRestore(name, version) : api<SavedInput>(`${E}/inputs/${enc(name)}/restore`, { method: 'POST', body: JSON.stringify({ version }) })

export const listRuns = (kind?: string, signal?: AbortSignal) => pv() ? P.previewListRuns(kind) : api<IntransitRun[]>(`${E}/runs${kind ? `?kind=${kind}` : ''}`, { signal })
export const getRun = (id: string, signal?: AbortSignal) => pv() ? P.previewGetRun(id) : api<IntransitRun>(`${E}/runs/${id}`, { signal })
/** GET /intransit/runs/:id/log: the whole log as text (read again while the run goes on, for the live view). */
export async function getRunLog(id: string, signal?: AbortSignal): Promise<string> {
  if (pv()) return ((await P.previewGetRun(id)).logTail ?? []).join('\n')
  let res: Response
  try {
    res = await fetch(apiUrl(`${E}/runs/${id}/log`), { credentials: 'include', signal })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new ApiError(0, ERROR_CODE.NETWORK, 'Cannot reach the server')
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null))?.error
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? res.statusText)
  }
  return res.text()
}
/** POST /intransit/runs: build the report of a day; fetchFirst fetches the API files not of that day first. */
export const startReport = (opts: { asOf: string; fetchFirst: boolean }) =>
  pv() ? P.previewStartReport(opts) : api<IntransitRun>(`${E}/runs`, { method: 'POST', body: JSON.stringify(opts) })
export const deleteRun = (id: string) => pv() ? P.previewDeleteRun(id) : api<void>(`${E}/runs/${id}`, { method: 'DELETE' })
/** POST /intransit/connectors/:source: fetch its files for a day (a past day: only those fetchable for any day). */
export const startConnector = (source: Source, opts: { date: string; only?: string[] }) =>
  pv() ? P.previewStartConnector(source, opts) : api<IntransitRun>(`${E}/connectors/${source}`, { method: 'POST', body: JSON.stringify(opts) })

/**
 * GET /intransit/snapshot?day=: the Daily Snapshot of the newest day <= day with a final build (Inventory Calculation).
 * latestMissing: the asked day has none, so an earlier build is shown.
 */
export interface SnapshotView {
  requested: string
  shown: { day: string; runId: string; builtAt: string } | null
  latestMissing: boolean
  files: { name: string; key: string; etag: string; size: number }[]
}
export const getSnapshot = (day?: string, signal?: AbortSignal) =>
  pv() ? P.previewSnapshot(day) : api<SnapshotView>(`${E}/snapshot${day ? `?day=${day}` : ''}`, { signal })

/** One snapshot CSV; 'not-modified' when the browser's copy (etag) is still current. */
export async function getSnapshotFile(key: string, etag: string | null, signal?: AbortSignal): Promise<{ text: string; etag: string } | 'not-modified'> {
  if (pv()) return P.previewSnapshotFile(key)
  let res: Response
  try {
    res = await fetch(apiUrl(`${E}/snapshot/file?key=${enc(key)}`), { credentials: 'include', signal, headers: etag ? { 'If-None-Match': `"${etag}"` } : {} })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, ERROR_CODE.NETWORK, 'Cannot reach the server')
  }
  if (res.status === 304) return 'not-modified'
  if (!res.ok) {
    const e = (await res.json().catch(() => null))?.error
    throw new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, e?.message ?? res.statusText, e?.details)
  }
  return { text: await res.text(), etag: (res.headers.get('ETag') ?? '').replace(/"/g, '') }
}

/** A weekly / monthly copy of the period's final workbook (kept forever). */
export interface PeriodCopy {
  kind: 'weekly' | 'monthly'
  fy: string
  label: string
  /** The period's first day: sort by this (W01 comes after W53 within an FY). */
  from: string | null
  key: string
  size: number
  modified: string
}
export const listPeriods = (signal?: AbortSignal) => pv() ? P.previewPeriods() : api<PeriodCopy[]>(`${E}/periods`, { signal })
export const downloadPeriod = (p: PeriodCopy) => saveFrom(`${E}/periods/download?key=${enc(p.key)}`, `Intransit_Stock_Report_${p.fy}_${p.label}.xlsx`)

/** Fetch a protected file (the session cookie goes along) and hand it to the browser as a download. */
async function saveFrom(path: string, fallbackName: string): Promise<void> {
  if (pv()) return P.previewDownload()
  let res: Response
  try {
    res = await fetch(apiUrl(path), { credentials: 'include' })
  } catch {
    throw new ApiError(0, ERROR_CODE.NETWORK, 'Cannot reach the server')
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null))?.error
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? res.statusText, err?.details)
  }
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const downloadReport = (id: string) => saveFrom(`${E}/runs/${id}/report`, `Intransit_Stock_Report_run${id}.xlsx`)
export const downloadLog = (id: string) => saveFrom(`${E}/runs/${id}/log`, `intransit_run${id}.log`)

// ---- CSV viewer ----------------------------------------------------------------------------------------------------

/** A page of a table in the viewer (worked out in this browser from the whole file, lib/csvTable.ts). */
export interface CsvPage {
  name: string
  size: number
  modified: string
  columns: string[]
  rows: string[][]
  /** Rows matching the search (all rows when there is none). */
  total: number
  totalRows: number
  offset: number
  limit: number
}

/**
 * Which table the viewer shows: an input (a master, or the daily file used for `date`), a file a connector run
 * fetched (saved or refused), or a sheet of a built report (e.g. Sheet35(2)).
 */
export type CsvTarget =
  | { kind: 'input'; name: string; date?: string }
  | { kind: 'run'; runId: string; name: string }
  | { kind: 'sheet'; runId: string; name: string }

const csvBase = (t: CsvTarget) =>
  t.kind === 'input' ? `${E}/inputs/${enc(t.name)}`
    : t.kind === 'run' ? `${E}/runs/${t.runId}/files/${enc(t.name)}`
    : `${E}/runs/${t.runId}/sheets/${enc(t.name)}`

const dateQs = (t: CsvTarget): Record<string, string> => (t.kind === 'input' && t.date ? { date: t.date } : {})

/** Preview mode only: the made-up page (the real viewer pages the whole file here, lib/csvTable.ts). */
export const isPreview = (): boolean => pv()
export const previewCsvPage = (t: CsvTarget, page: { offset: number; limit: number; q: string }): Promise<CsvPage> => P.previewCsv(t.name, page)

/** Where a table's whole file is read from (GET .../table): also its key in this browser's cache. */
export const csvTableUrl = (t: CsvTarget): string => {
  const qs = new URLSearchParams(dateQs(t)).toString()
  return `${csvBase(t)}/table${qs ? `?${qs}` : ''}`
}

/** UTF-8, else cp1252 (Sheet35(2) and Shipment_Status come in cp1252), as the server reads them. */
const decodeCsv = (buf: ArrayBuffer): string => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

/**
 * GET .../table: the whole file (gzip on the wire), or 'not-modified' when `etag` is still its version (the browser's
 * copy is current: nothing is downloaded).
 */
export async function getCsvTable(t: CsvTarget, etag: string | null, signal?: AbortSignal): Promise<{ text: string; etag: string; size: number; modified: string } | 'not-modified'> {
  let res: Response
  try {
    res = await fetch(apiUrl(csvTableUrl(t)), { credentials: 'include', signal, headers: etag ? { 'If-None-Match': `"${etag}"` } : {} })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, ERROR_CODE.NETWORK, 'Cannot reach the server')
  }
  if (res.status === 304) return 'not-modified'
  if (!res.ok) {
    const e = (await res.json().catch(() => null))?.error
    throw new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, e?.message ?? res.statusText, e?.details)
  }
  const text = decodeCsv(await res.arrayBuffer())
  return {
    text,
    etag: (res.headers.get('ETag') ?? '').replace(/"/g, ''),
    size: Number(res.headers.get('X-File-Size') ?? text.length),
    modified: new Date(res.headers.get('Last-Modified') ?? Date.now()).toISOString(),
  }
}

/** POST /intransit/final-sku/variants: map combo variants to their base in Final SKU Mapping (a base not in Split1 is added there). */
export const mapVariants = (variants: { variant: string; base: string; components?: { sku: string; qty: number }[] }[]) =>
  pv() ? P.previewMapVariants(variants) : api<{ mapped: { variant: string; base: string }[]; skipped: { variant: string; reason: string }[]; split1: { added: { combo: string; rows: number }[]; skipped: { combo: string; reason: string }[] } }>(`${E}/final-sku/variants`, { method: 'POST', body: JSON.stringify({ variants }) })

/** POST /intransit/split1/rows: append flagged combos (with their components) to Split1.csv on the server. */
export const addToSplit1 = (combos: { combo: string; components: { sku: string; qty: number }[] }[]) =>
  pv() ? P.previewAddToSplit1(combos) : api<{ added: { combo: string; rows: number }[]; skipped: { combo: string; reason: string }[] }>(`${E}/split1/rows`, { method: 'POST', body: JSON.stringify({ combos }) })

export const downloadCsvFile = (t: CsvTarget) => {
  const qs = new URLSearchParams(dateQs(t)).toString()
  return saveFrom(`${csvBase(t)}/download${qs ? `?${qs}` : ''}`, t.kind === 'sheet' ? `${t.name}_run${t.runId}.csv` : t.name)
}
