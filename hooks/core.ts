// Pure parts of Cockpit: no mods API, no I/O. Unit tested in tests/core.test.ts.

import { outputMask, unwrapLines } from './output.ts'
import { atShellPrompt } from './shellprompt.ts'
import { names as ownerCfg } from './names.ts'
import { markersSay } from './config.ts'
import type { LaneKind } from './config.ts'
import { cleanLine, isJunkLine } from './text.ts'

export type LaneState = 'working' | 'idle' | 'absent'

export type Lock = {
  owner: string
  lane: string
  time: string
  item: string
}

export type ReportFile = { name: string; mtimeMs: number }

// Codex is working when its pane text says "Working" or "esc to interrupt".
export const CODEX_WORKING = /Working|esc to interrupt/

// OpenCode is working when its pane shows "esc interrupt" (its footer while a turn runs).
export const OPENCODE_WORKING = /esc interrupt/

export const HOUR_MS = 3_600_000
// Stale only when the lock file is older than 6 h AND the pane has had no change for 30 min.
export const STALE_LOCK_MS = 6 * HOUR_MS
export const STALE_QUIET_MS = 30 * 60_000

export const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

// A shell prompt ends in one of these marks, optionally followed by blanks.
const SHELL_PROMPT = /(^|[\s\]\)])[$%#>\u276f\u279c]\s*$/

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g

export function stripAnsi(s: string): string {
  return s.replace(ANSI, '')
}

// The last `n` lines of a pane capture, after dropping the blank rows below the cursor.
export function lastLines(text: string, n: number): string[] {
  const lines = stripAnsi(text).split('\n').map(l => l.replace(/\s+$/, ''))
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.slice(-n)
}

export function lastNonEmpty(lines: readonly string[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = (lines[i] ?? '').trim()
    if (line !== '') return line
  }
  return ''
}

export function isShellPrompt(line: string): boolean {
  const t = line.trim()
  return t !== '' && SHELL_PROMPT.test(t)
}

export function classifyCodex(lines: readonly string[]): 'working' | 'idle' {
  return markersSay('codex', lines)
}

export function classifyOpencode(lines: readonly string[]): 'working' | 'idle' {
  return markersSay('opencode', lines)
}

/** A lane of a configured kind: absent when its session is missing, idle at a shell prompt, else by that kind's markers (config.ts). */
export function classifyKind(kind: LaneKind, present: boolean, lines: readonly string[]): LaneState {
  if (!present) return 'absent'
  if (atShellPrompt(lines)) return 'idle'
  return markersSay(kind, lines)
}

// ---------------------------------------------------------------------------
// The tail: the last meaningful line of a pane, with the footer chrome dropped.

const CHROME = [
  /\? for shortcuts/i,
  /warnings/i,
  /f2 to view/i,
  /for agents/i,
  /esc to interrupt/i,
  /esc interrupt/i,
  // Codex's own footer: the weekly limit line, any warning sign line, the empty input prompt and the
  // "<model> <effort> . <path>" status line.
  /weekly limit/i,
  /\u26a0/,
  /Ask Codex to do anything/i,
  /^[\w.-]+ (?:minimal|low|medium|high|xhigh) \u00b7 /,
]
const BOX_ONLY = /^[\s\u2500-\u257f\u2580-\u259f|+_=-]*$/
const BARE_PROMPT = /^[>\u203a\u276f$%#]$/
const BOX_EDGE = /^[\s\u2502\u2503|]+|[\s\u2502\u2503|]+$/g

// A line that is not worth showing as a tail: blank, a box border, a footer hint, a shell prompt, or
// junk (code, terminal art, a clock or prompt fragment: see text.ts).
// The user's login name: a line that holds it is a shell prompt, not work (set once from $USER by register.tsx).
let shellUser = ''
export const setShellUser = (name: string): void => {
  shellUser = /^[\w.-]{3,}$/.test(name) ? name : ''
}
export const shellUserName = (): string => shellUser

export function isChromeLine(line: string): boolean {
  const t = line.trim()
  if (t === '' || BOX_ONLY.test(t) || BARE_PROMPT.test(t)) return true
  if ((shellUser !== '' && t.includes(shellUser)) || t.includes('main \u2193')) return true
  return CHROME.some(re => re.test(t)) || isJunkLine(t)
}

// The last 1 line that is not chrome or junk, noise characters stripped, whitespace collapsed and box
// edges cut; '' when nothing passes (nothing is shown, never junk).
export function meaningfulTail(pane: readonly string[]): string {
  // COCKPIT-15: wrapped lines are joined and tool output (grep hits, code, diffs, an indented result under a tool call) is skipped.
  const lines = unwrapLines(pane)
  const isOutput = outputMask(lines)
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isOutput[i] === true) continue
    const raw = lines[i] ?? ''
    if (isChromeLine(raw)) continue
    const clean = cleanLine(raw.replace(BOX_EDGE, ''))
    if (clean !== '' && !isChromeLine(clean)) return clean
  }
  return ''
}

