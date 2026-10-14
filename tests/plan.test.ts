// COCKPIT-66: plan.json parsing, the derive rules, motion tracking and the two text strips.
import { expect, test } from 'bun:test'
import { DONE_HOLD_MS, derivePlan, landedId, newTracker, ownerAlive, parsePlan, planBand, planFooterLine, presentPlan, elapsedText, waitLabel } from '../hooks/plan.ts'
import type { PlanEvidence, PlanFile } from '../hooks/plan.ts'
import { runningItems, runningRowSvg } from '../hooks/running.ts'

const NOW = Date.parse('2026-10-10T21:00:00Z')
const MIN = 60_000
const UPDATED = NOW - 20 * MIN

const file = (items: object[], extra: object = {}): PlanFile =>
  parsePlan(JSON.stringify({ milestone: 'Goal', updated: new Date(UPDATED).toISOString(), items, ...extra }))!

const noEv = (over: Partial<PlanEvidence> = {}): PlanEvidence => ({ nowMs: NOW, members: [], claims: [], reports: [], blocked: [], landed: [], aliveNames: [], ...over })
const member = (name: string, label: string, awake = true, lockItem = '') => ({ name, awake, label, lockItem, lockMtimeMs: null, sinceMs: 5 * MIN })

test('parsePlan: reads items, defaults a bad state to todo, drops duplicates and rows without an id', () => {
  const p = parsePlan(JSON.stringify({ milestone: 'M', items: [{ id: 'A-1', title: 'One', state: 'DONE' }, { id: 'a-1' }, { title: 'no id' }, { id: 'B-2', state: 'weird' }, { id: 'C-3', planned: false }] }))!
  expect(p.items.map(i => [i.id, i.state, i.planned])).toEqual([['A-1', 'done', true], ['B-2', 'todo', true], ['C-3', 'todo', false]])
  expect(p.items[1]!.title).toBe('B-2')
})

test('parsePlan: not JSON, not an object or no items list gives null (the card falls back to status.json)', () => {
  for (const t of [null, '', '{', '[]', '{"milestone":"x"}']) expect(parsePlan(t)).toBeNull()
})

test('parsePlan: the sync time is the later of `updated` and the modified time', () => {
  const t = JSON.stringify({ updated: '2026-10-10T20:00:00Z', items: [] })
  expect(parsePlan(t, Date.parse('2026-10-10T20:30:00Z'))!.updatedMs).toBe(Date.parse('2026-10-10T20:30:00Z'))
  expect(parsePlan(t, Date.parse('2026-10-10T19:00:00Z'))!.updatedMs).toBe(Date.parse('2026-10-10T20:00:00Z'))
})

test('landedId reads the id from a merge or a plain subject', () => {
  expect(landedId('Merge SEARCH-APPS-LINK-01')).toBe('SEARCH-APPS-LINK-01')
  expect(landedId('KS-02E: date lines')).toBe('KS-02E')
  expect(landedId('fix: typo')).toBe('')
})

test('rule 1: a landed commit makes the item done, even when the file says todo; the file is only beaten when the commit is newer', () => {
  const f = file([{ id: 'KS-02E', title: 'Dates', state: 'todo' }, { id: 'KS-03', title: 'Old', state: 'todo' }])
  const v = derivePlan(f, noEv({ landed: [{ hash: 'a', subject: 'KS-02E: date lines', atMs: NOW - MIN }, { hash: 'b', subject: 'KS-03: x', atMs: UPDATED - MIN }] }))
  expect(v.done.map(r => r.id)).toEqual(['KS-02E'])
  expect(v.todo.map(r => r.id)).toEqual(['KS-03'])
  expect(v.doneN).toBe(1)
})

