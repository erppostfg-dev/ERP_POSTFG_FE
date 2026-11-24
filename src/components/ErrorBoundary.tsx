import { Component, type ErrorInfo, type ReactNode } from 'react'
import { UI_TEXT } from '../constants/auth'

/*
 * Error screens (2026-11-24, backlog A17 step 1 / L17; POST_FG + the Bulk Orders portal). Was: one render error or a
 * missing page file after a deploy = a white screen, every open form lost.
 *   - ErrorBoundary: a crashed part shows a card ("Something went wrong on this page" + Reload / Try again) instead of
 *     blanking the app; around every page (the menu keeps working) and around the whole app.
 *   - reloadOnStaleChunks: after a deploy an old tab asks for page files that no longer exist (Vite's
 *     'vite:preloadError'): the page reloads ONCE by itself (sessionStorage guard, so a real outage never loops).
 */

interface Props { children: ReactNode; /** 'page' = inside the app (menu stays), 'app' = the whole screen. */ scope?: 'page' | 'app' }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ui] a part of the page crashed', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const page = this.props.scope !== 'app'
    return (
      <div className={`${page ? 'my-10' : 'min-h-screen'} grid place-items-center px-4`}>
        <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-6 text-center shadow-sm">
          <div className="text-[15px] font-semibold text-ink-900">{UI_TEXT.CRASH_TITLE}</div>
          <p className="mt-1.5 text-[13px] text-ink-600">{UI_TEXT.CRASH_SUB}</p>
          <p className="mt-2 break-words rounded-md bg-alt px-3 py-2 font-mono text-[11.5px] text-ink-600">{error.message || String(error)}</p>
          <div className="mt-4 flex justify-center gap-2">
            {page && <button onClick={() => this.setState({ error: null })} className="rounded-md border border-line px-3 py-1.5 text-[12px] font-semibold">{UI_TEXT.CRASH_RETRY}</button>}
            <button onClick={() => window.location.reload()} className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-white">{UI_TEXT.CRASH_RELOAD}</button>
          </div>
        </div>
      </div>
    )
  }
}
