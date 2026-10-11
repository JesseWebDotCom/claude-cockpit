// COCKPIT-67/68: the Waiting on me section and its two actions, plain titles, running work and the Local model line.
import { expect, test } from 'bun:test'
import { derivePlan, isCrypticTitle, parsePlan, plainTitle } from '../hooks/plan.ts'
import type { PlanEvidence, PlanRow } from '../hooks/plan.ts'
import { markItemDone, removeItem, restoreItem } from '../hooks/planedit.ts'
import { WAITING_EMPTY, waitingEmptySvg, waitingItems, waitingRowSvg } from '../hooks/waiting.ts'
import { localModelLine, localModelSvg, parseLocalModel, runningItems, runningRowSvg } from '../hooks/running.ts'

const NOW = Date.parse('2026-10-10T21:00:00Z')
const ISO = '2026-10-10T21:00:00.000Z'
const ev: PlanEvidence = { nowMs: NOW, members: [], claims: [], reports: [], blocked: [], landed: [], aliveNames: ['codex'] }
const text = JSON.stringify({
  milestone: 'M', updated: '2026-10-10T20:00:00Z',
  items: [
    { id: 'A-1', title: 'Ship the thing', state: 'blocked', owner: 'jesse', note: 'Pick the colour of the rail: blue or green' },
    { id: 'B-2', title: 'Second', state: 'todo', owner: 'codex' },
    { id: 'LOCALCODER-TRIAL-01', title: 'LOCALCODER-TRIAL-01', state: 'running', owner: 'codex', note: 'Trial of the local coder on three small items', planned: false },
    { id: 'C-3', title: 'Third', state: 'running', owner: 'codex', note: 'Writing the tests' },
  ],
  history: [{ at: '2026-10-10T19:00:00Z', id: 'B-2', state: 'todo', say: 'queued' }],
}, null, 2)
const view = () => derivePlan(parsePlan(text, NOW)!, ev)

test('the waiting list holds items blocked on Jesse with the full ask, plus new YOU lines, and is empty with nothing', () => {
  const w = waitingItems(view().waiting, ['Pick the colour of the rail: blue or green', 'nothing', 'Plug in the camera'])
  expect(w.map(x => x.id)).toEqual(['A-1', ''])
  expect(w[0]!.ask).toBe('Pick the colour of the rail: blue or green')
  expect(waitingItems([], ['nothing'])).toEqual([])
  expect(WAITING_EMPTY).toBe('Nothing is waiting on you')
  expect(waitingEmptySvg(300).svg).toContain('Nothing is waiting on you')
})

test('a waiting row wraps a long ask at a narrow width and never cuts it', () => {
  const ask = 'Decide whether the household hub should publish the next build to the family or hold it back until the weekend review is done'
  const d = waitingRowSvg(220, { id: 'X-1', title: 'Publish', ask, tag: 'X-1' })
  expect(d.svg).not.toContain('…')
  expect(d.svg).toContain('weekend')
  expect(d.svg).toContain('done')
  expect(d.height).toBeGreaterThan(60)
})

test('markItemDone sets done, doneAt and a history line, and touches no other item', () => {
  const out = markItemDone(text, 'a-1', ISO)!
  const before = JSON.parse(text), after = JSON.parse(out)
  const it = after.items.find((i: { id: string }) => i.id === 'A-1')
  expect(it.state).toBe('done')
  expect(it.doneAt).toBe(ISO)
  expect(after.history.at(-1)).toEqual({ at: ISO, id: 'A-1', state: 'done', say: 'Marked done from the Cockpit panel' })
  expect(after.items.filter((i: { id: string }) => i.id !== 'A-1')).toEqual(before.items.filter((i: { id: string }) => i !== before.items[0]))
  expect(markItemDone(text, 'NOPE', ISO)).toBeNull()
  expect(markItemDone('not json', 'A-1', ISO)).toBeNull()
})

test('removeItem takes only that item out, writes a cancelled history line, and restoreItem puts it back in place', () => {
  const r = removeItem(text, 'B-2', ISO)!
  const after = JSON.parse(r.text)
  expect(after.items.map((i: { id: string }) => i.id)).toEqual(['A-1', 'LOCALCODER-TRIAL-01', 'C-3'])
  expect(after.history.at(-1).state).toBe('cancelled')
  expect(derivePlan(parsePlan(r.text, NOW)!, ev).todo.length).toBe(0)
  const back = JSON.parse(restoreItem(r.text, r.removed, ISO)!)
  expect(back.items.map((i: { id: string }) => i.id)).toEqual(['A-1', 'B-2', 'LOCALCODER-TRIAL-01', 'C-3'])
  expect(restoreItem(text, r.removed, ISO)).toBeNull()
  expect(removeItem(text, 'NOPE', ISO)).toBeNull()
})

