import { api } from './client'
import { PO_ISSUES_ENDPOINT } from '../constants/poIssues'

/* PO Processing & Review -> PO issues (2026-10-22; moved from Users & Roles 2026-10-29): backend routes/po-issues.routes.ts. */

/** open = still a problem now (checked live against today's master); fixed = the cause is gone; final = rejected / sent back. */
export type ItemState = 'open' | 'fixed' | 'final'
export interface IssueItem { item: string; pepCode: string | null; pos: number; lastSeen: string; avgDiff: number | null; state: ItemState; note: string }
export interface IssueGroup { kind: string; pos: number; open: number; items: IssueItem[] }
export interface ChannelIssues { channel: string; pos: number; byStatus: Record<string, number>; withIssues: number; open: number; groups: IssueGroup[] }
export interface IssuePo { uploadId: string; poNumber: string | null; status: string; createdAt: string }

/** computedAt = when the server worked it out; cached = the shared answer (at most a minute old). */
export interface PoIssuesData { days: number; since: string; channels: ChannelIssues[]; computedAt: string; cached: boolean }

/** The screen's answer (may be shared, at most a minute old); fresh = computed now (every download uses it). */
export const getPoIssues = (days: number, signal?: AbortSignal, fresh = false) =>
  api<PoIssuesData>(`${PO_ISSUES_ENDPOINT}?days=${days}${fresh ? '&fresh=1' : ''}`, { signal })

/** The query key of the screen's answer (a fresh download also puts its answer there, so screen and file match). */
export const poIssuesKey = (days: number) => ['po-review', 'issues', days] as const

export const getPoIssuePos = (channel: string, kind: string, item: string, days: number, signal?: AbortSignal) =>
  api<IssuePo[]>(`${PO_ISSUES_ENDPOINT}/pos?${new URLSearchParams({ channel, kind, item, days: String(days) })}`, { signal })
