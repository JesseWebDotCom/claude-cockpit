// The "board" side of the crew mod: everything that is not one crew member. Status, presence, the
// away log, the inbox, the backlog, the queue, what landed, health and credits, the handoff file, the
// context numbers. Pure: no mods API, no I/O; register.tsx reads the files and calls these.
// Unit tested in tests/board.test.ts.

import { ageLabel, fin, fmtTokens, LIMIT_AMBER, LIMIT_GREEN, LIMIT_RED, LIMIT_UNKNOWN, fmtClock, fmtDay } from './core.ts'
import type { Limit } from './core.ts'
import type { ServiceState } from './hosts.ts'

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const MIN = 60_000

// ---------------------------------------------------------------------------
// Status (.cockpit/status.json, written by the coordinator each turn)

export type YouAsk = { text: string; blocking: string }

export type Status = {
  updated: string
  updatedMs: number | null
  milestone: string
  done: number | null
  total: number | null
  now: string[]
  next: string[]
  you: YouAsk[]
}

// A status line written as ONE string ("AUTH-KEYPAIR-01 (lane-b): wiring; (lane-a): rows") is its
// entries: split at ";" or a line break that is not inside parentheses. v13: the coordinator writes `now` this way, and a
// string used to read as no entries at all (an empty NOW and an empty Captain row).
export function splitEntries(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if ((ch === ';' || ch === '\n') && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map(squash).filter(x => x !== '')
}

const strList = (v: unknown): string[] =>
  typeof v === 'string' ? splitEntries(v) : Array.isArray(v) ? v.filter(x => typeof x === 'string' || typeof x === 'number').map(x => squash(String(x))).filter(s => s !== '') : []

const youList = (v: unknown): YouAsk[] => {
  if (typeof v === 'string') return splitEntries(v).map(text => ({ text, blocking: '' }))
  if (!Array.isArray(v)) return []
  const out: YouAsk[] = []
  for (const x of v) {
    if (typeof x === 'string') {
      if (squash(x) !== '') out.push({ text: squash(x), blocking: '' })
    } else if (isObj(x) && typeof x.text === 'string' && squash(x.text) !== '') {
      const b = x.blocking
      out.push({ text: squash(x.text), blocking: typeof b === 'string' ? squash(b) : b === true ? 'yes' : '' })
    }
  }
  return out
}

const count = (v: unknown): number | null => (fin(v) ? Math.max(0, Math.round(v)) : null)

// Tolerant: any missing field is empty; text that is not a JSON object is no status.
export function parseStatus(text: string): Status | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObj(raw)) return null
  const updated = typeof raw.updated === 'string' ? raw.updated.trim() : ''
  const ms = updated === '' ? Number.NaN : Date.parse(updated)
  return {
    updated,
    updatedMs: Number.isFinite(ms) ? ms : null,
    milestone: typeof raw.milestone === 'string' ? squash(raw.milestone) : '',
    done: count(raw.done),
    total: count(raw.total),
    now: strList(raw.now),
    next: strList(raw.next),
    you: youList(raw.you),
  }
}

export const STATUS_OLD_MS = 30 * MIN

// How old the file is: "updated 3m ago". Over 30 min (or no usable time) it is old: dim it, say so.
export function statusAge(s: Status | null, nowMs: number): { label: string; isOld: boolean } {
  if (s === null || s.updatedMs === null || !fin(nowMs)) return { label: 'update time unknown', isOld: true }
  const age = Math.max(0, nowMs - s.updatedMs)
  return { label: 'updated ' + ageLabel(age) + ' ago', isOld: age > STATUS_OLD_MS }
}

// done / total for the bar; null with no total or a zero total.
export function statusRatio(s: Status | null): number | null {
  if (s === null || s.total === null || s.total <= 0) return null
  return Math.max(0, Math.min(1, (s.done ?? 0) / s.total))
}

export const statusCount = (s: Status | null): string => (s !== null && s.total !== null && s.total > 0 ? Math.min(s.done ?? 0, s.total) + '/' + s.total : '')

export const hasBlocking = (asks: readonly YouAsk[]): boolean => asks.some(a => a.blocking !== '')

