import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Download, Eye, History, Layers, Pencil, Plus, Power, RefreshCw, X } from 'lucide-react'
import { ApiError } from '../api/client'
import { getMasterChanges, getMasterHistory, setMasterActive, listChannelCustomers, listChannelSkus, listChannelWarehouses, listPepSkus, listPepWarehouses, type ChannelCustomerItem, type ChannelSkuItem, type ChannelWarehouseItem, type MasterHistoryItem, type PepSkuItem, type PepWarehouseItem } from '../api/masters'
import { ADD_TEXT, EDIT_TEXT, HISTORY_TEXT, MASTER_ADD_ROLES, SWITCH_OFF_EFFECT, SWITCH_ON_EFFECT, MASTER_HISTORY_DAYS, MASTER_LOG_ACTION_LABEL, MASTER_LOG_SOURCE_LABEL, MASTER_LOG_TYPE, MASTER_LOG_TYPE_LABEL, NOT_AVAILABLE_YET, NOT_IN_DB, SKU_STATUS, masterFieldLabel } from '../constants/masters'
import { Timeline, type TimelineOptions } from './ops/ShipmentHistory'
import { useAuth } from '../auth/AuthContext'
import { ACCESS } from '../constants/auth'
import { PATHS } from '../constants/pages'
import { MasterAddDrawer, type AddMaster, type EditMaster } from '../components/MasterAddDrawer'
import { MASTER_TABS } from '../lib/data'
import FacilityCheckBanner from './dp/intransit/FacilityCheckBanner'
import { OPS_CHANNELS, type ColKind } from '../lib/ops'
import { Badge, Button, Drawer, PageTitle } from '../components/ui'
import { Reveal } from '../components/shell'
import { DataGrid, FilterPanel, PrimaryBtn, SectionToolbar, exportRows, exportRowsExcel, inputCls, useSection, type FilterDef } from '../components/kit'

type Row = Record<string, string | number>
type FieldDef = { key: string; label: string; options?: readonly string[]; type?: 'number' }

// ---- Seed data --------------------------------------------------------------
/** The Edit form's values of each row ("<master>:<row id>" -> form key -> value as text), filled by the row builders. */
const FORM_VALUES = new Map<string, Record<string, string>>()
const sv = (x: unknown) => (x === null || x === undefined ? '' : Array.isArray(x) ? x.join(', ') : String(x))
const remember = (master: string, rid: string | number | null, values: Record<string, unknown>) => {
  if (rid !== null && rid !== '') FORM_VALUES.set(`${master}:${rid}`, Object.fromEntries(Object.entries(values).map(([k, x]) => [k, sv(x)])))
}
/* PEP SKU master from the backend. Category, sub-category and filling have no master_skus column (NOT_IN_DB);
   no Recipe column (user, 2026-10-15: not needed);
   a column that exists but is empty stays '' and the grid shows "—". */
const pepRow = (s: PepSkuItem): Row => (remember('pep', s.id, {
  pepCode: s.pepCode, productName: s.productName, brand: s.brand, productType: s.productType, mrp: s.mrp, gstTaxType: s.gstTaxType, eanCode: s.eanCode,
  hsnCode: s.hsnCode, lengthMm: s.lengthMm, widthMm: s.widthMm, heightMm: s.heightMm, weightG: s.weightG, shelfLife: s.shelfLife,
}), {
  rid: s.id, code: s.pepCode, name: s.productName ?? '', brand: s.brand ?? '', type: s.productType ?? '',
  category: NOT_IN_DB, sub: NOT_IN_DB, filling: NOT_IN_DB, mrp: s.mrp ?? '', gst: s.gstTaxType ? `${s.gstTaxType}%` : '',
  ean: s.eanCode ?? '', hsn: s.hsnCode ?? '',
  size: s.lengthMm !== null && s.widthMm !== null && s.heightMm !== null ? `${s.lengthMm} × ${s.widthMm} × ${s.heightMm}` : '',
  weight: s.weightG ?? '', shelfLife: s.shelfLife ?? '', status: s.isActive ? SKU_STATUS.ACTIVE : SKU_STATUS.INACTIVE,
  // shown since 2026-10-28 (the data was in the DB): base SKU, expiry basis, the In-transit report's fields
  baseSku: s.finalPepCode ?? '', expiryFrom: s.determineExpiryFrom ?? '', itName: s.intransitName ?? '', itType: s.intransitType ?? '',
  itCount: s.intransitCategory ?? '', itMrp: s.intransitMrp ?? '', itCogs: s.intransitCogs ?? '', itConsider: s.intransitConsider ? 'Yes' : 'No',
})
/* Channel SKU master from the backend. A channel code is unique only within its channel, so the row key is the DB id.
   margin comes as a fraction (0.27) and is shown as a percent; the listing status has no column (NOT_IN_DB). */
const channelSkuRow = (c: ChannelSkuItem): Row => (remember('channelSku', c.id, {
  channelId: c.channelId, channelCode: c.channelCode, pepCode: c.pepCode, productName: c.productName, brand: c.brand, mrp: c.mrp,
  marginPercent: c.margin !== null ? Math.round(c.margin * 10000) / 100 : null, rateAfterMargin: c.rateAfterMargin, eanCode: c.eanCode,
}), {
  id: c.id, rid: c.id, channel: c.channelName ?? '', channelSku: c.channelCode ?? '', pepCode: c.pepCode, name: c.productName ?? '', brand: c.brand ?? '',
  mrp: c.mrp ?? '', margin: c.margin !== null ? Math.round(c.margin * 10000) / 100 : '', rate: c.rateAfterMargin ?? '', ean: c.eanCode ?? '',
  status: c.isActive ? SKU_STATUS.ACTIVE : SKU_STATUS.INACTIVE,
})
/* Channel / Customer master from the backend: one row per master_channels row, with its type and expiry days (2026-10-28).
   Legal name, billing GSTIN, payment terms, default margin and PO source have no column (NOT_IN_DB). */
