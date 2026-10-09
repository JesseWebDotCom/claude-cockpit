// What a lane is doing right now (cockpit v11): a short verb phrase from the tail of its tmux pane, so a row says
// "editing core.ts" or "running tests" instead of the bare word "working". Pure: it reads lines of text only.
//
// Sources, newest line first: a `PROGRESS:` line the lane printed; a tool line of Codex ("• Ran <command>",
// "• Edited <path>", "• Explored"), of Claude Code or OpenCode ("⏺ Bash(<command>)", "⏺ Update(<path>)", "→ Read <path>",
// "$ <command>"); else the last meaningful line of prose. Markers that are not work (the "esc to interrupt" footer,
// "Show details", output continuation lines, the prompt box) are skipped. Nothing here is invented: no line, no phrase.

import { clean, isCodeLike, isOutputLine, outputMask, unwrapLines } from './output.ts'
import { isShellPromptLine, stripGlyphs } from './shellprompt.ts'
import { statusLine } from './flightlog.ts'
import { gateCommandSource, gateLockSource } from './config.ts'

export type Doing = {
  // The short verb: "editing", "running tests", "check.sh gate"; '' when the line is prose.
  verb: string
  // One line for the row: the verb with its object ("editing core.ts"), or the prose cut short.
  phrase: string
  // The whole cleaned line, for the open row (up to 400 characters).
  full: string
}

