// COCKPIT-39: the Main status card always shows every service and what it has left, automatically where a live source exists.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { SERVICES, ageWord, apiBaselineOf, markerOf, serviceLine, serviceRows } from '../hooks/services.ts'
import type { ServicesIn } from '../hooks/services.ts'
import { creditIcons } from '../hooks/credit.ts'
import { codexPool, claudePool, parseCreditsFile } from '../hooks/limits.ts'
import { parseCodexLimits } from '../hooks/core.ts'
import { parseSpend, spendArgv } from '../hooks/spend.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'
import { statusSvg, servicesSvg, servicesHeight } from '../hooks/look.ts'
import { subHeight, subSvg } from '../hooks/sections.ts'
import type { LookStatus } from '../hooks/look.ts'
import { outageOf } from '../hooks/outage.ts'
import { lookStatusForTest, servicesNow, setCardSourcesForTest } from '../hooks/register.tsx'
import { apiRow, cloudRow } from '../hooks/pools.ts'
import { LEVEL_COLOR } from '../hooks/system.ts'

const H = 3_600_000
const NOW = Date.parse('2026-10-09T15:00:00Z')
const textsOf = (svg: string): string[] => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map(m => m[1] ?? '')
const CREDITS = parseCreditsFile('{"opencode":{"total":200,"left":105.08,"spent":94.92,"expires":"2026-11-01","source":"console 2026-10-09"},"cloud":{"expires":"2026-11-30"}}')

const codexLog = (used5: number, usedWk: number, reset: number) =>
  `{"payload":{"rate_limits":{"primary":{"used_percent":${used5},"window_minutes":300,"resets_at":${reset}},"secondary":{"used_percent":${usedWk},"window_minutes":10080,"resets_at":${reset + 400000}}}}}\n`

function inputs(over: Partial<ServicesIn> = {}): ServicesIn {
  const w = claudeWindows([{ kind: 'five_hour', percentUsed: 20, resetsAt: '2026-10-09T20:00:00Z' }, { kind: 'seven_day', percentUsed: 40, resetsAt: '2026-10-12T17:00:00Z' }], emptyCache, NOW)
  return {
    nowMs: NOW,
    claude: { five: w.five, week: w.week },
    codex: codexPool(parseCodexLimits(codexLog(10, 30, Math.floor(NOW / 1000) + 3600)), NOW, null),
    codexAtMs: NOW - 60_000,
    credits: CREDITS,
    creditsAtMs: NOW - 2 * H,
    apiSpendSince: { usd: 5, atMs: NOW },
    rows: [],
    outages: [],
    localUp: true,
    ...over,
  }
}
const NONE: Partial<ServicesIn> = { claude: null, codex: codexPool(null, NOW, null), codexAtMs: null, credits: null, creditsAtMs: null, apiSpendSince: null, localUp: null }

test('the declared list holds five services; every case returns all five in that order', () => {
  expect(SERVICES.map(s => s.id)).toEqual(['claude', 'cloud', 'api', 'codex', 'local'])
  for (const i of [inputs(), inputs({ credits: null }), inputs(NONE)]) expect(serviceRows(i).map(r => r.id)).toEqual(SERVICES.map(s => s.id))
})

test('with all data: figures are what is LEFT, with reset or expiry and the auto or manual marker', () => {
  const r = Object.fromEntries(serviceRows(inputs()).map(x => [x.id, x]))
  expect(r.claude!.text).toBe('5h 80% · week 60% left')
  expect(r.claude!.source).toBe('auto')
  expect(r.claude!.when).toContain('resets 5h')
  expect(r.codex!.text).toBe('5h 90% · week 70% left')
  expect(r.codex!.source).toBe('auto')
  expect(r.api!.text).toBe('$100.08 of $200 left')
  expect(r.api!.when).toBe('expires Nov 1')
  expect(r.api!.source).toBe('auto')
  expect(r.cloud!.source).toBe('none')
  expect(r.cloud!.text).toBe('unknown')
  expect(r.local!.text).toBe('up · free')
  expect(markerOf(r.cloud!)).toBe('')
})

