import { expect, test } from './pure.ts'

import { applyManual, asOfText, claudeWindows, debugLine, emptyCache, mergeLive, parseUsageArgs, parseUsageCache, pickWindow, serializeUsageCache, slotOf } from '../hooks/usage.ts'

const NOW = Date.parse('2026-10-08T22:00:00Z')
const H = 3_600_000
const iso = (ms: number): string => new Date(ms).toISOString()

test('which cache slot a window feeds: five_hour, seven_day, and any window named Fable; others none', async () => {
  expect(slotOf('five_hour')).toBe('fiveHour')
  expect(slotOf('seven_day')).toBe('week')
  expect(slotOf('seven_day_fable')).toBe('fable')
  expect(slotOf('Fable_week')).toBe('fable')
  expect(slotOf('spend_limit')).toBeNull()
  expect(slotOf('')).toBeNull()
})

test('the cache round-trips through its file; a missing or broken file is empty; a bad slot is dropped', async () => {
  const c = mergeLive(emptyCache, [{ kind: 'five_hour', percentUsed: 0, resetsAt: iso(NOW + 5 * H) }, { kind: 'seven_day', percentUsed: 87, resetsAt: iso(NOW + 48 * H) }], NOW).cache
  expect(parseUsageCache(serializeUsageCache(c))).toEqual(c)
  expect(parseUsageCache(null)).toEqual(emptyCache)
  expect(parseUsageCache('{not json')).toEqual(emptyCache)
  expect(parseUsageCache('[]')).toEqual(emptyCache)
  const half = parseUsageCache(JSON.stringify({ fiveHour: { pct: 'x', at: 1 }, week: { pct: 87, at: NOW, resetsAt: '', source: 'manual' }, fable: null }))
  expect(half.fiveHour).toBeNull()
  expect(half.week).toEqual({ pct: 87, resetsAt: '', at: NOW, source: 'manual' })
  // A percent outside 0 to 100 is clamped, never kept as it was.
  expect(parseUsageCache(JSON.stringify({ week: { pct: 250, at: NOW } })).week?.pct).toBe(100)
})

test('every live reading is merged in with its time; the same reading again is NOT a change; a moved percent or reset is', async () => {
  const r = [{ kind: 'five_hour', percentUsed: 31, resetsAt: iso(NOW + 2 * H) }]
  const first = mergeLive(emptyCache, r, NOW)
  expect(first.changed).toBe(true)
  expect(first.cache.fiveHour).toEqual({ pct: 31, resetsAt: iso(NOW + 2 * H), at: NOW, source: 'live' })
  // Later, the same figures: nothing changes (the time alone does not count), so nothing is written.
  const again = mergeLive(first.cache, r, NOW + 60_000)
  expect(again.changed).toBe(false)
  expect(again.cache.fiveHour?.at).toBe(NOW)
  expect(mergeLive(first.cache, [{ kind: 'five_hour', percentUsed: 32, resetsAt: iso(NOW + 2 * H) }], NOW + 1).changed).toBe(true)
  expect(mergeLive(first.cache, [{ kind: 'five_hour', percentUsed: 31, resetsAt: iso(NOW + 3 * H) }], NOW + 1).changed).toBe(true)
  // A window the cache has no slot for, or a number that is not one, changes nothing.
  expect(mergeLive(emptyCache, [{ kind: 'spend_limit', percentUsed: 5 }, { kind: 'five_hour', percentUsed: Number.NaN }], NOW)).toEqual({ cache: emptyCache, changed: false })
  // A live reading replaces a hand-entered one.
  const manual = applyManual(emptyCache, [{ slot: 'week', pct: 80, resetsAt: '' }], NOW - H)
  expect(mergeLive(manual, [{ kind: 'seven_day', percentUsed: 80 }], NOW).cache.week?.source).toBe('live')
})

test('picking a window: live wins; else the saved value with when it was read; a window that has reset since is unknown; nothing is unknown', async () => {
  const cached = { pct: 12, resetsAt: iso(NOW + H), at: NOW - 30 * 60_000, source: 'live' as const }
  const live = pickWindow('5h', { kind: 'five_hour', percentUsed: 5, resetsAt: iso(NOW + 2 * H) }, cached, NOW)
  expect(live.source).toBe('live')
  expect(live.win.used).toBe(5)
  expect(live.asOfMs).toBeNull()
  const saved = pickWindow('5h', undefined, cached, NOW)
  expect(saved.source).toBe('cache')
  expect(saved.win.used).toBe(12)
  expect(saved.asOfMs).toBe(NOW - 30 * 60_000)
  // Its window reset: the old number is no longer true.
  const reset = pickWindow('5h', undefined, { ...cached, resetsAt: iso(NOW - 1) }, NOW)
  expect(reset.source).toBe('unknown')
  expect(reset.win.used).toBeNull()
  // A hand-entered value with no reset time stays until replaced.
  expect(pickWindow('week', undefined, { pct: 87, resetsAt: '', at: NOW - 48 * H, source: 'manual' }, NOW).win.used).toBe(87)
  const none = pickWindow('5h', undefined, null, NOW)
  expect(none.source).toBe('unknown')
  expect(none.win.used).toBeNull()
})

