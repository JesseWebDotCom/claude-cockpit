// The Claude plan's usage, kept (cockpit v8). The live figures come from $.session.usage() and session.measure and,
// in the real app, were often missing ("not readable"). So every reading that arrives is saved with its time in
// .cockpit/usage-cache.json, the last known value is shown "as of HH:MM" while the live one is missing, a
// /crew usage command writes the cache by hand as the last fallback, and .cockpit/usage-debug.log says which API
// returned data. Nothing here guesses a number: what is not known stays unknown.

import { fin } from './core.ts'
import { winOf } from './limits.ts'
import type { Win } from './limits.ts'

export type UsageValue = { pct: number; resetsAt: string; at: number; source: 'live' | 'manual' }
export type UsageCache = { fiveHour: UsageValue | null; week: UsageValue | null; fable: UsageValue | null }
export const emptyCache: UsageCache = { fiveHour: null, week: null, fable: null }

export type Reading = { kind: string; percentUsed: number; resetsAt?: string }

const KEYS = ['fiveHour', 'week', 'fable'] as const
type Key = (typeof KEYS)[number]

// Which cache slot a rate-limit kind feeds: five_hour, seven_day, and any window whose kind names Fable.
export function slotOf(kind: string): Key | null {
  if (kind === 'five_hour') return 'fiveHour'
  if (kind === 'seven_day') return 'week'
  return /fable/i.test(kind) ? 'fable' : null
}

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n * 10) / 10))

const value = (v: unknown): UsageValue | null => {
  if (v === null || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.pct !== 'number' || !fin(r.pct) || typeof r.at !== 'number' || !fin(r.at)) return null
  return { pct: clamp(r.pct), resetsAt: typeof r.resetsAt === 'string' ? r.resetsAt : '', at: r.at, source: r.source === 'manual' ? 'manual' : 'live' }
}

// Tolerant: a missing or broken file is the empty cache; a bad slot is dropped.
export function parseUsageCache(text: string | null): UsageCache {
  if (text === null) return { ...emptyCache }
  try {
    const r: unknown = JSON.parse(text)
    if (r === null || typeof r !== 'object' || Array.isArray(r)) return { ...emptyCache }
    const o = r as Record<string, unknown>
    return { fiveHour: value(o.fiveHour), week: value(o.week), fable: value(o.fable) }
  } catch {
    return { ...emptyCache }
  }
}

export const serializeUsageCache = (c: UsageCache): string => JSON.stringify(c, null, 1) + '\n'

// Fold live readings into the cache. `changed` is true only when a stored percent or reset moved (the time alone
// does not count, so a repeat of the same reading writes nothing).
export function mergeLive(cache: UsageCache, readings: readonly Reading[], nowMs: number): { cache: UsageCache; changed: boolean } {
  let next = cache
  let changed = false
  for (const r of readings) {
    const slot = slotOf(r.kind)
    if (slot === null || !fin(r.percentUsed)) continue
    const have = next[slot]
    const nv: UsageValue = { pct: clamp(r.percentUsed), resetsAt: r.resetsAt ?? '', at: nowMs, source: 'live' }
    if (have !== null && have.pct === nv.pct && have.resetsAt === nv.resetsAt && have.source === 'live') continue
    next = { ...next, [slot]: nv }
    changed = true
  }
  return { cache: next, changed }
}

export type Picked = { win: Win; asOfMs: number | null; source: 'live' | 'cache' | 'unknown' }

// One window: the live reading when there is one; else the cache's last value (with when it was read), unless its
// window has reset since (the number is no longer true); else unknown.
export function pickWindow(label: Win['label'], live: Reading | undefined, cached: UsageValue | null, nowMs: number): Picked {
  if (live !== undefined && fin(live.percentUsed)) {
    const t = live.resetsAt !== undefined ? Date.parse(live.resetsAt) : Number.NaN
    return { win: winOf(label, live.percentUsed, Number.isFinite(t) ? t : null), asOfMs: null, source: 'live' }
  }
  if (cached !== null) {
    const t = cached.resetsAt !== '' ? Date.parse(cached.resetsAt) : Number.NaN
    if (Number.isFinite(t) && t <= nowMs) return { win: winOf(label, null, null), asOfMs: null, source: 'unknown' }
    return { win: winOf(label, cached.pct, Number.isFinite(t) ? t : null), asOfMs: cached.at, source: 'cache' }
  }
  return { win: winOf(label, null, null), asOfMs: null, source: 'unknown' }
}

