import { expect, test } from './pure.ts'

import {
  BURST_MS,
  CHIP_MS,
  ROW_PX,
  TABS,
  burstNow,
  chipNow,
  defaultUi,
  isTab,
  landEvents,
  milestoneEvent,
  parseUi,
  pruneCelebrations,
  serializeUi,
  windowBlocks,
} from '../hooks/ui.ts'
import type { Block, Celebration } from '../hooks/ui.ts'

// ---------------------------------------------------------------------------
// Tabs and what is remembered

test('the tabs, in order: Agents | Items | Inbox | Health (four only), each with a hotkey and a hint', async () => {
  expect(TABS.map(t => t.label)).toEqual(['Agents', 'Items', 'Inbox', 'Health'])
  expect(TABS.map(t => t.id)).toEqual(['crew', 'items', 'inbox', 'health'])
  expect(new Set(TABS.map(t => t.hotkey)).size).toBe(4)
  // A tab saved by an older build (Sessions, System) lands on Health.
  expect(parseUi(JSON.stringify({ tab: 'sessions' })).tab).toBe('health')
  expect(parseUi(JSON.stringify({ tab: 'system' })).tab).toBe('health')
  for (const t of TABS) expect(t.hint.length).toBeGreaterThan(5)
  expect(isTab('items')).toBe(true)
  expect(isTab('settings')).toBe(false)
  expect(isTab(3)).toBe(false)
})

test('UI state: tab, view, mine, expanded sections and celebrations round-trip through the file', async () => {
  const s = { ...defaultUi, tab: 'items' as const, view: 'items' as const, mine: true, expanded: ['queue', 'system'], celebrations: false, seenLanded: ['a1', 'b2'], seenMilestones: ['Admin Home settings live'], baselined: true }
  const back = parseUi(serializeUi(s))
  expect(back).toEqual(s)
  expect(serializeUi(s).endsWith('\n')).toBe(true)
  expect(JSON.parse(serializeUi(s)).tab).toBe('items')
})

test('UI state: a missing or broken file gives the defaults; unknown values are dropped', async () => {
  expect(parseUi(null)).toEqual(defaultUi)
  expect(parseUi('')).toEqual(defaultUi)
  expect(parseUi('not json')).toEqual(defaultUi)
  expect(parseUi('[1,2]')).toEqual(defaultUi)
  expect(parseUi('{"tab":"settings","view":"x","mine":"yes","celebrations":"no","expanded":[1,"a",null]}')).toEqual({ ...defaultUi, expanded: ['a'], sections: { status: false, 'c-agents': true, 'c-system': false, 'c-events': false, 'c-syslog': false } })
  // Celebrations are on unless the file says false.
  expect(parseUi('{}').celebrations).toBe(true)
  expect(parseUi('{"celebrations":false}').celebrations).toBe(false)
  expect(defaultUi).toMatchObject({ tab: 'crew', view: 'crew', mine: false, celebrations: true, baselined: false })
})

test('UI state: the seen lists are capped so the file cannot grow without end', async () => {
  const many = Array.from({ length: 500 }, (_, i) => 'h' + i)
  const s = parseUi(serializeUi({ ...defaultUi, seenLanded: many }))
  expect(s.seenLanded.length).toBe(300)
  expect(s.seenLanded[299]).toBe('h499')
})

// ---------------------------------------------------------------------------
// Celebrations (Addendum 5)

const land = (hash: string, subject = 'feat: ' + hash) => ({ hash, subject })

test('a landed event fires exactly once: the first sight of a new commit, never again', async () => {
  // The first poll only records what is already on main.
  let r = landEvents([land('a1'), land('b2')], new Set(), false)
  expect(r.events).toEqual([])
  // A new commit lands: one event.
  r = landEvents([land('a1'), land('b2'), land('c3')], r.seen, r.baselined)
  expect(r.events.map(e => e.hash)).toEqual(['c3'])
  // A repeat poll: nothing, and nothing after that.
  r = landEvents([land('a1'), land('b2'), land('c3')], r.seen, r.baselined)
  expect(r.events).toEqual([])
  r = landEvents([land('a1'), land('b2'), land('c3')], r.seen, r.baselined)
  expect(r.events).toEqual([])
})

test('no replay on reload: the first poll only records what had landed; a reload with the saved ids fires nothing', async () => {
  const today = [land('a1'), land('b2'), land('c3')]
  // The very first run (nothing saved): no burst for the three that were already on main.
  const first = landEvents(today, new Set(), false)
  expect(first.events).toEqual([])
  expect([...first.seen].sort()).toEqual(['a1', 'b2', 'c3'])
  expect(first.baselined).toBe(true)
  // After a reload the saved ids come back: still nothing.
  const saved = parseUi(serializeUi({ ...defaultUi, seenLanded: [...first.seen], baselined: true }))
  expect(landEvents(today, new Set(saved.seenLanded), saved.baselined).events).toEqual([])
  // ... and a commit that landed while the mod was not loaded is celebrated once.
  expect(landEvents([...today, land('d4')], new Set(saved.seenLanded), saved.baselined).events.map(e => e.hash)).toEqual(['d4'])
})

test('two commits landing in one poll are two events; an empty list is none', async () => {
  expect(landEvents([land('a1'), land('b2'), land('c3')], new Set(['a1']), true).events.map(e => e.hash)).toEqual(['b2', 'c3'])
  expect(landEvents([], new Set(['a1']), true).events).toEqual([])
  // A commit that left the list (a rebase) and came back is not new.
  const gone = landEvents([land('b2')], new Set(['a1', 'b2']), true)
  expect(gone.events).toEqual([])
  expect(landEvents([land('a1'), land('b2')], gone.seen, true).events).toEqual([])
})

