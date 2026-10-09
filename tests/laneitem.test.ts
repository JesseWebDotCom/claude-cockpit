// Cockpit v11: what a lane is doing (a verb phrase from its pane) and which item it owns (claims, locks, panes, runs),
// never a stale one. Pure rules; run with `bun test tests/laneitem.test.ts` or the host's runner.

import { doingOf, wrapChars } from '../hooks/doing.ts'
import { briefItem, coordinatorItem, landedIt, parseClaim, paneHit, resolveLaneItem } from '../hooks/laneitem.ts'
import type { LaneItemIn } from '../hooks/laneitem.ts'
import { expect, test } from './pure.ts'

const NOW = Date.parse('2026-10-09T15:00:00Z')
const MIN = 60_000
const HOUR = 60 * MIN

// ---------------------------------------------------------------------------
// What it is doing

test('doing: a Codex tool line becomes a verb phrase; the footer, output and the prompt box are skipped', () => {
  const pane = [
    '• Edited hooks/core.ts (+4 -1)',
    '• Ran rtk bun test tests/core.test.ts',
    '  └ 12 pass',
    '    + Show details',
    '• Working (4s \u2022 esc to interrupt)',
    '› Ask Codex to do anything',
    '  GPT-6-Luna low · ~/Developer/home',
    '  ? for shortcuts',
  ]
  const d = doingOf(pane)
  expect(d?.verb).toBe('running tests')
  expect(d?.phrase).toBe('running tests')
  expect(d?.full).toBe('\u2022 Ran rtk bun test tests/core.test.ts')
  expect(doingOf(pane.slice(0, 1))?.phrase).toBe('editing core.ts')
})

test('doing: the gate, git, search, read, a bare command, a PROGRESS line, Claude and OpenCode tool lines', () => {
  const one = (l: string) => doingOf([l])
  expect(one('• Ran bash scripts/check.sh --pre')?.phrase).toBe('running the gate')
  expect(one('• Ran rtk git commit -m "x"')?.phrase).toBe('committing')
  expect(one("• Ran rg -n 'foo' src | head -40")?.phrase).toBe('searching for foo')
  expect(one('• Ran cat docs/BACKLOG.md')?.phrase).toBe('reading')
  expect(one('• Ran ./deploy-thing --now')?.phrase).toBe('running deploy-thing')
  expect(one('  PROGRESS: wiring the claim reader')?.phrase).toBe('wiring the claim reader')
  expect(one('\u23fa Bash(bun test)')?.phrase).toBe('running tests')
  expect(one('\u23fa Update(hooks/look.ts)')?.phrase).toBe('editing look.ts')
  expect(one('\u2192 Read hooks/crew.ts')?.phrase).toBe('reading crew.ts')
  expect(one('$ tsc --noEmit')?.phrase).toBe('type-checking')
  expect(one('\u2731 Grep "doing"')?.phrase).toBe('searching for doing')
})

test('doing: prose is its first sentence, cut; nothing meaningful is null; the newest meaningful line wins', () => {
  const prose = doingOf(['• The full gate reached the backend suite and failed only at the weather assertion in freshScore.test.ts; preflight is now green.'])
  expect(prose?.verb).toBe('')
  expect(prose?.phrase.length).toBeLessThanOrEqual(60)
  expect(prose?.phrase.endsWith('\u2026')).toBe(true)
  expect(doingOf(['• Working (4s \u2022 esc to interrupt)', '  ? for shortcuts', '', '  \u2514 (no output)'])).toBe(null)
  expect(doingOf([])).toBe(null)
  expect(doingOf(['• Edited a.ts (+1 -1)', '• Ran bun test'])?.verb).toBe('running tests')
})

test('wrapChars: words wrapped to a width, a long word cut, the last line ends with an ellipsis when it did not fit', () => {
  expect(wrapChars('one two three four five six', 10, 5)).toEqual(['one two', 'three four', 'five six'])
  expect(wrapChars('abcdefghijklmnop', 8, 3)).toEqual(['abcdefg\u2026'])
  const cutOff = wrapChars('aaa bbb ccc ddd eee fff ggg', 7, 2)
  expect(cutOff.length).toBe(2)
  expect(cutOff[1]?.endsWith('\u2026')).toBe(true)
  expect(wrapChars('', 10, 3)).toEqual([])
})

