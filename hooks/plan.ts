// COCKPIT-66: the plan. data-scratch/plan.json is the itemised checklist of the goal; this module reads it, lets the evidence on disk
// (claims, awake lanes, landed commits, reports) override it where the evidence is newer, and hands ONE view to every surface:
// the Main status card (plancard.ts), the top status bar and the line under the input box (register.tsx). Pure: no mods API, no I/O.
//
// File shape (all keys optional but items):
//   { milestone, updated, queue: [{milestone, items}], items: [{id, title, state: todo|running|blocked|done, owner?, planned?,
//     note?, acceptance?, after?, refs?, startedAt?, doneAt?}], history: [{at, id, state, say}] }
//
// Derive rules, strongest first, per item. "Newer" means newer than the file's own `updated` (or its modified time, whichever is later):
//   1. a commit landed with the id at the front of its subject ("Merge <id> ...", "<id>: ...") -> done
//   2. a report whose status line says BLOCKED, newer than the claim it closes -> blocked
//   3. an awake lane on the item, or a live claim no newer report closes -> running, owner = that lane
//   4. otherwise the file's state. The file therefore wins only when it is newer than every piece of evidence.
// Off plan is detected, not declared: a claim, awake lane or landed id that is on no row becomes a row with planned:false. It is counted
// apart (+k off plan) and never inside n/m.

import { ageLabel } from './core.ts'
import { CLAIM_LIVE_MS, landedItemId, leadingId, lineNames, sameItem } from './statuslive.ts'
import type { Claim, LiveMember, ReportMark } from './statuslive.ts'

const MIN = 60_000

export type PlanState = 'todo' | 'running' | 'blocked' | 'done'
export const PLAN_STATES: readonly PlanState[] = ['todo', 'running', 'blocked', 'done']

export type PlanItem = {
  id: string
  title: string
  state: PlanState
  owner: string
  planned: boolean
  note: string
  startedAtMs: number | null
  doneAtMs: number | null
}
export type PlanSay = { atMs: number | null; id: string; state: string; say: string }
export type PlanFile = {
  milestone: string
  /** The later of the file's `updated` and its modified time; null when neither is known. */
  updatedMs: number | null
  items: PlanItem[]
  /** Later goals: a name and how many items each, for the collapsed queue line. */
  queue: { milestone: string; count: number }[]
  history: PlanSay[]
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const timeOf = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v !== 'string' || v.trim() === '') return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

/** plan.json as text. null when it is not JSON or has no items list (the card then falls back to status.json). */
export function parsePlan(text: string | null, mtimeMs: number | null = null): PlanFile | null {
  if (text === null || text.trim() === '') return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.items)) return null
  const items: PlanItem[] = []
  const seen = new Set<string>()
  for (const r of o.items) {
    if (r === null || typeof r !== 'object') continue
    const it = r as Record<string, unknown>
    const id = str(it.id)
    if (id === '' || seen.has(id.toLowerCase())) continue
    seen.add(id.toLowerCase())
    const state = PLAN_STATES.find(s => s === str(it.state).toLowerCase()) ?? 'todo'
    items.push({
      id,
      title: str(it.title) || id,
      state,
      owner: str(it.owner),
      planned: it.planned !== false,
      note: str(it.note),
      startedAtMs: timeOf(it.startedAt),
      doneAtMs: timeOf(it.doneAt),
    })
  }
  const queue = (Array.isArray(o.queue) ? o.queue : []).flatMap((q): { milestone: string; count: number }[] => {
    if (q === null || typeof q !== 'object') return []
    const qq = q as Record<string, unknown>
    return [{ milestone: str(qq.milestone), count: Array.isArray(qq.items) ? qq.items.length : 0 }]
  })
  const history = (Array.isArray(o.history) ? o.history : []).flatMap((h): PlanSay[] => {
    if (h === null || typeof h !== 'object') return []
    const hh = h as Record<string, unknown>
    const say = str(hh.say)
    return say === '' ? [] : [{ atMs: timeOf(hh.at), id: str(hh.id), state: str(hh.state), say }]
  })
  const fileMs = timeOf(o.updated)
  const updatedMs = fileMs === null ? mtimeMs : mtimeMs === null ? fileMs : Math.max(fileMs, mtimeMs)
  return { milestone: str(o.milestone), updatedMs, items, queue, history }
}

