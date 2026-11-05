import { foundTip, type Found } from '../lib/useFindOnPo'

/*
 * A value that finds itself on the PO when clicked (lib/useFindOnPo; Verify and In Review panels): blue while asked,
 * green when found, red with ✕ when it is not on the PO; a double click copies it (lib/useFindOnPo).
 */

const tone = (f: Found | undefined, isActive: boolean) =>
  f === 0 ? 'bg-crit-soft text-crit ring-1 ring-crit/40' : isActive ? 'bg-primary text-white' : typeof f === 'number' ? 'bg-ok-soft text-ink-900' : 'hover:bg-primary-soft hover:text-primary'

export function FindValue({ text, found, active, onFind, onCopy, copied = false, mono = false, className = '' }: {
  text: string
  found: Found | undefined
  active: boolean
  onFind: () => void
  /** double click */
  onCopy?: () => void
  /** just copied: the tip says so */
  copied?: boolean
  mono?: boolean
  className?: string
}) {
  if (!text) return <span className="text-ink-400">—</span>
  return (
    <button type="button" onClick={onFind} onDoubleClick={onCopy} title={`${text}\n${foundTip(found, copied)}`}
      className={`max-w-full truncate rounded px-1 py-0.5 text-left transition-colors duration-150 ${mono ? 'font-mono' : ''} ${tone(found, active)} ${className}`}>
      {text}
      {found === 0 && <span className="ml-1 text-[10px] font-semibold">✕</span>}
    </button>
  )
}
