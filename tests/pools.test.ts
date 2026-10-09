import { expect, test } from './pure.ts'

import { groupSvg2 } from '../hooks/look.ts'
import { BUTTON_CUSHION, GROUP_GAP, METER_W, METER_W_NARROW, STRIP_ORDER, apiRow, claudeRow, cloudRow, codexRow, groupPx, localRow, meterShowsPct, stripOf, stripPx, systemRow } from '../hooks/pools.ts'
import type { PoolRow } from '../hooks/pools.ts'
import { claudePool, codexPool, winOf } from '../hooks/limits.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'
import { isWellFormed } from './helpers.ts'

const NOW = Date.parse('2026-10-08T22:00:00Z')
const H = 3_600_000
const D = 86_400_000
const iso = (ms: number): string => new Date(ms).toISOString()

// ---------------------------------------------------------------------------
// Claude: the figures come from $.session.usage() (rateLimits and context)

const reading = (kind: string, pct: number, ms: number) => ({ kind, percentUsed: pct, resetsAt: iso(ms) })
// The plan windows as the mod builds them: live readings (and a cache) through claudeWindows.
const wins = (five: number | null, week: number | null, fable: number | null = null, cache = emptyCache) =>
  claudeWindows([...(five === null ? [] : [reading('five_hour', five, NOW + 2 * H)]), ...(week === null ? [] : [reading('seven_day', week, NOW + 3 * D)]), ...(fable === null ? [] : [reading('seven_day_fable', fable, NOW + 3 * D)])], cache, NOW)
const plan = (five: number | null, week: number | null) => claudePool([...(five === null ? [] : [{ kind: 'five_hour', percentUsed: five, resetsAt: iso(NOW + 2 * H) }]), ...(week === null ? [] : [{ kind: 'seven_day', percentUsed: week, resetsAt: iso(NOW + 3 * D) }])])
const ctx = (p: number | null) => ({ percent: p, tokens: p === null ? null : p * 2000, window: p === null ? null : 200000 })

test('Claude (v8): plan usage only, as USED percent: 5h and wk with their reset; NO context meter; the card has the exact numbers, the context line and the account note', async () => {
  // Alex: "my remaining usage is 87% but you have ctx at 51%". Plan 5h 0% used, week 87% used; context 51% is another thing.
  const r = claudeRow({ ctx: ctx(51), windows: wins(0, 87), cost: null, nowMs: NOW })
  expect(r.isMuted).toBe(false)
  expect(r.meters.map(m => m.label)).toEqual(['5h', 'wk'])
  expect(r.meters.map(m => m.value)).toEqual(['0%', '87%'])
  expect(r.meters.some(m => /ctx|context/i.test(m.label))).toBe(false)
  expect(r.meters[0]?.sub).toMatch(/^\d\d:\d\d$/)
  // One colour rule: green under 60, amber 60 to 85, red over 85.
  expect(r.meters[0]?.hex).toBe('#3FB950')
  expect(r.meters[1]?.hex).toBe('#F85149')
  expect(r.card[0]).toBe('Claude Max')
  expect(r.card.some(l => l.startsWith('5h 0% used \u00b7 resets '))).toBe(true)
  expect(r.card.some(l => l.startsWith('week 87% used \u00b7 resets '))).toBe(true)
  // The context lives in the hover card only, named for what it is.
  expect(r.card).toContain("The Captain's context window: 51% \u00b7 102k of 200k tokens")
  expect(r.card[r.card.length - 1]).toBe('This account only: every Claude session shares this plan.')
  expect(r.card.join('\n')).not.toMatch(/NaN|undefined/)
  // The context alone makes no Claude line: with no plan figure the row is the muted one, never a ctx bar.
  const only = claudeRow({ ctx: ctx(55), windows: wins(null, null), cost: null, nowMs: NOW })
  expect(only.isMuted).toBe(true)
  expect(only.meters).toEqual([])
})

test('Claude, the Fable week: a third meter when known, from a live "fable" window or the saved value; absent when unknown', async () => {
  const live = claudeRow({ ctx: ctx(null), windows: wins(0, 87, 32), cost: null, nowMs: NOW })
  expect(live.meters.map(m => m.label + ' ' + m.value)).toEqual(['5h 0%', 'wk 87%', 'Fable 32%'])
  expect(live.card.some(l => l.startsWith('Fable week 32% used'))).toBe(true)
  const cached = { ...emptyCache, fable: { pct: 32, resetsAt: iso(NOW + 3 * D), at: NOW - 20 * 60_000, source: 'manual' as const } }
  const fromCache = claudeRow({ ctx: ctx(null), windows: wins(0, 87, null, cached), cost: null, nowMs: NOW })
  expect(fromCache.meters.map(m => m.label)).toEqual(['5h', 'wk', 'Fable'])
  expect(fromCache.meters[2]?.sub).toMatch(/^as of \d\d:\d\d$/)
  expect(claudeRow({ ctx: ctx(null), windows: wins(0, 87), cost: null, nowMs: NOW }).meters.length).toBe(2)
})