export function isOpencodeLane(lane: string): boolean {
  return lane.startsWith('opencode')
}

// Present session: classify by the lane's kind. Missing session: absent.
export function classifyLane(lane: string, present: boolean, lines: readonly string[]): LaneState {
  if (!present) return 'absent'
  // COCKPIT-18: a pane that ends at a shell prompt has nothing running in it, whatever marker the scrollback above still shows.
  if (atShellPrompt(lines)) return 'idle'
  return isOpencodeLane(lane) ? classifyOpencode(lines) : classifyCodex(lines)
}

// A lock file is one line of tab-separated fields: owner, lane, time, item.
// Extra tabs belong to the item. Blank or missing text is no lock.
export function parseLock(text: string): Lock | null {
  const line = text.split('\n').find(l => l.trim() !== '')
  if (line === undefined) return null
  const [owner = '', lane = '', time = '', ...rest] = line.replace(/\r$/, '').split('\t')
  return { owner: owner.trim(), lane: lane.trim(), time: time.trim(), item: rest.join('\t').trim() }
}

// One line of a pane, trimmed to `max` characters, whitespace collapsed.
export function oneLine(s: string, max = 80): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, Math.max(1, max - 3)) + '...' : t
}

export function ageLabel(ms: number): string {
  if (!fin(ms)) return '-'
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 100) return s + 's'
  if (s < 6000) return Math.floor(s / 60) + 'm'
  return Math.floor(s / 3600) + 'h'
}

// Remembers when a pane's text last changed. Memory only; the text itself is not kept here.
export type Seen = { sig: string; since: number }

export function trackChange(prev: Seen | undefined, lines: readonly string[], now: number): Seen {
  const sig = lines.join('\n')
  if (prev !== undefined && prev.sig === sig) return prev
  return { sig, since: now }
}

export function newestReports(files: readonly ReportFile[], count = 3): ReportFile[] {
  return [...files].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, count)
}

export type LaneRow = {
  lane: string
  state: LaneState
  lock: Lock | null
  isStale: boolean
  sinceMs: number
  tail: string
}

// Stale: an idle lane with a lock file older than 6 h whose pane has not changed for 30 min.
// An unknown lock age or an unknown quiet time is never stale.
export function isStaleLane(
  state: LaneState,
  lock: Lock | null,
  lockMtimeMs: number | null | undefined,
  sinceMs: number,
  now: number,
): boolean {
  if (state !== 'idle' || lock === null || !fin(lockMtimeMs) || !fin(now) || !fin(sinceMs)) return false
  return now - lockMtimeMs > STALE_LOCK_MS && sinceMs >= STALE_QUIET_MS
}

export function buildRow(
  lane: string,
  state: LaneState,
  lock: Lock | null,
  lines: readonly string[],
  seen: Seen | undefined,
  now: number,
  lockMtimeMs: number | null = null,
): LaneRow {
  const sinceMs = seen === undefined ? 0 : now - seen.since
  return {
    lane,
    state,
    lock,
    isStale: isStaleLane(state, lock, lockMtimeMs, sinceMs, now),
    sinceMs,
    tail: state === 'absent' ? '' : oneLine(meaningfulTail(lines), 160),
  }
}

export type SubRow = {
  id: string
  name: string
  type: string
  model: string
  status: string
  // The description the Agent call was given, when the API has one.
  description?: string
  // Real numbers the mods API gives for a subagent; absent when not seen.
  tokens?: number
  startedAt?: number
  endedAt?: number
}

export const isRunning = (status: string): boolean => status === 'running' || status === 'waiting' || status === 'pending'

