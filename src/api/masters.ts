import { api, apiWithMeta } from './client'
import { MASTERS_ENDPOINT } from '../constants/masters'
import type { HistoryItem } from './poOverview'

/* GET /masters/pep-skus: every PEP SKU (master_skus), sorted by pep_code. An empty column comes back as null. */

export type PepSkuItem = {
  /** master_skus.id (History). */
  id: string
  pepCode: string
  productName: string | null
  brand: string | null
  productType: string | null
  mrp: number | null
  /** The GST rate in percent as text ("18", "5", ...). */
  gstTaxType: string | null
  eanCode: string | null
  hsnCode: string | null
  lengthMm: number | null
  widthMm: number | null
  heightMm: number | null
  weightG: number | null
  shelfLife: number | null
  isActive: boolean
  /** The base SKU a variant / combo is counted as (null = itself). */
  finalPepCode: string | null
  /** MANUFACTURING_DATE or EXPIRY_DATE. */
  determineExpiryFrom: string | null
  /** In-transit report fields. */
  intransitName: string | null
  intransitType: string | null
  intransitCategory: string | null
  intransitMrp: number | null
  intransitCogs: number | null
  intransitConsider: boolean
}

export function listPepSkus(signal?: AbortSignal) {
  return api<PepSkuItem[]>(MASTERS_ENDPOINT.PEP_SKUS, { signal })
}

/* GET /masters/channel-skus: every channel SKU mapping (master_channel_skus), sorted by channel then channel code. */

export type ChannelSkuItem = {
  /** DB id: a channel code is unique only within its channel. */
  id: string
  channelId: number | null
  channelName: string | null
  channelCode: string | null
  pepCode: string
  productName: string | null
  brand: string | null
  mrp: number | null
  /** A fraction of MRP (0.27 = 27 %). */
  margin: number | null
  rateAfterMargin: number | null
  eanCode: string | null
  /** Switched off on the page = not used by the PO checks (2026-10-28). */
  isActive: boolean
}

export function listChannelSkus(signal?: AbortSignal) {
  return api<ChannelSkuItem[]>(MASTERS_ENDPOINT.CHANNEL_SKUS, { signal })
}

/* GET /masters/channel-customers: every channel (master_channels) with what its delivery locations say about it. */

export type ChannelCustomerItem = {
  id: number
  slug: string
  displayName: string
  aliases: string[]
  isActive: boolean
  /** details_channels rows of the channel. */
  locationCount: number
  /** Uniware channel codes of its locations. */
  channelCodes: string[]
  /** PEP facilities that serve its locations. */
  facilityCodes: string[]
  /** B2B / B2C. */
  channelType: string | null
  /** Expiry the channel accepts, in days. */
  expiryDaysMin: number | null
  expiryDaysMax: number | null
}

export function listChannelCustomers(signal?: AbortSignal) {
  return api<ChannelCustomerItem[]>(MASTERS_ENDPOINT.CHANNEL_CUSTOMERS, { signal })
}

/* GET /masters/warehouses/pep: our facilities, built from details_channels.facility_code (there is no warehouse table). */

/* Every facility of master_facilities (2026-10-28), with the locations / channels it serves; inMaster false = a code the
   locations use that the facility master lacks. */
export type PepWarehouseItem = {
  /** master_facilities.id; null = a code only locations use (no history). */
  id: number | null
  facilityCode: string
  /** Location facility codes equal to it ignoring letter case, most used first. */
  spellings: string[]
  locationCount: number
  channels: string[]
  inMaster: boolean
  name: string | null
  entity: string | null
  pickupLocation: string | null
  state: string | null
  facilityType: string | null
  billToGstin: string | null
  shipToGstin: string | null
  remarks: string | null
  isActive: boolean
  source: string | null
  /** The main warehouse of a child one. */
  mainFacilityCode: string | null
  intransitGroup: string | null
  intransitType: string | null
  /** In-transit feed ('both' | 'soh') and units formula key (2026-11-02); null = not counted. */
  intransitFeed: string | null
  stockFormula: string | null
  uniwareExport: boolean
  /** D2C internal transfers (2026-11-03): may send / receive transfers (edited as Yes / No). */
  allowInternalTransfer: boolean
}

