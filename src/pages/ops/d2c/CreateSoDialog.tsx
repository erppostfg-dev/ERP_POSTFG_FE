import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleAlert, Info, Loader2, XCircle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Modal } from '../../../components/ui'
import { createSo, gateAllows, getSoJob, stockCheck, type D2cGate, type D2cSoJob, type D2cStockCheck } from '../../../api/d2cTransfers'
import { D2C_ERROR, D2C_SO_JOB_POLL_MS, D2C_SO_OUTCOME_LABEL, D2C_TEXT } from '../../../constants/d2cTransfers'
import { D2C_KEY } from '../../../lib/liveTransfers'
import { ErrorBox } from './bits'
import { errorOf, num } from './format'

/*
 * "Create SO in Uniware" for one or more drafts (POST_FG so.service.ts; plan 5.4): 1. stock check at each dispatch
 * warehouse (read only; warnings per short line, Ops may still go on), 2. confirm, 3. the create runs in the background
 * on the server (3 at a time) and this dialog follows its job: one result per transfer (created / refused with
 * Uniware's reason / no clear answer yet). While D2C transfers are not live only the test warehouses can be sent.
 */

export type SoTarget = { uid: string; transferCode: string; sender: string | null; receiving: string | null }

/** May this transfer's SO be written to Uniware now (the backend gate's rule: the sender; not live = both sides test)? */
const soAllowed = (gate: D2cGate | undefined, t: SoTarget) => gateAllows(gate, t.sender, t.receiving, 'sender')

type StockRow = D2cStockCheck['transfers'][number]
const shortText = (t: StockRow) =>
  t.lines.filter((l) => l.short || l.shortOverall).map((l) => `${l.skuCode}: needs ${l.needed}, available ${l.available}${l.short ? '' : ' (short together)'}`).join('; ')

export function CreateSoDialog({ targets, gate, onClose }: { targets: SoTarget[]; gate: D2cGate | undefined; onClose: () => void }) {
  const qc = useQueryClient()
  const allowed = useMemo(() => targets.filter((t) => soAllowed(gate, t)), [targets, gate])
  const blocked = targets.filter((t) => !soAllowed(gate, t))
  const [stock, setStock] = useState<D2cStockCheck | null>(null)
  const [stockError, setStockError] = useState<string | null>(null)
  const [job, setJob] = useState<D2cSoJob | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<ReturnType<typeof errorOf> | null>(null)

  // 1. stock (read only), only of what may be sent
  useEffect(() => {
    if (!allowed.length) return
    let live = true
    stockCheck(allowed.map((t) => t.uid))
      .then((s) => { if (live) setStock(s) })
      .catch((e: unknown) => { if (live) setStockError(errorOf(e).message) })
    return () => { live = false }
  }, [allowed])

  // 3. follow the job until it is done, then reload the lists
  useEffect(() => {
    if (!job || job.status === 'done') return
    let live = true
    const t = setTimeout(() => {
      getSoJob(job.id).then((j) => { if (live) setJob(j) }).catch((e: unknown) => { if (live) setError(errorOf(e)) })
    }, D2C_SO_JOB_POLL_MS)
    return () => { live = false; clearTimeout(t) }
  }, [job])
  const finished = job?.status === 'done'
  useEffect(() => {
    if (finished) void qc.invalidateQueries({ queryKey: [D2C_KEY] })
  }, [finished, qc])

  const send = async () => {
    setSending(true)
    setError(null)
    try {
      const warnings = Object.fromEntries((stock?.transfers ?? []).filter((t) => t.short).map((t) => [t.uid, `Stock short at ${t.facility ?? '-'}: ${shortText(t)}`]))
      setJob(await createSo(allowed.map((t) => t.uid), warnings))
    } catch (e) {
      setError(errorOf(e))
    } finally {
      setSending(false)
    }
  }

  const checking = allowed.length > 0 && !stock && !stockError
  const byUid = new Map((stock?.transfers ?? []).map((t) => [t.uid, t]))
  const results = new Map((job?.results ?? []).map((r) => [r.uid, r]))
  const shortCount = (stock?.transfers ?? []).filter((t) => t.short).length
  const running = !!job && !finished
  const title = targets.length === 1 ? `Create SO in Uniware · ${targets[0].transferCode}` : `Create SO in Uniware · ${targets.length} transfers`
  return (
    <Modal open wide onClose={onClose} title={title} sub={D2C_TEXT.CREATE_SO_HELP}
      footer={job
        ? <Button variant="primary" disabled={running} onClick={onClose}>{running ? `Sending… ${job.done}/${job.total}` : 'Done'}</Button>
        : <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" disabled={!allowed.length || checking || sending} onClick={() => void send()}>
            {sending ? 'Sending…' : shortCount ? `Create SO anyway (${allowed.length})` : `Create SO in Uniware (${allowed.length})`}
          </Button>
        </>}>
      <div className="space-y-3">
        {gate && (!gate.open || gate.testOnly) && (
          <div className="flex items-start gap-2 rounded-[var(--radius)] border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{gate.testOnly ? D2C_TEXT.TEST_MODE_NOT_SENT : D2C_TEXT.NOT_LIVE(gate.testFacilities.join(', '))}{blocked.length ? ` Not sent: ${blocked.map((t) => `${t.transferCode} (${t.sender ?? '-'} -> ${t.receiving ?? '-'})`).join(', ')}.` : ''}</span>
          </div>
        )}
        {checking && <div className="flex items-center gap-2 text-[12.5px] text-ink-600"><Loader2 className="size-3.5 animate-spin" /> Checking stock in Uniware…</div>}
        {stockError && <ErrorBox text={`Stock could not be checked (${stockError}). You can still create the SO.`} />}
        {stock && !job && (
          <div className="flex items-center gap-1.5 text-[12px] text-ink-600" title={D2C_TEXT.STOCK_FORMULA}>
            <Info className="size-3.5" /> {shortCount ? `${shortCount} transfer(s) short of stock. ${D2C_TEXT.STOCK_SHORT}` : 'Stock is enough for every selected transfer.'}
          </div>
        )}
        <ul className="divide-y divide-line rounded-[var(--radius)] border border-line">
          {targets.map((t) => <TargetRow key={t.uid} t={t} stock={byUid.get(t.uid)} result={results.get(t.uid)} blocked={!soAllowed(gate, t)} waiting={!!job} />)}
        </ul>
        {error && <ErrorBox text={error.code === D2C_ERROR.NOT_LIVE ? D2C_TEXT.NOT_LIVE(gate?.testFacilities.join(', ') ?? '') : error.message} problems={error.problems} />}
      </div>
    </Modal>
  )
}

