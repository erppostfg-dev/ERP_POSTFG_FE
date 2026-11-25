import type { OutsideFinding } from '../api/uniwareOutside'
import { OUTSIDE_FILTER_KEY, OUTSIDE_NO, OUTSIDE_TEXT, OUTSIDE_YES } from '../constants/uniwareOutside'

/** 2026-11-25: the row field the tabs filter on (Yes = in Uniware under another code, punched outside POST_FG). */
export const inUniwareOf = (f: OutsideFinding | null | undefined) => (f ? OUTSIDE_YES : OUTSIDE_NO)
export const outsideFilterDef = { key: OUTSIDE_FILTER_KEY, label: OUTSIDE_TEXT.FILTER, type: 'multi' as const, options: [OUTSIDE_YES, OUTSIDE_NO] }