export function listPepWarehouses(signal?: AbortSignal) {
  return api<PepWarehouseItem[]>(MASTERS_ENDPOINT.PEP_WAREHOUSES, { signal })
}

/* GET /masters/channel-locations (Channel Location Master): every channel delivery location (details_channels), sorted by channel, location code. */

export type ChannelWarehouseItem = {
  id: string
  channelId: number
  channelName: string
  locationCode: string | null
  uniwareCustomerCode: string | null
  channelCode: string | null
  facilityCode: string | null
  consigneeName: string | null
  consigneeState: string | null
  consigneeGstNumber: string | null
  consigneePinCode: string | null
  shippingAddress: string | null
  billingAddress: string | null
  buyerType: string | null
  buyerGstNumber: string | null
  buyerState: string | null
  buyerPinCode: string | null
  tallyLedgerName: string | null
  updatedAt: string | null
  city: string | null
  dropLocation: string | null
  intransitLocation: string | null
  /** Yes / No, and B2B / B2C. */
  appointmentChannel: string | null
  appointmentChannelType: string | null
  isActive: boolean
}

export function listChannelWarehouses(signal?: AbortSignal) {
  return api<ChannelWarehouseItem[]>(MASTERS_ENDPOINT.CHANNEL_WAREHOUSES, { signal })
}

/* Add forms (2026-10-27): GET /masters/form-options + one POST per master; admin / developer only. A refused add is an
   ApiError VALIDATION_FAILED whose details are [{ field, code, message }] (every problem at once). */

export type MasterFormOptions = {
  channels: { id: number; name: string; active: boolean }[]
  facilities: { code: string; name: string | null }[]
  pepSkus: { code: string; name: string | null; brand: string | null; mrp: number | null; ean: string | null }[]
  productTypes: string[]
  gstRates: string[]
  appointment: string[]
  buyerTypes: string[]
  states: string[]
  /** A warehouse's in-transit stock settings (2026-11-02): buckets with their default feed / formula. */
  stockBuckets: { group: string; type: string; label: string; feed: string; formula: string }[]
  stockFeeds: { value: string; label: string }[]
  stockFormulas: { value: string; label: string }[]
  stockNotCounted: string
  /** Local D2C test mode (backend D2C_TEST_ONLY): D2C fields can be edited only on TEST_FACILITY rows. */
  d2cTestMode?: { testOnly: boolean; testFacilities: string[] }
}
export type FieldProblem = { field: string; code: string; message: string }

export function getMasterFormOptions(signal?: AbortSignal) {
  return api<MasterFormOptions>(MASTERS_ENDPOINT.FORM_OPTIONS, { signal })
}

const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) })
export const addPepSku = (body: Record<string, unknown>) => post<{ id: string; pepCode: string }>(MASTERS_ENDPOINT.PEP_SKUS, body)
/** 2026-11-06: not added yet; a margin request; added after ONE approval (2026-11-10, Approvals → Margin changes). */
export const addChannelSku = (body: Record<string, unknown>) => post<{ requestId: string; channel: string }>(MASTERS_ENDPOINT.CHANNEL_SKUS, body)
export const addChannel = (body: Record<string, unknown>) => post<{ id: number; displayName: string }>(MASTERS_ENDPOINT.CHANNELS, body)
export const addChannelLocation = (body: Record<string, unknown>) => post<{ id: string; channel: string }>(MASTERS_ENDPOINT.CHANNEL_WAREHOUSES, body)

/* Masters history (2026-10-28): the same entry shape as the PO Overview history, plus what row it is about. */
export type MasterHistoryItem = HistoryItem & { type: string; recordId: string | null; rowKey: string; from: 'masters' | 'intransit' }
export const getMasterHistory = (type: string, id: string, signal?: AbortSignal) =>
  offline()?.history(type, id) ?? api<MasterHistoryItem[]>(MASTERS_ENDPOINT.HISTORY(type, id), { signal })
