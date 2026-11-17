import { GRID_PAGE_SIZE } from '../constants/ui'

/**
 * Rows per page a person picked for one table (2026-11-16, user: "keep a limit, inside it they type the number they
 * want; in every table"): kept in this browser under GRID_PAGE_SIZE.STORE_KEY + the table's key, always 1..max.
 * Storage blocked / empty / bad value = the table's default.
 */
export const readPageSize = (key: string, fallback: number, max: number = GRID_PAGE_SIZE.MAX): number => {
  try {
    const v = Number(localStorage.getItem(GRID_PAGE_SIZE.STORE_KEY + key))
    return Number.isInteger(v) && v >= 1 ? Math.min(v, max) : Math.min(fallback, max)
  } catch {
    return Math.min(fallback, max)
  }
}

export const savePageSize = (key: string, n: number): void => {
  try { localStorage.setItem(GRID_PAGE_SIZE.STORE_KEY + key, String(n)) } catch { /* kept for this visit only */ }
}