const list = (v: string[]) => v.join(', ')
const expiryText = (min: number | null, max: number | null) => min === null && max === null ? '' : min === max || max === null ? `${min} days` : `${min ?? '?'} – ${max} days`
const customerRow = (c: ChannelCustomerItem): Row => (remember('customer', c.id, {
  displayName: c.displayName, slug: c.slug, aliases: c.aliases, channelType: c.channelType, expiryDaysMin: c.expiryDaysMin, expiryDaysMax: c.expiryDaysMax,
}), {
  id: c.id, rid: c.id, channel: c.displayName, slug: c.slug, aliases: list(c.aliases), channelCodes: list(c.channelCodes), facilities: list(c.facilityCodes), locations: c.locationCount,
  legal: NOT_IN_DB, type: c.channelType ?? '', expiry: expiryText(c.expiryDaysMin, c.expiryDaysMax), gstin: NOT_IN_DB, terms: NOT_IN_DB, margin: NOT_IN_DB, poSource: NOT_IN_DB,
  status: c.isActive ? SKU_STATUS.ACTIVE : SKU_STATUS.INACTIVE,
})
/* PEP warehouses: every master_facilities row (2026-10-28: was only the 2 codes the locations use) with its columns and
   what it serves; only City has no column. */
const pepWhRow = (w: PepWarehouseItem): Row => (remember('pepWh', w.id, {
  code: w.facilityCode, name: w.name, entity: w.entity, pickupLocation: w.pickupLocation, state: w.state, facilityType: w.facilityType,
  billToGstin: w.billToGstin, shipToGstin: w.shipToGstin, remarks: w.remarks,
}), {
  rid: w.id ?? '', facility: w.facilityCode, name: w.name ?? '', spellings: list(w.spellings), locations: w.locationCount, channels: list(w.channels),
  entity: w.entity ?? '', location: w.pickupLocation ?? '', city: NOT_IN_DB, state: w.state ?? '', type: w.facilityType ?? '',
  billTo: w.billToGstin ?? '', shipTo: w.shipToGstin ?? '', remarks: w.remarks ?? '', main: w.mainFacilityCode ?? '',
  group: w.intransitGroup ?? '', itType: w.intransitType ?? '', uniwareExport: w.uniwareExport ? 'Yes' : 'No', source: w.source ?? '',
  status: !w.inMaster ? 'Not in facility master' : w.isActive ? SKU_STATUS.ACTIVE : SKU_STATUS.INACTIVE,
})
/* Channel warehouses = details_channels (one delivery location each), incl. city, appointment, status, drop and in-transit
   location (2026-10-28: the data was there, the page did not read it). */
const chWhRow = (w: ChannelWarehouseItem): Row => (remember('chWh', w.id, {
  channelId: w.channelId, locationCode: w.locationCode, uniwareCustomerCode: w.uniwareCustomerCode, uniwareChannelCode: w.channelCode,
  facilityCode: w.facilityCode, consigneeName: w.consigneeName, consigneeGstNumber: w.consigneeGstNumber, consigneeState: w.consigneeState,
  consigneePinCode: w.consigneePinCode, shippingAddress: w.shippingAddress, billingAddress: w.billingAddress, buyerType: w.buyerType,
  buyerGstNumber: w.buyerGstNumber, buyerState: w.buyerState, buyerPinCode: w.buyerPinCode, tallyLedgerName: w.tallyLedgerName,
  appointmentChannel: w.appointmentChannel, city: w.city,
}), {
  id: w.id, rid: w.id, channel: w.channelName, code: w.locationCode ?? '', customer: w.uniwareCustomerCode ?? '', channelCode: w.channelCode ?? '', servedBy: w.facilityCode ?? '',
  consignee: w.consigneeName ?? '', gstin: w.consigneeGstNumber ?? '', state: w.consigneeState ?? '', pincode: w.consigneePinCode ?? '', city: w.city ?? '',
  shipAddr: w.shippingAddress ?? '', billAddr: w.billingAddress ?? '', buyerType: w.buyerType ?? '', buyerGst: w.buyerGstNumber ?? '', buyerState: w.buyerState ?? '',
  buyerPin: w.buyerPinCode ?? '', ledger: w.tallyLedgerName ?? '', apptPortal: w.appointmentChannel ?? '', apptType: w.appointmentChannelType ?? '',
  drop: w.dropLocation ?? '', itLocation: w.intransitLocation ?? '', status: w.isActive ? SKU_STATUS.ACTIVE : SKU_STATUS.INACTIVE,
})
/** Masters read from the backend, by config id. */
const LOADERS: Record<string, (signal: AbortSignal) => Promise<Row[]>> = {
  pep: (signal) => listPepSkus(signal).then((items) => items.map(pepRow)),
  channelSku: (signal) => listChannelSkus(signal).then((items) => items.map(channelSkuRow)),
  customer: (signal) => listChannelCustomers(signal).then((items) => items.map(customerRow)),
  pepWh: (signal) => listPepWarehouses(signal).then((items) => items.map(pepWhRow)),
  chWh: (signal) => listChannelWarehouses(signal).then((items) => items.map(chWhRow)),
}
/** Masters with an Add form (2026-10-27); Warehouses has no table yet. */
const ADDABLE: readonly string[] = ['pep', 'channelSku', 'customer', 'chWh'] satisfies AddMaster[]
const distinct = (rows: Row[], k: string) => [...new Set(rows.map((r) => String(r[k] ?? '')).filter(Boolean))].sort()

