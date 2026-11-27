import type { ReactNode } from 'react'
import { ArrowRight, Truck } from 'lucide-react'
import { MOVED, MOVED_TEXT as T } from '../constants/moved'

/*
 * "POST_FG has moved" (2026-11-26 go-live): the whole page on the test server for everyone who is not a developer, and
 * above the sign-in there. A real link to the live address (no automatic jump, so people see and learn the new one).
 */
export function MovedScreen({ bulk = false, children }: { bulk?: boolean; children?: ReactNode }) {
  const url = bulk ? MOVED.BULK_URL : MOVED.APP_URL
  return (
    <div className="grid min-h-full place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary-soft text-primary"><Truck className="size-6" /></div>
        <h1 className="mt-4 text-[22px] font-semibold text-ink-900">{bulk ? T.BULK_TITLE : T.TITLE}</h1>
        <p className="mt-2 text-[13.5px] leading-6 text-ink-600">{bulk ? T.BULK_BODY : T.BODY}</p>
        <a href={url} className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-[14px] font-semibold text-white hover:opacity-90">
          {bulk ? T.GO_BULK : T.GO} <ArrowRight className="size-4" />
        </a>
        <p className="mt-5 text-[12px] text-ink-400">{T.BOOKMARK}</p>
        <p className="mt-1 select-all break-all font-mono text-[12.5px] text-ink-900">{url}</p>
        {children && <div className="mt-6 border-t border-line pt-4">{children}</div>}
      </div>
    </div>
  )
}
