import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Lock } from 'lucide-react'
import { ApiError } from '../api/client'
import { addChannel, addChannelLocation, addChannelSku, addPepSku, editMasterRow, getMasterFormOptions, type EditConflict, type FieldProblem, type MasterFormOptions } from '../api/masters'
import { ADD_RULE, ADD_TEXT, EDIT_TEXT, HISTORY_TEXT, MASTER_LOG_TYPE } from '../constants/masters'
import { Button, Drawer } from './ui'
import { inputCls } from './kit'

/*
 * Add forms of the Masters pages (2026-10-27): every field is required; Save stays off until all are filled and pass
 * the same format checks as the backend. The backend checks again (and for duplicates); its field problems show under
 * the fields. Admin / developer only (the page shows the button to them only).
 * Edit (2026-10-28): the same drawer with the row's values; keys locked (greyed, lock icon); only changed fields are
 * checked and sent, with the values the person saw (`original`) so a change by someone else meanwhile is refused (409)
 * and shown with "Use the latest values". Warehouses have Edit only (no Add form).
 */

export type AddMaster = 'pep' | 'channelSku' | 'customer' | 'chWh'
export type EditMaster = AddMaster | 'pepWh'

type Kind = 'text' | 'number' | 'select' | 'textarea' | 'active' | 'sku' | 'list'
type Field = {
  key: string; label: string; kind: Kind; mono?: boolean; wide?: boolean; hint?: string
  rule?: { re: RegExp; rule: string }; upper?: boolean
  /** Edit: a key, shown but not editable. */
  locked?: boolean
  /** number: allowed range (default: above 0) and whole numbers only */
  range?: { min: number; max: number }; int?: boolean
  options?: (o: MasterFormOptions) => { value: string; label: string }[]
}

const pick = (values: readonly string[]) => () => values.map((v) => ({ value: v, label: v }))
const channelOpts = (o: MasterFormOptions) => o.channels.map((c) => ({ value: String(c.id), label: c.active ? c.name : `${c.name} (inactive)` }))

