// Cockpit v10 against the test host: the Status card tracks itself (live NOW, the stale chip, done from what landed, a
// report appearing redraws at once), its lines expand on a press, and the bar above the prompt survives /crew close and
// open, shows at session start without /crew, shows in a very wide window and starts even when session.start never ran.
//
// NOT RUN by the author of this file: the instruction for that run forbade `claude plugin test` and the host cannot be
// started any other way. The pure rules behind all of it ARE run (tests/statuslive.test.ts, tests/statuscard.test.ts, with
// bun test). Run these with `claude plugin test` before relying on them.

import { expect, mock, test } from 'claude-code/testing'

import { DATA, IDLE_PANE, QUEUE, WORKING_PANE, newWorld, put, stubWorld } from './world.ts'
import type { World } from './world.ts'

const NOW0 = Date.parse('2026-10-08T22:00:00Z')
const MIN = 60_000
const HOUR = 60 * MIN

const PANE = { plugin: 'cockpit', component: 'Pane', requestId: 'crew', surface: 'desktop', viewport: { columns: 100, rows: 40 }, props: { title: 'Cockpit', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 60 }, view: {} } } as const
const BAND = { plugin: 'cockpit', component: 'AbovePrompt', requestId: 'band', surface: 'desktop', viewport: { columns: 100, rows: 30 }, props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 11 }, view: {} } } as const

type Svg = { alt: string; source: string; width: number; height: number }
function walk(tree: unknown): { svgs: Svg[]; buttons: { key: string; label: string }[] } {
  const out = { svgs: [] as Svg[], buttons: [] as { key: string; label: string }[] }
  const go = (node: any) => {
    if (node === null || typeof node !== 'object') return
    if (node.type === 'Svg') out.svgs.push({ alt: node.props?.alt ?? '', source: node.props?.source ?? '', width: node.props?.width ?? 0, height: node.props?.height ?? 0 })
    if (node.type === 'Button') out.buttons.push({ key: node.key ?? node.props?.key ?? '', label: node.props?.label ?? '' })
    for (const c of node.children ?? []) go(c)
  }
  go(tree)
  return out
}

// A quiet world: no running subagent (the default fake world has one, and a working subagent keeps the 5 s poll).
const world = (names: string[] = [], panes: Record<string, string> = {}): World => {
  const w = newWorld()
  w.agents = []
  w.sessions = [...names]
  for (const n of names) w.panes[n] = panes[n] ?? IDLE_PANE
  return w
}

async function boot($: any, on: any, w: World, startSession = true) {
  const clock = mock.clock(on, { now: NOW0 })
  stubWorld(on, w)
  on('session.start', () => ({ cwd: '/work' }))
  if (startSession) await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(5000)
  await clock.settle()
  return clock
}

let pane: any = null
let band: any = null
const paneOf = async ($: any) => {
  if (pane !== null) await pane.unmount().catch(() => undefined)
  pane = await $.ui.mount(PANE)
  return { m: pane, ...walk(await pane.drawn()) }
}
const bandOf = async ($: any, columns = 120) => {
  if (band !== null) await band.unmount().catch(() => undefined)
  band = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: columns } })
  return walk(await band.drawn())
}
const statusOf = (t: { svgs: Svg[] }): Svg | undefined => t.svgs.find(s => s.alt.startsWith('Status'))
const statusJson = (o: Record<string, unknown>, updated: number) =>
  JSON.stringify({ updated: new Date(updated).toISOString(), milestone: 'Pair the app with the remote service', done: 5, total: 6, now: ['waiting for you to pair the box'], next: ['bind chat/vision to 127.0.0.1:8791'], you: ['get a code'], ...o })

// ---------------------------------------------------------------------------
// 1. The Status card tracks itself

