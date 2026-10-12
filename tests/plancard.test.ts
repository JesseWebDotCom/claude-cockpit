// COCKPIT-66, reworked for COCKPIT-TREE-01: the plan head ("Plan 7/10") and the drawing of one step: the live step, the held done step, waiting, blocked,
// gone owner, reduced motion, still mode, the detail line and the second expand.
import { expect, test } from 'bun:test'
import { derivePlan, newTracker, parsePlan, presentPlan } from '../hooks/plan.ts'
import type { PlanEvidence, PlanRow } from '../hooks/plan.ts'
import { DETAIL_MAX, NO_OWNER, planCardSvg, stepDetail } from '../hooks/plancard.ts'

const NOW = Date.parse('2026-10-10T21:00:00Z')
const MIN = 60_000
const ev = (o: Partial<PlanEvidence> = {}): PlanEvidence => ({ nowMs: NOW, members: [], claims: [], reports: [], blocked: [], landed: [], aliveNames: [], ...o })
const plan = (steps: object[], updated = NOW - MIN) =>
  parsePlan(JSON.stringify({ plan: 'Ship the thing', updated: new Date(updated).toISOString(), milestones: [{ id: 'm1', title: 'First part', steps }], history: [] }))!
const STEPS = [
  { id: 'A-1', title: 'First', state: 'done' },
  { id: 'A-2', title: 'Second', state: 'running', owner: 'codex-1', agents: ['reika'], startedAt: new Date(NOW - 75_000).toISOString(), note: 'Writing the first draft' },
  { id: 'A-3', title: 'Third', state: 'blocked', owner: 'jesse', note: 'Pick a model for the box' },
  { id: 'A-4', title: 'Fourth', state: 'todo' },
]
const shown = (steps = STEPS, o: { alive?: string[]; updated?: number } = {}) =>
  presentPlan(newTracker(), derivePlan(plan(steps, o.updated), ev({ aliveNames: o.alive ?? ['codex-1', 'reika'], landed: [{ hash: 'f00', subject: 'ZZ-1: something unplanned', atMs: NOW - 30_000 }] })), NOW)
const head = (steps = STEPS, o: { motion?: boolean; updated?: number } = {}) => planCardSvg(420, shown(steps, o), { open: false, motion: o.motion ?? true, nowMs: NOW }, { head: true })
const row = (id: string, o: { open?: boolean; more?: boolean; motion?: boolean; alive?: string[]; steps?: object[] } = {}) => {
  const sh = shown(o.steps ?? STEPS, { alive: o.alive })
  const r = sh.view.groups.flatMap(g => g.rows).find(x => x.id === id) as PlanRow
  return planCardSvg(420, sh, { open: o.open ?? false, more: o.more, motion: o.motion ?? true, nowMs: NOW }, { row: r })
}

test('the head names the plan, counts from the steps, and tags the off-plan count', () => {
  const { svg } = head()
  for (const w of ['Ship the thing', 'Plan 1/4', '+1 off plan']) expect(svg).toContain(w)
})

test('a running step has a blue dot (never red, never green), the scan line and a live mm:ss timer', () => {
  const { svg } = row('A-2')
  expect(svg).toContain('pl-scan')
  expect(svg).toContain('runc pl-dot')
  expect(svg).toContain('01:15')
  expect(svg).not.toMatch(/class="[^"]*errc/)
})

test('a collapsed step shows its title and agents, and no detail line or id', () => {
  const { svg } = row('A-2')
  expect(svg).toContain('Second')
  expect(svg).toContain('codex-1')
  expect(svg).toContain('reika')
  expect(svg).not.toContain('Writing the first draft')
  expect(svg).not.toContain('>A-2<')
})

test('an expanded step adds the one detail line and the id', () => {
  const { svg } = row('A-2', { open: true })
  expect(svg).toContain('Writing the first draft')
  expect(svg).toContain('>A-2<')
  expect(row('A-2', { open: true }).height).toBeGreaterThan(row('A-2').height)
})