test('Claude, nothing live and nothing saved: ONE muted "plan usage not readable" line, unknown stays unknown', async () => {
  const r = claudeRow({ ctx: ctx(null), windows: wins(null, null), cost: null, nowMs: NOW })
  expect(r.isMuted).toBe(true)
  expect(r.meters).toEqual([])
  expect(r.text).toBe('plan usage not readable')
  expect(r.card[0]).toContain('plan usage unknown')
  expect(r.card[0]).toContain('/cockpit usage 5h=<pct> wk=<pct>')
})

test('Claude, one window only: the other is "n/a", never hidden', async () => {
  const five = claudeRow({ ctx: ctx(40), windows: wins(31, null), cost: null, nowMs: NOW })
  expect(five.meters.map(m => m.label + ' ' + m.value)).toEqual(['5h 31%', 'wk n/a'])
  expect(five.card).toContain('week unknown')
  const week = claudeRow({ ctx: ctx(null), windows: wins(null, 62), cost: null, nowMs: NOW })
  expect(week.meters.map(m => m.label + ' ' + m.value)).toEqual(['5h n/a', 'wk 62%'])
})

test('Claude, the last known value shows "as of HH:MM" while the live one is missing; a window that has reset since is unknown', async () => {
  const cached = { fiveHour: { pct: 12, resetsAt: iso(NOW + H), at: NOW - 30 * 60_000, source: 'live' as const }, week: { pct: 87, resetsAt: iso(NOW - H), at: NOW - 5 * H, source: 'live' as const }, fable: null }
  const r = claudeRow({ ctx: ctx(null), windows: wins(null, null, null, cached), cost: null, nowMs: NOW })
  // The 5h value is still true (its window has not reset): shown with when it was read.
  expect(r.meters[0]?.value).toBe('12%')
  expect(r.meters[0]?.sub).toMatch(/^as of \d\d:\d\d$/)
  expect(r.card.find(l => l.startsWith('5h 12% used'))).toMatch(/\(as of \d\d:\d\d\)$/)
  // The week's window reset an hour ago: its old 87% is not true any more, so it is unknown, not shown.
  expect(r.meters[1]?.value).toBe('n/a')
  expect(r.card).toContain('week unknown')
})

test('Claude, the dollar estimate on the card: per window, labelled an estimate, with unpriced tokens named; absent when not scanned', async () => {
  const cost = { five: { usd: 8.65, tokens: 7_227_000, unpricedTokens: 0 }, week: { usd: 41.2, tokens: 90_000_000, unpricedTokens: 12_000 } }
  const r = claudeRow({ ctx: ctx(10), windows: wins(31, 62), cost, nowMs: NOW })
  expect(r.card).toContain('\u2248 $8.65 at API rates in this 5h window (an estimate, 7227k tokens)')
  expect(r.card.find(l => l.includes('7d window'))).toContain('$41.20')
  expect(r.card.find(l => l.includes('7d window'))).toContain('12k tokens of unknown models not priced')
  expect(claudeRow({ ctx: ctx(10), windows: wins(31, 62), cost: null, nowMs: NOW }).card.some(l => l.includes('API rates'))).toBe(false)
})

// ---------------------------------------------------------------------------
// Codex

test('Codex: 5h and week from the session log; both unreadable is one muted line; out of credits dims it with when it is back', async () => {
  const r = codexRow({ id: 'codex', name: 'Codex', five: winOf('5h', 52, NOW + H), week: winOf('week', 80, NOW + D) }, NOW)
  expect(r.meters.map(m => m.label + ' ' + m.value)).toEqual(['5h 52%', 'wk 80%'])
  expect(r.dim).toBe(false)
  const out = codexRow({ id: 'codex', name: 'Codex', five: winOf('5h', 52, NOW + H), week: winOf('week', 100, NOW + D) }, NOW)
  expect(out.dim).toBe(true)
  expect(out.meters.every(m => m.dim)).toBe(true)
  expect(out.card.some(l => l.startsWith('out of credits, back '))).toBe(true)
  // 97% is not out.
  expect(codexRow({ id: 'codex', name: 'Codex', five: winOf('5h', 52, NOW + H), week: winOf('week', 97, NOW + D) }, NOW).dim).toBe(false)
  const none = codexRow(codexPool(null, NOW), NOW)
  expect(none.isMuted).toBe(true)
  expect(none.text).toBe('plan usage not readable')
})