export function summaryLine(rows: readonly LaneRow[], subs: readonly SubRow[]): string {
  const working = rows.filter(r => r.state === 'working').length
  const idle = rows.filter(r => r.state === 'idle').length
  const absent = rows.filter(r => r.state === 'absent').length
  const parts = ['lanes ' + working + ' active / ' + idle + ' idle']
  if (absent > 0) parts[0] += ' / ' + absent + ' absent'
  const running = subs.filter(s => isRunning(s.status)).length
  parts.push('subagents ' + running + ' running')
  return parts.join('  |  ')
}

export function laneLine(r: LaneRow): string {
  const item = r.lock !== null ? (r.lock.item !== '' ? r.lock.item : '(lock, no item)') : '-'
  const stale = r.isStale ? ' stale?' : ''
  return r.lane + '  ' + r.state + '  ' + ageLabel(r.sinceMs) + '  ' + item + stale
}

// ---------------------------------------------------------------------------
// Progress files: .cockpit/progress/<lane>.json = {"pct": 0..100, "label": "..."}
// Older files {"item","done","total","note"} still work: pct comes from done/total.

export type Progress = { item: string; pct: number | null; label: string }

export function parseProgress(text: string): Progress | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const total = fin(r.total) ? Math.max(0, Math.round(r.total)) : 0
  const done = fin(r.done) ? Math.max(0, Math.round(r.done)) : 0
  let pct: number | null = null
  if (fin(r.pct)) pct = Math.max(0, Math.min(100, r.pct))
  else if (total > 0) pct = Math.min(100, (Math.min(done, total) / total) * 100)
  const word = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
  let label = word(r.label) || word(r.note)
  if (label === '' && total > 0) label = Math.min(done, total) + '/' + total
  return { item: word(r.item), pct, label }
}

// null means indeterminate: no file, or no percent.
export function progressRatio(p: Progress | null): number | null {
  return p !== null && p.pct !== null ? p.pct / 100 : null
}

export function barText(ratio: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round(width * ratio)))
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled)
}

// A block that slides back and forth while the lane works; an empty track when it does not.
export function indeterminateBar(width: number, tick: number, isActive: boolean): string {
  if (!isActive) return '\u2591'.repeat(width)
  const block = Math.min(3, width)
  const span = Math.max(1, width - block)
  const t = Math.abs(tick) % (span * 2)
  const at = t <= span ? t : span * 2 - t
  return '\u2591'.repeat(at) + '\u2588'.repeat(block) + '\u2591'.repeat(width - block - at)
}

export function overallProgress(list: readonly (Progress | null)[]): number | null {
  const known = list.filter((p): p is Progress => p !== null && p.pct !== null)
  return known.length > 0 ? known.reduce((n, p) => n + (p.pct ?? 0), 0) / known.length / 100 : null
}

// ---------------------------------------------------------------------------
// Codex limits. The only fields read from a session log are rate_limits.*.used_percent,
// window_minutes and resets_at, taken from the last line that has them.

export type Limit = { leftPct: number; resetsAt: number }
export type CodexLimits = { fiveHour: Limit | null; week: Limit | null }

const field = (body: string, name: string): number | null => {
  const m = new RegExp('"' + name + '"\\s*:\\s*([0-9.]+)').exec(body)
  return m ? Number(m[1]) : null
}

function limitFrom(segment: string, key: 'primary' | 'secondary'): { used: number; window: number; resetsAt: number } | null {
  const m = new RegExp('"' + key + '"\\s*:\\s*\\{([^}]*)\\}').exec(segment)
  if (!m) return null
  const body = m[1] ?? ''
  const used = field(body, 'used_percent')
  const window = field(body, 'window_minutes')
  const resetsAt = field(body, 'resets_at')
  if (used === null || window === null || resetsAt === null) return null
  return { used, window, resetsAt }
}

export function parseCodexLimits(tail: string): CodexLimits | null {
  const lines = tail.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? ''
    const at = line.indexOf('"rate_limits"')
    if (at < 0) continue
    // Only the rate_limits object: nothing after it in the line is looked at.
    const segment = line.slice(at, at + 700)
    const found = [limitFrom(segment, 'primary'), limitFrom(segment, 'secondary')]
    const out: CodexLimits = { fiveHour: null, week: null }
    for (const f of found) {
      if (f === null) continue
      const limit: Limit = { leftPct: Math.max(0, Math.min(100, Math.round(100 - f.used))), resetsAt: f.resetsAt }
      if (f.window <= 1440) out.fiveHour = limit
      else out.week = limit
    }
    if (out.fiveHour !== null || out.week !== null) return out
  }
  return null
}

