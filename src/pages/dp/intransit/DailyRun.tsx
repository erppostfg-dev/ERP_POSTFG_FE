import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, CloudDownload, Eye, FolderOpen, Loader2, Play, Trash2, Upload, UploadCloud } from 'lucide-react'
import { Button, Card } from '../../../components/ui'
import { deleteInput, getRun, startConnector, startReport, type DailyItem, type DayPlan, type IntransitRun, type MasterItem } from '../../../api/intransit'
import { INTRANSIT_POLL_MS, PEPIMS_CONNECTOR, PEPIMS_TEXT, SOURCE_INFO, SOURCES, type Source } from '../../../constants/intransit'
import { dropEntries, filesFromEntries, filesFromInput, matchFolder, type FolderFile, type FolderMatch } from '../../../lib/folderFiles'
import FolderReview, { type Batch } from './FolderReview'
import ReportPanel from './ReportPanel'
import { clock, dayLabel, errText, FileGlyph, isActive, isCsv, shortDay, whenOn, type FileState, type OnNotice, type OpenCsv, useUploader } from './shared'

/*
 * The Daily run (user, 2026-10-19): the day's to-do list, on one rail.
 *   1 Masters          one line when all are fine; otherwise the ones to update (a daily master not updated for the
 *                      day, a missing one, one with column problems), each with its upload button.
 *   2 Files for <day>  the 9 daily files: the 4 uploaded from the portals (drop files or the whole folder) and the 5
 *                      fetched from the APIs (Fetch per source). Each: the day's own copy, an earlier day's copy (used
 *                      when the day has none), or none.
 *   3 Build            what the build will use, "fetch the missing API files first" (ticked), Build, and while it
 *                      runs which step it is on.
 * Then the day's latest report. Viewers see the same without the upload / fetch / build buttons.
 */

export default function DailyRun({ plan, canEdit, onNotice, openCsv, onManageMasters }: {
  plan: DayPlan; canEdit: boolean; onNotice: OnNotice; openCsv: OpenCsv; onManageMasters: () => void
}) {
  const qc = useQueryClient()
  const up = useUploader(plan.date, onNotice, canEdit)
  const allNames = [...plan.masters.items.map((m) => m.name), ...plan.daily.items.map((d) => d.name)]
  const refresh = () => void qc.invalidateQueries({ queryKey: ['intransit'] })

  // ---- folder upload (masters only when changed, daily files into the day), then optionally build
  const [review, setReview] = useState<FolderMatch | null>(null)
  const [batch, setBatch] = useState<Batch>(null)
  const [buildAfter, setBuildAfter] = useState(false)
  const openFolder = (list: FolderFile[]) => {
    if (!canEdit) return onNotice('warn', 'You can view this page only; ask an admin for editor access to upload.')
    if (!list.length) return onNotice('warn', 'That folder has no files.')
    setBuildAfter(false)
    setReview(matchFolder(list, allNames))
  }
  const uploadFolder = async (m: FolderMatch, inputs: string[]) => {
    const todo = m.matched.filter((x) => inputs.includes(x.input))
    const saved: string[] = []
    const failed: string[] = []
    for (const [i, { input, file }] of todo.entries()) {
      setBatch({ done: i, total: todo.length, current: input })
      const r = await up.uploadOne(input, file)
      if (r.problems) failed.push(`${input}: ${r.problems.join('; ')}`)
      else saved.push(input)
    }
    setBatch(null)
    setReview(null)
    let text = `${saved.length} file${saved.length === 1 ? '' : 's'} saved from ${m.folder || 'the folder'}.`
    if (failed.length) text += `\n${failed.length} refused:\n${failed.join('\n')}`
    if (buildAfter && !failed.length) {
      try {
        await startReport({ asOf: plan.date, fetchFirst: true })
        text += `\nBuilding the report for ${shortDay(plan.date)}.`
      } catch (err) {
        text += `\nThe report was not started: ${errText(err)}`
      }
    }
    refresh()
    onNotice(failed.length ? 'warn' : 'ok', text)
  }

  const reportRunning = plan.running.find((r) => r.kind === 'report')
  const sourceRunning = (s: Source) => plan.running.find((r) => r.kind === s)

  return (
    <div className="space-y-5">
      <Card className="px-4 py-2 sm:px-5">
        <StepMasters plan={plan} canEdit={canEdit} up={up} onManage={onManageMasters} openCsv={openCsv} />
        <StepFiles plan={plan} canEdit={canEdit} up={up} openCsv={openCsv} onNotice={onNotice} onFolder={openFolder} sourceRunning={sourceRunning} onChanged={refresh} />
        <StepBuild plan={plan} canEdit={canEdit} running={reportRunning} onNotice={onNotice} onChanged={refresh} last />
      </Card>

      {plan.latestReport ? (
        <ReportPanel key={plan.latestReport.id} run={plan.latestReport} canEdit={canEdit} onNotice={onNotice} />
      ) : (
        <p className="px-1 text-[13px] text-ink-600">No report for {dayLabel(plan.date)} yet. When the files are in, build it above; it then shows here and feeds Inventory Calculation.</p>
      )}

      {review && (
        <FolderReview match={review} plan={plan} batch={batch} buildAfter={buildAfter} setBuildAfter={setBuildAfter}
          onCancel={() => !batch && setReview(null)} onUpload={(inputs) => void uploadFolder(review, inputs)} />
      )}
    </div>
  )
}