// ---------------------------------------------------------------------------
// Presence (.cockpit/presence.json) and the away log (.cockpit/away-log.md)

export type Presence = { mode: 'active' | 'away'; since: string; sinceMs: number | null }

export function parsePresence(text: string): Presence {
  try {
    const raw: unknown = JSON.parse(text)
    if (isObj(raw)) {
      const since = typeof raw.since === 'string' ? raw.since : ''
      const ms = Date.parse(since)
      return { mode: raw.mode === 'away' ? 'away' : 'active', since, sinceMs: Number.isFinite(ms) ? ms : null }
    }
  } catch {
    // Fall through: no file or a broken one reads as active.
  }
  return { mode: 'active', since: '', sinceMs: null }
}

// The file's new text when the person switches: {mode, since} with an ISO time.
export function presenceText(mode: 'active' | 'away', nowMs: number): string {
  return JSON.stringify({ mode, since: new Date(nowMs).toISOString() }) + '\n'
}

export function awayLabel(p: Presence, nowMs: number): string {
  if (p.mode !== 'away') return ''
  // 0.5.1: "away" is AUTOPILOT on.
  return p.sinceMs === null ? 'AUTOPILOT on' : 'AUTOPILOT on since ' + ageLabel(nowMs - p.sinceMs) + ' ago'
}

export type AwayEntry = { text: string; kind: 'blocked' | 'decision' | 'note' }

// Tolerant: bullets and plain lines are entries, headings and blanks are not. A line with BLOCKED is an
// item that blocked; one that reads like a decision is a decision; anything else is a note.
export function parseAwayLog(text: string): AwayEntry[] {
  const out: AwayEntry[] = []
  for (const raw of text.split('\n')) {
    const line = squash(raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''))
    if (line === '' || /^#/.test(line) || /^[-=_]{3,}$/.test(line)) continue
    const kind = /\bBLOCKED\b/i.test(line) ? 'blocked' : /\b(decision|decided|chose|picked|approved)\b/i.test(line) ? 'decision' : 'note'
    out.push({ text: line, kind })
  }
  return out
}

// ---------------------------------------------------------------------------
// Inbox (.cockpit/inbox.jsonl): the mod appends new items; the coordinator appends status lines.

export type InboxKind = 'bug' | 'feature'
export type InboxItem = { id: string; kind: InboxKind; text: string; at: string; atMs: number | null; by: string; status: string; ref: string }

export const INBOX_MAX_TEXT = 2000

// Item lines have a kind and text; status lines are {id, status, ref}. Later lines for an id win. A line
// that is not JSON, or has no id, is skipped. Items keep the order they first appeared in.
export function parseInbox(text: string): InboxItem[] {
  const byId = new Map<string, InboxItem>()
  const partial = new Map<string, { status?: string; ref?: string }>()
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    let raw: unknown
    try {
      raw = JSON.parse(line)
    } catch {
      continue
    }
    if (!isObj(raw) || typeof raw.id !== 'string' || raw.id === '') continue
    const id = raw.id
    const isItem = (raw.kind === 'bug' || raw.kind === 'feature') && typeof raw.text === 'string'
    if (isItem) {
      const at = typeof raw.at === 'string' ? raw.at : ''
      const ms = Date.parse(at)
      byId.set(id, {
        id,
        kind: raw.kind as InboxKind,
        text: String(raw.text),
        at,
        atMs: Number.isFinite(ms) ? ms : null,
        by: typeof raw.by === 'string' ? raw.by : '',
        status: typeof raw.status === 'string' ? raw.status : 'new',
        ref: typeof raw.ref === 'string' ? raw.ref : '',
      })
      partial.delete(id)
    } else if (typeof raw.status === 'string') {
      const cur = byId.get(id)
      const ref = typeof raw.ref === 'string' ? raw.ref : ''
      if (cur) {
        cur.status = raw.status
        cur.ref = ref
      } else {
        partial.set(id, { status: raw.status, ref })
      }
    }
  }
  // A status line that came before its item line is kept only if nothing later replaced it.
  for (const [id, p] of partial) {
    const cur = byId.get(id)
    if (cur && p.status !== undefined) {
      cur.status = p.status
      cur.ref = p.ref ?? ''
    }
  }
  return [...byId.values()]
}

