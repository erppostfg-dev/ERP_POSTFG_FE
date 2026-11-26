/*
 * The test server says "POST_FG has moved" (2026-11-26 go-live, user: "when someone logs in on dev show: this one is not
 * for you, we changed, use this link"). Only on these addresses (dev), never on prod or a laptop. Developers still get in.
 */
export const MOVED = {
  /** Where the screen shows: the dev server's address only. */
  HOSTS: ['dev.erp.mcaffeine.com'] as readonly string[],
  APP_URL: 'https://erp.mcaffeine.com/postfg',
  BULK_URL: 'https://erp.mcaffeine.com/postfg/bulk-orders/',
} as const

export const MOVED_TEXT = {
  TITLE: 'POST_FG has moved',
  BULK_TITLE: 'The Bulk Orders portal has moved',
  BODY: 'This address is now only for testing. Please use the live POST_FG. All your POs, reviews and approvals are already there.',
  BULK_BODY: 'This address is now only for testing. Please use the live Bulk Orders portal. All your orders are already there.',
  GO: 'Go to POST_FG',
  GO_BULK: 'Go to Bulk Orders',
  BOOKMARK: 'Please update your bookmark to:',
  DEV_SIGN_IN: 'Developers: sign in to the test server',
  DEV_BANNER: 'Test server. Everyone else sees "POST_FG has moved" and is sent to the live address.',
} as const
