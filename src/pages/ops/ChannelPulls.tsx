import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Bot, Check, Cloud, Loader2, Play, RefreshCw, ScrollText, X as XIcon } from 'lucide-react'
import { Badge, Button, Drawer } from '../../components/ui'
import { DataGrid } from '../../components/kit'
import { ApiError } from '../../api/client'
import { getRobotRun, listChannelPulls, listPullItems, processPull, pullsKey, runRobot, setRobotSchedule, type ChannelPull, type PullItem } from '../../api/channelPulls'
import { PULLS_REFRESH_BUSY_MS, PULLS_REFRESH_IDLE_MS, PULLS_TEXT as T, ROBOT_SCHEDULE_HOURS, UPLOAD_STATE } from '../../constants/channelPulls'
import { istDateTime } from '../../lib/time'
import type { ColKind } from '../../lib/ops'

/*
 * Channel Pulls > Channels tab (2026-10-30): one card per channel pulled by API (Amazon) or robot (Flipkart Seller Hub).
 * Run robot now / Process now start in the background; the page looks again every few seconds while something runs.
 * Editors act; viewers see. The PO intake switch (ON / OFF, start date) stays on Users & Roles > Settings > PO intake.
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : String(e))
const busy = (p: ChannelPull) => p.processing || !!p.robot?.running

type Row = { id: string; consignment: string; warehouse: string; created: string; status: string; fetched: string; po: string; raw: PullItem }
const COLS: [string, keyof Row, ColKind][] = [
  ['Consignment', 'consignment', 'mono'], ['Warehouse', 'warehouse', 'mono'], ['Created', 'created', 'date'], ['Flipkart status', 'status', 'text'], ['Fetched', 'fetched', 'mono'],
]
const toRow = (i: PullItem): Row => ({
  id: i.externalId, consignment: i.externalId, warehouse: i.warehouse ?? '', created: i.createdOn ?? '', status: i.status ?? '', fetched: istDateTime(i.fetchedAt), po: i.upload?.status ?? '', raw: i,
})

function PoCell({ item }: { item: PullItem }) {
  if (item.upload) {
    const s = UPLOAD_STATE[item.upload.status] ?? { label: item.upload.status, tone: 'neutral' as const }
    return <Badge tone={s.tone}>{s.label}</Badge>
  }
  if (!item.status) return <span className="text-[12px] text-ink-400">waiting for Flipkart's details</span>
  return <span className="text-[12px] text-ink-400">{item.takenAt ? '—' : 'not taken yet'}</span>
}

function RobotLog({ pullKey, onClose }: { pullKey: string; onClose: () => void }) {
  const run = useQuery({ queryKey: [...pullsKey, 'robot', pullKey], queryFn: ({ signal }) => getRobotRun(pullKey, signal), refetchInterval: PULLS_REFRESH_BUSY_MS })
  const r = run.data
  return (
    <Drawer open onClose={onClose} wide title={T.LOG_TITLE} sub={r ? `${istDateTime(r.startedAt)} · ${r.trigger}` : undefined}>
      {!r ? <div className="text-[13px] text-ink-400">{T.NO_LOG}</div> : (
        <div className="space-y-3">
          {r.error && <div className="rounded-md bg-crit-soft px-3 py-2 text-[12.5px] text-crit">{r.error}</div>}
          {r.failed.length > 0 && (
            <ul className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
              {r.failed.map((f) => <li key={f.id}><span className="font-mono">{f.id}</span>: {f.error}</li>)}
            </ul>
          )}
          <pre className="max-h-[60vh] overflow-auto rounded-md border border-line bg-alt/50 p-3 font-mono text-[11.5px] leading-5 text-ink-600">{(r.log ?? []).join('\n') || '—'}</pre>
        </div>
      )}
    </Drawer>
  )
}

function PullCard({ p, canEdit, onNote }: { p: ChannelPull; canEdit: boolean; onNote: (tone: 'ok' | 'err', text: string) => void }) {
  const qc = useQueryClient()
  const [acting, setActing] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const items = useQuery({
    queryKey: [...pullsKey, 'items', p.key], queryFn: ({ signal }) => listPullItems(p.key, signal), enabled: p.kind === 'robot',
    refetchInterval: busy(p) ? PULLS_REFRESH_BUSY_MS : PULLS_REFRESH_IDLE_MS,
  })
  /** Runs an action; its own message (if it returns one) or ok goes in the note. */
  const act = async (fn: () => Promise<string | void>, ok: string) => {
    setActing(true)
    try {
      onNote('ok', (await fn()) || ok)
    } catch (e) {
      onNote('err', errText(e))
    } finally {
      setActing(false)
      void qc.invalidateQueries({ queryKey: pullsKey })
    }
  }
  const r = p.robot
  const last = r?.lastRun
  const Icon = p.kind === 'robot' ? Bot : Cloud
  return (
    <section className="space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-ink-900">{p.label}</h3>
            <Badge tone="neutral">{T.KIND[p.kind] ?? p.kind}</Badge>
            {!p.configured && <Badge tone="crit">{T.NOT_CONFIGURED}</Badge>}
          </div>
          <div className={`mt-1 text-[12.5px] ${p.intake.enabled ? 'text-ok' : 'text-warn'}`}>
            {p.intake.enabled ? `${T.INTAKE_ON}${p.intake.processFrom ? ` · ${T.FROM(istDateTime(p.intake.processFrom))}` : ''}` : T.INTAKE_OFF}
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {r && (
              <Button variant="primary" disabled={acting || r.running || !p.configured} onClick={() => void act(async () => { await runRobot(p.key) }, T.STARTED)}
                icon={r.running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}>{r.running ? T.ROBOT_RUNNING : T.RUN_ROBOT}</Button>
            )}
            {/* an API channel pulls and processes in one step: "Pull now"; a robot channel processes what the robot fetched */}
            <Button variant={r ? 'default' : 'primary'} disabled={acting || p.processing || (!r && !p.configured)} onClick={() => void act(async () => ((await processPull(p.key)).started === 'queued' ? T.QUEUED : T.STARTED), T.STARTED)}
              icon={p.processing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}>
              {p.processing ? (r ? T.PROCESSING : T.PULLING) : (r ? T.PROCESS : T.PULL_NOW)}
            </Button>
          </div>
        )}
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2">
        {r && (
          <div>
            <dt className="text-[11.5px] font-semibold text-ink-400">{T.LAST_RUN}</dt>
            <dd className="text-ink-900">
              {!last ? <span className="text-ink-400">{T.NEVER_RAN}</span> : (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {last.ok === false ? <AlertTriangle className="size-3.5 text-crit" /> : last.ok ? <Check className="size-3.5 text-ok" /> : <Loader2 className="size-3.5 animate-spin" />}
                  {istDateTime(last.startedAt)}
                  {last.ok && <span className="text-ink-600">· {T.RUN_RESULT(last.listed, last.stored, last.failed.length)}</span>}
                  {last.ok === false && <span className="text-crit">· {last.error}</span>}
                  <button type="button" onClick={() => setLogOpen(true)} className="inline-flex items-center gap-1 text-primary hover:underline"><ScrollText className="size-3.5" />{T.VIEW_LOG}</button>
                </span>
              )}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-[11.5px] font-semibold text-ink-400">{T.LAST_PROCESS}</dt>
          <dd className="text-ink-900">
            {p.sync?.lastRunAt ? (
              <span>{istDateTime(p.sync.lastRunAt)}{p.sync.lastResult && <span className="text-ink-600"> · {T.PROCESS_RESULT(p.sync.lastResult)}</span>}
                {p.sync.lastError && <span className="text-warn"> · {p.sync.lastError}</span>}</span>
            ) : <span className="text-ink-400">{T.NEVER_PROCESSED}</span>}
            {!p.polling && <div className="text-[11.5px] text-ink-400">{T.POLLING_OFF}</div>}
          </dd>
        </div>
        {r && (
          <div>
            <dt className="text-[11.5px] font-semibold text-ink-400">{T.SCHEDULE}</dt>
            <dd className="flex flex-wrap items-center gap-2 text-ink-900">
              <select value={r.schedule.everyHours ?? ''} disabled={!canEdit || acting} aria-label={T.SCHEDULE}
                onChange={(e) => void act(async () => { await setRobotSchedule(p.key, e.target.value ? Number(e.target.value) : null) }, T.SAVED_SCHEDULE)}
                className="h-8 rounded-[var(--radius)] border border-line bg-surface px-2 text-[12.5px] disabled:opacity-60">
                {ROBOT_SCHEDULE_HOURS.map((h) => <option key={h ?? 'off'} value={h ?? ''}>{h ? T.EVERY(h) : T.SCHEDULE_OFF}</option>)}
              </select>
              {r.nextRunAt && <span className="text-[12px] text-ink-400">{T.NEXT(istDateTime(r.nextRunAt))}</span>}
            </dd>
          </div>
        )}
        {p.poll && (
          <div>
            <dt className="text-[11.5px] font-semibold text-ink-400">{T.PULL_SCHEDULE}</dt>
            <dd className="flex flex-wrap items-center gap-2 text-ink-900">
              <select value={p.poll.everyHours ?? ''} disabled={!canEdit || acting} aria-label={T.PULL_SCHEDULE}
                onChange={(e) => void act(async () => { await setRobotSchedule(p.key, e.target.value ? Number(e.target.value) : null) }, T.SAVED_SCHEDULE)}
                className="h-8 rounded-[var(--radius)] border border-line bg-surface px-2 text-[12.5px] disabled:opacity-60">
                {ROBOT_SCHEDULE_HOURS.map((h) => <option key={h ?? 'default'} value={h ?? ''}>{h ? T.EVERY(h) : T.DEFAULT_EVERY(p.poll!.defaultHours)}</option>)}
              </select>
              {p.poll.nextRunAt && <span className="text-[12px] text-ink-400">{T.NEXT(istDateTime(p.poll.nextRunAt))}</span>}
            </dd>
          </div>
        )}
        {p.counts && (
          <div>
            <dt className="text-[11.5px] font-semibold text-ink-400">{T.RECENT}</dt>
            <dd className="text-ink-600">{T.COUNTS(p.counts)}</dd>
          </div>
        )}
      </dl>

      {p.kind === 'robot' && (
        (items.data ?? []).length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-ink-400">{T.NO_ITEMS}</div>
        ) : (
          <DataGrid cols={COLS} rows={(items.data ?? []).map(toRow)} rowKey={(row) => row.id} pageSize={10}
            trailing={[{ label: 'PO', render: (row) => <PoCell item={row.raw} /> }]} />
        )
      )}
      {logOpen && <RobotLog pullKey={p.key} onClose={() => setLogOpen(false)} />}
    </section>
  )
}

