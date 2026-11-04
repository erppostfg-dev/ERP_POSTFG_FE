import { useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, Loader2, XCircle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Modal } from '../../../components/ui'
import { createInwardPo, gateAllows, getInwardJob, type D2cGate, type D2cInvoiceRow, type D2cInwardJob } from '../../../api/d2cTransfers'
import { D2C_ERROR, D2C_INWARD_OUTCOME_LABEL, D2C_SO_JOB_POLL_MS, D2C_TEXT } from '../../../constants/d2cTransfers'
import { D2C_KEY } from '../../../lib/liveTransfers'
import { ErrorBox } from './bits'
import { errorOf, num } from './format'

/*
 * "Create inward PO" for one or more dispatched invoices (POST_FG inward-po.service.ts; plan 5.5): the confirm step
 * lists transfer / invoice / units / receiving warehouse / vendor and the total; then the create runs in the background
 * on the server (2 at a time) and this dialog follows its job: per invoice created (with the PO number) / refused with
 * Uniware's reason / no clear answer yet (the sync checks it). Only the test warehouses while D2C is not live.
 */

/** May this inward PO be written to Uniware now (the backend gate's rule: the RECEIVING facility, where the PO is made; not live = both sides test)? */
const poAllowed = (gate: D2cGate | undefined, r: D2cInvoiceRow) => gateAllows(gate, r.sender, r.receiving, 'receiving')

export function InwardPoDialog({ rows, gate, onClose }: { rows: D2cInvoiceRow[]; gate: D2cGate | undefined; onClose: () => void }) {
  const qc = useQueryClient()
  const allowed = rows.filter((r) => poAllowed(gate, r))
  const blocked = rows.filter((r) => !poAllowed(gate, r))
  const [job, setJob] = useState<D2cInwardJob | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<ReturnType<typeof errorOf> | null>(null)

  useEffect(() => {
    if (!job || job.status === 'done') return
    let live = true
    const t = setTimeout(() => {
      getInwardJob(job.id).then((j) => { if (live) setJob(j) }).catch((e: unknown) => { if (live) setError(errorOf(e)) })
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
      setJob(await createInwardPo(allowed.map((r) => r.id)))
    } catch (e) {
      setError(errorOf(e))
    } finally {
      setSending(false)
    }
  }

  const results = new Map((job?.results ?? []).map((r) => [r.invoiceId, r]))
  const total = allowed.reduce((s, r) => s + r.units, 0)
  const running = !!job && !finished
  const title = rows.length === 1 ? `Create inward PO · ${rows[0].invoiceNo ?? rows[0].transferCode}` : `Create inward PO · ${rows.length} invoices`
  const c = 'px-3 py-2'
  return (
    <Modal open wide onClose={onClose} title={title} sub={D2C_TEXT.CREATE_INWARD_PO_HELP}
      footer={job
        ? <Button variant="primary" disabled={running} onClick={onClose}>{running ? `Creating… ${job.done}/${job.total}` : 'Done'}</Button>
        : <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" disabled={!allowed.length || sending} onClick={() => void send()}>
            {sending ? 'Sending…' : `Create ${allowed.length} inward PO${allowed.length === 1 ? '' : 's'} (${num(total)} units)`}
          </Button>
        </>}>
      <div className="space-y-3">
        {gate && (!gate.open || gate.testOnly) && (
          <div className="flex items-start gap-2 rounded-[var(--radius)] border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{gate.testOnly ? D2C_TEXT.TEST_MODE_NOT_SENT : D2C_TEXT.NOT_LIVE(gate.testFacilities.join(', '))}{blocked.length ? ` Not sent: ${blocked.map((r) => `${r.invoiceNo ?? r.id} (${r.sender ?? '-'} -> ${r.receiving ?? '-'})`).join(', ')}.` : ''}</span>
          </div>
        )}
        <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
          <table className="w-full text-[12.5px]">
            <thead className="bg-alt text-left text-[10.5px] font-semibold uppercase tracking-wide text-ink-600">
              <tr><th className={c}>Transfer</th><th className={c}>Invoice no.</th><th className={`${c} text-right`}>Units</th><th className={c}>Receiving WH</th><th className={c}>Vendor</th><th className={c}>Result</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const res = results.get(r.id)
                const out = !poAllowed(gate, r)
                return (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className={`${c} font-mono font-semibold`}>{r.transferCode}</td>
                    <td className={`${c} font-mono`}>{r.invoiceNo ?? r.shippingPackageCode}</td>
                    <td className={`${c} tnum text-right`}>{num(r.units)}</td>
                    <td className={`${c} font-mono`}>{r.receiving ?? '—'}</td>
                    <td className={`${c} font-mono`}>{r.vendorCode ?? <span className="text-crit">{D2C_TEXT.VENDOR_MISSING}</span>}</td>
                    <td className={c}>
                      {res ? <Result outcome={res.outcome} code={res.inwardPoCode} />
                        : out ? <span className="text-ink-400">Not live for {r.sender ?? '-'}</span>
                          : job ? <span className="inline-flex items-center gap-1 text-ink-600"><Loader2 className="size-3 animate-spin" /> Waiting</span>
                            : <span className="text-ink-400">Ready</span>}
                      {res?.error && <div className={`mt-0.5 whitespace-normal ${res.outcome === 'created' ? 'text-ink-600' : 'text-crit'}`}>{res.error}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t border-line bg-canvas font-semibold">
              <tr><td className={c} colSpan={2}>Total ({allowed.length} to send)</td><td className={`${c} tnum text-right`}>{num(total)}</td><td colSpan={3} /></tr>
            </tfoot>
          </table>
        </div>
        {error && <ErrorBox text={error.code === D2C_ERROR.NOT_LIVE ? D2C_TEXT.NOT_LIVE(gate?.testFacilities.join(', ') ?? '') : error.message} problems={error.problems} />}
      </div>
    </Modal>
  )
}

function Result({ outcome, code }: { outcome: string; code: string | null }) {
  const label = D2C_INWARD_OUTCOME_LABEL[outcome] ?? outcome
  if (outcome === 'created') return <span className="inline-flex items-center gap-1 font-semibold text-ok"><CheckCircle2 className="size-3.5" />{label}{code && <span className="font-mono font-normal"> · {code}</span>}</span>
  if (outcome === 'unknown') return <span className="inline-flex items-center gap-1 font-semibold text-warn"><CircleAlert className="size-3.5" />{label}</span>
  return <span className="inline-flex items-center gap-1 font-semibold text-crit"><XCircle className="size-3.5" />{label}</span>
}
