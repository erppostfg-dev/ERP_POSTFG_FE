import { Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { downloadCsv } from './ui'
import { FindBox, findAll, findTerms, useDebounced, type ExternalFind, type FindResult } from './FindBox'
import { jsonTables, sheetTables, type ViewTable } from '../lib/fileTables'
import { FILE_VIEWER, FILE_VIEWER_TEXT, PREVIEW_TYPES } from '../constants/poReview'

/*
 * Every PO file shown in the app, nothing downloaded (2026-10-21, user: "a good format viewer for all formats; if it's
 * JSON show it as the CSV"). The bytes are loaded once (the caller's `load`, e.g. GET /po-review/:uploadId/file), then:
 *   PDF                       the page-by-page pdf.js viewer (components/PdfViewer)
 *   xlsx / xls / csv / ods …  one tab per sheet, Excel-style grid (A B C columns, row numbers), save as CSV
 *   JSON                      one tab per list of records + a Details tab (field, value) + the raw JSON; save as CSV
 *   HTML (email body)         sandboxed, no scripts
 *   images, text              as they are
 *   anything else             a download button
 * The dark Figma viewer frame (toolbar: title · search / tools · actions) is the same for every type.
 * Search on top for every type (2026-10-21, user): PDF text (components/PdfViewer); tables keep only matching rows and
 * mark the text; text, raw JSON and the email body mark every match with "n of m" and ↑ / ↓; images cannot be searched.
 */

// pdf.js and SheetJS are large: each is loaded only when a file of its type is opened.
const PdfViewer = lazy(() => import('./PdfViewer').then((m) => ({ default: m.PdfViewer })))

type Kind = 'pdf' | 'sheet' | 'json' | 'html' | 'image' | 'text' | 'other'

const kindOf = (ext: string): Kind => {
  const is = (list: readonly string[]) => list.includes(ext)
  return is(PREVIEW_TYPES.PDF) ? 'pdf' : is(PREVIEW_TYPES.SHEET) ? 'sheet' : is(PREVIEW_TYPES.JSON) ? 'json'
    : is(PREVIEW_TYPES.HTML) ? 'html' : is(PREVIEW_TYPES.IMAGE) ? 'image' : is(PREVIEW_TYPES.TEXT) ? 'text' : 'other'
}

const MIME: Partial<Record<string, string>> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

const decode = (bytes: ArrayBuffer) => new TextDecoder().decode(bytes)

/** Saves the loaded bytes under the file's own name (no second request). */
function saveBytes(bytes: ArrayBuffer, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes]))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

type Props = {
  /** Loads the file's bytes (aborted when the viewer closes). */
  load: (signal: AbortSignal) => Promise<ArrayBuffer>
  fileName: string
  /** File type when known (e.g. the backend's poFileType); else taken from the name's extension. */
  type?: string | null
  /** Extra toolbar buttons (open in a new tab, close …). */
  actions?: ReactNode
  /** Opening zoom of a PDF (multiple of fit to width); the full-screen View passes FULL_SCREEN_PDF_ZOOM. */
  pdfZoom?: number
  /** Highlight a value asked for from outside (Verify panel: a click on a processed.json value); the count found goes back. */
  externalFind?: ExternalFind
  onFindResult?: FindResult
}

export function FileViewer({ load, fileName, type, actions, pdfZoom, externalFind, onFindResult }: Props) {
  const ext = (type || fileName.split('.').pop() || '').toLowerCase()
  const kind = kindOf(ext)
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    setBytes(null)
    setFailed(false)
    load(ctrl.signal)
      .then((b) => { if (!ctrl.signal.aborted) setBytes(b) })
      .catch(() => { if (!ctrl.signal.aborted) setFailed(true) })
    return () => ctrl.abort()
  }, [load])

  const title = (
    <>
      {kind === 'sheet' ? <FileSpreadsheet className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0" />}
      <span className="min-w-0 truncate font-medium" title={fileName}>{fileName}</span>
    </>
  )
  const allActions = (
    <>
      {bytes && (
        <button type="button" onClick={() => saveBytes(bytes, fileName)} title={FILE_VIEWER_TEXT.DOWNLOAD} className="hover:opacity-100">
          <Download className="size-4" />
        </button>
      )}
      {actions}
    </>
  )

  // pdf.js moves the bytes into its worker, so it gets a copy: the original stays for the download button.
  const pdfLoad = useCallback(async () => (bytes ? bytes.slice(0) : new ArrayBuffer(0)), [bytes])
  if (kind === 'pdf' && bytes) {
    return (
      <Suspense fallback={<Frame title={title} actions={allActions}><Note>{FILE_VIEWER_TEXT.LOADING}</Note></Frame>}>
        <PdfViewer load={pdfLoad} title={title} actions={allActions} loadingText={FILE_VIEWER_TEXT.LOADING}
          failedText={FILE_VIEWER_TEXT.FAILED} initialZoom={pdfZoom} externalFind={externalFind} onFindResult={onFindResult} />
      </Suspense>
    )
  }
  if (failed) return <Frame title={title} actions={allActions}><Note>{FILE_VIEWER_TEXT.FAILED}</Note></Frame>
  if (!bytes) return <Frame title={title} actions={allActions}><Note>{FILE_VIEWER_TEXT.LOADING}</Note></Frame>
  const outside = { externalFind, onFindResult }
  if (kind === 'sheet' || kind === 'json') return <TablesView bytes={bytes} kind={kind} fileName={fileName} title={title} actions={allActions} {...outside} />
  return <PlainView bytes={bytes} kind={kind} ext={ext} fileName={fileName} title={title} actions={allActions} {...outside} />
}