test('rule 3: an awake lane or a live claim makes it running with that owner; a closing report ends the claim', () => {
  const f = file([{ id: 'KS-02E', title: 'Dates', state: 'todo' }, { id: 'KS-04', title: 'Four', state: 'todo' }, { id: 'KS-05', title: 'Five', state: 'todo' }])
  const ev = noEv({
    members: [member('codex-1', 'KS-02E: date lines')],
    claims: [{ id: 'KS-04', mtimeMs: NOW - 2 * MIN, lane: 'reika' }, { id: 'KS-05', mtimeMs: NOW - 5 * MIN }],
    reports: [{ id: 'KS-05', mtimeMs: NOW - MIN }],
  })
  const v = derivePlan(f, ev)
  expect(v.running.map(r => [r.id, r.owner])).toEqual([['KS-02E', 'codex-1'], ['KS-04', 'reika']])
  expect(v.todo.map(r => r.id)).toEqual(['KS-05'])
})

test('only working lanes count as running, limited claims are blocked, and a planned claim is not off plan', () => {
  const f = file([{ id: 'A-1', title: 'Claimed work', state: 'todo' }, { id: 'A-2', title: 'Limited work', state: 'running', owner: 'codex-w2' }])
  const v = derivePlan(f, noEv({
    members: [member('codex-w1', 'codex-w1', false)],
    claims: [{ id: 'A-1', title: 'Claimed work', lane: 'codex-w1', mtimeMs: NOW - MIN }],
    laneStates: new Map([['codex-w1', 'working'], ['codex-w2', 'paused: limit']]),
  }))
  expect(v.running.map(r => r.id)).toEqual(['A-1'])
  expect(v.off).toEqual([])
  expect(v.blocked.map(r => [r.id, r.note])).toEqual([['A-2', 'paused: limit']])
  expect(waitLabel(v.blocked[0]!)).toBe('paused: limit')

  const idle = derivePlan(file([{ id: 'A-1', title: 'Idle work', state: 'todo' }]), noEv({
    members: [member('codex-w3', 'A-3: idle task')], laneStates: new Map([['codex-w3', 'idle']]),
  }))
  expect(idle.off).toEqual([])
  expect(idle.running).toEqual([])
})

test('a subagent description naming a plan id attaches to that step; one without an id gets one agent row', () => {
  const f = file([{ id: 'COCKPIT-SUBAGENTS-01', title: 'Show every worker', state: 'todo' }])
  const attached = derivePlan(f, noEv({ subagents: [{ agent_id: 'agent-1', description: 'COCKPIT-SUBAGENTS-01 inspect status', subagent_type: 'Explore', model: 'sonnet', started_at: NOW - MIN, updated_at: NOW, state: 'running' }] }))
  expect(attached.running.map(r => r.id)).toEqual(['COCKPIT-SUBAGENTS-01'])
  expect(attached.off).toEqual([])
  expect(attached.running[0]!.subagent).toEqual({ id: 'agent-1', description: 'COCKPIT-SUBAGENTS-01 inspect status', model: 'sonnet' })

  const plain = derivePlan(f, noEv({ subagents: [{ agent_id: 'agent-2', description: 'Inspect the docs', subagent_type: 'Explore', started_at: NOW - MIN, updated_at: NOW, state: 'running' }] }))
  const rows = runningItems(plain.running, plain.off)
  expect(rows.map(r => [r.id, r.title, r.agent])).toEqual([['agent-2', 'Inspect the docs', true]])
  expect(runningRowSvg(400, rows[0]!).svg).toContain(', agent')
})

test('an untouched running subagent is ignored after 30 minutes', () => {
  const v = derivePlan(file([]), noEv({ subagents: [{ agent_id: 'agent-old', description: 'old work', subagent_type: 'Explore', started_at: NOW - 31 * MIN, updated_at: NOW - 31 * MIN, state: 'running' }] }))
  expect(v.offRunning).toEqual([])
})

test('rule 2: a BLOCKED report makes it blocked; owner jesse counts toward you', () => {
  const f = file([{ id: 'X-1', title: 'Ask', state: 'running', owner: 'jesse' }, { id: 'X-2', title: 'Other', state: 'running', owner: 'codex-1' }])
  const v = derivePlan(f, noEv({ blocked: [{ id: 'X-1', atMs: NOW - MIN, detail: 'pick a model' }], aliveNames: ['codex-1'] }))
  expect(v.blocked.map(r => r.id)).toEqual(['X-1'])
  expect(v.blocked[0]!.note).toBe('pick a model')
  expect(v.blocked[0]!.onYou).toBe(true)
  expect(v.you).toBe(1)
  expect(v.youAsks).toEqual(['pick a model'])
})

