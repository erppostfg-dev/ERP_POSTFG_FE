import { MOVED } from '../constants/moved'

/** True on the test server's address (dev), where people are sent to the live POST_FG. */
export const isMovedHost = (hostname: string = typeof window === 'undefined' ? '' : window.location.hostname): boolean =>
  MOVED.HOSTS.includes(hostname.toLowerCase())