// The pane footer fallback: "weekly limit: only 12% left".
export function parseFooterWeekly(lines: readonly string[]): number | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /weekly limit:\s*only\s*(\d{1,3})%\s*left/i.exec(lines[i] ?? '')
    if (m) return Math.min(100, Number(m[1]))
  }
  return null
}

export const LIMIT_GREEN = '#3FB950'
export const LIMIT_AMBER = '#F0A500'
export const LIMIT_RED = '#F85149'
export const LIMIT_UNKNOWN = '#8B949E'

export function limitColor(leftPct: number | null): string {
  if (leftPct === null) return LIMIT_UNKNOWN
  // Amber under 30% left, red under 10%.
  return leftPct < 10 ? LIMIT_RED : leftPct < 30 ? LIMIT_AMBER : LIMIT_GREEN
}

const pad2 = (n: number): string => (n < 10 ? '0' + n : String(n))
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function fmtClock(epochSec: number): string {
  const d = new Date(epochSec * 1000)
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

export function fmtDay(epochSec: number): string {
  return DAYS[new Date(epochSec * 1000).getDay()] ?? ''
}

export type LimitLabel = { text: string; color: string }

// "5h: 62% left, resets 14:30". A window that already reset, or a missing one, is unknown:
// the number is never guessed. footerLeft is the fallback for the week only, and has no reset time.
export function limitLabel(
  name: '5h' | 'week',
  limit: Limit | null,
  nowMs: number,
  footerLeft: number | null = null,
): LimitLabel {
  if (limit !== null && limit.resetsAt * 1000 > nowMs) {
    const reset = name === '5h' ? fmtClock(limit.resetsAt) : fmtDay(limit.resetsAt)
    return { text: name + ': ' + limit.leftPct + '% left, resets ' + reset, color: limitColor(limit.leftPct) }
  }
  if (name === 'week' && footerLeft !== null) {
    return { text: 'week: ' + footerLeft + '% left (footer)', color: limitColor(footerLeft) }
  }
  return { text: name + ': limit unknown', color: LIMIT_UNKNOWN }
}

// The short form for a tile or the band: "5h 62%" with its reset ("14:30", "Mon"), or "5h -".
export type LimitCompact = { text: string; reset: string; color: string }

export function limitCompact(
  name: '5h' | 'week',
  limit: Limit | null,
  nowMs: number,
  footerLeft: number | null = null,
): LimitCompact {
  const short = name === 'week' ? 'wk' : name
  if (limit !== null && fin(limit.resetsAt) && limit.resetsAt * 1000 > nowMs && fin(limit.leftPct)) {
    return {
      text: short + ' ' + limit.leftPct + '%',
      reset: name === '5h' ? fmtClock(limit.resetsAt) : fmtDay(limit.resetsAt),
      color: limitColor(limit.leftPct),
    }
  }
  if (name === 'week' && fin(footerLeft)) return { text: short + ' ' + footerLeft + '%', reset: '', color: limitColor(footerLeft) }
  return { text: short + ' -', reset: '', color: LIMIT_UNKNOWN }
}

// ---------------------------------------------------------------------------
// Small formatters for the panel. None of them can print NaN: an unknown number is "-".

export function fmtTokens(n: number): string {
  if (!fin(n)) return '-'
  return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n))
}

export function fmtTime(ms: number): string {
  if (!fin(ms)) return '-'
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = pad2(s % 60)
  return h > 0 ? h + ':' + pad2(m) + ':' + ss : m + ':' + ss
}

// "ctx 23% · 230k tokens"; each unknown number is "-".
export function ctxLabel(percent: unknown, tokens: unknown): string {
  const p = fin(percent) ? Math.round(Math.max(0, percent)) + '%' : '-'
  const t = fin(tokens) ? fmtTokens(tokens) : '-'
  return 'context ' + p + ' \u00b7 ' + t + ' tokens'
}