// ---------------------------------------------------------------------------
// Which item a lane owns

test('claim files: the id is the file name, a "lane:" line names the lane (any case), older claims have none', () => {
  expect(parseClaim('FEAT-11.claim', 'FEAT-11\nlane: opencode-a\n', 5)).toEqual({ id: 'FEAT-11', mtimeMs: 5, lane: 'opencode-a', title: '', now: '' })
  expect(parseClaim('X-01.claim', 'Lane:   codex-a (the gate)\n', 5).lane).toBe('codex-a')
  expect(parseClaim('HOME-FIT-11.claim', 'sonnet-rigspark\tcodex\t/home/x/work-c-100\t2026-10-01T23:56:37Z', 5).lane).toBe('')
  expect(parseClaim('A-01.claim', 'a', 5).lane).toBe('')
  expect(briefItem({ name: 'brief-oc-feat11.md', heading: 'FEAT-11: demo-plugin crew rows' })).toBe('FEAT-11')
  expect(briefItem({ name: 'brief-oc-feat11.md', heading: 'Crew rows' })).toBe('feat11')
  expect(landedIt('SYNC-LINK-01: pairing reply', 'SYNC-LINK-01')).toBe(true)
  expect(landedIt('SYNC-LINK-011: x', 'SYNC-LINK-01')).toBe(false)
  expect(landedIt('feat: SYNC-LINK-01', 'SYNC-LINK-01')).toBe(false)
})

const lane = (o: Partial<LaneItemIn> = {}): LaneItemIn => ({
  lane: 'opencode-a',
  awake: true,
  lastActivityMs: NOW - MIN,
  paneLines: [],
  lock: null,
  claims: [],
  runBrief: '',
  runStartedMs: null,
  briefs: [],
  reports: [],
  landed: [],
  nowMs: NOW,
  ...o,
})

test('a claim that names the lane wins; the same claim never shows on another lane', () => {
  const claims = [{ id: 'FEAT-11', mtimeMs: NOW - 10 * MIN, lane: 'opencode-a' }]
  expect(resolveLaneItem(lane({ claims })).item).toBe('FEAT-11')
  expect(resolveLaneItem(lane({ claims })).source).toBe('claim-lane')
  // Wrong once: "opencode-b sleeping, FEAT-11" while opencode-a does it.
  expect(resolveLaneItem(lane({ lane: 'opencode-b', awake: false, lastActivityMs: NOW - 5 * HOUR, claims })).item).toBe('')
  expect(resolveLaneItem(lane({ lane: 'opencode-b', awake: true, claims })).item).toBe('')
})

test('a claim with no lane line is matched by what the pane shows: the id, or the path of a brief about it', () => {
  const claims = [{ id: 'FEAT-11', mtimeMs: NOW - 10 * MIN }, { id: 'OTHER-02', mtimeMs: NOW - 10 * MIN }]
  const byId = lane({ paneLines: ['  Read and do .../queue/brief-oc-feat11.md', 'tool: editing look.ts'], claims })
  expect(resolveLaneItem(byId).item).toBe('FEAT-11')
  expect(resolveLaneItem(byId).source).toBe('pane')
  const byText = lane({ paneLines: ['working on OTHER-02 now'], claims })
  expect(resolveLaneItem(byText).item).toBe('OTHER-02')
  // Two items on the screen: the one lowest (newest) wins.
  expect(resolveLaneItem(lane({ paneLines: ['OTHER-02 done', 'next: FEAT-11'], claims })).item).toBe('FEAT-11')
  // Nothing on the pane names a claim: no item, not a guess.
  expect(resolveLaneItem(lane({ paneLines: ['compiling'], claims })).item).toBe('')
  // A brief with no claim at all: the item of its heading.
  const brief = { name: 'brief-oc-feat11.md', heading: 'FEAT-11: crew rows' }
  expect(resolveLaneItem(lane({ paneLines: ['Read and do /x/queue/brief-oc-feat11.md'], briefs: [brief] })).item).toBe('FEAT-11')
})