export function ChannelPullsTab({ canEdit }: { canEdit: boolean }) {
  const q = useQuery({
    queryKey: pullsKey, queryFn: ({ signal }) => listChannelPulls(signal),
    refetchInterval: (query) => (query.state.data?.some(busy) ? PULLS_REFRESH_BUSY_MS : PULLS_REFRESH_IDLE_MS),
  })
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  return (
    <div className="space-y-4">
      {!canEdit && <div className="rounded-md bg-alt px-3 py-2 text-[12px] text-ink-600">{T.VIEW_ONLY}</div>}
      {note && (
        <div className={`pf-tab-in flex items-start gap-2 rounded-[var(--radius)] px-3 py-2 text-[12.5px] ${note.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-crit-soft text-crit'}`}>
          {note.tone === 'ok' ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          <span className="flex-1">{note.text}</span>
          <button type="button" onClick={() => setNote(null)}><XIcon className="size-4" /></button>
        </div>
      )}
      {q.error ? <div className="rounded-md bg-crit-soft px-3 py-2 text-[13px] text-crit">{errText(q.error)}</div>
        : !q.data ? <div className="text-[13px] text-ink-400">Loading…</div>
        : q.data.map((p) => <PullCard key={p.key} p={p} canEdit={canEdit} onNote={(tone, text) => setNote({ tone, text })} />)}
    </div>
  )
}
