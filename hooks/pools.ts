// The six pools (cockpit v7): System, Claude, Codex, API, Cloud, Local. One model feeds the strip above the prompt,
// the Limits area at the bottom of the pane and the details cards, so they always agree. Pure functions, no I/O;
// unit tested in tests/pools.test.ts. Nothing is invented: what cannot be read is a muted "not readable" line.

import { fmtTime } from './core.ts'
import type { CostWindow, Spend } from './spend.ts'
import { asOfText } from './usage.ts'
import type { ClaudeWindows, Picked } from './usage.ts'
import { backText, monthDay, poolState, resetOf, usedColor, winText } from './limits.ts'
import type { Pool, Win } from './limits.ts'
import { textWidth } from './draw.ts'

export type PoolId = 'system' | 'claude' | 'codex' | 'api' | 'cloud' | 'local'

// One thin meter. `ratio` null is an empty track. `hex` is the threshold colour (green, amber over 70, red over 85).
// `value` is the percent text the Limits area always shows; the strip shows it only from 70%.
export type Meter = { label: string; ratio: number | null; hex: string; value: string; sub: string; dim: boolean }

export type PoolRow = {
  id: PoolId
  name: string
  // The strip's button label when the width is short.
  initial: string
  // The state dot (hex) or null for none.
  dot: string | null
  meters: Meter[]
  // The Limits area's text after the meters ("$3 / $197 \u00b7 Oct 28"), or the whole line when there are no meters.
  text: string
  // Muted: the pool cannot be read.
  isMuted: boolean
  // Exhausted or down.
  dim: boolean
  // The details card, one line each: exact numbers, reset times, the dollar estimate, where the figure comes from.
  card: string[]
}

const GREEN = '#3FB950'
const AMBER = '#F0A500'
const RED = '#F85149'
const GREY = '#8B949E'

const pct = (u: number | null): string => (u === null ? 'n/a' : Math.round(u) + '%')
const winMeter = (w: Win, dim: boolean): Meter => ({ label: w.label === 'week' ? 'wk' : w.label, ratio: w.used === null ? null : w.used / 100, hex: usedColor(w.used), value: pct(w.used), sub: resetOf(w), dim })
const usd = (n: number): string => '$' + (Number.isInteger(n) ? String(n) : n.toFixed(2))

// ---------------------------------------------------------------------------
// System

export type SysIn = { dots: { name: string; level: string; color: string }[]; summary: string; card: string[] }

export function systemRow(s: SysIn): PoolRow {
  const worst = s.dots[0]
  return { id: 'system', name: 'System', initial: 'S', dot: worst?.color ?? GREY, meters: [], text: s.summary === '' ? 'checking' : s.summary, isMuted: worst === undefined, dim: false, card: s.card.length > 0 ? s.card : ['System: not read yet'] }
}

// ---------------------------------------------------------------------------
// Claude (this account: every Claude session shares the plan)

export type ClaudeIn = {
  // THIS session's context window: a different thing from plan usage. It is a line of the hover card only, never a meter.
  ctx: { percent: number | null; tokens: number | null; window: number | null }
  // The plan's windows: live, else the last known (with when it was read), else unknown (usage.ts).
  windows: ClaudeWindows
  // The dollar estimate per window, or null when the scan has not run (or cannot).
  cost: { five: CostWindow | null; week: CostWindow | null } | null
  nowMs: number
}

const k = (n: number): string => (n >= 1000 ? Math.round(n / 1000) + 'k' : String(n))

function costLine(label: string, c: CostWindow | null): string {
  if (c === null) return ''
  const un = c.unpricedTokens > 0 ? ', ' + k(c.unpricedTokens) + ' tokens of unknown models not priced' : ''
  return '\u2248 ' + usd(c.usd) + ' at API rates in this ' + label + ' window (an estimate, ' + k(c.tokens) + ' tokens' + un + ')'
}

// A window's meter: the percent USED, its reset or, when it is the last known value and not live, "as of HH:MM".
function planMeter(label: string, p: Picked): Meter {
  const w = p.win
  return { label, ratio: w.used === null ? null : w.used / 100, hex: usedColor(w.used), value: pct(w.used), sub: p.asOfMs !== null ? asOfText(p.asOfMs) : resetOf(w), dim: false }
}

