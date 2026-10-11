// COCKPIT-66: the plan card drawing: sections, the live row, the held done row, blocked and gone, reduced motion, still mode.
import { expect, test } from 'bun:test'
import { derivePlan, newTracker, parsePlan, presentPlan } from '../hooks/plan.ts'
import type { PlanEvidence } from '../hooks/plan.ts'
import { planCardSvg } from '../hooks/plancard.ts'

const NOW = Date.parse('2026-10-10T21:00:00Z')
const MIN = 60_000
const ev = (o: Partial<PlanEvidence> = {}): PlanEvidence => ({ nowMs: NOW, members: [], claims: [], reports: [], blocked: [], landed: [], aliveNames: [], ...o })
const plan = (items: object[], updated = NOW - MIN) => parsePlan(JSON.stringify({ milestone: 'Ship the thing', updated: new Date(updated).toISOString(), items }))!
const ITEMS = [
  { id: 'A-1', title: 'First', state: 'done' },
  { id: 'A-2', title: 'Second', state: 'running', owner: 'codex-1', startedAt: new Date(NOW - 75_000).toISOString() },
  { id: 'A-3', title: 'Third', state: 'blocked', owner: 'jesse', note: 'Pick a model for the box' },
  { id: 'A-4', title: 'Fourth', state: 'todo' },
]
const draw = (items = ITEMS, o: { open?: boolean; motion?: boolean; alive?: string[]; updated?: number } = {}) => {
  const tr = newTracker()
  const view = derivePlan(plan(items, o.updated), ev({ aliveNames: o.alive ?? ['codex-1'], landed: [{ hash: 'f00', subject: 'ZZ-1: something unplanned', atMs: NOW - 30_000 }] }))
  return { view, ...planCardSvg(420, presentPlan(tr, view, NOW), { open: o.open ?? true, motion: o.motion ?? true, nowMs: NOW }) }
}

test('the card names the goal, the count, the sections and the exact ask on a blocked row', () => {
  const { svg } = draw()
  for (const w of ['Ship the thing', '1/4', 'RUNNING', 'BLOCKED', 'TODO', 'DONE', 'OFF PLAN', 'A-2', 'Pick a model for the box', 'waiting: you', '+1 off plan']) expect(svg).toContain(w)
})

test('a running row has the pulsing dot, the ripple, the scan line and a live mm:ss timer', () => {
  const { svg } = draw()
  expect(svg).toContain('pl-ring')
  expect(svg).toContain('pl-scan')
  expect(svg).toContain('pl-dot')
  expect(svg).toContain('01:15')
})

test('loops start at the phase the wall clock says, so a redraw does not restart them', () => {
  const a = planCardSvg(420, presentPlan(newTracker(), derivePlan(plan(ITEMS), ev({ aliveNames: ['codex-1'] })), NOW), { open: true, motion: true, nowMs: NOW + 400 }).svg
  const b = planCardSvg(420, presentPlan(newTracker(), derivePlan(plan(ITEMS), ev({ aliveNames: ['codex-1'] })), NOW), { open: true, motion: true, nowMs: NOW + 1400 }).svg
  expect(a).not.toBe(b)
  expect(/animation-delay:-[\d.]+s/.test(a)).toBe(true)
})

test('an owner that is gone turns the running row red and says so', () => {
  const { svg } = draw(ITEMS, { alive: [] })
  expect(svg).toContain('codex-1 gone')
  expect(svg).toContain('errc')
})

test('a stale plan shows the red synced chip and names the evidence', () => {
  const tr = newTracker()
  const view = derivePlan(plan(ITEMS, NOW - 45 * MIN), ev({ aliveNames: ['codex-1'], landed: [{ hash: 'abc', subject: 'ZZ-9: other', atMs: NOW - MIN }] }))
  const { svg } = planCardSvg(420, presentPlan(tr, view, NOW), { open: true, motion: true, nowMs: NOW })
  expect(view.drift.level).toBe('red')
  expect(svg).toContain('synced 45m ago')
  expect(svg).toContain('not on the plan')
})

test('a row that just flipped to done is held in RUNNING with the pop and the check, then slides into DONE', () => {
  const tr = newTracker()
  const before = derivePlan(plan(ITEMS), ev({ aliveNames: ['codex-1'] }))
  presentPlan(tr, before, NOW - 5000)
  const flipped = ITEMS.map(i => (i.id === 'A-2' ? { ...i, state: 'done' } : i))
  const held = planCardSvg(420, presentPlan(tr, derivePlan(plan(flipped), ev({ aliveNames: ['codex-1'] })), NOW), { open: true, motion: true, nowMs: NOW }).svg
  expect(held).toMatch(/class="pl-row[^"]*pl-hold/)
  expect(held).toContain('pl-chk')
  const later = NOW + 3200
  const slid = planCardSvg(420, presentPlan(tr, derivePlan(plan(flipped), ev({ aliveNames: ['codex-1'], nowMs: later })), later), { open: true, motion: true, nowMs: later }).svg
  expect(slid).toMatch(/class="pl-row[^"]*pl-slide/)
  expect(slid).not.toMatch(/class="pl-row[^"]*pl-hold/)
})

test('motion off draws the same card with no animation classes; the stylesheet also switches loops off for reduced motion', () => {
  const still = draw(ITEMS, { motion: false }).svg
  expect(still).not.toMatch(/class="[^"]*pl-(run|blk|hold|rise|slide)/)
  expect(still).toContain('prefers-reduced-motion: reduce')
  expect(still).toContain('A-2')
})

test('closed, TODO and DONE collapse to one line each; open lists every row', () => {
  const closed = draw(ITEMS, { open: false })
  const open = draw(ITEMS, { open: true })
  expect(closed.height).toBeLessThan(open.height)
  expect(closed.svg).toContain('A-4')
})

test('an empty plan says so, and ids and titles are escaped', () => {
  const empty = planCardSvg(420, presentPlan(newTracker(), derivePlan(plan([]), ev()), NOW), { open: true, motion: true, nowMs: NOW }).svg
  expect(empty).toContain('no items yet')
  const evil = draw([{ id: 'X-1', title: 'a <b> & "c"', state: 'todo' }]).svg
  expect(evil).toContain('&lt;b&gt;')
  expect(evil).not.toContain('NaN')
})

test('the svg stays inside its width at the narrowest pane', () => {
  const { svg } = draw(ITEMS)
  const narrow = planCardSvg(240, presentPlan(newTracker(), derivePlan(plan(ITEMS), ev({ aliveNames: ['codex-1'] })), NOW), { open: true, motion: true, nowMs: NOW }).svg
  expect(svg).toContain('width="420"')
  expect(narrow).toContain('width="240"')
})
