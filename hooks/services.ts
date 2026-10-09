// COCKPIT-39: the services list. ONE declared list of the services the Main status card shows, always all of them, and one function that turns what the
// mod already reads into a row each: what is LEFT (not used), when it resets or expires, a colour, and where the figure came from ("auto" for a
// live reading, "manual" for a hand-written file) with the age of the reading. The System card's Plan limits and the credit icons read the same rows.
// Pure: no mods API, no I/O. Unit tested in tests/cockpit39.test.ts.
//
// Where each figure comes from:
//   Claude plan .... auto: the engine's rate limits, else usage-cache.json (written from live readings)
//   Codex .......... auto: the rate-limit fields Codex writes in its own session files; none readable -> unknown, and a crew refusal shows as out/low
//   API credit ..... auto when the local spend records answer: the baseline left (credits.json, one-time) minus the spend logged since the baseline date;
//                    otherwise manual (the baseline as written)
//   Claude cloud ... manual: no local record carries the cloud balance; the days to expiry come from credits.json
//   Local model .... auto: the health probe

import { stateOfRow, stateWithOutages } from './credit.ts'
import type { CreditState } from './credit.ts'
import { cloudRow } from './pools.ts'
import type { PoolRow } from './pools.ts'
import { backText, monthDay, resetOf } from './limits.ts'
import type { CreditsFile, Pool, Win } from './limits.ts'
import type { Outage } from './outage.ts'
import type { Picked } from './usage.ts'
import { LEVEL_COLOR } from './system.ts'
import { startMs } from './spend.ts'

export type ServiceId = 'claude' | 'cloud' | 'api' | 'codex' | 'local'

/** The declared list: names and order. Config adds and hides none. */
export const SERVICES: readonly { id: ServiceId; name: string }[] = [
  { id: 'claude', name: 'Claude plan' },
  { id: 'cloud', name: 'Claude cloud' },
  { id: 'api', name: 'API' },
  { id: 'codex', name: 'Codex' },
  { id: 'local', name: 'Local model' },
]

export const MANUAL_STALE_MS = 24 * 3_600_000
const LEVEL_OF: Record<CreditState, 'green' | 'amber' | 'red' | 'grey'> = { ok: 'green', low: 'amber', out: 'red', unknown: 'grey' }

export type ServiceRow = {
  id: ServiceId
  name: string
  state: CreditState
  hex: string
  /** What is LEFT, 0 to 1, for the bar; null draws no bar. */
  left: number | null
  /** The figure: "5h 99% left, week 12% left", "$105 of $200 left", "unknown". */
  text: string
  /** The reset or expiry: "resets 01:30", "expires Nov 1"; '' when none applies. */
  when: string
  source: 'auto' | 'manual'
  /** How old the reading is, ms; null when not known. */
  ageMs: number | null
  /** A manual figure older than a day: drawn dim with "check". */
  check: boolean
}

export type ApiBaseline = { left: number; total: number | null; sinceMs: number; expires: string }

/** The one-time baseline from credits.json: the balance at a date. `left` at `asOf` (an ISO instant or date, else the date inside `source`); else `total` at `start`. */
export function apiBaselineOf(file: CreditsFile | null): ApiBaseline | null {
  const c = file?.opencode ?? null
  if (c === null) return null
  const dateOf = (s: string | undefined): number => {
    if (s === undefined) return 0
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const t = Date.parse(s)
      return Number.isFinite(t) ? t : 0
    }
    const m = /\d{4}-\d{2}-\d{2}/.exec(s)
    return m === null ? 0 : startMs(m[0])
  }
  const total = c.total ?? c.limit ?? null
  const at = dateOf(c.asOf) || dateOf(c.source)
  if (c.left !== null && at > 0) return { left: c.left, total, sinceMs: at, expires: c.expires }
  const st = startMs(c.start ?? '')
  if (total !== null && st > 0) return { left: total, total, sinceMs: st, expires: c.expires }
  return null
}

export type ServicesIn = {
  nowMs: number
  /** The Claude plan's windows (usage.ts claudeWindows); null when nothing is known. */
  claude: { five: Picked; week: Picked } | null
  codex: Pool
  /** When the Codex limits were last read (ms), or null. */
  codexAtMs: number | null
  credits: CreditsFile | null
  /** The credits file's modified time (ms), or null. */
  creditsAtMs: number | null
  /** Spend since the baseline date from the local records, and when it was read; null = the records could not be read. */
  apiSpendSince: { usd: number; atMs: number } | null
  /** The pool rows (for the cloud and API colour thresholds and the outage fold). */
  rows: readonly PoolRow[]
  outages: readonly { kind: string; outage: Outage | null }[]
  localUp: boolean | null
}

