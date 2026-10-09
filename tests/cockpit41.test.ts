// COCKPIT-41: the bar's credit line is flush left with icon + bar + figure per service, no local model; the Main status card uses the same icons.
import { test, expect } from './pure.ts'
import { BAR_SERVICES, creditLine, serviceRows } from '../hooks/services.ts'
import type { ServicesIn } from '../hooks/services.ts'
import { codexPool, parseCreditsFile } from '../hooks/limits.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'
import { SERVICE_GLYPH, SERVICE_MARK, GLYPH_PATHS, blockBar } from '../hooks/glyphs.ts'
import { statusSvg } from '../hooks/look.ts'
import type { LookStatus } from '../hooks/look.ts'

const NOW = Date.parse('2026-10-09T15:00:00Z')
const CREDITS = parseCreditsFile('{"opencode":{"total":200,"left":105.08,"expires":"2026-11-01","source":"console 2026-10-09"},"cloud":{"expires":"2026-11-30"}}')
const w = claudeWindows([{ kind: 'five_hour', percentUsed: 20, resetsAt: '2026-10-09T20:00:00Z' }, { kind: 'seven_day', percentUsed: 40, resetsAt: '2026-10-12T17:00:00Z' }], emptyCache, NOW)
const base: ServicesIn = { nowMs: NOW, claude: { five: w.five, week: w.week }, codex: codexPool(null, NOW, null), codexAtMs: null, credits: CREDITS, creditsAtMs: NOW, apiSpendSince: { usd: 5, atMs: NOW }, rows: [], outages: [], localUp: true }
const NONE: ServicesIn = { ...base, claude: null, credits: null, creditsAtMs: null, apiSpendSince: null, localUp: null }
const ORDER = ['claude', 'cloud', 'api', 'codex']

for (const cols of [80, 100, 140, 200]) {
  for (const [label, input] of [['with data', base], ['no data', NONE]] as const) {
    test(`credit line at ${cols} columns (${label}): fixed order, no local model, flush left, fits`, () => {
      const l = creditLine(serviceRows(input), cols - 2)
      expect(l.segs.map(s => s.id)).toEqual(ORDER)
      expect(BAR_SERVICES.length).toBe(4)
      expect(l.segs.some(s => (s.id as string) === 'local')).toBe(false)
      const line = l.segs.map(s => s.text).join(l.sep)
      expect(line.startsWith(SERVICE_MARK.claude)).toBe(true)
      expect(line.length <= cols - 2).toBe(true)
      l.segs.forEach((s, i) => expect(s.text.startsWith(SERVICE_MARK[ORDER[i] as 'claude'])).toBe(true))
      expect(/local/i.test(line)).toBe(false)
    })
  }
}

test('with data every service has a bar and a figure; with none each is a dim icon, empty track and ?', () => {
  const d = creditLine(serviceRows(base), 200)
  expect(d.level).toBe(0)
  for (const s of d.segs) expect(s.bar.length).toBe(8)
  const n = creditLine(serviceRows(NONE), 200)
  for (const s of n.segs) {
    if (s.id === 'api') continue
    expect(s.fig).toBe('?')
    expect(s.dim).toBe(true)
    expect(s.bar).toBe('░'.repeat(8))
  }
})

test('a narrow bar narrows the bar and then the figure, it never drops a service', () => {
  expect(creditLine(serviceRows(base), 200).level).toBe(0)
  expect(creditLine(serviceRows(base), 55).level).toBe(1)
  expect(creditLine(serviceRows(base), 5).segs.length).toBe(4)
  expect(creditLine(serviceRows(base), 5).segs.every(s => s.bar === '')).toBe(true)
})

test('block bar: eight steps per cell', () => {
  expect(blockBar(1, 4)).toBe('████')
  expect(blockBar(0, 4)).toBe('░░░░')
  expect(blockBar(0.5, 4)).toBe('██░░')
  expect(blockBar(0.4375, 4)).toBe('\u2588\u258a\u2591\u2591')
  expect(blockBar(null, 3)).toBe('░░░')
  expect(blockBar(0.5, 0)).toBe('')
})

test('one icon per service: distinct marks and distinct glyph paths, shared by the bar and the Main status card', () => {
  const ids = ['claude', 'cloud', 'api', 'codex', 'local'] as const
  expect(new Set(ids.map(i => SERVICE_MARK[i])).size).toBe(5)
  expect(new Set(ids.map(i => GLYPH_PATHS[SERVICE_GLYPH[i]])).size).toBe(5)
  const card: LookStatus = { title: 'Main status', ratio: 0.5, count: '1/2', note: '', now: '', next: '', you: '', youHex: '#F0A500', isAway: false, presenceText: 'Active', stale: '', phase: 0, main: { running: '', landed: '', report: '', notes: '' }, services: serviceRows(base) }
  const svg = statusSvg(420, card)
  for (const i of ids) expect(svg.includes('<path d="' + GLYPH_PATHS[SERVICE_GLYPH[i]] + '"/>')).toBe(true)
})
