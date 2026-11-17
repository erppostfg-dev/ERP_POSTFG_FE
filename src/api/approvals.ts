import { api, apiWithMeta } from './client'
import { APPROVAL_BULK, APPROVALS_ENDPOINT, APPROVALS_PAGE_SIZE, APPROVAL_BULK_RESULT, MARGIN_ENDPOINT, type ApprovalKind, type ApprovalStatus } from '../constants/poReview'
import type { PoReviewDetail } from './poReview'

/* Approvals page: PO reviews submitted for approval (POST_FG routes/approvals.routes.ts, 2026-10-15). */

export type ApprovalPerson = { name: string | null; email: string | null }

export type ApprovalItem = {
  id: string
  uploadId: string
  status: ApprovalStatus | 'returned'
  poNumber: string | null
  channel: string | null
  fileName: string | null
  submittedBy: ApprovalPerson
  submittedAt: string
  submitRemark: string | null
  /** From review, or it updates the master too (2026-11-02). */
  kind: ApprovalKind
  /** The errors the reviewer resolved, per issue type. */
  fixedIssues: { type: string; fixed: number; accepted: number }[]
  /** Price check lines that change the master on approval. */
  masterUpdates: number
  /** Submitted after a reopen from Rejected (2026-11-03): the tag + the rejection it undid. */
  reopened: { rejectedReason: string | null; rejectedFrom: string | null } | null
  issueCount: number
  changeCount: number
  decidedBy: ApprovalPerson | null
  decidedAt: string | null
  decisionRemark: string | null
  saleOrderCode: string | null
  poUid: string | null
}

export type ReviewFixes = {
  location: { from: string | null; to: string | null } | null
  lines: { lineNo: string; channelSku: string | null; description: string | null; changes: { field: string; from: unknown; to: unknown }[] }[]
  issues: { issueId: string; type: string; lineNo: string | null; field: string | null; message: string | null; how: 'fixed' | 'accepted'; remark: string | null }[]
  /** Price check (2026-10-30): per decided line + field, ours or the channel's, and whether the master changes. */
  choices?: { lineNo: string; channelSku: string | null; description: string | null; field: string; from: string; ours: number; channel: number; updateMaster: boolean }[]
}

export type ApprovalDetail = ApprovalItem & { fixes: ReviewFixes | null; review: PoReviewDetail }

export type ApprovalListMeta = {
  page: number; pageSize: number; total: number; counts: Partial<Record<string, number>>; canDecide: boolean
  /** The Filters panel's choices for this tab. */
  filterOptions?: { channels: string[]; submitters: { email: string; name: string | null }[] }
}

/** The list's filters as query values (APPROVAL_FILTER keys; lists are sent comma-separated = any of them). */
export type ApprovalFilters = Partial<Record<string, string | string[]>>

export const listApprovals = (status: ApprovalStatus, q: string, filters: ApprovalFilters = {}, signal?: AbortSignal) => {
  const p = new URLSearchParams({ status, pageSize: String(APPROVALS_PAGE_SIZE) })
  if (q.trim()) p.set('q', q.trim())
  for (const [k, v] of Object.entries(filters)) {
    const s = Array.isArray(v) ? v.join(',') : v
    if (s) p.set(k, s)
  }
  return apiWithMeta<ApprovalItem[], ApprovalListMeta>(`${APPROVALS_ENDPOINT}?${p}`, { signal })
}

export type BulkResult = (typeof APPROVAL_BULK_RESULT)[keyof typeof APPROVAL_BULK_RESULT]
export type BulkItemResult = { id: string; poNumber: string | null; channel: string | null; result: BulkResult; saleOrderCode?: string; message?: string }

/** Approve several (2026-11-02); confirmMasterUpdates after the person saw the master-update warning. */
export const bulkApprove = (ids: string[], opts: { remark?: string; confirmMasterUpdates?: boolean } = {}) =>
  api<BulkItemResult[]>(APPROVAL_BULK.APPROVE, { method: 'POST', body: JSON.stringify({ ids, ...opts }) })

export const bulkReject = (ids: string[], remark: string) =>
  api<BulkItemResult[]>(APPROVAL_BULK.REJECT, { method: 'POST', body: JSON.stringify({ ids, remark }) })

/** Just the number of PO reviews waiting for an approver (the sidebar badge). */
export const countPendingApprovals = (signal?: AbortSignal) =>
  apiWithMeta<ApprovalItem[], ApprovalListMeta>(`${APPROVALS_ENDPOINT}?status=pending&pageSize=1`, { signal }).then((r) => r.meta.counts.pending ?? 0)

export const getApproval = (id: string, signal?: AbortSignal) => api<ApprovalDetail>(`${APPROVALS_ENDPOINT}/${encodeURIComponent(id)}`, { signal })

export const approveSubmission = (id: string, remark?: string) =>
  api<{ status: string; poUid: string; saleOrderCode: string; uniwareCsv: string }>(`${APPROVALS_ENDPOINT}/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    body: JSON.stringify(remark ? { remark } : {}),
  })

export const rejectSubmission = (id: string, remark: string) =>
  api<{ status: string }>(`${APPROVALS_ENDPOINT}/${encodeURIComponent(id)}/reject`, { method: 'POST', body: JSON.stringify({ remark }) })

/* Margin changes (2026-11-06; backend modules/masters/margin-approval.service.ts): a change to a channel SKU's margin % /
 * rate = Operations Manager (layer 1) then Admin (layer 2); a new channel SKU = ONE approval (layer 1, 2026-11-10). */
export type MarginPerson = { id: number; name: string; email: string }
export type MarginStatus = 'pending_l1' | 'pending_l2' | 'applied' | 'rejected'
export type MarginRequest = {
  id: string; kind: 'edit' | 'add'; source: 'masters' | 'price_check'; status: MarginStatus; channelSkuId: string | null
  /** 1 = new channel SKU (the first approval adds it), 2 = change to an existing row. */
  approvalsNeeded: 1 | 2
  channel: string; channelCode: string; pepCode: string
  oldMarginPercent: number | null; newMarginPercent: number | null; oldRate: number | null; newRate: number | null
  row: Record<string, unknown> | null; remark: string | null
  requestedBy: MarginPerson | null; requestedAt: string
  l1: { by: MarginPerson | null; at: string; remark: string | null } | null
  l2: { by: MarginPerson | null; at: string; remark: string | null } | null
  rejected: { by: MarginPerson | null; at: string; reason: string | null } | null
  canDecide: boolean; whyNot: string | null
}
export type MarginList = { items: MarginRequest[]; counts: { waitingL1: number; waitingL2: number; open: number } }
const MARGIN = MARGIN_ENDPOINT
export const listMarginRequests = (status: 'open' | 'applied' | 'rejected', signal?: AbortSignal) => api<MarginList>(`${MARGIN}?status=${status}`, { signal })
export const approveMarginRequest = (id: string, remark?: string) =>
  api<MarginRequest>(`${MARGIN}/${encodeURIComponent(id)}/approve`, { method: 'POST', body: JSON.stringify(remark ? { remark } : {}) })
export const rejectMarginRequest = (id: string, remark: string) =>
  api<MarginRequest>(`${MARGIN}/${encodeURIComponent(id)}/reject`, { method: 'POST', body: JSON.stringify({ remark }) })