const FORMS: Record<AddMaster, { title: string; fields: Field[]; send: (b: Record<string, unknown>) => Promise<unknown> }> = {
  pep: {
    title: 'Add PEP SKU', send: addPepSku,
    fields: [
      { key: 'pepCode', label: 'PEP SKU code', kind: 'text', mono: true },
      { key: 'productName', label: 'Product name (Uniware)', kind: 'text', wide: true },
      { key: 'brand', label: 'Brand', kind: 'text' },
      { key: 'productType', label: 'SKU type', kind: 'select', options: (o) => pick(o.productTypes)() },
      { key: 'mrp', label: 'MRP (₹)', kind: 'number' },
      { key: 'gstTaxType', label: 'GST %', kind: 'select', options: (o) => pick(o.gstRates)() },
      { key: 'eanCode', label: 'EAN', kind: 'text', mono: true, rule: ADD_RULE.EAN },
      { key: 'hsnCode', label: 'HSN code', kind: 'text', mono: true, rule: ADD_RULE.HSN },
      { key: 'lengthMm', label: 'Length (mm)', kind: 'number' },
      { key: 'widthMm', label: 'Width (mm)', kind: 'number' },
      { key: 'heightMm', label: 'Height (mm)', kind: 'number' },
      { key: 'weightG', label: 'Weight (g)', kind: 'number' },
      { key: 'shelfLife', label: 'Shelf life (days)', kind: 'number', range: { min: 1, max: 3650 }, int: true },
      { key: 'isActive', label: 'Status', kind: 'active' },
    ],
  },
  channelSku: {
    title: 'Map channel SKU', send: addChannelSku,
    fields: [
      { key: 'channelId', label: 'Channel', kind: 'select', options: channelOpts },
      { key: 'channelCode', label: 'Channel SKU code', kind: 'text', mono: true },
      { key: 'pepCode', label: 'PEP SKU code', kind: 'sku', mono: true, hint: 'Picking it fills name, brand, MRP and EAN (still editable)' },
      { key: 'productName', label: 'Product name', kind: 'text', wide: true },
      { key: 'brand', label: 'Brand', kind: 'text' },
      { key: 'mrp', label: 'MRP (₹)', kind: 'number' },
      { key: 'marginPercent', label: 'Margin %', kind: 'number', range: { min: 0, max: 100 } },
      { key: 'rateAfterMargin', label: 'Rate after margin (₹)', kind: 'number', hint: 'Filled from MRP and margin (editable)' },
      { key: 'eanCode', label: 'EAN', kind: 'text', mono: true, rule: ADD_RULE.EAN },
    ],
  },
  customer: {
    title: 'Add channel', send: addChannel,
    fields: [
      { key: 'displayName', label: 'Channel name', kind: 'text' },
      { key: 'slug', label: 'Slug', kind: 'text', mono: true, rule: ADD_RULE.SLUG, hint: 'Filled from the name' },
      { key: 'aliases', label: 'Other names in PO emails (comma separated)', kind: 'list', wide: true, hint: 'How the channel is written in PO emails and files' },
      { key: 'isActive', label: 'Status', kind: 'active' },
    ],
  },
  chWh: {
    title: 'Add channel location', send: addChannelLocation,
    fields: [
      { key: 'channelId', label: 'Channel', kind: 'select', options: channelOpts },
      { key: 'locationCode', label: 'Location code (DC / FC)', kind: 'text', mono: true },
      { key: 'uniwareCustomerCode', label: 'Uniware customer code', kind: 'text', mono: true },
      { key: 'uniwareChannelCode', label: 'Uniware channel code', kind: 'text', mono: true },
      { key: 'facilityCode', label: 'Served by (PEP facility)', kind: 'select', mono: true, options: (o) => o.facilities.map((f) => ({ value: f.code, label: f.name ? `${f.code} · ${f.name}` : f.code })) },
      { key: 'consigneeName', label: 'Consignee name', kind: 'text' },
      { key: 'consigneeGstNumber', label: 'Consignee GSTIN', kind: 'text', mono: true, rule: ADD_RULE.GSTIN, upper: true },
      { key: 'consigneeState', label: 'Consignee state', kind: 'select', options: (o) => pick(o.states)() },
      { key: 'consigneePinCode', label: 'Consignee pincode', kind: 'text', mono: true, rule: ADD_RULE.PIN },
      { key: 'shippingAddress', label: 'Shipping address', kind: 'textarea', wide: true },
      { key: 'billingAddress', label: 'Billing address', kind: 'textarea', wide: true },
      { key: 'buyerType', label: 'Buyer type', kind: 'select', options: (o) => pick(o.buyerTypes)() },
      { key: 'buyerGstNumber', label: 'Buyer GSTIN', kind: 'text', mono: true, rule: ADD_RULE.GSTIN, upper: true },
      { key: 'buyerState', label: 'Buyer state', kind: 'select', options: (o) => pick(o.states)() },
      { key: 'buyerPinCode', label: 'Buyer pincode', kind: 'text', mono: true, rule: ADD_RULE.PIN },
      { key: 'tallyLedgerName', label: 'Tally ledger', kind: 'text' },
      { key: 'appointmentChannel', label: 'Appointment needed', kind: 'select', options: (o) => pick(o.appointment)() },
    ],
  },
}

/** Edit forms: the Add fields (status is switched from the row instead), keys locked, plus columns only Edit has. */
const lock = (fields: Field[], keys: string[]): Field[] => fields.filter((f) => f.kind !== 'active').map((f) => (keys.includes(f.key) ? { ...f, locked: true } : f))
const EDIT_FORMS: Record<EditMaster, { title: string; fields: Field[] }> = {
  pep: { title: 'Edit PEP SKU', fields: lock(FORMS.pep.fields, ['pepCode']) },
  channelSku: { title: 'Edit channel SKU', fields: lock(FORMS.channelSku.fields, ['channelId', 'channelCode']) },
  customer: {
    title: 'Edit channel',
    fields: lock([
      ...FORMS.customer.fields,
      { key: 'channelType', label: 'Channel type', kind: 'select', options: (o) => pick(o.buyerTypes)() },
      { key: 'expiryDaysMin', label: 'Expiry days accepted: from', kind: 'number', range: { min: 0, max: 3650 }, int: true },
      { key: 'expiryDaysMax', label: 'Expiry days accepted: to', kind: 'number', range: { min: 0, max: 3650 }, int: true },
    ], ['displayName', 'slug']),
  },
  chWh: { title: 'Edit channel location', fields: lock([...FORMS.chWh.fields, { key: 'city', label: 'City', kind: 'text' }], ['channelId', 'locationCode']) },
  pepWh: {
    title: 'Edit warehouse',
    fields: [
      { key: 'code', label: 'Facility code (Unicommerce)', kind: 'text', mono: true, locked: true },
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'entity', label: 'Entity', kind: 'text' },
      { key: 'pickupLocation', label: 'Location', kind: 'text' },
      { key: 'state', label: 'State', kind: 'text' },
      { key: 'facilityType', label: 'Type', kind: 'text' },
      { key: 'billToGstin', label: 'Bill-to GSTIN', kind: 'text', mono: true, rule: ADD_RULE.GSTIN, upper: true },
      { key: 'shipToGstin', label: 'Ship-to GSTIN', kind: 'text', mono: true, rule: ADD_RULE.GSTIN, upper: true },
      { key: 'remarks', label: 'Remarks', kind: 'textarea', wide: true },
    ],
  },
}

