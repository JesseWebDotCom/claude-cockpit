// COCKPIT-TREE-01: the plan as a tree (plan > milestones > steps): old-shape conversion, counts from the steps, collapse defaults, multi-agent steps,
// the tiny workers (every kind, reduced motion), the wording warnings of plan-set, and the colour tokens living in one place.
import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { STEP_KINDS, derivePlan, guessKind, newTracker, parsePlan, planBand, planFooterLine, presentPlan } from '../hooks/plan.ts'
import type { PlanEvidence, StepKind } from '../hooks/plan.ts'
import { buildCards, cardHeadSvg } from '../hooks/plancards.ts'
import { planCardSvg } from '../hooks/plancard.ts'
import { markItemDone, removeItem, restoreItem, retryItem } from '../hooks/planedit.ts'
import { parseSections } from '../hooks/panesections.ts'
import { WORKER_CSS, workerBody, workerMarker, workersLine } from '../hooks/workers.ts'
import { SPRITE_FRAMES } from '../hooks/workersprites.ts'
import { activityOf } from '../hooks/plancards.ts'

const NOW = Date.parse('2026-10-12T12:00:00Z')
const ISO = new Date(NOW - 60_000).toISOString()
const ev = (o: Partial<PlanEvidence> = {}): PlanEvidence => ({ nowMs: NOW, members: [], claims: [], reports: [], blocked: [], landed: [], aliveNames: [], ...o })
const step = (id: string, state: string, extra: object = {}) => ({ id, title: 'Step ' + id, state, ...extra })
// 2 milestones x 5 steps with 7 done: milestone one is 5/5, milestone two is 2/5.
const TREE = {
  plan: 'Ship the tree',
  updated: ISO,
  milestones: [
    { id: 'build', title: 'Build it', steps: ['a1', 'a2', 'a3', 'a4', 'a5'].map(i => step(i, 'done')) },
    { id: 'polish', title: 'Polish it', steps: [step('b1', 'done'), step('b2', 'done'), step('b3', 'running', { owner: 'codex-1', agents: ['reika', 'codex-1'], kind: 'bench' }), step('b4', 'blocked', { owner: 'jesse', note: 'Pick a name' }), step('b5', 'todo')] },
  ],
  offPlan: [step('x1', 'running', { owner: 'reika' })],
  history: [],
}
const text = JSON.stringify(TREE)
const view = (t = text, alive = ['codex-1', 'reika']) => derivePlan(parsePlan(t, NOW)!, ev({ aliveNames: alive }))
const shown = (t = text) => presentPlan(newTracker(), view(t), NOW)

test('counts come from the steps: 7 of 10 done, milestones 5/5 and 2/5, the off-plan step is not counted', () => {
  const v = view()
  expect(v.doneN + '/' + v.planned).toBe('7/10')
  expect(v.groups.map(g => g.done + '/' + g.total)).toEqual(['5/5', '2/5'])
  expect(v.groups.map(g => g.state)).toEqual(['done', 'active'])
  expect(v.off.map(r => r.id)).toEqual(['x1'])
})

test('an old flat file converts on read: the items go into one default milestone, the old milestone string is the plan name', () => {
  const old = JSON.stringify({ milestone: 'Old goal', updated: ISO, items: [step('o1', 'done'), step('o2', 'todo'), { ...step('o3', 'todo'), planned: false }] })
  const f = parsePlan(old, NOW)!
  expect(f.milestone).toBe('Old goal')
  expect(f.milestones.length).toBe(1)
  const v = derivePlan(f, ev())
  expect(v.groups.length).toBe(1)
  expect(v.groups[0]!.rows.map(r => r.id)).toEqual(['o1', 'o2'])
  expect(v.doneN + '/' + v.planned).toBe('1/2')
  expect(v.off.map(r => r.id)).toEqual(['o3'])
})

test('collapse defaults: every card but the title is closed, and each title still carries its count', () => {
  const cards = buildCards(shown(), {}, { youLines: [], systemText: '' })
  expect(cards.map(c => [c.def.id, c.open])).toEqual([['title', true], ['system', false], ['needs', false], ['milestone', false], ['milestone', false], ['off', false]])
  expect(cards.filter(c => c.def.id === 'milestone').map(c => c.title + ' ' + c.countText)).toEqual(['Build it 5/5', 'Polish it 2/5'])
  expect(cards.find(c => c.def.id === 'needs')!.count).toBe(1)
  expect(cards.find(c => c.def.id === 'off')!.count).toBe(1)
  expect(cards.every(c => c.def.id === 'title' || c.entries.length === 0)).toBe(true)
  const head = cardHeadSvg(420, cards.find(c => c.def.id === 'needs')!.def, 1, false).svg
  expect(head).toContain('WAITING ON YOU')
  const off = cardHeadSvg(420, cards.find(c => c.def.id === 'off')!.def, 1, false).svg
  expect(off).toContain('OFF PLAN')
})

