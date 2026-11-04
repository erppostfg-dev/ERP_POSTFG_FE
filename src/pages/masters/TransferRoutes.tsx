import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, FlaskConical, History, Lock, Pencil, X } from 'lucide-react'
import { ApiError } from '../../api/client'
import { editTransferPrefix, editTransferRoute, listTransferRoutesWithMeta, type EditConflict, type TransferRouteChanges, type TransferRouteItem } from '../../api/masters'
import { EDIT_TEXT, HISTORY_TEXT, MASTER_ADD_ROLES, MASTER_LOG_TYPE, SKU_STATUS, TRANSFER_CODE_MAX, TRANSFER_PREFIX_KEY, TRANSFER_ROUTE_CODE_KEYS, TRANSFER_ROUTE_TEXT as T } from '../../constants/masters'
import { useAuth } from '../../auth/AuthContext'
import { Badge, Button, Drawer, PageTitle } from '../../components/ui'
import { Reveal } from '../../components/shell'
import { DataGrid, FilterPanel, SectionToolbar, exportRows, inputCls, useSection, type FilterDef } from '../../components/kit'
import type { ColKind } from '../../lib/ops'
import { IconBtn, RecentChangesDrawer, RowHistoryDrawer } from './MasterHistory'

/*
 * Masters -> Transfer Routes (2026-11-03): every D2C internal transfer route (sending warehouse + transfer location ->
 * receiving warehouse) with its PO prefix and Uniware codes. Seen with viewer access on Warehouses; admin / developer
 * edit the codes and on / off (PATCH /masters/transfer-routes/:id) and the location's PO prefix (a channel-location edit).
 * Every change is in the row's History (master type transfer_route; the prefix in the location's).
 */

type Row = {
  rid: number; sender: string; channel: string; location: string; receiving: string; poPrefix: string; uniwareChannel: string
  customerCode: string; customerName: string; vendorCode: string; status: string; vendorMissing: string
}
const toRow = (r: TransferRouteItem): Row => ({
  rid: r.id, sender: r.senderCode, channel: r.channel, location: r.location ?? '', receiving: r.receivingCode ?? '', poPrefix: r.poPrefix ?? '',
  uniwareChannel: r.uniwareChannelCode ?? '', customerCode: r.customerCode ?? '', customerName: r.customerName ?? '', vendorCode: r.vendorCode ?? '',
  status: r.isActive ? SKU_STATUS.ACTIVE : SKU_STATUS.INACTIVE, vendorMissing: r.missingVendor ? 'Yes' : 'No',
})
const COLS: [string, keyof Row, ColKind][] = [
  ['Sender', 'sender', 'mono'], ['Channel', 'channel', 'text'], ['Location', 'location', 'mono'], ['Receiving WH', 'receiving', 'mono'],
  ['PO Prefix', 'poPrefix', 'mono'], ['Uniware Channel', 'uniwareChannel', 'mono'], ['Customer Code', 'customerCode', 'mono'], ['Customer Name', 'customerName', 'text'],
]
const EXPORT_COLS: [string, keyof Row, ColKind][] = [...COLS, ['Vendor Code', 'vendorCode', 'mono'], ['Active', 'status', 'text']]
const SEARCH: (keyof Row)[] = ['sender', 'channel', 'location', 'receiving', 'poPrefix', 'uniwareChannel', 'customerCode', 'customerName', 'vendorCode']
const FILTER_KEYS: [keyof Row, string][] = [['sender', 'Sender'], ['channel', 'Channel'], ['receiving', 'Receiving WH']]
const routesKey = ['masters', 'routes'] as const
const distinct = (rows: Row[], k: keyof Row) => [...new Set(rows.map((r) => String(r[k])).filter(Boolean))].sort()
const titleOf = (r: Row) => `${r.sender} -> ${r.channel} | ${r.location}`
const missingChip = <Badge tone="warn">{T.MISSING}</Badge>