test('rule 4: the file wins when it is newer than the evidence', () => {
  const f = file([{ id: 'KS-04', title: 'Four', state: 'blocked', owner: 'jesse', note: 'waiting' }])
  const v = derivePlan(f, noEv({ claims: [{ id: 'KS-04', mtimeMs: UPDATED - 5 * MIN }] }))
  expect(v.blocked.map(r => r.id)).toEqual(['KS-04'])
  expect(v.running).toEqual([])
})

test('a running row whose owner is not alive anywhere is flagged gone', () => {
  const f = file([{ id: 'A-1', title: 'a', state: 'running', owner: 'codex-9' }, { id: 'A-2', title: 'b', state: 'running', owner: 'codex-1' }])
  const v = derivePlan(f, noEv({ aliveNames: ['codex-1'] }))
  expect(v.running.map(r => [r.id, r.gone])).toEqual([['A-1', true], ['A-2', false]])
  expect(ownerAlive('Sonnet agent', ['subagent-3'])).toBe(true)
  expect(ownerAlive('', [])).toBe(true)
})

test('off plan: evidence for an id on no row is counted apart, never inside n/m', () => {
  const f = file([{ id: 'A-1', title: 'a', state: 'todo' }])
  const v = derivePlan(f, noEv({ members: [member('codex-2', 'ZZ-09: surprise')], landed: [{ hash: 'c', subject: 'QQ-01: other', atMs: NOW - MIN }] }))
  expect(v.off.map(r => r.id).sort()).toEqual(['QQ-01', 'ZZ-09'])
  expect(v.planned).toBe(1)
  expect(v.doneN).toBe(0)
  expect(planBand(presentPlan(newTracker(), v, NOW)).offTag).toBe('+2 off plan')
})

test('an unplanned row in the file is off plan too, not counted', () => {
  const v = derivePlan(file([{ id: 'A-1', title: 'a', state: 'done' }, { id: 'B-1', title: 'b', state: 'done', planned: false }]), noEv())
  expect(v.planned).toBe(1)
  expect(v.doneN).toBe(1)
})

test('drift: amber at 10 minutes behind the evidence, red (stale dot) at 30, with the plain reason', () => {
  const f = file([{ id: 'A-1', title: 'a', state: 'todo' }])
  const amber = derivePlan(f, noEv({ landed: [{ hash: 'c', subject: 'QQ-01: x', atMs: UPDATED + 11 * MIN }] }))
  expect(amber.drift.level).toBe('amber')
  expect(amber.stale).toBe(false)
  expect(amber.drift.text).toBe('1 landing not on the plan')
  const old = parsePlan(JSON.stringify({ updated: new Date(NOW - 45 * MIN).toISOString(), items: [{ id: 'A-1', title: 'a', state: 'todo' }] }))!
  const red = derivePlan(old, noEv({ claims: [{ id: 'QQ-02', mtimeMs: NOW - MIN }] }))
  expect(red.drift.level).toBe('red')
  expect(red.stale).toBe(true)
  expect(derivePlan(f, noEv()).drift.level).toBe('ok')
})

test('one view feeds the bar and the footer: the counts agree', () => {
  const f = file([{ id: 'A-1', title: 'a', state: 'done' }, { id: 'A-2', title: 'b', state: 'done' }, { id: 'A-3', title: 'c', state: 'running', owner: 'codex-1' }, { id: 'A-4', title: 'd', state: 'blocked', owner: 'jesse', note: 'ask' }])
  const v = derivePlan(f, noEv({ aliveNames: ['codex-1'], reports: [], claims: [] }))
  const shown = presentPlan(newTracker(), v, NOW)
  const band = planBand(shown)
  expect(band.count).toBe('2/4')
  expect(band.you).toBe(1)
  const line = planFooterLine(v, NOW, true)
  expect(line).toContain('plan 2/4')
  expect(line).toContain('running A-3')
  expect(line).toContain('1 blocked')
})

