import { useState, type ReactNode } from 'react'
import { DummySection } from '../components/DummyData'
import { Toggle } from './ops/VerifySettings'

/*
 * DUMMY settings groups (2026-10-22, user: "add dummy so I can see how it looks"): placeholders only, nothing is saved
 * and nothing calls the API. They show how more groups would sit next to "PO verification" in Users & Roles ->
 * Settings. Remove an entry from SETTINGS_SECTIONS (constants/admin.ts, `dummy: true`) and its block here when a real
 * setting replaces it, or delete this file to remove them all.
 */

function Row({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-ink-900">{title}</div>
        <div className="text-[12px] text-ink-600">{hint}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Switch({ start }: { start: boolean }) {
  const [on, setOn] = useState(start)
  return (
    <span className="inline-flex items-center gap-2.5">
      <Toggle on={on} busy={false} onChange={setOn} />
      <span className={`w-7 text-[12px] font-semibold ${on ? 'text-primary' : 'text-ink-400'}`}>{on ? 'ON' : 'OFF'}</span>
    </span>
  )
}

const input = 'h-8 w-24 rounded-[var(--radius)] border border-line bg-surface px-2 text-right text-[13px] tnum outline-none focus:border-primary'
const card = (children: ReactNode) => <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">{children}</div>

export function NotificationsDummy() {
  return (
    <DummySection what="Notifications settings">
      {card(<>
        <Row title="Email when a PO goes to In Review" hint="Sent to the PO Review editors of that channel"><Switch start /></Row>
        <Row title="Daily summary at 9:00 am" hint="Processed, in review, waiting for Uniware, stuck Amazon shipments"><Switch start /></Row>
        <Row title="Alert when a CSV waits more than" hint="Days after processing before the Uniware CSV is flagged"><input className={input} defaultValue={5} /></Row>
        <Row title="CloudWatch error alerts" hint="Email the developer on backend errors"><Switch start={false} /></Row>
      </>)}
    </DummySection>
  )
}

export function ReviewRulesDummy() {
  return (
    <DummySection what="PO review rules">
      {card(<>
        <Row title="Price tolerance per SKU (₹)" hint="A line's MRP and rate may differ from the master by this much"><input className={input} defaultValue={1} /></Row>
        <Row title="Price tolerance per PO (₹)" hint="The PO total may differ by 0.02% of its value, at least this much"><input className={input} defaultValue={10} /></Row>
        <Row title="Accept expired POs" hint="Expired POs still go to review instead of being rejected"><Switch start /></Row>
        <Row title="Approval needed after review" hint="Reviewed POs go to the Approvals page before the sale order"><Switch start /></Row>
      </>)}
    </DummySection>
  )
}