// New items first-newest, at most `max`.
export function newInboxItems(items: readonly InboxItem[], max = 6): InboxItem[] {
  return items
    .filter(i => i.status === 'new')
    .sort((a, b) => (b.atMs ?? 0) - (a.atMs ?? 0))
    .slice(0, max)
}

export const inboxNewCount = (items: readonly InboxItem[]): number => items.filter(i => i.status === 'new').length

export type InboxAdd = { ok: true; line: string; id: string; kind: InboxKind; reply: string } | { ok: false; error: string }

// The one JSON line to append for `/crew bug <text>` or `/crew idea <text>`. The text is data: it is
// stored and shown, never run or interpreted. Empty text is refused; it is cut at 2000 characters.
export function inboxAddLine(kindWord: string, rawText: string, nowMs: number, existingIds: ReadonlySet<string>, rand: () => number = Math.random): InboxAdd {
  const kind: InboxKind | null = kindWord === 'bug' ? 'bug' : kindWord === 'idea' || kindWord === 'feature' ? 'feature' : null
  if (kind === null) return { ok: false, error: 'kind must be bug, idea or feature' }
  const text = rawText.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, INBOX_MAX_TEXT)
  if (text === '') return { ok: false, error: 'nothing to add: write the ' + kindWord + ' after the word' }
  let id = ''
  for (let tries = 0; tries < 50 && (id === '' || existingIds.has(id)); tries++) {
    const digits = tries < 20 ? 3 : 5
    id = Math.floor(rand() * 16 ** digits).toString(16).padStart(digits, '0')
  }
  if (id === '' || existingIds.has(id)) return { ok: false, error: 'could not make a free id; try again' }
  const line = JSON.stringify({ id, kind, text, at: new Date(nowMs).toISOString(), by: 'you', status: 'new' })
  const shown = text.length > 70 ? text.slice(0, 69) + '...' : text
  return { ok: true, line, id, kind, reply: 'added ' + kind + ' #' + id + ': ' + shown }
}

// ---------------------------------------------------------------------------
// Backlog (the backlog file in the data folder, read only): "- [ ] **ID: title** (...)"

// `section` is the nearest heading above the row ("## Engines: a second machine"), '' above the first.
export type BacklogItem = { id: string; title: string; state: 'open' | 'progress' | 'done'; section: string }
// `milestone` is the name on the first "Milestone: <name>" line (Addendum 9), '' when there is none.
export type Backlog = { items: BacklogItem[]; open: number; progress: number; done: number; milestone: string }

// "Milestone: Admin settings live", also "- **Milestone:** ..." or "> Milestone: ...". Only at the start of
// a line, so prose that mentions a milestone is not read as one.
const MILESTONE_LINE = /^\s*(?:[>*_-]\s*)*\**Milestone\**\s*:\s*\**\s*(.+?)\s*\**\s*$/i
const HEADING_LINE = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/

// The id may carry a parenthesised note before the colon: "MODEL-VET-01 (design note: ...): a model vetter".
const BACKLOG_ROW = /^\s*[-*]\s+\[(.)\]\s+\*\*([A-Za-z0-9][\w.-]*)(?:\s*\([^)]*\))?:\s*(.*?)\*\*/

