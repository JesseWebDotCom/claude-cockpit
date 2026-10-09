import { expect, test } from './pure.ts'

import {
  AMBER,
  GREEN,
  RED,
  backText,
  claudePool,
  codexPool,
  creditView,
  creditViews,
  isExhaustedWin,
  liveWin,
  monthDay,
  parseCreditsFile,
  poolState,
  poolSummary,
  poolsLine,
  usedColor,
  winOf,
  winText,
  worstColor,
} from '../hooks/limits.ts'
import type { Pool } from '../hooks/limits.ts'

const NOW = Date.parse('2026-10-08T22:00:00Z')
const SEC = (ms: number) => Math.floor(ms / 1000)
const HOUR = 3_600_000

// Real data right now: Codex 5h 52% used, week 97% used (rate_limits primary and secondary).
const CODEX_NOW = { fiveHour: { leftPct: 48, resetsAt: SEC(NOW + 2 * HOUR) }, week: { leftPct: 3, resetsAt: SEC(NOW + 48 * HOUR) } }

// ---------------------------------------------------------------------------
// Both windows, always

test('Codex: 5h 52% used and week 97% used together, from primary and secondary', async () => {
  const p = codexPool(CODEX_NOW, NOW)
  expect(p.five).toMatchObject({ label: '5h', used: 52 })
  expect(p.week).toMatchObject({ label: 'week', used: 97 })
  const s = poolSummary(p)
  expect(s.text).toContain('5h 52% used')
  expect(s.text).toContain('week 97% used')
  expect(s.short).toBe('Codex 5h 52% \u00b7 week 97%')
  // The colour is the WORSE of the two: the week is red.
  expect(s.color).toBe(RED)
})

test('the summary colour follows the worse window, whichever it is', async () => {
  const pool = (five: number | null, week: number | null): Pool => ({ id: 'x', name: 'X', five: winOf('5h', five, null), week: winOf('week', week, null) })
  expect(poolSummary(pool(10, 20)).color).toBe(GREEN)
  expect(poolSummary(pool(80, 20)).color).toBe(AMBER)
  expect(poolSummary(pool(20, 80)).color).toBe(AMBER)
  expect(poolSummary(pool(90, 20)).color).toBe(RED)
  expect(poolSummary(pool(20, 90)).color).toBe(RED)
  expect(poolSummary(pool(80, 90)).color).toBe(RED)
  // Unreadable counts as amber, and red still beats it.
  expect(poolSummary(pool(null, 20)).color).toBe(AMBER)
  expect(poolSummary(pool(null, 95)).color).toBe(RED)
  expect(poolSummary(pool(null, null)).color).toBe(AMBER)
  expect(worstColor([pool(10, 10), pool(10, 90)])).toBe(RED)
  expect(worstColor([pool(10, 10), pool(10, 75)])).toBe(AMBER)
  expect(worstColor([pool(10, 10)])).toBe(GREEN)
})

test('the colour rule (v8): green under 60 used, amber 60 to 85, red over 85, amber when unreadable', async () => {
  expect(usedColor(0)).toBe(GREEN)
  expect(usedColor(52)).toBe(GREEN)
  expect(usedColor(59.9)).toBe(GREEN)
  expect(usedColor(60)).toBe(AMBER)
  expect(usedColor(70.1)).toBe(AMBER)
  // Alex's week: 87% used is red, 5h 0% is green.
  expect(usedColor(87)).toBe(RED)
  expect(usedColor(85)).toBe(AMBER)
  expect(usedColor(85.1)).toBe(RED)
  expect(usedColor(100)).toBe(RED)
  expect(usedColor(null)).toBe(AMBER)
  expect(usedColor(Number.NaN)).toBe(AMBER)
})

