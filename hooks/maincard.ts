// COCKPIT-38: the Main status card fills itself from live data. The hand-written status file keeps only what cannot be derived (milestone, done and
// total, next, you); everything else is read from the folders and repositories on every poll:
//
//   NOW ........ the active work items: claims/*.claim, item id plus the claim's first line (a claim a newer report closes is not active)
//   RUNNING .... how many lanes are awake and how many agents are running (the counts the crew rows already hold)
//   LANDED ..... the subject and age of the newest commit in the listed repositories
//   REPORT ..... the newest report file and its age
//
// The hand-written lines (Next, You) are shown as given. When the file's `updated` is older than a threshold they get a small dim
// "notes from <age> ago"; the card's title row and the live lines never say stale. A missing source gives no line, never an error.
// Pure: no mods API, no I/O. register.tsx reads the sources and calls these. Unit tested in tests/cockpit38.test.ts.

import { CLAIM_LIVE_MS, leadingId, sameItem } from './statuslive.ts'
import type { Claim, ReportMark } from './statuslive.ts'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** "just now", "5m", "3h", "2d": how long ago, short. */
export function agoText(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'just now'
  if (ms < MIN) return 'just now'
  if (ms < HOUR) return Math.floor(ms / MIN) + 'm'
  if (ms < 2 * DAY) return Math.floor(ms / HOUR) + 'h'
  return Math.floor(ms / DAY) + 'd'
}
const agoPhrase = (ms: number): string => (ms < MIN ? 'just now' : agoText(ms) + ' ago')

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** The active work items: one line per claim, "ITEM-ID: first line" (just the id when the first line only repeats it), newest first. */
export function nowItems(claims: readonly Claim[], reports: readonly ReportMark[], nowMs: number): string[] {
  const live = claims.filter(c => nowMs - c.mtimeMs <= CLAIM_LIVE_MS && c.mtimeMs <= nowMs + MIN && !reports.some(r => r.mtimeMs > c.mtimeMs && sameItem(r.id, c.id)))
  return [...live]
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map(c => {
      let text = squash(c.first ?? '')
      if (text.toLowerCase().startsWith(c.id.toLowerCase())) text = text.slice(c.id.length).replace(/^[\s:,;-]+/, '')
      else if (leadingId(text) !== '' && sameItem(leadingId(text), c.id)) text = text.slice(leadingId(text).length).replace(/^[\s:,;-]+/, '')
      return text === '' ? c.id : c.id + ': ' + text
    })
}

/** "2 lanes awake · 1 agent running"; '' when neither is above zero (no line). */
export function runningText(lanesAwake: number, agents: number): string {
  const parts: string[] = []
  if (lanesAwake > 0) parts.push(lanesAwake + (lanesAwake === 1 ? ' lane awake' : ' lanes awake'))
  if (agents > 0) parts.push(agents + (agents === 1 ? ' agent running' : ' agents running'))
  return parts.join(' · ')
}

/** "<subject> · 12m ago"; '' with no commit. */
export function landedText(c: { subject: string; ms: number } | null, nowMs: number): string {
  if (c === null || squash(c.subject) === '') return ''
  return squash(c.subject) + ' · ' + agoPhrase(nowMs - c.ms)
}

/** "<report name> · 3m ago" for the newest report; '' with none. */
export function reportText(reports: readonly { id: string; mtimeMs: number }[], nowMs: number): string {
  let top: { id: string; mtimeMs: number } | null = null
  for (const r of reports) if (top === null || r.mtimeMs > top.mtimeMs) top = r
  return top === null ? '' : top.id + ' · ' + agoPhrase(nowMs - top.mtimeMs)
}

/** The dim note for the hand-written lines: "notes from 2d ago" once `updated` is older than the threshold; '' while fresh or when the time is unknown. */
export function notesNote(updatedMs: number | null, nowMs: number, thresholdHours: number): string {
  if (updatedMs === null) return ''
  const age = nowMs - updatedMs
  return age > thresholdHours * HOUR ? 'notes from ' + agoText(age) + (agoText(age) === 'just now' ? '' : ' ago') : ''
}