/** The dark viewer frame: toolbar (title, optional middle tools, actions) over the content. */
function Frame({ title, tools, actions, children }: { title: ReactNode; tools?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] bg-[#323639]">
      <div className="flex items-center gap-3 px-4 py-2 text-[13px] text-white/90">
        <div className="flex min-w-0 flex-1 items-center gap-2">{title}</div>
        {tools}
        {actions && <span className="flex shrink-0 items-center gap-3 border-l border-white/20 pl-3 opacity-80">{actions}</span>}
      </div>
      <div className="min-h-0 flex-1 bg-[#525659]">{children}</div>
    </div>
  )
}

const Note = ({ children }: { children: ReactNode }) => <div className="p-6 text-center text-[13px] text-white/80">{children}</div>

/** Search state shared by the views: typed text, the debounced lower-case query, the current match. */
type Hit = { start: number; len: number }

function useFind(externalFind?: ExternalFind) {
  const [find, setFindText] = useState('')
  const q = useDebounced(find.trim().toLowerCase())
  const [cur, setCur] = useState(0)
  // Terms from outside (Verify panel) win, matched as whole words / numbers, until the person types in the box.
  const [outside, setOutside] = useState<string[] | null>(null)
  useEffect(() => {
    if (!externalFind) return
    setOutside(externalFind.terms.map((t) => t.toLowerCase()))
    setFindText(externalFind.terms[0] ?? '')
    setCur(0)
  }, [externalFind])
  useEffect(() => setCur(0), [q])
  const setFind = (v: string) => { setOutside(null); setFindText(v) }
  const active = !!outside || !!q
  const status = (count: number) =>
    !active ? undefined : count ? FILE_VIEWER_TEXT.MATCH(Math.min(cur, count - 1) + 1, count) : FILE_VIEWER_TEXT.NO_MATCHES
  const step = (count: number, by: number) => { if (count) setCur((c) => (c + by + count) % count) }
  /** Matches in a text: whole-word terms from outside, else what was typed (anywhere). */
  const hitsIn = useCallback(
    (text: string): Hit[] => (outside ? findTerms(text.toLowerCase(), outside) : q ? findAll(text, q).map((start) => ({ start, len: q.length })) : []),
    [outside, q],
  )
  return { find, setFind, q, outside, cur, setCur, status, step, hitsIn }
}

