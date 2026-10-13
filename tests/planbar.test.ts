import { expect, test } from 'bun:test'
import { limitsLine, ownerChips, ownerKind, presenceWord, segsCols, statusSegs } from '../hooks/planbar.ts'

const view: any = { running: [{ owner: 'codex-a' }, { owner: 'codex-b' }, { owner: 'sonnet' }], you: 1, todo: [1, 2, 3], doneN: 8 }

test('status counts use the plan page words and colours', () => {
  const s = statusSegs(view)
  expect(s.map(g => g.text)).toEqual(['RUNNING 3', 'NEEDS YOU 1', 'TO DO 3', 'DONE 8'])
  expect(s.map(g => g.color)).toEqual(['blue', 'yellow', 'gray', 'green'])
  expect(segsCols(s)).toBe(9 + 11 + 7 + 6 + 6)
})

test('owner kinds follow the page mapping', () => {
  expect(['jesse', 'codex-a', 'reika', 'pi-hailo', 'engine', 'opus', 'architect', ''].map(ownerKind)).toEqual(['you', 'codex', 'local', 'local', 'engine', 'opus', 'claude', 'claude'])
})

test('chips count running work per owner kind', () => {
  expect(ownerChips(view).map(g => g.text)).toEqual(['CLAUDE 1', 'CODEX 2'])
  expect(ownerChips({ ...view, running: [] })).toEqual([])
})

test('limits line and presence word', () => {
  expect(limitsLine(0, 20)).toBe('5H 0% · WEEK 20%')
  expect(limitsLine(null, 49.6)).toBe('5H n/a · WEEK 50%')
  expect([presenceWord(true), presenceWord(false)]).toEqual(['AWAY', 'ACTIVE'])
})

test('0.24.9: off-plan pill counts only items not done; the credit figure is the tighter window', async () => {
  const { bandPills } = await import('../hooks/planbar.ts')
  const mk = (off: { state: string }[]) => bandPills({ running: [], you: 0, todo: [], doneN: 0, off } as never)
  expect(mk([{ state: 'done' }, { state: 'todo' }, { state: 'running' }]).find(p => p.cls === 'off')?.text).toBe('+2 off plan')
  expect(mk([{ state: 'done' }]).some(p => p.cls === 'off')).toBe(false)
  const { creditSegments } = await import('../hooks/services.ts')
  const row = { id: 'claude', state: 'ok', text: '5h 98% week 79%', hex: '#3fb950', left: 0.79 } as never
  expect(creditSegments([row], 'one').find(s => s.id === 'claude')?.fig).toBe('79%')
})
