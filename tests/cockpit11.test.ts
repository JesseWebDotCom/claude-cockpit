// Cockpit v11 against the test host: crew rows. Active rows are green and tinted with a left bar, "working" says what the
// lane is doing, and every row shows the item it owns from live evidence only (a claim naming the lane, its pane, its run;
// never a stale lock or a guess).
//
// NOT RUN by the author of this file: the instruction for that run forbade `claude plugin test` and the host cannot be
// started any other way. The pure rules behind all of it ARE run (tests/laneitem.test.ts, tests/rows11.test.ts, with
// bun test). Run these with `claude plugin test` before relying on them.

import { expect, mock, test } from 'claude-code/testing'

import { DATA, IDLE_PANE, QUEUE, WORKING_PANE, newWorld, put, stubWorld } from './world.ts'
import type { World } from './world.ts'

const NOW0 = Date.parse('2026-10-08T22:00:00Z')
const HOUR = 60 * 60_000

const PANE = { plugin: 'cockpit', component: 'Pane', requestId: 'crew', surface: 'desktop', viewport: { columns: 100, rows: 40 }, props: { title: 'Cockpit', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 80 }, view: {} } } as const

type Svg = { alt: string; source: string }
function walk(tree: unknown): { svgs: Svg[]; buttons: { key: string }[] } {
  const out = { svgs: [] as Svg[], buttons: [] as { key: string }[] }
  const go = (node: any) => {
    if (node === null || typeof node !== 'object') return
    if (node.type === 'Svg') out.svgs.push({ alt: node.props?.alt ?? '', source: node.props?.source ?? '' })
    if (node.type === 'Button') out.buttons.push({ key: node.key ?? node.props?.key ?? '' })
    for (const c of node.children ?? []) go(c)
  }
  go(tree)
  return out
}