// ---- Config per master ------------------------------------------------------
type Cfg = {
  title: string; sub: string; key: string; entity: string; addLabel: string; search: string[]; placeholder: string
  cols: [string, string, ColKind][]; fields: FieldDef[]; filters: FilterDef[]
  trailing?: { label: string; render: (r: Row) => ReactNode }[]
  /** From the backend, no add / edit API yet: the drawer only shows the row. */
  readOnly?: boolean
  /** Multi-select filters whose options come from the loaded rows (instead of fixed `filters`). */
  filterKeys?: [string, string][]
  /** The field the drawer shows as its title when `key` is not readable (e.g. a DB id). */
  titleKey?: string
  /** Show the channel chips above the grid (quick filter by channel). */
  channelChips?: boolean
}
const notInDb = <span className="text-[12px] text-ink-400">{NOT_IN_DB}</span>
const status = (r: Row) => r.status === NOT_IN_DB ? notInDb : <Badge tone={r.status === 'Active' || r.status === 'Live' ? 'ok' : r.status === 'Unmapped' ? 'warn' : 'neutral'}>{String(r.status)}</Badge>

const CFG: Record<string, Cfg> = {
  pep: {
    title: 'PEP SKU Master', sub: 'Every sellable PEP SKU with its Uniware name, classification, MRP and GST', key: 'code', entity: 'PEP SKUs', addLabel: 'Add SKU',
    search: ['code', 'name', 'category', 'sub'], placeholder: 'Search SKU code, Uniware name, category…',
    cols: [['SKU Code', 'code', 'mono'], ['Uniware Name', 'name', 'text'], ['Brand', 'brand', 'text'], ['SKU Type', 'type', 'text'], ['Category', 'category', 'text'], ['Sub-Category', 'sub', 'text'], ['Filling', 'filling', 'text'], ['MRP', 'mrp', 'money'], ['GST', 'gst', 'text'], ['Base SKU', 'baseSku', 'mono']],
    fields: [{ key: 'code', label: 'SKU code' }, { key: 'name', label: 'Uniware name' }, { key: 'brand', label: 'Brand' }, { key: 'type', label: 'SKU type' },
      { key: 'category', label: 'Category' }, { key: 'sub', label: 'Sub-category' }, { key: 'filling', label: 'Filling' }, { key: 'mrp', label: 'MRP (₹)' },
      { key: 'gst', label: 'GST' }, { key: 'ean', label: 'EAN' }, { key: 'hsn', label: 'HSN code' },
      { key: 'size', label: 'Size L × W × H (mm)' }, { key: 'weight', label: 'Weight (g)' }, { key: 'shelfLife', label: 'Shelf life' }, { key: 'status', label: 'Status' },
      { key: 'baseSku', label: 'Base SKU (counted as)' }, { key: 'expiryFrom', label: 'Expiry counted from' },
      { key: 'itName', label: 'In-transit name' }, { key: 'itType', label: 'In-transit type' }, { key: 'itCount', label: 'In-transit count' },
      { key: 'itMrp', label: 'In-transit MRP (₹)' }, { key: 'itCogs', label: 'In-transit COGS (₹)' }, { key: 'itConsider', label: 'Counted in in-transit stock' }],
    filters: [],
    filterKeys: [['brand', 'Brand'], ['type', 'SKU Type'], ['gst', 'GST'], ['status', 'Status'], ['itConsider', 'In-transit stock']],
    readOnly: true,
    trailing: [
      { label: 'Status', render: status },
    ],
  },
  channelSku: {
    title: 'Channel SKU Master', sub: 'How each channel lists a PEP SKU — channel code, margin and the rate we bill at', key: 'id', titleKey: 'channelSku', entity: 'Channel SKUs', addLabel: 'Map channel SKU',
    search: ['channelSku', 'pepCode', 'name', 'ean'], placeholder: 'Search channel SKU, PEP code, product, EAN…',
    cols: [['Channel SKU', 'channelSku', 'mono'], ['Channel', 'channel', 'text'], ['PEP Code', 'pepCode', 'mono'], ['Product Name', 'name', 'text'], ['Brand', 'brand', 'text'], ['MRP', 'mrp', 'money'], ['Margin %', 'margin', 'num'], ['Rate After Margin', 'rate', 'money'], ['EAN', 'ean', 'mono']],
    fields: [{ key: 'channel', label: 'Channel' }, { key: 'channelSku', label: 'Channel SKU code' }, { key: 'pepCode', label: 'PEP SKU code' }, { key: 'name', label: 'Product name' },
      { key: 'brand', label: 'Brand' }, { key: 'mrp', label: 'MRP (₹)' }, { key: 'margin', label: 'Margin %' }, { key: 'rate', label: 'Rate after margin (₹)' }, { key: 'ean', label: 'EAN' }, { key: 'status', label: 'Status' }],
    filters: [],
    filterKeys: [['channel', 'Channel'], ['brand', 'Brand'], ['margin', 'Margin %']],
    readOnly: true, channelChips: true,
    trailing: [{ label: 'Status', render: status }],
  },
  customer: {
    title: 'Channel Master', sub: 'Every sales channel, with the Uniware channels and PEP facilities its delivery locations use', key: 'id', titleKey: 'channel', entity: 'Channels', addLabel: 'Add channel',
    search: ['channel', 'slug', 'aliases', 'channelCodes'], placeholder: 'Search channel, slug, other name, Uniware channel…',
    cols: [['Channel', 'channel', 'text'], ['Slug', 'slug', 'mono'], ['Uniware Channel', 'channelCodes', 'mono'], ['Locations', 'locations', 'num'], ['Legal Name', 'legal', 'text'], ['Type', 'type', 'text'], ['Billing GSTIN', 'gstin', 'mono'], ['Payment Terms', 'terms', 'text'], ['Expiry Days', 'expiry', 'text'], ['Default Margin %', 'margin', 'num'], ['PO Source', 'poSource', 'text']],
    fields: [{ key: 'channel', label: 'Channel' }, { key: 'slug', label: 'Slug' }, { key: 'aliases', label: 'Other names (PO intake)' }, { key: 'channelCodes', label: 'Uniware channel code(s)' },
      { key: 'facilities', label: 'Served from (PEP facility)' }, { key: 'locations', label: 'Delivery locations' }, { key: 'legal', label: 'Legal name' }, { key: 'type', label: 'Type' }, { key: 'expiry', label: 'Expiry days accepted' },
      { key: 'gstin', label: 'Billing GSTIN' }, { key: 'terms', label: 'Payment terms' }, { key: 'margin', label: 'Default margin %' }, { key: 'poSource', label: 'PO source' }, { key: 'status', label: 'Status' }],
    filters: [],
    filterKeys: [['type', 'Type'], ['status', 'Status']],
    readOnly: true,
    trailing: [{ label: 'Status', render: status }],
  },
  pepWh: {
    title: 'Warehouses', sub: 'Our dispatch facilities (the Uniware facility codes the channel locations use)', key: 'facility', entity: 'warehouses', addLabel: 'Add warehouse',
    search: ['facility', 'name', 'location', 'channels', 'group'], placeholder: 'Search facility, location, channel, group…',
    cols: [['Facility', 'facility', 'mono'], ['Location', 'location', 'text'], ['Locations Served', 'locations', 'num'], ['Channels', 'channels', 'text'], ['In-transit Group', 'group', 'text'], ['Uniware Export', 'uniwareExport', 'text'], ['Main Warehouse', 'main', 'mono'], ['Entity', 'entity', 'text'], ['State', 'state', 'text'], ['Type', 'type', 'text'], ['Bill-To GSTIN', 'billTo', 'mono'], ['Ship-To GSTIN', 'shipTo', 'mono']],
    fields: [{ key: 'facility', label: 'Facility code (Unicommerce)' }, { key: 'name', label: 'Name' }, { key: 'spellings', label: 'Codes used by locations' }, { key: 'locations', label: 'Channel locations served' }, { key: 'channels', label: 'Channels served' },
      { key: 'entity', label: 'Entity' }, { key: 'location', label: 'Location' }, { key: 'city', label: 'City' }, { key: 'state', label: 'State' }, { key: 'type', label: 'Type' },
      { key: 'billTo', label: 'Bill-to GSTIN' }, { key: 'shipTo', label: 'Ship-to GSTIN' }, { key: 'main', label: 'Main warehouse (of a child)' }, { key: 'group', label: 'In-transit group' },
      { key: 'itType', label: 'In-transit type' }, { key: 'uniwareExport', label: 'Uniware export' }, { key: 'source', label: 'Loaded from' }, { key: 'status', label: 'Status' }, { key: 'remarks', label: 'Remarks' }],
    filters: [],
    filterKeys: [['group', 'In-transit Group'], ['uniwareExport', 'Uniware Export'], ['status', 'Status']],
    readOnly: true,
    trailing: [{ label: 'Status', render: status }],
  },
  chWh: {
    title: 'Channel Location Master', sub: 'Every channel delivery location (DC / FC) and the PEP facility that serves it', key: 'id', titleKey: 'code', entity: 'channel locations', addLabel: 'Add channel location',
    search: ['code', 'channel', 'customer', 'state', 'pincode', 'gstin'], placeholder: 'Search location code, channel, Uniware customer, state, pincode, GSTIN…',
    cols: [['Location Code', 'code', 'mono'], ['Channel', 'channel', 'text'], ['Uniware Customer', 'customer', 'mono'], ['City', 'city', 'text'], ['State', 'state', 'text'], ['Pincode', 'pincode', 'mono'], ['Consignee GSTIN', 'gstin', 'mono'], ['Served By', 'servedBy', 'mono'], ['Appointment', 'apptPortal', 'text'], ['Drop Location', 'drop', 'text']],
    fields: [{ key: 'channel', label: 'Channel' }, { key: 'code', label: 'Location code' }, { key: 'customer', label: 'Uniware customer code' }, { key: 'channelCode', label: 'Uniware channel code' },
      { key: 'servedBy', label: 'Served by (PEP facility)' }, { key: 'consignee', label: 'Consignee name' }, { key: 'gstin', label: 'Consignee GSTIN' }, { key: 'state', label: 'State' },
      { key: 'pincode', label: 'Pincode' }, { key: 'city', label: 'City' }, { key: 'shipAddr', label: 'Shipping address' }, { key: 'billAddr', label: 'Billing address' },
      { key: 'buyerType', label: 'Buyer type' }, { key: 'buyerGst', label: 'Buyer GSTIN' }, { key: 'buyerState', label: 'Buyer state' }, { key: 'buyerPin', label: 'Buyer pincode' },
      { key: 'ledger', label: 'Tally ledger' }, { key: 'apptPortal', label: 'Appointment needed' }, { key: 'apptType', label: 'Appointment type' },
      { key: 'drop', label: 'Drop location' }, { key: 'itLocation', label: 'In-transit location' }, { key: 'status', label: 'Status' }],
    filters: [],
    filterKeys: [['channel', 'Channel'], ['servedBy', 'Served By'], ['state', 'State'], ['city', 'City'], ['status', 'Status']],
    readOnly: true, channelChips: true,
    trailing: [{ label: 'Status', render: status }],
  },
}
/** Data cache key of a master list (TanStack Query): a list loaded once shows at once when the tab opens again. */
const mastersKey = (id: string) => ['masters', id] as const
const NO_ROWS: Row[] = []

