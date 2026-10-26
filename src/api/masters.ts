import { api } from './client'
import { MASTERS_ENDPOINT } from '../constants/masters'

/* GET /masters/pep-skus: every PEP SKU (master_skus), sorted by pep_code. An empty column comes back as null. */

export type PepSkuItem = {
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
}

export function listChannelCustomers(signal?: AbortSignal) {
  return api<ChannelCustomerItem[]>(MASTERS_ENDPOINT.CHANNEL_CUSTOMERS, { signal })
}

/* GET /masters/warehouses/pep: our facilities, built from details_channels.facility_code (there is no warehouse table). */

export type PepWarehouseItem = {
  facilityCode: string
  /** Every spelling in the DB, most used first (more than one = a data problem). */
  spellings: string[]
  locationCount: number
  channels: string[]
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
}

export function listChannelWarehouses(signal?: AbortSignal) {
  return api<ChannelWarehouseItem[]>(MASTERS_ENDPOINT.CHANNEL_WAREHOUSES, { signal })
}
