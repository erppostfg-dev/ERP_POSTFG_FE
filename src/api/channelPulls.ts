import { api } from './client'
import { CHANNEL_PULLS_ENDPOINT } from '../constants/channelPulls'

/* POST_FG /channel-pulls (API #85-90, 2026-10-30): channels pulled by API or robot. */

export interface RobotRun {
  startedAt: string
  finishedAt: string | null
  ok: boolean | null
  trigger: string
  listed: number
  stored: number
  failed: { id: string; error: string }[]
  completed: number
  error: string | null
  /** Only from GET /:key/robot. */
  log?: string[]
}

export interface ChannelPull {
  key: string
  channel: string
  label: string
  kind: 'api' | 'robot'
  configured: boolean
  polling: boolean
  intake: { enabled: boolean; processFrom: string | null }
  processing: boolean
  sync: { lastRunAt: string | null; lastSuccessAt: string | null; failures: number; lastError: string | null; lastResult: Record<string, unknown> | null } | null
  robot: { running: boolean; lastRun: RobotRun | null; schedule: { everyHours: number | null; updatedBy: string | null; updatedAt: string | null }; nextRunAt: string | null } | null
  /** API channels: how often the server pulls (everyHours null = defaultHours) and when next (null = not polled here). */
  poll: { everyHours: number | null; defaultHours: number; updatedBy: string | null; updatedAt: string | null; nextRunAt: string | null } | null
  counts: { fetched: number; notTaken: number; waiting: number; taken: number } | null
}

export interface PullItem {
  externalId: string
  status: string | null
  warehouse: string | null
  createdOn: string | null
  fetchedAt: string
  takenAt: string | null
  upload: { id: string; status: string; poNumber: string | null } | null
}

export const pullsKey = ['channel-pulls'] as const

export const listChannelPulls = (signal?: AbortSignal) => api<ChannelPull[]>(CHANNEL_PULLS_ENDPOINT, { signal })
export const listPullItems = (key: string, signal?: AbortSignal) => api<PullItem[]>(`${CHANNEL_PULLS_ENDPOINT}/${encodeURIComponent(key)}/items`, { signal })
export const getRobotRun = (key: string, signal?: AbortSignal) => api<RobotRun | null>(`${CHANNEL_PULLS_ENDPOINT}/${encodeURIComponent(key)}/robot`, { signal })
export const runRobot = (key: string) => api<ChannelPull>(`${CHANNEL_PULLS_ENDPOINT}/${encodeURIComponent(key)}/robot`, { method: 'POST' })
export const processPull = (key: string) => api<{ started: 'started' | 'queued'; pull: ChannelPull }>(`${CHANNEL_PULLS_ENDPOINT}/${encodeURIComponent(key)}/process`, { method: 'POST' })
export const setRobotSchedule = (key: string, robotEveryHours: number | null) =>
  api<ChannelPull>(`${CHANNEL_PULLS_ENDPOINT}/${encodeURIComponent(key)}/schedule`, { method: 'PATCH', body: JSON.stringify({ robotEveryHours }) })
