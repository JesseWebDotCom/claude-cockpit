// The Limits area: one indicator per plan or pool, always BOTH windows (5h and week), and one per credit
// pool. Pure: no mods API, no I/O. A pool never renders one window without the other: an unreadable window
// is shown as "not readable here" in amber, never hidden and never invented. Unit tested in
// tests/limits.test.ts.

import { fin, fmtClock, fmtDay } from './core.ts'
import type { CodexLimits } from './core.ts'

export const AMBER = '#F0A500'
export const RED = '#F85149'
export const GREEN = '#3FB950'

// The ONE colour rule for every USED percent, everywhere: green under 60, amber from 60 to 85, red over 85. Amber
// when unreadable (the bar is empty then; nothing is claimed).
export function usedColor(used: number | null): string {
  if (used === null || !fin(used)) return AMBER
  return used > 85 ? RED : used >= 60 ? AMBER : GREEN
}

export type Win = {
  label: '5h' | 'week'
  // 0 to 100, or null when this window cannot be read.
  used: number | null
  // When it resets, ms since the epoch, or null.
  resetsAtMs: number | null
}

export type Pool = {
  id: string
  name: string
  five: Win
  week: Win
}

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n * 10) / 10))

export const winOf = (label: Win['label'], used: number | null, resetsAtMs: number | null): Win => ({
  label,
  used: used !== null && fin(used) ? clamp(used) : null,
  resetsAtMs: resetsAtMs !== null && fin(resetsAtMs) ? resetsAtMs : null,
})

// Codex: the primary and secondary windows of the newest session log (left, not used); a window that
// already reset, or none, is unreadable; the week falls back to the pane footer's "only N% left".
export function codexPool(limits: CodexLimits | null, nowMs: number, footerLeft: number | null = null): Pool {
  const one = (label: Win['label'], l: { leftPct: number; resetsAt: number } | null, fallbackLeft: number | null): Win => {
    if (l !== null && fin(l.leftPct) && fin(l.resetsAt) && l.resetsAt * 1000 > nowMs) return winOf(label, 100 - l.leftPct, l.resetsAt * 1000)
    if (fallbackLeft !== null && fin(fallbackLeft)) return winOf(label, 100 - fallbackLeft, null)
    return winOf(label, null, null)
  }
  return { id: 'codex', name: 'Codex', five: one('5h', limits?.fiveHour ?? null, null), week: one('week', limits?.week ?? null, footerLeft) }
}

export type RateLimitIn = { kind: string; percentUsed: number; resetsAt?: string }

// Claude Max: `$.session.usage().rateLimits`, the windows the last API response reported ("five_hour",
// "seven_day"). Empty or missing (not a subscription, no response yet) is two unreadable windows.
export function claudePool(rateLimits: readonly RateLimitIn[] | null | undefined): Pool {
  const find = (kind: string): RateLimitIn | undefined => (rateLimits ?? []).find(r => r.kind === kind)
  const win = (label: Win['label'], r: RateLimitIn | undefined): Win => {
    if (r === undefined || !fin(r.percentUsed)) return winOf(label, null, null)
    const t = r.resetsAt !== undefined ? Date.parse(r.resetsAt) : Number.NaN
    return winOf(label, r.percentUsed, Number.isFinite(t) ? t : null)
  }
  return { id: 'claude', name: 'Claude Max', five: win('5h', find('five_hour')), week: win('week', find('seven_day')) }
}

// A window that has reset since it was read says nothing now: its number is stale.
export function liveWin(w: Win, nowMs: number): Win {
  return w.resetsAtMs !== null && w.resetsAtMs <= nowMs ? winOf(w.label, null, null) : w
}

// "back Thu 9:00": the day and the local time of a reset.
export function backText(resetsAtMs: number | null): string {
  if (resetsAtMs === null || !fin(resetsAtMs)) return ''
  const s = Math.floor(resetsAtMs / 1000)
  return 'back ' + fmtDay(s) + ' ' + fmtClock(s).replace(/^0/, '')
}

// Used at 100% (or more) with a reset still ahead. A window whose reset passed, or that reads below 100%,
// is not exhausted: it un-dims by itself.
export function isExhaustedWin(w: Win, nowMs: number): boolean {
  if (w.used === null || w.used < 100) return false
  return w.resetsAtMs === null || w.resetsAtMs > nowMs
}

export type PoolState = { exhausted: boolean; backAtMs: number | null }

// A pool is exhausted when either window is: the later reset of the exhausted ones is when it is back.
export function poolState(p: Pool, nowMs: number): PoolState {
  const hit = [p.five, p.week].filter(w => isExhaustedWin(w, nowMs))
  if (hit.length === 0) return { exhausted: false, backAtMs: null }
  const times = hit.map(w => w.resetsAtMs).filter((t): t is number => t !== null)
  return { exhausted: true, backAtMs: times.length > 0 ? Math.max(...times) : null }
}

const dayOf = (ms: number): string => fmtDay(Math.floor(ms / 1000))
const clockOf = (ms: number): string => fmtClock(Math.floor(ms / 1000))

// When a window resets, short: "14:30" for 5h, "Mon" for the week, '' when unknown.
export const resetOf = (w: Win): string => (w.resetsAtMs === null ? '' : w.label === '5h' ? clockOf(w.resetsAtMs) : dayOf(w.resetsAtMs))

// One window as text: "5h 52% used", with its reset ("resets 14:30" for 5h, "resets Mon" for the week), or
// "5h not readable here".
export function winText(w: Win): string {
  if (w.used === null) return w.label + ' not readable here'
  const reset = w.resetsAtMs === null ? '' : ' \u00b7 resets ' + (w.label === '5h' ? clockOf(w.resetsAtMs) : dayOf(w.resetsAtMs))
  return w.label + ' ' + Math.round(w.used) + '% used' + reset
}

