// Liveness (cockpit v9): the panel says "working" while something is working, without waiting for an event. An
// `opencode run` process, a Codex pane that changed in the last 60 s, this session's own entry in the sessions
// folder, a stale status file, and the one timer that drives the redraws and the polls.

import { expect, mock, test } from 'claude-code/testing'

import { briefLabelOf, briefNameIn, fileBusy, mainIsBusy, paneChangedRecently, parseEtime, parsePgrep, parseSessionEntry, pollDue, redrawDue } from '../hooks/live.ts'
import { DATA, IDLE_PANE, QUEUE, USER_HOME, WORKING_PANE, callsOf, newWorld, put, stubWorld } from './world.ts'
import type { World } from './world.ts'

const NOW0 = Date.parse('2026-10-08T22:00:00Z')
const MIN = 60_000
const SESSIONS = USER_HOME + '/.claude/sessions'

const PANE = { plugin: 'cockpit', component: 'Pane', requestId: 'crew', surface: 'desktop', viewport: { columns: 100, rows: 40 }, props: { title: 'Cockpit', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 60 }, view: {} } } as const
const BAND = { plugin: 'cockpit', component: 'AbovePrompt', requestId: 'band', surface: 'desktop', viewport: { columns: 100, rows: 30 }, props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 11 }, view: {} } } as const

type Svg = { alt: string; source: string; height: number }
function walk(tree: unknown): { svgs: Svg[]; buttons: { key: string; label: string }[] } {
  const out = { svgs: [] as Svg[], buttons: [] as { key: string; label: string }[] }
  const go = (node: any) => {
    if (node === null || typeof node !== 'object') return
    if (node.type === 'Svg') out.svgs.push({ alt: node.props?.alt ?? '', source: node.props?.source ?? '', height: node.props?.height ?? 0 })
    if (node.type === 'Button') out.buttons.push({ key: node.key ?? node.props?.key ?? '', label: node.props?.label ?? '' })
    for (const c of node.children ?? []) go(c)
  }
  go(tree)
  return out
}

async function boot($: any, on: any, w: World) {
  const clock = mock.clock(on, { now: NOW0 })
  stubWorld(on, w)
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(5000)
  await clock.settle()
  return clock
}

// A quiet world: no running subagent either (the default fake world has one, and a working subagent is "working").
const world = (names: string[] = []): World => {
  const w = newWorld()
  w.agents = []
  w.sessions = [...names]
  for (const n of names) w.panes[n] = IDLE_PANE
  return w
}

let pane: any = null
let band: any = null
const paneOf = async ($: any) => {
  if (pane !== null) await pane.unmount().catch(() => undefined)
  pane = await $.ui.mount(PANE)
  return walk(await pane.drawn())
}
const bandOf = async ($: any) => {
  if (band !== null) await band.unmount().catch(() => undefined)
  band = await $.ui.mount(BAND)
  return walk(await band.drawn())
}
const crewLine = async ($: any): Promise<string> => (await bandOf($)).buttons.find(b => b.key === 'band-crew')?.label ?? ''
const rowOf = async ($: any, name: string): Promise<Svg | undefined> => (await paneOf($)).svgs.find(s => s.alt.startsWith(name))
const listCalls = (w: World): number => callsOf(w, 'tmux').filter(c => c[1] === 'list-sessions').length

// ---------------------------------------------------------------------------
// The pure rules

test('pgrep output: only an opencode run counts, the tools around it never do, the newest pid first', async () => {
  const out = parsePgrep(
    [
      '4242 opencode run Read and do /Users/x/home/.cockpit/agents/queue/brief-oc-genui13c.md',
      '4300 /opt/homebrew/bin/opencode run --model anthropic/claude-sonnet-5-5 "Read and do brief-b22.md"',
      '4311 pgrep -fl opencode run',
      '4312 grep opencode run',
      '4313 /bin/zsh -c opencode run something',
      '4400 vim notes about opencode.txt',
      '',
    ].join('\n'),
  )
  expect(out.map(r => r.pid)).toEqual([4300, 4242])
  expect(out.map(r => r.brief)).toEqual(['brief-b22.md', 'brief-oc-genui13c.md'])
  expect(parsePgrep('')).toEqual([])
  expect(parsePgrep('not a process line')).toEqual([])
})

