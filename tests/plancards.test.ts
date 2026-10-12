// 0.22.0: the plan area as a stack of cards, the question-mark and retry buttons, the colour rules and the list of what animates.
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { derivePlan, newTracker, parsePlan, presentPlan } from '../hooks/plan.ts'
import type { PlanEvidence } from '../hooks/plan.ts'
import { ACTION_ORDER, PLAN_CARDS, buildCards, moreFlag, stepFlag, toggledCard } from '../hooks/plancards.ts'
import { NO_OWNER, planCardSvg } from '../hooks/plancard.ts'
import { explainMessage, retryItem, retryMessage } from '../hooks/planedit.ts'
import { isSectionOpen } from '../hooks/panesections.ts'
import { waitingRowSvg } from '../hooks/waiting.ts'
import { progressSvg } from '../hooks/look.ts'

const NOW = Date.parse('2026-10-10T21:00:00Z')
const ISO = '2026-10-10T21:00:00.000Z'
const ev = (o: Partial<PlanEvidence> = {}): PlanEvidence => ({ nowMs: NOW, members: [], claims: [], reports: [], blocked: [], landed: [], aliveNames: [], ...o })
const steps = [
  { id: 'A-1', title: 'First', state: 'done' },
  { id: 'A-2', title: 'Second', state: 'running', owner: 'codex-1', startedAt: new Date(NOW - 75_000).toISOString() },
  { id: 'A-3', title: 'Third', state: 'blocked', owner: 'jesse', note: 'Pick a model for the box' },
  { id: 'A-4', title: 'Fourth', state: 'todo' },
  { id: 'A-5', title: 'Fifth', state: 'blocked', owner: 'codex-1', note: 'Waiting for the gate' },
]
const text = JSON.stringify({ plan: 'M', updated: ISO, milestones: [{ id: 'm1', title: 'One', steps }], history: [] })
const shown = (alive: string[] = ['codex-1']) => presentPlan(newTracker(), derivePlan(parsePlan(text, NOW)!, ev({ aliveNames: alive })), NOW)

test('the cards come in the declared order with every card but the title collapsed', () => {
  expect(PLAN_CARDS.map(c => c.id)).toEqual(['title', 'needs', 'milestone', 'off', 'system'])
  const cards = buildCards(shown(), {}, { youLines: [], systemText: 'Mac ok' })
  expect(cards.map(c => [c.def.id, c.open])).toEqual([['title', true], ['needs', false], ['milestone', false], ['off', false], ['system', false]])
})

test('a closed card lists no rows, and an open one lists them', () => {
  const by = (flags = {}) => Object.fromEntries(buildCards(shown(), flags, { youLines: [], systemText: '' }).map(c => [c.def.id, c]))
  expect(by().milestone!.entries).toEqual([])
  expect(by().needs!.count).toBe(1)
  expect(by({ 'pm-m1': true }).milestone!.entries.length).toBe(5)
  expect(by({ 'pm-m1': true }).milestone!.countText).toBe('1/5')
})

test('toggling one card changes only that card and the flag round-trips', () => {
  const a = toggledCard({}, 'milestone', 'm1')
  expect(isSectionOpen(a, 'pm-m1')).toBe(true)
  for (const id of ['pc-system', 'pc-needs', 'pc-off']) expect(isSectionOpen(a, id)).toBe(isSectionOpen({}, id))
  expect(isSectionOpen(toggledCard(a, 'milestone', 'm1'), 'pm-m1')).toBe(false)
  expect(toggledCard(a, 'title')).toEqual(a)
})

test('Waiting on you rows carry all four buttons in one fixed order; a bare YOU line only gets the question mark', () => {
  const c = buildCards(shown(), { 'pc-needs': true }, { youLines: ['Plug in the camera'], systemText: '' }).find(x => x.def.id === 'needs')!
  expect(c.entries.map(e => e.actions)).toEqual([[...ACTION_ORDER], ['explain']])
})

test('a step is collapsed until its own flag opens it; the second expand has its own flag', () => {
  const pick = (flags: Record<string, boolean>) => buildCards(shown(), flags, { youLines: [], systemText: '' }).find(x => x.def.id === 'milestone')!.entries
  const shut = pick({ 'pm-m1': true })
  expect(shut.every(e => e.kind === 'plan' && !e.expanded && e.actions.length === 0)).toBe(true)
  const open = pick({ 'pm-m1': true, 'ps-A-2': true })
  const e = open.find(x => x.kind === 'plan' && x.row.id === 'A-2')!
  expect(e.kind === 'plan' && e.expanded && e.actions).toEqual(['done', 'remove', 'explain', 'retry'])
  expect(e.kind === 'plan' && e.more).toBe(false)
  expect(isSectionOpen({}, stepFlag('A-2'))).toBe(false)
  expect(moreFlag('A-2')).toBe('pv-A-2')
})