// ---------------------------------------------------------------------------
// API (v9): MEASURED ONLY, this calendar month, against the monthly limit

test('API: "$3.41 this month . OpenCode", a small bar against the $200 limit, the card says "logged by OpenCode" and that other API use is not counted', async () => {
  const r = apiRow({ measured: { usd: 3.41, messages: 34 }, limit: 200 })
  expect(r.text).toBe('$3.41 this month \u00b7 OpenCode')
  expect(r.isMuted).toBe(false)
  expect(Math.abs((r.meters[0]?.ratio ?? 9) - 3.41 / 200) < 0.0001).toBe(true)
  expect(r.card[0]).toBe('API: $3.41 this month, logged by OpenCode')
  expect(r.card).toContain('measured')
  expect(r.card.some(l => /monthly limit \$200/.test(l) && /resets on the 1st/.test(l))).toBe(true)
  expect(r.card).toContain('Other API use is not counted: only what OpenCode logs.')
  // The old balance, expiry and manual figures are gone for good.
  const said = [r.text, ...r.card, ...r.meters.map(m => m.value)].join(' ')
  expect(said).not.toMatch(/\$197|Oct 28|expires|left|credits\.json|manual/)
})

test('API: the colour is the one green, amber, red rule against the limit: under 60% green, 60 to 85 amber, over 85 red', async () => {
  const hex = (usd: number): string | undefined => apiRow({ measured: { usd, messages: 1 }, limit: 200 }).meters[0]?.hex
  expect(hex(0)).toBe('#3FB950')
  expect(hex(119)).toBe('#3FB950')
  expect(hex(120)).toBe('#F0A500')
  expect(hex(170)).toBe('#F0A500')
  expect(hex(171)).toBe('#F85149')
  // Over the limit the bar is full and red (never wider than the track).
  const over = apiRow({ measured: { usd: 260, messages: 1 }, limit: 200 })
  expect(over.meters[0]?.ratio).toBe(1)
  expect(over.meters[0]?.hex).toBe('#F85149')
  expect(over.text).toBe('$260 this month \u00b7 OpenCode')
  // The limit is the config's: a $50 limit turns $30 amber.
  expect(apiRow({ measured: { usd: 30, messages: 1 }, limit: 50 }).meters[0]?.hex).toBe('#F0A500')
})

test('API: an empty month is "$0 this month", a green empty bar, never "not readable"', async () => {
  const r = apiRow({ measured: { usd: 0, messages: 0 }, limit: 200 })
  expect(r.text).toBe('$0 this month \u00b7 OpenCode')
  expect(r.meters[0]?.ratio).toBe(0)
  expect(r.meters[0]?.hex).toBe('#3FB950')
  expect(r.isMuted).toBe(false)
})

test('API: when sqlite3 or the database cannot be read the line says "not readable" and the card says the fix; nothing is invented', async () => {
  const r = apiRow({ measured: null, limit: 200 })
  expect(r.isMuted).toBe(true)
  expect(r.text).toBe('not readable')
  expect(r.meters).toEqual([])
  expect(r.card.some(l => /^To fix: .*sqlite3/.test(l))).toBe(true)
  expect(r.card.join(' ')).not.toMatch(/\$\d/)
})

test('API: a limit that is zero or negative falls back to $200 instead of dividing by it', async () => {
  const r = apiRow({ measured: { usd: 100, messages: 1 }, limit: 0 })
  expect(Math.abs((r.meters[0]?.ratio ?? 9) - 0.5) < 0.0001).toBe(true)
  expect(r.card.some(l => l.includes('$200'))).toBe(true)
})

// ---------------------------------------------------------------------------
// Cloud: expiry and what runs; nothing invented