export function countSince(files: readonly ReportFile[], nowMs: number, windowMs: number): number {
  return files.filter(f => nowMs - f.mtimeMs <= windowMs && nowMs - f.mtimeMs >= -60_000).length
}

// Reduced motion and theme, from Claude Code's settings object and the COLORFGBG hint.
export function readTheme(settings: unknown, colorFgBg: string | undefined): 'dark' | 'light' {
  const t = settings !== null && typeof settings === 'object' ? (settings as Record<string, unknown>).theme : undefined
  if (typeof t === 'string') {
    if (t.startsWith('light')) return 'light'
    if (t.startsWith('dark')) return 'dark'
  }
  const bg = colorFgBg ? Number(colorFgBg.split(';').pop()) : NaN
  return Number.isFinite(bg) && bg >= 7 && bg !== 8 ? 'light' : 'dark'
}

export function readReducedMotion(settings: unknown, envFlag: string | undefined): boolean {
  const v = settings !== null && typeof settings === 'object' ? (settings as Record<string, unknown>).prefersReducedMotion : undefined
  return v === true || (envFlag !== undefined && envFlag !== '' && envFlag !== '0')
}

// ---------------------------------------------------------------------------
// Descriptions: plain words for what a session is doing right now.

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()

// The item id of a lock ("b20" from "b20", or from "b20 land the thing"), or '' when it is not a safe file-name part.
export function itemId(lock: Lock | null): string {
  const first = lock === null ? '' : squash(lock.item).split(' ')[0] ?? ''
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(first) ? first : ''
}

// The brief files that can belong to an item: brief-<item>.md, then ...b.md and ...c.md.
export function briefNames(item: string): string[] {
  return item === '' ? [] : ['brief-' + item + '.md', 'brief-' + item + 'b.md', 'brief-' + item + 'c.md']
}

// The newest of the files that exist (largest mtime), or null.
export function newestFile<T extends { mtimeMs: number }>(files: readonly T[]): T | null {
  let best: T | null = null
  for (const f of files) if (fin(f.mtimeMs) && (best === null || f.mtimeMs > best.mtimeMs)) best = f
  return best
}

// The first "# " heading of a brief, with a leading "<item>:" cut off:
// "# b20: land GENUI-03b in one pass" -> "land GENUI-03b in one pass". '' when there is no heading.
export function briefHeading(text: string, item = ''): string {
  for (const raw of text.split('\n')) {
    const m = /^#\s+(\S.*)$/.exec(raw.replace(/\r$/, ''))
    if (!m) continue
    let h = squash(m[1] ?? '')
    if (item !== '' && h.toLowerCase().startsWith(item.toLowerCase() + ':')) h = h.slice(item.length + 1).trim()
    return h
  }
  return ''
}

// A progress file counts only when it is newer than the lock (or there is no lock to compare with).
export function progressIsNewer(progressMtimeMs: number | null, lockMtimeMs: number | null): boolean {
  if (!fin(progressMtimeMs)) return false
  return !fin(lockMtimeMs) || progressMtimeMs > lockMtimeMs
}

// What a lane is doing, in this order: the heading of the brief the lock names, the progress label
// (the caller passes null when the file is not newer than the lock), the filtered tail, the lock's own
// item, and "no task" when there is nothing at all.
export function describeLane(lock: Lock | null, heading: string, progress: Progress | null, tail: string): string {
  const pick = [squash(heading), progress === null ? '' : squash(progress.label), squash(tail), lock === null ? '' : squash(lock.item)]
  const text = pick.find(s => s !== '') ?? 'no task'
  return text.length > 200 ? text.slice(0, 197) + '...' : text
}

// This session: what the newest lock says, else idle (or just "working" when a turn runs and no lock exists).
export function describeSession(locks: readonly { item: string; mtimeMs: number | null }[], isBusy: boolean): string {
  const named = locks.filter(l => squash(l.item) !== '' && fin(l.mtimeMs)) as { item: string; mtimeMs: number }[]
  const newest = newestFile(named)
  if (newest !== null) return 'coordinating: ' + squash(newest.item)
  return isBusy ? 'active' : 'idle, waiting for reports'
}

// A subagent: its description, else its type. The title already says the description, so a repeat shows the type.
export function describeSub(description: string, type: string, title: string): string {
  const d = squash(description)
  return d !== '' && d !== squash(title) ? d : squash(type) || 'subagent'
}