test('a brief name is found in the run\'s arguments; its short label drops the brief- and oc- prefixes', async () => {
  expect(briefNameIn('opencode run Read and do /a/queue/brief-oc-cockpit9.md')).toBe('brief-oc-cockpit9.md')
  expect(briefNameIn('opencode run "do brief-b22.md now"')).toBe('brief-b22.md')
  expect(briefNameIn('opencode run hello')).toBe('')
  expect(briefLabelOf('brief-oc-genui13c.md')).toBe('genui13c')
  expect(briefLabelOf('brief-b22.md')).toBe('b22')
  expect(briefLabelOf('')).toBe('')
})

test('ps etime: seconds, minutes, hours and days as milliseconds; anything else is unknown', async () => {
  expect(parseEtime('  01:23\n')).toBe(83_000)
  expect(parseEtime('1:02:03')).toBe(3_723_000)
  expect(parseEtime('2-03:04:05')).toBe(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000)
  expect(parseEtime('')).toBeNull()
  expect(parseEtime('abc')).toBeNull()
})

test('a pane that changed in the last 60 s is working; a pane first seen just now has not changed', async () => {
  expect(paneChangedRecently(NOW0 - 10_000, NOW0 - 60_000, NOW0)).toBe(true)
  expect(paneChangedRecently(NOW0 - 59_000, NOW0 - 120_000, NOW0)).toBe(true)
  expect(paneChangedRecently(NOW0 - 61_000, NOW0 - 120_000, NOW0)).toBe(false)
  // First sight is the baseline (since equals first seen): not a change.
  expect(paneChangedRecently(NOW0 - 1000, NOW0 - 1000, NOW0)).toBe(false)
  expect(paneChangedRecently(null, null, NOW0)).toBe(false)
  expect(paneChangedRecently(Number.NaN, NOW0, NOW0)).toBe(false)
})

test('a sessions entry: matched by sessionId, status busy is working, any other status is idle, no entry is unknown', async () => {
  const entry = (id: string, status: string, extra: Record<string, unknown> = {}) => parseSessionEntry(JSON.stringify({ sessionId: id, status, ...extra }))!
  const list = [entry('a', 'idle'), entry('b', 'busy', { updatedAt: '2026-10-08T21:59:00Z' }), entry('c', 'waiting')]
  expect(fileBusy(list, 'b')).toEqual({ busy: true, sinceMs: Date.parse('2026-10-08T21:59:00Z') })
  expect(fileBusy(list, 'a')?.busy).toBe(false)
  expect(fileBusy(list, 'c')?.busy).toBe(false)
  expect(fileBusy(list, 'zzz')).toBeNull()
  expect(fileBusy(list, '')).toBeNull()
  expect(parseSessionEntry('{not json')).toBeNull()
  expect(parseSessionEntry('{"status":"busy"}')).toBeNull()
  expect(parseSessionEntry('[]')).toBeNull()
  expect(entry('d', 'BUSY').status).toBe('busy')
})

test('the timer: a poll every 5 s while anything works and every 30 s otherwise; a redraw every 1 s and every 5 s', async () => {
  expect(pollDue(5000, 0, true)).toBe(true)
  expect(pollDue(4999, 0, true)).toBe(false)
  expect(pollDue(29_999, 0, false)).toBe(false)
  expect(pollDue(30_000, 0, false)).toBe(true)
  expect(redrawDue(1000, 0, true)).toBe(true)
  expect(redrawDue(999, 0, true)).toBe(false)
  expect(redrawDue(4999, 0, false)).toBe(false)
  expect(redrawDue(5000, 0, false)).toBe(true)
})

test('this session is busy from the file or from a fresh event; an event that never completes stops counting after 10 minutes', async () => {
  expect(mainIsBusy({ eventBusyAt: null, fileBusy: true, now: NOW0 })).toBe(true)
  expect(mainIsBusy({ eventBusyAt: NOW0 - 1000, fileBusy: null, now: NOW0 })).toBe(true)
  expect(mainIsBusy({ eventBusyAt: NOW0 - 11 * MIN, fileBusy: false, now: NOW0 })).toBe(false)
  expect(mainIsBusy({ eventBusyAt: null, fileBusy: false, now: NOW0 })).toBe(false)
  expect(mainIsBusy({ eventBusyAt: null, fileBusy: null, now: NOW0 })).toBe(false)
})

// ---------------------------------------------------------------------------
// opencode run

