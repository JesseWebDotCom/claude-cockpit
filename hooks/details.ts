// The details cards (Addendum 7): the text a hover (or a click, where there is no pointer) shows for a crew
// member, the system dots and the context chip. Pure text builders: one source for the card, the row's
// accessible text and the tests. A part that is not known is left out or says "not read here", never guessed.

import { cleanLine, isJunkLine } from './text.ts'
import { gaugesOf, LEVEL_COLOR, topLine } from './system.ts'
import type { HostReading, Level, SystemReading } from './system.ts'
import { ageLabel, fin } from './core.ts'
import { wrapChars } from './doing.ts'
import { textWidth } from './draw.ts'
import { GUTTER } from './tokens.ts'

// Characters per line of the open row's "Doing" text: what fits the narrowest pane (360 px) after the label column.
export const DOING_WIDTH = 38
export const DOING_LINES = 6
// ...and of its "Task" text.
export const TASK_LINES = 8
// ...and of its "Last report" text (COCKPIT-22: a report's heading and Status line, wrapped like the others).
export const REPORT_LINES = 4

// "cloud-commons-remote-sta..." -> "commons-remote": a cloud member's name, shortened (prefix off, first two words).
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
  // COCKPIT-25: the header line's text (what the closed row says), so the open card does not repeat it.
  header?: string
  // COCKPIT-25: the month-to-date cost of an OpenCode lane ("$183.47 this month"), shown on the "Powered by" row; '' or absent for the others.
  cost?: string
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

// COCKPIT-25: the open card says each fact once. The header line already carries the item id and the status word, so the card never repeats them.
const ID_PREFIX = /^(?:[A-Za-z][A-Za-z0-9]*-)+\d+[A-Za-z]?\s*[:\u2013\u2014\u00b7-]\s*|^[A-Za-z]\d+[A-Za-z]?\s*:\s*/
const reEscape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** A task title without the item id it starts with ("COCKPIT-24: space below" -> "space below"). */
export function stripItemId(text: string, item = ''): string {
  let t = text.trim()
  const id = item.replace(/^stale claim:\s*/, '').trim()
  if (id !== '') t = t.replace(new RegExp('^' + reEscape(id) + '\\s*[:\\u2013\\u2014\\u00b7.-]?\\s*', 'i'), '')
  return t.replace(ID_PREFIX, '').trim()
}

// A report line without its item id and its leading "report:" ("COCKPIT-24 report: done" -> "done").
const reportBody = (text: string, item: string): string => stripItemId(text, item).replace(/^report\s*:\s*/i, '')

/**
 * The "Powered by" parts of a lane: the model first, then where it runs, then the tool that drives it ("Sonnet 5.5 \u00b7 Claude API \u00b7 OpenCode",
 * "GPT-6 Luna low \u00b7 ChatGPT plan \u00b7 Codex"). Built from the plain `powered` text ("Claude API \u00b7 Sonnet 5.5"); a part is never twice.
 */
export function poweredParts(kind: string, powered: string): string[] {
  const parts = powered.split(' \u00b7 ').map(p => p.trim()).filter(p => p !== '')
  if (parts.length === 0) return []
  const [where = '', ...rest] = parts
  const model = rest.join(' \u00b7 ')
  const place = kind === 'codex' ? 'ChatGPT plan' : where
  const tool = kind === 'api' ? 'OpenCode' : kind === 'codex' ? 'Codex' : kind === 'local' && model !== '' ? 'llama-server' : ''
  const seen = new Set<string>()
  return [model, place, tool].filter(p => {
    const k = p.toLowerCase()
    if (p === '' || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// The room of a detail text at the narrowest pane (360 px): after the gutters and the 84 px label column. A "Powered by" line never goes past it.
export const POWERED_PX = 360 - GUTTER * 2 - 84 - 4

/** The parts in lines, joined with " \u00b7 ", as many to a line as fit `maxPx` (a part is never cut across two lines). */
export function packParts(parts: readonly string[], maxPx: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const p of parts) {
    const next = cur === '' ? p : cur + ' \u00b7 ' + p
    if (cur !== '' && textWidth(next, 13) > maxPx) {
      lines.push(cur)
      cur = p
    } else cur = next
  }
  return cur === '' ? lines : [...lines, cur]
}

// The same card as label and text pairs, for the open (accordion) row: one source with memberCard. Rows, each fact once: Doing (only when it adds
// something the header does not say), Task (no item id), Powered by (model, where it runs, the tool, and the month's cost for an OpenCode lane),
// Lock, Last report, then the trouble rows.
export function memberDetail(m: MemberCardIn): { label: string; text: string; cls?: string }[] {
  const out: { label: string; text: string; cls?: string }[] = []
  const rawDesc = m.kind === 'cloud' ? cloudText(m.description) : m.description.trim()
  const desc = stripItemId(rawDesc, m.item)
  // What it is doing, in full, wrapped to a few short lines (the drawing's width is not known here). Never the status word, the item id, the task or
  // what the header line already says.
  const doing = stripItemId(m.doing === undefined ? '' : m.doing.trim(), m.item)
  const same = [m.activity, m.item, desc].map(norm)
  const header = norm(m.header ?? '')
  const nd = norm(doing)
  const adds = nd !== '' && !same.includes(nd) && !(header !== '' && header.includes(nd))
  if (adds) wrapChars(doing, DOING_WIDTH, DOING_LINES).forEach((l, i) => out.push({ label: i === 0 ? 'Doing' : '', text: l }))
  // COCKPIT-17: the task is wrapped over several lines (up to TASK_LINES), not cut to one.
  if (desc !== '') wrapChars(desc, DOING_WIDTH, TASK_LINES).forEach((l, i) => out.push({ label: i === 0 ? 'Task' : '', text: l }))
  const poweredLines = packParts(poweredParts(m.kind, m.powered), POWERED_PX)
  if (m.cost !== undefined && m.cost !== '') poweredLines.push(m.cost)
  poweredLines.forEach((l, i) => out.push({ label: i === 0 ? 'Powered by' : '', text: l }))
  const lock = lockLine(m.lockOwner, m.lockAge)
  if (lock !== '') out.push({ label: 'Lock', text: lock.replace(/^lock: /, '') })
  const report = reportBody(m.kind === 'cloud' ? cloudText(m.lastReport) : m.lastReport.trim(), m.item)
  if (report !== '') wrapChars(report, DOING_WIDTH, REPORT_LINES).forEach((l, i) => out.push({ label: i === 0 ? 'Last report' : '', text: l }))
  for (const b of m.blockedBy) out.push({ label: 'Blocked by', text: b.on + (b.why !== '' ? ': ' + b.why : ''), cls: 'warnc' })
  if (m.outage !== undefined) out.push({ label: m.outage.label.charAt(0) + m.outage.label.slice(1).toLowerCase(), text: m.outage.line, cls: 'errc' })
  else if (m.errored) out.push({ label: 'Error', text: m.errorReason !== '' ? m.errorReason : 'errored', cls: 'errc' })
  if (m.context !== '') out.push({ label: 'Context', text: m.context })
  // An OpenCode lane's month-to-date cost is in "Powered by"; its limits line would say it a second time.
  if (m.limits !== '' && !(m.kind === 'api' && m.cost !== undefined && m.cost !== '')) out.push({ label: 'Limits', text: m.limits })
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