// "5h 0% used . resets 05:30", with "(as of 14:05)" when it is the last known value, "unknown" when nothing is known.
function planLine(name: string, p: Picked): string {
  const w = p.win
  if (w.used === null) return name + ' unknown'
  const reset = w.resetsAtMs === null ? '' : ' \u00b7 resets ' + (w.label === '5h' ? resetOf(w) : resetDay(w))
  return name + ' ' + Math.round(w.used) + '% used' + reset + (p.asOfMs !== null ? ' (' + asOfText(p.asOfMs) + ')' : '')
}

// The week resets on a day and a time ("Sat 12:00").
const resetDay = (w: Win): string => (w.resetsAtMs === null ? '' : backText(w.resetsAtMs).replace(/^back /, ''))

export function claudeRow(i: ClaudeIn): PoolRow {
  const { five, week, fable } = i.windows
  const known = five.win.used !== null || week.win.used !== null || (fable !== null && fable.win.used !== null)
  const note = 'This account only: every Claude session shares this plan.'
  const hasCtx = i.ctx.percent !== null
  // THIS session's context is a different figure from the plan: a card line, never a bar.
  const ctxLine = hasCtx ? 'The Captain\'s context window: ' + i.ctx.percent + '%' + (i.ctx.tokens !== null && i.ctx.window !== null ? ' \u00b7 ' + k(i.ctx.tokens) + ' of ' + k(i.ctx.window) + ' tokens' : '') : ''
  if (!known) {
    return { id: 'claude', name: 'Claude', initial: 'C', dot: GREY, meters: [], text: 'plan usage not readable', isMuted: true, dim: false, card: ['Claude Max: plan usage unknown (the session reports no limits and none is saved; /cockpit usage 5h=<pct> wk=<pct> sets it by hand).', ctxLine, note].filter(l => l !== '') }
  }
  const meters: Meter[] = [planMeter('5h', five), planMeter('wk', week)]
  if (fable !== null) meters.push(planMeter('Fable', fable))
  const card = [
    'Claude Max',
    planLine('5h', five),
    planLine('week', week),
    ...(fable !== null ? [planLine('Fable week', fable)] : []),
    ctxLine,
    costLine('5h', i.cost?.five ?? null),
    costLine('7d', i.cost?.week ?? null),
    note,
  ].filter(l => l !== '')
  return { id: 'claude', name: 'Claude', initial: 'C', dot: null, meters, text: '', isMuted: false, dim: false, card }
}

// ---------------------------------------------------------------------------
// Codex

export function codexRow(plan: Pool, nowMs: number): PoolRow {
  const st = poolState(plan, nowMs)
  const hasPlan = plan.five.used !== null || plan.week.used !== null
  if (!hasPlan) return { id: 'codex', name: 'Codex', initial: 'X', dot: GREY, meters: [], text: 'plan usage not readable', isMuted: true, dim: false, card: ['Codex: plan usage not readable here (no recent session log with limits).'] }
  const card = ['Codex', winText(plan.five), winText(plan.week), ...(st.exhausted ? ['out of credits' + (st.backAtMs !== null ? ', ' + backText(st.backAtMs) : '')] : []), 'Source: the newest ~/.codex/sessions log (primary is 5h, secondary is the week).']
  return { id: 'codex', name: 'Codex', initial: 'X', dot: null, meters: [winMeter(plan.five, st.exhausted), winMeter(plan.week, st.exhausted)], text: '', isMuted: false, dim: st.exhausted, card }
}

// ---------------------------------------------------------------------------
// API (OpenCode on the Claude API credit)

// v9: MEASURED ONLY. No balance, no expiry and no manual figure: what OpenCode's own database logged for THIS calendar
// month (since the 1st, UTC), against the monthly limit from credits.json (default $200). Other API use is not counted.

export const DEFAULT_API_LIMIT = 200

export type ApiIn = {
  // What OpenCode's records say for this month; null when sqlite3 or the database could not be read.
  measured: Spend | null
  // The monthly limit in dollars (credits.json opencode.limit, else its total, else 200).
  limit: number
}

// The line that stands for API everywhere (the strip, the Limits area, the health card, the status text).
export function apiText(i: ApiIn): string {
  return i.measured === null ? 'not readable' : usd(i.measured.usd) + ' this month \u00b7 OpenCode'
}

// What to do when the figure cannot be read: the one fix, in plain words.
export const API_UNREADABLE_FIX = 'Install sqlite3 (macOS ships it) and run OpenCode once on this Mac so its database exists, then reload the plugin.'