const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2))
const usd = (n: number): string => '$' + num(Math.round(n * 100) / 100)
const pctLeft = (used: number): number => Math.max(0, Math.min(100, Math.round(100 - used)))

function stateOfUsed(used: readonly (number | null)[]): CreditState {
  const known = used.filter((u): u is number => u !== null)
  if (known.length === 0) return 'unknown'
  const worst = Math.max(...known)
  return worst >= 100 ? 'out' : worst >= 60 ? 'low' : 'ok'
}

const make = (id: ServiceId, state: CreditState, p: Omit<ServiceRow, 'id' | 'name' | 'state' | 'hex' | 'check'>, nowMs: number): ServiceRow => {
  void nowMs
  return { id, name: SERVICES.find(s => s.id === id)?.name ?? id, state, hex: LEVEL_COLOR[LEVEL_OF[state]], ...p, check: p.source === 'manual' && (p.ageMs === null || p.ageMs > MANUAL_STALE_MS) }
}

function windowsText(five: Win, week: Win): { text: string; when: string; left: number | null } {
  const part = (w: Win, label: string): string => (w.used === null ? label + ' unknown' : label + ' ' + pctLeft(w.used) + '%')
  const knownLeft = [five, week].filter(w => w.used !== null).map(w => (100 - (w.used as number)) / 100)
  const whens = [five.used !== null && five.resetsAtMs !== null ? '5h ' + resetOf(five) : '', week.used !== null && week.resetsAtMs !== null ? 'week ' + resetOf(week) : ''].filter(Boolean)
  return { text: part(five, '5h') + ' · ' + part(week, 'week') + ' left', when: whens.length > 0 ? 'resets ' + whens.join(' · ') : '', left: knownLeft.length > 0 ? Math.max(0, Math.min(...knownLeft)) : null }
}

