import { api } from './client'
import { PO_ISSUES_ENDPOINT } from '../constants/poIssues'

/* Users & Roles -> PO issues (2026-10-22): backend routes/po-issues.routes.ts. */

/** open = still a problem now (checked live against today's master); fixed = the cause is gone; final = rejected / sent back. */
export type ItemState = 'open' | 'fixed' | 'final'
export interface IssueItem { item: string; pepCode: string | null; pos: number; lastSeen: string; avgDiff: number | null; state: ItemState; note: string }
export interface IssueGroup { kind: string; pos: number; open: number; items: IssueItem[] }
export interface ChannelIssues { channel: string; pos: number; byStatus: Record<string, number>; withIssues: number; open: number; groups: IssueGroup[] }
export interface IssuePo { uploadId: string; poNumber: string | null; status: string; createdAt: string }

export const getPoIssues = (days: number, signal?: AbortSignal) =>
  api<{ days: number; since: string; channels: ChannelIssues[] }>(`${PO_ISSUES_ENDPOINT}?days=${days}`, { signal })

export const getPoIssuePos = (channel: string, kind: string, item: string, days: number, signal?: AbortSignal) =>
  api<IssuePo[]>(`${PO_ISSUES_ENDPOINT}/pos?${new URLSearchParams({ channel, kind, item, days: String(days) })}`, { signal })