const slugOf = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const round2 = (n: number) => Math.round(n * 100) / 100

/** The problem of one field, or '' when it is fine (the same rules as the backend). */
const problemOf = (f: Field, raw: string): string => {
  const v = raw.trim()
  if (!v) return ADD_TEXT.REQUIRED
  if (f.kind === 'number') {
    const n = Number(v.replace(/,/g, ''))
    if (!Number.isFinite(n)) return ADD_TEXT.ABOVE_ZERO
    if (f.range ? n < f.range.min || n > f.range.max : n <= 0) return f.range ? `From ${f.range.min} to ${f.range.max}` : ADD_TEXT.ABOVE_ZERO
    if (f.int && !Number.isInteger(n)) return 'A whole number'
  }
  if (f.rule && !f.rule.re.test(f.upper ? v.toUpperCase() : v)) return `Must be ${f.rule.rule}`
  return ''
}

/** A form value as the API takes it (`empty` for a blank one: null for the values seen, so "was empty" matches). */
const valueOf = (f: Field, value: string, empty: unknown = undefined): unknown => {
  const raw = value.trim()
  if (!raw && empty !== undefined) return empty
  if (f.kind === 'number') return Number(raw.replace(/,/g, ''))
  if (f.kind === 'active') return raw === 'true'
  if (f.kind === 'list') return raw.split(',').map((x) => x.trim()).filter(Boolean)
  if (f.key === 'channelId') return Number(raw)
  return f.upper ? raw.toUpperCase() : raw
}

