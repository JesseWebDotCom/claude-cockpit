// Cockpit 0.4.0 (the Deck): credentials are masked before anything is stored in the deck's memory or drawn.
// The idea and the list of patterns are adapted from claude-flightdeck's `redact` (MIT, Copyright (c) 2026
// Stephen Casella; see NOTICE), with the same rule: mask at the moment of recording, so no later draw can leak.

import { isObject, pathTail } from './deckfmt.ts'

const SECRETS: [RegExp, string][] = [
  [/(authorization\s*[:=]\s*)(bearer\s+|basic\s+)?\S+/gi, '$1$2\u2022\u2022\u2022'],
  [/\b(bearer)\s+[A-Za-z0-9._~+/-]{8,}=*/gi, '$1 \u2022\u2022\u2022'],
  [/\b(sk|pk|rk|ghp|gho|ghs|github_pat|xox[abprs])[-_][A-Za-z0-9_-]{8,}/g, '\u2022\u2022\u2022'],
  [/((?:api[_-]?key|access[_-]?token|token|secret|password|passwd|pwd)\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1\u2022\u2022\u2022'],
  [/(--(?:token|password|api-key|secret)[= ])\S+/gi, '$1\u2022\u2022\u2022'],
  [/(\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)=)\S+/g, '$1\u2022\u2022\u2022'],
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)[^\s@]+@/gi, '$1\u2022\u2022\u2022@'],
]

/** Credentials masked. Idempotent: a masked string stays as it is. */
export const redact = (s: string): string => SECRETS.reduce((t, [re, to]) => t.replace(re, to), s)

/** The tool families the gate groups by. */
export type Bucket = 'file' | 'shell' | 'other'

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'NotebookEdit', 'Glob', 'Grep'])
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
/** Tools whose successful call is an edit (counted in the receipt, written in the log). */
export const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])

export const bucketOf = (tool: string): Bucket => (FILE_TOOLS.has(tool) || tool === 'MultiEdit' ? 'file' : SHELL_TOOLS.has(tool) ? 'shell' : 'other')

/** The path an edit call names (`file_path`, or a notebook's `notebook_path`), '' when none. */
export const pathOf = (input: unknown): string => {
  const i = isObject(input) ? input : {}
  const p = typeof i.file_path === 'string' ? i.file_path : typeof i.notebook_path === 'string' ? i.notebook_path : typeof i.path === 'string' ? i.path : ''
  return p
}

/** One line saying what a call was about: its command, path, pattern or url; credentials masked. */
export const describeInput = (tool: string, input: unknown): string => {
  const i = isObject(input) ? input : {}
  const path = pathOf(i)
  const what =
    typeof i.command === 'string'
      ? i.command
      : path !== ''
        ? pathTail(path, 3)
        : typeof i.pattern === 'string'
          ? i.pattern
          : typeof i.url === 'string'
            ? i.url
            : typeof i.description === 'string'
              ? i.description
              : ''
  return redact(what !== '' ? `${tool} \u2192 ${what}` : tool)
}