// Tolerant: a row that does not parse is skipped. "[ ]" is open, "[x]" done, any other mark in progress.
export function parseBacklog(text: string): Backlog {
  const items: BacklogItem[] = []
  const out: Backlog = { items, open: 0, progress: 0, done: 0, milestone: '' }
  let section = ''
  for (const line of text.split('\n')) {
    const h = HEADING_LINE.exec(line)
    if (h) {
      section = squash(h[1] ?? '')
      continue
    }
    const ms = out.milestone === '' ? MILESTONE_LINE.exec(line) : null
    if (ms) {
      out.milestone = squash(ms[1] ?? '')
      continue
    }
    if (!line.includes('[')) continue
    const m = BACKLOG_ROW.exec(line)
    if (!m) continue
    const mark = m[1] ?? ' '
    const state = mark === ' ' ? 'open' : mark === 'x' || mark === 'X' ? 'done' : 'progress'
    items.push({ id: m[2] ?? '', title: squash(m[3] ?? ''), state, section })
    out[state]++
  }
  return out
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// The rows of the BACKLOG section the milestone line names (the heading equals or contains the name, either
// way round, ignoring case and punctuation), counted: done and total. null when the section has no rows.
export function milestoneProgress(b: Backlog): { done: number; total: number } | null {
  const want = norm(b.milestone)
  if (want === '') return null
  const rows = b.items.filter(i => {
    const sec = norm(i.section)
    return sec !== '' && (sec === want || sec.includes(want) || want.includes(sec))
  })
  return rows.length === 0 ? null : { done: rows.filter(r => r.state === 'done').length, total: rows.length }
}

// The first `n` items that are not done, in file order.
export const backlogTop = (b: Backlog, n = 8): BacklogItem[] => b.items.filter(i => i.state !== 'done').slice(0, n)

// ---------------------------------------------------------------------------
// Queue: briefs nobody has reported on and no lane holds

export type QueueFile = { name: string; mtimeMs: number }
export type QueueItem = { id: string; name: string; mtimeMs: number }

export const briefId = (name: string): string => name.replace(/^brief-/, '').replace(/\.md$/, '')

// brief-<id>.md files with no reports/<id>-report.md and whose id is not the item of any lane lock,
// newest first. The OpenCode briefs (brief-oc-*) are that lane's own and are not queue items.
export function queueItems(
  briefs: readonly QueueFile[],
  reportNames: ReadonlySet<string>,
  heldIds: ReadonlySet<string>,
  max = 8,
): { items: QueueItem[]; total: number } {
  const held = new Set([...heldIds].map(s => s.toLowerCase()))
  const waiting = briefs
    .filter(f => /^brief-.+\.md$/.test(f.name) && !/^brief-oc-/.test(f.name))
    .map(f => ({ id: briefId(f.name), name: f.name, mtimeMs: f.mtimeMs }))
    .filter(f => !reportNames.has(f.id + '-report.md') && !held.has(f.id.toLowerCase()))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  return { items: waiting.slice(0, max), total: waiting.length }
}

// ---------------------------------------------------------------------------
// Landed today: `git log --since=midnight --format=%h %s origin/main`, and each one's gate result

export type Landed = { hash: string; subject: string }

export function parseLanded(stdout: string, max = 8): Landed[] {
  const out: Landed[] = []
  for (const line of stdout.split('\n')) {
    const m = /^([0-9a-f]{6,40})\s+(.*)$/.exec(line.trim())
    if (m) out.push({ hash: m[1] ?? '', subject: squash(m[2] ?? '') })
    if (out.length === max) break
  }
  return out
}

// The "Gate exit code" a report that names the hash gives, e.g. "- Gate exit code: **1**." -> 1.
// null when no report names the hash, or the one that does gives no number.
export function gateExit(hash: string, reports: readonly { text: string }[]): number | null {
  if (hash.length < 6) return null
  for (const r of reports) {
    if (!r.text.includes(hash)) continue
    const code = reportGateExit(r.text)
    if (code !== null) return code
  }
  return null
}

// The "Gate exit code" a report gives, e.g. "- Gate exit code: **1**." -> 1; null when it gives none.
export function reportGateExit(text: string): number | null {
  const m = /Gate exit code\W*(-?\d+)/i.exec(text)
  return m ? Number(m[1]) : null
}

export function landedSummary(items: readonly { gate: number | null }[]): string {
  if (items.length === 0) return 'Landed today: none'
  const red = items.filter(i => i.gate !== null && i.gate !== 0).length
  return 'Landed today: ' + items.length + (red > 0 ? ', ' + red + ' red' : '')
}

// ---------------------------------------------------------------------------
// Health and credits

export type Dot = 'green' | 'red' | 'grey'


// The status code curl printed, or null.
export function parseHttpCode(stdout: string): number | null {
  const m = /(\d{3})\s*$/.exec(stdout.trim())
  return m ? Number(m[1]) : null
}

export type Credits = {
  opencode: { left: string; expires: string } | null
  cloud: { expires: string } | null
}

const textOf = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? squash(String(v)) : '')