test('footer line narrows to fit: sync goes first, then the ids, and never the count', () => {
  const f = file([{ id: 'LONG-ITEM-ONE', title: 'a', state: 'running', owner: 'x' }, { id: 'LONG-ITEM-TWO', title: 'b', state: 'running', owner: 'x' }, { id: 'B-1', title: 'b', state: 'blocked', owner: 'jesse' }])
  const v = derivePlan(f, noEv({ aliveNames: ['x'] }))
  const wide = planFooterLine(v, NOW, true, 120)
  const mid = planFooterLine(v, NOW, true, 50)
  const tiny = planFooterLine(v, NOW, false, 14)
  expect(wide).toContain('LONG-ITEM-ONE, LONG-ITEM-TWO')
  expect(wide).toContain('synced')
  expect(mid.length).toBeLessThanOrEqual(50)
  expect(mid).toContain('plan 0/3')
  expect(tiny).toBe('○ plan 0/3'.length <= 14 ? '○ plan 0/3' : tiny)
  expect(tiny.length).toBeLessThanOrEqual(14)
})

test('motion: the first look animates nothing; a flip to done is held 3 s, then slides; running rises', () => {
  const tr = newTracker()
  const f1 = file([{ id: 'A-1', title: 'a', state: 'running', owner: 'x' }, { id: 'A-2', title: 'b', state: 'todo' }])
  const first = presentPlan(tr, derivePlan(f1, noEv({ aliveNames: ['x'] })), NOW)
  expect(first.motion.size).toBe(0)
  const f2 = file([{ id: 'A-1', title: 'a', state: 'done' }, { id: 'A-2', title: 'b', state: 'running', owner: 'x' }])
  const v2 = derivePlan(f2, noEv({ aliveNames: ['x'] }))
  const hold = presentPlan(tr, v2, NOW + 1000)
  expect(hold.running.map(r => r.id)).toEqual(['A-2', 'A-1'])
  expect(hold.done).toEqual([])
  expect(hold.motion.get('A-1')!.kind).toBe('hold')
  expect(hold.motion.get('A-2')!.kind).toBe('rise')
  expect(hold.ticked).toBe(true)
  // Same view again is idempotent: the change stays timed from the first sight.
  expect(presentPlan(tr, v2, NOW + 1000).motion.get('A-1')!.ageMs).toBe(0)
  const slide = presentPlan(tr, v2, NOW + 1000 + DONE_HOLD_MS + 100)
  expect(slide.motion.get('A-1')!.kind).toBe('slide')
  expect(slide.done.map(r => r.id)).toEqual(['A-1'])
  const settled = presentPlan(tr, v2, NOW + 1000 + DONE_HOLD_MS + 5000)
  expect(settled.motion.has('A-1')).toBe(false)
  expect(settled.ticked).toBe(false)
})

test('elapsedText', () => {
  expect(elapsedText(252_000)).toBe('04:12')
  expect(elapsedText(3_840_000)).toBe('1h04m')
  expect(elapsedText(null)).toBe('')
})

test('0.24.10: the footer line shows running ids, the last landing and the session count, not the bar numbers', async () => {
  const { footerLine } = await import('../hooks/plan.ts')
  const v = { running: [{ id: 'CHAT-01' }, { id: 'SEARCH-02' }], offRunning: [] } as never
  const line = footerLine(v, 10 * 60_000, { commit: { subject: 'Fix the thing', ms: 5 * 60_000 }, sessions: '1 session, 2 agents' }, 200)
  expect(line).toContain('running CHAT-01, SEARCH-02')
  expect(line).toContain('landed Fix the thing')
  expect(line).toContain('1 session, 2 agents')
  expect(line).not.toContain('plan ')
  expect(footerLine({ running: [], offRunning: [] } as never, 0, { commit: null, sessions: '' }, 200)).toBe('idle')
})