test('status.json two hours old and a lane working: the card shows the live NOW and no stale chip', async ($, on) => {
  const w = world(['codex-a'], { 'codex-a': WORKING_PANE })
  put(w, DATA + '/lane-locks/codex-a.lock', 'coordinator\tcodex-a\t2026-10-08T21:50:00Z\tCOCKPIT-10\n', NOW0 - 10 * MIN)
  put(w, DATA + '/status.json', statusJson({}, NOW0 - 2 * HOUR), NOW0 - 2 * HOUR)
  await boot($, on, w)
  const s = statusOf(await paneOf($))
  expect(s?.source).toContain('codex-a')
  expect(s?.source).not.toContain('waiting for you to pair the box')
  expect(s?.source).not.toContain('stale')
  // The plan fields stay the file's.
  expect(s?.source).toContain('Pair the app with the remote service')
  expect(s?.source).toContain('>5/6<')
  expect(s?.source).toContain('bind chat/vision')
})

test('status.json two hours old and nothing live: the stale chip says so, and the file NOW stands', async ($, on) => {
  const w = world(['codex-a'])
  put(w, DATA + '/status.json', statusJson({}, NOW0 - 2 * HOUR), NOW0 - 2 * HOUR)
  await boot($, on, w)
  const s = statusOf(await paneOf($))
  expect(s?.source).toContain('>stale: updated 2h ago<')
  expect(s?.source).toContain('waiting for you to pair the box')
})

test('a lane whose report is newer than its lock leaves NOW; the card does not call it stale while a lane is live', async ($, on) => {
  const w = world(['codex-a', 'codex-b'], { 'codex-a': WORKING_PANE, 'codex-b': WORKING_PANE })
  put(w, DATA + '/lane-locks/codex-a.lock', 'coordinator\tcodex-a\tt\tb21\n', NOW0 - HOUR)
  put(w, DATA + '/lane-locks/codex-b.lock', 'coordinator\tcodex-b\tt\tb22\n', NOW0 - HOUR)
  put(w, QUEUE + '/reports/b21-report.md', 'done\n- Gate exit code: 0\n', NOW0 - 5 * MIN)
  put(w, DATA + '/status.json', statusJson({}, NOW0 - 2 * HOUR), NOW0 - 2 * HOUR)
  await boot($, on, w)
  const s = statusOf(await paneOf($))
  expect(s?.source).toContain('codex-b')
  expect(s?.source).not.toContain('codex-a')
  expect(s?.source).not.toContain('stale')
})

test('a commit that landed with an id from NEXT advances done by one in the display and is not written to status.json', async ($, on) => {
  const w = world(['codex-a'])
  w.gitLog = 'e6fc18af GENUI-14: next block\n'
  put(w, DATA + '/status.json', statusJson({ done: 3, next: ['GENUI-14: next block', 'later'] }, NOW0 + 30_000), NOW0)
  await boot($, on, w)
  const s = statusOf(await paneOf($))
  expect(s?.source).toContain('>4/6<')
  expect(s?.source).not.toContain('GENUI-14')
  expect(s?.source).toContain('later')
  expect(w.writes.some(x => x.path.endsWith('status.json'))).toBe(false)
})

test('a report appearing redraws within one tick (not at the next 30 s poll), and /crew was never run', async ($, on) => {
  const w = world([])
  put(w, DATA + '/claims/X-01.claim', 'x', NOW0 - 5 * MIN)
  put(w, DATA + '/status.json', statusJson({}, NOW0 - 2 * HOUR), NOW0 - 2 * HOUR)
  const clock = await boot($, on, w)
  expect(statusOf(await paneOf($))?.source).toContain('X-01 (claimed')
  put(w, QUEUE + '/reports/x-01-report.md', 'done\n', NOW0 + 6000)
  await clock.advance(6000)
  await clock.settle()
  const after = statusOf(await paneOf($))
  expect(after?.source).not.toContain('X-01')
  expect(after?.source).toContain('>stale: updated 2h ago<')
})

// ---------------------------------------------------------------------------
// 2. The card's lines expand on a press and collapse on the next