export function parseCredits(text: string): Credits | null {
  try {
    const raw: unknown = JSON.parse(text)
    if (!isObj(raw)) return null
    const oc = isObj(raw.opencode) ? raw.opencode : null
    const cl = isObj(raw.cloud) ? raw.cloud : null
    return {
      opencode: oc ? { left: textOf(oc.left), expires: textOf(oc.expires) } : null,
      cloud: cl ? { expires: textOf(cl.expires) } : null,
    }
  } catch {
    return null
  }
}

// "OpenCode credit $12 left, expires Oct 20" or "OpenCode credit unknown".
export function creditsLines(c: Credits | null): string[] {
  const oc = c?.opencode
  const cl = c?.cloud
  const a = oc && (oc.left !== '' || oc.expires !== '') ? 'OpenCode credit ' + [oc.left !== '' ? oc.left + ' left' : '', oc.expires !== '' ? 'expires ' + oc.expires : ''].filter(Boolean).join(', ') : 'OpenCode credit unknown'
  void cl
  // COCKPIT-42: no automatic source carries the cloud balance and its days left are not shown anywhere.
  const b = 'Claude cloud credit unknown'
  return [a, b]
}

export type HealthIn = { services: readonly ServiceState[]; credits: Credits | null }

// One line for the collapsed view: "All healthy", or what is not: each configured service that is down, by its own name ("Web app down").
export function healthSummary(h: HealthIn): string {
  const bad = h.services.flatMap(s => (s.dot === 'red' ? [s.name + ' down'] : s.unreachable ? [s.name + ' unknown'] : []))
  if (bad.length === 0) return h.credits === null ? 'All healthy (credits unknown)' : 'All healthy'
  return bad.join(', ')
}

// ---------------------------------------------------------------------------
// Context: the live session's numbers, from the newest session jsonl's last 200 KB

export type SessionUsage = { used: number; window: number; model: string }

// Reads only the usage counts and the model id of the last main-session assistant line; nothing else
// of the file is kept or shown. null when no line has them.
export function parseSessionUsage(tail: string): SessionUsage | null {
  const lines = tail.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? ''
    if (!line.includes('"usage"')) continue
    let obj: unknown
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }
    if (!isObj(obj) || obj.isSidechain === true || !isObj(obj.message)) continue
    const msg = obj.message
    const u = msg.usage
    if (!isObj(u)) continue
    const model = typeof msg.model === 'string' ? msg.model : ''
    if (model === '<synthetic>') continue
    const n = (v: unknown): number => (fin(v) ? v : 0)
    const used = n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens)
    if (!fin(used) || used <= 0) continue
    return { used, window: model.includes('[1m]') ? 1_000_000 : 200_000, model }
  }
  return null
}

export const ctxPercent = (u: SessionUsage | null): number | null => (u === null || !fin(u.used) || !fin(u.window) || u.window <= 0 ? null : Math.max(0, Math.round((u.used / u.window) * 100)))

// "context 74% · 148k of 200k", or "no data".
export function ctxBarLabel(u: SessionUsage | null): string {
  const p = ctxPercent(u)
  if (u === null || p === null) return 'no data'
  return 'context ' + p + '% \u00b7 ' + fmtTokens(u.used) + ' of ' + fmtTokens(u.window)
}

// Disk-style bars (context and limits): green, amber over 70% used, red over 85%; grey when unknown.
export function diskColor(usedPct: number | null): string {
  if (usedPct === null || !fin(usedPct)) return LIMIT_UNKNOWN
  return usedPct > 85 ? LIMIT_RED : usedPct > 70 ? LIMIT_AMBER : LIMIT_GREEN
}

// ---------------------------------------------------------------------------
// Context pressure: at 70% write the handoff, at 85% it is red; a fresh handoff says it is safe

export const HANDOFF_FRESH_MS = 15 * MIN

export type Pressure = {
  level: 'none' | 'amber' | 'red'
  // The badge: "context 74%: write the handoff, then /clear". Empty under 70%.
  badge: string
  // The second line: green "safe to /clear: handoff saved", or amber "write the handoff first (ask the coordinator)".
  advice: { text: string; color: string } | null
}