export default function TransferRoutes() {
  const queryClient = useQueryClient()
  const q = useQuery({ queryKey: routesKey, queryFn: ({ signal }) => listTransferRoutesWithMeta(signal) })
  const items = q.data?.data
  const testOnly = !!q.data?.meta.testOnly
  const testFacilities = q.data?.meta.testFacilities ?? []
  /** Local test mode: only routes whose sender AND receiving warehouse are test warehouses can be edited (the backend refuses the rest). */
  const editable = (r: TransferRouteItem | undefined) => !!r && (!testOnly || (testFacilities.includes(r.senderCode) && testFacilities.includes(r.receivingCode ?? '')))
  const byId = useMemo(() => new Map((items ?? []).map((r) => [r.id, r])), [items])
  const rows = useMemo(() => (items ?? []).map(toRow), [items])
  const s = useSection<Row>(rows, SEARCH)
  const [vendorMissing, setVendorMissing] = useState(false)
  const missingCount = useMemo(() => s.filtered.filter((r) => r.vendorMissing === 'Yes').length, [s.filtered])
  const view = vendorMissing ? s.filtered.filter((r) => r.vendorMissing === 'Yes') : s.filtered
  const filters = useMemo<FilterDef[]>(() => FILTER_KEYS.map(([key, label]) => ({ key, label, type: 'multi', options: distinct(rows, key) })), [rows])
  // edit: admin / developer only (the backend's PATCH rule); everyone who sees the page sees History
  const auth = useAuth()
  const canEdit = auth.status === 'signedIn' && auth.user.roles.some((r) => (MASTER_ADD_ROLES as readonly string[]).includes(r))
  const [editing, setEditing] = useState<TransferRouteItem | null>(null)
  const [historyOf, setHistoryOf] = useState<Row | null>(null)
  const [changesOpen, setChangesOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: routesKey })
    void queryClient.invalidateQueries({ queryKey: ['masters', 'chWh'] })
    void queryClient.invalidateQueries({ queryKey: ['masters', 'history'] })
    void queryClient.invalidateQueries({ queryKey: ['masters', 'changes'] })
  }
  const box = 'rounded-[var(--radius)] border border-line bg-surface px-4 py-10 text-center text-[13px] text-ink-600'

  return (
    <div className="space-y-5">
      <PageTitle title={T.TITLE} sub={T.SUB} right={<Button icon={<History className="size-3.5" />} onClick={() => setChangesOpen(true)}>Recent changes</Button>} />
      {testOnly && (
        <div role="status" className="flex items-start gap-2 rounded-[var(--radius)] border border-warn/40 bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          <FlaskConical className="mt-0.5 size-4 shrink-0" />
          <span><span className="font-semibold">{T.TEST_MODE_BANNER}</span> · {T.TEST_MODE_HINT}</span>
        </div>
      )}
      {q.isError ? (
        <div className="flex items-center gap-3 rounded-[var(--radius)] border border-crit/30 bg-crit-soft px-4 py-3 text-[13px] text-crit">
          <AlertTriangle className="size-4" /> Could not load {T.ENTITY}: {q.error instanceof ApiError ? q.error.message : String(q.error)}
          <button onClick={() => void q.refetch()} className="ml-auto font-semibold">Retry</button>
        </div>
      ) : q.isPending ? (
        <div className={box}>Loading {T.ENTITY}…</div>
      ) : (
        <div className="space-y-3">
          <SectionToolbar q={s.q} setQ={s.setQ} placeholder={T.SEARCH} filtersOpen={s.open} onToggleFilters={() => s.setOpen(!s.open)} activeFilters={s.active}
            entity={T.ENTITY} onExport={(e) => exportRows('transfer-routes', e, EXPORT_COLS, view)}
            extra={
              <button onClick={() => setVendorMissing(!vendorMissing)} title={T.VENDOR_MISSING_HINT} aria-pressed={vendorMissing}
                className={`inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] border px-3 text-[13px] font-medium transition-colors ${vendorMissing ? 'border-warn/50 bg-warn-soft text-warn' : 'border-line bg-surface text-ink-900 hover:bg-canvas'}`}>
                <AlertTriangle className="size-4" /> {T.VENDOR_MISSING}
                <span className={`tnum rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${vendorMissing ? 'bg-warn text-white' : 'bg-warn-soft text-warn'}`}>{missingCount}</span>
              </button>
            } />
          {notice && (
            <div className="flex items-start gap-2 rounded-[var(--radius)] border border-ok/30 bg-ok-soft px-3 py-2 text-[12.5px] text-ok">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" /><span className="flex-1">{notice}</span>
              <button onClick={() => setNotice('')} title="Close"><X className="size-3.5" /></button>
            </div>
          )}
          <Reveal open={s.open}><FilterPanel defs={filters} value={s.filters} onApply={(f) => { s.setFilters(f); s.setOpen(false) }} onClose={() => s.setOpen(false)} /></Reveal>
          <DataGrid cols={COLS} rows={view} rowKey={(r) => String(r.rid)} sticky={1}
            onRowClick={canEdit ? (r) => { const it = byId.get(r.rid); if (editable(it)) setEditing(it ?? null) } : undefined}
            trailing={[
              { label: 'Vendor Code', render: (r) => (r.vendorCode ? <span className="font-mono text-[12.5px]">{r.vendorCode}</span> : missingChip), sortValue: (r) => r.vendorCode },
              { label: 'Active', render: (r) => <Badge tone={r.status === SKU_STATUS.ACTIVE ? 'ok' : 'neutral'}>{r.status}</Badge> },
              { label: 'Actions', render: (r) => (
                <span className="flex items-center gap-1 text-ink-600" onClick={(e) => e.stopPropagation()}>
                  {canEdit && (editable(byId.get(r.rid))
                    ? <IconBtn title="Edit" onClick={() => setEditing(byId.get(r.rid) ?? null)}><Pencil className="size-3.5" /></IconBtn>
                    : <IconBtn title={T.TEST_MODE_EDIT_OFF} disabled><Pencil className="size-3.5" /></IconBtn>)}
                  <IconBtn title="History: who changed what" onClick={() => setHistoryOf(r)}><History className="size-3.5" /></IconBtn>
                </span>
              ) },
            ]} />
        </div>
      )}
      {editing && <EditRouteDrawer item={editing} onClose={() => setEditing(null)} onSaved={(message) => { setEditing(null); setNotice(message); refresh() }} />}
      {historyOf && <RowHistoryDrawer type={MASTER_LOG_TYPE.routes} row={historyOf} title={titleOf(historyOf)} sub={T.TITLE} onClose={() => setHistoryOf(null)} />}
      {changesOpen && <RecentChangesDrawer initialType={MASTER_LOG_TYPE.routes} onClose={() => setChangesOpen(false)} />}
    </div>
  )
}

