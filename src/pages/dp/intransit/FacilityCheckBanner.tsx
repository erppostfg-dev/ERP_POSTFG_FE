import { useState } from 'react'
import { AlertTriangle, Ban, Building2, Plus } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Drawer } from '../../../components/ui'
import { SelectBox } from '../../../components/pickers'
import {
  addCheckedFacility, getFacilityCheck, ignoreCheckedFacility, stopCheckedFacility, type CheckedNewFacility, type FacilityCheck,
} from '../../../api/intransit'
import { FACILITY_CHECK_TEXT as T } from '../../../constants/intransit'
import { istDateTime } from '../../../lib/time'
import { errText } from './shared'

/*
 * The weekly Uniware facility check (POST_FG, 2026-10-30), on In-transit Stock and Masters > Warehouses: a banner when
 * Uniware has facilities the report does not export / count yet, or the report still exports / counts facilities
 * Uniware no longer has enabled. Review opens the list: pick a bucket and Add, mark Not stock, or Stop.
 */

export const FACILITY_CHECK_KEY = ['intransit', 'facility-check'] as const

export default function FacilityCheckBanner({ canEdit, onChanged }: { canEdit: boolean; onChanged?: () => void }) {
  const check = useQuery({ queryKey: FACILITY_CHECK_KEY, queryFn: ({ signal }) => getFacilityCheck(signal), staleTime: 60_000 })
  const [open, setOpen] = useState(false)
  const c = check.data
  if (!c) return null
  const n = c.newFacilities.length + c.disabled.length
  if (!n && !(c.error && canEdit)) return null
  return (
    <>
      <div role="status" className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
        <AlertTriangle className="size-4 shrink-0" />
        <span className="flex-1">
          {n > 0 ? T.BANNER(c.newFacilities.length, c.disabled.length) : T.FAILED(c.error ?? '')}
          {c.checkedAt && <span className="text-ink-600"> · {T.CHECKED(istDateTime(c.checkedAt))}</span>}
        </span>
        {n > 0 && <Button onClick={() => setOpen(true)}>{T.REVIEW}</Button>}
      </div>
      {open && <ReviewDrawer check={c} canEdit={canEdit} onChanged={onChanged} onClose={() => setOpen(false)} />}
    </>
  )
}

function ReviewDrawer({ check, canEdit, onChanged, onClose }: { check: FacilityCheck; canEdit: boolean; onChanged?: () => void; onClose: () => void }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const act = async (code: string, fn: () => Promise<FacilityCheck>, ok: string) => {
    setBusy(code)
    setError('')
    try {
      qc.setQueryData(FACILITY_CHECK_KEY, await fn())
      setDone(ok)
      onChanged?.()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Drawer open onClose={onClose} wide title={T.TITLE} sub={check.checkedAt ? T.CHECKED(istDateTime(check.checkedAt)) : undefined}>
      <div className="space-y-5 text-[12.5px]">
        {!canEdit && <p className="text-ink-600">{T.VIEW_ONLY}</p>}
        {error && <p className="rounded-[var(--radius)] bg-crit-soft px-3 py-2 text-crit">{error}</p>}
        {done && <p className="rounded-[var(--radius)] bg-ok-soft px-3 py-2 text-ok">{done}</p>}

        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-900"><Plus className="size-4 text-primary" />{T.NEW_TITLE(check.newFacilities.length)}</h3>
          <p className="text-ink-600">{T.NEW_SUB}</p>
          {!check.newFacilities.length && <p className="text-ink-400">{T.NONE}</p>}
          <ul className="divide-y divide-line rounded-[var(--radius)] border border-line">
            {check.newFacilities.map((f) => (
              <NewRow key={f.code} f={f} buckets={check.buckets} canEdit={canEdit} busy={busy === f.code}
                onAdd={(group, label) => void act(f.code, () => addCheckedFacility(f.code, group), T.ADDED(f.code, label))}
                onIgnore={() => void act(f.code, () => ignoreCheckedFacility(f.code), T.IGNORED(f.code))} />
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-900"><Ban className="size-4 text-crit" />{T.DISABLED_TITLE(check.disabled.length)}</h3>
          <p className="text-ink-600">{T.DISABLED_SUB}</p>
          {!check.disabled.length && <p className="text-ink-400">{T.NONE}</p>}
          <ul className="divide-y divide-line rounded-[var(--radius)] border border-line">
            {check.disabled.map((f) => (
              <li key={f.code} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <Building2 className="size-4 shrink-0 text-ink-400" />
                <span className="font-mono text-[12px] font-semibold text-ink-900">{f.code}</span>
                {f.group && <Badge tone="info">{f.group}</Badge>}
                {f.exported && <Badge tone="neutral">{T.EXPORTED}</Badge>}
                <span className="flex-1" />
                {canEdit && (
                  <Button disabled={busy !== null} onClick={() => void act(f.code, () => stopCheckedFacility(f.code), T.STOPPED(f.code))}>
                    {busy === f.code ? T.SAVING : T.STOP}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Drawer>
  )
}

function NewRow({ f, buckets, canEdit, busy, onAdd, onIgnore }: {
  f: CheckedNewFacility; buckets: FacilityCheck['buckets']; canEdit: boolean; busy: boolean
  onAdd: (group: string, label: string) => void; onIgnore: () => void
}) {
  const guessLabel = buckets.find((b) => b.group === f.guess)?.label ?? ''
  const [label, setLabel] = useState(guessLabel)
  const bucket = buckets.find((b) => b.label === label)
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <Building2 className="size-4 shrink-0 text-ink-400" />
      <div className="min-w-[180px] flex-1">
        <div className="font-mono text-[12px] font-semibold text-ink-900">{f.code}</div>
        <div className="text-[11.5px] text-ink-600">
          {f.name ?? T.NO_NAME}{!f.inMaster && <> · {T.NOT_IN_MASTER}</>}{f.guess && <> · {T.SUGGESTED(guessLabel)}</>}
        </div>
      </div>
      {canEdit && (
        <>
          <div className="w-[150px]"><SelectBox value={label} options={buckets.map((b) => b.label)} placeholder={T.PICK} onChange={setLabel} /></div>
          <Button variant="primary" disabled={busy || !bucket} onClick={() => bucket && onAdd(bucket.group, bucket.label)}>{busy ? T.SAVING : T.ADD}</Button>
          <Button variant="ghost" disabled={busy} onClick={onIgnore}>{T.NOT_STOCK}</Button>
        </>
      )}
    </li>
  )
}
