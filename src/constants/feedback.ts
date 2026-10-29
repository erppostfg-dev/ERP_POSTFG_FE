/*
 * Feedback (2026-10-29): backend constants/feedback.ts + routes/feedback.routes.ts. Everyone signed in sees every
 * item, adds items (with up to 4 images) and comments; the reporter, the people added to an item and developer / admin
 * change it. Emails: later.
 */

export const FEEDBACK_ENDPOINT = '/feedback'
export const FEEDBACK_MAX_IMAGES = 4
export const FEEDBACK_MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const FEEDBACK_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
export const FEEDBACK_TITLE_MAX = 200
export const FEEDBACK_TEXT_MAX = 5000
export const FEEDBACK_COMMENT_MAX = 2000
/** Height of the Description box (form and edit), in lines (user 2026-10-29: "3, 5 lines"); it can be dragged taller. */
export const FEEDBACK_DESCRIPTION_ROWS = 5
/** The list refreshes by itself this often while the page is open. */
export const FEEDBACK_REFRESH_MS = 60_000

export type FeedbackType = 'problem' | 'improvement' | 'question'
export type FeedbackSeverity = 'blocking' | 'annoying' | 'small'
export type FeedbackStatus = 'new' | 'in_progress' | 'planned' | 'fixed' | 'wont_do' | 'duplicate'

export const FEEDBACK_TYPES: { key: FeedbackType; label: string; hint: string }[] = [
  { key: 'problem', label: 'Problem', hint: 'Something is wrong or does not work' },
  { key: 'improvement', label: 'Improvement', hint: 'An idea to make it better' },
  { key: 'question', label: 'Question', hint: 'How do I…?' },
]
export const FEEDBACK_TYPE_LABEL: Record<FeedbackType, string> = { problem: 'Problem', improvement: 'Improvement', question: 'Question' }

export const FEEDBACK_SEVERITIES: { key: FeedbackSeverity; label: string }[] = [
  { key: 'blocking', label: 'Blocking my work' },
  { key: 'annoying', label: 'Annoying' },
  { key: 'small', label: 'Small' },
]
export const FEEDBACK_SEVERITY_LABEL: Record<FeedbackSeverity, string> = { blocking: 'Blocking my work', annoying: 'Annoying', small: 'Small' }

export const FEEDBACK_STATUSES: { key: FeedbackStatus; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'in_progress', label: 'Looking at it' },
  { key: 'planned', label: 'Planned' },
  { key: 'fixed', label: 'Fixed' },
  { key: 'wont_do', label: "Won't do" },
  { key: 'duplicate', label: 'Duplicate' },
]
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = Object.fromEntries(FEEDBACK_STATUSES.map((s) => [s.key, s.label])) as Record<FeedbackStatus, string>
export const FEEDBACK_STATUS_TONE: Record<FeedbackStatus, 'info' | 'warn' | 'ok' | 'neutral' | 'crit'> = {
  new: 'info', in_progress: 'warn', planned: 'warn', fixed: 'ok', wont_do: 'neutral', duplicate: 'neutral',
}

export const FEEDBACK_TEXT = {
  PAGE_TITLE: 'Feedback',
  PAGE_SUB: 'Problems, improvements and questions from the team · everyone sees every item',
  REPORT: 'Report a problem',
  NEW: 'New feedback',
  FORM_TITLE: 'Tell us what happened',
  FORM_SUB: 'The page you are on and the last error on screen are added for you.',
  TYPE: 'Type',
  TITLE: 'Title',
  TITLE_HINT: 'One line, e.g. "In Review list does not load"',
  DESCRIPTION: 'Description',
  DESCRIPTION_HINT: 'What you did → what you expected → what you got. PO numbers help.',
  SEVERITY: 'How bad is it?',
  IMAGES: 'Screenshots',
  IMAGES_HINT: (max: number) => `Paste (Ctrl+V), drop or pick up to ${max} images`,
  IMAGES_FULL: (max: number) => `At most ${max} images`,
  IMAGE_TOO_BIG: (name: string) => `${name} is bigger than 5 MB`,
  IMAGE_NOT_IMAGE: (name: string) => `${name} is not an image`,
  CAPTURED: 'Added for you',
  SEND: 'Send',
  SENDING: 'Sending…',
  SENT: (id: string) => `Thank you: sent as #${id}`,
  CANCEL: 'Cancel',
  SEARCH: 'Search title or text…',
  ALL: 'All',
  MINE: 'Mine',
  MINE_HINT: 'Added by me, assigned to me, or I am added to it',
  EMPTY: 'No feedback yet. Use "Report a problem" at the top of any page.',
  LOADING: 'Loading…',
  STATUS: 'Status',
  DUPLICATE_OF: 'Duplicate of #',
  PEOPLE: 'People on this item',
  PEOPLE_HINT: 'They can change this item, like the person who added it.',
  ADD_PERSON: 'Add a person…',
  REMOVE: 'Remove',
  COMMENTS: 'Comments and changes',
  COMMENT_PLACEHOLDER: 'Add a comment…',
  COMMENT_SEND: 'Comment',
  SAVE: 'Save',
  SAVING: 'Saving…',
  EDIT: 'Edit',
  VIEW_ONLY: 'Only the person who added it, the people on it, or a developer / admin can change it. Everyone can comment.',
  ADD_IMAGES: 'Add images',
  REMOVE_IMAGE: 'Remove image',
  OPEN_PAGE: 'Open the page',
  REPORTED_BY: 'Added by',
  ASSIGNED_TO: 'Assigned to',
  NOBODY: 'Not assigned',
  YOU: 'you',
  ASSIGN_HINT: 'The person who will work on it. They can change the item too.',
  NO_IMAGES: 'No images',
} as const