export const getMasterChanges = (q: { type?: string; days: number }, signal?: AbortSignal) =>
  api<MasterHistoryItem[]>(`${MASTERS_ENDPOINT.CHANGES}?${new URLSearchParams({ ...(q.type ? { type: q.type } : {}), days: String(q.days) })}`, { signal })

/* Edit + switch on / off (2026-10-28, admin / developer; keys locked; logged in the row's History). */
export type EditBody = { changes: Record<string, unknown>; original: Record<string, unknown>; remark?: string }
/** 409 MASTER_EDIT_CONFLICT details: what each field is now. */
export type EditConflict = { field: string; now: string | number | null }
export const editMasterRow = (type: string, id: string, body: EditBody) =>
  // marginRequestId: a channel SKU's margin / rate waits for the two approvals (2026-11-06)
  api<{ changed: string[]; marginRequestId?: string }>(MASTERS_ENDPOINT.EDIT(type, id), { method: 'PATCH', body: JSON.stringify(body) })
export const setMasterActive = (type: string, id: string, body: { active: boolean; remark?: string }) =>
  post<{ active: boolean; changed: boolean }>(MASTERS_ENDPOINT.ACTIVE(type, id), body)

/* D2C internal transfer routes (2026-11-03): GET /masters/transfer-routes (viewer on Warehouses) and PATCH /:id
   (admin / developer). One row per (sending facility, transfer location); missing* = that code is empty. */
export type TransferRouteItem = {
  id: number
  senderFacilityId: number
  senderCode: string
  /** details_channels.id of the transfer location (its PO prefix is edited as a location row). */
  locationId: string
  channel: string
  location: string | null
  receivingFacilityId: number | null
  receivingCode: string | null
  poPrefix: string | null
  uniwareChannelCode: string | null
  customerCode: string | null
  customerName: string | null
  vendorCode: string | null
  isActive: boolean
  locationActive: boolean
  missingVendor: boolean
  missingCustomer: boolean
  missingChannel: boolean
  updatedAt: string
}
export type TransferRouteChanges = { uniwareChannelCode?: string | null; customerCode?: string | null; vendorCode?: string | null; isActive?: boolean }
export type TransferRouteEditBody = { changes: TransferRouteChanges; original?: TransferRouteChanges; remark?: string }

/**
 * DEV-ONLY stand-in (src/dev/intransitPreview.ts registers it when the preview user is on): answers the transfer-route
 * calls offline. Never set in a build.
 */
type TransferRoutesStandIn = {
  on: () => boolean
  list: () => Promise<TransferRouteItem[]>
  edit: (id: number, body: TransferRouteEditBody) => Promise<{ changed: string[] }>
  editPrefix: (locationId: string, body: EditBody) => Promise<{ changed: string[] }>
  history: (type: string, id: string) => Promise<MasterHistoryItem[]>
}
let standIn: TransferRoutesStandIn | null = null
export const setTransferRoutesStandIn = (s: TransferRoutesStandIn) => { standIn = s }
const offline = () => (standIn?.on() ? standIn : null)

export type TransferRoutesMeta = { total: number; testOnly?: boolean; testFacilities?: string[] }
/** The same list with its meta: testOnly = the server runs D2C in local test mode (only TEST_FACILITY transfers). */
export const listTransferRoutesWithMeta = async (signal?: AbortSignal): Promise<{ data: TransferRouteItem[]; meta: TransferRoutesMeta }> => {
  const off = offline()
  if (off) {
    const data = await off.list()
    return { data, meta: { total: data.length } }
  }
  return apiWithMeta<TransferRouteItem[], TransferRoutesMeta>(MASTERS_ENDPOINT.TRANSFER_ROUTES, { signal })
}
export const editTransferRoute = (id: number, body: TransferRouteEditBody) =>
  offline()?.edit(id, body) ?? api<{ changed: string[] }>(MASTERS_ENDPOINT.TRANSFER_ROUTE(id), { method: 'PATCH', body: JSON.stringify(body) })
/** The location's PO prefix: a channel-location edit (PATCH /masters/edit/location/:locationId). */
export const editTransferPrefix = (locationId: string, body: EditBody) =>
  offline()?.editPrefix(locationId, body) ?? editMasterRow('location', locationId, body)
