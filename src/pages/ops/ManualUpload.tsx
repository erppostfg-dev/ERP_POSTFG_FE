import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, FileSpreadsheet, FileText, Loader2, Play, RotateCcw, UploadCloud, X } from 'lucide-react'
import { Badge } from '../../components/ui'
import { GroupedSelect } from '../../components/pickers'
import { ApiError } from '../../api/client'
import {
  cancelManualUpload, listManualUploads, listUploadChannels, processManualUploads, retryManualUpload, uploadPoFiles,
  type ManualUploadItem, type UploadChannel,
} from '../../api/manualUpload'
import {
  AMAZON_ACCEPT, AMAZON_CHANNEL, CHANNEL_GROUPS, FLIPKART_ACCEPT, FLIPKART_CHANNEL, FLIPKART_FILE, MANUAL_ACCEPT, RECENT_CHANNELS_KEY, RECENT_CHANNELS_MAX, MANUAL_MAX_FILES, MANUAL_MAX_MB, MANUAL_STATUS, MANUAL_STATUS_LABEL, MANUAL_STATUS_TONE, MANUAL_TEXT as T,
  PO_RESULT_LABEL, PO_RESULT_TONE,
} from '../../constants/manualUpload'
import { istDateTime } from '../../lib/time'

/*
 * Manual Upload (user, 2026-10-22): channel + one drop zone + Upload (the files are stored and copied to S3, nothing
 * read yet), then the Upload queue: Process (one, ticked, or all) queues them and the server reads them one at a
 * time with the same chain as an email PO (OCR -> processed.json -> checks -> Processed with sale order + Uniware CSV,
 * or In Review). Cancel before processing, Retry after a failure. Live: the list reloads when anything changes.
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : String(e))
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
/** The channels uploaded to lately (newest first), kept in this browser; empty when storage is blocked. */
const readRecent = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_CHANNELS_KEY) ?? '[]') as string[] } catch { return [] }
}
const saveRecent = (channel: string) => {
  try { localStorage.setItem(RECENT_CHANNELS_KEY, JSON.stringify([channel, ...readRecent().filter((c) => c !== channel)].slice(0, RECENT_CHANNELS_MAX))) } catch { /* not kept */ }
}

const isSheet = (name: string) => /\.(xlsx|xls|csv|tsv)$/i.test(name)

