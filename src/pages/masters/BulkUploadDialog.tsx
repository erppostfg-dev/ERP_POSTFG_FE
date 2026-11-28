import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Download, FileUp, PlusCircle, RefreshCw } from 'lucide-react'
import { ApiError } from '../../api/client'
import { applyBulk, checkBulk, getBulkCurrent, getBulkFormat, type BulkColumn, type BulkFormat, type BulkMode, type BulkPlan, type BulkPlanRow } from '../../api/masters'
import { BULK_TEXT as T } from '../../constants/masters'
import { downloadExcel, type ExcelRule, type ExcelSheet } from '../../lib/excelExport'
import { errorText } from '../../lib/friendlyError'
import { Badge, Button, Modal } from '../../components/ui'

/*
 * Masters bulk upload (2026-11-27, user: "bulk upload in the masters: the format Excel to download, all in one go; Add OR
 * Update one at a time; strict about the types"). One window per master (all but Transfer Routes; Warehouses = Update only):
 *   1. pick Add new / Update existing;
 *   2. download the format (Add: blank) or the current data (Update), built here from the server's columns: a "Fill
 *      here" sheet with drop-downs / number / length rules (Excel refuses a wrong value while typing), "How to fill"
 *      (each column: required, type, rule, example) and "Lists" (today's channels, PEP codes ... the drop-downs read);
 *   3. upload it: the browser reads the Excel, the server checks every row (nothing saved), the window shows each row;
 *   4. Save = all or nothing; approvals as today (a new channel SKU / margin change waits on the Approvals page).
 */

const ACTION: Record<BulkPlanRow['action'], { label: string; tone: 'ok' | 'info' | 'neutral' | 'crit' }> = {
  new: { label: 'New', tone: 'ok' }, update: { label: 'Change', tone: 'info' }, same: { label: 'No change', tone: 'neutral' }, error: { label: 'Problem', tone: 'crit' },
}
const header = (c: BulkColumn) => `${c.label}${c.required ? ' *' : ''}`
const typeText = (c: BulkColumn) => ({ text: 'Text', decimal: 'Number (decimals allowed)', int: 'Whole number', list: 'Pick from the list', yesno: 'Yes / No' })[c.type]
const ruleText = (c: BulkColumn) => [
  c.readOnly ? 'For reference: not changed' : '',
  c.min !== undefined || c.max !== undefined ? `${c.min ?? ''} to ${c.max ?? ''}` : '',
  c.max && c.type === 'text' ? `at most ${c.max} characters` : '',
  c.pattern ?? '',
  c.help,
].filter(Boolean).join(' · ')

/** The strict Excel: Fill here (+ rules), How to fill, Lists. */
const buildExcel = async (fmt: BulkFormat, mode: BulkMode, rows: Record<string, string>[], fileName: string) => {
  const cols = fmt.columns[mode] ?? []
  const listNames = Object.keys(fmt.lists)
  // the Lists sheet: one column per list (+ Yes / No), each read by its drop-down as 'Lists'!$X$2:$X$n
  const lists: [string, string[]][] = [...listNames.map((n) => [n, fmt.lists[n]] as [string, string[]]), ['yesNo', fmt.yesNo]]
  const longest = Math.max(...lists.map(([, v]) => v.length))
  const listRange = (name: string) => {
    const i = lists.findIndex(([n]) => n === name)
    const col = String.fromCharCode(65 + i)
    return `'${T.SHEET_LISTS}'!$${col}$2:$${col}$${Math.max(2, lists[i][1].length + 1)}`
  }
  const rules: ExcelRule[] = []
  cols.forEach((c, i) => {
    if (c.readOnly) return
    const base = { col: i, title: c.label, prompt: `${c.required ? 'Required. ' : ''}${c.help}`.slice(0, 255) }
    if (c.type === 'list' && c.list) rules.push({ ...base, type: 'list', source: listRange(c.list), error: `${c.label}: pick a value from the list` })
    else if (c.type === 'yesno') rules.push({ ...base, type: 'list', source: listRange('yesNo'), error: `${c.label}: Yes or No` })
    else if (c.type === 'decimal') rules.push({ ...base, type: 'decimal', min: c.min ?? 0, max: c.max ?? 9_999_999, error: `${c.label}: a number from ${c.min ?? 0} to ${c.max ?? 9_999_999}` })
    else if (c.type === 'int') rules.push({ ...base, type: 'whole', min: c.min ?? 0, max: c.max ?? 2_147_483_647, error: `${c.label}: a whole number` })
    else if (c.max) rules.push({ ...base, type: 'textLength', max: c.max, error: `${c.label}: at most ${c.max} characters` })
  })
  const fill: ExcelSheet = {
    name: T.SHEET_FILL, header: cols.map(header), rows: rows.map((r) => cols.map((c) => r[c.key] ?? '')), rules, ruleRows: fmt.maxRows,
  }
  const how: ExcelSheet = {
    name: T.SHEET_HOW, header: ['Column', 'Required', 'Type', 'Rule', 'Example'],
    rows: [...cols.map((c) => [c.label, c.required ? 'Yes' : 'No', typeText(c), ruleText(c), c.example]), ['', '', '', '', ''], ...T.HOW_TO.map((h) => ['', '', '', h, ''])],
  }
  const listSheet: ExcelSheet = {
    name: T.SHEET_LISTS, header: lists.map(([n]) => n),
    rows: Array.from({ length: longest }, (_, r) => lists.map(([, v]) => v[r] ?? '')),
  }
  await downloadExcel(fileName, [fill, how, listSheet])
}