// ---- Edit one route ------------------------------------------------------------------------------------------------
type FormKey = (typeof TRANSFER_ROUTE_CODE_KEYS)[number] | typeof TRANSFER_PREFIX_KEY | 'isActive'
type Form = Record<FormKey, string>
const FIELDS: { key: FormKey; label: string; hint?: string }[] = [
  { key: TRANSFER_PREFIX_KEY, label: 'PO prefix', hint: T.PREFIX_HINT },
  { key: 'uniwareChannelCode', label: 'Uniware channel code' },
  { key: 'customerCode', label: 'Customer code' },
  { key: 'vendorCode', label: 'Vendor code' },
]
const formOf = (r: TransferRouteItem): Form => ({
  transferPoPrefix: r.poPrefix ?? '', uniwareChannelCode: r.uniwareChannelCode ?? '', customerCode: r.customerCode ?? '', vendorCode: r.vendorCode ?? '',
  isActive: r.isActive ? SKU_STATUS.ACTIVE : SKU_STATUS.INACTIVE,
})
const orNull = (v: string) => (v.trim() ? v.trim() : null)
const labelOf = (field: string) => (field === 'isActive' ? 'Active' : FIELDS.find((f) => f.key === field)?.label ?? field)

function EditRouteDrawer({ item, onClose, onSaved }: { item: TransferRouteItem; onClose: () => void; onSaved: (message: string) => void }) {
  const [initial, setInitial] = useState<Form>(() => formOf(item))
  const [v, setV] = useState<Form>(initial)
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState('')
  const [conflicts, setConflicts] = useState<EditConflict[]>([])
  const changed = (Object.keys(v) as FormKey[]).filter((k) => v[k].trim() !== initial[k].trim())
  const rem = remark.trim() ? { remark: remark.trim() } : {}

  const save = async () => {
    if (!changed.length || saving) return
    setSaving(true)
    setFailed('')
    setConflicts([])
    let n = 0
    try {
      const codes = changed.filter((k): k is (typeof TRANSFER_ROUTE_CODE_KEYS)[number] => (TRANSFER_ROUTE_CODE_KEYS as readonly string[]).includes(k))
      const changes: TransferRouteChanges = Object.fromEntries(codes.map((k) => [k, orNull(v[k])]))
      const original: TransferRouteChanges = Object.fromEntries(codes.map((k) => [k, orNull(initial[k])]))
      if (changed.includes('isActive')) changes.isActive = v.isActive === SKU_STATUS.ACTIVE
      if (Object.keys(changes).length) {
        n += (await editTransferRoute(item.id, { changes, original, ...rem })).changed.length
        // saved: a later conflict on the prefix must not send these again
        setInitial((i) => ({ ...i, ...Object.fromEntries([...codes, ...(changed.includes('isActive') ? ['isActive'] : [])].map((k) => [k, v[k as FormKey]])) }))
      }
      if (changed.includes(TRANSFER_PREFIX_KEY)) {
        n += (await editTransferPrefix(item.locationId, {
          changes: { [TRANSFER_PREFIX_KEY]: orNull(v.transferPoPrefix) }, original: { [TRANSFER_PREFIX_KEY]: orNull(initial.transferPoPrefix) }, ...rem,
        })).changed.length
      }
      onSaved(T.SAVED(n))
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && Array.isArray(e.details)) setConflicts(e.details as EditConflict[])
      else setFailed(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  const useLatest = () => {
    const now = Object.fromEntries(conflicts.map((c) => [c.field, c.now === null ? '' : String(c.now)]))
    setInitial((i) => ({ ...i, ...now }))
    setV((x) => ({ ...x, ...now }))
    setConflicts([])
  }
  const ro = (label: string, value: string | null) => (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[12px] font-medium text-ink-600">{label}<Lock className="size-3 text-ink-400" /></div>
      <input value={value ?? ''} readOnly className={`${inputCls} bg-canvas font-mono text-ink-600`} />
    </div>
  )
  return (
    <Drawer open onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><Pencil className="size-4 text-ink-600" />{T.EDIT_TITLE}</span>}
      sub={`${item.senderCode} -> ${item.channel} | ${item.location ?? ''}`}
      footer={(close) => <>
        <span className="mr-auto self-center text-[12px] text-ink-400">{changed.length ? EDIT_TEXT.CHANGED(changed.length) : EDIT_TEXT.NO_CHANGES}</span>
        <Button onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={() => void save()} disabled={!changed.length || saving || !!conflicts.length}>{saving ? 'Saving…' : 'Save changes'}</Button>
      </>}>
      {failed && <div className="mb-3 flex items-center gap-2 rounded-md border border-crit/30 bg-crit-soft px-3 py-2 text-[12px] text-crit"><AlertTriangle className="size-4" />{failed}</div>}
      {conflicts.length > 0 && (
        <div className="mb-3 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-[12px] text-ink-900">
          <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-warn" />{EDIT_TEXT.CONFLICT}</div>
          <ul className="mb-2 ml-6 list-disc">{conflicts.map((c) => <li key={c.field}>{labelOf(c.field)}: now <b>{c.now === null || c.now === '' ? 'empty' : String(c.now)}</b></li>)}</ul>
          <Button onClick={useLatest}>{EDIT_TEXT.USE_LATEST}</Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {ro('Sender', item.senderCode)}
        {ro('Receiving WH', item.receivingCode)}
        {ro('Channel', item.channel)}
        {ro('Location', item.location)}
        <div className="col-span-2">{ro('Customer name', item.customerName)}</div>
        {FIELDS.map((f) => (
          <label key={f.key} className={f.key === TRANSFER_PREFIX_KEY ? 'col-span-2' : ''}>
            <div className="mb-1 text-[12px] font-medium text-ink-600">{f.label}</div>
            <input value={v[f.key]} maxLength={TRANSFER_CODE_MAX} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} className={`${inputCls} font-mono`} />
            {f.hint && <div className="mt-1 text-[11px] text-ink-400">{f.hint}</div>}
            {f.key === 'vendorCode' && !v.vendorCode.trim() && <div className="mt-1">{missingChip}</div>}
          </label>
        ))}
        <label>
          <div className="mb-1 text-[12px] font-medium text-ink-600">Active</div>
          <select value={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.value })} className={inputCls}>
            {[SKU_STATUS.ACTIVE, SKU_STATUS.INACTIVE].map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
        <label className="col-span-2">
          <div className="mb-1 text-[12px] font-medium text-ink-600">{HISTORY_TEXT.REMARK}</div>
          <textarea rows={2} maxLength={1000} value={remark} onChange={(e) => setRemark(e.target.value)} className={inputCls} />
          <div className="mt-1 text-[11px] text-ink-400">{HISTORY_TEXT.REMARK_HINT}</div>
        </label>
      </div>
    </Drawer>
  )
}
