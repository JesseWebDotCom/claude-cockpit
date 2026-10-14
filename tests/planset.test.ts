// COCKPIT-66: tools/plan-set patches one item atomically and stamps `updated`.
import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TOOL = join(import.meta.dir, '..', 'tools', 'plan-set')
const run = (file: string, ...args: string[]) => {
  const p = Bun.spawnSync(['python3', '-I', TOOL, '--file', file, ...args], { stderr: 'pipe', stdout: 'pipe' })
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() }
}
const dir = (): string => mkdtempSync(join(tmpdir(), 'planset-'))

test('plan-set: sets state and owner, stamps startedAt/doneAt and updated, keeps other keys', () => {
  const f = join(dir(), 'plan.json')
  writeFileSync(f, JSON.stringify({ milestone: 'M', custom: 7, items: [{ id: 'KS-02E', title: 'Dates', state: 'todo' }, { id: 'B-1', title: 'Other', state: 'todo' }] }))
  expect(run(f, 'ks-02e', 'running', 'codex-1').code).toBe(0)
  let d = JSON.parse(readFileSync(f, 'utf8'))
  expect(d.custom).toBe(7)
  expect(d.items[0]).toMatchObject({ id: 'KS-02E', state: 'running', owner: 'codex-1' })
  expect(typeof d.items[0].startedAt).toBe('string')
  expect(d.items[1].state).toBe('todo')
  expect(typeof d.updated).toBe('string')
  expect(run(f, 'KS-02E', 'done', '--say', 'date lines landed', '--note', 'ok').code).toBe(0)
  d = JSON.parse(readFileSync(f, 'utf8'))
  expect(d.items[0].state).toBe('done')
  expect(typeof d.items[0].doneAt).toBe('string')
  expect(d.items[0].note).toBe('ok')
  expect(d.history.at(-1)).toMatchObject({ id: 'KS-02E', state: 'done', say: 'date lines landed' })
  expect(existsSync(f + '.tmp')).toBe(false)
})

test('plan-set: an id that is not on the plan needs --add; --add --off-plan marks it unplanned', () => {
  const f = join(dir(), 'plan.json')
  writeFileSync(f, JSON.stringify({ items: [] }))
  const miss = run(f, 'NEW-1', 'todo')
  expect(miss.code).toBe(1)
  expect(miss.err).toContain('--add')
  expect(run(f, 'NEW-1', 'todo', '--add', 'A new thing').code).toBe(0)
  expect(run(f, 'NEW-2', 'running', 'x', '--add', 'Surprise', '--off-plan').code).toBe(0)
  const d = JSON.parse(readFileSync(f, 'utf8'))
  expect(d.items.map((i: { id: string }) => i.id)).toEqual(['NEW-1', 'NEW-2'])
  expect(d.items[1].planned).toBe(false)
})

test('plan-set: a bad state, a corrupt file or a missing value is refused and the file is untouched', () => {
  const f = join(dir(), 'plan.json')
  writeFileSync(f, '{nope')
  expect(run(f, 'A-1', 'running').code).toBe(1)
  expect(readFileSync(f, 'utf8')).toBe('{nope')
  expect(run(f, 'A-1', 'flying').code).toBe(2)
  expect(run(f, 'A-1', 'done', '--note').code).toBe(2)
})

test('plan-set: a missing file is created', () => {
  const f = join(dir(), 'sub', 'plan.json')
  expect(run(f, 'A-1', 'todo', '--add', 'First').code).toBe(0)
  expect(JSON.parse(readFileSync(f, 'utf8')).items[0].title).toBe('First')
})


test('plan-set retitles an existing off-plan row with --title', () => {
  const f = join(dir(), 'plan.json')
  writeFileSync(f, JSON.stringify({ milestones: [], offPlan: [{ id: 'AGENT-A1', title: 'Untitled: Inspect parser', planned: false, state: 'running' }] }))
  const r = run(f, 'AGENT-A1', 'running', '--title', 'Inspect parser')
  expect(r.code).toBe(0)
  expect(JSON.parse(readFileSync(f, 'utf8')).offPlan[0].title).toBe('Inspect parser')
})

test('plan-set attaches an off-plan row to the requested milestone', () => {
  const f = join(dir(), 'plan.json')
  writeFileSync(f, JSON.stringify({ milestones: [{ id: 'docs', title: 'Docs', steps: [] }], offPlan: [{ id: 'AGENT-A1', title: 'Inspect parser', planned: false, state: 'running' }] }))
  const r = run(f, 'AGENT-A1', 'running', '--milestone', 'docs')
  expect(r.code).toBe(0)
  const data = JSON.parse(readFileSync(f, 'utf8'))
  expect(data.offPlan).toEqual([])
  expect(data.milestones[0].steps[0].id).toBe('AGENT-A1')
})