/** Reads the person's Excel: the Fill here sheet (else the first), row 1 = the format's column names. */
const readExcel = async (file: File, cols: BulkColumn[]): Promise<Record<string, unknown>[]> => {
  const XLSX = await import('xlsx')
  const book = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
  const ws = book.Sheets[T.SHEET_FILL] ?? book.Sheets[book.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' })
  const head = (grid[0] ?? []).map((h) => (typeof h === 'string' || typeof h === 'number' ? String(h) : '').replace(/\s*\*\s*$/, '').trim().toLowerCase())
  const at = new Map(cols.map((c) => [c.key, head.indexOf(c.label.toLowerCase())]))
  if (![...at.values()].some((i) => i >= 0)) throw new Error(T.NO_HEADER)
  const missing = cols.filter((c) => c.required && (at.get(c.key) ?? -1) < 0).map((c) => c.label)
  if (missing.length) throw new Error(T.MISSING_COLUMNS(missing))
  const out: Record<string, unknown>[] = []
  grid.slice(1).forEach((cells, i) => {
    const row: Record<string, unknown> = { _row: i + 2 }
    let any = false
    for (const c of cols) {
      const j = at.get(c.key) ?? -1
      const v = j >= 0 ? cells[j] : ''
      const s = typeof v === 'number' || typeof v === 'boolean' ? String(v) : typeof v === 'string' ? v.trim() : ''
      if (s) any = true
      row[c.key] = s
    }
    if (any) out.push(row)
  })
  return out
}

const problemOf = (e: unknown): { message: string; plan: BulkPlan | null } => {
  if (e instanceof ApiError && e.details && typeof e.details === 'object' && 'rows' in e.details) return { message: errorText(e), plan: e.details as BulkPlan }
  return { message: e instanceof Error && !(e instanceof ApiError) ? e.message : errorText(e), plan: null }
}

export function BulkUploadDialog({ type, label, canUpload, onClose, onSaved }: {
  type: string; label: string; canUpload: boolean; onClose: () => void; onSaved: (message: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const fmt = useQuery({ queryKey: ['masters', 'bulk-format', type], queryFn: ({ signal }) => getBulkFormat(type, signal) })
  const [picked, setMode] = useState<BulkMode>('add')
  // a master without Add (Warehouses) opens on Update
  const modes = fmt.data?.modes ?? ['add', 'update']
  const mode: BulkMode = modes.includes(picked) ? picked : 'update'
  const [file, setFile] = useState<{ name: string; rows: Record<string, unknown>[] } | null>(null)
  const [plan, setPlan] = useState<BulkPlan | null>(null)
  const [busy, setBusy] = useState<'' | 'download' | 'check' | 'save'>('')
  const [error, setError] = useState('')
  const [onlyProblems, setOnlyProblems] = useState(false)

  const reset = (m: BulkMode) => { setMode(m); setFile(null); setPlan(null); setError('') }
  const download = async () => {
    if (!fmt.data) return
    setBusy('download'); setError('')
    try {
      const rows = mode === 'update' ? (await getBulkCurrent(type)).rows : []
      await buildExcel(fmt.data, mode, rows, `${type}_${mode === 'add' ? 'add_format' : 'current_data'}_${new Date().toISOString().slice(0, 10)}`)
    } catch (e) { setError(problemOf(e).message) } finally { setBusy('') }
  }
  const pick = async (f: File | undefined) => {
    if (!f || !fmt.data) return
    if (input.current) input.current.value = ''
    setPlan(null); setError('')
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { setError(T.NOT_EXCEL(f.name)); return }
    setBusy('check')
    try {
      const rows = await readExcel(f, fmt.data.columns[mode] ?? [])
      if (!rows.length) throw new Error(T.NO_ROWS)
      setFile({ name: f.name, rows })
      setPlan(await checkBulk(type, { mode, fileName: f.name, rows }))
    } catch (e) { setError(problemOf(e).message) } finally { setBusy('') }
  }
  const save = async () => {
    if (!file) return
    setBusy('save'); setError('')
    try {
      const done = await applyBulk(type, { mode, fileName: file.name, rows: file.rows })
      onSaved(T.DONE(done.counts.new + done.counts.update, done.counts.needsApproval))
    } catch (e) {
      const p = problemOf(e)
      setError(p.message)
      if (p.plan) setPlan(p.plan)
    } finally { setBusy('') }
  }
  const errorsFile = async () => {
    if (!plan) return
    await downloadExcel(`${type}_problems_${new Date().toISOString().slice(0, 10)}`, [{
      name: 'Problems', header: ['Row', 'Item', 'Problem'],
      rows: plan.rows.filter((r) => r.errors.length).flatMap((r) => r.errors.map((e) => [r.row, r.key, e])),
    }])
  }

  const toSave = plan ? plan.counts.new + plan.counts.update : 0
  const canSave = canUpload && !!plan && plan.counts.error === 0 && toSave > 0 && !busy
  const shown = plan ? plan.rows.filter((r) => (onlyProblems ? r.action === 'error' : r.action !== 'same')) : []
  return (
    <Modal open wide onClose={onClose} title={T.TITLE(label)} sub={T.SUB}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        {canUpload && <Button variant="primary" disabled={!canSave} onClick={() => void save()}>{busy === 'save' ? T.SAVING : T.SAVE(toSave)}</Button>}
      </>}>
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {([['add', T.MODE_ADD, T.MODE_ADD_HINT, PlusCircle], ['update', T.MODE_UPDATE, T.MODE_UPDATE_HINT, RefreshCw]] as const).map(([m, title, hint, Icon]) => (
            <button key={m} type="button" onClick={() => reset(m)} disabled={!modes.includes(m)} title={modes.includes(m) ? undefined : T.NO_ADD}
              className={`rounded-[var(--radius)] border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${mode === m ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-primary/50'}`}>
              <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-900"><Icon className="size-4 text-primary" />{title}</div>
              <div className="mt-0.5 text-[11.5px] text-ink-600">{hint}</div>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button icon={<Download className="size-3.5" />} disabled={!fmt.data || busy === 'download'} onClick={() => void download()}>
            {mode === 'add' ? T.DOWNLOAD_ADD : T.DOWNLOAD_UPDATE}
          </Button>
          {canUpload && (
            <label className="flex min-w-[240px] flex-1 cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-line bg-canvas px-4 py-3 hover:border-primary"
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files[0]) }}>
              <FileUp className="size-5 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink-900">{file ? file.name : T.DROP}</span>
                <span className="block text-[11.5px] text-ink-400">{T.DROP_HINT(fmt.data?.maxRows ?? 5000)}</span>
              </span>
              <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            </label>
          )}
        </div>
        <ul className="ml-4 list-disc space-y-0.5 text-[12px] text-ink-600">{T.HOW_TO.map((h) => <li key={h}>{h}</li>)}</ul>

        {fmt.error && <div className="text-[12.5px] text-crit">{errorText(fmt.error)}</div>}
        {busy === 'check' && <div className="text-[13px] text-ink-600">{T.CHECKING}</div>}
        {error && <div className="flex items-start gap-2 rounded-md border border-crit/30 bg-crit-soft px-3 py-2 text-[12.5px] text-crit"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{error}</div>}

        {plan && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="text-ink-600">{plan.counts.rows} row{plan.counts.rows === 1 ? '' : 's'}:</span>
              <Badge tone="ok">{plan.counts.new} new</Badge>
              <Badge tone="info">{plan.counts.update} to change</Badge>
              <Badge tone="neutral">{plan.counts.same} no change</Badge>
              <Badge tone={plan.counts.error ? 'crit' : 'neutral'}>{plan.counts.error} with problems</Badge>
              {plan.counts.needsApproval > 0 && <Badge tone="warn">{plan.counts.needsApproval} {T.APPROVAL}</Badge>}
              {plan.counts.error > 0 && <Button icon={<Download className="size-3.5" />} onClick={() => void errorsFile()}>{T.ERRORS_FILE}</Button>}
              <label className="ml-auto flex items-center gap-1.5 text-ink-600">
                <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Only rows with problems
              </label>
            </div>
            {plan.counts.error > 0 && <div className="text-[12.5px] text-crit">{T.HAS_ERRORS}</div>}
            {plan.counts.error === 0 && toSave === 0 && <div className="flex items-center gap-2 text-[12.5px] text-ok"><CheckCircle2 className="size-4" />{T.NOTHING}</div>}
            {shown.length > 0 && (
              <div className="max-h-[340px] overflow-auto rounded-[var(--radius)] border border-line">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 bg-alt text-left text-[10.5px] font-semibold uppercase tracking-wide text-ink-600">
                    <tr><th className="w-14 px-3 py-2">Row</th><th className="px-3 py-2"></th><th className="px-3 py-2">Item</th><th className="px-3 py-2">What happens</th></tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.row} className="border-t border-line align-top">
                        <td className="tnum px-3 py-2 text-ink-600">{r.row}</td>
                        <td className="space-y-1 px-3 py-2">
                          <Badge tone={ACTION[r.action].tone}>{ACTION[r.action].label}</Badge>
                          {r.needsApproval && r.action !== 'error' && <div><Badge tone="warn">{T.APPROVAL}</Badge></div>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono">{r.key || '—'}</td>
                        <td className="space-y-0.5 px-3 py-2">
                          {r.errors.map((e, i) => <div key={`e${i}`} className="text-crit">{e}</div>)}
                          {r.changes.map((c, i) => <div key={`c${i}`}>{c.label}: {c.old || '(empty)'} → <b>{c.value}</b></div>)}
                          {r.filled.map((f, i) => <div key={`f${i}`} className="text-ink-400">{f}</div>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