// The test the addendum asks for: a limit summary must never render one window without the other.
const POOLS: [string, Pool][] = [
  ['Codex, both readable', codexPool(CODEX_NOW, NOW)],
  ['Codex, nothing readable', codexPool(null, NOW)],
  ['Codex, only the 5h readable', codexPool({ fiveHour: CODEX_NOW.fiveHour, week: null }, NOW)],
  ['Codex, only the week readable', codexPool({ fiveHour: null, week: CODEX_NOW.week }, NOW)],
  ['Codex, 5h reset since', codexPool({ fiveHour: { leftPct: 10, resetsAt: SEC(NOW - HOUR) }, week: CODEX_NOW.week }, NOW)],
  ['Codex, week from the footer', codexPool({ fiveHour: CODEX_NOW.fiveHour, week: null }, NOW, 12)],
  ['Claude, both readable', claudePool([{ kind: 'five_hour', percentUsed: 23.5, resetsAt: new Date(NOW + HOUR).toISOString() }, { kind: 'seven_day', percentUsed: 41, resetsAt: new Date(NOW + 72 * HOUR).toISOString() }])],
  ['Claude, empty (not a subscription, no response yet)', claudePool([])],
  ['Claude, unreadable', claudePool(undefined)],
  ['Claude, only five_hour reported', claudePool([{ kind: 'five_hour', percentUsed: 10 }])],
  ['Claude, only seven_day reported', claudePool([{ kind: 'seven_day', percentUsed: 10 }])],
  ['Claude, a gateway spend_limit only', claudePool([{ kind: 'spend_limit', percentUsed: 50 }])],
  ['a pool with NaN', { id: 'n', name: 'N', five: winOf('5h', Number.NaN, null), week: winOf('week', Number.NaN, null) }],
]

test('a limit summary NEVER renders one window without the other', async () => {
  for (const [label, p] of POOLS) {
    const s = poolSummary(p)
    // Both the long text and the short one name the 5h window and the week, 5h first.
    expect(s.text, label).toContain('5h ')
    expect(s.text, label).toContain('week ')
    expect(s.text.indexOf('5h '), label).toBeLessThan(s.text.indexOf('week '))
    expect(s.short, label).toContain('5h ')
    expect(s.short, label).toContain('week ')
    expect(s.short.indexOf('5h '), label).toBeLessThan(s.short.indexOf('week '))
    expect(s.text, label).not.toMatch(/NaN|undefined/)
    expect(s.short, label).not.toMatch(/NaN|undefined/)
    // Every window is either "N% used" or "not readable here" (short form "?"), never missing.
    expect(/5h (\d+% used|not readable here)/.test(s.text), label).toBe(true)
    expect(/week (\d+% used|not readable here)/.test(s.text), label).toBe(true)
    expect(/5h (\d+%|\?)/.test(s.short), label).toBe(true)
    expect(/week (\d+%|\?)/.test(s.short), label).toBe(true)
    expect(winText(p.five), label).toMatch(/^5h /)
    expect(winText(p.week), label).toMatch(/^week /)
  }
  // And the combined line carries every pool with both windows.
  const line = poolsLine(POOLS.map(([, p]) => p))
  const names = line.split('   ')
  expect(names.length).toBe(POOLS.length)
  for (const n of names) {
    expect(n).toContain('5h ')
    expect(n).toContain('week ')
  }
  // A summary built by hand from one window cannot pass the same check: this is what the test guards.
  const oneWindow = 'Codex 5h 52%'
  expect(oneWindow.includes('week ')).toBe(false)
})

test('an unreadable window says "not readable here" and never hides the line', async () => {
  const p = codexPool({ fiveHour: CODEX_NOW.fiveHour, week: null }, NOW)
  expect(winText(p.week)).toBe('week not readable here')
  expect(poolSummary(p).text).toContain('5h 52% used')
  expect(poolSummary(p).text).toContain('week not readable here')
  expect(poolSummary(codexPool(null, NOW)).text).toBe('Codex: 5h not readable here  week not readable here')
  expect(poolSummary(codexPool(null, NOW)).color).toBe(AMBER)
})

test('Codex: a window that reset since the log is unreadable; the week falls back to the pane footer', async () => {
  expect(codexPool({ fiveHour: { leftPct: 10, resetsAt: SEC(NOW - HOUR) }, week: CODEX_NOW.week }, NOW).five.used).toBe(null)
  const fb = codexPool({ fiveHour: CODEX_NOW.fiveHour, week: null }, NOW, 3)
  expect(fb.week).toMatchObject({ used: 97, resetsAtMs: null })
  expect(winText(fb.week)).toBe('week 97% used')
  expect(codexPool({ fiveHour: { leftPct: Number.NaN, resetsAt: SEC(NOW + HOUR) }, week: null }, NOW).five.used).toBe(null)
})