test('a title that only repeats the id shows the latest say, then the note; a real title stays', () => {
  const row = (o: Partial<PlanRow>): PlanRow => ({ id: 'X-9', title: 'X-9', state: 'todo', owner: '', planned: true, note: '', source: 'file', startedMs: null, atMs: null, gone: false, onYou: false, say: '', history: [], ...o })
  expect(isCrypticTitle(row({}))).toBe(true)
  expect(plainTitle(row({ note: 'Fix the login page' }))).toBe('Fix the login page')
  expect(plainTitle(row({ note: 'n', say: 'Latest sentence' }))).toBe('Latest sentence')
  expect(plainTitle(row({ title: 'Fix the login page', note: 'n' }))).toBe('Fix the login page')
  expect(plainTitle(row({}))).toBe('X-9')
  const v = view()
  expect(plainTitle(v.off.find(r => r.id === 'LOCALCODER-TRIAL-01')!)).toBe('Trial of the local coder on three small items')
})

test('a running off-plan item appears in OFF PLAN and in the running list with its owner and note', () => {
  const v = view()
  expect(v.off.map(r => r.id)).toContain('LOCALCODER-TRIAL-01')
  const items = runningItems(v.running, v.off)
  expect(items.map(i => i.id)).toEqual(['C-3', 'LOCALCODER-TRIAL-01'])
  const off = items[1]!
  expect(off.offPlan).toBe(true)
  expect(off.owner).toBe('codex')
  const svg = runningRowSvg(220, off).svg
  expect(svg).toContain('run by codex')
  expect(svg).not.toContain('…')
})

test('the Local model line: up with an alias, up without one, down, not checked yet', () => {
  expect(parseLocalModel(true, '{"data":[{"id":"reika-9b"}]}')).toEqual({ checked: true, up: true, alias: 'reika-9b' })
  expect(parseLocalModel(true, 'garbage')).toEqual({ checked: true, up: true, alias: '' })
  expect(parseLocalModel(false, '{"data":[{"id":"x"}]}')).toEqual({ checked: true, up: false, alias: '' })
  expect(localModelLine(parseLocalModel(true, '{"data":[{"id":"reika-9b"}]}')).text).toBe('Local model: up on port 54800, serving reika-9b')
  expect(localModelLine(parseLocalModel(false, '')).tone).toBe('err')
  expect(localModelLine({ checked: false, up: false, alias: '' }).text).toBe('Local model: checking')
  expect(localModelSvg(260, parseLocalModel(true, '{"data":[{"id":"reika-9b"}]}')).svg).toContain('reika-9b')
})

test('the panel actions write the plan file atomically: done, remove, then undo, other items untouched', async () => {
  const { mkdtempSync, readFileSync, writeFileSync, existsSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { planActionDone, planActionRemove, planActionUndo, setPlanPath } = await import('../hooks/register.tsx')
  const dir = mkdtempSync(tmpdir() + '/cockpit-plan-')
  const path = dir + '/plan.json'
  writeFileSync(path, text)
  const prev = setPlanPath(path)
  const $ = {
    fs: { read: async (p: string) => readFileSync(p, 'utf8'), exists: async (p: string) => existsSync(p), write: async (p: string, t: string) => writeFileSync(p, t), list: async () => [], stat: async () => null },
    process: { run: async (argv: string[]) => { const r = Bun.spawnSync(argv); return { exitCode: r.exitCode, stdout: r.stdout.toString(), stderr: '' } } },
    ui: { invalidate: () => undefined },
    clock: { now: async () => NOW },
  } as never
  const ids = () => JSON.parse(readFileSync(path, 'utf8')).items.map((i: { id: string }) => i.id)
  expect(await planActionDone($, 'A-1')).toBe('Marked A-1 done.')
  expect(JSON.parse(readFileSync(path, 'utf8')).items[0].state).toBe('done')
  expect(await planActionRemove($, 'B-2', 'Second')).toBe('')
  expect(ids()).toEqual(['A-1', 'LOCALCODER-TRIAL-01', 'C-3'])
  expect(existsSync(path + '.cockpit-tmp')).toBe(false)
  expect(await planActionUndo($)).toBe('Put B-2 back on the plan.')
  expect(ids()).toEqual(['A-1', 'B-2', 'LOCALCODER-TRIAL-01', 'C-3'])
  expect(await planActionDone($, 'NOPE')).toContain('not in the plan file')
  await Bun.sleep(100)
  setPlanPath(prev)
})
