import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { PATHS } from '../constants/pages'
import { useAuth } from './AuthContext'
import { rememberNext } from './nextPage'
import { isMovedHost } from '../lib/moved'
import { MovedScreen } from '../components/MovedScreen'
import { DEVELOPER_ROLE } from '../constants/admin'

/**
 * Shows the app only when signed in; otherwise the login page (keeping ?error= from the backend redirect). The page
 * asked for is remembered, so a link from a mail opens it after sign-in (2026-11-02).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'loading') return <FullPageMessage text="Loading…" />
  if (auth.status === 'signedOut') {
    rememberNext(`${location.pathname}${location.search}`)
    return <Navigate to={`${PATHS.LOGIN}${location.search}`} replace />
  }
  // the test server (2026-11-26 go-live): only developers use it; everyone else is sent to the live POST_FG
  if (isMovedHost() && !auth.user.roles.includes(DEVELOPER_ROLE)) return <MovedScreen />
  return <>{children}</>
}

export function FullPageMessage({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-[13px] text-ink-600">{text}</div>
}