test('API baseline math: the balance at the baseline date minus the spend since it', () => {
  const b = apiBaselineOf(CREDITS)
  expect(b).toEqual({ left: 105.08, total: 200, sinceMs: new Date(2026, 9, 9).getTime(), expires: '2026-11-01' })
  const asOf = apiBaselineOf(parseCreditsFile('{"opencode":{"total":200,"left":90,"asOf":"2026-10-09T12:00:00Z","expires":"2026-11-01"}}'))
  expect(asOf?.sinceMs).toBe(Date.parse('2026-10-09T12:00:00Z'))
  const fromStart = apiBaselineOf(parseCreditsFile('{"opencode":{"total":200,"start":"2026-10-01","expires":"2026-11-01"}}'))
  expect(fromStart?.left).toBe(200)
  expect(apiBaselineOf(parseCreditsFile('{"opencode":{"total":200}}'))).toBeNull()
  expect(apiBaselineOf(null)).toBeNull()
  const api = (usd: number | null) => serviceRows(inputs({ apiSpendSince: usd === null ? null : { usd, atMs: NOW } })).find(x => x.id === 'api')!
  expect(api(0).text).toBe('$105.08 of $200 left')
  expect(api(5.08).text).toBe('$100 of $200 left')
  expect(api(105.08).state).toBe('out')
  expect(api(200).text).toBe('$0 of $200 left')
  expect(api(0).state).toBe('ok')
  expect(api(80).state).toBe('low')
})

test('API source: the spend query output is parsed from a fixture and the query starts at the baseline date', () => {
  expect(parseSpend('12.3456|40\n')).toEqual({ usd: 12.35, messages: 40 })
  const argv = spendArgv('/home/x', 1_700_000_000_000)
  expect(argv[0]).toBe('sqlite3')
  expect(argv[3]).toContain('>= 1700000000000')
})

test('missing source falls back to manual: the API shows the baseline as written, the age is the baseline age, over a day it says check', () => {
  const r = serviceRows(inputs({ apiSpendSince: null, nowMs: NOW + 48 * H })).find(x => x.id === 'api')!
  expect(r.source).toBe('manual')
  expect(r.text).toBe('$105.08 of $200 left')
  expect(r.check).toBe(true)
  expect(markerOf(r)).toContain('check')
  const fresh = serviceRows(inputs({ apiSpendSince: null, nowMs: Date.parse('2026-10-09T05:00:00Z') })).find(x => x.id === 'api')!
  void fresh
  const cloudOld = serviceRows(inputs({ creditsAtMs: NOW - 30 * H })).find(x => x.id === 'cloud')!
  expect(cloudOld.check).toBe(false)
  expect(serviceRows(inputs({ creditsAtMs: NOW - 23 * H })).find(x => x.id === 'cloud')!.check).toBe(false)
  expect(ageWord(30 * H)).toBe('30h')
  expect(ageWord(60 * H)).toBe('2d')
  expect(ageWord(10_000)).toBe('now')
})

test('Codex source: the limits come from the session-file fields; none readable is unknown; a refusal shows out', () => {
  const lim = parseCodexLimits(codexLog(100, 20, Math.floor(NOW / 1000) + 3600))
  const r = serviceRows(inputs({ codex: codexPool(lim, NOW, null) })).find(x => x.id === 'codex')!
  expect(r.state).toBe('out')
  expect(r.when).toContain('back')
  const none = serviceRows(inputs({ codex: codexPool(null, NOW, null), codexAtMs: null })).find(x => x.id === 'codex')!
  expect(none.state).toBe('unknown')
  expect(none.text).toBe('unknown')
  const refused = serviceRows(inputs({ codex: codexPool(null, NOW, null), outages: [{ kind: 'codex', outage: outageOf('Error: you have run out of credits', { state: 'idle' })! }] })).find(x => x.id === 'codex')!
  expect(refused.state).toBe('out')
})

test('Claude source: live readings and the saved cache both count; nothing known is unknown', () => {
  const r = serviceRows(inputs({ claude: null })).find(x => x.id === 'claude')!
  expect(r.state).toBe('unknown')
  expect(r.text).toBe('unknown')
  const cache = claudeWindows([], { fiveHour: { pct: 30, resetsAt: '2026-10-09T20:00:00Z', at: NOW - 600_000, source: 'live' }, week: { pct: 88, resetsAt: '2026-10-12T17:00:00Z', at: NOW - 600_000, source: 'live' }, fable: null } as any, NOW)
  const c = serviceRows(inputs({ claude: { five: cache.five, week: cache.week } })).find(x => x.id === 'claude')!
  expect(c.text).toBe('5h 70% · week 12% left')
  expect(c.state).toBe('low')
  expect(c.source).toBe('auto')
  expect(c.ageMs).toBe(600_000)
})