// ---------------------------------------------------------------------------
// Work items: the "By item" view. One row per item, not per member.

// `red` is for an item that FAILED: a member in the red state, or the gate of the item's newest report failing with
// nothing newer behind it. A queued item is never red; a lock nobody works on any more is `stale-lock` (amber).
export type ItemStatus = 'queued' | 'working' | 'testing' | 'reviewing' | 'blocked' | 'red' | 'stale-lock' | 'landed' | 'done-not-landed'

export type ItemLockIn = { member: string; item: string; mtimeMs: number | null }
export type ItemBriefIn = { id: string; heading: string; mtimeMs: number; isOpencode?: boolean }
export type ItemReportIn = { id: string; mtimeMs: number; gate: number | null; scope: string }
export type ItemLandedIn = { hash: string; subject: string }
export type ItemDepIn = { member: string; on: string; why: string }
export type ItemCrewIn = {
  name: string
  kind: string
  variant: number
  state: LaneState
  activity: string
  // How long the pane has not changed, in ms.
  sinceMs: number
  // The member's own progress file, 0 to 1, or null.
  ratio: number | null
  // An idle lane whose lock file is old (core.isStaleLane): its item is "stale lock", not work in progress.
  isStale?: boolean
}

export type ItemOpts = {
  nowMs?: number
  // Every report id there is (not only the last 24 h): a brief with one is done.
  allReportIds?: ReadonlySet<string>
  // A short name for an item: crew-targets.json, then the heading.
  nameOf?: (id: string, heading: string) => string
  // status.json "now" and "next": items matching them come first, in that order.
  statusNow?: readonly string[]
  statusNext?: readonly string[]
}

export type Item = {
  family: string
  latest: string
  ids: string[]
  title: string
  heading: string
  status: ItemStatus
  assignees: { name: string; kind: string; variant: number; activity: string; state: LaneState }[]
  blockedBy: { on: string; why: string } | null
  // When the item entered its current status (ms since the epoch), or null.
  sinceAt: number | null
  gate: { exit: number; scope: string } | null
  // 0 to 1: the member's progress file, else the status mapped to 0.2, 0.5, 0.8, 0.9, 1.
  ratio: number
  briefName: string
  reportName: string
  hashes: string[]
  group: 'now' | 'next' | 'other'
  order: number
  isOpencode: boolean
}

const DAY_MS = 24 * HOUR_MS

// "b21b" is variant "b" of family "b21"; "oc-lanes-mod3c" of "oc-lanes-mod3". An id that does not end in a
// letter after a digit is its own family.
export function itemFamily(id: string): { family: string; variant: string } {
  const m = /^(.*\d)([a-z])$/i.exec(id)
  return m ? { family: (m[1] ?? '').toLowerCase(), variant: (m[2] ?? '').toLowerCase() } : { family: id.toLowerCase(), variant: '' }
}

const hasWord = (text: string, id: string): boolean => new RegExp('(?:^|[^\\w-])' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])', 'i').test(text)

const STATUS_RANK: Record<ItemStatus, number> = { red: 0, blocked: 1, 'stale-lock': 1, working: 2, testing: 2, reviewing: 2, queued: 3, 'done-not-landed': 4, landed: 5 }
export const itemStatusRank = (s: ItemStatus): number => STATUS_RANK[s]

// The status mapped to a bar: queued 0.2, working 0.5, testing or reviewing 0.8, landed 1; done-not-landed
// 0.9 and red 0.8 (it got as far as a gate), blocked 0.5.
const STATUS_RATIO: Record<ItemStatus, number> = { queued: 0.2, working: 0.5, blocked: 0.5, 'stale-lock': 0.5, testing: 0.8, reviewing: 0.8, red: 0.8, 'done-not-landed': 0.9, landed: 1 }