// ---------------------------------------------------------------------------
// Evidence in, view out

export type BlockedReport = { id: string; atMs: number; detail: string }
export type LandedAt = { hash: string; subject: string; atMs: number | null }

export type PlanEvidence = {
  nowMs: number
  members: readonly LiveMember[]
  claims: readonly Claim[]
  reports: readonly ReportMark[]
  /** Reports whose status line says blocked (flightlog judges them). */
  blocked: readonly BlockedReport[]
  landed: readonly LandedAt[]
  /** Names that are alive right now: awake lane sessions and running agents. */
  aliveNames: readonly string[]
}

export type RowSource = 'file' | 'landed' | 'report' | 'lane' | 'claim'
export type PlanRow = {
  id: string
  title: string
  state: PlanState
  owner: string
  planned: boolean
  note: string
  source: RowSource
  /** When the row started running (ms), for the live timer; null when unknown. */
  startedMs: number | null
  /** When it finished or was last touched by evidence, for ordering the done list. */
  atMs: number | null
  /** A running row whose owner is not alive anywhere: the card turns it red. */
  gone: boolean
  /** Blocked on Jesse: counts toward `you`. */
  onYou: boolean
  /** The newest plain sentence the writer gave for this item (plan-set --say), '' when none. */
  say: string
  /** Every history line for this item, oldest first: the state history shown when the card is open. */
  history: PlanSay[]
}

export type Drift = { level: 'ok' | 'amber' | 'red'; ms: number; text: string; landings: number; claims: number; reports: number }

export type PlanView = {
  milestone: string
  updatedMs: number | null
  running: PlanRow[]
  blocked: PlanRow[]
  todo: PlanRow[]
  done: PlanRow[]
  off: PlanRow[]
  /** Counted planned items only. */
  planned: number
  doneN: number
  ratio: number
  you: number
  youAsks: string[]
  /** Rows that wait on Jesse (blocked, owner jesse), planned or not, for the Waiting on me section. */
  waiting: PlanRow[]
  drift: Drift
  /** Red drift: the dot on the top bar. */
  stale: boolean
  queue: { milestone: string; count: number }[]
  /** The newest plain sentence the writer gave (plan-set --say), for the history tail. */
  lastSay: string
}

export const DRIFT_AMBER_MS = 10 * MIN
export const DRIFT_RED_MS = 30 * MIN
export const OWNER_YOU = /^(jesse|you|owner)$/i

const sayOf = (history: readonly PlanSay[], id: string): { say: string; history: PlanSay[] } => {
  const mine = history.filter(h => h.id.toLowerCase() === id.toLowerCase())
  return { say: mine.length > 0 ? (mine[mine.length - 1]?.say ?? '') : '', history: mine }
}

/** A title that only repeats the id (or is the id with a version suffix) tells a person nothing. */
export function isCrypticTitle(r: Pick<PlanRow, 'id' | 'title'>): boolean {
  const t = r.title.trim().toLowerCase()
  const id = r.id.trim().toLowerCase()
  if (t === '' || t === id) return true
  const rest = t.startsWith(id) ? t.slice(id.length).replace(/^[\s:,;-]+/, '') : t
  return rest === '' || (!/\s/.test(t) && /\d/.test(t) && /^[a-z0-9._-]+$/.test(t))
}

/** The plain sentence that names an item: its title, or when the title is cryptic the latest say, then the note, then the id. */
export function plainTitle(r: PlanRow): string {
  if (!isCrypticTitle(r)) return r.title
  return r.say !== '' ? r.say : r.note !== '' ? r.note : r.id
}