export type PoolSummary = { text: string; short: string; color: string }

// The one-line summary of a pool: BOTH windows, always, 5h first. Its colour is the WORSE of the two
// (red over amber over green; an unreadable window counts as amber).
export function poolSummary(p: Pool): PoolSummary {
  const colors = [usedColor(p.five.used), usedColor(p.week.used)]
  const color = colors.includes(RED) ? RED : colors.includes(AMBER) ? AMBER : GREEN
  const short = (w: Win) => (w.used === null ? w.label + ' ?' : w.label + ' ' + Math.round(w.used) + '%')
  return {
    text: p.name + ': ' + winText(p.five) + '  ' + winText(p.week),
    short: p.name + ' ' + short(p.five) + ' \u00b7 ' + short(p.week),
    color,
  }
}

// Several pools in one line, for a collapsed summary: every pool, both windows each.
export const poolsLine = (pools: readonly Pool[]): string => pools.map(p => poolSummary(p).short).join('   ')

// The worst colour over some pools (the one a collapsed summary or a badge shows).
export function worstColor(pools: readonly Pool[]): string {
  const cs = pools.map(p => poolSummary(p).color)
  return cs.includes(RED) ? RED : cs.includes(AMBER) ? AMBER : GREEN
}

// ---------------------------------------------------------------------------
// Credits (.cockpit/credits.json, read only by the mod):
//   {"opencode":{"total":200,"left":197,"expires":"2026-10-28"},"cloud":{"expires":"2026-11-30"}}

export type Credit = { total: number | null; left: number | null; expires: string; start?: string; limit?: number; asOf?: string; source?: string }
export type CreditsFile = { opencode: Credit | null; cloud: Credit | null }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(/^\$/, ''))) ? Number(v.replace(/^\$/, '')) : null)

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

// `start` (optional, "2026-10-01") is when the credit began; the OpenCode spend is measured from it.
const credit = (v: unknown): Credit | null => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  const base: Credit = { total: num(r.total), left: num(r.left), expires: str(r.expires) }
  const limit = num(r.limit)
  return { ...base, ...(str(r.start) !== '' ? { start: str(r.start) } : {}), ...(limit !== null && limit > 0 ? { limit } : {}), ...(str(r.asOf) !== '' ? { asOf: str(r.asOf) } : {}), ...(str(r.source) !== '' ? { source: str(r.source) } : {}) }
}

// The monthly API limit for the API line (v9): `opencode.limit`, else `opencode.total` (a credit of $200 a month is
// the same number), else 200.
export function apiLimitOf(file: CreditsFile | null): number {
  const c = file?.opencode ?? null
  const limit = c?.limit ?? c?.total ?? 200
  return limit > 0 ? limit : 200
}

export function parseCreditsFile(text: string): CreditsFile | null {
  try {
    const raw: unknown = JSON.parse(text)
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
    const r = raw as Record<string, unknown>
    return { opencode: credit(r.opencode), cloud: credit(r.cloud) }
  } catch {
    return null
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-10-28" -> "Oct 28"; anything else is returned as it is.
export function monthDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? (MONTHS[Number(m[2]) - 1] ?? '') + ' ' + Number(m[3]) : iso
}

const money = (n: number): string => '$' + (Number.isInteger(n) ? String(n) : n.toFixed(2))

export type CreditView = {
  id: string
  name: string
  // "$62 spent . $138 left . expires Oct 28", or "$197 left . ..." with no total, or "expires Nov 30".
  text: string
  spent: number | null
  left: number | null
  total: number | null
  // The share spent, 0 to 1, for the bar; null with no total.
  ratio: number | null
  exhausted: boolean
  expired: boolean
  // The raw expiry ("2026-10-28") and credit start ("2026-10-01"), or ''.
  expires: string
  start: string
}

// Exhausted: nothing left (0 or less) or the expiry date has passed. Low credits are never exhausted.
export function creditView(id: string, name: string, c: Credit | null, nowMs: number): CreditView {
  if (c === null) return { id, name, text: 'not readable here', spent: null, left: null, total: null, ratio: null, exhausted: false, expired: false, expires: '', start: '' }
  const spent = c.total !== null && c.left !== null ? Math.max(0, c.total - c.left) : null
  const expiryMs = /^\d{4}-\d{2}-\d{2}/.test(c.expires) ? Date.parse(c.expires.slice(0, 10) + 'T23:59:59') : Number.NaN
  const expired = Number.isFinite(expiryMs) && expiryMs < nowMs
  const parts = [spent !== null ? money(spent) + ' spent' : '', c.left !== null ? money(c.left) + ' left' : '', c.expires !== '' ? 'expires ' + monthDay(c.expires) : ''].filter(Boolean)
  return {
    id,
    name,
    text: parts.length > 0 ? parts.join(' \u00b7 ') : 'not readable here',
    spent,
    left: c.left,
    total: c.total,
    ratio: c.total !== null && c.total > 0 && spent !== null ? Math.min(1, spent / c.total) : null,
    exhausted: (c.left !== null && c.left <= 0) || expired,
    expired,
    expires: c.expires,
    start: c.start ?? '',
  }
}

export function creditViews(file: CreditsFile | null, nowMs: number): CreditView[] {
  return [creditView('opencode', 'OpenCode (Claude API)', file?.opencode ?? null, nowMs), creditView('cloud', 'Claude cloud', file?.cloud ?? null, nowMs)]
}

// What the Limits area holds, in order: the plans, then the credits.
export type LimitsIn = { pools: Pool[]; credits: CreditView[]; nowMs: number }