test('an opencode run is the opencode-1 member WORKING with its brief as the item; 0 working never shows while it runs', async ($, on) => {
  const w = world(['opencode-1'])
  w.pgrep = '4242 opencode run Read and do ' + QUEUE + '/brief-oc-genui13c.md\n'
  put(w, QUEUE + '/brief-oc-genui13c.md', '# GENUI-13c: Home places blocks at their paragraph (OpenCode, one pass)\n', NOW0 - MIN)
  await boot($, on, w)
  expect(await crewLine($)).toBe('1 crew: 1 working')
  const row = await rowOf($, 'opencode-1')
  expect(row?.source).toContain('>working<')
  expect(row?.source).not.toContain('>sleeping<')
  // The item is the brief it was given (its heading, as a short target), never "nothing".
  expect(row?.alt.toLowerCase()).toContain('genui')
  expect(callsOf(w, 'pgrep').every(c => c.join(' ') === 'pgrep -fl opencode run')).toBe(true)
})

test('an opencode run with no tmux session still makes the member: opencode-1 working', async ($, on) => {
  const w = world([])
  w.pgrep = '4242 opencode run Read and do ' + QUEUE + '/brief-b22.md\n'
  await boot($, on, w)
  expect(await crewLine($)).toBe('1 crew: 1 working')
  const row = await rowOf($, 'opencode-1')
  expect(row?.source).toContain('>working<')
  // No brief file to read: the item is the short label of the brief's name.
  expect(row?.alt).toContain('b22')
})

test('no opencode run: the member sleeps (or is not there); nothing says working', async ($, on) => {
  const w = world(['opencode-1'])
  await boot($, on, w)
  expect(await crewLine($)).toBe('1 crew: 0 working')
  expect((await rowOf($, 'opencode-1'))?.source).not.toContain('>working<')
  const bare = world([])
  expect(bare.pgrep).toBe('')
})

test('a run that starts later is seen by the timer with no other event; when it ends the member goes back to sleep', async ($, on) => {
  const w = world(['opencode-1'])
  const clock = await boot($, on, w)
  expect(await crewLine($)).toBe('1 crew: 0 working')
  w.pgrep = '4242 opencode run Read and do ' + QUEUE + '/brief-oc-pairing-copy.md\n'
  await clock.advance(6000)
  await clock.settle()
  expect(await crewLine($)).toBe('1 crew: 1 working')
  w.pgrep = ''
  await clock.advance(6000)
  await clock.settle()
  expect(await crewLine($)).toBe('1 crew: 0 working')
})

// ---------------------------------------------------------------------------
// A live Codex pane

test('a Codex pane that changed in the last 60 s is working even when its markers say idle; a minute later it sleeps', async ($, on) => {
  const w = world(['codex-a'])
  const clock = await boot($, on, w)
  expect(await crewLine($)).toBe('1 crew: 0 working')
  // The pane's text changes, and every line of it is an idle marker.
  w.panes['codex-a'] = IDLE_PANE + '\n• Done: one more line.\n'
  await clock.advance(30_000)
  await clock.settle()
  expect(await crewLine($)).toBe('1 crew: 1 working')
  await clock.advance(61_000)
  await clock.settle()
  expect(await crewLine($)).toBe('1 crew: 0 working')
})

test('a Codex pane that does not change stays asleep: first sight is never a change', async ($, on) => {
  const w = world(['codex-a', 'codex-b'])
  const clock = await boot($, on, w)
  await clock.advance(40_000)
  await clock.settle()
  expect(await crewLine($)).toBe('2 crew: 0 working')
})

// ---------------------------------------------------------------------------
// The status file's age

test('a status file over 30 minutes old shows the amber "stale: updated Nh ago" chip on the NOW line; a fresh one shows none', async ($, on) => {
  const w = world([])
  put(w, DATA + '/status.json', JSON.stringify({ updated: new Date(NOW0 - 2 * 60 * MIN).toISOString(), milestone: 'M', done: 1, total: 2, now: ['a thing'], next: [], you: [] }), NOW0)
  await boot($, on, w)
  const stale = (await paneOf($)).svgs[0]?.source ?? ''
  expect(stale).toContain('>stale: updated 2h ago<')
  expect(stale.indexOf('stale: updated')).toBeGreaterThan(stale.indexOf('>NOW<'))
  expect(stale.indexOf('stale: updated')).toBeLessThan(stale.indexOf('>NEXT<'))
})