test('the question-mark message asks for a plain explanation or AskUserQuestion, on one line', () => {
  const m = explainMessage('A-3', 'Third', 'Pick a model\nfor the box')
  expect(m).toContain('plain words')
  expect(m).toContain('AskUserQuestion')
  expect(m).toContain('A-3')
  expect(m).not.toContain('\n')
})

test('retry flips the item to todo, logs it, and touches no other item', () => {
  const out = JSON.parse(retryItem(text, 'a-3', ISO)!)
  const it = out.milestones[0].steps.find((i: { id: string }) => i.id === 'A-3')
  expect(it.state).toBe('todo')
  expect(it.owner).toBe('')
  expect(out.history.at(-1)).toMatchObject({ id: 'A-3', state: 'todo' })
  expect(out.milestones[0].steps.filter((i: { id: string }) => i.id !== 'A-3')).toEqual(JSON.parse(text).milestones[0].steps.filter((i: { id: string }) => i.id !== 'A-3'))
  expect(retryItem(text, 'NOPE', ISO)).toBeNull()
  expect(retryMessage('A-3', 'Third')).toBe('Re-dispatch plan item A-3 (Third): I set it back to todo, please send it out again and update the plan.')
})

test('colour rules: owner gone is grey, never red; waiting on you is amber; blocked on a fault is orange; running is blue', () => {
  const gonesh = shown([])
  const g = planCardSvg(420, gonesh, { open: true, motion: true, nowMs: NOW }, { row: gonesh.view.groups[0]!.rows.find(r => r.id === 'A-2')! }).svg
  expect(g).toContain(NO_OWNER)
  expect(g).not.toMatch(/class="[^"]*errc/)
  const sh = shown()
  const rowOf = (id: string) => sh.view.groups[0]!.rows.find(r => r.id === id)!
  const strip = (x: string) => x.replace(/<style>[\s\S]*?<\/style>/g, '')
  const blocked = planCardSvg(420, sh, { open: true, motion: true, nowMs: NOW }, { row: rowOf('A-5') }).svg
  expect(blocked).toContain('stuckc')
  expect(strip(blocked)).not.toMatch(/pl-run|animation/)
  const waiting = strip(planCardSvg(420, sh, { open: true, motion: true, nowMs: NOW }, { row: rowOf('A-3') }).svg)
  expect(waiting).toContain('warnc')
  expect(waiting).not.toMatch(/class="[^"]*(errc|stuckc|runc)/)
  const run = strip(planCardSvg(420, sh, { open: true, motion: true, nowMs: NOW }, { row: rowOf('A-2') }).svg)
  expect(run).toContain('runc')
  expect(run).not.toMatch(/class="[^"]*errc/)
  const ask = waitingRowSvg(420, { id: 'A-3', title: 'Third', ask: 'Pick', tag: 'A-3' }).svg
  expect(ask).toMatch(/class="warnc/)
  expect(ask).not.toMatch(/class="[^"]*infoc/)
})

// The inventory of what animates. A blink or pulse means "needs Jesse now": only a Needs me row does it. Running work never uses an on/off loop.
test('animation inventory: only Needs me blinks; running and activity never use an on/off opacity loop', () => {
  const sh0 = shown()
  const running = planCardSvg(420, sh0, { open: true, motion: true, nowMs: NOW }, { row: sh0.view.groups[0]!.rows.find(r => r.id === 'A-2')! }).svg
  expect(running).toContain('pl-run')
  expect(running).not.toMatch(/@keyframes (plp|ple|plr)/)
  expect(waitingRowSvg(420, { id: 'A-3', title: 'Third', ask: '', tag: 'A-3' }).svg).toContain('@keyframes nmp')
  const prog = progressSvg(520, { title: 't', ratio: 0.5, count: '3/6', now: 'x', isWorking: true, grewFrom: null })
  expect(prog).toContain('@keyframes pgs')
  expect(prog).not.toContain('@keyframes pge')
  const draw = readFileSync(new URL('../hooks/draw.ts', import.meta.url), 'utf8')
  expect(draw).not.toMatch(/\.live\{animation|@keyframes (p|tw)\{|\.ant\{animation:blink/)
})