test('opening one milestone lists only its steps, and a step opens by its own flag', () => {
  const cards = buildCards(shown(), { 'pm-polish': true }, { youLines: [], systemText: '' })
  const polish = cards.find(c => c.group?.id === 'polish')!
  expect(polish.entries.length).toBe(5)
  expect(cards.find(c => c.group?.id === 'build')!.entries).toEqual([])
  expect(cards.find(c => c.def.id === 'off')!.entries).toEqual([])
})

test('the top bar, the footer line and the head show the same 7/10', () => {
  const sh = shown()
  expect(planBand(sh).count).toBe('7/10')
  expect(planFooterLine(sh.view, NOW, true)).toContain('plan 7/10')
  expect(planCardSvg(420, sh, { open: false, motion: true, nowMs: NOW }, { head: true }).svg).toContain('Plan 7/10')
})

test('a multi-agent step lists every agent and draws one worker per agent on one line', () => {
  const sh = shown()
  const r = sh.view.groups[1]!.rows.find(x => x.id === 'b3')!
  expect([...r.agents].sort()).toEqual(['codex-1', 'reika'])
  const svg = planCardSvg(420, sh, { open: false, motion: true, nowMs: NOW }, { row: r }).svg
  expect(svg).toContain('codex-1')
  expect(svg).toContain('reika')
  expect((svg.match(/class="wk[" ]/g) ?? []).length).toBe(1)
  expect((svg.match(/<g transform="translate\(/g) ?? []).length).toBe(2)
  expect(svg).toContain('wf f0')
})

test('the kind comes from the file, else the title words, else other', () => {
  expect(guessKind('Benchmark the search')).toBe('bench')
  expect(guessKind('Review the diff')).toBe('review')
  expect(guessKind('Run the tests')).toBe('test')
  expect(guessKind('Write the guide')).toBe('docs')
  expect(guessKind('Research options')).toBe('research')
  expect(guessKind('Build the panel')).toBe('code')
  expect(guessKind('Something vague')).toBe('other')
  const v = view(JSON.stringify({ ...TREE, milestones: [{ id: 'm', title: 'M', steps: [step('k1', 'running', { owner: 'codex-1', kind: 'review' }), { id: 'k2', title: 'Run the tests', state: 'todo' }] }] }))
  expect(v.groups[0]!.rows.map(r => r.kind)).toEqual(['review', 'test'])
})

test('every worker kind draws, and a waiting step gets the raised hand in amber', () => {
  const tone = (k: StepKind) => workersLine(k, ['codex-1'], 'run', 0, 0, 200, { motion: true, nowMs: NOW }).svg
  for (const k of STEP_KINDS) {
    const svg = tone(k)
    expect(svg).toContain('runs')
    expect(svg).not.toMatch(/errc|errs|#F85149|#cf222e/)
    expect(workerBody(k, 'runs', 'runc').length).toBeGreaterThan(40)
  }
  // Every kind is a different cast member: the frame stacks differ, and each has 2 to 4 frames stepped by CSS.
  const bodies = new Set(STEP_KINDS.map(k => workerBody(k, 'runs', 'runc')))
  expect(bodies.size).toBe(STEP_KINDS.length)
  for (const k of STEP_KINDS) expect(SPRITE_FRAMES[k].length).toBeGreaterThanOrEqual(2)
  expect(SPRITE_FRAMES.research.length).toBeLessThanOrEqual(4)
  expect(workersLine('wait', ['you'], 'warn', 0, 0, 200, { motion: true, nowMs: NOW }).svg).toContain('warns')
})

test('workers hold still with motion off and under reduced motion; the phase is the wall clock', () => {
  expect(workersLine('code', ['a'], 'run', 0, 0, 200, { motion: false, nowMs: NOW }).svg).toContain('wk-still')
  expect(workersLine('code', ['a'], 'run', 0, 0, 200, { motion: true, nowMs: NOW }).svg).not.toContain('wk-still')
  expect(WORKER_CSS).toContain('prefers-reduced-motion: reduce')
  expect(WORKER_CSS).not.toMatch(/setInterval|setTimeout/)
  const a = workersLine('code', ['a'], 'run', 0, 0, 200, { motion: true, nowMs: NOW }).svg
  const b = workersLine('code', ['a'], 'run', 0, 0, 200, { motion: true, nowMs: NOW + 1500 }).svg
  expect(a).not.toBe(b)
})

test('workers show only on running steps (and the waiting hand): done, todo and a stuck step stay still', () => {
  const sh = shown(JSON.stringify({ ...TREE, milestones: [{ id: 'm', title: 'M', steps: [step('d', 'done', { owner: 'x' }), step('t', 'todo'), step('s', 'blocked', { owner: 'codex-1' })] }] }))
  for (const r of sh.view.groups[0]!.rows) expect(planCardSvg(420, sh, { open: false, motion: true, nowMs: NOW }, { row: r }).svg).not.toMatch(/class="wk[" ]/)
})

test('too many workers for the line end in a +n', () => {
  const names = ['alpha-agent', 'bravo-agent', 'charlie-agent', 'delta-agent', 'echo-agent']
  const line = workersLine('code', names, 'run', 0, 0, 120, { motion: true, nowMs: NOW })
  expect(line.svg).toMatch(/\+\d/)
  expect(line.width).toBeLessThanOrEqual(120)
})

test('colours live in tokens.ts only: the plan drawings never hold a hex colour', () => {
  for (const f of ['plancard.ts', 'plancards.ts', 'workers.ts', 'waiting.ts']) {
    const src = readFileSync(new URL('../hooks/' + f, import.meta.url), 'utf8')
    const hex = src.split('\n').filter(l => /#[0-9a-fA-F]{6}\b/.test(l) && !/^\s*\/\//.test(l))
    // The only literals allowed are the check mark ink and the bar sweep highlight.
    expect(hex.filter(l => !/stroke="#0b0b0b"|fill="#ffffff"/.test(l))).toEqual([])
  }
})

test('the saved flags keep the tree keys (pm-, ps-, pv-) and drop anything else', () => {
  expect(parseSections({ 'pm-build': true, 'ps-A-1': false, 'pv-A-1': true, 'pc-needs': true, junk: true, 'pm-': true })).toEqual({ 'pm-build': true, 'ps-A-1': false, 'pv-A-1': true, 'pc-needs': true })
})

test('panel edits find a step inside a milestone or in offPlan and put it back where it was', () => {
  const iso = '2026-10-12T12:00:00.000Z'
  const done = JSON.parse(markItemDone(text, 'b5', iso)!)
  expect(done.milestones[1].steps[4].state).toBe('done')
  const r = removeItem(text, 'x1', iso)!
  expect(JSON.parse(r.text).offPlan).toEqual([])
  const back = JSON.parse(restoreItem(r.text, r.removed, iso)!)
  expect(back.offPlan[0].id).toBe('x1')
  const rm = removeItem(text, 'b2', iso)!
  expect(JSON.parse(rm.text).milestones[1].steps.length).toBe(4)
  expect(JSON.parse(restoreItem(rm.text, rm.removed, iso)!).milestones[1].steps[1].id).toBe('b2')
  expect(JSON.parse(retryItem(text, 'b4', iso)!).milestones[1].steps[3]).toMatchObject({ state: 'todo', owner: '' })
  expect(markItemDone(text, 'nope', iso)).toBeNull()
})

// ---- plan-set

const TOOL = join(import.meta.dir, '..', 'tools', 'plan-set')
const run = (file: string, ...args: string[]) => {
  const p = Bun.spawnSync(['python3', '-I', TOOL, '--file', file, ...args], { stderr: 'pipe', stdout: 'pipe' })
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() }
}
const tmp = (): string => join(mkdtempSync(join(tmpdir(), 'plantree-')), 'plan.json')

test('plan-set builds the tree: --add-milestone, --milestone, --kind, --agents, --plan; counts are never typed', () => {
  const f = tmp()
  expect(run(f, '--plan', 'Ship the tree').code).toBe(0)
  expect(run(f, '--add-milestone', 'Build it', '--milestone', 'build').code).toBe(0)
  expect(run(f, 'S-1', 'running', 'codex-1', '--add', 'Write the panel', '--milestone', 'build', '--kind', 'code', '--agents', 'reika').code).toBe(0)
  expect(run(f, 'S-2', 'todo', '--add', 'Tidy up').code).toBe(0)
  expect(run(f, 'O-1', 'running', '--add', 'Stray task', '--off-plan').code).toBe(0)
  const d = JSON.parse(readFileSync(f, 'utf8'))
  expect(d.plan).toBe('Ship the tree')
  expect(d.milestones[0]).toMatchObject({ id: 'build', title: 'Build it' })
  expect(d.milestones[0].steps[0]).toMatchObject({ id: 'S-1', state: 'running', owner: 'codex-1', kind: 'code', agents: ['codex-1', 'reika'] })
  expect(d.milestones[0].steps[1].id).toBe('S-2')
  expect(d.offPlan[0]).toMatchObject({ id: 'O-1', planned: false })
  expect(JSON.stringify(d)).not.toMatch(/"(count|done|total)"/)
  const v = derivePlan(parsePlan(readFileSync(f, 'utf8'), NOW)!, ev())
  expect(v.doneN + '/' + v.planned).toBe('0/2')
})

test('plan-set keeps an old flat file flat until a milestone option is used, then converts it without losing a step', () => {
  const f = tmp()
  writeFileSync(f, JSON.stringify({ milestone: 'Old', custom: 3, items: [{ id: 'A-1', title: 'One', state: 'todo' }, { id: 'A-2', title: 'Stray', state: 'running', planned: false }] }))
  expect(run(f, 'A-1', 'done').code).toBe(0)
  let d = JSON.parse(readFileSync(f, 'utf8'))
  expect(d.items[0].state).toBe('done')
  expect(d.milestones).toBeUndefined()
  expect(run(f, '--add-milestone', 'Next part').code).toBe(0)
  d = JSON.parse(readFileSync(f, 'utf8'))
  expect(d.items).toBeUndefined()
  expect(d.plan).toBe('Old')
  expect(d.custom).toBe(3)
  expect(d.milestones.map((m: { id: string }) => m.id)).toEqual(['main', 'next-part'])
  expect(d.milestones[0].steps[0]).toMatchObject({ id: 'A-1', state: 'done' })
  expect(d.offPlan[0].id).toBe('A-2')
})

test('plan-set warns over the wording limits, exits 0 and refuses nothing', () => {
  const f = tmp()
  const long = run(f, 'W-1', 'todo', '--add', 'A very long step name that goes on and on and on', '--note', 'x'.repeat(130))
  expect(long.code).toBe(0)
  expect(long.err).toContain('step name')
  expect(long.err).toContain('note is 130 characters')
  expect(JSON.parse(readFileSync(f, 'utf8')).items[0].note.length).toBe(130)
  const id = run(f, 'W-2', 'todo', '--add', 'COCKPIT-TREE-01')
  expect(id.err).toContain('bare id')
  const path = run(f, 'W-3', 'todo', '--add', 'Fix hooks/plan.ts')
  expect(path.err).toContain('file path')
  const kind = run(f, 'W-1', 'running', '--kind', 'dancing')
  expect(kind.code).toBe(0)
  expect(kind.err).toContain('kind dancing')
  expect(run(f, 'W-4', 'todo', '--add', 'Short and clear').err).toBe('')
})

test('the skill text shows the wording limits and the plan-set options', () => {
  const skill = readFileSync(new URL('../skills/cockpit-plan/SKILL.md', import.meta.url), 'utf8')
  for (const w of ['5 words', '40 characters', '100 characters', '--milestone', '--add-milestone', '--kind', 'Plan 7/10']) expect(skill).toContain(w)
})

test('sprites are crisp pixel rectangles, stepped by CSS with a still first frame under reduced motion', () => {
  expect(WORKER_CSS).toContain('step-end')
  expect(workerBody('code', 'runs', 'runc')).toContain('<rect')
  expect(workerBody('code', 'runs', 'runc')).not.toContain('<image')
})

test('the Kenney sprite source is recorded as CC0 in NOTICE', async () => {
  const notice = await Bun.file(new URL('../NOTICE', import.meta.url)).text()
  expect(notice).toContain('Tiny Dungeon')
  expect(notice).toContain('CC0')
  expect(notice).toContain('kenney.nl')
  expect(await Bun.file(new URL('../assets/workers/tiny-dungeon-tilemap.png', import.meta.url)).exists()).toBe(true)
})

test('a collapsed card with something active inside shows one small worker; open or idle shows none; waiting is amber, never red', () => {
  const m = workerMarker('code', 'run', 0, 0, { motion: true, nowMs: NOW })
  expect(m.svg).toContain('wk-marker')
  expect(workerMarker('wait', 'warn', 0, 0, { motion: false, nowMs: NOW }).svg).toContain('wk-still')
  const sh = shown(JSON.stringify({ ...TREE, milestones: [{ id: 'm', title: 'M', steps: [step('r', 'running', { owner: 'codex-1', kind: 'code' })] }, { id: 'n', title: 'N', steps: [step('d', 'done', { owner: 'x' })] }] }))
  const cards = buildCards(sh, {}, { youLines: [], systemText: '' })
  const ms = cards.filter(c => c.def.id === 'milestone')
  expect(ms[0]!.active).toEqual({ kind: 'code', tone: 'run' })
  expect(ms[1]!.active).toBeUndefined()
  const head = (c: (typeof ms)[number], open: boolean) => cardHeadSvg(420, c.def, c.count, false, { title: c.title, countText: c.countText, active: c.active, open, motion: true, nowMs: NOW }).svg
  expect(head(ms[0]!, false)).toContain('wk-marker')
  expect(head(ms[0]!, true)).not.toContain('wk-marker')
  expect(head(ms[1]!, false)).not.toContain('wk-marker')
  expect(activityOf([])).toBeNull()
})