// Calendar days from today's local date, so the numbers below hold in any time zone for NOW (Oct 8 UTC evening).
const todayLocal = (): Date => new Date(NOW)
const daysTo = (iso: string): number => {
  const t = todayLocal()
  return Math.round((Date.parse(iso + 'T00:00:00') - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / D)
}

test('Cloud: "Nov 30, N days" with the running count, a thin time-left bar on a 30-day scale, amber under 14 days and red under 7', async () => {
  const r = cloudRow('2026-11-30', 2, NOW)
  const n = daysTo('2026-11-30')
  expect(n).toBeGreaterThanOrEqual(52)
  expect(r.text).toBe('Nov 30, ' + n + ' days \u00b7 2 running')
  expect(r.meters[0]?.ratio).toBe(1)
  expect(r.meters[0]?.hex).toBe('#3FB950')
  expect(cloudRow('2026-11-30', 0, NOW).text).toBe('Nov 30, ' + n + ' days')
  expect(cloudRow('2026-10-20', 0, NOW).meters[0]?.hex).toBe('#F0A500')
  expect(cloudRow('2026-10-12', 0, NOW).meters[0]?.hex).toBe('#F85149')
  expect(cloudRow('2026-10-09', 0, NOW).text).toBe('Oct 9, ' + daysTo('2026-10-09') + ' day')
  expect(cloudRow('2026-10-08', 0, NOW).text).toMatch(/^Oct 8, today$|^expired Oct 8$/)
  expect(r.card.join('\n')).toContain('not readable here; nothing is invented')
  expect(r.card).toContain('2 cloud sessions running now')
})

test('Cloud: expired is dim and red; no expiry set is a muted line; the balance and share are never shown', async () => {
  const gone = cloudRow('2026-10-01', 0, NOW)
  expect(gone.dim).toBe(true)
  expect(gone.text).toBe('expired Oct 1')
  expect(gone.meters[0]?.ratio).toBe(0)
  const none = cloudRow('', 1, NOW)
  expect(none.isMuted).toBe(true)
  expect(none.text).toBe('expiry not set \u00b7 1 running')
  for (const r of [cloudRow('2026-11-30', 1, NOW), gone, none]) expect(r.text).not.toMatch(/\$|balance \d/)
})

// ---------------------------------------------------------------------------
// Local: free, so load instead of a limit

test('Local: server up with GPU memory is a green dot and a GPU meter, "free"; down dims it and is red; nothing known is a grey dot and just "free"', async () => {
  const up = localRow({ up: true, gpuPct: 21, running: 1 })
  expect(up.dot).toBe('#3FB950')
  expect(up.text).toBe('server up \u00b7 GPU 21% \u00b7 1 running \u00b7 free')
  expect(up.meters.map(m => m.label + ' ' + m.value)).toEqual(['GPU 21%'])
  const down = localRow({ up: false, gpuPct: null, running: 0 })
  expect(down.dot).toBe('#F85149')
  expect(down.dim).toBe(true)
  expect(down.meters).toEqual([])
  expect(down.text).toBe('server down \u00b7 free')
  const none = localRow({ up: null, gpuPct: null, running: 0 })
  expect(none.dot).toBe('#8B949E')
  expect(none.text).toBe('free')
  expect(none.meters).toEqual([])
  expect(none.dim).toBe(false)
  // No limit, so no usage bar even when the GPU is busy beyond 85%: the meter is load, coloured by load.
  expect(localRow({ up: true, gpuPct: 90, running: 0 }).meters[0]?.hex).toBe('#F85149')
})

// ---------------------------------------------------------------------------
// System

test('System: the dot is the worst of memory, CPU and disk; its card has the numbers; nothing read yet is grey', async () => {
  const r = systemRow({ dots: [{ name: 'memory', level: 'red', color: '#F85149' }, { name: 'cpu', level: 'green', color: '#3FB950' }], summary: 'problem (memory 6% free)', card: ['Memory 94% used'] })
  expect(r.dot).toBe('#F85149')
  expect(r.card).toEqual(['Memory 94% used'])
  const none = systemRow({ dots: [], summary: '', card: [] })
  expect(none.dot).toBe('#8B949E')
  expect(none.isMuted).toBe(true)
})

// ---------------------------------------------------------------------------
// The strip: order, fitting, never a third line

const ROWS: PoolRow[] = [
  systemRow({ dots: [{ name: 'memory', level: 'green', color: '#3FB950' }], summary: 'healthy', card: ['Memory 59% used'] }),
  claudeRow({ ctx: ctx(51), windows: wins(0, 87, 32), cost: null, nowMs: NOW }),
  codexRow({ id: 'codex', name: 'Codex', five: winOf('5h', 52, NOW + H), week: winOf('week', 80, NOW + D) }, NOW),
  apiRow({ measured: { usd: 3.41, messages: 34 }, limit: 200 }),
  cloudRow('2026-11-30', 1, NOW),
  localRow({ up: true, gpuPct: 21, running: 0 }),
]

test('strip order: Claude, Codex, API, Cloud, Local (System lives on the bottom row); no "other" group exists', async () => {
  expect(STRIP_ORDER).toEqual(['claude', 'codex', 'api', 'cloud', 'local'])
  expect(stripOf(ROWS, 2000).groups.map(g => g.id)).toEqual(['claude', 'codex', 'api', 'cloud', 'local'])
  expect(stripOf(ROWS, 2000).tier).toBe(0)
  for (let w = 2000; w >= 100; w -= 10) for (const g of stripOf(ROWS, w).groups) expect(g.id).not.toBe('other')
})

test('strip fitting (v8): real labels always, 12 px gaps, Local then Cloud then API are dropped first, then narrower meters, then Codex; never overlaps', async () => {
  let last = 0
  const seen = new Set<number>()
  for (let w = 2000; w >= 100; w -= 5) {
    const s = stripOf(ROWS, w)
    seen.add(s.tier)
    // A narrower strip never uses a smaller tier.
    expect(s.tier).toBeGreaterThanOrEqual(last)
    last = s.tier
    // It fits (so nothing overlaps), or is down to the last group, which is always Claude.
    expect(stripPx(s.groups) <= w || s.groups.length === 1).toBe(true)
    // Real labels, never a one-letter abbreviation.
    for (const g of s.groups) expect(g.button.length).toBeGreaterThan(2)
  }
  expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7].slice(0, seen.size))
  const at = (tier: number) => {
    for (let w = 2000; w >= 100; w -= 5) if (stripOf(ROWS, w).tier === tier) return stripOf(ROWS, w)
    throw new Error('no width for tier ' + tier)
  }
  expect(at(1).groups.map(g => g.id)).toEqual(['claude', 'codex', 'api', 'cloud'])
  expect(at(2).groups.map(g => g.id)).toEqual(['claude', 'codex', 'api'])
  expect(at(3).groups.map(g => g.id)).toEqual(['claude', 'codex'])
  expect(at(3).groups.every(g => g.meterW === METER_W)).toBe(true)
  expect(at(4).groups.every(g => g.meterW === METER_W_NARROW)).toBe(true)
  expect(at(5).groups.map(g => g.id)).toEqual(['claude'])
  // The gap between groups is 12 px and each label button has its cushion.
  expect(GROUP_GAP).toBe(12)
  const two = stripOf(ROWS, 2000).groups.slice(0, 2)
  expect(stripPx(two)).toBe(groupPx(two[0]!) + groupPx(two[1]!) + 12)
})