const world = (names: string[], panes: Record<string, string> = {}): World => {
  const w = newWorld()
  w.agents = []
  w.sessions = [...names]
  for (const n of names) w.panes[n] = panes[n] ?? IDLE_PANE
  return w
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
const paneOf = async ($: any) => {
  if (mounted !== null) await mounted.unmount().catch(() => undefined)
  mounted = await $.ui.mount(PANE)
  return { m: mounted, ...walk(await mounted.drawn()) }
}
const rowOf = (p: { svgs: Svg[] }, name: string): Svg | undefined => p.svgs.find(s => s.alt.startsWith(name + ' '))
const textClass = (src: string, cls: string): string[] => [...src.matchAll(new RegExp('<text class="' + cls + '"[^>]*>([^<]*)</text>', 'g'))].map(m => m[1] ?? '')

test('an active row is green with a tint and a left accent bar; a sleeping row is plain (item and doing from live evidence only)', async ($, on) => {
  const w = world(['codex-a', 'codex-b'], { 'codex-a': WORKING_PANE })
  await boot($, on, w)
  const p = await paneOf($)
  const a = rowOf(p, 'codex-a')
  const b = rowOf(p, 'codex-b')
  // 0.5.2: the chip is from the closed status list (working); the verb is in the task line.
  expect(a?.source).toContain('>working<')
  expect(a?.source).not.toContain('#64748B')
  expect(a?.source).toMatch(/<rect class="okc" x="0" y="0" width="\d+" height="52"[^>]*opacity="0.1"/)
  expect(a?.source).toMatch(/<rect class="okc" x="0" y="6" width="3"/)
  // What it is doing, from its pane's last tool line, on line 2.
  expect(textClass(a?.source ?? '', 's')).toContain('editing core.ts')
  expect(b?.source).not.toMatch(/<rect class="(?:okc|warnc|errc)" x="0" y="6"/)
  expect(b?.source).toContain('>sleeping<')
})

test('"working" with a pane that says nothing specific shows the verb of its newest tool line, not the bare word', async ($, on) => {
  const w = world(['codex-a'], { 'codex-a': 'plain words the lane wrote about nothing in particular\n\u2022 Ran rtk bash scripts/check.sh --pre\n' })
  await boot($, on, w)
  const a = rowOf(await paneOf($), 'codex-a')
  expect(textClass(a?.source ?? '', 's')).toContain('check.sh gate')
  expect(a?.source).toContain('>working<')
})

test('a claim that names a lane shows on that lane only: opencode-1 has COCKPIT-11, opencode-2 sleeps with no item (the wrong "Cockpit 10" row)', async ($, on) => {
  const w = world(['opencode-1', 'opencode-2'])
  put(w, DATA + '/claims/COCKPIT-11.claim', 'COCKPIT-11\nlane: opencode-1\n', NOW0 + 1000)
  put(w, QUEUE + '/brief-oc-cockpit10.md', '# COCKPIT-10: three fixes\n', NOW0 - HOUR)
  put(w, QUEUE + '/brief-oc-cockpit11.md', '# COCKPIT-11: crew rows\n', NOW0 + 500)
  await boot($, on, w)
  const p = await paneOf($)
  expect(textClass(rowOf(p, 'opencode-1')?.source ?? '', 's')).toContain('COCKPIT-11')
  const two = rowOf(p, 'opencode-2')
  expect(two?.source).not.toContain('COCKPIT')
  expect(two?.source).not.toContain('Cockpit')
  expect(two?.alt).not.toContain('COCKPIT')
})

test('a claim with no lane line is matched by the lane\'s pane (the brief path it was given); an idle lane with an old lock shows nothing', async ($, on) => {
  const w = world(['opencode-1', 'codex-b'], { 'opencode-1': 'Read and do ' + QUEUE + '/brief-oc-cockpit11.md\n\u2022 Edited hooks/look.ts (+3 -1)\n' })
  put(w, DATA + '/claims/COCKPIT-11.claim', 'COCKPIT-11\n', NOW0 - 60_000)
  put(w, QUEUE + '/brief-oc-cockpit11.md', '# COCKPIT-11: crew rows\n', NOW0 - 60_000)
  // The stale labels: an old lock on a lane that has been quiet since.
  put(w, DATA + '/lane-locks/codex-b.lock', 'coordinator\tcodex-b\t2026-10-08T10:00:00Z\tplace-map-d17\n', NOW0 - 3 * HOUR)
  await boot($, on, w)
  const p = await paneOf($)
  expect(textClass(rowOf(p, 'opencode-1')?.source ?? '', 's').join(' ')).toContain('COCKPIT-11')
  expect(rowOf(p, 'codex-b')?.source).not.toContain('place-map-d17')
  expect(rowOf(p, 'codex-b')?.source).not.toContain('Place Map')
})

test('an item that landed in git is not shown even when its claim names the lane', async ($, on) => {
  const w = world(['opencode-1'])
  put(w, DATA + '/claims/PAIR-WIRE-01.claim', 'lane: opencode-1\n', NOW0 + 1000)
  w.gitLog = 'e6fc18af PAIR-WIRE-01: pairing reply carries hmac_sha256\n'
  const clock = await boot($, on, w)
  await clock.advance(31_000)
  await clock.settle()
  expect(rowOf(await paneOf($), 'opencode-1')?.source).not.toContain('PAIR-WIRE-01')
})

test('the Session row (COCKPIT-13) shows the first NOW entry of the REAL status.json shape (`now` is one string), else the milestone, and has the cap', async ($, on) => {
  const w = world([])
  const real = { milestone: 'Pair the app with the remote service', done: 5, total: 6, now: 'LINK-KEYPATH-01 (opencode-2): wiring the key path; COCKPIT-11 (opencode-1): crew rows', next: [], you: [] }
  put(w, DATA + '/status.json', JSON.stringify({ updated: new Date(NOW0 + 30_000).toISOString(), ...real }), NOW0)
  await boot($, on, w)
  const s = (await paneOf($)).svgs.find(x => x.alt.startsWith('Session'))
  expect(s?.source).toContain('>Session<')
  expect(textClass(s?.source ?? '', 's').join(' ')).toContain('LINK-KEYPATH-01')
  expect(s?.source).toContain('class="sp c-captain')
  expect(s?.source).toContain('fill="#1F3A6E"')
})

test('the bar\'s Active switch is a filled pill (green; amber when Away) and the bar has no "now <item>" text', async ($, on) => {
  const w = world(['codex-a'])
  put(w, DATA + '/status.json', JSON.stringify({ updated: new Date(NOW0 + 30_000).toISOString(), milestone: 'Pair the app with the remote service', done: 5, total: 6, now: 'COCKPIT-13 (opencode-1): rename', next: [], you: [] }), NOW0)
  await boot($, on, w)
  const band = await $.ui.mount({ plugin: 'cockpit', component: 'AbovePrompt', requestId: 'band', surface: 'desktop', viewport: { columns: 100, rows: 30 }, props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 11 }, view: {} } })
  const tree = JSON.stringify(await band.drawn())
  // v16: the pill is its own Text beside a string-labelled Button (inverse + a named colour), never a Button child.
  expect(tree).toContain('"key":"crew-presence-pill"')
  expect(tree).toContain('"color":"green"')
  expect(tree).not.toContain(', now ')
  expect(tree).not.toContain('now COCKPIT-13')
  await band.press({ key: 'crew-presence' })
  const away = JSON.stringify(await band.drawn())
  expect(away).toContain('"color":"yellow"')
  await band.unmount()
})
