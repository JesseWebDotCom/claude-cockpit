// The Status card tracks itself (cockpit v10): NOW and the stale chip from the live sources, done from what landed,
// the plan fields from status.json. Pure rules; run with `bun test tests/statuslive.test.ts` or the host's runner.

import { CLAIM_LIVE_MS, deriveLive, landedItemId, leadingId, lineNames, sameItem } from '../hooks/statuslive.ts'
import type { LiveIn, LiveMember } from '../hooks/statuslive.ts'
import { parseStatus } from '../hooks/board.ts'
import { expect, test } from './pure.ts'

const NOW = Date.parse('2026-10-09T13:00:00Z')
const MIN = 60_000
const HOUR = 60 * MIN

const status = (o: Record<string, unknown> = {}, ageMs = 2 * HOUR) =>
  parseStatus(JSON.stringify({ updated: new Date(NOW - ageMs).toISOString(), milestone: 'Pair the app with the remote service', done: 5, total: 6, now: ['waiting for you to pair the box'], next: ['bind chat/vision to 127.0.0.1:8791', 'GENUI-14: next block'], you: ['get a code'], ...o }))

const member = (o: Partial<LiveMember> = {}): LiveMember => ({ name: 'opencode-1', awake: true, label: 'COCKPIT-10: three fixes', lockItem: '', lockMtimeMs: null, sinceMs: 5 * MIN, ...o })
const base = (o: Partial<LiveIn> = {}): LiveIn => ({ status: status(), members: [], claims: [], reports: [], landed: [], nowMs: NOW, ...o })

test('ids: the same item written two ways, never a longer or shorter sibling', () => {
  expect(sameItem('COCKPIT-10', 'cockpit10')).toBe(true)
  expect(sameItem('SETTINGS-SAVE-01', 'h1-SETTINGS-SAVE-01')).toBe(true)
  expect(sameItem('cockpit1', 'cockpit10')).toBe(false)
  expect(sameItem('b2', 'b21')).toBe(false)
  expect(sameItem('', 'b21')).toBe(false)
  expect(leadingId('COCKPIT-10: three fixes')).toBe('COCKPIT-10')
  expect(leadingId('b21 settings screen')).toBe('b21')
  expect(landedItemId('PAIR-WIRE-01: pairing reply carries hmac')).toBe('PAIR-WIRE-01')
  expect(landedItemId('GENUI-13c: Home places blocks')).toBe('GENUI-13c')
  expect(landedItemId('feat: bump spec (ADMIN-HOME-SETTINGS-01)')).toBe('')
  expect(landedItemId('docs: tick GENUI-13a')).toBe('')
  expect(lineNames('GENUI-13: next', 'GENUI-13')).toBe(true)
  expect(lineNames('GENUI-13c: next', 'GENUI-13')).toBe(false)
})

test('status.json older than the live evidence: the card shows the live NOW and no stale chip', () => {
  const d = deriveLive(base({ members: [member()], claims: [{ id: 'COCKPIT-10', mtimeMs: NOW - 10 * MIN }] }))
  expect(d.nowSource).toBe('live')
  expect(d.now).toEqual(['COCKPIT-10: three fixes (opencode-1)'])
  expect(d.stale).toBe('')
})

test('status.json newer than all the evidence: its own NOW stands, and the chip only comes with an old file and nothing live', () => {
  const fresh = deriveLive(base({ status: status({}, 2 * MIN), members: [member()] }))
  expect(fresh.nowSource).toBe('file')
  expect(fresh.now).toEqual(['waiting for you to pair the box'])
  expect(fresh.stale).toBe('')
  // Old file, a live lane older than the file's write: live backs the card, no chip.
  const backed = deriveLive(base({ status: status({}, 40 * MIN), members: [member({ sinceMs: 3 * HOUR })] }))
  expect(backed.stale).toBe('')
  // Old file, nothing live at all: the chip says how old.
  const alone = deriveLive(base({ status: status({}, 2 * HOUR), members: [member({ awake: false })] }))
  expect(alone.nowSource).toBe('file')
  expect(alone.stale).toBe('updated 2h ago')
  // A file under 30 minutes old is never stale.
  expect(deriveLive(base({ status: status({}, 20 * MIN) })).stale).toBe('')
})

