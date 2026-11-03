import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Maximize2, Minus, Plus } from 'lucide-react'
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { FILE_VIEWER_TEXT, PDF_VIEWER } from '../constants/poReview'
import { FindBox, findAll, findTerms, useDebounced, type ExternalFind, type FindResult } from './FindBox'

GlobalWorkerOptions.workerSrc = workerUrl

/*
 * One PDF page at a time (pdf.js), in the dark Figma viewer frame:
 *   toolbar  title · ↑ ↓ page n / N · − zoom % + fit · actions (open in new tab, download)
 *   body     the page, fit to the box's width; zoomed in, drag it (or scroll) to move around.
 * Keys when the viewer has focus: ↑ / PageUp previous page, ↓ / PageDown next, + / − zoom, 0 fit to width.
 * Find (2026-10-21): the text of every page is read once (on the first search), each match is highlighted on the
 * page, "n of m" with ↑ / ↓ (Enter / Shift+Enter) jumps across pages. Scanned PDFs have no text: the box says so.
 * A match split across two text pieces of the PDF is not found (rare: pieces are usually whole lines).
 */

/** One text piece of a page: its text, position (PDF units) and size. */
type TextPiece = { str: string; x: number; y: number; w: number; h: number }
type Match = { page: number; piece: number; start: number; len: number }
type View = { page: number; viewport: ReturnType<PDFPageProxy['getViewport']> }

type Props = {
  /** Loads the file's bytes (aborted when the viewer closes). */
  load: (signal: AbortSignal) => Promise<ArrayBuffer>
  title: ReactNode
  actions?: ReactNode
  loadingText: string
  failedText: string
  /** Opening zoom (a multiple of fit to width); default fit to width. */
  initialZoom?: number
  /** A search asked for from outside (Verify panel); the count found goes back through onFindResult. */
  externalFind?: ExternalFind
  onFindResult?: FindResult
}

const btn = 'rounded p-1 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent'

