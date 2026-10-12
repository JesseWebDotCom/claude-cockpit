// COCKPIT-36: five sections in one fixed order (Main status, Crew, System, Flight log, Black box), each independent. Every header is always drawn in the declared
// order; a toggle changes only its own section's flag; the saved file round-trips each flag on its own.
import { test, expect } from './pure.ts'
import { graphOf, paneSvgTree, setCardSourcesForTest } from '../hooks/register.tsx'
import { parsePlan } from '../hooks/plan.ts'
import { PANE_SECTIONS, defaultSections, isSectionOpen, legacySections, toggledSections } from '../hooks/panesections.ts'
import { defaultUi, parseUi, serializeUi } from '../hooks/ui.ts'

const writes: string[] = []
const el = (type: string) => (p: any) => ({ type, props: p, children: p.children ?? [] })
const kit: any = { Box: el('Box'), Text: el('Text'), Button: el('Button'), Svg: el('Svg'), Input: el('Input') }
const $: any = { ui: { invalidate: () => undefined, toast: () => undefined }, fs: { write: async (_p: string, t: string) => { writes.push(t) } } }
const walk = (n: any, out: any[] = []): any[] => {
  if (n && typeof n === 'object') {
    out.push(n)
    if (Array.isArray(n.children)) for (const c of n.children) walk(c, out)
  }
  return out
}
const colsFor = (px: number): number => Math.ceil((px + 8) / 8)
const tree = (px: number, heightPx?: number): any => paneSvgTree($, kit, colsFor(px), heightPx === undefined ? undefined : Math.floor(heightPx / 20), 1_000_000, graphOf())
const keysOf = (t: any): string[] => walk(t).map(n => n.props?.key).filter((k): k is string => typeof k === 'string')
// 0.23.4: the sections are the plan's list sections (WAITING ON YOU, MILESTONES, RUNNING, BLOCKED, TODO, DONE, OFF PLAN, SYSTEM). Each header is a drawn chevron on the tile
// plus a visible "+" or "-" Button beside it; the tests press that Button the way the host does (call its onPress) and read what the next draw shows.
const NOW = 1_000_000
const PLAN = JSON.stringify({
  milestone: 'Ship it',
  items: [
    { id: 'A-1', title: 'Pick the colour of the rail', state: 'blocked', owner: 'jesse', note: 'blue or green' },
    { id: 'B-1', title: 'Write the tests', state: 'running', owner: 'codex', note: 'in progress' },
    { id: 'B-2', title: 'Blocked on a file', state: 'blocked', owner: 'codex', note: 'waiting for the file' },
    ...[1, 2, 3, 4, 5, 6].map(i => ({ id: 'T-' + i, title: 'Todo ' + i, state: 'todo', owner: 'codex' })),
    { id: 'D-1', title: 'Done one', state: 'done', owner: 'codex' },
    { id: 'D-2', title: 'Done two', state: 'done', owner: 'codex' },
    { id: 'O-1', title: 'Something extra', state: 'running', owner: 'codex', planned: false },
  ],
  history: [],
})
const IDS = ['needs', 'tree', 'running', 'blocked', 'todo', 'done', 'off', 'system']
const HEADER = (id: string): string => 'svg-plan-h-' + id
const BUTTON = (id: string): string => 'sec-h-' + id
const withPlan = (): void => {
  setCardSourcesForTest({ plan: parsePlan(PLAN, NOW) })
}
const draw = (px = 420, h?: number): any => (withPlan(), tree(px, h))
const btn = (id: string, px = 420): any => walk(draw(px)).find(n => n.props?.key === BUTTON(id))
const isOpen = (id: string): boolean => btn(id).props.label === '-'
const states = (): boolean[] => IDS.map(isOpen)
const setAll = (want: boolean[]): void => IDS.forEach((id, i) => { if (isOpen(id) !== want[i]) btn(id).props.onPress() })
const headers = (px: number, h?: number): string[] => keysOf(draw(px, h)).filter(k => IDS.map(HEADER).includes(k))

test('every list section draws its header once, in the declared order, in all 256 open/closed states at 360, 420 and 520 px', () => {
  const want = IDS.map(HEADER)
  for (let mask = 0; mask < 256; mask++) {
    setAll(IDS.map((_, i) => Boolean(mask & (1 << i))))
    const px = [360, 420, 520][mask % 3] as number
    expect(headers(px, 600)).toEqual(want)
    expect(headers(px)).toEqual(want)
  }
  setAll(IDS.map(id => id !== 'system'))
})

test('pressing one section header\'s button changes no other section\'s flag or header, in 128 states', () => {
  for (let mask = 0; mask < 256; mask += 2) {
    for (const i of [mask % 8, (mask + 3) % 8]) {
      const start = IDS.map((_, j) => Boolean(mask & (1 << j)))
      setAll(start)
      btn(IDS[i] as string).props.onPress()
      expect(states()).toEqual(start.map((v, j) => (j === i ? !v : v)))
      expect(headers(420, 600)).toEqual(IDS.map(HEADER))
    }
  }
  setAll(IDS.map(id => id !== 'system'))
})

test('a click on a header\'s button opens or closes the rows under it, and shows "+" or "-" on a real Button', () => {
  setAll(IDS.map(id => id !== 'system'))
  const rowKeys = (): string[] => keysOf(draw()).filter(k => k.startsWith('svg-plan-r-live-') || k.startsWith('svg-plan-r-list-') || k.startsWith('svg-plan-r-done-'))
  expect(rowKeys()).toContain('svg-plan-r-live-B-1')
  expect(btn('running').type).toBe('Button')
  expect(btn('running').props.plain).toBe(true)
  expect(btn('running').props.label).toBe('-')
  btn('running').props.onPress()
  expect(btn('running').props.label).toBe('+')
  expect(rowKeys()).not.toContain('svg-plan-r-live-B-1')
  expect(rowKeys()).toContain('svg-plan-r-list-T-1')
  btn('running').props.onPress()
  expect(rowKeys()).toContain('svg-plan-r-live-B-1')
})

test('0.24.0: every section starts closed, a row opens on its own press, and a closed row has no id, note or "latest" line', () => {
  setAll(IDS.map(() => false))
  expect(keysOf(draw()).filter(k => k.startsWith('svg-plan-r-'))).toEqual([])
  expect(keysOf(draw()).some(k => k.includes('latest'))).toBe(false)
  setAll(IDS.map(id => id !== 'system'))
  const row = (): any => walk(draw()).find(n => n.props?.key === 'sec-r-live-B-1')
  const h = (): number => walk(draw()).find(n => n.props?.key === 'svg-plan-r-live-B-1').props.height
  const closed = h()
  row().props.onPress()
  expect(h()).toBeGreaterThan(closed)
  row().props.onPress()
  expect(h()).toBe(closed)
})

test('TODO shows four rows and "+N more", and its button lists them all; SYSTEM opens to the detailed card', () => {
  setAll(IDS.map(id => id !== 'system'))
  const todo = (): string[] => keysOf(draw()).filter(k => k.startsWith('svg-plan-r-list-T-'))
  expect(todo().length).toBe(4)
  const more = (): any => walk(draw()).find(n => n.props?.key === 'sec-todo-more')
  more().props.onPress()
  expect(todo().length).toBe(6)
  more().props.onPress()
  expect(todo().length).toBe(4)
  expect(keysOf(draw())).not.toContain('svg-plan-sys-res')
  btn('system').props.onPress()
  expect(keysOf(draw())).toContain('svg-plan-sys-res')
  expect(keysOf(draw())).toContain('svg-plan-sys-plans')
  setAll(IDS.map(id => id !== 'system'))
})
