import { useMemo, useState } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Drawer, PillToggle } from '../../../components/ui'
import { DateInput, inputCls, textareaCls } from '../../../components/kit'
import { SelectBox } from '../../../components/pickers'
import { createTransfer, editTransfer, getTransfer, nextReference, type D2cDetail, type D2cOptions, type D2cSku } from '../../../api/d2cTransfers'
import { D2C_DEFAULT_PRIORITY, D2C_ERROR, D2C_PRIORITIES, D2C_REMARKS_MAX, D2C_TEXT } from '../../../constants/d2cTransfers'
import { D2C_KEY } from '../../../lib/liveTransfers'
import { ErrorBox, WarnBox } from './bits'
import { addDays, errorOf, money, num, todayIst } from './format'
import { SkuSearch } from './SkuSearch'

/*
 * "New internal transfer" / edit a draft (PRD creation flow B, plan 5.2 / 5.3): dispatch warehouse, channel, location
 * (its receiving warehouse shown), type, PO date (today), expiry (date + the default days), priority (P2), remarks, SKU
 * lines (picker + qty, running lines / units, GMV = MRP x qty, PO value = 15% of MRP x qty) and the reference ID the save
 * would take ("may change on save"). Route warnings come from the options (vendor / customer / channel code missing).
 * A sender + location with 2+ active Uniware channels (2026-11-03) shows a "Uniware channel" select; the chosen route
 * id is saved with the transfer.
 * Save draft = POST /d2c-transfers, or PATCH /:id with the edit token (409 D2C_STALE: someone changed it meanwhile).
 */

type Line = { key: number; skuCode: string; skuName: string | null; mrp: number | null; poUnit: number | null; qty: string }
type Form = { senderId: string; channel: string; locationId: string; routeId: string; type: string; poDate: string; expiry: string; expiryTouched: boolean; priority: string; remarks: string; lines: Line[] }

let lineKey = 1
const blankLine = (): Line => ({ key: lineKey++, skuCode: '', skuName: null, mrp: null, poUnit: null, qty: '' })
const qtyOf = (l: Line) => (/^\d+$/.test(l.qty.trim()) ? Number(l.qty.trim()) : NaN)

const fromDetail = (d: D2cDetail): Form => ({
  senderId: d.sender.id === null ? '' : String(d.sender.id), channel: d.channel ?? '', locationId: d.locationId ?? '', routeId: d.routeId === null ? '' : String(d.routeId), type: d.type ?? '',
  poDate: d.poDate ?? todayIst(), expiry: d.expiryDate ?? '', expiryTouched: true, priority: d.priority ?? D2C_DEFAULT_PRIORITY, remarks: d.remarks ?? '',
  lines: d.lines.filter((l) => !l.removed).map((l) => ({
    key: lineKey++, skuCode: l.skuCode ?? '', skuName: l.skuName, mrp: l.mrp, poUnit: l.qty ? Number(l.poValue ?? 0) / l.qty : null, qty: String(l.updatedQty),
  })),
})
const blankForm = (o: D2cOptions): Form => ({
  senderId: '', channel: o.channels[0] ?? '', locationId: '', routeId: '', type: o.defaults.type, poDate: o.defaults.poDate || todayIst(),
  expiry: addDays(o.defaults.poDate || todayIst(), o.defaults.expiryDays), expiryTouched: false, priority: o.defaults.priority || D2C_DEFAULT_PRIORITY, remarks: '',
  lines: [blankLine()],
})