export const PHRASE_MAX = 60
const FULL_MAX = 400

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()
const cut = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)).trimEnd() + '\u2026' : s)
const base = (p: string): string => {
  const clean = p.replace(/[`'"),;:]+$/g, '').replace(/^[`'"(]+/g, '')
  const parts = clean.split('/').filter(x => x !== '')
  return parts[parts.length - 1] ?? clean
}

// Lines that are the tool's own frame, not something the lane did.
const NOT_WORK = [
  /esc to interrupt|esc interrupt/i,
  /\? for shortcuts|f2 to view|for agents/i,
  /^\s*[+\u2795]\s*(?:Show details|\d+ lines?)/i,
  /ctrl\+[a-z] to expand/i,
  /^\s*[\u2514\u2502\u251c\u250c\u2510\u2518\u2500\u256d\u256e\u2570\u256f\u2503\u2501]/,
  /^\s*\u203a/,
  /^\s*(?:Worked|Thought) for\b/i,
  /^\s*[\u2022\u25cf\u23fa]?\s*Working\b/i,
  /weekly limit|\bwarnings?\b.*f2/i,
  /^\s*GPT-[\w.-]+ .*\u00b7/,
  /^\s*(?:STATE|YOU)\s*:/,
  /^\s*[\u2500-\u257f\s]+$/,
]

// A command, in words. The first matching rule wins; "rtk" (the output filter) and a leading "cd x &&" are ignored.
// The pattern a grep or rg command searches for: its first quoted string, else its first argument that is not a flag.
const grepPattern = (c: string): string => {
  const q = /(?:rg|grep|ag)\b[^|]*?\s(["'])(.+?)\1/.exec(c)?.[2]
  if (q !== undefined) return q
  const args = (/(?:^|\s|\|)(?:rg|grep|ag)\s+(.*)$/.exec(c)?.[1] ?? '').split(/\s+/).filter(a => a !== '' && !a.startsWith('-'))
  return args[0] ?? ''
}

export function commandVerb(command: string): { verb: string; object: string } {
  const c = squash(command)
    .replace(/^(?:rtk\s+)+/, '')
    .replace(/^cd\s+\S+\s*(?:&&|;)\s*/, '')
    .replace(/^(?:rtk\s+)+/, '')
  const writes = /^(?:cat|tee)\s*(?:-a\s*)?>>?\s*(\S+)|^(?:cat|tee)\b.*<<-?\s*['"]?\w+['"]?/.exec(c)
  if (writes !== null) return { verb: 'writing', object: writes[1] !== undefined ? base(writes[1]) : '' }
  const gate = new RegExp(gateCommandSource()).exec(c)
  if (gate !== null) return { verb: gate[0] + ' gate', object: '' }
  if (gateLockSource() !== '' && new RegExp(gateLockSource()).test(c)) return { verb: 'waiting for the gate', object: '' }
  if (/(?:^|\s)(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?test\b|\bvitest\b|\bpytest\b|\bplugin test\b|\bjest\b/.test(c)) return { verb: 'running tests', object: '' }
  if (/\btsc\b|\btypecheck\b/.test(c)) return { verb: 'type-checking', object: '' }
  if (/\beslint\b|(?:^|\s)(?:bun|npm|pnpm)\s+(?:run\s+)?lint\b/.test(c)) return { verb: 'linting', object: '' }
  if (/(?:^|\s)(?:bun|npm|pnpm)\s+(?:run\s+)?build\b|\bvite build\b/.test(c)) return { verb: 'building', object: '' }
  if (/(?:^|\s)(?:bun|npm|pnpm)\s+(?:install|add|i)\b/.test(c)) return { verb: 'installing', object: '' }
  if (/\bgit\s+commit\b/.test(c)) return { verb: 'committing', object: '' }
  if (/\bgit\s+push\b|\bgh\s+pr\b/.test(c)) return { verb: 'pushing', object: '' }
  if (/\bgit\s+(?:diff|status|log|show|branch|worktree|rebase|fetch|checkout|merge)\b/.test(c)) return { verb: 'checking git', object: '' }
  if (/(?:^|\s|\|)(?:rg|grep|ag)\s/.test(c)) {
    const pat = grepPattern(c)
    return { verb: 'searching', object: pat !== '' ? 'for ' + cut(pat, 24) : '' }
  }
  if (/(?:^|\s)(?:cat|sed\s+-n|head|tail|ls|find|wc|stat)\b/.test(c)) return { verb: 'reading', object: '' }
  if (/\bcurl\b|\bwget\b/.test(c)) return { verb: 'fetching', object: '' }
  const first = base(c.split(/\s+/)[0] ?? '')
  return first === '' ? { verb: 'running a command', object: '' } : { verb: 'running ' + first, object: '' }
}

const EDIT_WORD = /^(?:edit(?:ed|ing)?|update[ds]?|add(?:ed)?|creat(?:e|ed)|wr[io]te|wrote|modif(?:y|ied)|apply_patch|patch(?:ed)?)$/i
const READ_WORD = /^(?:read|explor(?:e|ed)|search(?:ed)?|open(?:ed)?|list(?:ed)?|glob|grep)$/i

// One cleaned line to a Doing, or null when it says nothing about work.
function lineDoing(raw: string): Doing | null {
  // COCKPIT-18: the line is cleaned (drawing, block, braille and powerline glyphs out) and a shell prompt is never work.
  if (isShellPromptLine(raw)) return null
  const line = stripGlyphs(raw.replace(/\u001b\[[0-9;]*[A-Za-z]/g, ''))
  if (line === '' || NOT_WORK.some(re => re.test(line))) return null
  const full = cut(line, FULL_MAX)
  const done = (verb: string, object: string): Doing => ({ verb, phrase: cut(object !== '' ? verb + ' ' + object : verb, PHRASE_MAX), full })

  // A line the lane printed itself: "PROGRESS: wiring the claim reader".
  const progress = /^\s*PROGRESS\s*:\s*(.+)$/i.exec(line)
  if (progress !== null) return { verb: '', phrase: cut(squash(progress[1] ?? ''), PHRASE_MAX), full }

  // Codex: "• Ran <command>", "• Edited path (+4 -1)", "• Explored", "• Read x".
  const codex = /^[\u2022\u25cf\u23fa*-]\s*(Ran|Edited|Updated|Added|Created|Explored|Read|Searched|Searching|Fetched)\b\s*(.*)$/.exec(line)
  if (codex !== null) {
    const word = codex[1] ?? ''
    const rest = (codex[2] ?? '').trim()
    if (word === 'Ran') {
      const v = commandVerb(rest)
      return done(v.verb, v.object)
    }
    if (EDIT_WORD.test(word)) return done('editing', base(rest.split(/\s+/)[0] ?? ''))
    if (/^(?:Fetched)$/.test(word)) return done('fetching', '')
    if (/^Search/.test(word)) return done('searching', '')
    return done('reading', rest.startsWith('(') ? '' : base(rest.split(/\s+/)[0] ?? ''))
  }

  // Claude Code and OpenCode: "⏺ Bash(cmd)", "● Update(path)", "→ Read path", "← Edit path", "✱ Grep "x"", "$ cmd".
  const dollar = /^\s*\$\s+(.+)$/.exec(line)
  if (dollar !== null) {
    const v = commandVerb(dollar[1] ?? '')
    return done(v.verb, v.object)
  }
  // OpenCode's own markers need their marker character: "\u2731 Grep \"x\" (3 matches)", "\u2731 Glob \"*.ts\"", "\u2192 Read path", "\u2190 Edit path",
  // "\u2190 Write path", "% WebFetch url", "\u2022 Task ...". A tool name without a marker is not matched here.
  const oc = /^[\u23fa\u25cf\u2022\u2192\u2190\u2731\u2699\u25c6\u25c7%*>~]\s*(Grep|Glob|List|Ls|Read|Edit|MultiEdit|Write|Patch|ApplyPatch|apply_patch|Update|NotebookEdit|WebFetch|WebSearch|Task|Agent|Skill|Todo\w*|Question|Lsp)\b[\s(:]*(.*?)\)?$/i.exec(line)
  if (oc !== null) {
    const name = (oc[1] ?? '').toLowerCase()
    const arg = (oc[2] ?? '').replace(/\s*\(\d+ (?:matches|results|files?)\)\s*$/i, '').trim()
    const quoted = /^(["'`])(.+?)\1/.exec(arg)?.[2]
    const first = base((quoted ?? arg).split(/\s+/)[0] ?? '')
    if (name === 'grep') return done('searching', (quoted ?? arg) !== '' ? 'for ' + cut(quoted ?? arg.split(/\s+/)[0] ?? '', 24) : '')
    if (name === 'glob') return done('finding', (quoted ?? arg) !== '' ? 'files ' + cut(quoted ?? arg.split(/\s+/)[0] ?? '', 24) : 'files')
    if (name === 'list' || name === 'ls') return done('listing', first)
    if (name === 'read') return done('reading', first)
    if (name === 'write') return done('writing', first)
    if (/^(?:edit|multiedit|patch|applypatch|apply_patch|update|notebookedit)$/.test(name)) return done('editing', first)
    if (name === 'webfetch') return done('fetching', arg !== '' ? cut(arg.replace(/^https?:\/\//, '').split('/')[0] ?? '', 30) : '')
    if (name === 'websearch') return done('searching the web', '')
    if (name === 'skill') return done('loading a skill', first)
    if (name.startsWith('todo')) return done('planning', '')
    if (name === 'question') return done('asking a question', '')
    if (name === 'lsp') return done('checking code', '')
    return done('running a sub-task', '')
  }
  const tool = /^[\u23fa\u25cf\u2022\u2192\u2190\u2731*>~-]*\s*(Bash|Edit|MultiEdit|Write|Update|NotebookEdit|Read|Grep|Glob|WebFetch|WebSearch|Task|Agent|TodoWrite)\b[\s(:]*(.*?)\)?$/.exec(line)
  if (tool !== null) {
    const name = tool[1] ?? ''
    const arg = (tool[2] ?? '').trim()
    if (name === 'Bash') {
      const v = commandVerb(arg)
      return done(v.verb, v.object)
    }
    if (/^(?:Edit|MultiEdit|Write|Update|NotebookEdit)$/.test(name)) return done('editing', base(arg.split(/\s+/)[0] ?? ''))
    if (name === 'Read') return done('reading', base(arg.split(/\s+/)[0] ?? ''))
    if (name === 'Grep' || name === 'Glob') return done('searching', '')
    if (name === 'WebFetch' || name === 'WebSearch') return done('researching', '')
    if (name === 'TodoWrite') return done('planning', '')
    return done('running a sub-task', '')
  }
  if (READ_WORD.test(line.split(/\s+/)[0] ?? '') && /^[\u2022\u25cf]/.test(raw.trim())) return done('reading', '')

  // Prose the lane wrote ("• The full gate reached the backend suite..."): its first sentence, cut.
  const prose = line.replace(/^[\u2022\u25cf\u23fa*>\-\s]+/, '')
  if (prose.length < 12 || /^[\W\d_]+$/.test(prose) || isCodeLike(prose)) return null
  const sentence = /^(.+?[.!?])(?:\s|$)/.exec(prose)?.[1] ?? prose
  return { verb: '', phrase: cut(sentence, PHRASE_MAX), full }
}

// The newest meaningful line of the tail: what the lane is doing now. null when the tail says nothing about work.
// COCKPIT-15: wrapped lines are joined first (the pane hard-wraps), and tool OUTPUT (grep hits, code, diffs, an indented result under a
// tool call) is skipped, so a lane that just ran a grep is "searching for ageLabel", never the grep's first hit.
export function doingOf(lines: readonly string[]): Doing | null {
  const logical = unwrapLines(lines)
  const isOutput = outputMask(logical)
  for (let i = logical.length - 1; i >= 0; i--) {
    if (isOutput[i] === true) continue
    const d = lineDoing(logical[i] ?? '')
    if (d !== null) return d
  }
  return null
}

// A text wrapped on word boundaries into lines of at most `width` characters (a word longer than that is cut), at most
// `maxLines` lines; the last ends with an ellipsis when the text did not fit. Used for the open row's full text, where
// the drawing's width is not known to the caller.
export function wrapChars(text: string, width: number, maxLines: number): string[] {
  const words = squash(text).split(' ').filter(w => w !== '')
  const lines: string[] = []
  let line = ''
  for (const raw of words) {
    const word = raw.length > width ? raw.slice(0, width - 1) + '\u2026' : raw
    const next = line === '' ? word : line + ' ' + word
    if (next.length <= width) {
      line = next
      continue
    }
    lines.push(line)
    line = word
  }
  if (line !== '') lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = cut((kept[maxLines - 1] ?? '') + ' ' + lines.slice(maxLines).join(' '), width)
  return kept
}

// ---------------------------------------------------------------------------
// What a crew row says

export const CHIP_MAX = 18

// The chip: the state word, except that the generic "Active" says nothing, so it becomes the verb of what the lane is
// doing ("editing", "running tests", "check.sh gate"), cut to fit. Every other state word stays as it was.
export function chipWordOf(stateWord: string, doing: Doing | null): string {
  if (stateWord !== 'Active') return stateWord
  const v = doing?.verb ?? ''
  if (v === '') return stateWord
  return v.length > CHIP_MAX ? v.slice(0, CHIP_MAX - 1) + '\u2026' : v
}

// ---------------------------------------------------------------------------
// The task line of a crew row (COCKPIT-21). The text after the item id is a HUMAN TITLE and nothing else: it never comes from the pane (a pane holds
// code, logs and tool output; "COCKPIT-19 . et) % period) / 1000) * 100) / 100 + 's'" was a fragment of source scraped from one).
// Source order: (1) the claim file's line 3 (a short plain title), (2) the first heading of the item's brief, (3) none, and then the line is the
// id and the status word. `plainTitle` is the gate every source passes.

const ID_LEAD = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*\d[A-Za-z0-9]*\s*[:\u2013\u2014-]\s+/
const TITLE_MAX = 60

/**
 * A title a person wrote, cut to one short line; '' when the text is not one. The item id the text starts with is dropped, plain parenthesised
 * asides ("(codex-a)") are dropped, and what is left must have no code characters at all (brackets, braces, angle brackets, operators, quotes,
 * slashes, pipes, semicolons, backticks, dollar signs) and must not read as code. A single apostrophe inside a word ("don't") is fine. Bad text is
 * skipped whole, never cut or repaired.
 */
export function plainTitle(raw: string, item = '', max = TITLE_MAX): string {
  // Markdown emphasis out (stars, and underscores at a word's edge); a `*` anywhere else is an operator and is caught below.
  let t = squash(stripGlyphs(raw.replace(/(^|\s)\*{1,3}(?=\S)|(?<=\S)\*{1,3}(?=\s|$)/g, '$1').replace(/(^|\s)_{1,3}(?=\S)|(?<=\S)_{1,3}(?=\s|$)/g, '$1')))
  t = t.replace(/`([A-Za-z0-9 ._-]*)`/g, '$1')
  if (item !== '' && t.toLowerCase().startsWith(item.toLowerCase())) t = t.slice(item.length).replace(/^\s*[:\u2013\u2014.-]\s*/, '')
  t = t.replace(ID_LEAD, '')
  if (/\w\(|\)\s*[-+*/%]|[-+*/%=]\s*\(/.test(t)) return ''
  for (let prev = ''; prev !== t; ) {
    prev = t
    t = t.replace(/\s\([A-Za-z][A-Za-z ,.-]*\)/g, '')
  }
  t = squash(t)
  if (t.length < 3 || !/[A-Za-z]{3,}/.test(t)) return ''
  if (/[()[\]{}<>=+*\\|;$`"%^~@#&]|\/|https?:|\.\./.test(t)) return ''
  if (/'/.test(t.replace(/(?<=[A-Za-z])'(?=[A-Za-z])/g, ''))) return ''
  if (isCodeLike(t) || isShellPromptLine(t)) return ''
  return cut(t, max)
}

// A file name with nothing odd in it: "core.ts", "SettingsRow.tsx".
export const isCleanFileName = (s: string): boolean => /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,40}\.[A-Za-z0-9]{1,6}$/.test(s)

const OBJECT_VERBS = new Set(['editing', 'reading', 'writing', 'listing'])
const BARE_VERBS = new Set(['running tests', 'type-checking', 'linting', 'building', 'installing', 'committing', 'pushing', 'checking git', 'searching', 'finding'])

/**
 * The part of a lane's own tool line a row may keep: "editing core.ts" (a verb of editing, reading, writing or listing and a CLEAN file name; with
 * any other object only the verb) or one of the fixed verbs ("running tests"). Prose, a PROGRESS line, a search pattern, a command name: never.
 * '' when there is nothing safe to show.
 */
export function cleanVerbPhrase(d: Doing | null): string {
  if (d === null || d.verb === '') return ''
  const verb = squash(stripGlyphs(d.verb))
  if (BARE_VERBS.has(verb) || /^[\w.-]{1,30} gate$/.test(verb)) return verb
  if (!OBJECT_VERBS.has(verb)) return ''
  const object = squash(stripGlyphs(d.phrase)).slice(verb.length).trim()
  return isCleanFileName(object) ? verb + ' ' + object : verb
}

/**
 * Line 2 of a crew row: "<ITEM> . <title>", then the lane's clean verb ("editing core.ts") when it fits; with no title, "<ITEM> . <verb>" or
 * "<ITEM> . <status word>". The title comes from `claimTitle` (the claim's line 3), else `title` (the brief's heading); both pass plainTitle. The
 * pane is never a source of the title. A lane with no item says "idle" when it is not working, and nothing while it works.
 */
export function taskLineOf(o: { item: string; title: string; claimTitle?: string; doing: Doing | null; isSleeping: boolean; isWorking: boolean; statusWord?: string }): string {
  if (o.item === '') {
    const v = o.isSleeping ? '' : cleanVerbPhrase(o.doing)
    return v !== '' ? v : o.isWorking ? '' : 'idle'
  }
  const title = plainTitle(o.claimTitle ?? '', o.item) || plainTitle(o.title, o.item)
  const verb = o.isSleeping ? '' : cleanVerbPhrase(o.doing)
  const word = squash(o.statusWord ?? '')
  if (title !== '') {
    const line = o.item + ' \u00b7 ' + title
    return verb !== '' && line.length + verb.length + 3 <= o.item.length + TITLE_MAX + 20 ? line + ' \u00b7 ' + verb : line
  }
  if (verb !== '') return o.item + ' \u00b7 ' + verb
  return word !== '' ? o.item + ' \u00b7 ' + word : o.item
}

// Line 2 of a lane's row: the item it owns and what it is doing, one line ("COCKPIT-10 \u00b7 editing core.ts"); a sleeper
// shows its item only; either part alone when the other is missing; '' when there is nothing.
export function itemLineOf(item: string, doing: Doing | null, isSleeping: boolean): string {
  const d = isSleeping ? '' : cleanVerbPhrase(doing)
  return [item, d].filter(x => x !== '').join(' \u00b7 ')
}

// ---------------------------------------------------------------------------
// The open card's "Doing" and "Last report" (COCKPIT-22). Both are read from places that can hold code or log text (a pane, a report), so every
// candidate passes `plainTitle` first; the scan goes from the newest pane line backwards and takes the first that passes. A fragment never shows.

export const DOING_MAX = 120
export const REPORT_MAX = 140
const SENTENCE = /^(.+?[.!?])(?:\s|$)/

// A sentence a person could have said, not the tail of a wrapped code or log line: at least three words, no snake_case word, no command flag, no long
// id-like token, and (unless the lane labelled it with PROGRESS:) it starts with a capital letter, so a line that starts mid-sentence is not taken.
function readableSentence(t: string, labelled: boolean): boolean {
  const words = t.split(' ').filter(w => w !== '')
  if (words.length < 3) return false
  if (!labelled && !/^[A-Z]/.test(t)) return false
  if (words.some(w => /\w_\w/.test(w) || /^--?[A-Za-z]/.test(w) || (w.length >= 14 && /\d/.test(w) && /[A-Za-z]/.test(w)))) return false
  return true
}

// The first sentence of a prose line, bullets and a "PROGRESS:" label off, through the gate. '' when it is not a plain sentence.
function proseOf(full: string, item: string, max: number): string {
  const labelled = /^\s*PROGRESS\s*:/i.test(full)
  const prose = full.replace(/^\s*PROGRESS\s*:\s*/i, '').replace(/^[\u2022\u25cf\u23fa*>\-\s]+/, '')
  // A status bar or header ("build \u00b7 claude-sonnet-5-5") is the tool's frame, not a sentence.
  if (prose.includes('\u00b7')) return ''
  const t = plainTitle(SENTENCE.exec(prose)?.[1] ?? prose, item, max)
  return t !== '' && readableSentence(t, labelled) ? t : ''
}

// The pane from its newest logical line backwards: the first line `pick` turns into a non-empty string. Tool output is skipped.
function scanPane(lines: readonly string[], pick: (d: Doing) => string): string {
  const logical = unwrapLines(lines)
  const isOutput = outputMask(logical)
  for (let i = logical.length - 1; i >= 0; i--) {
    if (isOutput[i] === true) continue
    const d = lineDoing(logical[i] ?? '')
    if (d === null) continue
    const got = pick(d)
    if (got !== '') return got
  }
  return ''
}

/** The newest pane line that reads as work in plain words: a clean verb phrase ("editing core.ts") or a human sentence. '' when none passes. */
export const paneDoingOf = (lines: readonly string[], item = ''): string => scanPane(lines, d => (d.verb !== '' ? cleanVerbPhrase(d) : proseOf(d.full, item, DOING_MAX)))

/** The newest pane line that is a plain sentence (no tool line), other than `skip`. '' when none passes. */
export const paneSentenceOf = (lines: readonly string[], item = '', skip = ''): string =>
  scanPane(lines, d => {
    if (d.verb !== '') return ''
    const t = proseOf(d.full, item, REPORT_MAX)
    return t === skip ? '' : t
  })

/**
 * What the open card's "Doing" says, in order: the claim's `now:` line, the pane's newest plain line (`pane`, from paneDoingOf), the claim's title, the
 * brief heading, the status word. Every text passes plainTitle. A sleeping lane's pane and `now:` are history, so it skips to the title.
 */
export function doingLineOf(o: { now?: string; pane: string; claimTitle?: string; heading: string; item: string; statusWord: string; isSleeping: boolean }): string {
  if (!o.isSleeping) {
    const now = plainTitle(o.now ?? '', o.item, DOING_MAX)
    if (now !== '') return now
    const pane = plainTitle(o.pane, '', DOING_MAX)
    if (pane !== '') return pane
  }
  return plainTitle(o.claimTitle ?? '', o.item, DOING_MAX) || plainTitle(o.heading, o.item, DOING_MAX) || squash(o.statusWord)
}

const dropAsides = (s: string): string => {
  let t = s
  for (let prev = ''; prev !== t; ) {
    prev = t
    t = t.replace(/\s*\([^()]*\)/g, '')
  }
  return squash(t)
}
const markdownOut = (s: string): string => squash(s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]+/g, ''))

/**
 * A report file as one plain line: its first heading and its Status line ("the task line never shows fragments \u00b7 done, installed, tested").
 * Each part passes plainTitle (the heading without its item lead, the word "report" and parenthesised asides); a Status line that fails whole gives
 * its first sentence that passes. Either part alone when the other is not plain; '' when neither is.
 */
export function reportSummaryOf(text: string, item = ''): string {
  const h = /^#\s+(.+)$/m.exec(text)?.[1] ?? ''
  const heading = plainTitle(dropAsides(markdownOut(h).replace(/\s+report\b:?\s*/i, ': ').replace(/:\s*$/, '')), item, 80)
  const raw = markdownOut(statusLine(text).replace(/^(?:Status|Gate)\s*:\s*/i, ''))
  const whole = plainTitle(dropAsides(raw), item, REPORT_MAX)
  const status = whole !== '' ? whole : raw.split(/(?<=[.!?])\s+/).map(x => plainTitle(dropAsides(x), item, REPORT_MAX)).find(x => x !== '') ?? ''
  return [heading, status].filter(x => x !== '').join(' \u00b7 ')
}

/**
 * What the card's "Last report" says: the newest report file of the lane's item (its heading and Status line), else the lane's progress label, else its
 * newest plain sentence (other than `skip`, the Doing line), else '' (the row is omitted).
 */
export function lastReportOf(o: { reportText: string | null; item: string; paneLines: readonly string[]; progressLabel?: string; skip?: string }): string {
  const fromFile = o.reportText === null ? '' : reportSummaryOf(o.reportText, o.item)
  if (fromFile !== '') return fromFile
  const label = plainTitle(o.progressLabel ?? '', o.item, REPORT_MAX)
  if (label !== '' && label !== o.skip) return label
  return paneSentenceOf(o.paneLines, o.item, o.skip ?? '')
}