test('the card turns fresh by itself when the file is rewritten (its mtime moved): the chip goes, with no event', async ($, on) => {
  const w = world([])
  put(w, DATA + '/status.json', JSON.stringify({ updated: new Date(NOW0 - 2 * 60 * MIN).toISOString(), milestone: 'M', done: 1, total: 2, now: ['a thing'], next: [], you: [] }), NOW0 - 2 * 60 * MIN)
  const clock = await boot($, on, w)
  expect((await paneOf($)).svgs[0]?.source ?? '').toContain('stale')
  put(w, DATA + '/status.json', JSON.stringify({ updated: new Date(NOW0 + 5000).toISOString(), milestone: 'M', done: 1, total: 2, now: ['a thing'], next: [], you: [] }), NOW0 + 5000)
  await clock.advance(6000)
  await clock.settle()
  expect((await paneOf($)).svgs[0]?.source ?? '').not.toContain('stale')
})

// ---------------------------------------------------------------------------
// Refresh: 5 s while anything works, 30 s otherwise; never waiting for an event

test('while something works the panel polls every 5 s', async ($, on) => {
  const w = world(['codex-a'])
  w.panes['codex-a'] = WORKING_PANE
  const clock = await boot($, on, w)
  const before = listCalls(w)
  await clock.advance(20_000)
  await clock.settle()
  expect(listCalls(w) - before).toBe(4)
})

test('when nothing works it polls every 30 s, not every 5 s', async ($, on) => {
  const w = world(['codex-a'])
  const clock = await boot($, on, w)
  const before = listCalls(w)
  // The last poll was at 0 s (the start); boot has run 5 s. No poll until 30 s.
  await clock.advance(20_000)
  await clock.settle()
  expect(listCalls(w) - before).toBe(0)
  await clock.advance(10_000)
  await clock.settle()
  expect(listCalls(w) - before).toBe(1)
})

test('a changed status file brings a poll at once, even in the 30 s idle rhythm', async ($, on) => {
  const w = world(['codex-a'])
  const clock = await boot($, on, w)
  const before = listCalls(w)
  put(w, DATA + '/status.json', JSON.stringify({ updated: new Date(NOW0).toISOString(), milestone: 'M', done: 0, total: 1, now: [], next: [], you: [] }), NOW0 + 6000)
  await clock.advance(6000)
  await clock.settle()
  expect(listCalls(w) - before).toBe(1)
})

// ---------------------------------------------------------------------------
// This session, from its own entry in ~/.claude/sessions/<pid>.json

// Every write moves the file's mtime, as a real write does (the mod re-reads a file only when its mtime moved).
let writes = 0
const session = (w: World, status: string, extra: Record<string, unknown> = {}, id = w.sessionId, pid = '4001'): void => {
  writes += 1
  put(w, SESSIONS + '/' + pid + '.json', JSON.stringify({ pid: Number(pid), sessionId: id, status, ...extra }), NOW0 + writes * 1000)
}

test('this session says sleeping while the sessions file says idle', async ($, on) => {
  const w = world([])
  session(w, 'idle')
  await boot($, on, w)
  const row = await rowOf($, 'Session')
  expect(row?.source).toContain('>sleeping<')
  expect(row?.source).not.toContain('>working<')
})

test('FAKE CLOCK: the tick flips this session from sleeping to working when the sessions file changes to busy, with no other event', async ($, on) => {
  const w = world([])
  session(w, 'idle')
  const clock = await boot($, on, w)
  expect((await rowOf($, 'Session'))?.source).toContain('>idle<')
  expect(await crewLine($)).toBe('0 crew: 0 working')
  // Only the file changes: no turn, tool or prompt event, no session event.
  session(w, 'busy', { updatedAt: new Date(NOW0 + 5000).toISOString() })
  await clock.advance(5000)
  await clock.settle()
  const row = await rowOf($, 'Session')
  expect(row?.source).toContain('>working<')
  expect(row?.source).not.toContain('>sleeping<')
  // And back, the same way.
  session(w, 'idle')
  await clock.advance(5000)
  await clock.settle()
  expect((await rowOf($, 'Session'))?.source).toContain('>idle<')
})

test('the entry is matched by sessionId: another session\'s busy entry changes nothing here', async ($, on) => {
  const w = world([])
  session(w, 'idle')
  session(w, 'busy', {}, 'some-other-session', '4002')
  const clock = await boot($, on, w)
  await clock.advance(10_000)
  await clock.settle()
  expect((await rowOf($, 'Session'))?.source).toContain('>idle<')
})

