// The Flight log card (cockpit 0.5.0): a glance at what finished and what did not. One entry per item: its name, a
// status (DONE, ERRORED, BLOCKED, or UNKNOWN when nothing reliable says), and a one-line detail. Newest first, 8 shown, 20 expanded.
// Pure: the reader hands in the text and the mtime of each report; nothing here reads a file.
//
// How a report is judged (the most reliable evidence first; the reports are written by different lanes in different shapes):
//   1. The HEADLINE: the first heading plus the first "Status:" or "Gate:" line. A negative there (not pushed, not landed, gate red,
//      failed, aborted, errored) is ERRORED; "blocked" without a positive is BLOCKED; a positive (done, landed, pushed, fixed, built,
//      installed, passed) is DONE.
//   2. Else the FINAL gate exit code (the last "gate ... exit N" or "exit code N" line): 0 is DONE, anything else ERRORED. An earlier red
//      run followed by a green one is therefore DONE, and a green one followed by a red one is not.
//   3. Else UNKNOWN. A report nothing could read is never shown as DONE.
// An errored or blocked crew member (what the crew module already detects) is an entry too, stamped with when it began.

import { gateCommandSource } from './config.ts'

export type FlightStatus = 'done' | 'errored' | 'blocked' | 'unknown'
export type FlightEntry = { key: string; name: string; status: FlightStatus; detail: string; atMs: number; source: 'report' | 'crew'; who?: string }