export function TransferFormDrawer({ options, detail, onClose, onSaved }: {
  options: D2cOptions; detail: D2cDetail | null; onClose: () => void; onSaved: (d: D2cDetail) => void
}) {
  const qc = useQueryClient()
  const [base, setBase] = useState<D2cDetail | null>(detail)
  const [f, setF] = useState<Form>(() => (detail ? fromDetail(detail) : blankForm(options)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ReturnType<typeof errorOf> | null>(null)
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }))
  const setLine = (key: number, patch: Partial<Line>) => setF((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }))

  const sender = options.senders.find((s) => String(s.id) === f.senderId) ?? null
  const locations = useMemo(() => options.locations.find((c) => c.channel === f.channel)?.locations ?? [], [options, f.channel])
  const location = locations.find((l) => l.id === f.locationId) ?? null
  const locLabel = (l: (typeof locations)[number]) => `${l.location ?? l.id} → ${l.receivingCode}${l.isActive ? '' : ' (inactive)'}`
  // a sender + location may have 2+ Uniware channels (one route row each): then Ops pick one
  const laneRoutes = location && sender ? location.routes.filter((r) => r.senderId === sender.id) : []
  const activeRoutes = laneRoutes.filter((r) => r.isActive)
  const pickChannel = activeRoutes.length > 1
  const route = pickChannel ? activeRoutes.find((r) => String(r.routeId) === f.routeId) ?? null : activeRoutes[0] ?? laneRoutes[0] ?? null
  const channelLabel = (r: (typeof laneRoutes)[number]) => r.uniwareChannelCode ?? `route ${r.routeId} (no channel code)`

  // what the save would say (the backend checks again)
  const blockers: string[] = []
  const warnings: string[] = []
  if (sender && location) {
    if (location.receivingFacilityId === sender.id) blockers.push(D2C_TEXT.SAME_WH)
    else if (!laneRoutes.length) blockers.push(D2C_TEXT.NO_ROUTE(sender.code, location.location ?? location.id))
    else if (!route) blockers.push(D2C_TEXT.PICK_CHANNEL)
    else {
      if (!route.isActive) blockers.push(D2C_TEXT.ROUTE_OFF)
      if (route.missingVendor) warnings.push(D2C_TEXT.MISSING_VENDOR)
      if (route.missingCustomer) warnings.push(D2C_TEXT.MISSING_CUSTOMER)
      if (route.missingChannel) warnings.push(D2C_TEXT.MISSING_CHANNEL)
    }
    if (!location.receivingUsable) warnings.push(D2C_TEXT.RECEIVING_OFF)
  }
  const dupes = new Set(f.lines.map((l) => l.skuCode.toLowerCase()).filter((c, i, a) => c && a.indexOf(c) !== i))
  if (dupes.size) warnings.push(`Same SKU on more than one line (${[...dupes].join(', ')}): the save merges them and sums the qty`)
  if (f.expiry && f.poDate && f.expiry < f.poDate) blockers.push('The expiry must not be before the PO date')

  const filled = f.lines.filter((l) => l.skuCode)
  const badQty = filled.some((l) => !(qtyOf(l) > 0))
  const units = filled.reduce((s, l) => s + (qtyOf(l) > 0 ? qtyOf(l) : 0), 0)
  const gmv = filled.reduce((s, l) => s + (qtyOf(l) > 0 && l.mrp ? l.mrp * qtyOf(l) : 0), 0)
  const poValue = filled.reduce((s, l) => s + (qtyOf(l) > 0 && l.poUnit !== null ? l.poUnit * qtyOf(l) : 0), 0)
  const ready = !!sender && !!f.channel && !!location && !!f.type && !!f.poDate && !!f.expiry && filled.length > 0 && !badQty && !blockers.length

  // reference preview: only for a new transfer, or when the edit changes what it is made of
  const refChanges = !base || base.locationId !== f.locationId || base.poDate !== f.poDate || base.type !== f.type
  const ref = useQuery({
    queryKey: [D2C_KEY, 'next-reference', f.locationId, f.poDate, f.type],
    queryFn: ({ signal }) => nextReference({ locationId: f.locationId, poDate: f.poDate, type: f.type }, signal),
    enabled: !!f.locationId && !!f.poDate && !!f.type && refChanges, retry: false,
  })

  const changePoDate = (v: string) => set({ poDate: v, ...(f.expiryTouched || !v ? {} : { expiry: addDays(v, options.defaults.expiryDays) }) })

  const save = async () => {
    if (!sender || !location) return
    setBusy(true)
    setError(null)
    const header = {
      senderId: sender.id, channel: f.channel, locationId: location.id, poDate: f.poDate, priority: f.priority, type: f.type, expiry: f.expiry, remarks: f.remarks.trim(),
      ...(route ? { routeId: route.routeId } : {}),
    }
    const lines = filled.map((l) => ({ skuCode: l.skuCode, qty: qtyOf(l) }))
    try {
      const saved = base ? await editTransfer(base.uid, base.editToken, header, lines) : await createTransfer(header, lines)
      void qc.invalidateQueries({ queryKey: [D2C_KEY, 'list'] })
      void qc.invalidateQueries({ queryKey: [D2C_KEY, 'counts'] })
      qc.setQueryData([D2C_KEY, 'detail', saved.uid], saved)
      onSaved(saved)
    } catch (e) {
      setError(errorOf(e))
    } finally {
      setBusy(false)
    }
  }
  const reload = async () => {
    if (!base) return
    const fresh = await getTransfer(base.uid)
    qc.setQueryData([D2C_KEY, 'detail', base.uid], fresh)
    setBase(fresh)
    setF(fromDetail(fresh))
    setError(null)
  }

  const label = 'mb-1 block text-[12px] font-medium text-ink-600'
  return (
    <Drawer open wide onClose={onClose} title={base ? `Edit ${base.transferCode}` : 'New internal transfer'}
      sub={base ? <>Draft · reference <span className="font-mono">{base.reference}</span></> : 'Saved as a Draft (source: form)'}
      footer={(close) => <><Button onClick={close}>Cancel</Button><Button variant="primary" disabled={!ready || busy} onClick={() => void save()}>{busy ? 'Saving…' : base ? 'Save changes' : 'Save draft'}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <div>
            <span className={label}>Dispatch warehouse *</span>
            <SelectBox value={sender?.code ?? ''} options={options.senders.map((s) => s.code)} placeholder="Select the sending warehouse" allowEmpty={false}
              onChange={(code) => set({ senderId: String(options.senders.find((s) => s.code === code)?.id ?? ''), routeId: '' })} />
          </div>
          <div>
            <span className={label}>Channel *</span>
            <SelectBox value={f.channel} options={options.channels} allowEmpty={false} onChange={(v) => set({ channel: v, locationId: v === f.channel ? f.locationId : '', routeId: v === f.channel ? f.routeId : '' })} />
          </div>
          <div>
            <span className={label}>Location (receiving warehouse) *</span>
            <SelectBox value={location ? locLabel(location) : ''} options={locations.map(locLabel)} placeholder={locations.length ? 'Select the location' : 'No transfer location for this channel'} allowEmpty={false}
              onChange={(v) => set({ locationId: locations.find((l) => locLabel(l) === v)?.id ?? '', routeId: '' })} />
            {location && <div className="mt-1 text-[11.5px] text-ink-600">Receiving: <span className="font-mono">{location.receivingCode}</span>{location.poPrefix && <> · PO prefix <span className="font-mono">{location.poPrefix}</span></>}</div>}
          </div>
          {pickChannel && (
            <div>
              <span className={label}>Uniware channel *</span>
              <SelectBox value={route ? channelLabel(route) : ''} options={activeRoutes.map(channelLabel)} placeholder="Pick the Uniware channel" allowEmpty={false}
                onChange={(v) => set({ routeId: String(activeRoutes.find((r) => channelLabel(r) === v)?.routeId ?? '') })} />
              <div className="mt-1 text-[11.5px] text-ink-600">This route has {activeRoutes.length} Uniware channels</div>
            </div>
          )}
          <div>
            <span className={label}>Type *</span>
            <SelectBox value={f.type} options={options.types} allowEmpty={false} onChange={(v) => set({ type: v })} />
          </div>
          <div>
            <span className={label}>PO date *</span>
            <DateInput value={f.poDate} onChange={changePoDate} />
          </div>
          <div>
            <span className={label}>PO expiry *</span>
            <DateInput value={f.expiry} onChange={(v) => set({ expiry: v, expiryTouched: true })} />
            {!f.expiryTouched && <div className="mt-1 text-[11.5px] text-ink-400">PO date + {options.defaults.expiryDays} days</div>}
          </div>
          <div>
            <span className={label}>Priority *</span>
            <PillToggle value={f.priority} onChange={(v) => set({ priority: v })} options={D2C_PRIORITIES.map((p) => ({ key: p, label: p }))} />
          </div>
          <div>
            <span className={label}>Reference ID</span>
            <div className="flex h-9 items-center gap-2 rounded-[var(--radius)] border border-dashed border-line bg-canvas px-3 text-[13px]">
              {!refChanges && base ? <span className="font-mono">{base.reference}</span>
                : !f.locationId ? <span className="text-ink-400">Pick a location</span>
                : ref.isFetching ? <span className="text-ink-400">Working it out…</span>
                : ref.data ? <><span className="min-w-0 truncate font-mono">{ref.data.reference}</span><span className="ml-auto shrink-0 text-[11px] text-ink-400">{D2C_TEXT.REFERENCE_NOTE}</span></>
                : <span className="truncate text-crit">{ref.error?.message ?? '—'}</span>}
            </div>
            {base && refChanges && <div className="mt-1 text-[11.5px] text-warn">Location, PO date or type changed: a new reference is taken on save (the old one is not reused)</div>}
          </div>
          <div className="sm:col-span-2">
            <span className={label}>Remarks</span>
            <textarea value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} maxLength={D2C_REMARKS_MAX} placeholder="Optional" className={textareaCls} />
          </div>
        </div>

        {!!blockers.length && <ErrorBox text={blockers.join(' · ')} />}
        <WarnBox items={warnings} />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[13px] font-semibold text-ink-900">SKU lines</div>
            <div className="tnum text-[12px] text-ink-600">{filled.length} line{filled.length === 1 ? '' : 's'} · {num(units)} units · GMV {money(Math.round(gmv * 100) / 100)} · PO value {money(Math.round(poValue * 100) / 100)}</div>
          </div>
          <div className="space-y-2">
            {f.lines.map((l, i) => {
              const q = qtyOf(l)
              const qtyBad = !!l.skuCode && !(q > 0)
              return (
                <div key={l.key} className="grid grid-cols-[22px_minmax(0,1fr)_90px_32px] items-center gap-2 sm:grid-cols-[22px_minmax(0,1fr)_100px_110px_32px]">
                  <span className="tnum text-right text-[12px] text-ink-400">{i + 1}</span>
                  <SkuSearch value={l.skuCode} label={l.skuName}
                    onPick={(s: D2cSku) => setLine(l.key, { skuCode: s.code, skuName: s.name, mrp: s.mrp, poUnit: s.soUnitPrice })} />
                  <input value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" placeholder="Qty"
                    className={`${inputCls} tnum text-right ${qtyBad ? '!border-crit' : ''}`} />
                  <span className="tnum hidden text-right text-[12px] text-ink-600 sm:block" title="GMV = MRP x qty">{q > 0 && l.mrp ? money(Math.round(l.mrp * q * 100) / 100) : '—'}</span>
                  <button type="button" aria-label="Remove line" title="Remove line" disabled={f.lines.length === 1 && !l.skuCode}
                    onClick={() => setF((x) => ({ ...x, lines: x.lines.length === 1 ? [blankLine()] : x.lines.filter((y) => y.key !== l.key) }))}
                    className="rounded-md p-1.5 text-ink-400 hover:bg-alt hover:text-crit disabled:opacity-30"><Trash2 className="size-4" /></button>
                </div>
              )
            })}
          </div>
          <button type="button" onClick={() => setF((x) => ({ ...x, lines: [...x.lines, blankLine()] }))}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-semibold text-primary hover:bg-primary-soft/60"><Plus className="size-3.5" /> Add line</button>
          <p className="mt-1 text-[11.5px] text-ink-400">Prices: GMV = MRP x qty; PO value = 15% of MRP x qty (what the sale order sends).</p>
        </div>

        {error && (error.code === D2C_ERROR.STALE
          ? <div className="space-y-2"><ErrorBox text={D2C_TEXT.STALE} /><Button icon={<RotateCcw className="size-3.5" />} onClick={() => void reload()}>Load the latest values</Button></div>
          : <ErrorBox text={error.message} problems={error.problems} />)}
      </div>
    </Drawer>
  )
}
