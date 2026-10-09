// The details cards (Addendum 7): the text a hover (or a click, where there is no pointer) shows for a crew
// member, the system dots and the context chip. Pure text builders: one source for the card, the row's
// accessible text and the tests. A part that is not known is left out or says "not read here", never guessed.

import { cleanLine, isJunkLine } from './text.ts'
import { gaugesOf, LEVEL_COLOR, topLine } from './system.ts'
import type { HostReading, Level, SystemReading } from './system.ts'
import { ageLabel, fin } from './core.ts'
import { wrapChars } from './doing.ts'

// Characters per line of the open row's "Doing" text: what fits the narrowest pane (360 px) after the label column.
export const DOING_WIDTH = 38
export const DOING_LINES = 6
// ...and of its "Task" text.
export const TASK_LINES = 8
// ...and of its "Last report" text (a report's heading and Status line, wrapped like the others).
export const REPORT_LINES = 4

// "cloud-shared-remote-sta..." -> "shared-remote": a cloud member's name, shortened (prefix off, first two words).
export function shortName(name: string, kind: string): string {
  if (kind !== 'cloud') return name
  const rest = name.replace(/^cloud-/, '')
  const words = rest.split('-').filter(w => w !== '')
  return words.length <= 2 ? rest : words.slice(0, 2).join('-')
}

// A cloud member's text shows only when it passes the junk filter.
export function cloudText(raw: string): string {
  const t = cleanLine(raw)
  return t === '' || isJunkLine(t) ? '' : t
}

export type MemberCardIn = {
  name: string
  // 'codex' | 'api' | 'local' | 'cloud' | 'max'
  kind: string
  activity: string
  // What powers it, in full ("Codex (ChatGPT plan) . GPT-6 Luna low").
  powered: string
  target: string
  item: string
  // The plain-words task (a brief heading), the last report line.
  description: string
  lastReport: string
  // How long it has been in this state, "12s", "4m".
  since: string
  lockOwner: string
  lockAge: string
  // "ctx 74% . 148k of 200k", only the coordinator has one.
  context: string
  // The limits line this member draws on ("Codex 5h 52% used ... week 97% used", a credit line); '' for local.
  limits: string
  blockedBy: { on: string; why: string }[]
  // The member itself broke: its short reason ("out of credits"), '' for "errored" alone.
  errored: boolean
  errorReason: string
  // COCKPIT-31: the account refused this member (label like "OUT OF CREDIT" and the matched output line).
  outage?: { label: string; line: string }
  // Out of credits, with when it is back ("back Thu 9:00") or ''.
  out: boolean
  back: string
  isStale: boolean
  isStuck: boolean
  // v11: the newest tool line of its pane, in full ('' when none): the open row shows it wrapped.
  doing?: string
}

export const lockLine = (owner: string, age: string): string => (owner === '' && age === '' ? '' : 'lock: ' + [owner, age].filter(Boolean).join(', '))

// The lines of a member's card, in a fixed order, only the ones that have something to say.
export function memberCard(m: MemberCardIn): string[] {
  const lines: string[] = []
  const state = m.activity + (m.target !== '' ? ' \u00b7 ' + m.target : '') + (m.since !== '' ? ' (' + m.since + ')' : '')
  lines.push(shortName(m.name, m.kind) + ' \u00b7 ' + m.kind)
  if (m.powered !== '') lines.push('powered by ' + m.powered)
  lines.push(state)
  if (m.outage !== undefined) lines.push(m.outage.label.toLowerCase() + ': ' + m.outage.line)
  else if (m.errored) lines.push('errored' + (m.errorReason !== '' ? ': ' + m.errorReason : ''))
  if (m.out) lines.push('out of credits' + (m.back !== '' ? ', ' + m.back : ''))
  if (m.isStuck) lines.push('stuck? no change for a long while')
  else if (m.isStale) lines.push('stale? idle with an old lock')
  if (m.item !== '') lines.push('item: ' + m.item)
  if (m.doing !== undefined && m.doing.trim() !== '') lines.push('doing: ' + m.doing.trim())
  const desc = m.kind === 'cloud' ? cloudText(m.description) : m.description.trim()
  if (desc !== '') lines.push('task: ' + desc)
  const report = m.kind === 'cloud' ? cloudText(m.lastReport) : m.lastReport.trim()
  if (report !== '') lines.push('last: ' + report)
  const lock = lockLine(m.lockOwner, m.lockAge)
  if (lock !== '') lines.push(lock)
  if (m.context !== '') lines.push(m.context)
  if (m.limits !== '') lines.push(m.limits)
  for (const b of m.blockedBy) lines.push('blocked by ' + b.on + (b.why !== '' ? ': ' + b.why : ''))
  return lines
}

