// COCKPIT-43: the bar's credit row prints each service's name after its icon (Claude, Cloud, API, Codex), from the one list in services.ts.
import { test, expect } from './pure.ts'
import { SERVICES, serviceRows } from '../hooks/services.ts'
import type { ServicesIn } from '../hooks/services.ts'
import { codexPool, parseCreditsFile } from '../hooks/limits.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'
import { bandPx, creditLayout, creditsSvg } from '../hooks/look.ts'

const NOW = Date.parse('2026-10-09T15:00:00Z')
const CREDITS = parseCreditsFile('{"opencode":{"total":200,"left":105.08,"expires":"2026-11-01","source":"console 2026-10-09"}}')
const w = claudeWindows([{ kind: 'five_hour', percentUsed: 20, resetsAt: '2026-10-09T20:00:00Z' }, { kind: 'seven_day', percentUsed: 40, resetsAt: '2026-10-12T17:00:00Z' }], emptyCache, NOW)
const base: ServicesIn = { nowMs: NOW, claude: { five: w.five, week: w.week }, codex: codexPool(null, NOW, null), codexAtMs: null, credits: CREDITS, creditsAtMs: NOW, apiSpendSince: { usd: 5, atMs: NOW }, rows: [], outages: [], localUp: true }
const rows = serviceRows(base)
const texts = (svg: string): string[] => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1] ?? '')

test('the names come from the one service list', () => {
  expect(SERVICES.filter(s => s.id !== 'local').map(s => s.short)).toEqual(['Claude', 'Cloud', 'API', 'Codex'])
})

for (const cols of [80, 100, 140, 200]) {
  const W = bandPx(cols)
  test(`row 2 at ${cols} columns: four services, none dropped, Codex at the last column, no wrap`, () => {
    const lay = creditLayout(W, rows)
    expect(lay.places.map(p => p.seg.id)).toEqual(['claude', 'cloud', 'api', 'codex'])
    const last = lay.places[3]!
    expect(last.x + last.w).toBe(W - 8)
    for (let i = 1; i < 4; i++) expect(lay.places[i]!.x >= lay.places[i - 1]!.x + lay.places[i - 1]!.w).toBe(true)
    expect(lay.places[0]!.x).toBe(8)
    const svg = creditsSvg(W, rows)
    expect((svg.match(/data-svc=/g) ?? []).length).toBe(4)
    expect(svg.includes('<text') && !svg.includes('<tspan')).toBe(true)
    if (cols >= 140) {
      expect(lay.dropped).toBe(0)
      const t = texts(svg)
      for (const n of ['Claude', 'Cloud', 'API', 'Codex']) expect(t.includes(n)).toBe(true)
    }
  })
}

test('narrow: bars shrink first, then names drop from the right-most non-Codex, Codex last, never a service', () => {
  let prev = -1
  for (let W = 700; W >= 120; W -= 4) {
    const lay = creditLayout(W, rows)
    expect(lay.places.length).toBe(4)
    expect(lay.dropped >= prev).toBe(true) // monotone
    prev = lay.dropped
    if (lay.dropped > 0) expect(lay.level).toBe(3) // bars were already gone
    const names = lay.places.map(p => p.name !== '')
    // dropped names are a suffix of [claude, cloud, api] order from the right
    if (lay.dropped >= 1) expect(names[2]).toBe(false)
    if (lay.dropped >= 2) expect(names[1]).toBe(false)
    if (lay.dropped >= 3) expect(names[0]).toBe(false)
    if (lay.dropped <= 3) expect(names[3]).toBe(true)
  }
  expect(creditLayout(bandPx(80), rows).places.length).toBe(4)
})
