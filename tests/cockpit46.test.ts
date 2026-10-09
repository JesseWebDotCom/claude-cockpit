// COCKPIT-46: all subscriptions and credits on ONE row. Claude, Cloud, API and Codex packed left to right in the declared order, one even gap, nothing
// right-aligned; the row narrows by dropping names, then shortening figures, then the bars; the Main status card repeats them only as compact one-line rows.
import { test, expect } from './pure.ts'
import { SERVICES, CREDIT_STEPS, serviceRows } from '../hooks/services.ts'
import type { ServicesIn } from '../hooks/services.ts'
import { codexPool, parseCreditsFile } from '../hooks/limits.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'
import { bandPx, creditLayout, creditsSvg, servicesHeight, servicesSvg, CREDIT_H, CREDIT_SEP } from '../hooks/look.ts'

const NOW = Date.parse('2026-10-09T15:00:00Z')
const CREDITS = parseCreditsFile('{"opencode":{"total":200,"left":105.08,"expires":"2026-11-01","source":"console 2026-10-09"}}')
const w = claudeWindows([{ kind: 'five_hour', percentUsed: 5, resetsAt: '2026-10-09T20:00:00Z' }, { kind: 'seven_day', percentUsed: 11, resetsAt: '2026-10-12T17:00:00Z' }], emptyCache, NOW)
const base: ServicesIn = { nowMs: NOW, claude: { five: w.five, week: w.week }, codex: codexPool(null, NOW, null), codexAtMs: null, credits: CREDITS, creditsAtMs: NOW, apiSpendSince: { usd: 5, atMs: NOW }, rows: [], outages: [], localUp: true }
const rows = serviceRows(base)
const texts = (svg: string): string[] => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1] ?? '')
const ORDER = SERVICES.filter(s => s.id !== 'local').map(s => s.id)

for (const cols of [140, 100, 70, 50]) {
  const W = bandPx(cols)
  test(`row 2 at ${cols} columns: all four on one row, declared order, one even gap, nothing right-aligned, fits`, () => {
    const lay = creditLayout(W, rows)
    expect(lay.places.map(p => p.seg.id)).toEqual(ORDER)
    expect(lay.places[0]!.x).toBe(8)
    for (let i = 1; i < 4; i++) expect(lay.places[i]!.x - (lay.places[i - 1]!.x + lay.places[i - 1]!.w)).toBe(CREDIT_SEP)
    expect(lay.edge).toBeLessThanOrEqual(W - 8)
    const svg = creditsSvg(W, rows)
    expect((svg.match(/data-svc=/g) ?? []).length).toBe(4)
    expect(svg.includes('height="' + CREDIT_H + '"')).toBe(true)
    expect(svg.includes('<tspan')).toBe(false)
    // every x in the drawing is inside the row
    for (const m of svg.matchAll(/ x="([\d.]+)"/g)) expect(Number(m[1])).toBeLessThanOrEqual(W)
  })
}

test('wide: names, bars and the long figures all show', () => {
  const t = texts(creditsSvg(bandPx(140), rows))
  for (const n of ['Claude', 'Cloud', 'API', 'Codex']) expect(t.includes(n)).toBe(true)
  expect(t.some(x => /^5h \d+% wk \d+%$/.test(x))).toBe(true)
})

test('narrowing order: names go first, then the figures shorten, then the bars; monotone; four services always', () => {
  expect(CREDIT_STEPS[0]!.named).toBe(true)
  expect(CREDIT_STEPS[1]!.named).toBe(false)
  expect(CREDIT_STEPS[1]!.bar).toBe(CREDIT_STEPS[0]!.bar)
  expect(CREDIT_STEPS[1]!.fig).toBe('long')
  let prev = 0
  for (let W = 900; W >= 240; W -= 4) {
    const lay = creditLayout(W, rows)
    expect(lay.places.length).toBe(4)
    expect(lay.step >= prev).toBe(true)
    prev = lay.step
    const spec = CREDIT_STEPS[lay.step]!
    // names are dropped before any figure shortens or any bar shrinks
    if (lay.step >= 2) expect(spec.named).toBe(false)
    if (spec.fig !== 'long') expect(spec.named).toBe(false)
    if (spec.bar < 56) expect(spec.fig).toBe('one')
    expect(lay.places.every(p => (p.name !== '') === spec.named)).toBe(true)
  }
})

test('the Main status card keeps each service to one compact line at 420 and 520 px (no tall two-line rows, no bars repeated)', () => {
  for (const W of [420, 520]) {
    const h = servicesHeight(W, rows)
    expect(h).toBeLessThanOrEqual(5 * 22)
    const svg = servicesSvg(W, rows)
    expect(svg.includes('class="k"')).toBe(false) // no bar tracks: the bar's row has them
    const t = texts(svg)
    for (const s of SERVICES) expect(t).toContain(s.name)
    expect(t.join('|')).toContain('expires Nov 1')
    expect(t.join('|')).not.toContain('auto')
  }
})

// One provider name: "Claude". No plan-tier name appears in the source, tests or docs.
test('no source, test or doc carries a plan-tier name', async () => {
  const { readdirSync, readFileSync } = await import('node:fs')
  const root = new URL('..', import.meta.url).pathname
  const bad: string[] = []
  for (const dir of ['hooks', 'tests', 'tools']) {
    for (const f of readdirSync(root + dir)) {
      if (!/\.(ts|tsx)$/.test(f) || f === 'cockpit46.test.ts') continue
      if (/\bMAX\b|\bMax\b/.test(readFileSync(root + dir + '/' + f, 'utf8'))) bad.push(dir + '/' + f)
    }
  }
  expect(bad).toEqual([])
})
