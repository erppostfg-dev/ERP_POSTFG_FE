import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Download, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Modal } from '../../components/ui'
import { addToSplit1, downloadCsvFile, mapVariants, type ComboCheck, type IntransitRun } from '../../api/intransit'
import { COMBO_FILES, SPLIT1_MAX_QTY } from '../../constants/intransit'

/*
 * Combos missing from Split1 (user, 2026-10-19): the report's flagged combos with an option to add them to Split1.csv
 * on the server.
 *   - confirmed by Uniware (bundle with components): "Add to Split1" adds Uniware's components; "Add all confirmed";
 *   - a variant of a combo (CMB47B2b, SCMB112_S: a single item in Uniware whose base code is the bundle): "Map to CMB47"
 *     adds it to Final SKU Mapping so it follows the base's split (the base is added to Split1 when missing);
 *   - found by their CMB code only: "Add components…" opens a small editor (component SKU + quantity per line).
 * A combo already in Split1 shows "In Split1" (rebuild the report to split its stock). Editors only.
 */

export type Combo = ComboCheck['combos'][number]

/** Flagged combos still to fix: not in Split1, and (variants) not mapped to their base yet. */
export const pendingCombos = (run?: IntransitRun) => (run?.result?.comboCheck?.combos ?? []).filter((c) => !c.inSplit1 && !c.mapped)

const FOUND_BY: Record<Combo['foundBy'], { label: string; tone: 'ok' | 'warn' }> = {
  'uniware+code': { label: 'Uniware bundle + CMB code', tone: 'ok' },
  uniware: { label: 'Uniware bundle', tone: 'ok' },
  variant: { label: 'Variant of a combo', tone: 'ok' },
  'code-only': { label: 'CMB code only', tone: 'warn' },
}