// Every item from the lane locks, the briefs, the reports of the last 24 h, the commits that landed today
// and the OpenCode brief; variants (b21, b21b, b21c) are one family shown with the latest variant. Sorted by
// status (red, blocked, working, queued, done-not-landed, landed), the items status.json lists in "now" and
// "next" first, in that order.
export function buildItems(
  locks: readonly ItemLockIn[],
  briefs: readonly ItemBriefIn[],
  reports: readonly ItemReportIn[],
  landed: readonly ItemLandedIn[],
  deps: readonly ItemDepIn[],
  crew: readonly ItemCrewIn[],
  opts: ItemOpts = {},
): Item[] {
  const now = opts.nowMs ?? 0
  const recent = reports.filter(r => !fin(now) || now === 0 || (now - r.mtimeMs <= DAY_MS && r.mtimeMs - now <= HOUR_MS))
  const allReports = opts.allReportIds ?? new Set(reports.map(r => r.id.toLowerCase()))
  const nameOf = opts.nameOf ?? ((id: string, heading: string) => (heading !== '' ? heading : id))

  type Fam = {
    family: string
    ids: Set<string>
    briefs: ItemBriefIn[]
    reports: ItemReportIn[]
    locks: ItemLockIn[]
    isOpencode: boolean
  }
  const fams = new Map<string, Fam>()
  const fam = (id: string, isOpencode = false): Fam => {
    const f = itemFamily(id).family
    let cur = fams.get(f)
    if (!cur) {
      cur = { family: f, ids: new Set(), briefs: [], reports: [], locks: [], isOpencode }
      fams.set(f, cur)
    }
    cur.ids.add(id.toLowerCase())
    if (isOpencode) cur.isOpencode = true
    return cur
  }

  for (const l of locks) {
    const id = itemId({ owner: '', lane: l.member, time: '', item: l.item })
    if (id !== '') fam(id).locks.push(l)
  }
  // Briefs nobody reported on. The OpenCode lane's briefs have no reports: only the newest family counts.
  const newestOc = newestFile(briefs.filter(b => b.isOpencode === true))
  const ocFamily = newestOc === null ? null : itemFamily(newestOc.id).family
  for (const b of briefs) {
    if (b.isOpencode === true) {
      if (ocFamily !== null && itemFamily(b.id).family === ocFamily) fam(b.id, true).briefs.push(b)
    } else if (!allReports.has(b.id.toLowerCase())) {
      fam(b.id).briefs.push(b)
    } else {
      // A brief with a report still shows when the report is recent or a lane holds it (handled below).
      const f = itemFamily(b.id).family
      if (fams.has(f) || recent.some(r => itemFamily(r.id).family === f)) fam(b.id).briefs.push(b)
    }
  }
  for (const r of recent) fam(r.id).reports.push(r)

  // Landed commits: the subject names a known item id, or a backlog id in that item's heading.
  const items: Item[] = []
  for (const f of fams.values()) {
    const latestBrief = newestFile(f.briefs)
    const heading = latestBrief?.heading ?? ''
    const stamped = [...f.ids].map(id => {
      const t = Math.max(
        ...f.briefs.filter(b => b.id.toLowerCase() === id).map(b => b.mtimeMs),
        ...f.reports.filter(r => r.id.toLowerCase() === id).map(r => r.mtimeMs),
        ...f.locks.filter(l => itemId({ owner: '', lane: '', time: '', item: l.item }).toLowerCase() === id).map(l => l.mtimeMs ?? 0),
        0,
      )
      return { id, t }
    })
    const latest = [...stamped].sort((a, b) => b.t - a.t || itemFamily(b.id).variant.localeCompare(itemFamily(a.id).variant))[0]?.id ?? f.family
    const backlogIds = heading.match(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+[a-z]?\b/g) ?? []
    const names = [...f.ids, ...backlogIds]
    const hashes = landed.filter(c => names.some(n => hasWord(c.subject, n))).map(c => c.hash)

    const assignees = f.locks
      .map(l => crew.find(c => c.name === l.member))
      .filter((c): c is ItemCrewIn => c !== undefined)
      .map(c => ({ name: c.name, kind: c.kind, variant: c.variant, activity: c.activity, state: c.state }))
    // The OpenCode item belongs to the OpenCode member(s), which hold no lock.
    if (f.isOpencode) {
      for (const c of crew) if (c.kind === 'api' && !assignees.some(a => a.name === c.name)) assignees.push({ name: c.name, kind: c.kind, variant: c.variant, activity: c.activity, state: c.state })
    }
    const mine = new Set(assignees.map(a => a.name))
    const edge = deps.find(d => mine.has(d.member))
    const asking = assignees.find(a => a.activity === 'asking')
    const blockedBy = edge ? { on: edge.on, why: edge.why } : asking ? { on: ownerCfg.owner, why: asking.name + ' is waiting for an answer' } : null

    const latestReport = [...f.reports].sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
    const gate = latestReport && latestReport.gate !== null ? { exit: latestReport.gate, scope: latestReport.scope } : null
    const working = assignees.filter(a => a.state === 'working')
    const isLanded = hashes.length > 0
    // The family merges b21, b21b and b21c. A failed gate belongs to the work it reported on: when a newer brief
    // or lock exists (b21c queued after b21b's red report) the old failure says nothing about the new item.
    const newestWork = Math.max(latestBrief?.mtimeMs ?? 0, ...f.locks.map(l => l.mtimeMs ?? 0))
    const gateIsCurrent = latestReport !== undefined && latestReport.mtimeMs >= newestWork
    const isRed = assignees.some(a => a.activity === 'red') || (gate !== null && gate.exit !== 0 && gateIsCurrent && !isLanded && working.length === 0)
    // A lock whose lane is idle and stale is not work in progress.
    const staleHolders = assignees.filter(a => crew.find(c => c.name === a.name)?.isStale === true)
    const isStaleLock = assignees.length > 0 && staleHolders.length === assignees.length && working.length === 0

    let status: ItemStatus
    if (isRed) status = 'red'
    else if (blockedBy !== null) status = 'blocked'
    else if (isStaleLock) status = 'stale-lock'
    else if (working.some(a => a.activity === 'testing')) status = 'testing'
    else if (working.some(a => a.activity === 'reviewing')) status = 'reviewing'
    else if (assignees.length > 0) status = 'working'
    else if (isLanded) status = 'landed'
    else if (latestReport && gateIsCurrent) status = 'done-not-landed'
    else status = 'queued'

    // When it entered this status: the report for red or done, the lock for work, the brief for queued.
    const lockAt = Math.min(...f.locks.map(l => l.mtimeMs ?? Number.POSITIVE_INFINITY))
    const sinceAt =
      status === 'queued' ? latestBrief?.mtimeMs ?? null
      : status === 'landed' ? null
      : status === 'done-not-landed' || (status === 'red' && assignees.length === 0) ? latestReport?.mtimeMs ?? null
      : Number.isFinite(lockAt) ? lockAt
      : latestReport?.mtimeMs ?? latestBrief?.mtimeMs ?? null
    const own = assignees.map(a => crew.find(c => c.name === a.name)?.ratio).filter((x): x is number => x !== null && x !== undefined)
    const ratio = own.length > 0 ? Math.max(...own) : STATUS_RATIO[status]

    const title = nameOf(latest, heading)
    items.push({
      family: f.family,
      latest,
      ids: [...f.ids].sort(),
      title: title !== '' ? title : latest,
      heading,
      status,
      assignees,
      blockedBy,
      sinceAt: sinceAt !== null && fin(sinceAt) ? sinceAt : null,
      gate,
      ratio: Math.max(0, Math.min(1, ratio)),
      briefName: latestBrief ? 'brief-' + latestBrief.id + '.md' : '',
      reportName: latestReport ? latestReport.id + '-report.md' : '',
      hashes,
      group: 'other',
      order: 0,
      isOpencode: f.isOpencode,
    })
  }

  // Milestone grouping: the entries of status.json "now", then "next".
  const entryOf = (it: Item, list: readonly string[] | undefined): number => {
    if (!list) return -1
    const keys = [...it.ids, it.family]
    return list.findIndex(e => keys.some(k => hasWord(e, k)) || (it.title !== '' && hasWord(e, it.title)))
  }
  for (const it of items) {
    const n = entryOf(it, opts.statusNow)
    const x = entryOf(it, opts.statusNext)
    if (n >= 0) Object.assign(it, { group: 'now', order: n })
    else if (x >= 0) Object.assign(it, { group: 'next', order: x })
  }
  const groupRank = { now: 0, next: 1, other: 2 } as const
  const when = (it: Item): number => it.sinceAt ?? 0
  return items.sort(
    (a, b) =>
      groupRank[a.group] - groupRank[b.group] ||
      (a.group === 'other' ? 0 : a.order - b.order) ||
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      when(b) - when(a) ||
      a.family.localeCompare(b.family),
  )
}