// ---- the rail ---------------------------------------------------------------------------------------------------

type StepState = 'done' | 'attention' | 'todo' | 'running'

/** One step: its mark on the rail (and the line to the next step), title, one-line state, actions, and its body. */
function Step({ n, state, title, status, actions, open, onToggle, last = false, children }: {
  n: number; state: StepState; title: string; status: ReactNode; actions?: ReactNode; open: boolean; onToggle?: () => void
  last?: boolean; children?: ReactNode
}) {
  const mark = {
    done: <span className="flex size-7 items-center justify-center rounded-full bg-ok text-white"><Check className="size-4" strokeWidth={3} /></span>,
    attention: <span className="flex size-7 items-center justify-center rounded-full border-2 border-warn bg-warn-soft text-[13px] font-semibold text-warn">{n}</span>,
    todo: <span className="flex size-7 items-center justify-center rounded-full border-2 border-line bg-surface text-[13px] font-semibold text-ink-600">{n}</span>,
    running: <span className="flex size-7 items-center justify-center rounded-full border-2 border-primary bg-primary-soft text-primary"><Loader2 className="size-4 animate-spin" /></span>,
  }[state]
  return (
    <section className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 sm:gap-x-4">
      <div className="flex flex-col items-center pt-3.5">
        {mark}
        {!last && <span className={`mt-1 w-0.5 flex-1 rounded-full ${state === 'done' ? 'bg-ok/40' : 'bg-line'}`} />}
      </div>
      <div className={`min-w-0 py-3.5 ${last ? '' : 'border-b border-line'}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button onClick={onToggle} disabled={!onToggle} aria-expanded={onToggle ? open : undefined}
            className="flex min-w-0 items-center gap-2 text-left disabled:cursor-default">
            <h2 className="text-[14.5px] font-semibold text-ink-900">{title}</h2>
            {onToggle && <ChevronDown className={`size-4 text-ink-400 transition-transform ${open ? '' : '-rotate-90'}`} />}
          </button>
          <span className="min-w-0 flex-1 text-[12.5px] text-ink-600">{status}</span>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {open && children && <div className="pf-tab-in mt-3">{children}</div>}
      </div>
    </section>
  )
}

type Uploader = ReturnType<typeof useUploader>

/** A hidden file input for "upload this one file as <name>". */
function useRowPicker(onPick: (name: string, file: File) => void) {
  const ref = useRef<HTMLInputElement>(null)
  const target = useRef<string | null>(null)
  const input = (
    <input ref={ref} type="file" accept=".csv,.xlsx" className="hidden"
      onChange={(e) => { const f = e.target.files?.[0]; if (f && target.current) onPick(target.current, f); e.target.value = '' }} />
  )
  return { input, pick: (name: string) => { target.current = name; ref.current?.click() } }
}

/** quiet: shown only while the row is hovered or the button has keyboard focus (a rare action). */
const IconBtn = ({ title, onClick, disabled, quiet = false, children }: { title: string; onClick: () => void; disabled?: boolean; quiet?: boolean; children: ReactNode }) => (
  <button onClick={onClick} disabled={disabled} title={title} aria-label={title}
    className={`shrink-0 rounded-md p-1.5 text-ink-400 hover:bg-primary-soft hover:text-primary focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40 ${quiet ? 'opacity-0 group-hover:opacity-100' : ''}`}>
    {children}
  </button>
)

// ---- 1 Masters --------------------------------------------------------------------------------------------------

function StepMasters({ plan, canEdit, up, onManage, openCsv }: { plan: DayPlan; canEdit: boolean; up: Uploader; onManage: () => void; openCsv: OpenCsv }) {
  const attention = plan.masters.items.filter((m) => !m.present || m.problems.length || m.stale || up.errors[m.name]?.length)
  const [open, setOpen] = useState<boolean | null>(null)
  const isOpen = open ?? attention.length > 0
  const row = useRowPicker((name, file) => void up.uploadOne(name, file))
  const why = (m: MasterItem) =>
    up.errors[m.name]?.length ? up.errors[m.name].join('; ')
      : !m.present ? 'not uploaded yet'
      : m.problems.length ? m.problems.join('; ')
      : `last updated ${whenOn(m.updatedAt as string, plan.date)}${m.updatedBy ? ` by ${m.updatedBy}` : ''}; it is expected every day`
  const stateOf = (m: MasterItem): FileState =>
    up.progress[m.name] !== undefined ? 'busy' : !m.present || m.problems.length || up.errors[m.name]?.length ? (m.present ? 'problem' : 'missing') : 'earlier'

  return (
    <Step n={1} title="Masters" state={attention.length ? 'attention' : 'done'} open={isOpen} onToggle={() => setOpen(!isOpen)}
      status={attention.length ? `${attention.length} of ${plan.masters.total} need updating` : `All ${plan.masters.total} up to date`}
      actions={<Button variant="ghost" onClick={onManage}>Manage masters</Button>}>
      {row.input}
      {attention.length ? (
        <ul className="divide-y divide-line rounded-[var(--radius)] border border-line">
          {attention.map((m) => (
            <li key={m.name} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
              <FileGlyph state={stateOf(m)} />
              <div className="min-w-[180px] flex-1">
                <div className="truncate text-[13px] font-medium text-ink-900">{m.name}</div>
                <div className={`text-[12px] ${m.problems.length || up.errors[m.name]?.length ? 'text-crit' : 'text-warn'}`}>
                  {up.progress[m.name] !== undefined ? <span className="text-info">Uploading {Math.round(up.progress[m.name] * 100)}%</span> : why(m)}
                </div>
              </div>
              {m.present && isCsv(m.name) && <IconBtn title={`View ${m.name}`} onClick={() => openCsv({ kind: 'input', name: m.name }, 'current master')}><Eye className="size-4" /></IconBtn>}
              {canEdit && <Button icon={<Upload className="size-3.5" />} onClick={() => row.pick(m.name)} disabled={up.progress[m.name] !== undefined}>Upload new version</Button>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-ink-600">
          {plan.masters.items.map((m) => m.name.replace(/\.(csv|xlsx)$/i, '')).join(', ')}. Each build uses the current version; replace one in Manage masters when it changes.
        </p>
      )}
    </Step>
  )
}

// ---- 2 Files for the day ----------------------------------------------------------------------------------------

function StepFiles({ plan, canEdit, up, openCsv, onNotice, onFolder, sourceRunning, onChanged }: {
  plan: DayPlan; canEdit: boolean; up: Uploader; openCsv: OpenCsv; onNotice: OnNotice; onFolder: (l: FolderFile[]) => void
  sourceRunning: (s: Source) => IntransitRun | undefined; onChanged: () => void
}) {
  // A portal file its connector can fetch now (FK_SOH / FK_GRN once the Seller Hub robot is set up, 2026-10-28) is listed
  // with the APIs, keeping its upload button; otherwise (not set up, or a past day of a today-only file) it stays a portal upload.
  const viaApi = (d: DailyItem): boolean => d.group === 'api' || (d.fetchable && !!d.connector && d.connector !== PEPIMS_CONNECTOR)
  const uploads = plan.daily.items.filter((d) => !viaApi(d))
  const apis = plan.daily.items.filter(viaApi)
  const pepims = apis.filter((d) => d.connector === PEPIMS_CONNECTOR)
  const done = plan.daily.ok === plan.daily.total
  const [open, setOpen] = useState<boolean | null>(null)
  const isOpen = open ?? !done
  const [dragging, setDragging] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const folderPicker = useRef<HTMLInputElement>(null)
  const row = useRowPicker((name, file) => void up.uploadOne(name, file))
  const allNames = [...plan.masters.items.map((m) => m.name), ...plan.daily.items.map((d) => d.name)]
  const day = shortDay(plan.date)
  const missing = plan.daily.items.filter((d) => d.on === 'missing').length
  const earlier = plan.daily.items.filter((d) => d.on === 'earlier').length

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const entries = dropEntries(e.dataTransfer)
    if (entries) void filesFromEntries(entries).then(onFolder).catch((err) => onNotice('warn', `Could not read the folder: ${errText(err)}`))
    else void up.send([...e.dataTransfer.files], allNames)
  }
  const remove = async (d: DailyItem) => {
    if (!window.confirm(`Remove the ${day} copy of ${d.name}? The day then uses the latest earlier copy.`)) return
    try { await deleteInput(d.name, plan.date); onChanged() } catch (err) { onNotice('warn', errText(err)) }
  }

  const fileRow = (d: DailyItem, withActions: boolean) => {
    const busy = up.progress[d.name] !== undefined
    const err = up.errors[d.name]?.length ? up.errors[d.name] : d.problems
    const state: FileState = busy ? 'busy' : err.length ? 'problem' : d.on === 'date' ? 'ok' : d.on
    return (
      <li key={d.name} className="group flex items-center gap-2.5 py-1.5" title={d.source}
        onDragOver={(e) => canEdit && withActions && e.preventDefault()}
        onDrop={(e) => { if (!withActions) return; e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) void up.uploadOne(d.name, f) }}>
        <FileGlyph state={state} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-ink-900">{d.name.replace(/\.csv$/i, '')}</span>
          <span className={`block truncate text-[11.5px] ${err.length ? 'text-crit' : d.on === 'date' ? 'text-ink-400' : d.on === 'earlier' ? 'text-warn' : 'text-ink-600'}`}>
            {busy ? <span className="text-info">Uploading {Math.round(up.progress[d.name] * 100)}%</span>
              : err.length ? err.join('; ')
              : d.on === 'date' ? `${clock(d.updatedAt as string)}${d.updatedBy ? `, ${d.updatedBy}` : d.via && d.via !== 'upload' ? `, ${d.via === PEPIMS_CONNECTOR ? PEPIMS_TEXT.LABEL : SOURCE_INFO[d.via as Source]?.label ?? d.via}` : ''}`
              : d.connector === PEPIMS_CONNECTOR && d.fetchable ? PEPIMS_TEXT.FILE
              : d.on === 'earlier' ? `using the ${shortDay(d.fileDate as string)} copy`
              : 'none yet'}
          </span>
        </span>
        {d.on !== 'missing' && isCsv(d.name) && (
          <IconBtn title={`View ${d.name}`} onClick={() => openCsv({ kind: 'input', name: d.name, date: plan.date }, d.on === 'date' ? `${day} copy` : `${shortDay(d.fileDate as string)} copy, used for ${day}`)}><Eye className="size-4" /></IconBtn>
        )}
        {canEdit && withActions && <IconBtn title={`Upload ${d.name} for ${day}`} onClick={() => row.pick(d.name)} disabled={busy}><Upload className="size-4" /></IconBtn>}
        {canEdit && d.on === 'date' && <IconBtn quiet title={`Remove the ${day} copy`} onClick={() => void remove(d)}><Trash2 className="size-4" /></IconBtn>}
      </li>
    )
  }

  return (
    <Step n={2} title={`Files for ${dayLabel(plan.date)}`} state={done ? 'done' : missing ? 'attention' : 'todo'} open={isOpen} onToggle={() => setOpen(!isOpen)}
      status={done ? `All ${plan.daily.total} in` : `${plan.daily.ok} of ${plan.daily.total} in${earlier ? `, ${earlier} using an earlier copy` : ''}${missing ? `, ${missing} with no copy` : ''}`}>
      {row.input}
      <input ref={picker} type="file" multiple accept=".csv,.xlsx" className="hidden" onChange={(e) => { void up.send([...(e.target.files ?? [])], allNames); e.target.value = '' }} />
      <input ref={folderPicker} type="file" multiple className="hidden" {...{ webkitdirectory: '' }}
        onChange={(e) => { if (e.target.files) onFolder(filesFromInput(e.target.files)); e.target.value = '' }} />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* from the portals: uploaded by hand */}
        <div onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragging(true) } }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
          className={`rounded-[var(--radius)] border border-dashed p-3 transition-colors ${dragging ? 'border-primary bg-primary-soft/40' : 'border-line'}`}>
          <h3 className="text-[12.5px] font-semibold text-ink-900">From the portals</h3>
          <ul className="mt-1">{uploads.map((d) => fileRow(d, true))}</ul>
          {canEdit && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-2 text-[12px] text-ink-600">
              <UploadCloud className={`size-4 ${dragging ? 'text-primary' : 'text-ink-400'}`} />
              Drop the day's files or the whole folder here, or
              <button onClick={() => folderPicker.current?.click()} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><FolderOpen className="size-3.5" />choose a folder</button>
              or
              <button onClick={() => picker.current?.click()} className="font-medium text-primary hover:underline">pick files</button>
            </div>
          )}
        </div>

        {/* from the APIs: fetched for the day */}
        <div className="rounded-[var(--radius)] border border-line p-3">
          <h3 className="text-[12.5px] font-semibold text-ink-900">From the APIs</h3>
          <div className="mt-1 divide-y divide-line">
            {pepims.length > 0 && (
              <div className="py-2 first:pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-ink-600">{PEPIMS_TEXT.LABEL}</span>
                  <span className="flex-1" />
                  <span className="text-[11.5px] text-ink-400">{pepims[0].fetchable ? PEPIMS_TEXT.ON : pepims[0].notFetchable}</span>
                </div>
                {/* read by the build itself; uploading is the fallback when it cannot be read for this day */}
                <ul>{pepims.map((d) => fileRow(d, !d.fetchable))}</ul>
              </div>
            )}
            {SOURCES.map((s) => {
              const own = apis.filter((d) => d.connector === s)
              if (!own.length) return null
              return <SourceRow key={s} source={s} files={own} plan={plan} canEdit={canEdit} running={sourceRunning(s)} fileRow={fileRow} onNotice={onNotice} onChanged={onChanged} />
            })}
          </div>
          {/* portal files a robot could fetch but cannot now: one line per portal saying why */}
          {SOURCES.map((s) => {
            const own = uploads.filter((d) => d.connector === s)
            if (!own.length) return null
            const names = own.map((d) => d.name.replace(/\.csv$/, ''))
            const why = own.some((d) => d.notFetchable?.includes('not set up')) ? `until the ${SOURCE_INFO[s].label} login is set up` : 'for this day'
            return <p key={s} className="mt-2 text-[11.5px] text-ink-400">{names.join(' and ')} {names.length > 1 ? 'are' : 'is'} uploaded by hand {why}.</p>
          })}
        </div>
      </div>
    </Step>
  )
}

function SourceRow({ source, files, plan, canEdit, running, fileRow, onNotice, onChanged }: {
  source: Source; files: DailyItem[]; plan: DayPlan; canEdit: boolean; running?: IntransitRun
  fileRow: (d: DailyItem, withActions: boolean) => ReactNode; onNotice: OnNotice; onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const info = plan.sources.find((x) => x.source === source)
  const step = plan.build.toFetch.find((x) => x.source === source)
  const live = useQuery({
    queryKey: ['intransit', 'run', running?.id],
    queryFn: ({ signal }) => getRun(running!.id, signal),
    enabled: !!running,
    refetchInterval: running ? INTRANSIT_POLL_MS : false,
  })
  const fetchNow = async () => {
    setBusy(true)
    try { await startConnector(source, { date: plan.date, only: step?.only }); onChanged() } catch (err) { onNotice('warn', errText(err)) } finally { setBusy(false) }
  }
  const allOfDay = files.every((d) => d.on === 'date')
  const reason = !info?.configured ? 'not set up' : !info.fetchable.length ? 'current state only, so only for today' : null
  return (
    <div className="py-2 first:pt-1">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-medium text-ink-600">{SOURCE_INFO[source].label}</span>
        <span className="flex-1" />
        {running ? (
          <span className="flex items-center gap-1.5 text-[12px] text-primary"><Loader2 className="size-3.5 animate-spin" />{live.data?.logTail?.at(-1)?.trim() || 'Fetching…'}</span>
        ) : reason ? (
          <span className="text-[11.5px] text-ink-400">{reason}</span>
        ) : canEdit && (
          <Button variant={step ? 'primary' : 'default'} icon={<CloudDownload className="size-3.5" />} disabled={busy} onClick={() => void fetchNow()}>
            {busy ? 'Starting…' : step ? `Fetch for ${shortDay(plan.date)}` : allOfDay ? 'Fetch again' : 'Fetch'}
          </Button>
        )}
      </div>
      {/* a portal file fetched by a robot can still be uploaded by hand */}
      <ul>{files.map((d) => fileRow(d, d.group === 'upload'))}</ul>
    </div>
  )
}

// ---- 3 Build ----------------------------------------------------------------------------------------------------

const STEP_LABEL = (step: string) => (step === `fetching ${PEPIMS_CONNECTOR}` ? PEPIMS_TEXT.STEP
  : step.startsWith('fetching ') ? `Fetching from ${SOURCE_INFO[step.slice(9) as Source]?.label ?? step.slice(9)}`
  : step === 'building' ? 'Building the report' : 'Starting')

function StepBuild({ plan, canEdit, running, onNotice, onChanged, last }: {
  plan: DayPlan; canEdit: boolean; running?: IntransitRun; onNotice: OnNotice; onChanged: () => void; last?: boolean
}) {
  const [fetchFirst, setFetchFirst] = useState(true)
  const [busy, setBusy] = useState(false)
  const b = plan.build
  const day = shortDay(plan.date)
  const toFetch = b.toFetch.flatMap((s) => s.files)
  const forThisDay = running?.asOf === plan.date
  const blockers = [...b.blockers, ...(fetchFirst ? [] : b.fetchRequired.map((n) => `${n}: no copy yet, fetch it`))]
  const built = plan.latestReport?.status === 'succeeded'
  const stale = plan.masters.items.filter((m) => m.stale).length

  const build = async () => {
    setBusy(true)
    try { await startReport({ asOf: plan.date, fetchFirst: fetchFirst && toFetch.length > 0 }); onChanged() } catch (err) { onNotice('warn', errText(err)) } finally { setBusy(false) }
  }

  // read fresh from PEPIMS by the build itself (Shipment_Status, PO_Format), so never an "earlier copy"
  const fromPepims = plan.daily.items.filter((d) => d.connector === PEPIMS_CONNECTOR && d.fetchable).map((d) => d.name)
  const earlierUsed = b.uses.earlier.filter((e) => !(fetchFirst && toFetch.includes(e.name)) && !fromPepims.includes(e.name))
  const uses = [
    `${b.uses.masters} masters`,
    `${b.uses.ofDate} file${b.uses.ofDate === 1 ? '' : 's'} of ${day}`,
    ...(fromPepims.length ? [`${fromPepims.map((n) => n.replace(/\.csv$/i, '')).join(' and ')} read from PEPIMS`] : []),
    ...(earlierUsed.length ? [`earlier copies of ${earlierUsed.map((e) => `${e.name.replace(/\.csv$/i, '')} (${shortDay(e.date)})`).join(', ')}`] : []),
  ]
  const opts = (running?.options ?? {}) as { step?: string; progress?: string | null }

  return (
    <Step n={3} title="Build" last={last} open onToggle={undefined}
      state={running && forThisDay ? 'running' : built ? 'done' : blockers.length ? 'attention' : 'todo'}
      status={running && forThisDay ? STEP_LABEL(opts.step ?? '') : built ? `Built ${whenOn(plan.latestReport!.finishedAt as string, plan.date)}` : `Report for ${dayLabel(plan.date)}`}>
      {running && forThisDay ? (
        <div className="space-y-2" aria-live="polite">
          <div className="h-1 overflow-hidden rounded-full bg-alt"><div className="pf-indeterminate h-full w-1/3 rounded-full bg-primary" /></div>
          <p className="truncate font-mono text-[11.5px] text-ink-600">{opts.progress || 'Waiting to start…'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12.5px] text-ink-600">
            Uses {uses.join(', ')}
            {fetchFirst && toFetch.length > 0 && <>, and fetches {toFetch.map((n) => n.replace(/\.csv$/i, '')).join(', ')} for {day} first</>}.
          </p>
          {stale > 0 && <p className="text-[12px] text-warn">{stale} daily master{stale > 1 ? 's were' : ' was'} not updated for {day}; the build uses {stale > 1 ? 'them' : 'it'} as {stale > 1 ? 'they are' : 'it is'}.</p>}
          {b.spread.length > 0 && (
            <p className="text-[12px] text-warn">Saved far apart, so the report may mix two moments: {b.spread.join('; ')}.</p>
          )}
          {blockers.length > 0 && (
            <ul className="space-y-0.5 rounded-[var(--radius)] bg-crit-soft px-3 py-2 text-[12px] text-crit">
              <li className="font-semibold">To do before building:</li>
              {blockers.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}
          {running && !forThisDay && <p className="text-[12px] text-ink-600">A report for {shortDay(running.asOf as string)} is building; this one starts after it.</p>}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-4">
              <button onClick={() => void build()} disabled={busy || blockers.length > 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-4 text-[13px] font-semibold text-white shadow-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50">
                <Play className="size-4" /> {busy ? 'Starting…' : built ? `Build ${day} again` : `Build report for ${day}`}
              </button>
              {toFetch.length > 0 && (
                <label className="flex items-center gap-2 text-[12.5px] text-ink-900">
                  <input type="checkbox" checked={fetchFirst} onChange={(e) => setFetchFirst(e.target.checked)} className="accent-[var(--color-primary)]" />
                  Fetch the {toFetch.length} missing API file{toFetch.length === 1 ? '' : 's'} first{b.toFetch.some((s) => s.source === 'uniware') ? ' (about 2 min)' : ''}
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </Step>
  )
}
