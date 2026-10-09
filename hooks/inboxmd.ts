// `/cockpit bug <text>` and `/cockpit idea <text>` (cockpit 0.5.0): one line "- <ISO time> <text>" appended to
// .cockpit/inbox/bugs.md or ideas.md. Pure: the path, the line and the refusal; the write is in register.tsx.

export type InboxKind = 'bug' | 'idea'
export const INBOX_MD_MAX = 2000

/** "bug" and "idea" (and "feature", an old word for idea) to a kind; null for anything else. */
export const inboxKindOf = (word: string): InboxKind | null => (word === 'bug' ? 'bug' : word === 'idea' || word === 'feature' ? 'idea' : null)

export const inboxMdFile = (kind: InboxKind): string => (kind === 'bug' ? 'bugs.md' : 'ideas.md')

/** What the Add Bug and Add Idea buttons put in the prompt box: the command and a space, ready for the text. */
export const promptStarter = (kind: InboxKind): string => '/cockpit ' + kind + ' '

/** What to type, when the prompt box cannot be filled (or the text is empty). */
export const typeHint = (kind: InboxKind): string => 'Type /cockpit ' + kind + ' followed by ' + (kind === 'bug' ? 'what went wrong' : 'what you would like') + '.'

export type InboxMdLine = { ok: true; line: string; shown: string } | { ok: false; error: string }

/** The line to append, or the refusal (empty text says what to type). Control characters are removed and the text is one line. */
export function inboxMdLine(kind: InboxKind, rawText: string, nowMs: number): InboxMdLine {
  const text = rawText.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, INBOX_MD_MAX)
  if (text === '') return { ok: false, error: typeHint(kind) }
  return { ok: true, line: '- ' + new Date(nowMs).toISOString() + ' ' + text + '\n', shown: text.length > 70 ? text.slice(0, 69) + '\u2026' : text }
}