/** The five rows, in the declared order, always all of them. */
export function serviceRows(i: ServicesIn): ServiceRow[] {
  const age = (t: number | null): number | null => (t === null ? null : Math.max(0, i.nowMs - t))
  const out: ServiceRow[] = []

  // Claude plan
  {
    const c = i.claude
    const five = c?.five.win ?? { label: '5h' as const, used: null, resetsAtMs: null }
    const week = c?.week.win ?? { label: 'week' as const, used: null, resetsAtMs: null }
    const state = stateWithOutages(stateOfUsed([five.used, week.used]), ['claude'], i.outages)
    if (state === 'unknown') out.push(make('claude', 'unknown', { left: null, text: 'unknown', when: '', source: 'auto', ageMs: null }, i.nowMs))
    else {
      const w = windowsText(five, week)
      const asOf = [c?.five.asOfMs ?? null, c?.week.asOfMs ?? null].filter((t): t is number => t !== null)
      out.push(make('claude', state, { left: w.left, text: w.text, when: w.when, source: 'auto', ageMs: asOf.length > 0 ? age(Math.min(...asOf)) : 0 }, i.nowMs))
    }
  }

  // Claude cloud: manual (days to expiry from the file)
  {
    const row = cloudRow(i.credits?.cloud?.expires ?? '', 0, i.nowMs)
    const base = stateOfRow(row)
    const state = stateWithOutages(base, ['cloud'], i.outages)
    const exp = i.credits?.cloud?.expires ?? ''
    const days = /^\d{4}-\d{2}-\d{2}/.test(exp) ? Math.round((Date.parse(exp.slice(0, 10) + 'T00:00:00') - new Date(i.nowMs).setHours(0, 0, 0, 0)) / 86_400_000) : null
    if (base === 'unknown') out.push(make('cloud', state, { left: null, text: 'unknown', when: '', source: 'manual', ageMs: age(i.creditsAtMs) }, i.nowMs))
    else out.push(make('cloud', state, { left: row.meters[0]?.ratio ?? null, text: base === 'out' ? 'expired' : days === 0 ? 'last day' : days + ' day' + (days === 1 ? '' : 's') + ' left', when: base === 'out' ? 'expired ' + monthDay(exp) : 'expires ' + monthDay(exp), source: 'manual', ageMs: age(i.creditsAtMs) }, i.nowMs))
  }

  // API credit: baseline minus measured spend since the baseline date
  {
    const b = apiBaselineOf(i.credits)
    const apiRowIn = i.rows.find(r => r.id === 'api')
    if (b === null) {
      // No baseline written: the month's measured spend is all there is; no balance is invented.
      const base = stateOfRow(apiRowIn)
      out.push(make('api', stateWithOutages(base, ['api'], i.outages), { left: null, text: apiRowIn === undefined || apiRowIn.isMuted ? 'unknown' : apiRowIn.text, when: '', source: i.apiSpendSince !== null ? 'auto' : 'manual', ageMs: i.apiSpendSince !== null ? age(i.apiSpendSince.atMs) : null }, i.nowMs))
    } else {
      const spent = i.apiSpendSince !== null ? i.apiSpendSince.usd : 0
      const left = Math.round((b.left - spent) * 100) / 100
      const total = b.total !== null && b.total > 0 ? b.total : null
      const expMs = /^\d{4}-\d{2}-\d{2}/.test(b.expires) ? Date.parse(b.expires.slice(0, 10) + 'T23:59:59') : Number.NaN
      const expired = Number.isFinite(expMs) && expMs < i.nowMs
      const usedPct = total !== null ? ((total - left) / total) * 100 : null
      const base: CreditState = expired || left <= 0 ? 'out' : usedPct !== null && usedPct >= 60 ? 'low' : 'ok'
      const auto = i.apiSpendSince !== null
      out.push(
        make('api', stateWithOutages(base, ['api'], i.outages), {
          left: total !== null ? Math.max(0, Math.min(1, left / total)) : null,
          text: total !== null ? usd(Math.max(0, left)) + ' of ' + usd(total) + ' left' : usd(Math.max(0, left)) + ' left',
          when: b.expires !== '' ? (expired ? 'expired ' : 'expires ') + monthDay(b.expires) : '',
          source: auto ? 'auto' : 'manual',
          ageMs: auto ? age(i.apiSpendSince?.atMs ?? null) : Math.max(0, i.nowMs - b.sinceMs),
        }, i.nowMs),
      )
    }
  }

  // Codex
  {
    const p = i.codex
    const exhausted = [p.five, p.week].some(w => w.used !== null && w.used >= 100 && (w.resetsAtMs === null || w.resetsAtMs > i.nowMs))
    const base = exhausted ? 'out' : stateOfUsed([p.five.used, p.week.used])
    const state = stateWithOutages(base, ['codex'], i.outages)
    const refusal = i.outages.find(o => o.kind === 'codex' && o.outage !== null)?.outage ?? null
    if (base === 'unknown') {
      out.push(make('codex', state, { left: null, text: refusal !== null ? refusal.phrase : 'unknown', when: '', source: 'auto', ageMs: age(i.codexAtMs) }, i.nowMs))
    } else {
      const w = windowsText(p.five, p.week)
      const back = exhausted ? backText(Math.max(0, ...[p.five, p.week].filter(x => x.used !== null && x.used >= 100).map(x => x.resetsAtMs ?? 0))) : ''
      out.push(make('codex', state, { left: w.left, text: refusal !== null ? refusal.phrase + ' · ' + w.text : w.text, when: exhausted && back !== '' ? back : w.when, source: 'auto', ageMs: age(i.codexAtMs) }, i.nowMs))
    }
  }

  // Local model: free, up or down
  {
    const s: CreditState = i.localUp === null ? 'unknown' : i.localUp ? 'ok' : 'out'
    out.push(make('local', s, { left: null, text: i.localUp === null ? 'unknown' : i.localUp ? 'up · free' : 'down', when: '', source: 'auto', ageMs: i.localUp === null ? null : 0 }, i.nowMs))
  }
  return out
}

/** "now", "5m", "3h", "2d". */
export function ageWord(ageMs: number | null): string {
  if (ageMs === null || !Number.isFinite(ageMs)) return ''
  if (ageMs < 60_000) return 'now'
  if (ageMs < 3_600_000) return Math.floor(ageMs / 60_000) + 'm'
  if (ageMs < 48 * 3_600_000) return Math.floor(ageMs / 3_600_000) + 'h'
  return Math.floor(ageMs / 86_400_000) + 'd'
}

/** The tiny marker: "auto · now", "manual · 2d · check". */
export function markerOf(r: ServiceRow): string {
  const a = ageWord(r.ageMs)
  return r.source + (a !== '' ? ' · ' + a : '') + (r.check ? ' · check' : '')
}

/** One line of a service as plain text, for the System card's Plan limits and the picture's alt. */
export function serviceLine(r: ServiceRow): string {
  return r.name + ': ' + r.text + (r.when !== '' ? ' · ' + r.when : '') + ' (' + markerOf(r) + ')'
}
