/*
 * The rows of a TreeSelect (components/pickers.tsx, 2026-11-12, Bulk Orders warehouse: main (mother) warehouses with
 * their child warehouses folded under them). Pure, so it is tested on its own (lib/__tests__/tree-options.test.ts).
 */

export interface TreeOption {
  value: string
  label: string
  /** Second line in grey (e.g. the warehouse name). */
  sub?: string | null
  /** The value of its main (mother) row; null / missing = a main row. A parent not in the list = shown as a main row. */
  parent?: string | null
}

export interface TreeRow {
  main: TreeOption
  /** The children to show: all of them, or only the matching ones when the search hits a child but not the main row. */
  children: TreeOption[]
  /** How many children the main row has in all. */
  total: number
  /** The search matched one of its children: the row opens by itself. */
  childHit: boolean
}

/** Main rows (in the given order) with their children; with a search, only rows where the main or a child matches. */
export function treeRows(options: readonly TreeOption[], search: string): TreeRow[] {
  const f = search.trim().toLowerCase()
  const hit = (o: TreeOption) => !f || o.label.toLowerCase().includes(f) || !!o.sub?.toLowerCase().includes(f)
  const values = new Set(options.map((o) => o.value))
  const kids = new Map<string, TreeOption[]>()
  const mains: TreeOption[] = []
  for (const o of options) {
    if (o.parent && o.parent !== o.value && values.has(o.parent)) kids.set(o.parent, [...(kids.get(o.parent) ?? []), o])
    else mains.push(o)
  }
  return mains
    .map((main) => {
      const all = kids.get(main.value) ?? []
      const childHits = all.filter(hit)
      return { main, children: f && !hit(main) ? childHits : all, total: all.length, childHit: !!f && childHits.length > 0 }
    })
    .filter((r) => hit(r.main) || r.childHit)
}