/** Masters menu item (MASTER_TABS) -> its list. */
const TAB_ID: Record<string, string> = {
  [MASTER_TABS[0]]: 'pep', [MASTER_TABS[1]]: 'channelSku', [MASTER_TABS[2]]: 'customer', [MASTER_TABS[3]]: 'chWh', [MASTER_TABS[4]]: 'pepWh',
}

export default function Masters({ tab = MASTER_TABS[0] }: { tab?: string }) {
  const id = TAB_ID[tab] ?? 'pep'
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: mastersKey(id), queryFn: ({ signal }) => LOADERS[id](signal) })
  const rowsOf = (k: string): Row[] => (k === id ? query.data : queryClient.getQueryData<Row[]>(mastersKey(k))) ?? NO_ROWS
  const state = { loading: query.isPending, error: query.error ? (query.error instanceof ApiError ? query.error.message : String(query.error)) : undefined }

  const fromApi = CFG[id].readOnly
  // Warehouses: the weekly Uniware facility check's prompt (also on In-transit Stock); an editor of either page acts on it
  const { accessFor } = useAuth()
  const canEditFacilities = accessFor(PATHS.WAREHOUSES) === ACCESS.EDITOR || accessFor(PATHS.INTRANSIT_STOCK) === ACCESS.EDITOR
  const [changesOpen, setChangesOpen] = useState(false)
  const box = 'rounded-[var(--radius)] border border-line bg-surface px-4 py-10 text-center text-[13px] text-ink-600'
  const save = (k: string, r: Row, prevKey?: string) => {
    const key = CFG[k].key
    queryClient.setQueryData<Row[]>(mastersKey(k), (d = []) => (prevKey !== undefined ? d.map((x) => (x[key] === prevKey ? r : x)) : [r, ...d]))
  }
  return (
    <div className="space-y-5">
      <PageTitle
        title={CFG[id].title}
        sub={CFG[id].sub}
        right={fromApi
          ? <><Button icon={<History className="size-3.5" />} onClick={() => setChangesOpen(true)}>Recent changes</Button>
            <span title={NOT_AVAILABLE_YET}><Button disabled icon={<RefreshCw className="size-3.5" />}>Sync now</Button></span></>
          : <><span className="hidden text-[11px] text-ink-400 sm:inline">Synced from Uniware · 2 min ago</span><Button icon={<RefreshCw className="size-3.5" />}>Sync now</Button></>}
      />
      {id === 'pepWh' && <FacilityCheckBanner canEdit={canEditFacilities} onChanged={() => void queryClient.invalidateQueries({ queryKey: mastersKey('pepWh') })} />}
      {fromApi && state.error ? (
        <div className="flex items-center gap-3 rounded-[var(--radius)] border border-crit/30 bg-crit-soft px-4 py-3 text-[13px] text-crit">
          <AlertTriangle className="size-4" /> Could not load {CFG[id].entity}: {state.error}
          <button onClick={() => void query.refetch()} className="ml-auto font-semibold">Retry</button>
        </div>
      ) : fromApi && state.loading ? (
        <div className={box}>Loading {CFG[id].entity}…</div>
      ) : (
        <MasterTable key={id} id={id} rows={rowsOf(id)} onSave={(r, prev) => save(id, r, prev)} />
      )}
      {changesOpen && <RecentChangesDrawer initialType={MASTER_LOG_TYPE[id]} onClose={() => setChangesOpen(false)} />}
    </div>
  )
}