// Nothing is triggered by this; it only says what to look at.
export function contextPressure(pct: number | null, handoffMtimeMs: number | null, nowMs: number): Pressure {
  if (pct === null || !fin(pct) || pct < 70) return { level: 'none', badge: '', advice: null }
  const fresh = fin(handoffMtimeMs) && fin(nowMs) && nowMs - handoffMtimeMs >= 0 && nowMs - handoffMtimeMs <= HANDOFF_FRESH_MS
  return {
    level: pct >= 85 ? 'red' : 'amber',
    badge: 'context ' + pct + '%: write the handoff, then /clear',
    advice: fresh ? { text: 'safe to /clear: handoff saved', color: LIMIT_GREEN } : { text: 'write the handoff first (ask the coordinator)', color: LIMIT_AMBER },
  }
}

// ---------------------------------------------------------------------------
// The handoff file (.cockpit/handoffs/HANDOFF-<date>.md)

export const HANDOFF_RULES = 'Rules: org CLAUDE.md, ~/.claude/CLAUDE.md, memory index. Re-arm watchers, rebuild missing tmux lanes, read status.json.'

const pad2 = (n: number): string => (n < 10 ? '0' + n : String(n))

// The local date, YYYY-MM-DD.
export function localDate(nowMs: number): string {
  const d = new Date(nowMs)
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

export const handoffName = (nowMs: number): string => 'HANDOFF-' + localDate(nowMs) + '.md'

export type HandoffIn = {
  nowMs: number
  status: Status | null
  locks: { member: string; item: string; heading: string }[]
  queue: { items: { id: string; heading: string }[]; total: number }
  landed: { hash: string; subject: string; gate: number | null }[]
}

// The fixed rules paragraph first, then milestone, now, next, you, the lane locks, the queue, the last
// five landed lines and the open briefs (the ones lanes hold).
export function buildHandoff(h: HandoffIn): string {
  const s = h.status
  const out: string[] = [HANDOFF_RULES, '', '# Handoff ' + localDate(h.nowMs), '']
  out.push('## Milestone', '', s !== null && s.milestone !== '' ? s.milestone + (statusCount(s) !== '' ? ' (' + statusCount(s) + ')' : '') : 'unknown', '')
  const list = (title: string, items: readonly string[]) => {
    out.push('## ' + title, '')
    out.push(...(items.length > 0 ? items.map(i => '- ' + i) : ['- none']))
    out.push('')
  }
  list('Now', s?.now ?? [])
  list('Next', s?.next ?? [])
  list('You', (s?.you ?? []).map(a => a.text + (a.blocking !== '' ? ' (blocking: ' + a.blocking + ')' : '')))
  list('Lane locks', h.locks.map(l => l.member + ': ' + l.item + (l.heading !== '' ? ' (' + l.heading + ')' : '')))
  list('Queue (' + h.queue.total + ' waiting)', h.queue.items.map(q => q.id + (q.heading !== '' ? ': ' + q.heading : '')))
  list('Landed today (last 5)', h.landed.slice(0, 5).map(l => l.hash + ' ' + l.subject + (l.gate !== null ? ' [gate exit ' + l.gate + ']' : '')))
  list('Open briefs', h.locks.filter(l => l.heading !== '').map(l => l.item + ': ' + l.heading + ' (' + l.member + ')'))
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// One line per collapsed section

export const queueSummary = (total: number): string => 'Queue: ' + total + ' waiting'
export const backlogSummary = (b: Backlog | null): string => (b === null ? 'Backlog: unreadable' : 'Backlog: ' + (b.open + b.progress) + ' open')
export const inboxSummary = (n: number): string => 'Inbox: ' + n + ' new'

// A report's gate scope in short form: "scope full (scripts/ changed ...)" -> "full". '' when it says none.
// Only the gate's own scope words count (full, frontend, backend, docs, scripts), so prose that happens to
// say "scope" is not read as one.
export function gateScope(text: string): string {
  const m = /\bscope\s*[:=]?\s*\**\s*(full|frontend|backend|docs|scripts)\b/i.exec(text)
  return m ? (m[1] ?? '').toLowerCase() : ''
}