/** Email body, text, image or an unknown type, with the search box on top. */
function PlainView({ bytes, kind, ext, fileName, title, actions, externalFind, onFindResult }: {
  bytes: ArrayBuffer; kind: Kind; ext: string; fileName: string; title: ReactNode; actions: ReactNode
  externalFind?: ExternalFind; onFindResult?: FindResult
}) {
  const f = useFind(externalFind)
  const { hitsIn, outside } = f
  const text = useMemo(() => (kind === 'html' || kind === 'text' ? decode(bytes) : ''), [bytes, kind])
  const marked = useMemo(() => (kind === 'html' ? markHtml(text, hitsIn) : null), [kind, text, hitsIn])
  const positions = useMemo(() => (kind === 'text' ? hitsIn(text) : []), [kind, text, hitsIn])
  const count = marked ? marked.count : positions.length
  useEffect(() => {
    if (outside) onFindResult?.(kind === 'html' || kind === 'text' ? count : null)
  }, [outside, count, kind, onFindResult])
  const searchable = kind === 'html' || kind === 'text'
  const tools = kind !== 'other' && (
    <FindBox value={f.find} onChange={f.setFind} disabled={!searchable}
      placeholder={searchable ? FILE_VIEWER_TEXT.FIND_TEXT : FILE_VIEWER_TEXT.FIND_IMAGE}
      status={f.status(count)} onPrev={() => f.step(count, -1)} onNext={() => f.step(count, 1)} />
  )
  return (
    <Frame title={title} tools={tools} actions={actions}>
      {marked ? <HtmlView html={marked.html} cur={f.cur} fileName={fileName} />
        : kind === 'image' ? <ImageView bytes={bytes} ext={ext} fileName={fileName} />
        : kind === 'text' ? (
          <MarkedText text={text} hits={positions} cur={f.cur} className="h-full overflow-auto bg-white p-4 whitespace-pre-wrap" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-[13px] text-white/80">
            {FILE_VIEWER_TEXT.FAILED}
            <button type="button" onClick={() => saveBytes(bytes, fileName)} className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 font-semibold text-white hover:bg-white/20">
              <Download className="size-4" />Download {fileName}
            </button>
          </div>
        )}
    </Frame>
  )
}

function ImageView({ bytes, ext, fileName }: { bytes: ArrayBuffer; ext: string; fileName: string }) {
  const url = useMemo(() => URL.createObjectURL(new Blob([bytes], { type: MIME[ext] })), [bytes, ext])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return <div className="h-full overflow-auto p-5"><img src={url} alt={fileName} className="mx-auto bg-white shadow-xl" /></div>
}

/** Class of the current match inside the email body. */
const MARK_CUR = 'pf-cur'

/**
 * The email body with every match wrapped in <mark data-f="i"> (text only, tags untouched). The frame stays sandboxed
 * with no scripts; allow-same-origin only lets this page scroll it to the current match.
 */
function markHtml(html: string, hitsIn: (text: string) => Hit[]): { html: string; count: number } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const tag = n.parentElement?.tagName
    if (tag !== 'SCRIPT' && tag !== 'STYLE') nodes.push(n as Text)
  }
  let count = 0
  for (const node of nodes) {
    const t = node.data
    const at = hitsIn(t)
    if (!at.length) continue
    const frag = doc.createDocumentFragment()
    let from = 0
    for (const h of at) {
      frag.append(t.slice(from, h.start))
      const m = doc.createElement('mark')
      m.dataset.f = String(count++)
      m.textContent = t.slice(h.start, h.start + h.len)
      frag.append(m)
      from = h.start + h.len
    }
    frag.append(t.slice(from))
    node.replaceWith(frag)
  }
  if (!count) return { html, count: 0 }
  const style = doc.createElement('style')
  style.textContent = `mark{background:#fde68a;color:inherit}mark.${MARK_CUR}{background:#fb923c;outline:2px solid #f97316}`
  doc.head.append(style)
  return { html: `<!doctype html>${doc.documentElement.outerHTML}`, count }
}