test('a long note is cut to one short line, and the second expand shows all of it', () => {
  const long = 'This is a long note. '.repeat(12).trim()
  const steps = [{ id: 'L-1', title: 'Long note step', state: 'todo', note: long }]
  const sh = shown(steps)
  const r = sh.view.groups[0]!.rows[0]!
  const d = stepDetail(r)
  expect(d.short.length).toBeLessThanOrEqual(DETAIL_MAX + 1)
  expect(d.hasMore).toBe(true)
  const one = planCardSvg(420, sh, { open: true, motion: true, nowMs: NOW }, { row: r })
  const two = planCardSvg(420, sh, { open: true, more: true, motion: true, nowMs: NOW }, { row: r })
  expect(two.height).toBeGreaterThan(one.height)
})

test('a step waiting on Jesse is amber with a raised hand, a stuck step is orange', () => {
  const w = row('A-3').svg
  expect(w).toContain('warnc')
  expect(w).toContain('wk-wave')
  const stuck = row('A-5', { steps: [{ id: 'A-5', title: 'Stuck step', state: 'blocked', owner: 'codex-1', note: 'The gate fails' }] }).svg
  expect(stuck).toContain('stuckc')
  expect(stuck).not.toMatch(/class="[^"]*errc/)
})

test('loops start at the phase the wall clock says, so a redraw does not restart them', () => {
  const sh = shown()
  const r = sh.view.groups[0]!.rows.find(x => x.id === 'A-2')!
  const a = planCardSvg(420, sh, { open: false, motion: true, nowMs: NOW + 400 }, { row: r }).svg
  const b = planCardSvg(420, sh, { open: false, motion: true, nowMs: NOW + 1400 }, { row: r }).svg
  expect(a).not.toBe(b)
  expect(/animation-delay:-[\d.]+s/.test(a)).toBe(true)
  expect(/--wd:-[\d.]+s/.test(a)).toBe(true)
})

test('an owner that is gone is a quiet grey "no live owner" label, never red, and no worker is drawn', () => {
  const { svg } = row('A-2', { alive: [] })
  expect(svg).toContain(NO_OWNER)
  expect(svg).not.toMatch(/class="[^"]*errc/)
  expect(svg).not.toContain('class="wk')
})

test('a stale plan shows the synced chip and names the evidence on the head', () => {
  const sh = shown(STEPS, { updated: NOW - 45 * MIN })
  const { svg } = planCardSvg(420, sh, { open: false, motion: true, nowMs: NOW }, { head: true })
  expect(sh.view.drift.level).toBe('red')
  expect(svg).toContain('synced 45m ago')
  expect(svg).toContain('not on the plan')
})

test('a step that just flipped to done is held with the pop and the check, then slides on', () => {
  const tr = newTracker()
  presentPlan(tr, derivePlan(plan(STEPS), ev({ aliveNames: ['codex-1'] })), NOW - 5000)
  const flipped = STEPS.map(i => (i.id === 'A-2' ? { ...i, state: 'done' } : i))
  const sh = presentPlan(tr, derivePlan(plan(flipped), ev({ aliveNames: ['codex-1'] })), NOW)
  const r = sh.view.groups[0]!.rows.find(x => x.id === 'A-2')!
  const held = planCardSvg(420, sh, { open: false, motion: true, nowMs: NOW }, { row: r }).svg
  expect(held).toMatch(/class="pl-row[^"]*pl-hold/)
  expect(held).toContain('pl-chk')
})

test('motion off draws the same step with no animation classes; the stylesheet also switches loops off for reduced motion', () => {
  const still = row('A-2', { motion: false }).svg
  expect(still).not.toMatch(/class="[^"]*pl-(run|hold|rise)/)
  expect(still).toContain('wk-still')
  expect(still).toContain('prefers-reduced-motion: reduce')
  expect(still).toContain('Second')
})

test('an empty plan says so, and ids and titles are escaped', () => {
  const empty = planCardSvg(420, presentPlan(newTracker(), derivePlan(plan([]), ev()), NOW), { open: false, motion: true, nowMs: NOW }, { head: true }).svg
  expect(empty).toContain('no steps yet')
  const evil = row('X-1', { steps: [{ id: 'X-1', title: 'a <b> & "c"', state: 'todo' }] }).svg
  expect(evil).toContain('&lt;b&gt;')
  expect(evil).not.toContain('NaN')
})

test('the svg stays inside its width at the narrowest pane', () => {
  const sh = shown()
  const narrow = planCardSvg(240, sh, { open: true, motion: true, nowMs: NOW }, { row: sh.view.groups[0]!.rows[1]! }).svg
  expect(narrow).toContain('width="240"')
})
