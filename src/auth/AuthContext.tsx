import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api, ApiError } from '../api/client'
import { ACCESS, AUTH_ENDPOINTS, ERROR_CODE, type AccessLevel } from '../constants/auth'
import { preview, PREVIEW_ACCESS, PREVIEW_ENABLED, PREVIEW_USER } from '../dev/intransitPreview'

/* The signed-in user from GET /auth/me; the session itself is the backend's httpOnly cookie. */

/** team = the person's PO Overview team (planning, copt, warehouse, logistics, accounts, viewer), null = none. */
export type User = { id: string; name: string; email: string; roles: string[]; team: string | null; roleLabels?: Record<string, string> }
/** capabilities = special permissions on / off (e.g. po-review:edit-all, 2026-10-22). */
type Me = { user: User; access: Record<string, AccessLevel>; capabilities?: Record<string, boolean> }

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; error?: string }
  | { status: 'signedIn'; user: User; access: Record<string, AccessLevel>; capabilities: Record<string, boolean> }

type AuthValue = AuthState & {
  accessFor: (path: string) => AccessLevel
  /** A special permission (CAPABILITY …) of the signed-in person. */
  can: (capability: string) => boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    api<Me>(AUTH_ENDPOINTS.ME)
      .then((me) => setState({ status: 'signedIn', user: me.user, access: me.access, capabilities: me.capabilities ?? {} }))
      .catch((e: unknown) => {
        // DEV-ONLY: In-transit preview without backend / login (src/dev/intransitPreview.ts).
        if (PREVIEW_ENABLED) {
          preview.on = true
          setState({ status: 'signedIn', user: PREVIEW_USER, access: { ...PREVIEW_ACCESS }, capabilities: {} })
          return
        }
        const code = e instanceof ApiError ? e.code : ERROR_CODE.NETWORK
        setState({ status: 'signedOut', error: code === ERROR_CODE.UNAUTHENTICATED ? undefined : code })
      })
  }, [])

  const accessFor = useCallback(
    (path: string): AccessLevel => (state.status === 'signedIn' ? state.access[path] ?? ACCESS.NONE : ACCESS.NONE),
    [state],
  )

  const can = useCallback(
    (capability: string): boolean => state.status === 'signedIn' && !!state.capabilities[capability],
    [state],
  )

  const logout = useCallback(async () => {
    try {
      await api(AUTH_ENDPOINTS.LOGOUT, { method: 'POST' })
    } finally {
      setState({ status: 'signedOut' })
    }
  }, [])

  return <AuthContext.Provider value={{ ...state, accessFor, can, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