function HtmlView({ html, cur, fileName }: { html: string; cur: number; fileName: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const show = useCallback(() => {
    const d = ref.current?.contentDocument
    if (!d) return
    d.querySelectorAll(`mark.${MARK_CUR}`).forEach((m) => m.classList.remove(MARK_CUR))
    const m = d.querySelector(`mark[data-f="${cur}"]`)
    m?.classList.add(MARK_CUR)
    m?.scrollIntoView({ block: 'center' })
  }, [cur])
  useEffect(show, [show, html])
  return <iframe ref={ref} srcDoc={html} onLoad={show} title={fileName} sandbox="allow-same-origin" className="h-full w-full border-0 bg-white" />
}

/** Text with the matches marked; the current one is orange and scrolled into view. */
function MarkedText({ text, hits, cur, className }: { text: string; hits: Hit[]; cur: number; className: string }) {
  const curRef = useRef<HTMLElement>(null)
  useEffect(() => { curRef.current?.scrollIntoView({ block: 'center' }) }, [cur, hits])
  const parts: ReactNode[] = []
  let from = 0
  hits.forEach((h, i) => {
    parts.push(text.slice(from, h.start))
    parts.push(
      <mark key={`m${i}`} ref={i === cur ? curRef : undefined}
        className={i === cur ? 'rounded-[2px] bg-orange-400 ring-2 ring-orange-500' : 'bg-amber-200'}>{text.slice(h.start, h.start + h.len)}</mark>,
    )
    from = h.start + h.len
  })
  parts.push(text.slice(from))
  return <pre className={`font-mono text-[12px] leading-relaxed text-ink-900 ${className}`}>{parts.map((x, i) => <Fragment key={i}>{x}</Fragment>)}</pre>
}

/** Marks every match inside one table cell. */
function CellText({ text, hits }: { text: string; hits: Hit[] }) {
  if (!hits.length) return <>{text}</>
  const parts: ReactNode[] = []
  let from = 0
  hits.forEach((h, i) => {
    parts.push(text.slice(from, h.start), <mark key={`m${i}`} className="rounded-[2px] bg-amber-200">{text.slice(h.start, h.start + h.len)}</mark>)
    from = h.start + h.len
  })
  parts.push(text.slice(from))
  return <>{parts.map((x, i) => <Fragment key={i}>{x}</Fragment>)}</>
}

/** One cell that matches a search from outside: table, row (in the table's own rows) and column. */
type CellHit = { t: number; r: number; c: number }

/**
 * Sheets and JSON: tabs (one per sheet / list), search, row count, save as CSV, and the grid.
 * Typed search keeps only the matching rows. A search from outside (Verify panel) keeps every row and instead marks
 * the matching cells in every tab, jumps to the first one (switching tab) and steps with ↑ / ↓.
 */
function TablesView({ bytes, kind, fileName, title, actions, externalFind, onFindResult }: {
  bytes: ArrayBuffer; kind: 'sheet' | 'json'; fileName: string; title: ReactNode; actions: ReactNode
  externalFind?: ExternalFind; onFindResult?: FindResult
}) {
  const [tables, setTables] = useState<ViewTable[] | null>(null)
  const [raw, setRaw] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState(0)
  const f = useFind(externalFind)
  const { hitsIn, outside, cur, setCur } = f

  useEffect(() => {
    let live = true
    setTables(null)
    setFailed(false)
    setTab(0)
    const parse = kind === 'sheet'
      ? sheetTables(bytes)
      : Promise.resolve().then(() => {
        const value: unknown = JSON.parse(decode(bytes))
        setRaw(JSON.stringify(value, null, 2))
        return jsonTables(value)
      })
    parse.then((t) => { if (live) setTables(t) }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [bytes, kind])

  const names = [...(tables ?? []).map((t) => t.name), ...(raw !== null ? [FILE_VIEWER.RAW] : [])]
  const current = tables?.[tab]
  const q = f.q
  const isRaw = !!tables && tab >= tables.length && raw !== null
  const rawAt = useMemo(() => (isRaw && raw ? hitsIn(raw) : []), [isRaw, raw, hitsIn])

  // Search from outside: every matching cell of every table (Raw JSON left out: same values).
  const cellHits = useMemo<CellHit[]>(() => {
    if (!outside || !tables) return []
    return tables.flatMap((t, ti) => t.rows.flatMap((row, ri) => row.flatMap((cell, ci) => (hitsIn(cell).length ? [{ t: ti, r: ri, c: ci }] : []))))
  }, [outside, tables, hitsIn])
  useEffect(() => {
    if (!outside || !tables) return
    onFindResult?.(cellHits.length)
    if (cellHits.length) setTab(cellHits[0].t)
  }, [outside, tables, cellHits, onFindResult])
  const step = (by: number) => {
    if (!cellHits.length) return
    const next = (cur + by + cellHits.length) % cellHits.length
    setCur(next)
    setTab(cellHits[next].t)
  }

  const matched = useMemo(
    () => (current && q && !outside ? current.rows.filter((r) => r.some((c) => c.toLowerCase().includes(q))) : current?.rows ?? []),
    [current, q, outside],
  )
  const saveCsv = () => current && downloadCsv(
    `${fileName.replace(/\.[^.]+$/, '')}${names.length > 1 ? `-${current.name}` : ''}.csv`,
    current.sheet ? current.rows[0] ?? [] : current.columns,
    current.sheet ? current.rows.slice(1) : current.rows,
  )

  const status = outside ? f.status(cellHits.length) : isRaw ? f.status(rawAt.length) : current ? FILE_VIEWER_TEXT.ROWS(matched.length) : undefined
  const tools = tables && (
    <div className="flex shrink-0 items-center gap-2">
      <FindBox value={f.find} onChange={f.setFind} placeholder={FILE_VIEWER_TEXT.FIND} status={status}
        onPrev={outside ? () => step(-1) : isRaw ? () => f.step(rawAt.length, -1) : undefined}
        onNext={outside ? () => step(1) : isRaw ? () => f.step(rawAt.length, 1) : undefined} />
      {current && !isRaw && (
        <button type="button" onClick={saveCsv} title={FILE_VIEWER_TEXT.SAVE_CSV}
          className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-[12px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90">
          <Download className="size-3.5" />CSV
        </button>
      )}
    </div>
  )
  const hitsHere = outside ? cellHits.filter((h) => h.t === tab) : []
  const curHit = outside ? cellHits[cur] : undefined

  return (
    <Frame title={title} tools={tools} actions={actions}>
      {failed ? <Note>{FILE_VIEWER_TEXT.FAILED}</Note> : !tables ? <Note>{FILE_VIEWER_TEXT.LOADING}</Note> : (
        <div className="flex h-full flex-col">
          {names.length > 1 && (
            <div className="flex shrink-0 gap-1 overflow-x-auto bg-[#3c4043] px-2 pt-1.5">
              {names.map((n, i) => (
                <button key={n} type="button" onClick={() => setTab(i)}
                  className={`shrink-0 rounded-t-md px-3 py-1.5 text-[12px] font-medium transition-colors ${i === tab ? 'bg-white text-ink-900' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
                  {n}
                </button>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto bg-white">
            {isRaw
              ? <MarkedText text={raw ?? ''} hits={rawAt} cur={f.cur} className="p-4" />
              : current && (
                <Grid table={current} rows={matched} hitsIn={hitsIn} empty={q ? FILE_VIEWER_TEXT.NO_MATCH : FILE_VIEWER_TEXT.EMPTY}
                  hitCells={new Set(hitsHere.map((h) => `${h.r}:${h.c}`))} curCell={curHit && curHit.t === tab ? `${curHit.r}:${curHit.c}` : undefined} />
              )}
          </div>
        </div>
      )}
    </Frame>
  )
}

/** The table: sticky header (column letters for sheets, keys for JSON), sticky row numbers, long cells cut with a tooltip. */
function Grid({ table, rows, hitsIn, empty, hitCells, curCell }: {
  table: ViewTable; rows: string[][]; hitsIn: (text: string) => Hit[]; empty: string
  /** Cells found by a search from outside ("row:col"), and the current one (orange, scrolled into view). */
  hitCells?: Set<string>; curCell?: string
}) {
  const curRef = useRef<HTMLTableCellElement>(null)
  useEffect(() => { curRef.current?.scrollIntoView({ block: 'center', inline: 'center' }) }, [curCell, table])
  if (!rows.length) return <div className="p-6 text-center text-[13px] text-ink-600">{empty}</div>
  const shown = rows.slice(0, FILE_VIEWER.MAX_ROWS)
  // Header in the app's blue (user, 2026-10-21), like the selected tabs and badges.
  const head = 'sticky top-0 z-10 border-b border-r border-primary/20 bg-primary-soft px-2 py-1.5 text-left text-[11.5px] font-semibold text-primary whitespace-nowrap'
  const num = 'sticky left-0 border-b border-r border-line bg-alt px-2 py-1 text-right text-[11px] text-ink-400 tnum'
  return (
    <>
      <table className="min-w-full border-separate border-spacing-0 text-[12.5px]">
        <thead>
          <tr>
            <th className={`${head} left-0 z-20 w-10 text-right`}>#</th>
            {table.columns.map((c) => <th key={c} className={`${head} ${table.sheet ? 'text-center' : ''}`}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} className="hover:bg-primary/5">
              <td className={num}>{i + 1}</td>
              {table.columns.map((_, j) => {
                const key = `${i}:${j}`
                const isCur = curCell === key
                const isHit = hitCells?.has(key)
                return (
                  <td key={j} ref={isCur ? curRef : undefined} title={r[j] && r[j].length > 40 ? r[j] : undefined}
                    className={`max-w-[320px] truncate border-b border-r border-line/70 px-2 py-1 text-ink-900 ${isCur ? 'bg-orange-300 ring-2 ring-inset ring-orange-500' : isHit ? 'bg-amber-100' : ''}`}>
                    <CellText text={r[j] ?? ''} hits={hitsIn(r[j] ?? '')} />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && (
        <div className="p-3 text-center text-[12px] text-ink-600">{FILE_VIEWER_TEXT.CAPPED(shown.length, rows.length)}</div>
      )}
    </>
  )
}
