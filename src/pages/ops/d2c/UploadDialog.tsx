import { useRef, useState } from 'react'
import { CheckCircle2, Download, FileUp, XCircle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Modal } from '../../../components/ui'
import { getTemplate, importUpload, previewUpload, type D2cUploadImport, type D2cUploadPreview } from '../../../api/d2cTransfers'
import { D2C_TEXT, D2C_UPLOAD_MAX_BYTES } from '../../../constants/d2cTransfers'
import { D2C_KEY } from '../../../lib/liveTransfers'
import { fmtDate } from '../../../lib/ops'
import { ErrorBox, PriorityBadge, WarnBox } from './bits'
import { errorOf, num } from './format'

/*
 * "Upload internal transfers" (PRD creation flow A, plan 5.1): download the template, pick a .csv, see every row's
 * errors / warnings and the transfers it makes (with the reference IDs the import would take now), then Import, which
 * is enabled only with no error at all (all or nothing). The same file is sent again on Import and checked again.
 */

const saveText = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function UploadDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<D2cUploadPreview | null>(null)
  const [done, setDone] = useState<D2cUploadImport | null>(null)
  const [busy, setBusy] = useState<'' | 'preview' | 'import' | 'template'>('')
  const [error, setError] = useState<ReturnType<typeof errorOf> | null>(null)

  const pick = async (f: File | undefined) => {
    if (!f) return
    setFile(f)
    setPreview(null)
    setError(null)
    if (!f.name.toLowerCase().endsWith('.csv')) { setError({ message: `${f.name} is not a .csv file`, code: '', problems: [] }); return }
    if (f.size > D2C_UPLOAD_MAX_BYTES) { setError({ message: `${f.name} is over 2 MB`, code: '', problems: [] }); return }
    setBusy('preview')
    try {
      setPreview(await previewUpload(f))
    } catch (e) {
      setError(errorOf(e))
    } finally {
      setBusy('')
      if (input.current) input.current.value = ''
    }
  }
  const run = async () => {
    if (!file) return
    setBusy('import')
    setError(null)
    try {
      setDone(await importUpload(file))
      void qc.invalidateQueries({ queryKey: [D2C_KEY, 'list'] })
      void qc.invalidateQueries({ queryKey: [D2C_KEY, 'counts'] })
    } catch (e) {
      setError(errorOf(e))
    } finally {
      setBusy('')
    }
  }
  const template = async () => {
    setBusy('template')
    try { saveText('d2c-transfers-template.csv', await getTemplate()) } catch (e) { setError(errorOf(e)) } finally { setBusy('') }
  }

  const canImport = !!preview && preview.canImport && preview.errorCount === 0 && !done
  const issues = preview?.rows.filter((r) => r.errors.length || r.warnings.length) ?? []
  return (
    <Modal open wide onClose={onClose} title="Upload internal transfers" sub={D2C_TEXT.UPLOAD_HELP}
      footer={done
        ? <Button variant="primary" onClick={onClose}>Done</Button>
        : <><Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canImport || !!busy} onClick={() => void run()}>
            {busy === 'import' ? 'Importing…' : preview ? `Import ${preview.transfers.length} transfer${preview.transfers.length === 1 ? '' : 's'}` : 'Import'}
          </Button></>}>
      {done ? <Imported r={done} /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-[240px] flex-1 cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-line bg-canvas px-4 py-4 hover:border-primary"
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files[0]) }}>
              <FileUp className="size-5 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink-900">{file ? file.name : 'Drop the .csv here or click to choose'}</span>
                <span className="block text-[11.5px] text-ink-400">.csv only · at most 2 MB / 5,000 rows</span>
              </span>
              <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            </label>
            <Button icon={<Download className="size-3.5" />} disabled={busy === 'template'} onClick={() => void template()}>Download template</Button>
          </div>

          {busy === 'preview' && <div className="text-[13px] text-ink-600">Checking every row…</div>}
          {error && <ErrorBox text={error.message} problems={error.problems} />}

          {preview && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="text-ink-600">{num(preview.rowCount)} rows → {num(preview.transfers.length)} transfers</span>
                <Badge tone={preview.errorCount ? 'crit' : 'ok'}>{preview.errorCount} error{preview.errorCount === 1 ? '' : 's'}</Badge>
                <Badge tone={preview.warningCount ? 'warn' : 'neutral'}>{preview.warningCount} warning{preview.warningCount === 1 ? '' : 's'}</Badge>
                {preview.errorCount > 0 && <span className="text-crit">Fix the file and choose it again: nothing is imported while a row has an error.</span>}
              </div>

              <div>
                <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Proposed transfers</div>
                <div className="max-h-[260px] overflow-auto rounded-[var(--radius)] border border-line">
                  <table className="w-full text-[12.5px]">
                    <thead className="sticky top-0 bg-alt text-left text-[10.5px] font-semibold uppercase tracking-wide text-ink-600">
                      <tr>
                        <th className="px-3 py-2"></th><th className="px-3 py-2">Route</th><th className="px-3 py-2">Reference ID</th><th className="px-3 py-2">Channel / location</th><th className="px-3 py-2">Uniware channel</th><th className="px-3 py-2">PO date</th>
                        <th className="px-3 py-2">Priority</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Lines</th><th className="px-3 py-2 text-right">Units</th><th className="px-3 py-2">Rows</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.transfers.map((t) => (
                        <tr key={t.key} className="border-t border-line">
                          <td className="px-3 py-2">{t.valid ? <CheckCircle2 className="size-4 text-ok" /> : <XCircle className="size-4 text-crit" />}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono">{t.senderCode ?? '?'} → {t.receivingCode ?? '?'}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono">{t.referencePreview ?? <span className="text-ink-400">—</span>}</td>
                          <td className="whitespace-nowrap px-3 py-2">{t.channel ?? '—'} / {t.location ?? '—'}{t.group && <span className="text-ink-400"> · group {t.group}</span>}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono" title={t.routeChannels.length > 1 ? D2C_TEXT.CHANNELS_HINT : undefined}>
                            {t.route?.uniwareChannelCode ?? <span className="text-ink-400">—</span>}
                            {t.routeChannels.length > 1 && <span className="ml-1 font-sans text-[11px] text-ink-400">(1 of {t.routeChannels.length})</span>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">{fmtDate(t.poDate)}</td>
                          <td className="px-3 py-2"><PriorityBadge p={t.priority} /></td>
                          <td className="px-3 py-2">{t.type ?? '—'}</td>
                          <td className="tnum px-3 py-2 text-right">{t.lines.length}</td>
                          <td className="tnum px-3 py-2 text-right">{num(t.totalUnits)}</td>
                          <td className="px-3 py-2 text-ink-400">{t.rows.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.transfers.some((t) => t.referencePreview) && <div className="mt-1 text-[11.5px] text-ink-400">Reference IDs {D2C_TEXT.REFERENCE_NOTE}; transfer IDs are given on import.</div>}
              </div>

              <div>
                <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Row checks</div>
                {issues.length === 0
                  ? <div className="flex items-center gap-2 text-[12.5px] text-ok"><CheckCircle2 className="size-4" /> Every row passes.</div>
                  : (
                    <div className="max-h-[220px] overflow-auto rounded-[var(--radius)] border border-line">
                      <table className="w-full text-[12.5px]">
                        <thead className="sticky top-0 bg-alt text-left text-[10.5px] font-semibold uppercase tracking-wide text-ink-600">
                          <tr><th className="w-16 px-3 py-2">Row</th><th className="px-3 py-2">Problem</th></tr>
                        </thead>
                        <tbody>
                          {issues.map((r) => (
                            <tr key={r.row} className="border-t border-line align-top">
                              <td className="tnum px-3 py-2 text-ink-600">{r.row}</td>
                              <td className="space-y-0.5 px-3 py-2">
                                {r.errors.map((e, i) => <div key={`e${i}`} className="text-crit"><span className="font-semibold">Error</span> · {e.field}: {e.message}</div>)}
                                {r.warnings.map((w, i) => <div key={`w${i}`} className="text-warn"><span className="font-semibold">Warning</span> · {w.field}: {w.message}</div>)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

function Imported({ r }: { r: D2cUploadImport }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-ok"><CheckCircle2 className="size-4" /> {r.transfers.length} draft transfer{r.transfers.length === 1 ? '' : 's'} created</div>
      <WarnBox items={r.notices} />
      <div className="max-h-[300px] overflow-auto rounded-[var(--radius)] border border-line">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-alt text-left text-[10.5px] font-semibold uppercase tracking-wide text-ink-600">
            <tr><th className="px-3 py-2">Transfer ID</th><th className="px-3 py-2">Reference ID</th><th className="px-3 py-2">Group</th><th className="px-3 py-2">Rows</th></tr>
          </thead>
          <tbody>
            {r.transfers.map((t) => (
              <tr key={t.uid} className="border-t border-line">
                <td className="px-3 py-2 font-mono font-semibold">{t.transferCode}</td><td className="px-3 py-2 font-mono">{t.reference}</td>
                <td className="px-3 py-2">{t.group ?? '—'}</td><td className="px-3 py-2 text-ink-400">{t.rows.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.warnings.length > 0 && <WarnBox items={r.warnings.slice(0, 10).map((w) => `Row ${w.row} · ${w.field}: ${w.message}`)} />}
    </div>
  )
}
