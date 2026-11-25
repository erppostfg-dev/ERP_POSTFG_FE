/*
 * Bulk order form checks (Bulk Orders Portal v2 piece 1d, 2026-11-23), the same rules as the backend parseOrder: every
 * problem per field, shown next to the field once it is left and all together on the Review step (Submit waits for none).
 */
import { BULK_FAST_TRACK, BULK_TEXT } from '../constants/bulkOrders'
import { normalPhone } from './bulkPrice'

export interface BulkFormFields {
  orderedBy: string
  receiverName: string
  receiverPhone: string
  neededBy: string
  priority: string
  fastTrackRemarks: string
}

/** field -> why it is wrong ({} = all fine). `today` = YYYY-MM-DD (IST). */
export const formProblems = (f: BulkFormFields, today: string): Partial<Record<keyof BulkFormFields, string>> => {
  const out: Partial<Record<keyof BulkFormFields, string>> = {}
  const fastTrack = f.priority === BULK_FAST_TRACK
  if (!f.orderedBy.trim()) out.orderedBy = BULK_TEXT.ERR_REQUIRED
  if (!f.receiverName.trim()) out.receiverName = BULK_TEXT.ERR_REQUIRED
  if (!f.receiverPhone.trim()) out.receiverPhone = BULK_TEXT.ERR_REQUIRED
  else if (!normalPhone(f.receiverPhone)) out.receiverPhone = BULK_TEXT.ERR_PHONE
  if (!f.neededBy) {
    if (fastTrack) out.neededBy = BULK_TEXT.ERR_NEEDED_BY_FAST
  } else if (f.neededBy < today) out.neededBy = BULK_TEXT.ERR_DATE_PAST
  if (fastTrack && !f.fastTrackRemarks.trim()) out.fastTrackRemarks = BULK_TEXT.ERR_REMARKS
  return out
}