export function apiRow(i: ApiIn): PoolRow {
  if (i.measured === null) {
    return { id: 'api', name: 'API', initial: 'A', dot: GREY, meters: [], text: 'not readable', isMuted: true, dim: false, card: ['API: not readable here.', 'OpenCode\'s own records could not be read (sqlite3 or its database).', 'To fix: ' + API_UNREADABLE_FIX] }
  }
  const spent = i.measured.usd
  const limit = i.limit > 0 ? i.limit : DEFAULT_API_LIMIT
  const ratio = Math.min(1, spent / limit)
  const text = apiText(i)
  const card = [
    'API: ' + usd(spent) + ' this month, logged by OpenCode',
    'monthly limit ' + usd(limit) + ' \u00b7 resets on the 1st (UTC)',
    i.measured.messages + ' messages in OpenCode\'s own records this month',
    'Other API use is not counted: only what OpenCode logs.',
    'measured',
  ]
  return { id: 'api', name: 'API', initial: 'A', dot: null, meters: [{ label: '', ratio, hex: usedColor((spent / limit) * 100), value: text, sub: '', dim: false }], text, isMuted: false, dim: false, card }
}

// ---------------------------------------------------------------------------
// Cloud (the balance is not readable: the expiry and what runs now)

const DAY = 86_400_000
export const CLOUD_SPAN_DAYS = 30

export function cloudRow(expires: string, running: number, nowMs: number): PoolRow {
  const end = /^\d{4}-\d{2}-\d{2}/.test(expires) ? Date.parse(expires.slice(0, 10) + 'T23:59:59') : Number.NaN
  const runText = running > 0 ? ' \u00b7 ' + running + ' running' : ''
  if (!Number.isFinite(end)) return { id: 'cloud', name: 'Cloud', initial: 'O', dot: GREY, meters: [], text: 'expiry not set' + runText, isMuted: true, dim: false, card: ['Claude cloud credits: the balance is not readable here and no expiry is set in credits.json.'] }
  // Calendar days: the expiry's date against today's (local), so "tomorrow" is 1 day and the day itself is 0.
  const startOf = (ms: number): number => {
    const d = new Date(ms)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }
  const days = Math.max(0, Math.round((startOf(end) - startOf(nowMs)) / DAY))
  const expired = end < nowMs
  const label = monthDay(expires)
  const text = expired ? 'expired ' + label + runText : days === 0 ? label + ', today' + runText : label + ', ' + days + ' day' + (days === 1 ? '' : 's') + runText
  const ratio = expired ? 0 : Math.min(1, days / CLOUD_SPAN_DAYS)
  // The bar is time left over a 30-day scale: an arbitrary span, said so in the card.
  const hex = expired ? RED : days <= 7 ? RED : days <= 14 ? AMBER : GREEN
  const card = ['Claude cloud credits', expired ? 'expired ' + label : days === 0 ? 'expires today (' + label + ')' : 'expires ' + label + ' (' + days + ' day' + (days === 1 ? '' : 's') + ' left)', running + ' cloud session' + (running === 1 ? '' : 's') + ' running now', 'The balance and the cloud share of account usage are not readable here; nothing is invented.', 'The bar is the time left on a ' + CLOUD_SPAN_DAYS + '-day scale.']
  return { id: 'cloud', name: 'Cloud', initial: 'O', dot: running > 0 ? GREEN : null, meters: [{ label: '', ratio, hex, value: label, sub: '', dim: expired }], text, isMuted: false, dim: expired, card }
}

// ---------------------------------------------------------------------------
// Local (free: no limit, so load instead)

export type LocalIn = { up: boolean | null; gpuPct: number | null; running: number }

export function localRow(i: LocalIn): PoolRow {
  const bits = [i.up === null ? '' : i.up ? 'server up' : 'server down', i.gpuPct !== null ? 'GPU ' + Math.round(i.gpuPct) + '%' : '', i.running > 0 ? i.running + ' running' : '', 'free'].filter(Boolean)
  const meters: Meter[] = i.gpuPct !== null ? [{ label: 'GPU', ratio: i.gpuPct / 100, hex: usedColor(i.gpuPct), value: pct(i.gpuPct), sub: '', dim: i.up === false }] : []
  const card = ['Local models (free)', i.up === null ? 'server: nothing known' : i.up ? 'local model server: up' : 'local model server: down', i.gpuPct !== null ? 'GPU memory ' + Math.round(i.gpuPct) + '% (a listed host, when it answers)' : 'GPU: no listed host reports one', 'No limit, so no usage bar.']
  return { id: 'local', name: 'Local', initial: 'L', dot: i.up === null ? GREY : i.up ? GREEN : RED, meters, text: bits.join(' \u00b7 '), isMuted: false, dim: i.up === false, card }
}

