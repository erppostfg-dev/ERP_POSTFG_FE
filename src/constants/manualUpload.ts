/*
 * Manual Upload tab (user, 2026-10-22; backend constants/manual-upload.ts): pick the channel, drop PO files, Upload
 * (stored + S3, no OCR yet), then Process (queued, run one at a time): the same chain as an email PO.
 */

export const MANUAL_UPLOAD_ENDPOINT = '/manual-uploads'

export const MANUAL_STATUS = {
  UPLOADED: 'uploaded', QUEUED: 'queued', PROCESSING: 'processing', DONE: 'done', FAILED: 'failed', CANCELLED: 'cancelled',
} as const
export type ManualStatus = (typeof MANUAL_STATUS)[keyof typeof MANUAL_STATUS]

export const MANUAL_STATUS_LABEL: Record<ManualStatus, string> = {
  uploaded: 'Uploaded · waiting for Process', queued: 'Queued', processing: 'Reading PO (OCR)…', done: 'Done', failed: 'Failed', cancelled: 'Cancelled',
}
export const MANUAL_STATUS_TONE: Record<ManualStatus, 'neutral' | 'info' | 'warn' | 'ok' | 'crit'> = {
  uploaded: 'neutral', queued: 'info', processing: 'warn', done: 'ok', failed: 'crit', cancelled: 'neutral',
}

/** What became of each PO (po_uploads status). */
export const PO_RESULT_LABEL: Record<string, string> = {
  completed: 'Processed', needs_review: 'In Review', pending_approval: 'Waiting approval', failed: 'Failed', rejected: 'Rejected',
  queued: 'Queued', extracting: 'Reading', processing: 'Checking',
}
export const PO_RESULT_TONE: Record<string, 'neutral' | 'info' | 'warn' | 'ok' | 'crit'> = {
  completed: 'ok', needs_review: 'warn', pending_approval: 'info', failed: 'crit', rejected: 'crit',
}

export const MANUAL_ACCEPT = '.pdf,.xlsx,.xls,.csv'
/** Amazon (2026-10-22): Seller Central's shipment file, one .tsv per shipment; duplicates are refused by the server. */
export const AMAZON_CHANNEL = 'amazon'
export const AMAZON_ACCEPT = '.tsv'

/**
 * Channel list groups (user, 2026-10-22): Manual (channels that only come by hand, used every day) open at the top,
 * then Recent (API / email channels uploaded to lately), then API and Email folded (rarely uploaded by hand). The
 * Manual group shows once the first manual-only channel has its route. The last channel used is picked again next
 * time (this browser only).
 */
export const CHANNEL_GROUPS = { RECENT: 'Recent', MANUAL: 'Manual', API: 'API', EMAIL: 'Email' } as const
export const RECENT_CHANNELS_KEY = 'postfg.manualUpload.recentChannels'
export const RECENT_CHANNELS_MAX = 3
export const MANUAL_MAX_FILES = 20
export const MANUAL_MAX_MB = 20

export const MANUAL_TEXT = {
  CHANNEL: 'Channel',
  PICK_CHANNEL: 'Pick the channel…',
  NEEDS: (needs: string, two: boolean, optional?: string) =>
    two ? `One PO = ${needs} with the same file name` : `One PO = one ${needs} file${optional ? ` (its ${optional} with the same file name is optional)` : ''}`,
  DROP: 'Drop PO files here or click to choose',
  DROP_HINT: `PDF, Excel or CSV · up to ${MANUAL_MAX_MB} MB each · up to ${MANUAL_MAX_FILES} files`,
  UPLOAD: (n: number) => `Upload ${n} file${n === 1 ? '' : 's'}`,
  UPLOADING: 'Uploading…',
  UPLOADED: (n: number) => `${n} PO${n === 1 ? '' : 's'} uploaded and saved to S3. Click Process to read ${n === 1 ? 'it' : 'them'}.`,
  NO_OCR_YET: 'Upload only stores the files (S3). OCR runs when you click Process, one PO at a time.',
  QUEUE: 'Upload queue',
  EMPTY: 'Nothing uploaded yet.',
  PROCESS: 'Process',
  PROCESS_SELECTED: (n: number) => `Process ${n}`,
  PROCESS_ALL: (n: number) => `Process all (${n})`,
  CANCEL: 'Cancel',
  RETRY: 'Retry',
  QUEUED: (n: number) => `${n} PO${n === 1 ? '' : 's'} queued: they run one at a time.`,
  CANCELLED: 'Upload cancelled (kept in the list).',
  RETRIED: 'Queued again.',
  WRONG_TYPE: (name: string) => `${name}: only PDF, Excel or CSV`,
  WRONG_TYPE_AMAZON: (name: string) => `${name}: for Amazon, upload the shipment .tsv file from Seller Central`,
  AMAZON_HINT: 'One .tsv per shipment. A shipment already in POST_FG (or already in this queue) is refused, so nothing is processed twice. No OCR: the file is read directly.',
  DROP_HINT_AMAZON: `Amazon shipment .tsv files · up to ${MANUAL_MAX_FILES} files`,
  TOO_BIG: (name: string) => `${name}: larger than ${MANUAL_MAX_MB} MB`,
  VIEW_ONLY: 'View only: ask an admin for editor access to upload.',
  OPEN_HINT: 'Find it on the Processed or In Review tab',
} as const