test('window text carries the reset time: a clock for 5h, a day for the week', async () => {
  const p = codexPool(CODEX_NOW, NOW)
  expect(winText(p.five)).toMatch(/^5h 52% used \u00b7 resets \d{2}:\d{2}$/)
  expect(winText(p.week)).toMatch(/^week 97% used \u00b7 resets (Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/)
  expect(winText(winOf('5h', 40, null))).toBe('5h 40% used')
})

// ---------------------------------------------------------------------------
// Claude Max, from the mods API

test('Claude Max: five_hour and seven_day from $.session.usage().rateLimits', async () => {
  const p = claudePool([
    { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-09T01:00:00Z' },
    { kind: 'seven_day', percentUsed: 7, resetsAt: '2026-10-12T09:00:00Z' },
  ])
  expect(p.name).toBe('Claude Max')
  expect(p.five).toMatchObject({ label: '5h', used: 23.5, resetsAtMs: Date.parse('2026-10-09T01:00:00Z') })
  expect(p.week).toMatchObject({ label: 'week', used: 7, resetsAtMs: Date.parse('2026-10-12T09:00:00Z') })
  expect(poolSummary(p).short).toBe('Claude Max 5h 24% \u00b7 week 7%')
  expect(poolSummary(p).color).toBe(GREEN)
  expect(claudePool([{ kind: 'seven_day', percentUsed: 95 }, { kind: 'five_hour', percentUsed: 5 }]).week.used).toBe(95)
})

test('Claude Max: nothing readable is two amber "not readable here" windows, never an invented number', async () => {
  for (const none of [[], undefined, null]) {
    const p = claudePool(none as never)
    expect(p.five.used).toBe(null)
    expect(p.week.used).toBe(null)
    expect(poolSummary(p).text).toBe('Claude Max: 5h not readable here  week not readable here')
    expect(poolSummary(p).color).toBe(AMBER)
  }
  expect(claudePool([{ kind: 'five_hour', percentUsed: Number.NaN }]).five.used).toBe(null)
  expect(claudePool([{ kind: 'five_hour', percentUsed: 10, resetsAt: 'soon' }]).five).toMatchObject({ used: 10, resetsAtMs: null })
})

// ---------------------------------------------------------------------------
// Exhausted (Addendum 6)

test('exhausted: a window at 100% used with its reset ahead; 97% is not', async () => {
  const at = (used: number, resetIn: number | null) => winOf('week', used, resetIn === null ? null : NOW + resetIn)
  expect(isExhaustedWin(at(100, 3 * HOUR), NOW)).toBe(true)
  expect(isExhaustedWin(at(100, null), NOW)).toBe(true)
  expect(isExhaustedWin(at(97, 3 * HOUR), NOW)).toBe(false)
  expect(isExhaustedWin(at(99.9, 3 * HOUR), NOW)).toBe(false)
  expect(isExhaustedWin(winOf('5h', null, null), NOW)).toBe(false)
  // The reset has passed: it un-dims by itself, even if the old reading still says 100.
  expect(isExhaustedWin(at(100, -HOUR), NOW)).toBe(false)
  expect(liveWin(at(100, -HOUR), NOW).used).toBe(null)
  expect(liveWin(at(80, HOUR), NOW).used).toBe(80)
})

test('a pool is exhausted when either window is, and is back at the later reset of the exhausted ones', async () => {
  const both = { id: 'c', name: 'C', five: winOf('5h', 100, NOW + 2 * HOUR), week: winOf('week', 100, NOW + 48 * HOUR) }
  expect(poolState(both, NOW)).toEqual({ exhausted: true, backAtMs: NOW + 48 * HOUR })
  const fiveOnly = { ...both, week: winOf('week', 60, NOW + 48 * HOUR) }
  expect(poolState(fiveOnly, NOW)).toEqual({ exhausted: true, backAtMs: NOW + 2 * HOUR })
  const weekOnly = { ...both, five: winOf('5h', 20, NOW + 2 * HOUR) }
  expect(poolState(weekOnly, NOW)).toEqual({ exhausted: true, backAtMs: NOW + 48 * HOUR })
  // 97% is not exhausted; neither is nothing.
  expect(poolState(codexPool(CODEX_NOW, NOW), NOW)).toEqual({ exhausted: false, backAtMs: null })
  expect(poolState(codexPool(null, NOW), NOW).exhausted).toBe(false)
  // Exhausted with no reset time known: exhausted, back at nobody knows.
  expect(poolState({ ...both, five: winOf('5h', 100, null), week: winOf('week', 10, null) }, NOW)).toEqual({ exhausted: true, backAtMs: null })
  // After the reset time passes and the limit reads lower, the pool is no longer exhausted.
  expect(poolState({ ...both, five: winOf('5h', 100, NOW - HOUR), week: winOf('week', 40, NOW + HOUR) }, NOW).exhausted).toBe(false)
})

test('"back Thu 9:00": the day and the local time of the reset', async () => {
  const t = new Date(2026, 9, 8, 9, 0, 0).getTime()
  expect(backText(t)).toBe('back Thu 9:00')
  expect(backText(new Date(2026, 9, 9, 14, 30, 0).getTime())).toBe('back Fri 14:30')
  expect(backText(null)).toBe('')
  expect(backText(Number.NaN)).toBe('')
})

// ---------------------------------------------------------------------------
// Credits

const FILE = '{"opencode":{"total":200,"left":197,"expires":"2026-10-28"},"cloud":{"expires":"2026-11-30"}}'

test('credits.json: total, left and expires for OpenCode; expires only for the cloud', async () => {
  const f = parseCreditsFile(FILE)
  expect(f?.opencode).toEqual({ total: 200, left: 197, expires: '2026-10-28' })
  expect(f?.cloud).toEqual({ total: null, left: null, expires: '2026-11-30' })
  expect(parseCreditsFile('')).toBe(null)
  expect(parseCreditsFile('[]')).toBe(null)
  expect(parseCreditsFile('{}')).toEqual({ opencode: null, cloud: null })
  expect(parseCreditsFile('{"opencode":{"total":"$200","left":"$62"}}')?.opencode).toMatchObject({ total: 200, left: 62 })
})

test('credits as spent vs left: "$62 spent . $138 left . expires Oct 28"', async () => {
  const v = creditView('opencode', 'OpenCode (Claude API)', { total: 200, left: 138, expires: '2026-10-28' }, NOW)
  expect(v.text).toBe('$62 spent \u00b7 $138 left \u00b7 expires Oct 28')
  expect(v).toMatchObject({ spent: 62, left: 138, total: 200, ratio: 0.31, exhausted: false, expired: false })
  // The starting file's values: $3 spent of $200.
  expect(creditView('opencode', 'x', { total: 200, left: 197, expires: '2026-10-28' }, NOW).text).toBe('$3 spent \u00b7 $197 left \u00b7 expires Oct 28')
  // A missing total shows only "left".
  const noTotal = creditView('opencode', 'x', { total: null, left: 197, expires: '2026-10-28' }, NOW)
  expect(noTotal.text).toBe('$197 left \u00b7 expires Oct 28')
  expect(noTotal.spent).toBe(null)
  expect(noTotal.ratio).toBe(null)
  // The cloud has only an expiry.
  expect(creditView('cloud', 'Claude cloud', { total: null, left: null, expires: '2026-11-30' }, NOW).text).toBe('expires Nov 30')
  // Cents are kept, whole dollars are not padded.
  expect(creditView('o', 'x', { total: 200, left: 137.5, expires: '' }, NOW).text).toBe('$62.50 spent \u00b7 $137.50 left')
  // No file entry: unreadable, said so.
  expect(creditView('o', 'x', null, NOW).text).toBe('not readable here')
  expect(creditViews(null, NOW).map(v => v.text)).toEqual(['not readable here', 'not readable here'])
  expect(creditViews(parseCreditsFile(FILE), NOW).map(v => v.name)).toEqual(['OpenCode (Claude API)', 'Claude cloud'])
})

test('credits: exhausted only at nothing left or past the expiry; low credits change nothing', async () => {
  const at = (left: number | null, expires: string) => creditView('o', 'x', { total: 200, left, expires }, NOW)
  expect(at(0, '2026-10-28').exhausted).toBe(true)
  expect(at(-3, '2026-10-28').exhausted).toBe(true)
  expect(at(2, '2026-10-28').exhausted).toBe(false)
  expect(at(10, '2026-10-28').exhausted).toBe(false)
  expect(at(197, '2026-10-01')).toMatchObject({ exhausted: true, expired: true })
  expect(at(197, '2026-10-28')).toMatchObject({ exhausted: false, expired: false })
  expect(at(null, '2026-11-30').exhausted).toBe(false)
  // The cloud: only the expiry decides.
  expect(creditView('cloud', 'c', { total: null, left: null, expires: '2026-10-01' }, NOW).exhausted).toBe(true)
  expect(creditView('cloud', 'c', { total: null, left: null, expires: '2026-11-30' }, NOW).exhausted).toBe(false)
  expect(monthDay('2026-10-28')).toBe('Oct 28')
  expect(monthDay('2026-01-05')).toBe('Jan 5')
  expect(monthDay('whenever')).toBe('whenever')
})