test('strip meters: a thin bar with its real label, the percent from 60%, an exhausted pool dim; 22 px high, well formed, no context meter', async () => {
  const claude = stripOf(ROWS, 2000).groups[0]!
  const art = groupSvg2(claude)
  expect(isWellFormed(art.svg)).toBe(true)
  expect(art.svg).toContain('height="22"')
  expect(art.svg).toContain(`width="${METER_W}"`)
  // 5h is 0%: no number; wk is 87%: the number shows, red; Fable 32%: no number.
  expect(art.svg).toContain('>87%<')
  expect(art.svg).not.toContain('>0%<')
  expect(art.svg).not.toContain('>32%<')
  expect(meterShowsPct(claude.meters[1]!)).toBe(true)
  expect(meterShowsPct(claude.meters[0]!)).toBe(false)
  for (const label of ['>5h<', '>wk<', '>Fable<']) expect(art.svg).toContain(label)
  // This session's context (51%) is nowhere in the strip.
  expect(art.svg).not.toMatch(/ctx|context|51%/)
  // The drawing is exactly the width groupPx counted after its label button (so nothing overlaps).
  expect(art.w).toBe(groupPx(claude) - (claude.button.length + BUTTON_CUSHION) * 8)
  // A narrower meter makes a narrower drawing.
  expect(groupSvg2({ ...claude, meterW: METER_W_NARROW }).w).toBeLessThan(art.w)
  // Dim for an exhausted pool.
  const out = stripOf([codexRow({ id: 'codex', name: 'Codex', five: winOf('5h', 52, NOW + H), week: winOf('week', 100, NOW + D) }, NOW)], 2000).groups[0]!
  expect(groupSvg2(out).svg).toContain('opacity="0.45"')
  expect(groupSvg2(claude).svg).not.toContain('opacity="0.45"')

})