export function MasterAddDrawer({ master, defaultChannelId, edit, onClose, onAdded }: {
  master: EditMaster; defaultChannelId?: string
  /** Edit this row (its DB id and its values by form key) instead of adding one. */
  edit?: { id: string; values: Record<string, string> }
  onClose: () => void; onAdded: (message: string) => void
}) {
  const isEdit = !!edit
  const form = isEdit ? EDIT_FORMS[master] : { ...FORMS[master as AddMaster] }
  const opts = useQuery({ queryKey: ['masters', 'form-options'], queryFn: ({ signal }) => getMasterFormOptions(signal) })
  const [initial, setInitial] = useState<Record<string, string>>(() => ({ ...(edit?.values ?? {}) }))
  const [conflicts, setConflicts] = useState<EditConflict[]>([])
  const [v, setV] = useState<Record<string, string>>(() => edit ? { ...edit.values } : ({ ...(defaultChannelId ? { channelId: defaultChannelId } : {}), ...(form.fields.some((f) => f.kind === 'active') ? { isActive: 'true' } : {}) }))
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [server, setServer] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState('')
  const [saving, setSaving] = useState(false)
  const [slugEdited, setSlugEdited] = useState(false)
  const [rateEdited, setRateEdited] = useState(false)
  // one optional remark per save (user, 2026-10-28), kept in the row's History
  const [remark, setRemark] = useState('')

  // Edit: only the changed fields are checked and sent (old rows may have empty fields the person does not touch)
  const changedKeys = useMemo(() => (isEdit ? form.fields.filter((f) => !f.locked && (v[f.key] ?? '').trim() !== (initial[f.key] ?? '').trim()).map((f) => f.key) : []), [isEdit, form, v, initial])
  const problems = useMemo(() => Object.fromEntries(form.fields.filter((f) => !isEdit || changedKeys.includes(f.key)).map((f) => [f.key, problemOf(f, v[f.key] ?? '')])), [form, v, isEdit, changedKeys])
  const left = Object.values(problems).filter(Boolean).length
  const skuByCode = useMemo(() => new Map((opts.data?.pepSkus ?? []).map((s) => [s.code.toLowerCase(), s])), [opts.data])

  const set = (key: string, value: string) => {
    const next = { ...v, [key]: value }
    // Add channel: slug and other names follow the name until edited
    if (!isEdit && master === 'customer' && key === 'displayName') {
      if (!slugEdited) next.slug = slugOf(value)
      if (!touched.aliases) next.aliases = [...new Set([value.trim(), slugOf(value)].filter(Boolean))].join(', ')
    }
    if (key === 'slug') setSlugEdited(true)
    // Map channel SKU: the PEP SKU fills its details; rate = MRP x (1 - margin) until edited
    if (master === 'channelSku' && key === 'pepCode') {
      const s = skuByCode.get(value.trim().toLowerCase())
      if (s) Object.assign(next, { productName: s.name ?? next.productName ?? '', brand: s.brand ?? next.brand ?? '', mrp: s.mrp !== null ? String(s.mrp) : next.mrp ?? '', eanCode: s.ean ?? next.eanCode ?? '' })
    }
    if (master === 'channelSku' && key === 'rateAfterMargin') setRateEdited(true)
    if (master === 'channelSku' && !rateEdited && key !== 'rateAfterMargin') {
      const mrp = Number(next.mrp), margin = Number(next.marginPercent)
      if (next.mrp && next.marginPercent !== undefined && next.marginPercent !== '' && Number.isFinite(mrp) && Number.isFinite(margin)) next.rateAfterMargin = String(round2(mrp * (1 - margin / 100)))
    }
    setV(next)
    setServer((s) => ({ ...s, [key]: '' }))
  }

  const body = () => ({
    ...Object.fromEntries(form.fields.map((f) => [f.key, valueOf(f, v[f.key] ?? '')])),
    ...(remark.trim() ? { remark: remark.trim() } : {}),
  })
  const fieldOf = (key: string) => form.fields.find((f) => f.key === key)!

  const saveEdit = async () => {
    if (!edit || !changedKeys.length || left || saving) return
    setSaving(true)
    setFailed('')
    setConflicts([])
    try {
      const res = await editMasterRow(MASTER_LOG_TYPE[master], edit.id, {
        changes: Object.fromEntries(changedKeys.map((k) => [k, valueOf(fieldOf(k), v[k] ?? '')])),
        original: Object.fromEntries(changedKeys.map((k) => [k, valueOf(fieldOf(k), initial[k] ?? '', null)])),
        ...(remark.trim() ? { remark: remark.trim() } : {}),
      })
      onAdded(EDIT_TEXT.SAVED(form.title.replace(/^Edit /, ''), res.changed.length))
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && Array.isArray(e.details)) setConflicts(e.details as EditConflict[])
      else {
        const details = e instanceof ApiError && Array.isArray(e.details) ? (e.details as FieldProblem[]) : []
        if (details.length) {
          setServer(Object.fromEntries(details.map((d) => [d.field, d.message])))
          setFailed(`${details.length} field${details.length === 1 ? '' : 's'} refused: see below`)
        } else setFailed(e instanceof ApiError ? e.message : String(e))
      }
    } finally {
      setSaving(false)
    }
  }
  /** Take what the row is now as "seen"; the person's own edits stay in the form. */
  const takeLatest = () => {
    setInitial((i) => ({ ...i, ...Object.fromEntries(conflicts.map((c) => [c.field, c.now === null ? '' : String(c.now)])) }))
    setConflicts([])
  }

  const save = async () => {
    setTouched(Object.fromEntries(form.fields.map((f) => [f.key, true])))
    if (isEdit) return saveEdit()
    if (left || saving) return
    setSaving(true)
    setFailed('')
    try {
      const res = (await FORMS[master as AddMaster].send(body())) as { channel?: string }
      const name = (v.displayName ?? v.pepCode ?? v.channelCode ?? v.locationCode ?? '').trim()
      onAdded(`${form.title.replace(/^Add |^Map /, '')} ${name} added.${res.channel ? ` ${ADD_TEXT.RECHECK(res.channel)}` : ''}${master === 'customer' ? ` ${ADD_TEXT.NEW_CHANNEL}` : ''}`)
    } catch (e) {
      const details = e instanceof ApiError && Array.isArray(e.details) ? (e.details as FieldProblem[]) : []
      if (details.length) {
        setServer(Object.fromEntries(details.map((d) => [d.field, d.message])))
        setFailed(`${details.length} field${details.length === 1 ? '' : 's'} refused: see below`)
      } else setFailed(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const control = (f: Field) => {
    const value = v[f.key] ?? ''
    const cls = `${inputCls} ${f.mono ? 'font-mono' : ''}`
    const blur = () => setTouched((t) => ({ ...t, [f.key]: true }))
    if (f.locked) {
      const shown = f.kind === 'select' && opts.data && f.options ? (f.options(opts.data).find((o) => o.value === value)?.label ?? value) : value
      return <input value={shown} readOnly disabled title={EDIT_TEXT.LOCKED} className={`${cls} cursor-not-allowed bg-alt text-ink-600`} />
    }
    if (f.kind === 'active') {
      return <select value={value} onChange={(e) => set(f.key, e.target.value)} onBlur={blur} className={cls}><option value="true">Active</option><option value="false">Inactive</option></select>
    }
    if (f.kind === 'select') {
      const list = opts.data && f.options ? f.options(opts.data) : []
      return (
        <select value={value} onChange={(e) => set(f.key, e.target.value)} onBlur={blur} className={cls}>
          <option value="">{opts.isPending ? 'Loading…' : 'Select…'}</option>
          {list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    }
    if (f.kind === 'sku') {
      return (
        <>
          <input list="master-add-skus" value={value} onChange={(e) => set(f.key, e.target.value)} onBlur={blur} className={cls} placeholder="Type to search PEP SKUs" />
          <datalist id="master-add-skus">{(opts.data?.pepSkus ?? []).map((s) => <option key={s.code} value={s.code}>{s.name ?? ''}</option>)}</datalist>
        </>
      )
    }
    if (f.kind === 'textarea') return <textarea rows={3} value={value} onChange={(e) => set(f.key, e.target.value)} onBlur={blur} className={cls} />
    return <input inputMode={f.kind === 'number' ? 'decimal' : undefined} value={value} onChange={(e) => set(f.key, e.target.value)} onBlur={blur} className={cls} />
  }

  return (
    <Drawer open onClose={onClose} title={form.title} sub={isEdit ? EDIT_TEXT.LOCKED : ADD_TEXT.ALL_REQUIRED}
      footer={isEdit ? <>
        <span className={`mr-auto text-[12px] ${left ? 'text-crit' : changedKeys.length ? 'text-ok' : 'text-ink-400'}`}>{left ? ADD_TEXT.LEFT(left) : changedKeys.length ? EDIT_TEXT.CHANGED(changedKeys.length) : EDIT_TEXT.NO_CHANGES}</span>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => void save()} disabled={!changedKeys.length || !!left || saving || !!conflicts.length}>{saving ? 'Saving…' : 'Save changes'}</Button>
      </> : <>
        <span className={`mr-auto text-[12px] ${left ? 'text-ink-400' : 'text-ok'}`}>{left ? ADD_TEXT.LEFT(left) : 'Ready to add'}</span>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => void save()} disabled={!!left || saving || opts.isPending}>{saving ? 'Adding…' : 'Add'}</Button>
      </>}>
      {opts.error && <div className="mb-3 flex items-center gap-2 rounded-md border border-crit/30 bg-crit-soft px-3 py-2 text-[12px] text-crit"><AlertTriangle className="size-4" />Could not load the form's lists: {opts.error instanceof ApiError ? opts.error.message : String(opts.error)}</div>}
      {failed && <div className="mb-3 flex items-center gap-2 rounded-md border border-crit/30 bg-crit-soft px-3 py-2 text-[12px] text-crit"><AlertTriangle className="size-4" />{failed}</div>}
      {conflicts.length > 0 && (
        <div className="mb-3 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-[12px] text-ink-900">
          <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-warn" />{EDIT_TEXT.CONFLICT}</div>
          <ul className="mb-2 ml-6 list-disc">{conflicts.map((c) => <li key={c.field}>{form.fields.find((f) => f.key === c.field)?.label ?? c.field}: now <b>{c.now === null || c.now === '' ? 'empty' : String(c.now)}</b></li>)}</ul>
          <Button onClick={takeLatest}>{EDIT_TEXT.USE_LATEST}</Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {form.fields.map((f) => {
          const msg = server[f.key] || (touched[f.key] || changedKeys.includes(f.key) ? problems[f.key] : '')
          return (
            <label key={f.key} className={f.wide || f.kind === 'textarea' ? 'col-span-2' : ''}>
              <div className="mb-1 flex items-center gap-1 text-[12px] font-medium text-ink-600">{f.label}{f.locked ? <Lock className="size-3 text-ink-400" /> : <span className="text-crit"> *</span>}</div>
              {control(f)}
              {msg ? <div className="mt-1 text-[11px] text-crit">{msg}</div> : f.hint ? <div className="mt-1 text-[11px] text-ink-400">{f.hint}</div> : null}
            </label>
          )
        })}
        <label className="col-span-2">
          <div className="mb-1 text-[12px] font-medium text-ink-600">{HISTORY_TEXT.REMARK}</div>
          <textarea rows={2} maxLength={1000} value={remark} onChange={(e) => setRemark(e.target.value)} className={inputCls} />
          {server.remark ? <div className="mt-1 text-[11px] text-crit">{server.remark}</div> : <div className="mt-1 text-[11px] text-ink-400">{HISTORY_TEXT.REMARK_HINT}</div>}
        </label>
      </div>
    </Drawer>
  )
}