export function PdfViewer({ load, title, actions, loadingText, failedText, initialZoom = PDF_VIEWER.FIT, externalFind, onFindResult }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [failed, setFailed] = useState(false)
  const [pageNo, setPageNo] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [zoom, setZoom] = useState<number>(initialZoom)
  // The page as drawn (CSS-pixel viewport), so highlights sit on the right words.
  const [view, setView] = useState<View | null>(null)
  const [find, setFind] = useState('')
  const q = useDebounced(find.trim().toLowerCase())
  // Terms from outside (a click in the Verify panel) win until the person types in the box.
  const [outside, setOutside] = useState<string[] | null>(null)
  useEffect(() => {
    if (!externalFind) return
    setOutside(externalFind.terms.map((t) => t.toLowerCase()))
    setFind(externalFind.terms[0] ?? '')
  }, [externalFind])
  const [texts, setTexts] = useState<TextPiece[][] | null>(null)
  const [reading, setReading] = useState(false)
  const [cur, setCur] = useState(0)
  const curRef = useRef<HTMLDivElement>(null)
  const readingFor = useRef<PDFDocumentProxy | null>(null)
  const [boxWidth, setBoxWidth] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Where the view was centred (as a fraction of the page) before a zoom, so the same spot stays in view after it.
  const anchor = useRef<{ fx: number; fy: number } | null>(null)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  // Load the file once.
  useEffect(() => {
    const ctrl = new AbortController()
    let loaded: PDFDocumentProxy | null = null
    setDoc(null)
    setFailed(false)
    load(ctrl.signal)
      .then((bytes) => getDocument({ data: new Uint8Array(bytes) }).promise)
      .then((d) => {
        if (ctrl.signal.aborted) return void d.loadingTask.destroy()
        loaded = d
        readingFor.current = null
        setDoc(d)
        setTexts(null)
        setPageNo(1)
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setFailed(true)
      })
    return () => {
      ctrl.abort()
      void loaded?.loadingTask.destroy()
    }
  }, [load])

  // Fit to width follows the box's width.
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const ro = new ResizeObserver(() => setBoxWidth(box.clientWidth))
    ro.observe(box)
    return () => ro.disconnect()
  }, [doc])

  // Draw the page (off screen first, so the old page stays until the new one is ready).
  useEffect(() => {
    if (!doc || !boxWidth) return
    let task: RenderTask | null = null
    let cancelled = false
    void (async () => {
      const page = await doc.getPage(pageNo)
      if (cancelled) return
      const natural = page.getViewport({ scale: 1 })
      const scale = (Math.max(boxWidth - PDF_VIEWER.PADDING * 2, 100) / natural.width) * zoom
      const dpr = window.devicePixelRatio || 1
      const viewport = page.getViewport({ scale: scale * dpr })
      const off = document.createElement('canvas')
      off.width = Math.floor(viewport.width)
      off.height = Math.floor(viewport.height)
      task = page.render({ canvas: off, viewport })
      try {
        await task.promise
      } catch {
        return // cancelled by a newer page / zoom
      }
      const canvas = canvasRef.current
      const box = boxRef.current
      if (cancelled || !canvas || !box) return
      canvas.width = off.width
      canvas.height = off.height
      canvas.style.width = `${viewport.width / dpr}px`
      canvas.style.height = `${viewport.height / dpr}px`
      canvas.getContext('2d')?.drawImage(off, 0, 0)
      setView({ page: pageNo, viewport: page.getViewport({ scale }) })
      if (anchor.current) {
        box.scrollLeft = anchor.current.fx * box.scrollWidth - box.clientWidth / 2
        box.scrollTop = anchor.current.fy * box.scrollHeight - box.clientHeight / 2
        anchor.current = null
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, pageNo, zoom, boxWidth])

  // Read every page's text once, on the first search (a ref guards against starting twice; a newer file wins).
  useEffect(() => {
    if (!doc || !(q || outside?.length) || texts || readingFor.current === doc) return
    readingFor.current = doc
    setReading(true)
    void (async () => {
      const all: TextPiece[][] = []
      try {
        for (let n = 1; n <= doc.numPages; n++) {
          const content = await (await doc.getPage(n)).getTextContent()
          all.push(content.items.flatMap((it) => ('str' in it && it.str ? [{
            str: it.str, x: it.transform[4], y: it.transform[5], w: it.width,
            h: it.height || Math.hypot(it.transform[2], it.transform[3]),
          }] : [])))
        }
      } catch {
        // a page that cannot be read counts as no text
      }
      if (readingFor.current !== doc) return
      readingFor.current = null
      setTexts(all)
      setReading(false)
    })()
  }, [doc, q, outside, texts])

  const matches = useMemo<Match[]>(() => {
    if (!texts) return []
    if (outside) return texts.flatMap((pieces, p) => pieces.flatMap((t, i) => findTerms(t.str.toLowerCase(), outside).map((h) => ({ page: p + 1, piece: i, ...h }))))
    if (!q) return []
    return texts.flatMap((pieces, p) => pieces.flatMap((t, i) => findAll(t.str, q).map((start) => ({ page: p + 1, piece: i, start, len: q.length }))))
  }, [texts, q, outside])
  const hasText = !!texts?.some((p) => p.length)
  useEffect(() => setCur(0), [matches])
  // An outside search: say how many were found and go to the first one's page.
  useEffect(() => {
    if (!outside || !texts) return
    onFindResult?.(hasText ? matches.length : null)
    if (matches.length) { setPageNo(matches[0].page); setPageInput(String(matches[0].page)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, outside, texts])

  const pages = doc?.numPages ?? 0
  const goTo = useCallback(
    (n: number) => {
      if (!pages) return
      const next = Math.min(Math.max(n, 1), pages)
      setPageNo(next)
      setPageInput(String(next))
      boxRef.current?.scrollTo({ top: 0 })
    },
    [pages],
  )
  const jump = (i: number) => {
    if (!matches.length) return
    const next = (i + matches.length) % matches.length
    setCur(next)
    if (matches[next].page !== pageNo) goTo(matches[next].page)
  }
  // Bring the current match into view once its page is drawn.
  useEffect(() => {
    curRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' })
  }, [view, cur, matches])
  const highlights = view && texts ? matches.flatMap((m, i) => {
    if (m.page !== view.page) return []
    const t = texts[m.page - 1][m.piece]
    const x0 = t.x + (t.w * m.start) / t.str.length
    const x1 = t.x + (t.w * (m.start + m.len)) / t.str.length
    const [a, b] = view.viewport.convertToViewportPoint(x0, t.y - t.h * 0.2) as number[]
    const [c, d] = view.viewport.convertToViewportPoint(x1, t.y + t.h * 0.85) as number[]
    return [{ i, left: Math.min(a, c), top: Math.min(b, d), width: Math.abs(c - a), height: Math.abs(d - b) }]
  }) : []
  const findStatus = !q && !outside ? undefined : reading || !texts ? FILE_VIEWER_TEXT.SEARCHING : !hasText ? FILE_VIEWER_TEXT.PDF_NO_TEXT
    : matches.length ? FILE_VIEWER_TEXT.MATCH(cur + 1, matches.length) : FILE_VIEWER_TEXT.NO_MATCHES

  const zoomTo = (z: number) => {
    const box = boxRef.current
    if (box && box.scrollWidth && box.scrollHeight) {
      anchor.current = {
        fx: (box.scrollLeft + box.clientWidth / 2) / box.scrollWidth,
        fy: (box.scrollTop + box.clientHeight / 2) / box.scrollHeight,
      }
    }
    setZoom(z)
  }
  const steps = PDF_VIEWER.ZOOM_STEPS
  const zoomIn = () => zoomTo(steps.find((s) => s > zoom + 1e-6) ?? zoom)
  const zoomOut = () => zoomTo([...steps].reverse().find((s) => s < zoom - 1e-6) ?? zoom)

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const act: Record<string, () => void> = {
      ArrowUp: () => goTo(pageNo - 1),
      PageUp: () => goTo(pageNo - 1),
      ArrowDown: () => goTo(pageNo + 1),
      PageDown: () => goTo(pageNo + 1),
      '+': zoomIn,
      '=': zoomIn,
      '-': zoomOut,
      '0': () => zoomTo(PDF_VIEWER.FIT),
    }
    if (act[e.key]) {
      e.preventDefault()
      act[e.key]()
    }
  }

  // Drag to move around a page that is bigger than the box.
  const canDrag = () => {
    const box = boxRef.current
    return !!box && (box.scrollWidth > box.clientWidth || box.scrollHeight > box.clientHeight)
  }
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !canDrag()) return
    const box = e.currentTarget
    drag.current = { x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop }
    box.setPointerCapture(e.pointerId)
    setDragging(true)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    e.currentTarget.scrollLeft = d.left - (e.clientX - d.x)
    e.currentTarget.scrollTop = d.top - (e.clientY - d.y)
  }
  const endDrag = () => {
    drag.current = null
    setDragging(false)
  }

  return (
    <div tabIndex={0} onKeyDown={onKey} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] bg-[#323639] outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <div className="flex items-center gap-3 px-4 py-2 text-[13px] text-white/90">
        <div className="flex min-w-0 flex-1 items-center gap-2">{title}</div>
        {doc && (
          <>
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={() => goTo(pageNo - 1)} disabled={pageNo <= 1} title="Previous page (↑)" className={btn}><ChevronUp className="size-4" /></button>
              <button onClick={() => goTo(pageNo + 1)} disabled={pageNo >= pages} title="Next page (↓)" className={btn}><ChevronDown className="size-4" /></button>
              <input
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && goTo(Number(pageInput) || pageNo)}
                onBlur={() => setPageInput(String(pageNo))}
                aria-label="Page"
                className="tnum w-8 rounded bg-black/30 px-1 py-0.5 text-center text-[12px] text-white outline-none focus:ring-1 focus:ring-white/40"
              />
              <span className="tnum text-[12px] text-white/70">/ {pages}</span>
            </div>
            <span className="h-4 w-px shrink-0 bg-white/20" />
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={zoomOut} disabled={zoom <= steps[0]} title="Zoom out (−)" className={btn}><Minus className="size-4" /></button>
              <span className="tnum w-10 text-center text-[12px] text-white/80">{Math.round(zoom * 100)}%</span>
              <button onClick={zoomIn} disabled={zoom >= steps[steps.length - 1]} title="Zoom in (+)" className={btn}><Plus className="size-4" /></button>
              <button onClick={() => zoomTo(PDF_VIEWER.FIT)} disabled={zoom === PDF_VIEWER.FIT} title="Fit to width (0)" className={btn}><Maximize2 className="size-3.5" /></button>
            </div>
          </>
        )}
        {doc && (
          <>
            <span className="h-4 w-px shrink-0 bg-white/20" />
            <FindBox value={find} onChange={(v) => { setOutside(null); setFind(v) }} placeholder={FILE_VIEWER_TEXT.FIND_PDF} status={findStatus}
              onPrev={() => jump(cur - 1)} onNext={() => jump(cur + 1)} disabled={texts !== null && !hasText} />
          </>
        )}
        {actions && <span className="flex shrink-0 items-center gap-3 border-l border-white/20 pl-3 opacity-80">{actions}</span>}
      </div>
      <div
        ref={boxRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`min-h-0 flex-1 overflow-auto bg-[#525659] select-none ${dragging ? 'cursor-grabbing' : zoom > PDF_VIEWER.FIT ? 'cursor-grab' : ''}`}
      >
        {failed ? (
          <div className="p-6 text-center text-[13px] text-white/80">{failedText}</div>
        ) : !doc ? (
          <div className="p-6 text-center text-[13px] text-white/80">{loadingText}</div>
        ) : (
          <div className="flex min-h-full w-max min-w-full items-start justify-center" style={{ padding: PDF_VIEWER.PADDING }}>
            <div className="relative">
              <canvas ref={canvasRef} className="bg-white shadow-xl" />
              {highlights.map((h) => (
                <div key={h.i} ref={h.i === cur ? curRef : undefined}
                  className={`pointer-events-none absolute rounded-[2px] mix-blend-multiply ${h.i === cur ? 'bg-orange-400/70 ring-2 ring-orange-500' : 'bg-yellow-300/60'}`}
                  style={{ left: h.left, top: h.top, width: h.width, height: h.height }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
