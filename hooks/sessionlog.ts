// Cockpit 0.4.0 (the Deck), panel 1: the session log. One line per thing worth a glance: your prompts (first 70
// characters), agent spawns and completions, lane state changes (working, idle, absent), edits with their path,
// errors, permission denials and consults. Newest last, time-stamped, capped at 200 kept; the panel shows 8 and scrolls.
// Pure reducers: nothing here reads the host. Credentials are masked when a line is made (mask.ts).
// The log's shape and the prompt rule are adapted from claude-flightdeck (MIT; see NOTICE).

import { isObject, shorten } from './deckfmt.ts'
import { describeInput, pathOf, redact } from './mask.ts'

export type LogKind = 'prompt' | 'spawn' | 'done' | 'lane' | 'edit' | 'error' | 'deny' | 'consult' | 'info'

export type LogLine = { at: number; kind: LogKind; who: string; text: string; agentId: string | null }

export const LOG_KEEP = 200
export const LOG_SHOWN = 8
export const LOG_EXPANDED = 24
const TEXT_MAX = 160

const KINDS: readonly LogKind[] = ['prompt', 'spawn', 'done', 'lane', 'edit', 'error', 'deny', 'consult', 'info']

/** A stored log read back: unreadable entries are dropped, unknown kinds become `info`, text is masked again. */
export function normalizeLog(stored: unknown): LogLine[] {
  if (!Array.isArray(stored)) return []
  const out: LogLine[] = []
  for (const l of stored) {
    if (!isObject(l)) continue
    out.push({
      at: typeof l.at === 'number' ? l.at : 0,
      kind: KINDS.includes(l.kind as LogKind) ? (l.kind as LogKind) : 'info',
      who: shorten(String(l.who ?? ''), 14),
      text: redact(shorten(String(l.text ?? ''), TEXT_MAX)),
      agentId: typeof l.agentId === 'string' ? l.agentId : null,
    })
  }
  return out.slice(-LOG_KEEP)
}

/** The log with one line added: masked, cut to one line, only the newest LOG_KEEP kept. */
export function pushLog(log: readonly LogLine[], line: LogLine): LogLine[] {
  const made: LogLine = { ...line, who: shorten(line.who, 14), text: redact(shorten(line.text, TEXT_MAX)) }
  const next = [...log, made]
  return next.length > LOG_KEEP ? next.slice(next.length - LOG_KEEP) : next
}

/**
 * What a turn's opening text was, for the log: your words (first 70 characters), or, for a turn the engine opened with a
 * tagged message (a subagent's hand-back, a task notification), that message's kind.
 */
export function promptLine(text: string): { who: string; text: string } {
  const tag = /^\s*<([a-z][\w-]*)/i.exec(text)?.[1]
  if (tag === undefined) return { who: 'you', text: shorten(text, 70) }
  const from = /\bfrom="([^"]+)"/.exec(text)?.[1]
  return { who: 'engine', text: shorten(`${tag.replace(/[-_]/g, ' ')}${from !== undefined ? ` from ${from.slice(0, 8)}` : ''}`, 70) }
}

const line = (at: number, kind: LogKind, who: string, text: string, agentId: string | null = null): LogLine => ({ at, kind, who, text, agentId })

export const promptEntry = (at: number, text: string): LogLine | null => {
  if (text.trim() === '') return null
  const p = promptLine(text)
  return line(at, 'prompt', p.who, p.text)
}
export const spawnEntry = (at: number, who: string, type: string, agentId: string): LogLine => line(at, 'spawn', who, `spawned \u00b7 ${type}`, agentId)
export const doneEntry = (at: number, who: string, status: 'done' | 'stopped' | 'failed', tookMs: number, agentId: string, fmt: (ms: number) => string): LogLine =>
  line(at, status === 'done' ? 'done' : 'error', who, status === 'done' ? `done \u00b7 ${fmt(tookMs)}` : status, agentId)
export const editEntry = (at: number, who: string, tool: string, input: unknown, agentId: string | null): LogLine => {
  const path = pathOf(input)
  return line(at, 'edit', who, path !== '' ? describeInput(tool, input) : tool, agentId)
}
export const errorEntry = (at: number, who: string, text: string, agentId: string | null = null): LogLine => line(at, 'error', who, text, agentId)
export const denyEntry = (at: number, who: string, detail: string, how: 'rule' | 'asked', agentId: string | null = null): LogLine =>
  line(at, 'deny', who, `denied${how === 'rule' ? ' by rule' : ''} \u00b7 ${detail}`, agentId)
export const consultEntry = (at: number, text: string): LogLine => line(at, 'consult', 'consult', text)
export const compactEntry = (at: number, trigger: string): LogLine => line(at, 'info', 'main', `context compacted (${trigger})`)

// ---------------------------------------------------------------- lanes

export type LaneState = 'working' | 'idle' | 'absent'

/** The last state seen per lane. `null` until a first reading has set the baseline (so a reload logs nothing). */
export type LaneMemory = Readonly<Record<string, LaneState>> | null

/**
 * The lanes after one poll, and the log lines for lanes that changed state. The first poll only sets the baseline.
 * A lane that was seen and is no longer there is `absent`; one that comes back says its new state.
 */
export function trackLanes(prev: LaneMemory, seen: readonly { name: string; state: 'working' | 'idle' }[], at: number): { next: Record<string, LaneState>; lines: LogLine[] } {
  const next: Record<string, LaneState> = {}
  for (const s of seen) next[s.name] = s.state
  const lines: LogLine[] = []
  if (prev === null) return { next, lines }
  for (const s of seen) {
    const before = prev[s.name]
    if (before !== s.state) lines.push(line(at, 'lane', s.name, before === undefined ? `appeared \u00b7 ${s.state}` : before === 'absent' ? `back \u00b7 ${s.state}` : `${before} \u2192 ${s.state}`))
  }
  for (const [name, before] of Object.entries(prev)) {
    if (name in next) continue
    if (before === 'absent') next[name] = 'absent'
    else {
      next[name] = 'absent'
      lines.push(line(at, 'lane', name, `${before} \u2192 absent`))
    }
  }
  return { next, lines }
}

// ---------------------------------------------------------------- scrolling

export type LogWindow = { rows: LogLine[]; olderHidden: number; newerHidden: number; back: number }

/**
 * The lines to draw: `shown` of them, `back` lines before the newest (0 = the newest at the bottom), optionally only one
 * agent's. `back` is clamped, so a window never runs off either end.
 */
export function logWindow(log: readonly LogLine[], o: { shown: number; back: number; agentId?: string | null }): LogWindow {
  const all = o.agentId !== undefined && o.agentId !== null ? log.filter(l => l.agentId === o.agentId) : log
  const shown = Math.max(1, o.shown)
  const back = Math.max(0, Math.min(Math.max(0, all.length - shown), Math.floor(o.back)))
  const end = all.length - back
  const rows = all.slice(Math.max(0, end - shown), end)
  return { rows, olderHidden: Math.max(0, end - rows.length), newerHidden: back, back }
}

/** Which kinds are drawn as a problem (red): errors and denials. */
export const isProblem = (l: LogLine): boolean => l.kind === 'error' || l.kind === 'deny'