// ---------------------------------------------------------------------------
// The strip above the prompt: layout by width

export const STRIP_ORDER: readonly PoolId[] = ['system', 'claude', 'codex', 'api', 'cloud', 'local']
export const METER_W = 48
// The narrow meter, used once dropping pools alone is not enough.
export const METER_W_NARROW = 32
// 12 px between groups (v8), and a native label button is about 8 px per character plus a 3-cell cushion.
export const GROUP_GAP = 12
export const BUTTON_CUSHION = 3

export type StripGroup = { id: PoolId; button: string; meters: Meter[]; dots: string[]; dim: boolean; card: string[]; meterW: number }
export type Strip = { groups: StripGroup[]; tier: number }

// The percent shows from 60% (the amber line of the one colour rule), so a bar that matters can be read.
export const meterShowsPct = (m: Meter): boolean => m.ratio !== null && m.ratio >= 0.6 && m.value.length <= 5
const meterPx = (m: Meter, w: number): number => (m.label !== '' ? Math.ceil(textWidth(m.label, 11)) + 4 : 0) + w + (meterShowsPct(m) ? 4 + Math.ceil(textWidth(m.value, 11)) : 0) + 8
const buttonPx = (label: string): number => (label.length + BUTTON_CUSHION) * 8

// The drawing starts 8 px after its label button, so the label and the first meter never touch.
export const GROUP_PAD = 12
export const groupPx = (g: StripGroup): number => buttonPx(g.button) + GROUP_PAD + g.dots.length * 14 + g.meters.reduce((s, m) => s + meterPx(m, g.meterW), 0)
export const stripPx = (groups: readonly StripGroup[]): number => groups.reduce((s, g) => s + groupPx(g), 0) + Math.max(0, groups.length - 1) * GROUP_GAP

// Drop order when the width is short (v8): Local, then Cloud, then API; then the meters get narrower; then Codex;
// then System. Real names on every label, never an initial, and never an overlap: a group that does not fit is
// not drawn. Claude is never dropped.
const DROPS: readonly { drop: readonly PoolId[]; narrow: boolean }[] = [
  { drop: [], narrow: false },
  { drop: ['local'], narrow: false },
  { drop: ['local', 'cloud'], narrow: false },
  { drop: ['local', 'cloud', 'api'], narrow: false },
  { drop: ['local', 'cloud', 'api'], narrow: true },
  { drop: ['local', 'cloud', 'api', 'codex'], narrow: true },
  { drop: ['local', 'cloud', 'api', 'codex', 'system'], narrow: true },
]

export function stripOf(rows: readonly PoolRow[], widthPx: number): Strip {
  const group = (r: PoolRow, narrow: boolean): StripGroup => ({ id: r.id, button: r.name, meters: r.meters, dots: r.dot !== null ? [r.dot] : r.meters.length === 0 ? [GREY] : [], dim: r.dim, card: r.card, meterW: narrow ? METER_W_NARROW : METER_W })
  const build = (tier: number): StripGroup[] => {
    const t = DROPS[tier] ?? DROPS[DROPS.length - 1]!
    return STRIP_ORDER.filter(id => !t.drop.includes(id)).flatMap(id => {
      const r = rows.find(x => x.id === id)
      return r === undefined ? [] : [group(r, t.narrow)]
    })
  }
  for (let tier = 0; tier < DROPS.length; tier++) {
    const groups = build(tier)
    if (stripPx(groups) <= widthPx) return { groups, tier }
  }
  return { groups: build(DROPS.length - 1), tier: DROPS.length }
}

// "Nov 30, 52 days" style age text for the Health summary line (used by the pane).
export const summaryOf = (rows: readonly PoolRow[]): string => rows.map(r => r.name + (r.isMuted ? ' ?' : r.meters.length > 0 && r.id !== 'api' ? ' ' + r.meters.map(m => m.value).join('/') : '')).join(', ')

void fmtTime
