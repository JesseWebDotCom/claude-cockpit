// COCKPIT-41: one icon per service shared by the bar and the Main status card (the bar's own layout moved on in COCKPIT-42: see cockpit42.test.ts).
import { test, expect } from './pure.ts'
import { serviceRows } from '../hooks/services.ts'
import type { ServicesIn } from '../hooks/services.ts'
import { codexPool, parseCreditsFile } from '../hooks/limits.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'
import { SERVICE_GLYPH, GLYPH_PATHS } from '../hooks/glyphs.ts'
import { statusSvg } from '../hooks/look.ts'
import type { LookStatus } from '../hooks/look.ts'

const NOW = Date.parse('2026-10-09T15:00:00Z')
const CREDITS = parseCreditsFile('{"opencode":{"total":200,"left":105.08,"expires":"2026-11-01","source":"console 2026-10-09"},"cloud":{"expires":"2026-11-30"}}')
const w = claudeWindows([{ kind: 'five_hour', percentUsed: 20, resetsAt: '2026-10-09T20:00:00Z' }, { kind: 'seven_day', percentUsed: 40, resetsAt: '2026-10-12T17:00:00Z' }], emptyCache, NOW)
const base: ServicesIn = { nowMs: NOW, claude: { five: w.five, week: w.week }, codex: codexPool(null, NOW, null), codexAtMs: null, credits: CREDITS, creditsAtMs: NOW, apiSpendSince: { usd: 5, atMs: NOW }, rows: [], outages: [], localUp: true }

test('one icon per service: distinct glyph paths, shared by the bar and the Main status card', () => {
  const ids = ['claude', 'cloud', 'api', 'codex', 'local'] as const
  expect(new Set(ids.map(i => GLYPH_PATHS[SERVICE_GLYPH[i]])).size).toBe(5)
  const card: LookStatus = { title: 'Main status', ratio: 0.5, count: '1/2', note: '', now: '', next: '', you: '', youHex: '#F0A500', isAway: false, presenceText: 'Active', stale: '', phase: 0, main: { running: '', landed: '', report: '', notes: '' }, services: serviceRows(base) }
  const svg = statusSvg(420, card)
  for (const i of ids) expect(svg.includes('<path d="' + GLYPH_PATHS[SERVICE_GLYPH[i]] + '"/>')).toBe(true)
})