// The same card as label and text pairs, for the open (accordion) row: one source with memberCard.
export function memberDetail(m: MemberCardIn): { label: string; text: string; cls?: string }[] {
  const out: { label: string; text: string; cls?: string }[] = []
  // What it is doing, in full, wrapped to a few short lines (the drawing's width is not known here).
  const doing = m.doing === undefined ? '' : m.doing.trim()
  if (doing !== '') wrapChars(doing, DOING_WIDTH, DOING_LINES).forEach((l, i) => out.push({ label: i === 0 ? 'Doing' : '', text: l }))
  const desc = m.kind === 'cloud' ? cloudText(m.description) : m.description.trim()
  // the task is wrapped over several lines (up to TASK_LINES), not cut to one.
  if (desc !== '') wrapChars(desc, DOING_WIDTH, TASK_LINES).forEach((l, i) => out.push({ label: i === 0 ? 'Task' : '', text: l }))
  if (m.powered !== '') out.push({ label: 'Powered by', text: m.powered })
  if (m.item !== '') out.push({ label: 'Item', text: m.item })
  const lock = lockLine(m.lockOwner, m.lockAge)
  if (lock !== '') out.push({ label: 'Lock', text: lock.replace(/^lock: /, '') })
  const report = m.kind === 'cloud' ? cloudText(m.lastReport) : m.lastReport.trim()
  if (report !== '') wrapChars(report, DOING_WIDTH, REPORT_LINES).forEach((l, i) => out.push({ label: i === 0 ? 'Last report' : '', text: l }))
  for (const b of m.blockedBy) out.push({ label: 'Blocked by', text: b.on + (b.why !== '' ? ': ' + b.why : ''), cls: 'warnc' })
  if (m.outage !== undefined) out.push({ label: m.outage.label.charAt(0) + m.outage.label.slice(1).toLowerCase(), text: m.outage.line, cls: 'errc' })
  else if (m.errored) out.push({ label: 'Error', text: m.errorReason !== '' ? m.errorReason : 'errored', cls: 'errc' })
  if (m.context !== '') out.push({ label: 'Context', text: m.context })
  if (m.limits !== '') out.push({ label: 'Limits', text: m.limits })
  return out
}

// ---------------------------------------------------------------------------
// The system dots: this computer's memory, CPU and disk, then one dot per listed host (its memory, under its own name; a host that did not answer is left out), worst first.

export type SysDot = { name: string; level: Level; color: string }

const RANK: Record<Level, number> = { red: 0, amber: 1, green: 2, grey: 3 }

export function systemDots(r: SystemReading, hosts: readonly HostReading[]): SysDot[] {
  const dots: SysDot[] = []
  for (const g of gaugesOf(r, hosts)) {
    if (g.isGpu) continue
    const name = g.host ?? (g.label.split(' ')[0] ?? '').toLowerCase()
    if (g.host !== undefined && g.level === 'grey') continue
    if (dots.some(d => d.name === name)) continue
    dots.push({ name, level: g.level, color: LEVEL_COLOR[g.level] })
  }
  return dots.sort((a, b) => RANK[a.level] - RANK[b.level])
}

// The numbers behind the dots: used/total where known, swap, the top 3 memory processes.
export function systemCard(r: SystemReading, hosts: readonly HostReading[]): string[] {
  const lines = gaugesOf(r, hosts).map(g => g.label + (g.note !== '' ? ' (' + g.note + ')' : ''))
  const top = topLine(r.top.slice(0, 3))
  return top !== '' ? [...lines, top] : lines
}

// ---------------------------------------------------------------------------
// The context chip: tokens, startup cost, handoff age.

export function contextCard(o: { used: number | null; window: number | null; percent: number | null; handoffMtimeMs: number | null; nowMs: number }): string[] {
  const k = (n: number): string => (n >= 1000 ? Math.round(n / 1000) + 'k' : String(n))
  const lines: string[] = []
  if (o.percent === null || o.used === null || o.window === null) lines.push('context: no data')
  else lines.push('context ' + o.percent + '% \u00b7 ' + k(o.used) + ' of ' + k(o.window) + ' tokens')
  // The startup cost needs the engine's breakdown; the mod does not ask for it, so it says so.
  lines.push('startup cost: not read here')
  lines.push(o.handoffMtimeMs !== null && fin(o.handoffMtimeMs) ? 'handoff written ' + ageLabel(Math.max(0, o.nowMs - o.handoffMtimeMs)) + ' ago' : 'no handoff written today')
  return lines
}
