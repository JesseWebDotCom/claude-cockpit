// Liveness (cockpit v9). The panel must say "working" while something is working, without waiting for an event:
//
//  - an `opencode run` process (found with pgrep) means the OpenCode member is working, with the brief it was given
//    as its item;
//  - a Codex pane whose text changed in the last 60 s is working even when its own markers say idle;
//  - this session's own entry in ~/.claude/sessions/<pid>.json (matched by sessionId) says busy or idle;
//  - one timer drives the redraws (1 s while anything works, 5 s when nothing does) and the polls (5 s while anything
//    works, 30 s otherwise); the tick itself reads only cheap things (the sessions folder, one status file's mtime).
//
// Everything here is pure, so each rule is a test. The reads themselves stay in register.tsx.

import { fin } from './core.ts'

export const TICK_MS = 1000
export const IDLE_TICK_MS = 5000
export const POLL_WORKING_MS = 5000
export const POLL_IDLE_MS = 30000
export const REDRAW_WORKING_MS = 1000
export const REDRAW_IDLE_MS = 5000
export const PANE_ACTIVE_MS = 60000

// ---------------------------------------------------------------------------
// opencode run

export type OpencodeRun = { pid: number; command: string; brief: string }

// `pgrep -fl "opencode run"` prints "<pid> <command line>" per match. The tools around it (pgrep, ps, grep, tmux,
// a shell that only holds the words) are not runs. The newest process (the highest pid) comes first.
export function parsePgrep(stdout: string): OpencodeRun[] {
  const out: OpencodeRun[] = []
  for (const raw of stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(raw)
    if (m === null) continue
    const command = m[2] ?? ''
    if (!/\bopencode\b[^\n]*?\brun\b/.test(command)) continue
    const first = command.split(/\s+/)[0] ?? ''
    if (/(^|\/)(pgrep|ps|grep|rg|tmux|sh|bash|zsh|sudo|ssh)$/.test(first)) continue
    out.push({ pid: Number(m[1]), command, brief: briefNameIn(command) })
  }
  return out.sort((a, b) => b.pid - a.pid)
}

// The brief file a run was given ("Read and do /x/queue/brief-oc-forms13c.md"): its file name, or ''.
export function briefNameIn(command: string): string {
  const m = /(?:^|[\s"'=/])(brief-[\w.-]+?\.md)\b/.exec(command)
  return m?.[1] ?? ''
}

// `ps -o etime=`: "01:23", "1:02:03" or "2-03:04:05" as ms; null when it is not that.
export function parseEtime(text: string): number | null {
  const m = /^\s*(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)\s*$/.exec(text)
  if (m === null) return null
  const [d, h, mi, s] = [Number(m[1] ?? 0), Number(m[2] ?? 0), Number(m[3]), Number(m[4])]
  return (((d * 24 + h) * 60 + mi) * 60 + s) * 1000
}

// ---------------------------------------------------------------------------
// A pane that changed lately

// Working because the pane changed in the last `windowMs` while we were looking. A pane first seen just now has not
// "changed": its first sight is the baseline (a reload must not make every Codex pane look busy for a minute).
export function paneChangedRecently(since: number | null, firstSeenAt: number | null, now: number, windowMs = PANE_ACTIVE_MS): boolean {
  if (since === null || firstSeenAt === null || !fin(since) || !fin(firstSeenAt) || !fin(now)) return false
  return since > firstSeenAt && now - since < windowMs
}

// ---------------------------------------------------------------------------
// This session, from its own entry in ~/.claude/sessions/<pid>.json

export type SessionEntry = { sessionId: string; status: string; sinceMs: number | null }

// Tolerant: any JSON object with a sessionId and a status. `since` is the entry's own time for the status when it
// carries one (a number in ms or s, or an ISO string under updatedAt, statusUpdatedAt or startedAt); otherwise null.
export function parseSessionEntry(text: string): SessionEntry | null {
  try {
    const raw: unknown = JSON.parse(text)
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
    const r = raw as Record<string, unknown>
    const sessionId = typeof r.sessionId === 'string' ? r.sessionId : typeof r.session_id === 'string' ? r.session_id : ''
    const status = typeof r.status === 'string' ? r.status.trim().toLowerCase() : ''
    if (sessionId === '' || status === '') return null
    const t = r.statusUpdatedAt ?? r.updatedAt ?? r.startedAt
    let sinceMs: number | null = null
    if (typeof t === 'number' && fin(t) && t > 0) sinceMs = t < 1e11 ? t * 1000 : t
    else if (typeof t === 'string' && Number.isFinite(Date.parse(t))) sinceMs = Date.parse(t)
    return { sessionId, status, sinceMs }
  } catch {
    return null
  }
}

// busy -> true, any other status -> false, no entry for this session -> null (nothing known from the file).
export function fileBusy(entries: readonly SessionEntry[], sessionId: string): { busy: boolean; sinceMs: number | null } | null {
  if (sessionId === '') return null
  const mine = entries.find(e => e.sessionId === sessionId)
  return mine === undefined ? null : { busy: mine.status === 'busy', sinceMs: mine.sinceMs }
}

// ---------------------------------------------------------------------------
// The timer: what a tick does

export const pollDue = (now: number, lastPollAt: number, anyWorking: boolean): boolean => now - lastPollAt >= (anyWorking ? POLL_WORKING_MS : POLL_IDLE_MS)
export const redrawDue = (now: number, lastDrawAt: number, anyWorking: boolean): boolean => now - lastDrawAt >= (anyWorking ? REDRAW_WORKING_MS : REDRAW_IDLE_MS)

// This session is busy when the sessions file says so or a turn, tool or prompt event has said so and the turn has
// not completed. The file wins for ending: an event that never gets its turn.complete stops counting after 10 min.
export const EVENT_BUSY_MAX_MS = 10 * 60_000
export function mainIsBusy(o: { eventBusyAt: number | null; fileBusy: boolean | null; now: number }): boolean {
  if (o.fileBusy === true) return true
  return o.eventBusyAt !== null && o.now - o.eventBusyAt < EVENT_BUSY_MAX_MS
}

// A short label for a brief, when its heading cannot be read: "brief-oc-forms13c.md" -> "forms13c",
// "brief-b22.md" -> "b22", "brief-oc-feat9.md" -> \"feat9\".
export function briefLabelOf(name: string): string {
  return name.replace(/\.md$/i, '').replace(/^brief-/, '').replace(/^oc-/, '')
}
