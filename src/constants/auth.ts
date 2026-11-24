/* Backend address, login endpoints and the texts the login screens show. */

/** From .env (VITE_API_BASE_URL); the default is the local backend. */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1'

export const AUTH_ENDPOINTS = {
  GOOGLE: '/auth/google',
  ME: '/auth/me',
  LOGOUT: '/auth/logout',
} as const

export const ACCESS = { NONE: 'none', VIEWER: 'viewer', EDITOR: 'editor' } as const
export type AccessLevel = (typeof ACCESS)[keyof typeof ACCESS]

/** Backend error codes the frontend branches on (POST_FG src/constants/errors.ts). */
export const ERROR_CODE = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  NETWORK: 'NETWORK_ERROR',
} as const

/** Shown on the login page when the backend sends the user back with ?error=<CODE>. */
export const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  OAUTH_STATE_INVALID: 'The sign-in link expired or was not started here. Please sign in again.',
  GOOGLE_TOKEN_INVALID: 'Google sign-in could not be verified. Please try again.',
  NOT_ALLOWED_DOMAIN: 'Only mCaffeine Google accounts can sign in.',
  USER_NOT_FOUND: 'Your account has no access to Post FG yet. Ask an admin to add you.',
  USER_INACTIVE: 'Your account is switched off. Ask an admin.',
  AUTH_NOT_CONFIGURED: 'Sign-in is not set up on the server yet.',
  [ERROR_CODE.NETWORK]: 'Cannot reach the Post FG server. Check that the backend is running.',
}
export const LOGIN_ERROR_FALLBACK = 'Sign-in failed. Please try again.'

export const UI_TEXT = {
  // error screens (2026-11-24, components/ErrorBoundary.tsx)
  CRASH_TITLE: 'Something went wrong on this page',
  CRASH_SUB: 'The rest of the app still works. Reload the page; if it happens again, use Report a problem.',
  CRASH_RETRY: 'Try again',
  CRASH_RELOAD: 'Reload',
  NO_ACCESS: 'You have no access to this page. Ask an admin for access.',
  NOT_FOUND: 'This page does not exist.',
  VIEW_ONLY: 'View only',
} as const

/** Labels of the header's "who am I" badge: the team when the person has one, else their role(s). */
export const ROLE_LABEL: Record<string, string> = { developer: 'Developer', admin: 'Admin' }
export const TEAM_LABEL: Record<string, string> = {
  planning: 'Planning',
  copt: 'COPT',
  warehouse: 'Warehouse',
  logistics: 'Logistics',
  accounts: 'Accounts',
  viewer: 'Viewer',
}