export type ClaudeWindows = { five: Picked; week: Picked; fable: Picked | null }

// The five-hour and weekly windows (always), and the Fable week when anything knows it.
export function claudeWindows(live: readonly Reading[], cache: UsageCache, nowMs: number): ClaudeWindows {
  const find = (slot: Key): Reading | undefined => live.find(r => slotOf(r.kind) === slot)
  const fable = pickWindow('week', find('fable'), cache.fable, nowMs)
  return {
    five: pickWindow('5h', find('fiveHour'), cache.fiveHour, nowMs),
    week: pickWindow('week', find('week'), cache.week, nowMs),
    fable: fable.source === 'unknown' ? null : fable,
  }
}

// "as of 14:05" (local time).
export function asOfText(ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => (n < 10 ? '0' + n : String(n))
  return 'as of ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

// ---------------------------------------------------------------------------
// /crew usage 5h=<pct> wk=<pct> fable=<pct> [5h-resets=<ISO or HH:MM>] [wk-resets=...] [fable-resets=...]

export type UsageArgs = { ok: true; set: { slot: Key; pct: number; resetsAt: string }[] } | { ok: false; error: string }

const resetIso = (text: string, nowMs: number): string | null => {
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : null
  const m = /^(\d{1,2}):(\d{2})$/.exec(text)
  if (m === null) return null
  const d = new Date(nowMs)
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  if (d.getTime() <= nowMs) d.setDate(d.getDate() + 1)
  return d.toISOString()
}

export function parseUsageArgs(args: string, nowMs: number): UsageArgs {
  const names: Record<string, Key> = { '5h': 'fiveHour', wk: 'week', week: 'week', fable: 'fable' }
  const pcts = new Map<Key, number>()
  const resets = new Map<Key, string>()
  for (const part of args.split(/\s+/).filter(Boolean)) {
    const m = /^(5h|wk|week|fable)(-resets)?=(.+)$/i.exec(part)
    if (m === null) return { ok: false, error: 'not understood: "' + part + '". Use /cockpit usage 5h=<pct> wk=<pct> fable=<pct>' }
    const slot = names[(m[1] ?? '').toLowerCase()]
    if (slot === undefined) return { ok: false, error: 'unknown window: ' + (m[1] ?? '') }
    if (m[2] !== undefined) {
      const iso = resetIso(m[3] ?? '', nowMs)
      if (iso === null) return { ok: false, error: 'bad reset time for ' + (m[1] ?? '') + ': use HH:MM or an ISO time' }
      resets.set(slot, iso)
    } else {
      const n = Number((m[3] ?? '').replace(/%$/, ''))
      if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: 'a percent from 0 to 100 for ' + (m[1] ?? '') }
      pcts.set(slot, clamp(n))
    }
  }
  if (pcts.size === 0) return { ok: false, error: 'give at least one figure: /cockpit usage 5h=0 wk=87 fable=32' }
  return { ok: true, set: [...pcts].map(([slot, pct]) => ({ slot, pct, resetsAt: resets.get(slot) ?? '' })) }
}

// The cache with the hand-entered figures written over it (a new value replaces the old one whole).
export function applyManual(cache: UsageCache, set: { slot: Key; pct: number; resetsAt: string }[], nowMs: number): UsageCache {
  let next = cache
  for (const s of set) next = { ...next, [s.slot]: { pct: s.pct, resetsAt: s.resetsAt, at: nowMs, source: 'manual' as const } }
  return next
}

// ---------------------------------------------------------------------------
// The debug log: which source answered, with what.

export type Source = 'session.usage@start' | 'session.usage@poll' | 'session.measure' | 'cache' | 'manual'

// One line for a source's answer: "2026-10-08T22:00:00.000Z<TAB>session.measure<TAB>rateLimits=2 five_hour=31 seven_day=62 context=74%".
export function debugLine(iso: string, source: Source, rates: readonly Reading[], ctxPct: number | null): string {
  const got = rates.length === 0 ? 'rateLimits=none' : 'rateLimits=' + rates.length + ' ' + rates.map(r => r.kind + '=' + r.percentUsed).join(' ')
  return iso + '\t' + source + '\t' + got + (ctxPct !== null ? ' context=' + ctxPct + '%' : ' context=none') + '\n'
}