test('an opencode run names the item of its brief, spelled as its claim spells it', () => {
  const brief = { name: 'brief-oc-feat11.md', heading: 'Crew rows' }
  const r = resolveLaneItem(lane({ runBrief: 'brief-oc-feat11.md', runStartedMs: NOW - 5 * MIN, briefs: [brief], claims: [{ id: 'FEAT-11', mtimeMs: NOW - HOUR }] }))
  expect(r.item).toBe('FEAT-11')
  expect(r.source).toBe('run')
})

test('a lane lock counts, but not for a sleeper whose lane was active after the lock was written (the stale Place Hub, Installer Fix, Place Spec labels)', () => {
  const lock = { item: 'place-hub-d17', mtimeMs: NOW - 8 * HOUR }
  expect(resolveLaneItem(lane({ lane: 'codex-a', awake: true, lock })).item).toBe('place-hub-d17')
  expect(resolveLaneItem(lane({ lane: 'codex-a', awake: false, lastActivityMs: NOW - 2 * HOUR, lock })).item).toBe('')
  // Written after the lane went quiet: queued work, shown.
  expect(resolveLaneItem(lane({ lane: 'codex-a', awake: false, lastActivityMs: NOW - 2 * HOUR, lock: { item: 'b50', mtimeMs: NOW - HOUR } })).item).toBe('b50')
  // Over 12 hours for a sleeper, over 24 for a working lane: never.
  expect(resolveLaneItem(lane({ lane: 'codex-a', awake: false, lastActivityMs: null, lock: { item: 'b50', mtimeMs: NOW - 13 * HOUR } })).item).toBe('')
  expect(resolveLaneItem(lane({ lane: 'codex-a', awake: true, lock: { item: 'b50', mtimeMs: NOW - 25 * HOUR } })).item).toBe('')
})

test('an item that landed in git, or has a newer report, is ignored whatever file names it', () => {
  const claims = [{ id: 'SYNC-LINK-01', mtimeMs: NOW - HOUR, lane: 'opencode-a' }]
  expect(resolveLaneItem(lane({ claims })).item).toBe('SYNC-LINK-01')
  expect(resolveLaneItem(lane({ claims, landed: [{ hash: 'e6fc18af', subject: 'SYNC-LINK-01: pairing reply carries hmac_sha256' }] })).item).toBe('')
  expect(resolveLaneItem(lane({ claims, reports: [{ id: 'synclink01', mtimeMs: NOW - 5 * MIN }] })).item).toBe('')
  expect(resolveLaneItem(lane({ claims, reports: [{ id: 'synclink01', mtimeMs: NOW - 2 * HOUR }] })).item).toBe('SYNC-LINK-01')
  const lock = { item: 'FORMS-13c', mtimeMs: NOW - HOUR }
  expect(resolveLaneItem(lane({ lock, landed: [{ hash: 'x', subject: 'FORMS-13c: Saved places blocks at their paragraph' }] })).item).toBe('')
})

test('the pane search finds ids as whole tokens and brief paths by their item', () => {
  expect(paneHit(['a', 'FORMS-13c is next'], 'FORMS-13c', [])).toBe(1)
  expect(paneHit(['FORMS-13c is next'], 'FORMS-13', [])).toBe(-1)
  expect(paneHit(['Read and do /q/brief-oc-feat11.md'], 'FEAT-11', [])).toBe(0)
  expect(paneHit(['Read and do /q/brief-b21c.md'], 'b21', [])).toBe(-1)
})

test('the coordinator row: its NOW item while status.json is fresh, else the milestone, else nothing', () => {
  const s = { milestone: 'Pair the app with the remote service', now: ['bind chat/vision'], updatedMs: NOW - 5 * MIN }
  expect(coordinatorItem(s, NOW, 0)).toBe('bind chat/vision')
  expect(coordinatorItem({ ...s, updatedMs: NOW - 3 * HOUR }, NOW, NOW - HOUR)).toBe('Pair the app with the remote service')
  expect(coordinatorItem({ ...s, now: [] }, NOW, 0)).toBe('Pair the app with the remote service')
  expect(coordinatorItem(null, NOW, 0)).toBe('')
  expect(coordinatorItem({ milestone: '', now: [], updatedMs: null }, NOW, 0)).toBe('')
})