function MasterTable({ id, rows, onSave }: { id: string; rows: Row[]; onSave: (r: Row, prevKey?: string) => void }) {
  const c = CFG[id]
  const s = useSection<Row>(rows, c.search)
  const [edit, setEdit] = useState<{ row: Row; prev?: string } | null>(null)
  // Add forms: admin / developer only for now (user, 2026-10-27); the backend checks the role too
  const auth = useAuth()
  const queryClient = useQueryClient()
  const isMasterAdmin = auth.status === 'signedIn' && auth.user.roles.some((r) => (MASTER_ADD_ROLES as readonly string[]).includes(r))
  const canAdd = ADDABLE.includes(id) && isMasterAdmin
  const [adding, setAdding] = useState(false)
  const [historyOf, setHistoryOf] = useState<Row | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [switching, setSwitching] = useState<Row | null>(null)
  const [listingsOf, setListingsOf] = useState<Row | null>(null)
  const [notice, setNotice] = useState('')
  /** After an edit / switch: this list, the channel list, the Add forms' lists and every history reload. */
  const refreshAfterChange = () => {
    void queryClient.invalidateQueries({ queryKey: mastersKey(id) })
    void queryClient.invalidateQueries({ queryKey: ['masters', 'form-options'] })
    void queryClient.invalidateQueries({ queryKey: ['masters', 'history'] })
    void queryClient.invalidateQueries({ queryKey: ['masters', 'changes'] })
    if (id !== 'customer') void queryClient.invalidateQueries({ queryKey: mastersKey('customer') })
  }
  const [channel, setChannel] = useState('All')
  const channels = useMemo(() => (c.readOnly ? distinct(rows, 'channel') : [...OPS_CHANNELS]), [c, rows])
  const counts = useMemo(() => Object.fromEntries(channels.map((ch) => [ch, rows.filter((r) => r.channel === ch).length])), [channels, rows])
  const view = c.channelChips && channel !== 'All' ? s.filtered.filter((r) => r.channel === channel) : s.filtered
  const filters = useMemo<FilterDef[]>(() => c.filterKeys ? c.filterKeys.map(([key, label]) => ({ key, label, type: 'multi', options: distinct(rows, key) })) : c.filters, [c, rows])
  const blank = () =>Object.fromEntries(c.fields.map((f) => [f.key, f.options ? (c.channelChips && f.key === 'channel' && channel !== 'All' ? channel : f.options[0]) : ''])) as Row

  return (
    <div className="space-y-3">
      {c.channelChips && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {['All', ...channels].map((ch) => (
            <button key={ch} onClick={() => setChannel(ch)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${channel === ch ? 'border-primary bg-primary text-white' : 'border-line bg-surface text-ink-600 hover:border-primary/50 hover:text-ink-900'}`}>
              {ch}<span className={`tnum text-[11px] ${channel === ch ? 'text-white/70' : 'text-ink-400'}`}>{ch === 'All' ? rows.length : counts[ch]}</span>
            </button>
          ))}
        </div>
      )}
      <SectionToolbar q={s.q} setQ={s.setQ} placeholder={c.placeholder} filtersOpen={s.open} onToggleFilters={() => s.setOpen(!s.open)} activeFilters={s.active}
        entity={c.entity} onExport={(e) => exportRows(id, e, c.fields.map((f) => [f.label, f.key, 'text'] as [string, string, ColKind]), view)}
        primary={canAdd
          ? <PrimaryBtn icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>{c.addLabel}</PrimaryBtn>
          : c.readOnly
            ? <span title={ADDABLE.includes(id) ? ADD_TEXT.ADMIN_ONLY : NOT_AVAILABLE_YET}><Button disabled icon={<Plus className="size-4" />}>{c.addLabel}</Button></span>
            : <PrimaryBtn icon={<Plus className="size-4" />} onClick={() => setEdit({ row: blank() })}>{c.addLabel}</PrimaryBtn>} />
      {notice && (
        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-ok/30 bg-ok-soft px-3 py-2 text-[12.5px] text-ok">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" /><span className="flex-1">{notice}</span>
          <button onClick={() => setNotice('')} title="Close"><X className="size-3.5" /></button>
        </div>
      )}
      <Reveal open={s.open}><FilterPanel defs={filters} value={s.filters} onApply={(f) => { s.setFilters(f); s.setOpen(false) }} onClose={() => s.setOpen(false)} /></Reveal>
      <DataGrid cols={c.cols} rows={view} rowKey={(r) => String(r[c.key])} sticky={1}
        onRowClick={(r) => setEdit({ row: r, prev: String(r[c.key]) })}
        trailing={[
          ...(c.trailing ?? []),
          { label: 'Actions', render: (r) => (
            <span className="flex items-center gap-1 text-ink-600" onClick={(e) => e.stopPropagation()}>
              <IconBtn title="View" onClick={() => setEdit({ row: r, prev: String(r[c.key]) })}><Eye className="size-3.5" /></IconBtn>
              {isMasterAdmin && <IconBtn title={r.rid ? 'Edit (keys locked)' : HISTORY_TEXT.NO_ROW} disabled={!r.rid} onClick={() => setEditing(r)}><Pencil className="size-3.5" /></IconBtn>}
              {isMasterAdmin && <IconBtn title={!r.rid ? HISTORY_TEXT.NO_ROW : r.status === SKU_STATUS.INACTIVE ? 'Switch on' : 'Switch off'} disabled={!r.rid} onClick={() => setSwitching(r)}>
                <Power className={`size-3.5 ${r.status === SKU_STATUS.INACTIVE ? 'text-ink-400' : 'text-ok'}`} /></IconBtn>}
              <IconBtn title={r.rid ? 'History: who changed what' : HISTORY_TEXT.NO_ROW} disabled={!r.rid} onClick={() => setHistoryOf(r)}><History className="size-3.5" /></IconBtn>
              {id === 'pep' && <IconBtn title="Channel listings: how each channel lists this SKU" onClick={() => setListingsOf(r)}><Layers className="size-3.5" /></IconBtn>}
            </span>
          ) },
        ]} />
      {editing && (
        <MasterAddDrawer master={id as EditMaster} edit={{ id: String(editing.rid), values: FORM_VALUES.get(`${id}:${editing.rid}`) ?? {} }}
          onClose={() => setEditing(null)} onAdded={(message) => { setEditing(null); setNotice(message); refreshAfterChange() }} />
      )}
      {switching && (
        <SwitchDrawer master={id} row={switching} title={String(switching[c.titleKey ?? c.key])} onClose={() => setSwitching(null)}
          onDone={(message) => { setSwitching(null); setNotice(message); refreshAfterChange() }} />
      )}
      {historyOf && <RowHistoryDrawer type={MASTER_LOG_TYPE[id]} row={historyOf} title={String(historyOf[c.titleKey ?? c.key])} sub={c.title} onClose={() => setHistoryOf(null)} />}
      {listingsOf && <ChannelListingsDrawer pepCode={String(listingsOf.code)} name={String(listingsOf.name ?? '')} onClose={() => setListingsOf(null)} />}
      {edit && <EditDrawer cfg={c} row={edit.row} isNew={edit.prev === undefined} onClose={() => setEdit(null)} onSave={(r) => { onSave(r, edit.prev); setEdit(null) }} />}
      {adding && (
        <MasterAddDrawer master={id as AddMaster} onClose={() => setAdding(false)}
          onAdded={(message) => {
            setAdding(false)
            setNotice(message)
            // the new row shows at once: this list, the channel list (location counts) and the form's dropdowns reload
            void queryClient.invalidateQueries({ queryKey: mastersKey(id) })
            void queryClient.invalidateQueries({ queryKey: ['masters', 'form-options'] })
            if (id !== 'customer') void queryClient.invalidateQueries({ queryKey: mastersKey('customer') })
          }} />
      )}
    </div>
  )
}

const IconBtn = ({ children, title, onClick, disabled }: { children: ReactNode; title: string; onClick?: () => void; disabled?: boolean }) => (
  <button title={title} onClick={onClick} disabled={disabled} className="rounded-md p-1.5 hover:bg-alt hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent">{children}</button>
)

function EditDrawer({ cfg, row, isNew, onClose, onSave }: { cfg: Cfg; row: Row; isNew: boolean; onClose: () => void; onSave: (r: Row) => void }) {
  const [f, setF] = useState<Row>(row)
  const ok = String(f[cfg.key] ?? '').trim().length > 0
  const commit = () => {
    if (!ok) return
    const r = { ...f }
    cfg.fields.forEach((d) => { if (d.type === 'number') r[d.key] = Number(r[d.key]) || 0 })
    if ('margin' in r && 'mrp' in r && 'rate' in row) r.rate = Math.round(Number(r.mrp) * (1 - Number(r.margin) / 100) * 100) / 100
    onSave(r)
  }
  return (
    <Drawer open onClose={onClose} title={isNew ? cfg.addLabel : <span className="font-mono">{String(row[cfg.titleKey ?? cfg.key])}</span>} sub={isNew ? cfg.title : cfg.readOnly ? `View · ${cfg.title} · editing ${NOT_AVAILABLE_YET.toLowerCase()}` : `Edit · ${cfg.title} · changes route to Approvals`}
      footer={cfg.readOnly ? <Button onClick={onClose}>Close</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={commit}>{isNew ? 'Add' : 'Save changes'}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        {cfg.fields.map((d) => (
          <label key={d.key} className={['name', 'legal', 'remarks', 'aliases', 'channels', 'shipAddr', 'billAddr'].includes(d.key) ? 'col-span-2' : ''}>
            <div className="mb-1 text-[12px] font-medium text-ink-600">{d.label}{d.key === cfg.key && <span className="text-crit"> *</span>}</div>
            {d.options ? (
              <select value={String(f[d.key] ?? '')} onChange={(e) => setF({ ...f, [d.key]: e.target.value })} className={inputCls}>{d.options.map((o) => <option key={o}>{o}</option>)}</select>
            ) : (
              <input type={d.type ?? 'text'} value={String(f[d.key] ?? '')} readOnly={cfg.readOnly} onChange={(e) => setF({ ...f, [d.key]: e.target.value })} className={`${inputCls} ${/code|gstin|billTo|shipTo|facility|channelSku|ean|pincode/i.test(d.key) ? 'font-mono' : ''} ${f[d.key] === NOT_IN_DB ? 'text-ink-400' : ''}`} />
            )}
          </label>
        ))}
      </div>
    </Drawer>
  )
}

// ---- History (2026-10-28) -----------------------------------------------------------------------------------------
const HISTORY_OPTIONS: TimelineOptions = { actionLabel: MASTER_LOG_ACTION_LABEL, sourceLabel: MASTER_LOG_SOURCE_LABEL, notes: true }

/** One row's history: who added / changed it, when, old -> new, remark (Masters pages + In-transit uploads). */
function RowHistoryDrawer({ type, row, title, sub, onClose }: { type: string; row: Row; title: string; sub: string; onClose: () => void }) {
  const rid = String(row.rid)
  const q = useQuery({ queryKey: ['masters', 'history', type, rid], queryFn: ({ signal }) => getMasterHistory(type, rid, signal) })
  return (
    <Drawer open onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><History className="size-4 text-ink-600" />History · <span className="font-mono">{title}</span></span>}
      sub={sub} footer={(close) => <Button onClick={close}>Close</Button>}>
      <Timeline items={q.data} pending={q.isPending} error={q.isError} onRetry={() => void q.refetch()} labelOf={masterFieldLabel} empty={HISTORY_TEXT.EMPTY_ROW} options={HISTORY_OPTIONS} />
    </Drawer>
  )
}

type ChangeRow = Record<'at' | 'by' | 'master' | 'rowKey' | 'action' | 'field' | 'oldValue' | 'newValue' | 'remark' | 'source', string>
const CHANGE_COLS: [string, keyof ChangeRow, ColKind][] = [['When', 'at', 'text'], ['Who', 'by', 'text'], ['Master', 'master', 'text'], ['Row', 'rowKey', 'mono'],
  ['Action', 'action', 'text'], ['Field', 'field', 'text'], ['Old value', 'oldValue', 'text'], ['New value', 'newValue', 'text'], ['Remark', 'remark', 'text'], ['Source', 'source', 'text']]
const changeRow = (h: MasterHistoryItem): ChangeRow => ({
  at: new Date(h.at).toLocaleString(), by: h.byEmail ?? h.by ?? 'System', master: MASTER_LOG_TYPE_LABEL[h.type] ?? h.type, rowKey: h.rowKey,
  action: MASTER_LOG_ACTION_LABEL[h.action] ?? h.action, field: h.field ? masterFieldLabel(h.field) : '', oldValue: h.oldValue ?? '', newValue: h.newValue ?? '',
  remark: h.remark ?? '', source: MASTER_LOG_SOURCE_LABEL[h.source] ?? h.source,
})

/** Every master's changes of the last n days (filter by master), with an Excel download. */
function RecentChangesDrawer({ initialType, onClose }: { initialType?: string; onClose: () => void }) {
  const [type, setType] = useState(initialType ?? '')
  const [days, setDays] = useState<number>(MASTER_HISTORY_DAYS[0])
  const q = useQuery({ queryKey: ['masters', 'changes', type, days], queryFn: ({ signal }) => getMasterChanges({ type: type || undefined, days }, signal) })
  const options = useMemo<TimelineOptions>(() => ({
    ...HISTORY_OPTIONS,
    tagOf: (h) => { const m = h as MasterHistoryItem; return `${MASTER_LOG_TYPE_LABEL[m.type] ?? m.type} · ${m.rowKey}` },
  }), [])
  return (
    <Drawer open wide onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><History className="size-4 text-ink-600" />Recent changes · Masters</span>}
      sub="Who added or changed what on the Masters pages and the In-transit master uploads"
      footer={(close) => <>
        <Button icon={<Download className="size-3.5" />} disabled={!q.data?.length}
          onClick={() => exportRowsExcel(`masters-changes-${type || 'all'}-${days}d`, CHANGE_COLS, (q.data ?? []).map(changeRow))}>Excel</Button>
        <Button onClick={close}>Close</Button>
      </>}>
      <div className="mb-3 flex flex-wrap gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">All masters</option>
          {Object.entries(MASTER_LOG_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${inputCls} w-auto`}>
          {MASTER_HISTORY_DAYS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
        {q.data && <span className="self-center text-[12px] text-ink-400">{q.data.length} change{q.data.length === 1 ? '' : 's'}</span>}
      </div>
      <Timeline items={q.data} pending={q.isPending} error={q.isError} onRetry={() => void q.refetch()} labelOf={masterFieldLabel} empty={HISTORY_TEXT.EMPTY_ALL} options={options} />
    </Drawer>
  )
}

/** A PEP SKU's channel listings: every channel SKU mapped to it (the Channel SKU list, loaded once and cached). */
function ChannelListingsDrawer({ pepCode, name, onClose }: { pepCode: string; name: string; onClose: () => void }) {
  const q = useQuery({ queryKey: mastersKey('channelSku'), queryFn: ({ signal }) => LOADERS.channelSku(signal) })
  const rows = useMemo(() => (q.data ?? []).filter((r) => String(r.pepCode).toLowerCase() === pepCode.toLowerCase()), [q.data, pepCode])
  const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-400'
  const td = 'px-3 py-2 text-[12.5px]'
  return (
    <Drawer open wide onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><Layers className="size-4 text-ink-600" />Channel listings · <span className="font-mono">{pepCode}</span></span>}
      sub={name} footer={(close) => <Button onClick={close}>Close</Button>}>
      {q.isPending ? <p className="px-2 py-3 text-[12.5px] text-ink-400">Loading channel SKUs…</p>
        : q.isError ? (
          <div className="px-2 py-3 text-[12.5px] text-crit">
            Could not load the channel SKUs: {q.error instanceof ApiError ? q.error.message : String(q.error)}{' '}
            <button onClick={() => void q.refetch()} className="font-semibold underline">Try again</button>
          </div>
        )
        : !rows.length ? <p className="px-2 py-3 text-[12.5px] text-ink-400">No channel lists this SKU yet (no row in the Channel SKU master).</p>
        : (
          <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
            <table className="w-full">
              <thead className="border-b border-line bg-canvas">
                <tr><th className={th}>Channel</th><th className={th}>Channel SKU</th><th className={th}>Product name</th>
                  <th className={`${th} text-right`}>MRP</th><th className={`${th} text-right`}>Margin %</th><th className={`${th} text-right`}>Rate after margin</th></tr>
              </thead>
              <tbody>{rows.map((r) => (
                <tr key={String(r.id)} className="border-b border-line last:border-b-0">
                  <td className={td}>{String(r.channel)}</td><td className={`${td} font-mono`}>{String(r.channelSku)}</td><td className={td}>{String(r.name)}</td>
                  <td className={`${td} tnum text-right`}>{String(r.mrp)}</td><td className={`${td} tnum text-right`}>{String(r.margin)}</td><td className={`${td} tnum text-right`}>{String(r.rate)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      {!q.isPending && !q.isError && <p className="mt-2 text-[11.5px] text-ink-400">{rows.length} channel listing{rows.length === 1 ? '' : 's'}</p>}
    </Drawer>
  )
}

/** Switch a row on / off (never deleted): what it does to new POs, an optional remark, logged in the row's History. */
function SwitchDrawer({ master, row, title, onClose, onDone }: { master: string; row: Row; title: string; onClose: () => void; onDone: (message: string) => void }) {
  const on = row.status === SKU_STATUS.INACTIVE
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState('')
  const go = async () => {
    setSaving(true)
    setFailed('')
    try {
      await setMasterActive(MASTER_LOG_TYPE[master], String(row.rid), { active: on, ...(remark.trim() ? { remark: remark.trim() } : {}) })
      onDone(EDIT_TEXT.SWITCHED(title, on))
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Drawer open onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><Power className="size-4 text-ink-600" />{on ? 'Switch on' : 'Switch off'} · <span className="font-mono">{title}</span></span>}
      sub={CFG[master].title}
      footer={(close) => <><Button onClick={close}>Cancel</Button><Button variant="primary" onClick={() => void go()} disabled={saving}>{saving ? 'Saving…' : on ? 'Switch on' : 'Switch off'}</Button></>}>
      <div className="space-y-3 text-[13px]">
        <p className="rounded-md border border-line bg-canvas px-3 py-2 text-ink-600">{on ? SWITCH_ON_EFFECT : SWITCH_OFF_EFFECT[master]}</p>
        <p className="text-[12px] text-ink-400">The row is never deleted: it can be switched {on ? 'off' : 'on'} again at any time.</p>
        {failed && <div className="flex items-center gap-2 rounded-md border border-crit/30 bg-crit-soft px-3 py-2 text-[12px] text-crit"><AlertTriangle className="size-4" />{failed}</div>}
        <label className="block">
          <div className="mb-1 text-[12px] font-medium text-ink-600">{HISTORY_TEXT.REMARK}</div>
          <textarea rows={2} maxLength={1000} value={remark} onChange={(e) => setRemark(e.target.value)} className={inputCls} />
          <div className="mt-1 text-[11px] text-ink-400">{HISTORY_TEXT.REMARK_HINT}</div>
        </label>
      </div>
    </Drawer>
  )
}