test('a lane whose report is newer than its claim or lock leaves NOW; an older report does not', () => {
  const working = member({ lockItem: 'b21', label: 'b21 settings screen', name: 'codex-a', lockMtimeMs: NOW - 2 * HOUR })
  const open = deriveLive(base({ members: [working], reports: [{ id: 'b21', mtimeMs: NOW - 3 * HOUR }] }))
  expect(open.now).toEqual(['b21 settings screen (codex-a)'])
  const done = deriveLive(base({ members: [working], reports: [{ id: 'b21', mtimeMs: NOW - 5 * MIN }] }))
  expect(done.now).toEqual([])
  expect(done.nowSource).toBe('none')
  // The same for a claim with no lane at all.
  const claim = { id: 'COCKPIT-10', mtimeMs: NOW - 30 * MIN }
  expect(deriveLive(base({ claims: [claim] })).now).toEqual(['COCKPIT-10 (claimed 30m ago)'])
  expect(deriveLive(base({ claims: [claim], reports: [{ id: 'cockpit10', mtimeMs: NOW - MIN }] })).now).toEqual([])
  // A claim that is over 12 hours old with no report is not a NOW.
  expect(deriveLive(base({ claims: [{ id: 'OLD-01', mtimeMs: NOW - CLAIM_LIVE_MS - MIN }] })).nowSource).toBe('file')
})

test('a claim an awake lane already covers is listed once; a sleeping lane is not NOW', () => {
  const d = deriveLive(base({ members: [member()], claims: [{ id: 'COCKPIT-10', mtimeMs: NOW - 10 * MIN }, { id: 'OTHER-02', mtimeMs: NOW - 20 * MIN }] }))
  expect(d.now).toEqual(['COCKPIT-10: three fixes (opencode-1)', 'OTHER-02 (claimed 20m ago)'])
  expect(deriveLive(base({ members: [member({ awake: false })] })).nowSource).toBe('file')
})

test('a landed commit whose title starts with an id in NEXT or NOW advances done by one, once, and drops the item', () => {
  const landed = [{ hash: 'e6fc18af', subject: 'GENUI-14: next block' }, { hash: 'aaaa1111', subject: 'GENUI-14: follow up' }]
  const d = deriveLive(base({ landed }))
  expect(d.done).toBe(6)
  expect(d.total).toBe(6)
  expect(d.advanced).toEqual(['GENUI-14'])
  expect(d.next).toEqual(['bind chat/vision to 127.0.0.1:8791'])
  // An id the plan does not list, a "feat:" title and an id the coordinator already removed advance nothing.
  expect(deriveLive(base({ landed: [{ hash: 'b', subject: 'PAIR-WIRE-01: x' }, { hash: 'c', subject: 'feat: GENUI-14 thing' }] })).done).toBe(5)
  // Never past the total.
  expect(deriveLive(base({ status: status({ done: 6 }), landed })).done).toBe(6)
  // Two different items advance by two.
  const two = deriveLive(base({ status: status({ done: 3, next: ['A-01: one', 'B-02: two'] }), landed: [{ hash: 'a', subject: 'A-01: one' }, { hash: 'b', subject: 'B-02: two' }] }))
  expect(two.done).toBe(5)
})

test('no status file: the live lanes still fill NOW, there is nothing to count and no chip', () => {
  const d = deriveLive({ status: null, members: [member()], claims: [], reports: [], landed: [{ hash: 'x', subject: 'GENUI-14: y' }], nowMs: NOW })
  expect(d.now).toEqual(['COCKPIT-10: three fixes (opencode-1)'])
  expect(d.done).toBe(null)
  expect(d.stale).toBe('')
})

test('a report that lands after status.json was written makes the file older than the evidence', () => {
  const s = status({}, 30 * MIN)
  const claim = { id: 'COCKPIT-10', mtimeMs: NOW - 10 * MIN }
  expect(deriveLive(base({ status: s, claims: [claim] })).nowSource).toBe('live')
  expect(deriveLive(base({ status: s, reports: [{ id: 'unrelated', mtimeMs: NOW - 5 * MIN }] })).nowSource).toBe('none')
  expect(deriveLive(base({ status: s })).nowSource).toBe('file')
})
