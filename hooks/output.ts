// Tool OUTPUT is never prose (cockpit). A lane's pane shows what the lane SAID and what its tools PRINTED; the
// "Doing" phrase and the card's text must come from the first, never the second. Pure rules, no host:
//   - unwrapLines: the pane hard-wraps long text at its width, so a wrapped line is joined back into one logical line;
//   - isOutputLine: a line that is tool output: a grep hit (`path:line:content`, `path:line`), a numbered file line, a diff or
//     patch line, a code or comment line, "(no output)";
//   - outputMask: which lines are output, counting an INDENTED continuation under a tool-call line as output too;
//   - isSentence: a line that reads as a sentence a person wrote.
// Used by doing.ts (what a lane is doing), core.ts (the tail) and lastReportOf (the card's "Last report").

import { isShellPromptLine } from './shellprompt.ts'

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g
const BOX_EDGE = /^[\s\u2502\u2503|]+|[\s\u2502\u2503|]+$/g

export const clean = (raw: string): string => raw.replace(ANSI, '').replace(BOX_EDGE, '').replace(/\s+$/, '')
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()
const indentOf = (raw: string): number => {
  const m = /^[\s\u2502\u2503|]*/.exec(raw.replace(ANSI, ''))
  return (m?.[0] ?? '').replace(/\t/g, '  ').length
}

// ---------------------------------------------------------------------------
// Wrapped lines

// The width the pane wraps at: the longest line that is not a box rule or a footer bar. 0 (no joining) when the pane is narrow
// or when too few lines are exactly that wide to be a wrap and not a coincidence (three, or two at 70 columns or more).
function wrapWidth(lines: readonly string[]): number {
  const lens = lines.map(l => clean(l)).filter(t => t !== '' && !/[\u2500-\u257f]/.test(t)).map(t => t.length)
  const max = Math.max(0, ...lens)
  if (max < 30) return 0
  // A pane that wraps has several lines cut at exactly its width (a line a column short is a break at a space).
  const exact = lens.filter(n => n === max).length
  return exact >= 3 || (exact >= 2 && max >= 70) ? max : 0
}

// Joins every line that fills the pane's width with the line after it: the pane cut it there, the text goes on. A break inside a
// word ("Gr" + "ep") rejoins without a space; a break between words or after punctuation rejoins with one.
export function unwrapLines(lines: readonly string[]): string[] {
  const w = wrapWidth(lines)
  if (w === 0) return lines.map(l => l.replace(ANSI, ''))
  const out: string[] = []
  let acc: string | null = null
  let prevLen = 0
  for (const raw of lines) {
    const line = raw.replace(ANSI, '').replace(/\s+$/, '')
    if (acc !== null) {
      const a: string = acc
      // A line cut at exactly the pane's width was cut inside a word ("Gr" + "ep"); one a column short was cut at a space (the space is
      // gone), so the two halves rejoin with one.
      const joiner = prevLen === w && /[\w]$/.test(a) && /^[\w]/.test(line) ? '' : /^\s/.test(line) || /\s$/.test(a) ? '' : ' '
      acc = a + joiner + line
    } else acc = line
    prevLen = clean(line).length
    if (clean(line).length >= w - 1 && clean(line) !== '' && !/^\s*$/.test(line)) continue
    out.push(acc)
    acc = null
  }
  if (acc !== null) out.push(acc)
  return out
}

// ---------------------------------------------------------------------------
// What is output