export const FLIGHT_SHOWN = 8
export const FLIGHT_EXPANDED = 20
export const FLIGHT_READ = 30
const NAME_MAX = 40
const DETAIL_MAX = 90

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()
const cut = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)).trimEnd() + '\u2026' : s)
// Markdown out of a line: emphasis, code ticks, links, a leading list or heading mark.
const plain = (s: string): string =>
  squash(
    s
      .replace(/^[#>\s*-]+/, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`]+/g, ''),
  )

const NEGATIVE = /\b(?:not pushed|not landed|not committed|no push|no commit|gate (?:is )?red|red in|failed|failing|aborted|errored|did not land|not done)\b/i
const BLOCKED = /\bblocked\b/i
const POSITIVE = /\b(?:done|landed|pushed|fixed|built|complete|completed|installed|passed|green|committed)\b/i

/** The report's name: its first heading without the mark, else the file name without "-report.md". */
export function reportName(fileName: string, text: string): string {
  const h = /^#\s+(.+)$/m.exec(text)?.[1]
  // "CHECK-STEPS-01 report: engine-link doctor..." reads "CHECK-STEPS-01: engine-link doctor..." (the word "report" says nothing in a list of reports).
  const name = h !== undefined ? plain(h).replace(/\s+report\b:?\s*/i, ': ').replace(/:\s*$/, '') : fileName.replace(/-report\.md$|\.md$/g, '')
  return cut(name === '' ? fileName : name, NAME_MAX)
}

/** The first "Status:" or "Gate:" line of a report (as plain text), '' when it has none. */
export function statusLine(text: string): string {
  for (const raw of text.split('\n').slice(0, 40)) {
    const m = /^\s*[-*]?\s*\**(Status|Gate)\**\s*:\s*\**\s*(.+)$/i.exec(raw)
    if (m !== null) return plain((m[1] ?? '') + ': ' + (m[2] ?? ''))
  }
  return ''
}

/**
 * The last gate exit code a report states, or null. A line that names the gate (or the gate command from the config) and gives `exit` or `exit code` and a number
 * counts first; only when no line does, a bare "Exit code: N" line counts. (A proof command's "exit code 0" is not the gate's.)
 */
export function finalGateExit(text: string): number | null {
  let gate: number | null = null
  let any: number | null = null
  for (const line of text.split('\n')) {
    for (const m of line.matchAll(/\bexit(?:\s+code)?[\s:=*`]*(\d{1,3})\b/gi)) {
      if (new RegExp('gate|' + gateCommandSource(), 'i').test(line)) gate = Number(m[1])
      else if (/^\W*exit code\b/i.test(line)) any = Number(m[1])
    }
  }
  return gate ?? any
}

/** Who did the work, when the report says so: its "Lane:" or "Model:" line (first 40 lines), cut at the first full stop, '' when it has none. */
export function whoOf(text: string): string {
  for (const raw of text.split('\n').slice(0, 40)) {
    const m = /^\s*[-*]?\s*\**(Lane|Model)\**\s*:\s*\**\s*(.+)$/i.exec(raw)
    if (m !== null) return cut(plain(m[2] ?? '').split(/[.;,]\s/)[0] ?? '', 28)
  }
  return ''
}

/** How long ago, in words: "just now", "5 min ago", "3 h ago", "2 d ago". */
export function agoWords(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + ' min ago'
  if (s < 86400) return Math.floor(s / 3600) + ' h ago'
  return Math.floor(s / 86400) + ' d ago'
}

/**
 * Row 2 of an entry: the short statement, who (a lane or model, or the crew member's pane for crew trouble), and when. It never states the title
 * or the status again: a statement that only restates either is dropped. The drawing cuts it to the width with an ellipsis.
 */
export function flightDetails(e: FlightEntry, nowMs: number): string {
  const word = STATUS_WORD[e.status].toLowerCase()
  const bare = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const statement = bare(e.detail) === bare(e.name) || bare(e.detail) === word ? '' : e.detail
  const who = e.source === 'crew' ? 'crew' : e.who ?? ''
  return [statement, who, e.atMs > 0 ? agoWords(nowMs - e.atMs) : ''].filter(s => s !== '').join(' \u00b7 ')
}

/** One report to one entry. `atMs` is the file's mtime (the order). */
export function parseReport(fileName: string, text: string, atMs: number): FlightEntry {
  const name = reportName(fileName, text)
  const status = statusLine(text)
  const heading = /^#\s+(.+)$/m.exec(text)?.[1] ?? ''
  const headline = plain(heading) + ' ' + status
  const exit = finalGateExit(text)
  let verdict: FlightStatus = 'unknown'
  if (NEGATIVE.test(headline)) verdict = 'errored'
  else if (BLOCKED.test(headline) && !POSITIVE.test(headline)) verdict = 'blocked'
  else if (POSITIVE.test(headline)) verdict = 'done'
  else if (exit !== null) verdict = exit === 0 ? 'done' : 'errored'
  else {
    // No headline verdict and no gate: the first lines of the report, only for a plain statement that it landed or did not.
    const lead = text.split('\n').slice(0, 12).map(plain).join(' ')
    if (/\b(?:not pushed|not landed|not committed|no push|no commit)\b/i.test(lead)) verdict = 'errored'
    else if (/\b(?:landed on main|landed and pushed|done and pushed|pushed to (?:origin|main))\b/i.test(lead)) verdict = 'done'
  }
  // The detail is the status line when there is one, else the gate evidence, else the first sentence under the heading.
  const body = text.split('\n').map(plain).find((l, i) => i > 0 && l.length > 12 && !/^(?:What you do now|Status|Model|Commit)\b/i.test(l)) ?? ''
  const detail = status !== '' ? status.replace(/^(?:Status|Gate)\s*:\s*/i, '') : exit !== null ? 'gate exit ' + exit : body
  return { key: 'report:' + fileName, name, status: verdict, detail: cut(detail, DETAIL_MAX), atMs, source: 'report', who: whoOf(text) }
}

export type CrewTrouble = { name: string; kind: 'errored' | 'blocked'; reason: string; sinceMs: number }

/** The errored and blocked crew members as entries, stamped with when the trouble began (now minus how long the pane has been quiet). */
export const crewEntries = (troubles: readonly CrewTrouble[], nowMs: number): FlightEntry[] =>
  troubles.map(t => ({ key: 'crew:' + t.name + ':' + t.kind, name: cut(t.name, NAME_MAX), status: t.kind, detail: cut(t.reason === '' ? t.kind : t.reason, DETAIL_MAX), atMs: nowMs - Math.max(0, t.sinceMs), source: 'crew' as const }))

/** The card's entries: reports and crew trouble together, newest first, `max` of them. */
export const flightRows = (entries: readonly FlightEntry[], max: number): FlightEntry[] => [...entries].sort((a, b) => b.atMs - a.atMs).slice(0, Math.max(0, max))

export const STATUS_WORD: Record<FlightStatus, string> = { done: 'DONE', errored: 'ERRORED', blocked: 'BLOCKED', unknown: 'UNKNOWN' }
export const STATUS_HEX: Record<FlightStatus, string> = { done: '#3FB950', errored: '#F85149', blocked: '#F0A500', unknown: '#8B949E' }

/** "5 done, 2 errored, 1 blocked": the counts of the entries shown, only the ones that are not zero. */
export function flightSummary(entries: readonly FlightEntry[]): string {
  const n = (s: FlightStatus): number => entries.filter(e => e.status === s).length
  const parts = (['done', 'errored', 'blocked', 'unknown'] as const).filter(s => n(s) > 0).map(s => n(s) + ' ' + s)
  return parts.join(', ')
}