test('(0.5.0) the Status card has ONE chevron; a press opens NOW, NEXT and YOU together, the whole text wrapped, NEXT one entry per row; a second press collapses', async ($, on) => {
  const w = world([])
  const LONG = 'COCKPIT-10: the self-updating Crew panel, the expandable card and the bar that went missing after the toggle'
  put(w, DATA + '/status.json', statusJson({ now: [LONG], next: ['first item to do', 'second item to do', 'third item to do'], you: ['approve the pin bump'] }, NOW0 + 30_000), NOW0)
  await boot($, on, w)
  const p = await paneOf($)
  const keys = p.buttons.map(b => b.key)
  expect(keys).toContain('status-open')
  expect(keys.some(k => k.startsWith('status-open-'))).toBe(false)
  const closed = statusOf(p)
  expect(closed?.source).not.toContain(LONG)
  await p.m.press({ key: 'status-open' })
  const open = walk(await p.m.drawn())
  const s = statusOf(open)
  for (const item of ['first item to do', 'second item to do', 'third item to do']) expect(s?.source).toContain('>' + item + '<')
  for (const word of LONG.split(' ')) expect(s?.source).toContain(word)
  expect(s?.height ?? 0).toBeGreaterThan(closed?.height ?? 0)
  expect(open.buttons.find(b => b.key === 'status-open')?.label).toBe('\u25be')
  // The open state is kept while the panel is redrawn.
  expect(statusOf(walk(await p.m.drawn()))?.height).toBe(s?.height)
  await p.m.press({ key: 'status-open' })
  expect(statusOf(walk(await p.m.drawn()))?.height).toBe(closed?.height)
})

// ---------------------------------------------------------------------------
// 3. The bar above the prompt

const barDrawn = (t: { svgs: Svg[]; buttons: { key: string }[] }): boolean => t.buttons.some(b => b.key === 'band-crew') && t.svgs.some(s => s.alt.startsWith('Milestone'))

test('the bar shows at session start with no /crew, and survives /crew open, close and open again (REGRESSION: the bar was gone after a /crew toggle)', async ($, on) => {
  const w = world(['codex-a'])
  w.trackPanes = true
  put(w, DATA + '/status.json', statusJson({}, NOW0), NOW0)
  await boot($, on, w)
  expect(barDrawn(await bandOf($))).toBe(true)
  // Open: the engine lists the pane and the band is still drawn, at the narrower column a docked pane leaves.
  expect(((await $.command.run({ command: 'crew', args: '' } as never)) as { text: string }).text).toBe('Cockpit opened.')
  expect(w.openPanes).toEqual(['crew'])
  expect(barDrawn(await bandOf($, 60))).toBe(true)
  // Close: the engine's close ran (ui.close), the pane is gone from its list, and the band is drawn at the wider column.
  expect(((await $.command.run({ command: 'crew', args: '' } as never)) as { text: string }).text).toBe('Cockpit closed.')
  expect(w.closed).toEqual(['crew'])
  expect(w.openPanes).toEqual([])
  expect(barDrawn(await bandOf($, 120))).toBe(true)
  // Open again.
  expect(((await $.command.run({ command: 'crew', args: '' } as never)) as { text: string }).text).toBe('Cockpit opened.')
  expect(barDrawn(await bandOf($, 60))).toBe(true)
})

test('the bar draws in a very wide window: no Svg is wider than the 4096 px the host accepts (the host drew NONE of the band at 1000 columns before)', async ($, on) => {
  const w = world(['codex-a'])
  await boot($, on, w)
  for (const columns of [200, 520, 1000, 5000]) {
    const t = await bandOf($, columns)
    expect(barDrawn(t)).toBe(true)
    for (const s of t.svgs) expect(s.width).toBeLessThanOrEqual(4096)
  }
})

test('a module that never got session.start (a reload) starts itself when the bar is first drawn: crew found, commands usable', async ($, on) => {
  const w = world(['codex-a'], { 'codex-a': WORKING_PANE })
  const clock = await boot($, on, w, false)
  const first = await bandOf($)
  expect(barDrawn(first)).toBe(true)
  await clock.advance(6000)
  await clock.settle()
  expect((await bandOf($)).buttons.find(b => b.key === 'band-crew')?.label).toBe('1 crew: 1 working')
})