/** The note to show under the title: left out when it was already used as the title. */
export function plainNote(r: PlanRow): string {
  return isCrypticTitle(r) && r.say === '' && r.note !== '' ? '' : r.note
}

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** The item id a landed subject names: "Merge SEARCH-APPS-LINK-01 ..." and "SEARCH-APPS-LINK-01: ..." both give the id. */
export function landedId(subject: string): string {
  const s = subject.trim()
  const m = /^Merge\s+(?:branch\s+['"]?)?(\S+)/i.exec(s)
  return landedItemId(m !== null ? (m[1] ?? '').replace(/['",.:;]+$/, '') : s)
}

const titleFromSubject = (subject: string, id: string): string => {
  let t = squash(subject.replace(/^Merge\s+(?:branch\s+['"]?)?/i, ''))
  if (t.toLowerCase().startsWith(id.toLowerCase())) t = t.slice(id.length).replace(/^[\s:,;-]+/, '')
  return t === '' ? id : t
}

const nameMatches = (a: string, b: string): boolean => a.trim() !== '' && b.trim() !== '' && (a.toLowerCase() === b.toLowerCase() || a.toLowerCase().startsWith(b.toLowerCase()) || b.toLowerCase().startsWith(a.toLowerCase()))

/** Whether the owner of a running row is alive: a lane or agent of that name is up, or (for a named model agent) any agent is. */
export function ownerAlive(owner: string, alive: readonly string[]): boolean {
  if (owner.trim() === '') return true
  const base = owner.replace(/\s*\(.*\)\s*$/, '')
  if (OWNER_YOU.test(base)) return true
  if (alive.some(a => nameMatches(a, base))) return true
  return /agent|sonnet|opus|haiku|fable/i.test(base) && alive.some(a => /agent|sonnet|opus|haiku|fable|sub/i.test(a))
}

export function derivePlan(file: PlanFile, ev: PlanEvidence): PlanView {
  const now = ev.nowMs
  const fileMs = file.updatedMs ?? 0
  const newer = (ms: number | null): boolean => ms === null || ms > fileMs
  const fresh = (c: Claim): boolean => now - c.mtimeMs <= CLAIM_LIVE_MS && c.mtimeMs <= now + MIN
  const closedBy = (id: string, afterMs: number): boolean => ev.reports.some(r => r.mtimeMs > afterMs && sameItem(r.id, id))

  // Awake lanes with the item each one is on.
  const lanes = ev.members
    .filter(m => m.awake)
    .map(m => ({ m, id: [m.lockItem, leadingId(m.label)].find(x => x !== '' && /\d/.test(x) && x.includes('-')) ?? '' }))
    .filter(l => l.id !== '')
  const liveClaims = ev.claims.filter(c => fresh(c) && !closedBy(c.id, c.mtimeMs))

  const rows: PlanRow[] = file.items.map(it => {
    const row: PlanRow = {
      id: it.id,
      title: it.title,
      state: it.state,
      owner: it.owner,
      planned: it.planned,
      note: it.note,
      source: 'file',
      startedMs: it.startedAtMs,
      atMs: it.doneAtMs,
      gone: false,
      onYou: false,
      ...sayOf(file.history, it.id),
    }
    const landed = ev.landed.find(l => {
      const id = landedId(l.subject)
      return id !== '' && sameItem(id, it.id)
    })
    const claim = liveClaims.find(c => sameItem(c.id, it.id))
    const lane = lanes.find(l => sameItem(l.id, it.id))
    const blockedRep = ev.blocked.find(b => sameItem(b.id, it.id) && newer(b.atMs) && (claim === undefined || b.atMs >= claim.mtimeMs))
    if (landed !== undefined && newer(landed.atMs)) {
      row.state = 'done'
      row.source = 'landed'
      row.atMs = landed.atMs ?? now
    } else if (blockedRep !== undefined) {
      row.state = 'blocked'
      row.source = 'report'
      row.atMs = blockedRep.atMs
      if (row.note === '') row.note = blockedRep.detail
    } else if ((lane !== undefined || claim !== undefined) && newer(Math.max(claim?.mtimeMs ?? 0, lane?.m.sinceMs !== null && lane?.m.sinceMs !== undefined ? now - lane.m.sinceMs : 0))) {
      row.state = 'running'
      row.source = lane !== undefined ? 'lane' : 'claim'
      row.owner = lane?.m.name ?? (claim?.lane !== undefined && claim.lane !== '' ? claim.lane : row.owner)
      row.startedMs = claim?.mtimeMs ?? (lane?.m.sinceMs !== null && lane?.m.sinceMs !== undefined ? now - lane.m.sinceMs : row.startedMs)
      row.atMs = row.startedMs
    }
    if (row.state === 'running') {
      row.startedMs ??= file.updatedMs
      row.gone = row.source === 'file' && !ownerAlive(row.owner, ev.aliveNames)
    }
    row.onYou = row.state === 'blocked' && OWNER_YOU.test(row.owner.replace(/\s*\(.*\)\s*$/, ''))
    return row
  })

  // Off plan: evidence whose id is on no row.
  const off: PlanRow[] = []
  const known = (id: string): boolean => rows.some(r => sameItem(r.id, id) || lineNames(r.id, id)) || off.some(r => sameItem(r.id, id))
  const addOff = (r: Omit<PlanRow, 'planned' | 'gone' | 'onYou' | 'note' | 'owner' | 'say' | 'history'> & { owner?: string }): void => {
    if (known(r.id)) return
    off.push({ ...r, owner: r.owner ?? '', planned: false, gone: false, onYou: false, note: '', ...sayOf(file.history, r.id) })
  }
  // Items the file itself marks planned:false are off plan for as long as they run, not only once evidence says they landed.
  for (const r of rows) if (!r.planned) off.push(r)
  for (const l of lanes) addOff({ id: l.id, title: l.m.label.replace(/^\s*[A-Za-z0-9][A-Za-z0-9._-]*[:\s]+/, '') || l.id, state: 'running', owner: l.m.name, source: 'lane', startedMs: l.m.sinceMs !== null ? now - l.m.sinceMs : null, atMs: null })
  for (const c of liveClaims) addOff({ id: c.id, title: c.title !== undefined && c.title !== '' ? c.title : c.id, state: 'running', owner: c.lane ?? '', source: 'claim', startedMs: c.mtimeMs, atMs: c.mtimeMs })
  for (const l of ev.landed) {
    const id = landedId(l.subject)
    if (id !== '') addOff({ id, title: titleFromSubject(l.subject, id), state: 'done', source: 'landed', startedMs: null, atMs: l.atMs })
  }

  const planned = rows.filter(r => r.planned)
  const byState = (s: PlanState): PlanRow[] => planned.filter(r => r.state === s)
  // Done: newest first (its evidence time, else the file order reversed).
  const doneRows = byState('done')
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (b.r.atMs ?? 0) - (a.r.atMs ?? 0) || b.i - a.i)
    .map(x => x.r)
  const youRows = planned.filter(r => r.onYou)

  // Sync: the file's `updated` against the newest evidence.
  const landings = ev.landed.filter(l => landedId(l.subject) !== '' && l.atMs !== null && l.atMs > fileMs).length
  const claimsN = liveClaims.filter(c => c.mtimeMs > fileMs).length
  const reportsN = ev.reports.filter(r => r.mtimeMs > fileMs && now - r.mtimeMs <= CLAIM_LIVE_MS).length
  const evidenceMs = Math.max(0, ...ev.landed.map(l => (landedId(l.subject) !== '' ? l.atMs ?? 0 : 0)), ...liveClaims.map(c => c.mtimeMs), ...ev.reports.filter(r => now - r.mtimeMs <= CLAIM_LIVE_MS).map(r => r.mtimeMs))
  const driftMs = file.updatedMs === null ? 0 : Math.max(0, evidenceMs - fileMs)
  const parts = [landings > 0 ? landings + (landings === 1 ? ' landing' : ' landings') : '', claimsN > 0 ? claimsN + (claimsN === 1 ? ' claim' : ' claims') : '', reportsN > 0 ? reportsN + (reportsN === 1 ? ' report' : ' reports') : ''].filter(x => x !== '')
  const level: Drift['level'] = driftMs >= DRIFT_RED_MS ? 'red' : driftMs >= DRIFT_AMBER_MS ? 'amber' : 'ok'
  const drift: Drift = { level, ms: driftMs, text: level === 'ok' || parts.length === 0 ? '' : parts.join(', ') + ' not on the plan', landings, claims: claimsN, reports: reportsN }

  return {
    milestone: file.milestone,
    updatedMs: file.updatedMs,
    running: byState('running'),
    blocked: byState('blocked'),
    todo: byState('todo'),
    done: doneRows,
    off,
    planned: planned.length,
    doneN: doneRows.length,
    ratio: planned.length === 0 ? 0 : doneRows.length / planned.length,
    you: youRows.length,
    youAsks: youRows.map(r => (r.note !== '' ? r.note : r.title)),
    waiting: rows.filter(r => r.onYou),
    drift,
    stale: level === 'red',
    queue: file.queue,
    lastSay: file.history.length > 0 ? (file.history[file.history.length - 1]?.say ?? '') : '',
  }
}

// ---------------------------------------------------------------------------
// Motion: what moved since the last look. The card animates from this; with the same view and tracker every surface agrees.

export const DONE_HOLD_MS = 3000
export const SLIDE_MS = 700
export const RISE_MS = 800
export const GROW_MS = 4000

export type RowMotion = 'none' | 'rise' | 'hold' | 'slide' | 'fade'
export type PlanTracker = {
  states: Map<string, PlanState>
  changes: Map<string, { to: PlanState; at: number; fresh: boolean }>
  lastDone: number | null
  lastRatio: number
  grew: { from: number; at: number } | null
  started: boolean
}
export const newTracker = (): PlanTracker => ({ states: new Map(), changes: new Map(), lastDone: null, lastRatio: 0, grew: null, started: false })

export type PlanShown = {
  view: PlanView
  /** Running rows including a row that just flipped to done and is still held for a moment. */
  running: PlanRow[]
  /** Done rows less the held ones. */
  done: PlanRow[]
  motion: Map<string, { kind: RowMotion; ageMs: number }>
  /** Where the bar grew from while the count just rose (0 to 1), else null. */
  grewFrom: number | null
  /** The count just ticked up. */
  ticked: boolean
}

/** Record what changed (idempotent for the same view) and return what is drawn now. The first look only records: nothing animates on open. */
export function presentPlan(tr: PlanTracker, view: PlanView, nowMs: number): PlanShown {
  const all = [...view.running, ...view.blocked, ...view.todo, ...view.done]
  for (const r of all) {
    const prev = tr.states.get(r.id)
    if (tr.started && prev !== r.state) tr.changes.set(r.id, { to: r.state, at: nowMs, fresh: prev === undefined })
    tr.states.set(r.id, r.state)
  }
  for (const r of view.off) {
    if (!tr.states.has('off:' + r.id)) {
      if (tr.started) tr.changes.set('off:' + r.id, { to: r.state, at: nowMs, fresh: true })
      tr.states.set('off:' + r.id, r.state)
    }
  }
  if (tr.started && tr.lastDone !== null && view.doneN > tr.lastDone) tr.grew = { from: tr.lastRatio, at: nowMs }
  tr.lastDone = view.doneN
  tr.lastRatio = view.ratio
  tr.started = true

  const motion = new Map<string, { kind: RowMotion; ageMs: number }>()
  const held: PlanRow[] = []
  for (const r of view.done) {
    const c = tr.changes.get(r.id)
    if (c === undefined || c.to !== 'done') continue
    const age = nowMs - c.at
    if (age < DONE_HOLD_MS) {
      motion.set(r.id, { kind: 'hold', ageMs: age })
      held.push(r)
    } else if (age < DONE_HOLD_MS + SLIDE_MS) motion.set(r.id, { kind: 'slide', ageMs: age - DONE_HOLD_MS })
  }
  for (const r of view.running) {
    const c = tr.changes.get(r.id)
    if (c !== undefined && c.to === 'running' && nowMs - c.at < RISE_MS) motion.set(r.id, { kind: 'rise', ageMs: nowMs - c.at })
  }
  for (const r of view.off) {
    const c = tr.changes.get('off:' + r.id)
    if (c !== undefined && nowMs - c.at < 1500) motion.set(r.id, { kind: 'fade', ageMs: nowMs - c.at })
  }
  const heldIds = new Set(held.map(r => r.id))
  const grewFrom = tr.grew !== null && nowMs - tr.grew.at < GROW_MS ? tr.grew.from : null
  return {
    view,
    running: [...view.running, ...held],
    done: view.done.filter(r => !heldIds.has(r.id)),
    motion,
    grewFrom,
    ticked: grewFrom !== null,
  }
}

// ---------------------------------------------------------------------------
// Text for the strips that are plain text: the top status bar and the line under the input box.

/** "04:12" under an hour, "1h04m" over it; '' for an unknown start. */
export function elapsedText(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return ''
  const s = Math.floor(ms / 1000)
  if (s < 3600) return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
  return Math.floor(s / 3600) + 'h' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + 'm'
}

/** "synced 2m ago" (the file's `updated`), '' with no time. */
export function syncedText(updatedMs: number | null, nowMs: number): string {
  if (updatedMs === null) return ''
  const age = Math.max(0, nowMs - updatedMs)
  return age < MIN ? 'synced just now' : 'synced ' + ageLabel(age) + ' ago'
}

export type PlanBand = {
  title: string
  ratio: number
  /** "8/12" */
  count: string
  /** "+3 off plan" or ''. */
  offTag: string
  /** "you: 1" count behind it. */
  you: number
  /** A red dot: the plan is 30 minutes behind the evidence. */
  staleDot: boolean
  /** Amber (10 minutes behind) but not yet red. */
  behind: boolean
  running: boolean
  ticked: boolean
}

export function planBand(shown: PlanShown): PlanBand {
  const v = shown.view
  return {
    title: v.milestone === '' ? 'Plan' : v.milestone,
    ratio: v.ratio,
    count: v.doneN + '/' + v.planned,
    offTag: v.off.length > 0 ? '+' + v.off.length + ' off plan' : '',
    you: v.you,
    staleDot: v.stale,
    behind: v.drift.level === 'amber',
    running: v.running.length > 0,
    ticked: shown.ticked,
  }
}

/** The one line under the input box: `plan 8/12 · running KS-02E, REIKA-T1 · 1 blocked · synced 2m`. It narrows (synced, then the ids, then the blocked part) to fit `max` characters. */
export function planFooterLine(v: PlanView, nowMs: number, pulseOn: boolean, max = 72): string {
  const lead = v.running.length > 0 ? (pulseOn ? '● ' : '○ ') : ''
  const base = lead + 'plan ' + v.doneN + '/' + v.planned
  const sync = (): string => {
    if (v.updatedMs === null) return ''
    const age = Math.max(0, nowMs - v.updatedMs)
    return v.drift.level === 'red' ? 'behind ' + ageLabel(v.drift.ms) : 'synced ' + (age < MIN ? 'now' : ageLabel(age))
  }
  const ids = v.running.map(r => r.id)
  const build = (idMode: 'ids' | 'count' | 'none', withBlocked: boolean, withSync: boolean, withOff: boolean): string => {
    const segs = [base]
    if (ids.length > 0 && idMode === 'ids') segs.push('running ' + ids.join(', '))
    else if (ids.length > 0 && idMode === 'count') segs.push(ids.length + ' running')
    if (withBlocked && v.blocked.length > 0) segs.push(v.blocked.length + ' blocked' + (v.you > 0 ? ' (you ' + v.you + ')' : ''))
    if (withOff && v.off.length > 0) segs.push('+' + v.off.length + ' off')
    const s = withSync ? sync() : ''
    if (s !== '') segs.push(s)
    return segs.join(' · ')
  }
  const tries: string[] = [build('ids', true, true, true), build('ids', true, false, true), build('count', true, false, true), build('count', true, false, false), build('none', true, false, false), base]
  return tries.find(t => t.length <= max) ?? base
}