/** Adds combos to Split1 and refreshes what depends on it; tells the page what happened. */
/** Maps variants to their base combo (Final SKU Mapping); tells the page what happened. */
export function useMapVariants(onNotice: (tone: 'ok' | 'warn', text: string) => void) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const map = async (combos: Combo[]): Promise<void> => {
    setBusy(true)
    try {
      const r = await mapVariants(combos.filter((c) => c.base).map((c) => ({ variant: c.sku, base: c.base!.sku, components: c.base!.components })))
      void qc.invalidateQueries({ queryKey: ['intransit'] })
      onNotice(r.mapped.length ? 'ok' : 'warn', [
        r.mapped.length && `Mapped in Final SKU Mapping: ${r.mapped.map((m) => `${m.variant} → ${m.base}`).join(', ')}. Build the report again to split their stock.`,
        r.split1.added.length && `Added to Split1: ${r.split1.added.map((a) => `${a.combo} (${a.rows} rows)`).join(', ')}.`,
        r.skipped.length && `Not mapped: ${r.skipped.map((s) => `${s.variant}: ${s.reason}`).join(', ')}.`,
      ].filter(Boolean).join('\n'))
    } catch (err) {
      onNotice('warn', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return { map, busy }
}

export function useAddToSplit1(onNotice: (tone: 'ok' | 'warn', text: string) => void) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const add = async (combos: { combo: string; components: { sku: string; qty: number }[] }[]): Promise<boolean> => {
    setBusy(true)
    try {
      const r = await addToSplit1(combos)
      void qc.invalidateQueries({ queryKey: ['intransit'] })
      const added = r.added.map((a) => `${a.combo} (${a.rows} rows)`).join(', ')
      const skipped = r.skipped.map((s) => `${s.combo}: ${s.reason}`).join(', ')
      onNotice(r.added.length ? 'ok' : 'warn', [
        added && `Added to Split1.csv: ${added}. Build the report again to split their stock.`,
        skipped && `Not added: ${skipped}.`,
      ].filter(Boolean).join('\n'))
      return r.added.length > 0
    } catch (err) {
      const d = (err as { details?: { problems?: string[]; unknown?: string[] } }).details
      onNotice('warn', err instanceof Error ? err.message : String(err) + (d?.problems ? `: ${d.problems.join('; ')}` : ''))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { add, busy }
}

export function ComboTable({ run, canEdit, onNotice }: { run: IntransitRun; canEdit: boolean; onNotice: (tone: 'ok' | 'warn', text: string) => void }) {
  const combos = run.result?.comboCheck?.combos ?? []
  const { add, busy } = useAddToSplit1(onNotice)
  const [editing, setEditing] = useState<Combo | null>(null)
  const confirmed = combos.filter((c) => !c.inSplit1 && c.components.length)
  const variants = combos.filter((c) => c.base && !c.mapped && !c.inSplit1)
  const { map, busy: mapping } = useMapVariants(onNotice)
  const withComponents = (c: Combo) => ({ combo: c.sku, components: c.components })

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <p className="text-xs text-slate-500">
          {combos.length} combo{combos.length === 1 ? '' : 's'} missing from Split1 in report #{run.id} · {combos.filter((c) => c.inSplit1).length} added since
        </p>
        <div className="flex gap-2">
          <Button icon={<Download className="size-3.5" />} onClick={() => void downloadCsvFile({ kind: 'run', runId: run.id, name: COMBO_FILES.ALERT }).catch((e) => onNotice('warn', String(e)))}>Download list</Button>
          {canEdit && confirmed.length > 0 && (
            <Button variant="primary" icon={<Plus className="size-3.5" />} disabled={busy} onClick={() => void add(confirmed.map(withComponents))}>
              Add all confirmed to Split1 ({confirmed.length})
            </Button>
          )}
          {canEdit && variants.length > 0 && (
            <Button variant="primary" icon={<Plus className="size-3.5" />} disabled={mapping} onClick={() => void map(variants)}>
              Map all variants ({variants.length})
            </Button>
          )}
        </div>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-[12.5px]">
          <thead>
            <tr>
              {['Combo SKU', 'Name', 'Found by', 'Uniware', 'Channel types', 'Units', 'Components', ''].map((h) => (
                <th key={h} className={`sticky top-0 z-10 whitespace-nowrap border-b border-line bg-alt px-3 py-2 text-[11px] font-semibold text-ink-600 ${h === 'Units' ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {combos.map((c) => (
              <tr key={c.sku} className={c.inSplit1 ? 'bg-ok-soft/30' : 'hover:bg-alt/40'}>
                <td className="whitespace-nowrap border-b border-line px-3 py-2 font-mono text-ink-900">{c.sku}</td>
                <td className="max-w-[260px] truncate border-b border-line px-3 py-2" title={c.name}>{c.name}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2"><Badge tone={FOUND_BY[c.foundBy].tone}>{FOUND_BY[c.foundBy].label}</Badge></td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2 text-ink-600">{c.uniwareType}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2 text-ink-600">{c.channelTypes}</td>
                <td className="tnum whitespace-nowrap border-b border-line px-3 py-2 text-right">{c.units.toLocaleString('en-IN')}</td>
                <td className="border-b border-line px-3 py-2 font-mono text-[12px] text-ink-600">
                  {c.components.length ? c.components.map((x) => `${x.sku} ×${x.qty}`).join(', ')
                    : c.base ? <span><span className="font-sans text-ink-400">via </span>{c.base.sku}: {c.base.components.map((x) => `${x.sku} ×${x.qty}`).join(', ')}{c.base.inSplit1 === false && <span className="font-sans text-warn"> (base not in Split1: added when mapped)</span>}</span>
                    : <span className="font-sans text-ink-400">— not known</span>}
                </td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2 text-right">
                  {c.inSplit1 ? <Badge tone="ok"><Check className="size-3" /> In Split1 · rebuild to apply</Badge>
                    : c.mapped ? <Badge tone="ok"><Check className="size-3" /> Mapped{c.base ? ` to ${c.base.sku}` : ''} · rebuild to apply</Badge>
                    : !canEdit ? null
                    : c.base ? (
                      <span className="inline-flex gap-1.5">
                        <Button variant="primary" disabled={mapping} onClick={() => void map([c])}>Map to {c.base.sku}</Button>
                        <Button disabled={busy} onClick={() => void add([{ combo: c.sku, components: c.base!.components }])}>Add with its parts</Button>
                      </span>
                    )
                    : !canEdit ? null
                    : c.components.length ? <Button disabled={busy} onClick={() => void add([withComponents(c)])}>Add to Split1</Button>
                    : <Button disabled={busy} onClick={() => setEditing(c)}>Add components…</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <ComponentEditor combo={editing} busy={busy} onCancel={() => setEditing(null)}
        onSave={async (components) => { if (await add([{ combo: editing.sku, components }])) setEditing(null) }} />}
    </div>
  )
}

/** Components of a combo whose parts Uniware did not give: one SKU + quantity per line. */
function ComponentEditor({ combo, busy, onCancel, onSave }: {
  combo: Combo; busy: boolean; onCancel: () => void; onSave: (components: { sku: string; qty: number }[]) => void
}) {
  const [lines, setLines] = useState([{ sku: '', qty: '1' }])
  const set = (i: number, k: 'sku' | 'qty', v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  const parsed = lines.filter((l) => l.sku.trim()).map((l) => ({ sku: l.sku.trim(), qty: Number(l.qty) }))
  const problems = [
    !parsed.length && 'add at least one component',
    parsed.some((p) => !Number.isInteger(p.qty) || p.qty < 1 || p.qty > SPLIT1_MAX_QTY) && `quantity must be 1 to ${SPLIT1_MAX_QTY}`,
    parsed.some((p) => p.sku.toLowerCase() === combo.sku.toLowerCase()) && 'a combo cannot contain itself',
    new Set(parsed.map((p) => p.sku.toLowerCase())).size !== parsed.length && 'a component is listed twice (use its quantity)',
  ].filter(Boolean) as string[]
  const rows = parsed.reduce((t, p) => t + (Number.isInteger(p.qty) ? p.qty : 0), 0)
  return (
    <Modal open onClose={onCancel} title={`Add ${combo.sku} to Split1`}
      sub={`${combo.name} · Uniware: ${combo.uniwareType}. Enter the products in one ${combo.sku} and how many of each.`}
      footer={<>
        <span className="mr-auto text-[12px] text-ink-600">{problems.length ? <span className="text-crit">{problems.join(' · ')}</span> : `${rows} row${rows === 1 ? '' : 's'} will be added to Split1.csv`}</span>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={busy || problems.length > 0} onClick={() => onSave(parsed)}>{busy ? 'Adding…' : 'Add to Split1'}</Button>
      </>}>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_90px_32px] gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-600"><span>Component SKU</span><span>Quantity</span><span /></div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_90px_32px] items-center gap-2">
            <input autoFocus={i === lines.length - 1} value={l.sku} onChange={(e) => set(i, 'sku', e.target.value)} placeholder="e.g. MCaf40"
              className="h-9 rounded-[var(--radius)] border border-line bg-surface px-3 font-mono text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            <input type="number" min={1} max={SPLIT1_MAX_QTY} value={l.qty} onChange={(e) => set(i, 'qty', e.target.value)}
              className="tnum h-9 rounded-[var(--radius)] border border-line bg-surface px-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            <button onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ sku: '', qty: '1' }]))} title="Remove" className="rounded-md p-1.5 text-ink-400 hover:bg-crit-soft hover:text-crit"><Trash2 className="size-4" /></button>
          </div>
        ))}
        <button onClick={() => setLines((ls) => [...ls, { sku: '', qty: '1' }])} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline"><Plus className="size-3.5" /> Add a component</button>
        <p className="text-[11.5px] text-ink-400">Each SKU is checked against Uniware before it is saved. A component with quantity 2 is written as 2 rows, as Split1 counts them.</p>
      </div>
    </Modal>
  )
}
