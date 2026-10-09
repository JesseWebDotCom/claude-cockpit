// Cockpit v12 against the test host: the bar above the prompt stays through the coordinator's turns. The sequence under test:
// the session goes idle -> busy -> idle (its sessions file, with the host's `isWorking` prop following), the slot the host
// gives the band shrinks while the turn runs (maxRows 12, 4, 1, then 12 again) and the engine's own band content appears
// under it. At every step something is drawn, it is never taller than its slot, the progress line is the same still drawing
// idle and busy, and nothing in the mod unregisters or re-registers it.
//
// NOT RUN by the author of this file: the instruction for that run forbade `claude plugin test` and the host cannot be
// started any other way. The pure rules behind all of it ARE run (tests/bandfit.test.ts, with bun test). Run these with
// `claude plugin test` before relying on them.

import { expect, mock, test } from 'claude-code/testing'

import { IDLE_PANE, USER_HOME, WORKING_PANE, newWorld, put, stubWorld } from './world.ts'
import type { World } from './world.ts'

const NOW0 = Date.parse('2026-10-08T22:00:00Z')
const SESSIONS = USER_HOME + '/.claude/sessions'

const BAND = { plugin: 'cockpit', component: 'AbovePrompt', requestId: 'band', surface: 'desktop', viewport: { columns: 100, rows: 30 }, props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 11 }, view: {} } } as const

type Node = { type?: string; key?: string; props?: Record<string, any>; children?: unknown[] }
type Seen = { svgs: { alt: string; source: string; height: number }[]; buttons: string[]; texts: string[] }
function walk(tree: unknown): Seen {
  const out: Seen = { svgs: [], buttons: [], texts: [] }
  const go = (node: any) => {
    if (node === null || typeof node !== 'object') return
    if (node.type === 'Svg') out.svgs.push({ alt: node.props?.alt ?? '', source: node.props?.source ?? '', height: node.props?.height ?? 0 })
    if (node.type === 'Button') out.buttons.push(node.key ?? node.props?.key ?? '')
    if (node.type === 'Text') out.texts.push((node.children ?? []).join(''))
    for (const c of node.children ?? []) go(c)
  }
  go(tree)
  return out
}
// Rows the drawn tree takes, as the mod counts them (a column adds, a row takes its tallest, a Svg is ceil(height / 20)).
const rows = (node: Node | undefined): number => {
  if (node === undefined || node === null || typeof node !== 'object') return 0
  const kids = (node.children ?? []) as Node[]
  if (node.type === 'Svg') return Math.ceil((node.props?.height ?? 20) / 20)
  if (node.type === 'Text' || node.type === 'Button') return 1
  const r = kids.map(rows)
  return node.props?.flexDirection === 'row' ? Math.max(0, ...r) : r.reduce((a, b) => a + b, 0)
}

const world = (names: string[], panes: Record<string, string> = {}): World => {
  const w = newWorld()
  w.agents = []
  w.sessions = [...names]
  for (const n of names) w.panes[n] = panes[n] ?? IDLE_PANE
  return w
}
let writes = 0
const session = (w: World, status: string): void => {
  writes += 1
  put(w, SESSIONS + '/4001.json', JSON.stringify({ pid: 4001, sessionId: w.sessionId, status, updatedAt: new Date(NOW0 + writes * 1000).toISOString() }), NOW0 + writes * 1000)
}

async function boot($: any, on: any, w: World) {
  const clock = mock.clock(on, { now: NOW0 })
  stubWorld(on, w)
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(6000)
  await clock.settle()
  return clock
}

let mounted: any = null
const bandAt = async ($: any, props: Record<string, unknown> = {}) => {
  if (mounted !== null) await mounted.unmount().catch(() => undefined)
  mounted = await $.ui.mount({ ...BAND, props: { ...BAND.props, ...props } })
  const tree = await mounted.drawn()
  return { tree, ...walk(tree) }
}
const drawn = (t: Seen): boolean => t.buttons.includes('band-crew')

test('REGRESSION: the bar follows no turn state: idle, busy and idle again, with the slot shrinking and growing, it is always drawn and always fits', async ($, on) => {
  const w = world(['codex-a'])
  session(w, 'idle')
  const clock = await boot($, on, w)
  const idle = await bandAt($, { isWorking: false, maxRows: 12 })
  expect(drawn(idle)).toBe(true)
  expect(idle.svgs[0]?.alt).toMatch(/^Milestone /)
  expect(idle.buttons).not.toContain('band-sys')
  const idleProgress = idle.svgs[0]?.source ?? ''

  // The turn starts: the file says busy, the host says isWorking and gives the band fewer rows.
  session(w, 'busy')
  await clock.advance(2000)
  await clock.settle()
  for (const maxRows of [12, 6, 4, 2, 1]) {
    const t = await bandAt($, { isWorking: true, maxRows })
    expect(drawn(t)).toBe(true)
    expect(rows(t.tree)).toBeLessThanOrEqual(maxRows)
  }
  // With room the busy bar is the same drawing as the idle one (no animated variant while the turn runs).
  const busy = await bandAt($, { isWorking: true, maxRows: 12 })
  expect(busy.svgs[0]?.source).toBe(idleProgress)
  expect(busy.svgs[0]?.source).not.toContain('@keyframes')

  // And back to idle.
  session(w, 'idle')
  await clock.advance(6000)
  await clock.settle()
  const after = await bandAt($, { isWorking: false, maxRows: 12 })
  expect(drawn(after)).toBe(true)
  expect(after.svgs[0]?.source).toBe(idleProgress)
  expect(after.buttons).not.toContain('band-sys')
})

test('a slot of two rows draws the progress line and the crew line; one row draws a single line with the crew button', async ($, on) => {
  const w = world(['codex-a'], { 'codex-a': WORKING_PANE })
  await boot($, on, w)
  const compact = await bandAt($, { isWorking: true, maxRows: 4 })
  expect(compact.svgs[0]?.alt).toMatch(/^Milestone /)
  expect(compact.buttons).toContain('band-crew')
  expect(compact.buttons).not.toContain('band-sys')
  const line = await bandAt($, { isWorking: true, maxRows: 1 })
  expect(line.svgs.length).toBe(0)
  expect(line.buttons).toContain('band-crew')
  expect(line.buttons).toContain('crew-open')
  expect(rows(line.tree)).toBe(1)
})

test('the progress line is never the animated drawing (no keyframes), and the band has no usage strip or expand glyph', async ($, on) => {
  const idleWorld = world(['codex-a'])
  await boot($, on, idleWorld)
  const a = await bandAt($, { maxRows: 12 })
  expect(a.buttons.filter(b => b.startsWith('meter-') || b === 'band-sys' || b === 'band-credit').length).toBe(0)
  expect(a.svgs[0]?.source).not.toContain('@keyframes')
})

test('an odd width (NaN) is clamped, not fatal: the rich bar is still drawn (the last-good-frame path itself has no test: nothing in the harness can make the draw throw)', async ($, on) => {
  const w = world(['codex-a'])
  await boot($, on, w)
  const good = await bandAt($, { maxRows: 12 })
  expect(drawn(good)).toBe(true)
  // A width the drawing cannot use (NaN) is clamped, not fatal: the bar is still the rich one.
  const odd = await bandAt($, { maxRows: 12, bodyColumns: Number.NaN })
  expect(drawn(odd)).toBe(true)
  expect(odd.svgs.length).toBeGreaterThan(0)
})
