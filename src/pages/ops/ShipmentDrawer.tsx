import { useEffect, useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Drawer } from '../../components/ui'
import { Cell, DateInput, Field, inputCls, textareaCls } from '../../components/kit'
import { SelectBox } from '../../components/pickers'
import { ApiError } from '../../api/client'
import { getEditOptions, saveShipment, type ColumnDef, type ConflictDetail, type FieldChanges, type ShipmentItem } from '../../api/poOverview'
import { replaceShipmentRow } from '../../lib/liveShipments'
import { HistoryTimeline } from './ShipmentHistory'
import { errorText } from '../../lib/friendlyError'

/*
 * The row drawer of the Shipment Status (2026-10-14): the sections of the current tab; the person's own fields are
 * editable (team access, their facility, not locked), the rest read only. Only changed fields are saved, each with the
 * value the person STARTED from (kept even if the row updates live meanwhile), so the server's conflict check stops an
 * overwrite. History (who changed what) at the bottom; it refreshes after every save and live change.
 */

type Row = Record<string, unknown>
export type DrawerPart = { label: string; cols: ColumnDef[]; edit: boolean; editFields?: Set<string> }

const ERR_CONFLICT = 'FIELDS_CHANGED_MEANWHILE'
const text = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export function ShipmentDrawer({ row, parts, onClose, fieldLabel }: { row: Row; parts: DrawerPart[]; onClose: () => void; fieldLabel?: (field: string) => string }) {
  const qc = useQueryClient()
  const uid = String(row.uid)
  const options = useQuery({ queryKey: ['po-overview', 'edit-options'], queryFn: ({ signal }) => getEditOptions(signal) }).data
  // draft = the new values; base = what each edited field held when the person started editing it
  const [draft, setDraft] = useState<Row>({})
  const [base, setBase] = useState<Row>({})
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [conflicts, setConflicts] = useState<ConflictDetail[]>([])

  const canEdit = row.canEdit === true
  const isEditable = (p: DrawerPart, c: ColumnDef) => canEdit && !c.locked && (p.edit || !!p.editFields?.has(c.field))
  const changed = useMemo(() => Object.keys(draft).filter((f) => text(draft[f]) !== text(base[f])), [draft, base])
  const appointmentChanged = !!options && changed.includes(options.appointmentField) && text(draft[options.appointmentField]) !== ''
  const labelOf = (f: string) => parts.flatMap((p) => p.cols).find((c) => c.field === f)?.label ?? f
  // a field someone else changed while this person edits it
  const movedUnderMe = changed.filter((f) => text(row[f]) !== text(base[f]))

  useEffect(() => { setMessage(null) }, [uid])

  const setField = (f: string, v: unknown) => {
    if (!(f in base)) setBase((b) => ({ ...b, [f]: row[f] ?? null }))
    setDraft((d) => ({ ...d, [f]: v }))
  }
  const reset = () => { setDraft({}); setBase({}); setRemark(''); setConflicts([]) }

  const save = async () => {
    if (!changed.length) return
    setSaving(true)
    setMessage(null)
    const changes: FieldChanges = Object.fromEntries(changed.map((f) => [f, { from: base[f] ?? null, to: draft[f] === '' ? null : draft[f] }]))
    try {
      const res = await saveShipment(uid, { changes, remark: remark || undefined })
      replaceShipmentRow(qc, res.shipment)
      reset()
      setMessage({ tone: 'ok', text: `Saved ${changed.length} change(s).` })
    } catch (e) {
      if (e instanceof ApiError && e.code === ERR_CONFLICT) setConflicts((e.details as ConflictDetail[]) ?? [])
      setMessage({ tone: 'err', text: errorText(e) })
    } finally {
      setSaving(false)
    }
  }

  /** Drop my edits of the conflicting fields and take the latest values (the row is already live-updated). */
  const useLatest = () => {
    const fs = conflicts.map((c) => c.field)
    setDraft((d) => Object.fromEntries(Object.entries(d).filter(([f]) => !fs.includes(f))))
    setBase((b) => Object.fromEntries(Object.entries(b).filter(([f]) => !fs.includes(f))))
    setConflicts([])
    setMessage(null)
  }

  const input = (c: ColumnDef) => {
    const v = c.field in draft ? draft[c.field] : row[c.field]
    const on = (x: unknown) => setField(c.field, x)
    const select = (values: string[]) => <SelectBox value={text(v)} options={values} onChange={(x) => on(x || null)} />
    if (options?.statusFields[c.field]) return select(options.statuses[options.statusFields[c.field]])
    if (options?.transporterFields.includes(c.field)) return select(options.transporters)
    if (c.field === 'statusActive' && options) return select(options.statusActive)
    if (c.kind === 'date') return <DateInput value={text(v)} onChange={(x) => on(x || null)} />
    if (c.kind === 'num' || c.kind === 'money') return <input type="number" min={0} step="any" value={text(v)} onChange={(e) => on(e.target.value === '' ? null : Number(e.target.value))} className={inputCls} />
    if (/remark/i.test(c.field)) return <textarea rows={2} value={text(v)} onChange={(e) => on(e.target.value)} className={textareaCls} />
    return <input value={text(v)} onChange={(e) => on(e.target.value)} className={inputCls} />
  }

  return (
    <Drawer open onClose={onClose} title={<span className="font-mono">{text(row.poNumber)}</span>} sub={`UID ${uid} · ${text(row.channel)} · ${text(row.location)}`}
      footer={(close) => (
        <>
          {changed.length > 0 && <Button onClick={reset}>Discard</Button>}
          <Button onClick={close}>Close</Button>
          {canEdit && <Button variant="primary" disabled={!changed.length || saving || (appointmentChanged && !remark)} onClick={save}>{saving ? 'Saving…' : `Save changes (${changed.length})`}</Button>}
        </>
      )}>
      {message && (
        <div className={`mb-3 rounded-[var(--radius)] px-3 py-2 text-[12.5px] ${message.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-crit-soft text-crit'}`}>
          {message.text}
          {conflicts.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {conflicts.map((c) => <li key={c.field}>{labelOf(c.field)}: now "{text(c.now) || 'empty'}"{c.by ? `, changed by ${c.by}` : ''}{c.at ? ` at ${new Date(c.at).toLocaleString()}` : ''}</li>)}
            </ul>
          )}
          {conflicts.length > 0 && <button onClick={useLatest} className="mt-1 font-semibold underline">Use the latest values</button>}
        </div>
      )}
      {movedUnderMe.length > 0 && (
        <div className="mb-3 rounded-[var(--radius)] bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          Changed by someone else while you edit: {movedUnderMe.map(labelOf).join(', ')}. Saving will be refused for these; discard or use the latest values.
        </div>
      )}
      {parts.filter((p) => p.cols.length).map((p) => (
        <div key={p.label} className="mb-4">
          <div className="mb-1 flex items-center gap-1.5 rounded bg-alt px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-600">{p.label}{p.edit && canEdit && <Pencil className="size-3" />}</div>
          <div className="divide-y divide-line">
            {p.cols.map((c) => (
              <Field key={c.field} label={c.label}>
                {isEditable(p, c) ? input(c) : <Cell kind={c.kind} v={row[c.field]} />}
              </Field>
            ))}
          </div>
        </div>
      ))}
      {appointmentChanged && options && (
        <div className="mb-4">
          <Field label="Appointment remark *">
            <SelectBox value={remark} options={options.appointmentRemarks.map((r) => r.remark)} onChange={setRemark} placeholder="Pick the reason…" allowEmpty={false} />
          </Field>
        </div>
      )}
      {canEdit && !appointmentChanged && changed.length > 0 && (
        <div className="mb-4"><Field label="Remark (optional)"><input value={remark} onChange={(e) => setRemark(e.target.value)} className={inputCls} /></Field></div>
      )}
      <div className="mt-6">
        <div className="mb-1 rounded bg-alt px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-600">History</div>
        <div className="mt-2"><HistoryTimeline uid={uid} labelOf={fieldLabel ?? labelOf} /></div>
      </div>
    </Drawer>
  )
}