test('the milestone burst fires once per milestone, only when the bar is full', async () => {
  expect(milestoneEvent('Admin Home settings live', 6, 6, [])).toBe(true)
  expect(milestoneEvent('Admin Home settings live', 7, 6, [])).toBe(true)
  expect(milestoneEvent('Admin Home settings live', 5, 6, [])).toBe(false)
  expect(milestoneEvent('Admin Home settings live', 6, 6, ['Admin Home settings live'])).toBe(false)
  expect(milestoneEvent('Next milestone', 6, 6, ['Admin Home settings live'])).toBe(true)
  // No total, a zero total or no name: never.
  expect(milestoneEvent('x', null, null, [])).toBe(false)
  expect(milestoneEvent('x', 0, 0, [])).toBe(false)
  expect(milestoneEvent('', 6, 6, [])).toBe(false)
  expect(milestoneEvent('x', null, 6, [])).toBe(false)
})

test('the burst lasts 2 s and the "landed <item>" chip 10 s; nothing before the event', async () => {
  const c: Celebration = { hash: 'a1', subject: 'feat: x (b22)', item: 'b22', member: 'codex-a', at: 100_000 }
  expect(BURST_MS).toBe(2000)
  expect(CHIP_MS).toBe(10_000)
  expect(burstNow(c, 100_000)).toBe(true)
  expect(burstNow(c, 101_999)).toBe(true)
  expect(burstNow(c, 102_000)).toBe(false)
  expect(burstNow(c, 105_000)).toBe(false)
  expect(chipNow(c, 105_000)).toBe(true)
  expect(chipNow(c, 109_999)).toBe(true)
  expect(chipNow(c, 110_000)).toBe(false)
  expect(burstNow(c, 99_000)).toBe(false)
  expect(chipNow(c, Number.NaN)).toBe(false)
  expect(pruneCelebrations([c, { ...c, hash: 'b2', at: 85_000 }], 105_000).map(x => x.hash)).toEqual(['a1'])
})

// ---------------------------------------------------------------------------
// The pinned layout: only the middle scrolls

const blocks = (...hs: number[]): Block[] => hs.map((h, i) => ({ key: 'b' + i, el: i, h }))

test('window: everything fits, everything shows, nothing to scroll', async () => {
  const w = windowBlocks(blocks(44, 44, 44), 0, 400)
  expect(w.shown.map(b => b.key)).toEqual(['b0', 'b1', 'b2'])
  expect(w).toMatchObject({ offset: 0, maxOffset: 0, hiddenAbove: 0, hiddenBelow: 0 })
})

test('window: only as many blocks as the budget holds; the rest is below', async () => {
  const w = windowBlocks(blocks(44, 44, 44, 44, 44), 0, 140)
  expect(w.shown.map(b => b.key)).toEqual(['b0', 'b1', 'b2'])
  expect(w.hiddenBelow).toBe(88)
  expect(w.hiddenAbove).toBe(0)
  expect(w.maxOffset).toBe(88)
})

test('window: a scroll offset moves the start to the block that holds it; never past the end', async () => {
  const bs = blocks(44, 44, 44, 44, 44)
  expect(windowBlocks(bs, 50, 140).shown.map(b => b.key)).toEqual(['b1', 'b2', 'b3'])
  expect(windowBlocks(bs, 50, 140).offset).toBe(44)
  expect(windowBlocks(bs, 88, 140).shown.map(b => b.key)).toEqual(['b2', 'b3', 'b4'])
  // Far past the end: the last full page, not an empty window.
  const end = windowBlocks(bs, 10_000, 140)
  expect(end.shown.map(b => b.key)).toEqual(['b2', 'b3', 'b4'])
  expect(end.hiddenBelow).toBe(0)
  // Negative and NaN offsets are the top.
  expect(windowBlocks(bs, -50, 140).shown[0]?.key).toBe('b0')
  expect(windowBlocks(bs, Number.NaN, 140).shown[0]?.key).toBe('b0')
})

test('window: a block taller than the budget still shows alone; no budget still shows one block; empty is empty', async () => {
  expect(windowBlocks(blocks(300, 44), 0, 100).shown.map(b => b.key)).toEqual(['b0'])
  expect(windowBlocks(blocks(44, 44), 0, 0).shown.map(b => b.key)).toEqual(['b0'])
  expect(windowBlocks([], 0, 100)).toMatchObject({ shown: [], offset: 0, maxOffset: 0, hiddenBelow: 0 })
  expect(windowBlocks(blocks(44), 0, Number.NaN).shown.length).toBe(1)
})

test('window: scrolling through the whole list shows every block at some offset, in order', async () => {
  const bs = blocks(30, 60, 44, 28, 44, 80, 44)
  const seen: string[] = []
  for (let off = 0; off <= 400; off += ROW_PX) {
    for (const b of windowBlocks(bs, off, 130).shown) if (!seen.includes(b.key)) seen.push(b.key)
  }
  expect(seen).toEqual(bs.map(b => b.key))
  // The window's height never exceeds the budget, except for a single oversized block.
  for (let off = 0; off <= 400; off += ROW_PX) {
    const w = windowBlocks(bs, off, 130)
    const h = w.shown.reduce((s, b) => s + b.h, 0)
    expect(h <= 130 || w.shown.length === 1).toBe(true)
  }
})