test('the Claude windows: 5h and week always (unknown when nothing knows them), the Fable week only when something knows it', async () => {
  const none = claudeWindows([], emptyCache, NOW)
  expect(none.five.win.used).toBeNull()
  expect(none.week.win.used).toBeNull()
  expect(none.fable).toBeNull()
  const some = claudeWindows([{ kind: 'five_hour', percentUsed: 0, resetsAt: iso(NOW + 5 * H) }, { kind: 'seven_day', percentUsed: 87, resetsAt: iso(NOW + 48 * H) }, { kind: 'seven_day_fable', percentUsed: 32, resetsAt: iso(NOW + 48 * H) }], emptyCache, NOW)
  expect([some.five.win.used, some.week.win.used, some.fable?.win.used]).toEqual([0, 87, 32])
  const fromFile = claudeWindows([], { ...emptyCache, fable: { pct: 32, resetsAt: '', at: NOW, source: 'manual' } }, NOW)
  expect(fromFile.fable?.win.used).toBe(32)
  expect(fromFile.fable?.asOfMs).toBe(NOW)
})

test('"as of HH:MM" is the local time of the reading', async () => {
  expect(asOfText(NOW)).toMatch(/^as of \d\d:\d\d$/)
  const d = new Date(NOW)
  expect(asOfText(NOW)).toBe('as of ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'))
})

// ---------------------------------------------------------------------------
// /crew usage

test('/crew usage 5h=0 wk=87 fable=32 parses; resets can be added; anything else is refused with a reason (never a guess)', async () => {
  const ok = parseUsageArgs('5h=0 wk=87 fable=32', NOW)
  expect(ok).toEqual({ ok: true, set: [{ slot: 'fiveHour', pct: 0, resetsAt: '' }, { slot: 'week', pct: 87, resetsAt: '' }, { slot: 'fable', pct: 32, resetsAt: '' }] })
  const withReset = parseUsageArgs('wk=87 wk-resets=2026-10-10T17:00:00Z 5h=12% 5h-resets=05:30', NOW)
  expect(withReset.ok).toBe(true)
  if (withReset.ok) {
    expect(withReset.set.find(s => s.slot === 'week')).toEqual({ slot: 'week', pct: 87, resetsAt: '2026-10-10T17:00:00.000Z' })
    const five = withReset.set.find(s => s.slot === 'fiveHour')
    expect(five?.pct).toBe(12)
    // HH:MM is the next such local time after now.
    const t = Date.parse(five?.resetsAt ?? '')
    expect(t).toBeGreaterThan(NOW)
    expect(t - NOW).toBeLessThanOrEqual(24 * H)
  }
  for (const bad of ['', '5h', '5h=abc', '5h=101', 'wk=-1', 'month=5', '5h-resets=soon 5h=1', 'wk=50 extra']) {
    const r = parseUsageArgs(bad, NOW)
    expect(r.ok, bad).toBe(false)
    if (!r.ok) expect(r.error.length).toBeGreaterThan(5)
  }
  // Resets alone give no figure: nothing to save.
  expect(parseUsageArgs('5h-resets=05:30', NOW).ok).toBe(false)
})

test('a hand-entered figure is saved marked manual and replaces the old one whole', async () => {
  const before = mergeLive(emptyCache, [{ kind: 'seven_day', percentUsed: 10, resetsAt: iso(NOW + 48 * H) }], NOW - H).cache
  const after = applyManual(before, [{ slot: 'week', pct: 87, resetsAt: '' }, { slot: 'fable', pct: 32, resetsAt: '' }], NOW)
  expect(after.week).toEqual({ pct: 87, resetsAt: '', at: NOW, source: 'manual' })
  expect(after.fable?.pct).toBe(32)
  expect(after.fiveHour).toBeNull()
})

// ---------------------------------------------------------------------------
// The debug log

test('the debug line says which source answered and with what: tab separated, one line, the context named', async () => {
  const empty = debugLine('2026-10-08T22:00:00.000Z', 'session.usage@start', [], null)
  expect(empty).toBe('2026-10-08T22:00:00.000Z\tsession.usage@start\trateLimits=none context=none\n')
  const got = debugLine('2026-10-08T22:00:05.000Z', 'session.measure', [{ kind: 'five_hour', percentUsed: 31 }, { kind: 'seven_day', percentUsed: 62 }], 74)
  expect(got).toBe('2026-10-08T22:00:05.000Z\tsession.measure\trateLimits=2 five_hour=31 seven_day=62 context=74%\n')
  expect(got.split('\n').length).toBe(2)
})