test('a busy session shows a live elapsed timer that moves every second', async ($, on) => {
  const w = world([])
  session(w, 'busy', { updatedAt: new Date(NOW0).toISOString() })
  const clock = await boot($, on, w)
  // Boot ran 5 s past the busy start: 0:05 (or a second more with the timer's own rounding).
  const first = (await rowOf($, 'Session'))?.source ?? ''
  expect(first).toMatch(/>0:0[5-6]</)
  await clock.advance(3000)
  await clock.settle()
  const later = (await rowOf($, 'Session'))?.source ?? ''
  expect(later).toMatch(/>0:0[8-9]</)
})

test('while this session works the tick redraws every second (the timer is real, not an event)', async ($, on) => {
  const w = world([])
  session(w, 'busy', { updatedAt: new Date(NOW0).toISOString() })
  const clock = await boot($, on, w)
  // One mounted pane, never re-mounted: whatever it shows next came from a redraw the timer asked for.
  const m = await $.ui.mount(PANE)
  const shown = async (): Promise<string> => walk(await m.drawn()).svgs.find(s => s.alt.startsWith('Session'))?.source.match(/>(\d+:\d\d)</)?.[1] ?? ''
  const seen = new Set<string>([await shown()])
  for (let i = 0; i < 4; i++) {
    await clock.advance(1000)
    await clock.settle()
    seen.add(await shown())
  }
  // Five readings over four seconds: the elapsed text moved on every tick.
  expect(seen.size).toBe(5)
  await m.unmount().catch(() => undefined)
})

test('a sessions folder that is missing or unreadable changes nothing (nothing is known from it)', async ($, on) => {
  const w = world([])
  await boot($, on, w)
  expect((await rowOf($, 'Session'))?.source).toContain('>idle<')
})

// ---------------------------------------------------------------------------
// Events: a prompt, a turn, a tool, a model step flip this session to working before the file says so.

test('a submitted prompt flips this session to working at once; the file (idle) does not undo it within the event window', async ($, on) => {
  const w = world([])
  session(w, 'idle')
  // The hooks beneath the plugin (the engine's own end of the call) are registered before the test first calls $.
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  const clock = await boot($, on, w)
  expect((await rowOf($, 'Session'))?.source).toContain('>idle<')
  await $.prompt.submit({ text: 'hello' } as never).catch(() => undefined)
  await clock.advance(1000)
  await clock.settle()
  expect((await rowOf($, 'Session'))?.source).toContain('>working<')
})

// ---------------------------------------------------------------------------
// The bar's third line: Active and the panel button at the right edge (v9 item 1)

test('the Active pill and the panel button sit at the RIGHT edge of the bar; the crew count and the badges stay left', async ($, on) => {
  const w = world(['codex-a'])
  await boot($, on, w)
  if (band !== null) await band.unmount().catch(() => undefined)
  band = await $.ui.mount(BAND)
  const tree = await band.drawn()
  const boxes: any[] = []
  const go = (n: any) => {
    if (n === null || typeof n !== 'object') return
    if (n.type === 'Box') boxes.push(n)
    for (const c of n.children ?? []) go(c)
  }
  go(tree)
  const keyOf = (n: any): string => n.key ?? n.props?.key ?? ''
  const line = boxes.find(b => keyOf(b) === 'crew-band')
  expect(line?.props?.justifyContent).toBe('flex-start')
  const left = boxes.find(b => keyOf(b) === 'crew-band-left')
  const right = boxes.find(b => keyOf(b) === 'crew-band-right')
  const buttonKeys = (b: any): string[] => {
    const out: string[] = []
    const walkIt = (n: any) => {
      if (n === null || typeof n !== 'object') return
      if (n.type === 'Button') out.push(keyOf(n))
      for (const c of n.children ?? []) walkIt(c)
    }
    walkIt(b)
    return out
  }
  expect(buttonKeys(right)).toEqual(['crew-presence', 'crew-open'])
  expect(buttonKeys(left)).toContain('band-crew')
  expect(buttonKeys(left)).not.toContain('crew-presence')
  expect(buttonKeys(left)).not.toContain('crew-open')
  // The line's own children are exactly the two groups, left first.
  expect((line?.children ?? []).map(keyOf)).toEqual(['crew-band-left', 'crew-band-right'])
})
