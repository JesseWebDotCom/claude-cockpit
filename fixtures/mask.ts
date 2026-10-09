// Credentials are masked before anything is stored in memory or drawn.
// The patterns below are the demo list, not a complete one.

import { isObject, pathTail } from './format.ts'

const SECRETS: [RegExp, string][] = [
  [/(authorization\\s*[:=]\\s*)(bearer\\s+|basic\\s+)?\\S+/gi, '$1$2***'],
  [/\\b(bearer)\\s+[A-Za-z0-9._~+/-]{8,}=*/gi, '$1 ***'],
  [/\\b(sk|pk|rk|ghp|gho|ghs|github_pat|xox[abprs])[-_][A-Za-z0-9_-]{8,}/g, '***'],
  [/((?:api[_-]?key|access[_-]?token|token|secret|password|passwd|pwd)\\s*[=:]\\s*)("[^"]*"|'[^']*'|\\S+)/gi, '$1***'],
]

/** Credentials masked. Idempotent: a masked string stays as it is. */
export const redact = (s: string): string => SECRETS.reduce((t, [re, to]) => t.replace(re, to), s)

/** The tool families a gate groups by. */
export type Bucket = 'file' | 'shell' | 'other'

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'NotebookEdit', 'Glob', 'Grep'])
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
export const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])

export const bucketOf = (tool: string): Bucket => (FILE_TOOLS.has(tool) || tool === 'MultiEdit' ? 'file' : SHELL_TOOLS.has(tool) ? 'shell' : 'other')

/** The path an edit call names, '' when none. */
export const pathOf = (input: unknown): string => {
  const i = isObject(input) ? input : {}
  return typeof i.file_path === 'string' ? i.file_path : typeof i.path === 'string' ? i.path : ''
}