const COMMENT = /^(?:\/\/|\/\*|\*\/|\*\s|#!\/)|\*\/$/
const GREP_HIT = /^(?:[\w@~.+-]+\/)*[\w@.+-]+\.[A-Za-z0-9]{1,6}:\d+(?::\d+)?(?:[:\s]|$)/
const NUMBERED = /^\d{1,6}(?::\S|\s*[|\u2192]\s)/
const DIFF = /^(?:@@ |diff --git |index [0-9a-f]{6,}|(?:\+\+\+|---) \S|[+-]\S|[+-]\s{2,}\S|\(?[+-]\d+ [+-]\d+\)?$)/
const CODE_START = /^(?:&&|\|\||\?\?|=>|[)}\]]|\.\w+\(|\?\s|:\s)/
const CODE_KEYWORD = /^(?:export|import|const|let|var|function|return|if|else|for|while|class|interface|type|async|await|try|catch|throw|switch|case|default|def|from|public|private)\b/
const CODE_BITS = [/=>/, / && /, / \|\| /, / [=!]==? /, /\$\{/, /\)\s*[;{]/, /\?\.\w/, /\?\?/, /\w+\??: (?:string|number|boolean|unknown|any|void)\b/, /<\w+(?:,\s*\w+)*>\(/, /\\u[0-9a-f]{4}/i]

// A line that is mostly code: operators, a statement ending, a keyword statement, a high share of code punctuation.
export function isCodeLike(t: string): boolean {
  if (t === '') return false
  if (CODE_START.test(t) || COMMENT.test(t)) return true
  if (/[{;]$|=>$|\(\s*$|\[\s*$/.test(t)) return true
  if (CODE_BITS.some(re => re.test(t))) return true
  if (CODE_KEYWORD.test(t) && /[=({;:<>]/.test(t)) return true
  if (/^(?:return|break|continue|else|try|finally|do)(?:\s+\S+)?;?$/.test(t)) return true
  if (/^["'{[][^\s]*"?\s*:/.test(t)) return true
  const sym = (t.match(/[{}()[\];=<>&|\\$]/g) ?? []).length
  return t.length > 8 && sym / t.length > 0.12
}

// A line that is tool output, judged on its own text.
export function isOutputLine(raw: string): boolean {
  // a shell prompt (powerline segments, a user and branch line, a right prompt) is neither work nor a sentence.
  if (isShellPromptLine(raw)) return true
  const c = clean(raw)
  const t = squash(c)
  if (t === '') return false
  if (/^\(no output\)$|^EOF$/.test(t)) return true
  // The diff rule reads the line with its inner spacing ("-  return p" is a removed line, "- a bullet" is not).
  return GREP_HIT.test(t) || NUMBERED.test(t) || DIFF.test(c) || isCodeLike(t)
}

// A tool-call line: "$ cmd", or a marker (OpenCode "✱ Grep", "→ Read", "← Edit", "% WebFetch", "• Task"; Claude "⏺ Bash(", Codex "• Ran")
// followed by a tool name. These are what a lane DID, never output.
const MARK = '[\\u23fa\\u25cf\\u2022\\u2192\\u2190\\u2731\\u2699\\u25c6\\u25c7%*>~]'
const TOOLS = 'Bash|Ran|Edited?|Updated?|Added|Created?|Explored?|Read|Searched|Searching|Fetched|MultiEdit|Write|Patch|ApplyPatch|apply_patch|NotebookEdit|Grep|Glob|List|Ls|WebFetch|WebSearch|Task|Agent|Skill|Todo\\w*|Question|Lsp'
const TOOL_LINE = new RegExp('^(?:\\$\\s+\\S|' + MARK + '\\s*(?:' + TOOLS + ')\\b)', 'i')
export const isToolLine = (raw: string): boolean => TOOL_LINE.test(squash(clean(raw)))

// Which lines are output: each judged alone, and every line indented deeper than the tool-call line above it (its printed result),
// until a line at or under the tool line's indent. Blank lines change nothing.
export function outputMask(lines: readonly string[]): boolean[] {
  const mask: boolean[] = []
  let toolIndent = -1
  for (const raw of lines) {
    const t = squash(clean(raw))
    if (t === '') {
      mask.push(false)
      continue
    }
    const indent = indentOf(raw)
    if (isToolLine(raw)) {
      toolIndent = indent
      mask.push(false)
      continue
    }
    if (toolIndent >= 0 && indent > toolIndent) {
      mask.push(true)
      continue
    }
    if (toolIndent >= 0 && indent <= toolIndent) toolIndent = -1
    mask.push(isOutputLine(raw))
  }
  return mask
}

// ---------------------------------------------------------------------------
// What is a sentence

// A line a person wrote as a sentence: at least four words, mostly letters, no code, not a tool-call line. "PROGRESS:" and
// "REPORT:" prefixes and a leading bullet are not part of it.
export function isSentence(raw: string): boolean {
  const t = squash(clean(raw)).replace(/^(?:[\u2022\u25cf\u23fa*>-]\s*)?(?:PROGRESS|REPORT)\s*:\s*/i, '').replace(/^[\u2022\u25cf\u23fa*>-]\s+/, '')
  if (t.length < 12 || isOutputLine(t) || isToolLine(t)) return false
  const words = t.split(' ').filter(w => /\p{L}{2,}/u.test(w))
  if (words.length < 4) return false
  const letters = (t.match(/\p{L}/gu) ?? []).length
  return letters / t.length >= 0.7
}
