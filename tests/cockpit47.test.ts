// 0.24.1: the pane through the path the host uses: the registered ui.render hook draws it (with the host's bodyRows), a press runs the onPress closure of the
// element with that key from the last render (what core does for ui.press), and ui.scroll decides who scrolls from the host's own count of the column.
import { test, expect } from './pure.ts'
import { register, setCardSourcesForTest } from '../hooks/register.tsx'
import { parsePlan } from '../hooks/plan.ts'
import { scrollOwner } from '../hooks/ui.ts'

type Handler = (...a: any[]) => any
const handlers: { name: string; filter: any; fn: Handler }[] = []
const on: any = (name: string, a: any, b?: Handler) => handlers.push(b === undefined ? { name, filter: null, fn: a } : { name, filter: a, fn: b })
register(on, {} as any)
const hook = (name: string, component: string): Handler => {
  const h = handlers.find(x => x.name === name && x.filter?.component === component && (name === 'ui.render' ? x.filter.requestId === undefined : true))
  if (!h) throw new Error('no hook ' + name + ' ' + component)
  return h.fn
}

const el = (type: string) => (p: any) => ({ type, props: p, children: p.children ?? [] })
const kit: any = { Box: el('Box'), Text: el('Text'), Button: el('Button'), Svg: el('Svg'), Input: el('Input') }
let invalidated = 0
const $: any = {
  ui: { resolve: () => kit, invalidate: () => { invalidated++ }, toast: () => undefined, panes: async () => [] },
  clock: { now: async () => Date.parse('2026-10-12T19:00:00-04:00') },
  fs: { write: async () => undefined, read: async () => null, append: async () => undefined, mkdir: async () => undefined },
}
const walk = (n: any, o: any[] = []): any[] => { if (n && typeof n === 'object') { o.push(n); if (Array.isArray(n.children)) for (const c of n.children) walk(c, o) } return o }
const steps = Array.from({ length: 40 }, (_, i) => ({ id: 'STEP-' + String(i).padStart(2, '0'), title: 'Step number ' + i + ' of the long plan', state: i < 5 ? 'done' : 'todo', note: 'a note that is long enough to wrap onto a second line in the open row' }))
const plan = JSON.stringify({ milestone: 'Long plan', updated: '2026-10-12T19:00:00-0400', items: steps })
setCardSourcesForTest({ plan: parsePlan(plan, Date.parse('2026-10-12T19:00:00-04:00')) })

// What the host does: draw (bodyRows from the pane), find the Button by key in that draw, run its onPress, draw again.
const draw = async (): Promise<any> => hook('ui.render', 'Pane')($, { requestId: 'crew', surface: 'desktop', props: { bodyColumns: 56, scroll: { bodyRows: 53 } } }, async () => null)
const press = async (key: string): Promise<boolean> => {
  const b = walk(await draw()).find(x => x.type === 'Button' && x.props.key === key)
  if (!b) return false
  b.props.onPress()
  return true
}
// A section's button reads "+" while closed. Other test files share this module's saved flags, so open only what is closed.
const open = async (key: string): Promise<void> => {
  const b = walk(await draw()).find(x => x.type === 'Button' && x.props.key === key)
  if (b && b.props.label === '+') b.props.onPress()
}
const keys = async (): Promise<string[]> => walk(await draw()).filter(x => x.type === 'Button').map(x => x.props.key as string)

test('a press from the registered render hook opens a section, then a step, then the System card, each through its own key', async () => {
  const before = (await keys()).length
  await open('sec-h-tree')
  for (const k of (await keys()).filter(k => k.startsWith('sec-h-m-'))) await open(k)
  const stepKeys = (await keys()).filter(k => k.startsWith('sec-step-'))
  expect(stepKeys.length).toBeGreaterThan(5)
  const svgs = async (): Promise<string> => walk(await draw()).filter(x => x.type === 'Svg').map(x => x.props.source).join('|')
  const closed = await svgs()
  expect(await press(stepKeys[stepKeys.length - 1]!)).toBe(true)
  expect(await svgs()).not.toBe(closed)
  await open('sec-h-system')
  const sysOpen = await svgs()
  expect(await press('sec-h-system')).toBe(true)
  expect(await svgs()).not.toBe(sysOpen)
  expect(await press('sec-h-system')).toBe(true)
  expect(await svgs()).toBe(sysOpen)
  expect(before).toBeGreaterThan(0)
  expect(invalidated).toBeGreaterThan(0)
})

test('every key in the drawn pane is unique, so a press can only reach the element it names', async () => {
  const k = await keys()
  expect(k.filter((x, i) => k.indexOf(x) !== i)).toEqual([])
})

test('the host counting far fewer rows than the plugin drew (60 for 6853 px) hands the scroll to the plugin; a fitting column stays with the host', () => {
  expect(scrollOwner(60, 53, 6853)).toBe('own')
  expect(scrollOwner(126, 53, 2439)).toBe('host')
  expect(scrollOwner(60, 53, 1100)).toBe('host')
  expect(scrollOwner(30, 53, 600)).toBe('host')
})

test('ui.scroll flips to the plugin when the host under-counts, and back to the host when the column fits again', async () => {
  const scroll = hook('ui.scroll', 'Pane')
  await draw()
  let passed = 0
  const next = async () => { passed++; return 'host' }
  // The drawn column is tall (open milestone and steps above): the host says 60 rows.
  const out = await scroll($, { component: 'Pane', requestId: 'crew', offset: 0, by: 3, bodyRows: 53, contentRows: 60, origin: 'wheel' }, next)
  expect(out).toEqual({})
  expect(passed).toBe(0)
  // The host's count catches up with what was drawn: it scrolls again.
  const tall = Math.ceil((await (async () => { await draw(); return (await import('../hooks/register.tsx')).paneScrollForTest.state().treePx })()) / 20)
  const out2 = await scroll($, { component: 'Pane', requestId: 'crew', offset: 0, by: 3, bodyRows: 53, contentRows: tall, origin: 'wheel' }, next)
  expect(out2).toBe('host')
})