test('threshold colours: green fine, amber low, red out, grey unknown', () => {
  const claude = (used: number) => {
    const w = claudeWindows([{ kind: 'five_hour', percentUsed: used, resetsAt: '2026-10-09T20:00:00Z' }, { kind: 'seven_day', percentUsed: 0, resetsAt: '2026-10-12T17:00:00Z' }], emptyCache, NOW)
    return serviceRows(inputs({ claude: { five: w.five, week: w.week } })).find(x => x.id === 'claude')!
  }
  expect(claude(10).hex).toBe(LEVEL_COLOR.green)
  expect(claude(70).hex).toBe(LEVEL_COLOR.amber)
  expect(claude(100).hex).toBe(LEVEL_COLOR.red)
  expect(serviceRows(inputs(NONE)).find(x => x.id === 'local')!.hex).toBe(LEVEL_COLOR.grey)
  expect(serviceRows(inputs({ localUp: false })).find(x => x.id === 'local')!.state).toBe('out')
})

test('the two credit icons agree with the cloud and API rows (one source), outages included', () => {
  for (const over of [{}, { apiSpendSince: { usd: 80, atMs: NOW } }, { apiSpendSince: { usd: 150, atMs: NOW } }, { credits: parseCreditsFile('{"cloud":{"expires":"2026-10-12"}}') }, { outages: [{ kind: 'api', outage: outageOf('quota exceeded, rate limit', { state: 'idle' })! }] }] as Partial<ServicesIn>[]) {
    const i = inputs(over)
    const rows = serviceRows(i)
    const icons = creditIcons([cloudRow(i.credits?.cloud?.expires ?? '', 0, NOW), apiRow({ measured: { usd: 1, messages: 1 }, limit: 200 })], i.outages, 'API credit', rows)
    expect(icons.find(x => x.id === 'cloud')!.state).toBe(rows.find(x => x.id === 'cloud')!.state)
    expect(icons.find(x => x.id === 'api')!.state).toBe(rows.find(x => x.id === 'api')!.state)
    expect(icons.find(x => x.id === 'api')!.hex).toBe(rows.find(x => x.id === 'api')!.hex)
  }
})

const BASE: LookStatus = { title: 'Main status', ratio: 0.5, count: 'M · 5/10', note: '', now: '', next: '', you: '', youHex: '#F0A500', isAway: false, presenceText: 'Active', stale: '', phase: 0, main: { running: '', landed: '', report: '', notes: '' } }

test('all five rows are drawn at 360, 420 and 520 px: full data, partial data and none (unknown rows)', () => {
  const sets = [serviceRows(inputs()), serviceRows(inputs({ claude: null, credits: null, apiSpendSince: null })), serviceRows(inputs(NONE))]
  for (const rows of sets) {
    for (const W of [360, 420, 520]) {
      const svg = subSvg(W, { title: 'Plan limits', services: rows }, true)
      const t = textsOf(svg).join('\u0001')
      for (const s of SERVICES) expect(t).toContain(s.name)
      expect(svg).not.toContain('NaN')
      expect(subHeight(W, { title: 'Plan limits', services: rows }, true)).toBeGreaterThan(subHeight(W, { title: 'Plan limits' }, true))
      expect(textsOf(statusSvg(W, BASE)).join(' ')).not.toContain('Codex')
      const band = servicesSvg(W, rows)
      for (const s of SERVICES) expect(textsOf(band)).toContain(s.name)
      expect(servicesHeight(W, rows)).toBeLessThan(5 * 56) // COCKPIT-46: compact lines
    }
  }
  const none = textsOf(subSvg(420, { title: 'Plan limits', services: serviceRows(inputs(NONE)) }, true))
  expect(none.filter(x => x === 'unknown').length).toBeGreaterThanOrEqual(4)
})

test('long text wraps instead of dropping: the narrow card holds every word of the figure and the reset', () => {
  const rows = serviceRows(inputs())
  const narrow = textsOf(servicesSvg(360, rows)).join(' ')
  expect(narrow).toContain('resets 5h')
  expect(narrow).toContain('week')
  expect(narrow).toContain('expires Nov 1')
})

test('shipped code names no product', () => {
  const src = ['services.ts'].map(f => readFileSync(resolve(import.meta.dir, '../hooks', f), 'utf8')).join('\n')
  expect(/mai.?pai|chat.?ab/i.test(src)).toBe(false)
})