function TargetRow({ t, stock: s, result: r, blocked, waiting }: {
  t: SoTarget; stock: StockRow | undefined; result: D2cSoJob['results'][number] | undefined; blocked: boolean; waiting: boolean
}) {
  const status = r ? <Result outcome={r.outcome} soCode={r.soCode} />
    : blocked ? <Badge tone="neutral">Not live for this warehouse</Badge>
      : waiting ? <span className="inline-flex items-center gap-1 text-ink-600"><Loader2 className="size-3 animate-spin" /> Waiting</span>
        : s?.error ? <Badge tone="warn">Stock unknown</Badge>
          : s ? (s.short ? <Badge tone="warn">Stock short</Badge> : <Badge tone="ok">Stock OK</Badge>) : null
  const short = !r && s ? s.lines.filter((l) => l.short || l.shortOverall) : []
  return (
    <li className="px-3 py-2 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-semibold">{t.transferCode}</span>
        <span className="font-mono text-ink-600">{t.sender ?? '—'}</span>
        <span className="ml-auto">{status}</span>
      </div>
      {r?.error && <div className={`mt-1 ${r.outcome === 'created' ? 'text-ink-600' : 'text-crit'}`}>{r.error}</div>}
      {!r && s?.error && <div className="mt-1 text-warn">{s.error}</div>}
      {short.length > 0 && (
        <table className="mt-1.5 text-[12px]">
          <thead><tr className="text-left text-[10.5px] uppercase tracking-wide text-ink-400"><th className="pr-4">SKU</th><th className="pr-4 text-right">Needed</th><th className="pr-4 text-right" title={D2C_TEXT.STOCK_FORMULA}>Available ⓘ</th><th /></tr></thead>
          <tbody>
            {short.map((l) => (
              <tr key={l.lineId}>
                <td className="pr-4 font-mono">{l.skuCode}</td>
                <td className="tnum pr-4 text-right">{num(l.needed)}</td>
                <td className="tnum pr-4 text-right text-warn" title={`${D2C_TEXT.STOCK_FORMULA} Inventory ${l.inventory}, open sale ${l.openSale}, blocked ${l.inventoryBlocked}.`}>{num(l.available)}</td>
                <td className="text-ink-400">{l.short ? '' : D2C_TEXT.STOCK_SHORT_TOGETHER}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  )
}

function Result({ outcome, soCode }: { outcome: string; soCode: string | null }) {
  const label = D2C_SO_OUTCOME_LABEL[outcome] ?? outcome
  if (outcome === 'created') return <span className="inline-flex items-center gap-1 font-semibold text-ok"><CheckCircle2 className="size-3.5" />{label}{soCode && <span className="font-mono font-normal"> · {soCode}</span>}</span>
  if (outcome === 'unknown') return <span className="inline-flex items-center gap-1 font-semibold text-warn"><CircleAlert className="size-3.5" />{label}</span>
  return <span className="inline-flex items-center gap-1 font-semibold text-crit"><XCircle className="size-3.5" />{label}</span>
}
