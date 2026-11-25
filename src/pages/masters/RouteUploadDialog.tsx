import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileUp } from 'lucide-react'
import { ApiError } from '../../api/client'
import { getRoutesTemplate, importRoutesUpload, previewRoutesUpload, type RouteUploadPreview, type RouteUploadResult, type RouteUploadRow } from '../../api/masters'
import { HISTORY_TEXT, ROUTE_FIELD_LABEL, ROUTE_UPLOAD_MAX_BYTES, TRANSFER_ROUTE_TEXT as T } from '../../constants/masters'
import { Badge, Button, Modal } from '../../components/ui'
import { inputCls } from '../../components/kit'

/*
 * Masters -> Transfer Routes -> Upload CSV (2026-11-25; replaces the placeholder window whose "template" was every row
 * and whose import saved nothing). Download the template (one real route as the example), choose a .csv, see what
 * each row does (new / change / no change / problem), then Save: all or nothing, the same file checked again.
 */

const saveText = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), text], { type: 'text/csv;charset=utf-8;' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
type Problem = { message: string; rows: { row: number; message: string }[] }
const problemOf = (e: unknown): Problem => {
  if (e instanceof ApiError) {
    const rows = Array.isArray(e.details) ? (e.details as { row?: number; message?: string }[]).filter((d) => d.row).map((d) => ({ row: Number(d.row), message: String(d.message ?? '') })) : []
    return { message: e.message, rows }
  }
  return { message: String(e), rows: [] }
}
const ACTION: Record<RouteUploadRow['action'], { label: string; tone: 'ok' | 'warn' | 'crit' | 'neutral' | 'info' }> = {
  new: { label: 'New', tone: 'ok' }, update: { label: 'Change', tone: 'info' }, same: { label: 'No change', tone: 'neutral' }, error: { label: 'Problem', tone: 'crit' },
}
const show = (v: string | null) => (v === null || v === '' ? '(empty)' : v)

export function RouteUploadDialog({ canUpload, onClose, onSaved }: { canUpload: boolean; onClose: () => void; onSaved: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<RouteUploadPreview | null>(null)
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState<'' | 'preview' | 'import' | 'template'>('')
  const [error, setError] = useState<Problem | null>(null)
  const [onlyChanges, setOnlyChanges] = useState(true)

  const pick = async (f: File | undefined) => {
    if (!f) return
    setFile(f)
    setPreview(null)
    setError(null)
    if (input.current) input.current.value = ''
    if (!f.name.toLowerCase().endsWith('.csv')) { setError({ message: `${f.name} is not a .csv file: in Excel use Save As > CSV`, rows: [] }); return }
    if (f.size > ROUTE_UPLOAD_MAX_BYTES) { setError({ message: `${f.name} is over 2 MB`, rows: [] }); return }
    setBusy('preview')
    try { setPreview(await previewRoutesUpload(f)) } catch (e) { setError(problemOf(e)) } finally { setBusy('') }
  }
  const save = async () => {
    if (!file) return
    setBusy('import')
    setError(null)
    try {
      const r: RouteUploadResult = await importRoutesUpload(file, remark.trim() || undefined)
      onSaved([T.UPLOAD_DONE(r.added, r.updated, r.unchanged), r.switchedOn.length ? T.UPLOAD_SWITCHED_ON(r.switchedOn) : ''].filter(Boolean).join(' '))
    } catch (e) {
      setError(problemOf(e))
    } finally {
      setBusy('')
    }
  }
  const template = async () => {
    setBusy('template')
    setError(null)
    try { saveText('transfer-routes-template.csv', await getRoutesTemplate()) } catch (e) { setError(problemOf(e)) } finally { setBusy('') }
  }

  const toSave = preview ? preview.added + preview.updated : 0
  const canSave = canUpload && !!preview && preview.canImport && toSave > 0 && !busy
  const rows = preview ? (onlyChanges ? preview.rows.filter((r) => r.action !== 'same') : preview.rows) : []
  return (
    <Modal open wide onClose={onClose} title={T.UPLOAD_TITLE} sub={T.UPLOAD_SUB}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        {canUpload && (
          <Button variant="primary" disabled={!canSave} onClick={() => void save()}>
            {busy === 'import' ? 'Saving…' : preview ? `Save ${toSave} route${toSave === 1 ? '' : 's'}` : 'Save'}
          </Button>
        )}
      </>}>
      <div className="space-y-4">
        <ul className="ml-4 list-disc space-y-0.5 text-[12px] text-ink-600">{T.UPLOAD_HELP.map((h) => <li key={h}>{h}</li>)}</ul>
        {!canUpload && <div className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-[12px] text-warn">{T.UPLOAD_EDITOR_ONLY}</div>}
        <div className="flex flex-wrap items-center gap-3">
          {canUpload && (
            <label className="flex min-w-[240px] flex-1 cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-line bg-canvas px-4 py-4 hover:border-primary"
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files[0]) }}>
              <FileUp className="size-5 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink-900">{file ? file.name : 'Drop the .csv here or click to choose'}</span>
                <span className="block text-[11.5px] text-ink-400">.csv only · at most 2 MB / 5,000 rows</span>
              </span>
              <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            </label>
          )}
          <Button icon={<Download className="size-3.5" />} disabled={busy === 'template'} onClick={() => void template()}>Download template</Button>
        </div>

        {busy === 'preview' && <div className="text-[13px] text-ink-600">Checking every row…</div>}
        {error && (
          <div className="rounded-md border border-crit/30 bg-crit-soft px-3 py-2 text-[12.5px] text-crit">
            <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" />{error.message}</div>
            {error.rows.length > 0 && <ul className="ml-6 mt-1 list-disc">{error.rows.slice(0, 20).map((r, i) => <li key={i}>Row {r.row}: {r.message}</li>)}</ul>}
          </div>
        )}

        {preview && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="text-ink-600">{preview.rowCount} row{preview.rowCount === 1 ? '' : 's'}:</span>
              <Badge tone="ok">{preview.added} new</Badge>
              <Badge tone="info">{preview.updated} to change</Badge>
              <Badge tone="neutral">{preview.unchanged} no change</Badge>
              <Badge tone={preview.errors ? 'crit' : 'neutral'}>{preview.errors} with problems</Badge>
              <label className="ml-auto flex items-center gap-1.5 text-ink-600">
                <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} /> Hide rows with no change
              </label>
            </div>
            {preview.errors > 0 && <div className="text-[12.5px] text-crit">Fix the rows with problems and choose the file again: nothing is saved while any row has a problem.</div>}
            {preview.canImport && toSave === 0 && <div className="flex items-center gap-2 text-[12.5px] text-ok"><CheckCircle2 className="size-4" /> Every route is already as in the file: nothing to save.</div>}
            {preview.enable.length > 0 && (
              <div className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-[12px] text-ink-900">
                These warehouses are not yet allowed internal transfers and will be switched on (in their History): <b>{preview.enable.join(', ')}</b>
              </div>
            )}
            {rows.length > 0 && (
              <div className="max-h-[320px] overflow-auto rounded-[var(--radius)] border border-line">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 bg-alt text-left text-[10.5px] font-semibold uppercase tracking-wide text-ink-600">
                    <tr><th className="w-14 px-3 py-2">Row</th><th className="px-3 py-2"></th><th className="px-3 py-2">Route</th><th className="px-3 py-2">Uniware channel</th><th className="px-3 py-2">What happens</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.row} className="border-t border-line align-top">
                        <td className="tnum px-3 py-2 text-ink-600">{r.row}</td>
                        <td className="px-3 py-2"><Badge tone={ACTION[r.action].tone}>{ACTION[r.action].label}</Badge></td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono">{r.sender || '—'} → {r.channel || '—'} | {r.location || '—'}{r.receiving && <span className="font-sans text-[11px] text-ink-400"> (to {r.receiving})</span>}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono">{r.uniwareChannel || <span className="text-ink-400">—</span>}</td>
                        <td className="space-y-0.5 px-3 py-2">
                          {r.errors.map((e, i) => <div key={`e${i}`} className="text-crit">{e}</div>)}
                          {r.changes.map((c, i) => (
                            <div key={`c${i}`}>{ROUTE_FIELD_LABEL[c.field] ?? c.field}: {r.action === 'new' ? <b>{show(c.value)}</b> : <>{show(c.old)} → <b>{show(c.value)}</b></>}</div>
                          ))}
                          {r.warnings.map((w, i) => <div key={`w${i}`} className="text-warn">{w}</div>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {canUpload && preview.canImport && toSave > 0 && (
              <label className="block">
                <div className="mb-1 text-[12px] font-medium text-ink-600">{HISTORY_TEXT.REMARK}</div>
                <textarea rows={2} maxLength={1000} value={remark} onChange={(e) => setRemark(e.target.value)} className={inputCls} />
                <div className="mt-1 text-[11px] text-ink-400">{HISTORY_TEXT.REMARK_HINT}</div>
              </label>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