export function ManualUpload({ canEdit, liveTick }: { canEdit: boolean; liveTick: number }) {
  const [channels, setChannels] = useState<UploadChannel[]>([])
  const [channel, setChannel] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [rows, setRows] = useState<ManualUploadItem[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const [recent, setRecent] = useState<string[]>(readRecent)
  useEffect(() => {
    listUploadChannels()
      .then((list) => {
        setChannels(list)
        // The last channel used is picked again (if it is still on the list).
        setChannel((cur) => cur || (list.some((c) => c.channel === recent[0]) ? recent[0] : ''))
      })
      .catch((e) => setNote({ tone: 'err', text: errText(e) }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => {
    const item = (c: UploadChannel) => ({ value: c.channel, label: c.name })
    const of = (g: UploadChannel['group']) => channels.filter((c) => c.group === g).map(item)
    // Manual-only channels (used every day) always open at the top; Recent = the API / Email ones used lately (not the
    // manual ones again); API and Email folded below (user, 2026-10-22).
    return [
      { label: CHANNEL_GROUPS.MANUAL, items: of('manual') },
      { label: CHANNEL_GROUPS.RECENT, items: recent.map((r) => channels.find((c) => c.channel === r && c.group !== 'manual')).filter((c): c is UploadChannel => !!c).map(item) },
      { label: CHANNEL_GROUPS.API, items: of('api'), collapsible: true },
      { label: CHANNEL_GROUPS.EMAIL, items: of('email'), collapsible: true },
    ]
  }, [channels, recent])
  const reload = useCallback(() => {
    listManualUploads().then(setRows).catch((e) => setNote({ tone: 'err', text: errText(e) }))
  }, [])
  useEffect(reload, [reload, liveTick])

  const picked = channels.find((c) => c.channel === channel)
  const isAmazon = channel === AMAZON_CHANNEL
  const isFlipkart = channel === FLIPKART_CHANNEL
  const addFiles = (list: FileList | null) => {
    if (!list) return
    const problems: string[] = []
    const ok = [...list].filter((f) => {
      if (isAmazon && !/\.tsv$/i.test(f.name)) return problems.push(T.WRONG_TYPE_AMAZON(f.name)), false
      if (isFlipkart && !FLIPKART_FILE.test(f.name)) return problems.push(T.WRONG_TYPE_FLIPKART(f.name)), false
      if (!isAmazon && !/\.(pdf|xlsx|xls|csv)$/i.test(f.name)) return problems.push(T.WRONG_TYPE(f.name)), false
      if (f.size > MANUAL_MAX_MB * 1024 * 1024) return problems.push(T.TOO_BIG(f.name)), false
      return true
    })
    setFiles((cur) => [...cur, ...ok.filter((f) => !cur.some((c) => c.name === f.name && c.size === f.size))].slice(0, MANUAL_MAX_FILES))
    setNote(problems.length ? { tone: 'err', text: problems.join(' · ') } : null)
  }

  const act = async (key: string, fn: () => Promise<string>) => {
    setBusy(key)
    try {
      setNote({ tone: 'ok', text: await fn() })
      reload()
    } catch (e) {
      setNote({ tone: 'err', text: errText(e) })
    } finally {
      setBusy(null)
    }
  }
  const upload = () => act('upload', async () => {
    const r = await uploadPoFiles(channel, files)
    setFiles([])
    saveRecent(channel)
    setRecent(readRecent())
    return T.UPLOADED(r.ids.length)
  })
  const process = (ids: string[]) => act('process', async () => {
    await processManualUploads(ids)
    setSelected(new Set())
    return T.QUEUED(ids.length)
  })

  const waiting = useMemo(() => (rows ?? []).filter((r) => r.status === MANUAL_STATUS.UPLOADED), [rows])
  const pickedIds = [...selected].filter((id) => waiting.some((w) => w.id === id))
  const th = 'sticky top-0 z-10 border-b border-primary/20 bg-primary-soft px-3 py-2 text-left text-[11.5px] font-semibold text-primary whitespace-nowrap'
  const td = 'border-b border-line px-3 py-2 align-top text-[12.5px]'

  return (
    <div className="space-y-4">
      {note && (
        <div className={`pf-tab-in flex items-start gap-2 rounded-[var(--radius)] px-3 py-2 text-[12.5px] ${note.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-crit-soft text-crit'}`}>
          {note.tone === 'ok' ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          <span className="flex-1">{note.text}</span>
          <button onClick={() => setNote(null)}><X className="size-4" /></button>
        </div>
      )}

      {/* Upload */}
      {canEdit ? (
        <div className="space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-[12.5px] font-semibold text-ink-900">{T.CHANNEL}</label>
            {/* The app's own dropdown (fades and drops open, like the filters), grouped: Recent, then API, then Email. */}
            <div className="w-[260px]">
              <GroupedSelect value={channel} groups={groups} placeholder={T.PICK_CHANNEL}
                onChange={(v) => { setChannel(v); setFiles([]) }} />
            </div>
            {picked && <span key={channel} className="pf-tab-in text-[12px] text-ink-600">{isAmazon ? T.AMAZON_HINT : isFlipkart ? T.FLIPKART_HINT : T.NEEDS(picked.needs, picked.twoFiles, picked.optional, picked.manyPos)}</span>}
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }}
            onClick={() => input.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed px-6 py-8 text-center transition-colors ${drag ? 'border-primary bg-primary-soft/60' : 'border-line hover:border-primary hover:bg-primary-soft/30'}`}>
            <div className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary"><UploadCloud className="size-5" /></div>
            <div className="text-[14px] font-semibold text-ink-900">{T.DROP}</div>
            <div className="text-[12px] text-ink-400">{isAmazon ? T.DROP_HINT_AMAZON : isFlipkart ? T.DROP_HINT_FLIPKART : T.DROP_HINT}</div>
            <input ref={input} type="file" accept={isAmazon ? AMAZON_ACCEPT : isFlipkart ? FLIPKART_ACCEPT : MANUAL_ACCEPT} multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
          </div>
          {files.length > 0 && (
            <ul className="pf-tab-in divide-y divide-line rounded-[var(--radius)] border border-line">
              {files.map((f) => (
                <li key={`${f.name}-${f.size}`} className="pf-tab-in flex items-center gap-2 px-3 py-2 text-[12.5px]">
                  {isSheet(f.name) ? <FileSpreadsheet className="size-4 text-ok" /> : <FileText className="size-4 text-crit" />}
                  <span className="min-w-0 flex-1 truncate font-mono">{f.name}</span>
                  <span className="text-ink-400">{kb(f.size)}</span>
                  <button onClick={() => setFiles((cur) => cur.filter((x) => x !== f))} className="text-ink-400 hover:text-crit"><X className="size-4" /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] text-ink-400">{T.NO_OCR_YET}</span>
            <button onClick={() => void upload()} disabled={!channel || !files.length || !!busy}
              className="pf-press inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
              {busy === 'upload' ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
              {busy === 'upload' ? T.UPLOADING : T.UPLOAD(files.length)}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-[var(--radius)] bg-alt px-3 py-2 text-[12.5px] text-ink-600">{T.VIEW_ONLY}</div>
      )}

      {/* Queue */}
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="text-[13px] font-semibold text-ink-900">{T.QUEUE}</span>
          <span className="flex-1" />
          {canEdit && pickedIds.length > 0 && (
            <button onClick={() => void process(pickedIds)} disabled={!!busy}
              className="pf-press inline-flex h-8 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
              <Play className="size-3.5" />{T.PROCESS_SELECTED(pickedIds.length)}
            </button>
          )}
          {canEdit && waiting.length > 0 && (
            <button onClick={() => void process(waiting.map((w) => w.id))} disabled={!!busy}
              className="pf-press inline-flex h-8 items-center gap-1.5 rounded-[var(--radius)] border border-primary/40 px-3 text-[12.5px] font-semibold text-primary hover:bg-primary-soft disabled:opacity-50">
              <Play className="size-3.5" />{T.PROCESS_ALL(waiting.length)}
            </button>
          )}
        </div>
        {!rows ? (
          <div className="px-4 py-8 text-center text-[13px] text-ink-600"><Loader2 className="mx-auto size-5 animate-spin" /></div>
        ) : !rows.length ? (
          <div className="px-4 py-8 text-center text-[13px] text-ink-600">{T.EMPTY}</div>
        ) : (
          <div className="max-h-[560px] overflow-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={`${th} w-8`} />
                  <th className={th}>#</th>
                  <th className={th}>Channel</th>
                  <th className={th}>Files</th>
                  <th className={th}>Status</th>
                  <th className={th}>POs</th>
                  <th className={th}>Uploaded</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-primary/5">
                    <td className={td}>
                      {canEdit && r.status === MANUAL_STATUS.UPLOADED && (
                        <input type="checkbox" checked={selected.has(r.id)} className="size-4 accent-[var(--color-primary)]"
                          onChange={() => setSelected((s) => { const x = new Set(s); if (x.has(r.id)) x.delete(r.id); else x.add(r.id); return x })} />
                      )}
                    </td>
                    <td className={`${td} tnum text-ink-400`}>{r.id}</td>
                    <td className={`${td} font-semibold text-ink-900`}>{r.channelName}</td>
                    <td className={`${td} max-w-[260px]`}>
                      {r.files.map((f) => <div key={f.filename} className="truncate font-mono text-[12px]" title={f.filename}>{f.filename}</div>)}
                    </td>
                    <td className={td}>
                      <Badge tone={MANUAL_STATUS_TONE[r.status]}>
                        {r.status === MANUAL_STATUS.PROCESSING && <Loader2 className="size-3 animate-spin" />}{MANUAL_STATUS_LABEL[r.status]}
                      </Badge>
                      {r.note && <div className={`mt-1 max-w-[260px] text-[11.5px] ${r.status === MANUAL_STATUS.FAILED ? 'text-crit' : 'text-warn'}`}>{r.note}</div>}
                    </td>
                    <td className={td} title={T.OPEN_HINT}>
                      {r.pos.length ? r.pos.map((p) => (
                        <div key={p.uploadId} className="flex items-center gap-1.5 py-0.5">
                          <span className="font-mono text-[12px]">{p.poNumber ?? '—'}</span>
                          <Badge tone={PO_RESULT_TONE[p.status] ?? 'neutral'}>{PO_RESULT_LABEL[p.status] ?? p.status}</Badge>
                        </div>
                      )) : <span className="text-ink-400">—</span>}
                    </td>
                    <td className={`${td} text-[12px] text-ink-600`}>
                      <div>{r.uploadedBy ?? '—'}</div>
                      <div className="tnum">{istDateTime(r.uploadedAt)}</div>
                    </td>
                    <td className={`${td} whitespace-nowrap text-right`}>
                      {canEdit && r.status === MANUAL_STATUS.UPLOADED && (
                        <span className="inline-flex gap-2">
                          <button onClick={() => void process([r.id])} disabled={!!busy} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"><Play className="size-3.5" />{T.PROCESS}</button>
                          <button onClick={() => void act(`c${r.id}`, async () => (await cancelManualUpload(r.id), T.CANCELLED))} disabled={!!busy} className="text-[12px] text-ink-400 hover:text-crit">{T.CANCEL}</button>
                        </span>
                      )}
                      {canEdit && r.status === MANUAL_STATUS.FAILED && (
                        <button onClick={() => void act(`r${r.id}`, async () => (await retryManualUpload(r.id), T.RETRIED))} disabled={!!busy}
                          className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-ink-900 hover:bg-alt disabled:opacity-50"><RotateCcw className="size-3.5" />{T.RETRY}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
