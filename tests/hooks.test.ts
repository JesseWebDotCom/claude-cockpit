import { expect, mock, test } from 'claude-code/testing'

import { CLAUDE_DIR, DATA, HOME, IDLE_PANE, QUEUE, WORKING_PANE, callsOf, newWorld, put, stubWorld, tmuxCalls, withoutExtras } from './world.ts'
import type { World } from './world.ts'
import { count, isWellFormed } from './helpers.ts'
import { PANE_OPENCODE_A } from './fixtures.ts'

const NOW0 = Date.parse('2026-10-08T22:00:00Z')
const MIN = 60_000
const HOUR = 60 * MIN

const BAND = {
  plugin: 'cockpit',
  component: 'AbovePrompt',
  requestId: 'band',
  surface: 'terminal',
  viewport: { columns: 100, rows: 30 },
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 11 }, view: {} },
} as const

const PANE = {
  plugin: 'cockpit',
  component: 'Pane',
  requestId: 'crew',
  surface: 'terminal',
  viewport: { columns: 100, rows: 30 },
  // A roomy pane (60 rows) so nothing is windowed away; the pinned layout has its own test with a small one.
  props: { title: 'Cockpit', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const

const DESKTOP_PANE = { ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 80 } } as const
const DESKTOP_BAND = { ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns: 120 } } as const

type Svg = { key: string; source: string; alt: string; width: number; height: number }

const SVG_KEYS: [RegExp, string][] = [
  [/^Status/, 'svg-status'],
  [/^Session/, 'svg-session'],
  [/^Limits/, 'svg-limits'],
  [/^[\d]+ sleeping:/, 'svg-sleepers'],
  [/^While you were away/, 'svg-away'],
  [/^Blocked by/, 'svg-deps'],
  [/^Queue:/, 'svg-queue'],
  [/^Backlog:/, 'svg-backlog'],
  [/^Inbox:/, 'svg-inbox'],
  [/^Landed today/, 'svg-landed'],
  // COCKPIT-26: the section bodies. The three headers ("System (closed): ...") are not mapped; the System card's sub-sections are.
  [/^Flight log entries/, 'svg-flight'],
  [/^Black box events/, 'svg-blackbox'],
  [/^System: /, 'svg-sys-res'],
  [/^Services/, 'svg-sys-services'],
  [/^Plan limits/, 'svg-sys-plans'],
  [/^API and cloud credits/, 'svg-sys-credits'],
  [/^Context and startup cost/, 'svg-sys-ctx'],
  [/^Sessions/, 'svg-sys-sess'],
  [/^Memory and config counts/, 'svg-sys-mem'],
  [/^Keys and options/, 'svg-sys-keys'],
]

// The Svg elements, and the Buttons and Texts, of a drawn tree, in document order.
function walk(tree: unknown): { svgs: Svg[]; buttons: { key: string; label: string }[]; texts: string[] } {
  const out = { svgs: [] as Svg[], buttons: [] as { key: string; label: string }[], texts: [] as string[] }
  const go = (node: any) => {
    if (node === null || typeof node !== 'object') return
    // An Svg node carries no key in the drawn tree, so cards are told apart by their alt text.
    if (node.type === 'Svg') out.svgs.push({ ...node.props, key: SVG_KEYS.find(([re]) => re.test(node.props?.alt ?? ''))?.[1] ?? '' })
    if (node.type === 'Button') out.buttons.push({ key: node.key ?? node.props?.key ?? '', label: node.props?.label ?? '' })
    if (node.type === 'Text') out.texts.push((node.children ?? []).join(''))
    for (const c of node.children ?? []) go(c)
  }
  go(tree)
  return out
}

async function boot($: any, on: any, w: World, surface: 'desktop' | 'terminal' = 'desktop') {
  mountedPane = null
  mountedBand = null
  const clock = mock.clock(on, { now: NOW0 })
  stubWorld(on, w)
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface, isInteractive: true, cwd: '/work' })
  await clock.advance(5000)
  await clock.settle()
  return clock
}

// One pane and one band can be mounted at a time: a new mount replaces the last.
let mountedPane: any = null
let mountedBand: any = null

async function pane($: any, surface: 'desktop' | 'terminal' = 'desktop') {
  if (mountedPane !== null) await mountedPane.unmount().catch(() => undefined)
  const m = await $.ui.mount(surface === 'desktop' ? DESKTOP_PANE : PANE)
  mountedPane = m
  return { m, ...walk(await m.drawn()) }
}

async function bandOf($: any, surface: 'desktop' | 'terminal' = 'desktop') {
  if (mountedBand !== null) await mountedBand.unmount().catch(() => undefined)
  const m = await $.ui.mount(surface === 'desktop' ? DESKTOP_BAND : BAND)
  mountedBand = m
  return { m, ...walk(await m.drawn()) }
}

type Node = { type?: string; key?: string; props?: Record<string, any>; children?: unknown[] }
const find = (tree: unknown, pred: (n: Node) => boolean, out: Node[] = []): Node[] => {
  if (tree === null || typeof tree !== 'object') return out
  const n = tree as Node
  if (pred(n)) out.push(n)
  for (const c of n.children ?? []) find(c, pred, out)
  return out
}
const textOf = (n: Node): string => (n.children ?? []).map(c => (typeof c === 'string' ? c : textOf(c as Node))).join('')

// Everything the band says, in one string: the Svg alt texts, the Button labels and the native Text. The band
// (v6) is native Buttons and Text beside small Svgs, so a person's clicks have real targets.
const bandSays = (b: { svgs: Svg[]; buttons: { key: string; label: string }[]; texts: string[] }): string => [...b.svgs.map(s => s.alt), ...b.buttons.map(x => x.label), ...b.texts].join(' | ')

const crewWorld = (names: string[] = ['codex-a', 'codex-b'], panes: Record<string, string> = {}): World => {
  const w = newWorld()
  w.sessions = [...names]
  for (const n of names) w.panes[n] = panes[n] ?? IDLE_PANE
  return w
}

const MUTATING = ['new-session', 'kill-session', 'send-keys']
const run = ($: any, args: string, command = 'crew') => $.command.run({ command, args } as never)

// ---------------------------------------------------------------------------
// The poll is read only, and the crew is whatever tmux has

test('the poll only reads: tmux list/capture/display, ps, tail, git log, curl, ssh; nothing mutating', async ($, on) => {
  const w = crewWorld(['codex-a', 'opencode-1', 'main'])
  w.gitLog = '9dc1cecd chore: bump\n'
  await boot($, on, w)
  const bins = new Set(w.calls.map(c => c[0]))
  for (const b of bins) expect(['tmux', 'ps', 'tail', 'git', 'curl', 'ssh', 'bash', 'memory_pressure', 'sysctl', 'df', 'sqlite3', 'find', 'awk', 'tee', 'pgrep'].includes(b ?? '')).toBe(true)
  // v9: the one new reader, pgrep for an opencode run (it only lists; nothing is signalled).
  expect(callsOf(w, 'pgrep').every(c => c.join(' ') === 'pgrep -fl opencode run')).toBe(true)
  // The system commands are exactly the read-only ones asked for; `ps -Ao rss=,comm=` takes names only,
  // never the arguments, and no process is ever killed.
  expect(callsOf(w, 'memory_pressure')).toEqual([['memory_pressure', '-Q']])
  expect(callsOf(w, 'sysctl').map(c => c.join(' ')).sort()).toEqual(['sysctl -n hw.ncpu', 'sysctl -n vm.loadavg', 'sysctl -n vm.swapusage'])
  expect(callsOf(w, 'df')).toEqual([['df', '-k', '/']])
  expect(callsOf(w, 'ps').some(c => c.join(' ') === 'ps -Ao rss=,comm=')).toBe(true)
  expect(w.calls.some(c => c[0] === 'kill' || c[0] === 'killall' || c[0] === 'pkill')).toBe(false)
  // A listed host: one ssh with BatchMode and a 3 s timeout, asking only for memory and the GPU (its gpu flag is on).
  const box = callsOf(w, 'ssh').find(c => (c[6] ?? '').startsWith('free -m'))
  expect(box?.slice(0, 6)).toEqual(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=3', 'gpu-alias'])
  expect(box?.[6]).toBe('free -m; nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader 2>/dev/null; true')
  for (const sub of MUTATING) expect(tmuxCalls(w, sub).length).toBe(0)
  // The usage debug log is the one thing appended (once at start, and only when a source's answer changes).
  expect(w.writes.filter(x => !x.path.endsWith('usage-debug.log')).length).toBe(0)
  expect(callsOf(w, 'tee').filter(c => !c.includes(DATA + '/usage-debug.log')).length).toBe(0)
  // The git log is local refs only: no fetch, no pull, and exactly the asked arguments.
  const git = callsOf(w, 'git')
  expect(git.length).toBeGreaterThan(0)
  expect(git[0]).toEqual(['git', '-C', HOME, 'log', '--since=midnight', '--format=%h %s', 'origin/main'])
  for (const g of git) expect(g.join(' ')).not.toMatch(/\b(fetch|pull|push|checkout|reset)\b/)
  // A listed service gets one GET that prints the code and the time; nothing else goes over ssh.
  expect(callsOf(w, 'curl')[0]).toEqual(['curl', '-s', '-m', '2', '-o', '/dev/null', '-w', '%{http_code} %{time_total}', 'http://localhost:3000/health'])
  expect(callsOf(w, 'ssh').every(c => (c[6] ?? '').startsWith('free -m'))).toBe(true)
})

for (const n of [0, 1, 7, 12]) {
  test('a crew of ' + n + ': the panel grows or shrinks to it, nobody is hardcoded', async ($, on) => {
    const names = Array.from({ length: n }, (_, i) => 'codex-' + (i + 1))
    const w = crewWorld([...names, 'unrelated'])
    await boot($, on, w)
    const p = await pane($)
    // Sleeping members collapse into ONE line when there are two or more; one sleeper keeps its own row.
    const members = p.svgs.filter(s => /^codex-\d+ /.test(s.alt))
    expect(members.length).toBe(n === 1 ? 1 : 0)
    // COCKPIT-23: the counter chips are gone.
    expect(p.buttons.filter(b => /^(queue|backlog|inbox|health|landed|deps)$/.test(b.key)).length).toBe(0)
    const sleepers = p.svgs.find(s => s.key === 'svg-sleepers')
    expect(sleepers !== undefined).toBe(n >= 2)
    if (n >= 2) for (let i = 1; i <= n; i++) expect(sleepers?.alt).toContain('codex-' + i)
    // COCKPIT-26: "no crew running" is a one-line card (an Svg), never bare text.
    expect(p.svgs.some(s => s.alt === 'no crew running')).toBe(n === 0)
    expect(p.texts.some(t => t === 'no crew running')).toBe(false)
    // This session and the Limits area are always there, and no row belongs to the other session.
    expect(p.svgs.some(s => s.alt.startsWith('Session'))).toBe(true)
    expect(p.svgs.some(s => s.key === 'svg-limits')).toBe(true)
    expect(p.svgs.some(s => s.alt.includes('unrelated'))).toBe(false)
    for (const s of p.svgs) {
      expect(isWellFormed(s.source)).toBe(true)
      expect(s.source).not.toMatch(/NaN|undefined/)
    }
    // Each row is one svg of its own height.
    for (const s of p.svgs) expect(s.source).toContain(`height="${s.height}"`)
    await p.m.unmount()
    const band = await bandOf($)
    // Line 1 the milestone progress, line 2 the pools' meters, line 3 the crew count (v8): no characters in the bar.
    expect(band.svgs[0]?.alt).toMatch(/^Milestone /)
    expect(band.svgs.some(s => /^System: /.test(s.alt))).toBe(true)
    expect(band.svgs.some(s => /^Claude: /.test(s.alt))).toBe(true)
    expect(band.buttons.find(b => b.key === 'band-crew')?.label).toBe(`${n} crew: 0 working`)
    expect(count(band.svgs.map(s => s.source).join(''), 'class="sp c-')).toBe(0)
  })
}

test('a tmux session with a lock file is in the crew even with another name', async ($, on) => {
  const w = crewWorld(['scratch-x', 'codex-a'])
  put(w, DATA + '/lane-locks/scratch-x.lock', 'coordinator\tscratch-x\t2026-10-08T20:00:00Z\tb40\n', NOW0 - HOUR)
  await boot($, on, w)
  const p = await pane($)
  // Both sleep, so they share the one collapsed line.
  expect(p.svgs.find(s => s.key === 'svg-sleepers')?.alt).toContain('scratch-x')
})

test('a new session appears and a closed one disappears on the next poll', async ($, on) => {
  const w = crewWorld(['codex-a'])
  const clock = await boot($, on, w)
  expect((await pane($)).svgs.filter(s => /^codex-/.test(s.alt)).length).toBe(1)
  w.sessions.push('codex-zz')
  w.panes['codex-zz'] = WORKING_PANE
  await clock.advance(5000)
  await clock.settle()
  // The working member is in a group above the sleeping one (the fixed crew order).
  expect((await pane($)).svgs.filter(s => /^codex-/.test(s.alt)).map(s => s.alt.split(' ')[0])).toEqual(['codex-zz', 'codex-a'])
  w.sessions = ['codex-zz']
  await clock.advance(5000)
  await clock.settle()
  expect((await pane($)).svgs.filter(s => /^codex-/.test(s.alt)).map(s => s.alt.split(' ')[0])).toEqual(['codex-zz'])
})

// ---------------------------------------------------------------------------
// A member's row: activity, target, powered by, description

test('a row says what the member is doing and to what, what powers it and its plain-words task', async ($, on) => {
  const w = crewWorld(['codex-a', 'codex-b'], { 'codex-a': WORKING_PANE })
  // v11: a lock names a sleeper's item only when it was written AFTER the lane went quiet (the mod first sees it at NOW0);
  // an older lock is history and shows nothing.
  put(w, DATA + '/lane-locks/codex-b.lock', 'coordinator\tcodex-b\t2026-10-08T20:00:00Z\tb20\n', NOW0 + 1000)
  put(w, QUEUE + '/brief-b20.md', '# b20: land ADMIN-HOME-SETTINGS-01 without the home-location field\n\nbody\n', NOW0 - HOUR)
  put(w, DATA + '/crew-targets.json', JSON.stringify({ b20: 'Home Settings' }), NOW0)
  await boot($, on, w)
  const p = await pane($)
  const a = p.svgs.find(s => s.alt.startsWith('codex-a '))
  const b = p.svgs.find(s => s.alt.startsWith('codex-b '))
  // codex-a works and edits: the coding pose and pill; powered by the pane's model line.
  expect(a?.source).toContain('class="sp c-codex a-coding"')
  expect(a?.source).toContain('>working<')
  // codex-b is idle and holds b20: sleeping, target from crew-targets.json, description from the brief
  // (the description is in the hover text, never on the one-line row).
  expect(b?.source).toContain('class="sp c-codex sleep"')
  // The state and the item are two separate elements: a chip with the word only, then the item in muted text.
  expect(b?.source).toContain('>sleeping<')
  // v11: line 2 is the item id (the title lives in the open row and the hover text), as muted text of its own.
  expect(b?.source).toMatch(/<text class="s"[^>]*>b20<\/text>/)
  expect(b?.source).not.toContain('sleeping \u00b7 b20')
  expect(b?.alt).toContain('land ADMIN-HOME-SETTINGS-01 without the home-location field')
  expect(b?.source).not.toMatch(/<text[^>]*>land ADMIN-HOME-SETTINGS-01/)
  expect(b?.source).toContain('>GPT-6 low<')
  // 52 px: a crew row is two lines.
  expect(b?.source).toContain('height="52"')
  // The working row has no sleeping z, the idle row has no tail.
  expect(a?.source).not.toContain('class="zz')
  expect(b?.source).not.toMatch(/<text[^>]*>Done: the report/)
})

test('opencode: description is the newest brief-oc heading, never the raw pane tail; powered by from the ps args', async ($, on) => {
  const w = crewWorld(['opencode-1'], { 'opencode-1': 'some code => x\n\u2592\u2592 zsh \u2592\u2592 100\u2592 21:29:35\nesc interrupt\n' })
  put(w, QUEUE + '/brief-oc-lanes-mod4.md', '# Crew mod v4\n\nbody\n', NOW0 - MIN)
  put(w, QUEUE + '/brief-oc-lanes-mod3.md', '# Lanes mod v3\n\nbody\n', NOW0 - HOUR)
  w.ps = 'zsh\nopencode run -m anthropic/claude-sonnet-5-5 --print-logs "do it"\n'
  // v11: the brief is the lane's item only while a run is given it (or a claim or the pane names it).
  w.pgrep = '4242 opencode run Read and do ' + QUEUE + '/brief-oc-lanes-mod4.md\n'
  await boot($, on, w)
  const p = await pane($)
  const o = p.svgs.find(s => s.alt.startsWith('opencode-1 '))
  expect(o?.alt).toContain('Crew mod v4')
  expect(o?.alt).not.toContain('zsh')
  expect(o?.source).toContain('>Sonnet 5.5<')
  expect(o?.source).toContain('class="sp c-api')
  // The junk line is not drawn anywhere in the row.
  expect(o?.source).not.toContain('zsh')
  expect(o?.source).not.toContain('=&gt;')
})

test('opencode with no brief shows "no task", not junk; with no run it shows the last model seen, dim', async ($, on) => {
  const w = crewWorld(['opencode-1'], { 'opencode-1': 'foo();\nzsh 100% 21:29:35\n' })
  w.ps = 'opencode run -m openai/gpt-5 "x"\n'
  const clock = await boot($, on, w)
  let o = (await pane($)).svgs.find(s => s.alt.startsWith('opencode-1 '))
  expect(o?.alt).toContain('no task')
  expect(o?.source).toContain('>GPT-5<')
  expect(o?.alt).toContain('OpenAI API \u00b7 gpt-5')
  // The process ends: the last model is still shown, now dim (class "m").
  w.ps = 'zsh\n'
  await clock.advance(20000)
  await clock.settle()
  o = (await pane($)).svgs.find(s => s.alt.startsWith('opencode-1 '))
  expect(o?.source).toMatch(/class="m"[^>]*>GPT-5/)
})

// ---------------------------------------------------------------------------
// Stale, stuck, blocked

test('stale: only an idle lane with a lock file over 6 h old, after 30 minutes without a change', async ($, on) => {
  const w = crewWorld(['codex-b'])
  put(w, DATA + '/lane-locks/codex-b.lock', 'coordinator\tcodex-b\t2026-10-08T10:00:00Z\tb20\n', NOW0 - 8 * HOUR)
  const clock = await boot($, on, w)
  let b = (await pane($)).svgs.find(s => s.alt.startsWith('codex-b '))
  expect(b?.source).not.toContain('stale?')
  await clock.advance(31 * MIN)
  await clock.settle()
  b = (await pane($)).svgs.find(s => s.alt.startsWith('codex-b '))
  expect(b?.source).toContain('stale?')
  expect(b?.source).toContain('class="sp c-codex sleep stale"')
})

test('stuck: a working lane with no pane change for 45 minutes turns amber with "stuck?" and the band says so', async ($, on) => {
  const w = crewWorld(['codex-a'], { 'codex-a': WORKING_PANE })
  const clock = await boot($, on, w)
  let a = (await pane($)).svgs.find(s => s.alt.startsWith('codex-a '))
  expect(a?.source).not.toContain('stuck?')
  await clock.advance(46 * MIN)
  await clock.settle()
  a = (await pane($)).svgs.find(s => s.alt.startsWith('codex-a '))
  // The reason is on a second line without opening the row; the state is its own chip.
  expect(a?.source).toContain('stuck? no change for a long while')
  expect(a?.source).toContain('class="sp c-codex a-stuck"')
  expect(a?.source).toContain('>stuck<')
  expect(a?.height).toBe(52)
  // Errored, blocked and stuck members are ONE short button on the band: "! 1".
  expect((await bandOf($)).texts).toContain('! 1')
})

test('blocked: a chip with the why, the asking pose on a sleeper, "N blocked" in the band, a graph on request', async ($, on) => {
  const w = crewWorld(['codex-a', 'codex-b'], { 'codex-a': WORKING_PANE })
  put(w, DATA + '/lane-locks/codex-a.lock', 'c\tcodex-a\tt\tb20c\n', NOW0 - HOUR)
  put(w, DATA + '/crew-deps.json', JSON.stringify({ waits: [{ member: 'codex-b', on: 'codex-a', why: 'needs b20c installer fix on main' }] }), NOW0)
  await boot($, on, w)
  const p = await pane($)
  const b = p.svgs.find(s => s.alt.startsWith('codex-b '))
  expect(b?.source).toContain('blocked by codex-a: needs b20c installer fix on main')
  expect(b?.source).toContain('class="sp c-codex a-asking"')
  expect(b?.height).toBe(52)
  // The state chip still says what the pane says.
  expect(b?.source).toContain('>sleeping<')
  expect(p.svgs.find(s => s.alt.startsWith('codex-a '))?.source).not.toContain('blocked by')
  expect((await bandOf($)).texts).toContain('! 1')
  // COCKPIT-23: no "N blocked" chip or graph card; the blocked member is a BLOCKED row in the Flight log.
  expect(p.buttons.some(x => x.key === 'deps')).toBe(false)
  expect(p.svgs.some(s => s.key === 'svg-deps')).toBe(false)
  // The Flight log is a card with its header; its entries show when it is opened (COCKPIT-26).
  expect(p.svgs.some(s => s.key === 'svg-flight')).toBe(false)
  await p.m.press({ key: 'cs-flight' })
  const flight = walk(await p.m.drawn()).svgs.find(s => s.key === 'svg-flight')
  expect(flight?.source).toContain('BLOCKED')
  expect(flight?.source).toContain('codex-b')
  expect(isWellFormed(flight?.source ?? '')).toBe(true)
})

test('an automatic edge: a pane waiting for the gate lock is blocked by the holder', async ($, on) => {
  const w = crewWorld(['codex-a', 'codex-b'], { 'codex-a': WORKING_PANE, 'codex-b': '• Ran bash scripts/check.sh\n== gate-lock: waiting for lock\n• Working (3s \u2022 esc to interrupt)\n' })
  w.gateStatus = 'gate lock held by codex-a (pid 4412)\n'
  // The gate-lock script exists (the mod only asks it for `status`).
  put(w, HOME + '/../.github/standards/bin/gate-lock.sh', '#!/bin/bash\n', 0)
  await boot($, on, w)
  const b = (await pane($)).svgs.find(s => s.alt.startsWith('codex-b '))
  expect(b?.source).toContain('blocked by codex-a')
  expect(b?.source).toContain('waiting for the machine-wide gate lock')
  expect(callsOf(w, 'bash').length).toBeGreaterThan(0)
  expect(callsOf(w, 'bash')[0]?.slice(-1)).toEqual(['status'])
})

// ---------------------------------------------------------------------------
// The Status card, you, presence, the away log

// v10: written AFTER the lanes in these worlds started (a status older than the live evidence yields its NOW to the live lanes).
const STATUS = { updated: new Date(NOW0 + 30_000).toISOString(), milestone: 'Admin Home settings live', done: 3, total: 6, now: ['lanes mod v3b'], next: ['b20c rerun'], you: [{ text: 'approve the pin bump', blocking: 'b20c waits on it' }, { text: 'look at the tiles' }] }

test('the Status card is the first thing in the pane; "you: N" is red in the band when an ask blocks', async ($, on) => {
  const w = crewWorld(['codex-a'])
  put(w, DATA + '/status.json', JSON.stringify(STATUS), NOW0)
  await boot($, on, w)
  const p = await pane($)
  expect(p.svgs[0]?.key).toBe('svg-status')
  const s = p.svgs[0]?.source ?? ''
  expect(s).toContain('Admin Home settings live')
  expect(s).toContain('>3/6<')
  // Now, Next and You are three labelled single lines: the label muted, the text in its own colour.
  expect(s).toMatch(/>NOW<\/text>/)
  expect(s).toMatch(/<text class="t"[^>]*>lanes mod v3b<\/text>/)
  expect(s).toMatch(/>NEXT<\/text>/)
  expect(s).toContain('>b20c rerun<')
  expect(s).toContain('approve the pin bump [blocking: b20c waits on it]')
  // A blocking ask is red; a fresh status shows no age at all.
  expect(s).toMatch(/<text class="errc"[^>]*>approve the pin bump/)
  expect(s).not.toContain('3m ago')
  expect(s).not.toContain('<circle')
  const band = await bandOf($)
  expect(bandSays(band)).toContain('you: 2')
  expect(JSON.stringify(await band.m.drawn())).toMatch(/"color":"red","bold":true[^}]*}[^]*you: 2|you: 2/)
  // The Claude row's target is the first "now" item.
  expect(p.svgs.find(x => x.alt.startsWith('Session'))?.source).toContain('lanes mod v3b')
})

test('a status file older than 30 minutes is dimmed and says so; no file says so too', async ($, on) => {
  const w = crewWorld([])
  put(w, DATA + '/status.json', JSON.stringify({ ...STATUS, updated: new Date(NOW0 - 50 * MIN).toISOString(), you: [] }), NOW0)
  await boot($, on, w)
  const s = (await pane($)).svgs[0]?.source ?? ''
  // Past 30 minutes only (v9): an amber "stale: updated Nh ago" chip on the NOW line, so a stale card is visible.
  expect(s).toMatch(/>stale: updated 50m ago<\/text>/)
  expect(s.indexOf('stale: updated')).toBeGreaterThan(s.indexOf('>NOW<'))
  expect(s).toMatch(/>YOU<\/text>[^]*>nothing<\/text>/)
})

test('a fresh status file shows no stale chip; the chip says hours once it is hours old (v9)', async ($, on) => {
  const w = crewWorld([])
  put(w, DATA + '/status.json', JSON.stringify({ ...STATUS, updated: new Date(NOW0 - 5 * MIN).toISOString(), you: [] }), NOW0)
  await boot($, on, w)
  expect(((await pane($)).svgs[0]?.source ?? '')).not.toContain('stale')
})

test('the stale chip says hours once the status is hours old (v9)', async ($, on) => {
  const w = crewWorld([])
  put(w, DATA + '/status.json', JSON.stringify({ ...STATUS, updated: new Date(NOW0 - 3 * HOUR).toISOString(), you: [] }), NOW0)
  await boot($, on, w)
  expect(((await pane($)).svgs[0]?.source ?? '')).toContain('>stale: updated 3h ago<')
})

test('no status file: the card falls back to "Main status" with what landed, and the pane still draws', async ($, on) => {
  const w = crewWorld(['codex-a'])
  w.gitLog = '9dc1cecd chore: bump\n'
  const clock = await boot($, on, w)
  await clock.advance(31000)
  await clock.settle()
  const p = await pane($)
  expect(p.svgs[0]?.source).toContain('>Main status<')
  expect(p.svgs[0]?.source).toContain('1 landed')
  expect(bandSays(await bandOf($))).not.toContain('you:')
})

test('Active / Away: the pill, the commands, the key, the file', async ($, on) => {
  const w = crewWorld(['codex-a'])
  put(w, DATA + '/presence.json', '{"mode":"active","since":"2026-10-08T20:00:00Z"}\n', NOW0)
  const clock = await boot($, on, w)
  // The band's presence is a button (click toggles it); the pane's Status card carries the chip.
  expect((await bandOf($)).buttons.find(x => x.key === 'crew-presence')?.label).toBe('\u25be')
  expect((await bandOf($)).texts).toContain(' Active ')
  // 0.5.0: the card has no chip; the button row of the pane carries the pill.
  expect((await pane($)).svgs[0]?.source).not.toContain('>Active<')
  const away = await run($, 'away')
  expect(away.text).toContain('away')
  const written = w.writes.find(x => x.path === DATA + '/presence.json')
  expect(JSON.parse(written?.text ?? '{}')).toEqual({ mode: 'away', since: new Date(NOW0 + 5000).toISOString() })
  // The pane and the band show Away with the moon, and "away since" in the card. (Time moves by a minute here: the
  // v9 timer ticks every 5 s when idle, so hours of fake time are thousands of ticks.)
  await clock.advance(MIN)
  await clock.settle()
  const p = await pane($)
  expect(p.svgs[0]?.source).toContain('>Away<')
  expect((await bandOf($)).buttons.find(x => x.key === 'crew-presence')?.label).toBe('\u25be')
  expect((await bandOf($)).texts).toContain(' Away ')
  // The AUTOPILOT button in the pane's button row toggles it back; the band's Away button does the same at any time.
  await p.m.press({ key: 'crew-presence' })
  await clock.settle()
  expect(JSON.parse(w.writes[w.writes.length - 1]?.text ?? '{}').mode).toBe('active')
  const back = await run($, 'back')
  expect(back.text).toContain('back')
})

test('the "While you were away" card lists the away log after going back, and "clear log" empties it', async ($, on) => {
  const w = crewWorld(['codex-a'])
  put(w, DATA + '/presence.json', '{"mode":"active","since":"2026-10-08T20:00:00Z"}\n', NOW0)
  put(w, DATA + '/away-log.md', '# Away log\n- Decided to keep the pin at v0.1.112\n- BLOCKED: b20c needs the pairing code\n', NOW0)
  await boot($, on, w)
  const p = await pane($)
  const card = p.svgs.find(s => s.key === 'svg-away')
  expect(card?.source).toContain('Decided to keep the pin')
  expect(card?.source).toContain('BLOCKED')
  expect(card?.source).toContain('#EF4444')
  expect(card?.source).toContain('While you were away')
  expect(p.buttons.find(x => x.key === 'away-clear')?.label).toBe('clear log')
  await p.m.press({ key: 'away-clear' })
  expect(w.writes.some(x => x.path === DATA + '/away-log.md' && x.text === '')).toBe(true)
})

test('while away the card is not shown (it is for the person coming back)', async ($, on) => {
  const w = crewWorld([])
  put(w, DATA + '/presence.json', '{"mode":"away","since":"2026-10-08T20:00:00Z"}\n', NOW0)
  put(w, DATA + '/away-log.md', '- BLOCKED: x\n', NOW0)
  await boot($, on, w)
  expect((await pane($)).svgs.some(s => s.key === 'svg-away')).toBe(false)
})

// ---------------------------------------------------------------------------
// Context pressure

const jline = (model: string, input: number, create: number, read: number): string =>
  JSON.stringify({ type: 'assistant', message: { model, usage: { input_tokens: input, cache_creation_input_tokens: create, cache_read_input_tokens: read, output_tokens: 10 } } }) + '\n'

test('the session row (v8): context is NOT a bar or a percent on the row; its pressure reason is on line 2 and the open row shows it as "Context"', async ($, on) => {
  const w = crewWorld(['codex-a'])
  const file = CLAUDE_DIR + '/live.jsonl'
  put(w, file, 'x', NOW0)
  put(w, CLAUDE_DIR + '/old.jsonl', 'x', NOW0 - 5 * HOUR)
  w.tails[file] = '{"cut off\n' + jline('claude-opus-5-5', 6, 1000, 146994)
  await boot($, on, w)
  const p = await pane($)
  const m = p.svgs.find(s => s.alt.startsWith('Session'))
  // Sam: "claude ctx makes no sense": the context window is another thing from the plan usage. No bar, no percent.
  expect(m?.source).not.toContain('>74%<')
  expect(m?.source).not.toContain('height="3" rx="1.5"')
  expect(m?.alt).toContain('context 74% \u00b7 148k of 200k')
  expect(m?.source).toContain('>Opus 5.5<')
  // The pressure reason (it names "context") is on the row's second line; the advice is in the card.
  expect(m?.source).toContain('context 74%: write the handoff, then /clear')
  expect(m?.alt).toContain('write the handoff first (ask the coordinator)')
  // Opened, the row shows the context bar under its own name.
  await p.m.press({ key: 'row-session' })
  const open = walk(await p.m.drawn()).svgs.find(s => s.alt.startsWith('Session'))
  expect(open?.source).toContain('>Context<')
  expect(open?.source).toContain('148k of 200k')
  // The live file is the newest by mtime, and was read through tail only.
  expect(callsOf(w, 'tail').some(c => c.includes(file) && c.includes('204800') === false && c.includes('200000'))).toBe(true)
  expect(callsOf(w, 'tail').some(c => c.includes(CLAUDE_DIR + '/old.jsonl'))).toBe(false)
})

test('context at 85% is red; a handoff newer than 15 minutes says it is safe to /clear', async ($, on) => {
  const w = crewWorld([])
  const file = CLAUDE_DIR + '/live.jsonl'
  put(w, file, 'x', NOW0)
  w.tails[file] = jline('claude-sonnet-5-5', 10, 0, 175000)
  put(w, DATA + '/agents/HANDOFF-' + new Date(NOW0).getFullYear() + '-10-08.md', 'x', NOW0 - 5 * MIN)
  await boot($, on, w)
  const m = (await pane($)).svgs.find(s => s.alt.startsWith('Session'))
  // 88% context is red, as the pressure reason on line 2 (no bar, no percent on the row).
  expect(m?.source).not.toContain('>88%<')
  expect(m?.source).toMatch(/<text class="errc"[^>]*>context 88%/)
  // The handoff file is named by the local date; whether it counts as today's depends on the zone, so
  // either the green line or the amber one is in the card, never both.
  const green = m?.alt.includes('safe to /clear: handoff saved') ?? false
  const amber = m?.alt.includes('write the handoff first (ask the coordinator)') ?? false
  expect(green !== amber).toBe(true)
})

test('unreadable context says "no data", never NaN', async ($, on) => {
  const w = crewWorld([])
  await boot($, on, w)
  const m = (await pane($)).svgs.find(s => s.alt.startsWith('Session'))
  expect(m?.alt).toContain('no data')
  expect(m?.source).not.toMatch(/NaN|undefined/)
})

// ---------------------------------------------------------------------------
// The one-line summaries, collapsed by default, and what they open

test('the default view: status, crew, one-line summaries; nothing else is open', async ($, on) => {
  const w = crewWorld(['codex-a'])
  put(w, QUEUE + '/brief-b30.md', '# b30: Land Place Map\n', NOW0 - MIN)
  put(w, QUEUE + '/brief-b31.md', '# b31: done already\n', NOW0 - MIN)
  put(w, QUEUE + '/reports/b31-report.md', 'report', NOW0)
  put(w, QUEUE + '/brief-oc-x.md', '# oc\n', NOW0)
  put(w, DATA + '/inbox.jsonl', '{"id":"a3f","kind":"bug","text":"blank page","at":"2026-10-08T21:00:00.000Z","by":"sam","status":"new"}\n{"id":"b71","kind":"feature","text":"dark mode","at":"2026-10-08T21:30:00.000Z","by":"sam","status":"new"}\n', NOW0)
  put(w, HOME + '/docs/BACKLOG.md', '# Backlog\n- [ ] **A-01: first**\n- [~] **B-02: second**\n- [x] **C-03: third**\n', NOW0)
  w.gitLog = '9dc1cecd chore: bump\n4d3cf848 feat: place\n'
  put(w, QUEUE + '/reports/b30-report.md', 'x', 0)
  w.files.delete(QUEUE + '/reports/b30-report.md')
  put(w, QUEUE + '/reports/z1-report.md', 'Commit 4d3cf848 pushed.\n- Gate exit code: **1**\n', NOW0)
  await boot($, on, w)
  const p = await pane($)
  // COCKPIT-23: no counter chips and no tab strip; none of the old section cards is drawn.
  for (const k of ['queue', 'backlog', 'inbox', 'health', 'landed', 'deps', 'tab-crew', 'tab-items', 'tab-inbox', 'tab-health', 'ui-help']) expect(p.buttons.some(b => b.key === k)).toBe(false)
  for (const k of ['svg-queue', 'svg-backlog', 'svg-inbox', 'svg-health', 'svg-landed', 'svg-deps', 'svg-system']) expect(p.svgs.some(s => s.key === k)).toBe(false)
  // Status, this session, the Limits area: the default cards, the Limits area last.
  expect(p.svgs.map(s => s.key).filter(k => ['svg-status', 'svg-session', 'svg-limits'].includes(k))).toEqual(['svg-status', 'svg-session', 'svg-limits'])
})

test('the System card opens on its header and holds the Health content (services, limits, credits) as sub-sections; the same press closes it', async ($, on) => {
  const w = crewWorld(['codex-a'])
  put(w, DATA + '/credits.json', '{"opencode":{"left":"$12","expires":"Oct 20"},"cloud":{"expires":"Oct 25"}}', NOW0)
  await boot($, on, w)
  const p = await pane($)
  expect(p.buttons.find(b => b.key === 'cs-system')?.label).toBe('\u25b8')
  await p.m.press({ key: 'cs-system' })
  const open = walk(await p.m.drawn())
  const by = (k: string) => open.svgs.find(s => s.key === k)?.source ?? ''
  expect(by('svg-sys-services')).toContain('Web app')
  expect(by('svg-sys-services')).toContain('up, 42 ms')
  expect(by('svg-sys-credits')).toContain('API: not readable')
  expect(by('svg-sys-credits')).not.toContain('OpenCode (Claude API): $12 left \u00b7 expires Oct 20')
  expect(by('svg-sys-credits')).toContain('Claude cloud: expires Oct 25')
  expect(by('svg-sys-res')).not.toBe('')
  // The Flight log and the Black box are still drawn (headers) under the open System card.
  expect(open.buttons.map(b => b.key)).toEqual(expect.arrayContaining(['cs-flight', 'cs-blackbox']))
  for (const s of open.svgs) expect(isWellFormed(s.source)).toBe(true)
  await p.m.press({ key: 'cs-system' })
  expect(walk(await p.m.drawn()).svgs.some(s => s.key === 'svg-sys-services')).toBe(false)
})

test('health: a listed service that does not answer is down, in red (inside the System card)', async ($, on) => {
  const w = crewWorld([])
  w.serviceCode = '000'
  await boot($, on, w)
  const p = await pane($)
  await p.m.press({ key: 'cs-system' })
  const h = walk(await p.m.drawn()).svgs.find(s => s.key === 'svg-sys-services')?.source ?? ''
  expect(h).toContain('Web app')
  expect(h).toContain('down')
  expect(h).not.toContain(['St', 'ack'].join(''))
})

test('no hosts and no services listed: nothing extra is shown and nothing extra is probed (no ssh, no HTTP)', async ($, on) => {
  const w = crewWorld([])
  withoutExtras(w)
  await boot($, on, w)
  const p = await pane($)
  await p.m.press({ key: 'cs-system' })
  const open = walk(await p.m.drawn())
  expect(open.svgs.some(s => s.key === 'svg-sys-services')).toBe(false)
  expect(callsOf(w, 'ssh')).toEqual([])
  expect(callsOf(w, 'curl')).toEqual([])
  const card = open.svgs.find(s => s.alt.startsWith('System:'))?.source ?? ''
  expect(card).toContain('Memory 59% used')
  expect(card).not.toContain('host-a')
})

// A Codex session log whose limits read 52% (5h) and 97% (week) used.
function codexLimitsWorld(names: string[] = ['codex-a']): World {
  const w = crewWorld(names)
  const log = USER_HOME_CODEX()
  put(w, log.dir + '/rollout.jsonl', 'x', NOW0)
  const future = Math.floor(NOW0 / 1000) + 3600
  w.tails[log.dir + '/rollout.jsonl'] = '{"payload":{"rate_limits":{"primary":{"used_percent":52,"window_minutes":300,"resets_at":' + future + '},"secondary":{"used_percent":97,"window_minutes":10080,"resets_at":' + (future + 86400) + '}}}}\n'
  return w
}

test('the Limits area: Codex 5h AND week as two bars with the percent inside, the Claude plan beside it, pinned at the bottom', async ($, on) => {
  const w = codexLimitsWorld()
  w.rateLimits = [
    { kind: 'five_hour', percentUsed: 31, resetsAt: new Date(NOW0 + 2 * HOUR).toISOString() },
    { kind: 'seven_day', percentUsed: 62, resetsAt: new Date(NOW0 + 3 * 24 * HOUR).toISOString() },
  ]
  await boot($, on, w)
  const p = await pane($)
  const u = p.svgs.find(s => s.key === 'svg-limits')
  expect(u?.source).toContain('>52%<')
  expect(u?.source).toContain('>97%<')
  expect(u?.source).toContain('#F85149')
  expect(u?.source).toContain('>31%<')
  expect(u?.source).toContain('>62%<')
  // Both windows of both plans, in words, in the hover text.
  expect(u?.alt).toContain('Claude: 5h 31% used')
  expect(u?.alt).toContain('week 62% used')
  expect(u?.alt).toContain('Codex: 5h 52% used')
  expect(u?.alt).toContain('week 97% used')
  // The Limits area is the LAST thing in the pane (pinned at the bottom), the Status card the first.
  expect(p.svgs[0]?.key).toBe('svg-status')
  expect(p.svgs[p.svgs.length - 1]?.key).toBe('svg-limits')
})

test('Claude with no readable windows is ONE muted line "Claude: plan usage not readable", never three, never invented', async ($, on) => {
  const w = codexLimitsWorld()
  await boot($, on, w)
  const u = (await pane($)).svgs.find(s => s.key === 'svg-limits')
  // The hover text still names both windows; the drawing is one line.
  expect(u?.alt).toContain('Claude: 5h not readable here  week not readable here')
  expect((u?.source.match(/plan usage not readable/g) ?? []).length).toBe(1)
  expect(u?.source).toMatch(/<text class="m"[^>]*>plan usage not readable<\/text>/)
  expect(u?.source).toMatch(/<text class="m"[^>]*font-weight="600">Claude<\/text>/)
  // Codex is readable: its two bars are there beside it.
  expect(u?.source).toContain('>52%<')
  expect(u?.source).toContain('>97%<')
})

// Addendum 1: wherever a plan's limit is drawn or written, BOTH windows are there, 5h and week together.
test('no summary anywhere shows one window without the other: the Limits area, the Health card, the terminal and /crew-status', async ($, on) => {
  const w = codexLimitsWorld()
  // Claude reports only its 5h window: the week must still be there, as "not readable here".
  w.rateLimits = [{ kind: 'five_hour', percentUsed: 31, resetsAt: new Date(NOW0 + 2 * HOUR).toISOString() }]
  await boot($, on, w)
  const everyLine = (text: string): string[] => text.split(/;|\n/).map(s => s.trim()).filter(l => /\b5h\b|\bweek\b/.test(l))
  const check = (label: string, text: string): void => {
    const lines = everyLine(text)
    expect(lines.length).toBeGreaterThan(0)
    for (const l of lines) {
      expect(/\b5h\b/.test(l) && /\bweek\b/.test(l)).toBe(true)
      void label
    }
  }
  const p = await pane($)
  check('limits area alt', p.svgs.find(s => s.key === 'svg-limits')?.alt ?? '')
  expect(p.svgs.find(s => s.key === 'svg-limits')?.alt).toContain('Claude: 5h 31% used')
  expect(p.svgs.find(s => s.key === 'svg-limits')?.alt).toContain('week not readable here')
  // Drawn: the 5h bar with its percent, and the week still there, as "n/a" (never hidden).
  expect(p.svgs.find(s => s.key === 'svg-limits')?.source).toContain('>31%<')
  expect(p.svgs.find(s => s.key === 'svg-limits')?.source).toContain('>n/a<')
  await p.m.press({ key: 'cs-system' })
  const health = walk(await p.m.drawn()).svgs.find(s => s.key === 'svg-sys-plans')
  check('health alt', health?.alt ?? '')
  const rows = [...(health?.source ?? '').matchAll(/>([^<>]*(?:5h|week)[^<>]*)</g)].map(m => m[1] ?? '')
  expect(rows.length).toBeGreaterThanOrEqual(2)
  for (const r of rows) expect(/5h/.test(r) && /week/.test(r)).toBe(true)
  check('terminal', (await pane($, 'terminal')).texts.join('\n'))
  check('/crew-status', (await run($, '', 'crew-status')).text)
})

test('the band carries no limits text any more, and the terminal pane lists both windows of every plan', async ($, on) => {
  const w = codexLimitsWorld()
  await boot($, on, w)
  // The bar above the input shows usage as METERS, not as text: no button label or native text carries a figure.
  const b = await bandOf($)
  expect([...b.buttons.map(x => x.label), ...b.texts].join(' | ')).not.toMatch(/5h|week|used|52%|97%/)
  const t = (await pane($, 'terminal')).texts.join('\n')
  expect(t).toContain('Codex: 5h 52% used')
  expect(t).toContain('week 97% used')
  expect(t).toContain('Claude: 5h not readable here  week not readable here')
})

test('a Codex pool at 100% dims its members and its bar; 97% does not', async ($, on) => {
  const w = codexLimitsWorld(['codex-a', 'codex-b'])
  const log = USER_HOME_CODEX()
  const future = Math.floor(NOW0 / 1000) + 3600
  w.tails[log.dir + '/rollout.jsonl'] = '{"payload":{"rate_limits":{"primary":{"used_percent":52,"window_minutes":300,"resets_at":' + future + '},"secondary":{"used_percent":100,"window_minutes":10080,"resets_at":' + (future + 86400) + '}}}}\n'
  const clock = await boot($, on, w)
  await clock.advance(31000)
  await clock.settle()
  const p = await pane($)
  const out = p.svgs.find(s => s.alt.startsWith('codex-a '))
  expect(out?.source).toContain('opacity="0.45"')
  expect(out?.source).toContain('out of credits \u00b7 back ')
  expect(out?.source).toContain('class="sp c-codex sleep out"')
  const limits = p.svgs.find(s => s.key === 'svg-limits')
  expect(limits?.source).toContain('opacity="0.45"')
  expect(limits?.alt).toMatch(/Codex: .*\(out, back /)
  // 97% is not out.
  w.tails[log.dir + '/rollout.jsonl'] = '{"payload":{"rate_limits":{"primary":{"used_percent":52,"window_minutes":300,"resets_at":' + future + '},"secondary":{"used_percent":97,"window_minutes":10080,"resets_at":' + (future + 86400) + '}}}}\n'
  await clock.advance(31000)
  await clock.settle()
  const p2 = await pane($)
  expect(p2.svgs.find(s => s.alt.startsWith('codex-a '))?.source ?? '').not.toContain('opacity="0.45"')
  expect(p2.svgs.find(s => s.key === 'svg-limits')?.source).not.toContain('opacity="0.45"')
})

function USER_HOME_CODEX() {
  return { dir: '/Users/test/.codex/sessions/2026/10/08' }
}

// ---------------------------------------------------------------------------
// Commands

test('/crew toggles the panel; /lanes is the same; /crew-status and /lanes-status print the crew as text', async ($, on) => {
  const w = crewWorld(['codex-a', 'codex-b'], { 'codex-a': WORKING_PANE })
  put(w, DATA + '/status.json', JSON.stringify(STATUS), NOW0)
  await boot($, on, w)
  expect((await run($, '')).text).toBe('Cockpit opened.')
  expect((await run($, '', 'lanes')).text).toBe('Cockpit opened.')
  expect(w.opened.length).toBe(2)
  expect(w.opened[0]).toEqual({ id: 'crew', title: 'Cockpit' })
  for (const cmd of ['crew-status', 'lanes-status']) {
    const t = (await run($, '', cmd)).text
    expect(t).toContain('Admin Home settings live')
    expect(t).toContain('Now: lanes mod v3b')
    expect(t).toContain('codex-a  coding')
    expect(t).toContain('codex-b  sleeping')
    expect(t).toContain('You: approve the pin bump [blocking: b20c waits on it] | look at the tiles')
  }
  expect((await run($, 'status')).text).toContain('codex-b')
  expect((await run($, 'dance')).text).toContain('unknown: /cockpit dance')
})

test('/crew start codex-e: asks first, then runs plain codex with no model or effort; logs it', async ($, on) => {
  const w = crewWorld(['codex-a'])
  await boot($, on, w)
  const ask = await run($, 'start codex-e')
  expect(ask.text.startsWith('press y to confirm:')).toBe(true)
  expect(ask.text).toContain('plain codex')
  expect(tmuxCalls(w, 'new-session').length).toBe(0)
  const done = await run($, 'confirm')
  expect(done.text).toBe('done: start codex-e')
  expect(tmuxCalls(w, 'new-session')).toEqual([['tmux', 'new-session', '-d', '-s', 'codex-e', '-c', HOME, 'codex']])
  expect(w.sessions).toContain('codex-e')
  const log = w.files.get(DATA + '/crew-actions.log')?.text ?? ''
  expect(log).toMatch(/\tstart\tcodex-e\tdone\n$/)
  // Confirmed once: a second confirm has nothing to do.
  expect((await run($, 'confirm')).text).toBe('nothing to confirm')
  expect(tmuxCalls(w, 'new-session').length).toBe(1)
})

test('start: an existing session, an opencode name and a bad name are refused and logged', async ($, on) => {
  const w = crewWorld(['codex-a'])
  await boot($, on, w)
  expect((await run($, 'start codex-a')).text).toBe('not done: codex-a is already running')
  expect((await run($, 'start opencode-9')).text).toContain('not done')
  expect((await run($, 'start codex-e;ls')).text).toContain('not done')
  expect((await run($, 'start')).text).toContain('usage: /cockpit start')
  for (const sub of MUTATING) expect(tmuxCalls(w, sub).length).toBe(0)
  const log = w.files.get(DATA + '/crew-actions.log')?.text ?? ''
  expect(log).toContain('\tstart\tcodex-a\trefused: codex-a is already running')
})

test('/crew restart: only an idle lane (5 min) with no lock; kill, then start; never on a working lane', async ($, on) => {
  const w = crewWorld(['codex-a', 'codex-b', 'codex-c'], { 'codex-a': WORKING_PANE })
  put(w, DATA + '/lane-locks/codex-c.lock', 'c\tcodex-c\tt\tb40\n', NOW0 - HOUR)
  const clock = await boot($, on, w)
  // Idle for only 5 s: refused.
  expect((await run($, 'restart codex-b')).text).toContain('has not been idle for 5 minutes')
  await clock.advance(6 * MIN)
  await clock.settle()
  // Working: refused. A lock: refused.
  expect((await run($, 'restart codex-a')).text).toContain('is working')
  expect((await run($, 'restart codex-c')).text).toContain('holds a lock file')
  expect(tmuxCalls(w, 'kill-session').length).toBe(0)
  // Idle 6 min, no lock: asks, then kills and starts.
  const ask = await run($, 'restart codex-b')
  expect(ask.text).toContain('press y to confirm')
  expect(tmuxCalls(w, 'kill-session').length).toBe(0)
  expect((await run($, 'confirm')).text).toBe('done: restart codex-b')
  expect(tmuxCalls(w, 'kill-session')).toEqual([['tmux', 'kill-session', '-t', '=codex-b']])
  expect(tmuxCalls(w, 'new-session')).toEqual([['tmux', 'new-session', '-d', '-s', 'codex-b', '-c', HOME, 'codex']])
  const order = w.calls.filter(c => c[0] === 'tmux' && (c[1] === 'kill-session' || c[1] === 'new-session')).map(c => c[1])
  expect(order).toEqual(['kill-session', 'new-session'])
  expect(w.files.get(DATA + '/crew-actions.log')?.text).toContain('\trestart\tcodex-b\tdone')
})

test('/crew clear: /clear and Enter to an idle lane only', async ($, on) => {
  const w = crewWorld(['codex-a', 'codex-b'], { 'codex-a': WORKING_PANE })
  await boot($, on, w)
  expect((await run($, 'clear codex-a')).text).toContain('is working')
  expect((await run($, 'clear codex-q')).text).toContain('is not running')
  expect(tmuxCalls(w, 'send-keys').length).toBe(0)
  expect((await run($, 'clear codex-b')).text).toContain('press y to confirm')
  expect((await run($, 'y')).text).toBe('done: clear codex-b')
  expect(tmuxCalls(w, 'send-keys')).toEqual([['tmux', 'send-keys', '-t', '=codex-b:', '/clear', 'Enter']])
})

test('a lane that started working after the question is not touched at confirm', async ($, on) => {
  const w = crewWorld(['codex-b'])
  const clock = await boot($, on, w)
  expect((await run($, 'clear codex-b')).text).toContain('press y to confirm')
  // The lane starts working between the question and the answer.
  w.panes['codex-b'] = WORKING_PANE
  await clock.advance(5000)
  await clock.settle()
  const r = await run($, 'confirm')
  expect(r.text).toContain('not done')
  expect(r.text).toContain('is working')
  expect(tmuxCalls(w, 'send-keys').length).toBe(0)
  expect(w.files.get(DATA + '/crew-actions.log')?.text).toContain('refused at confirm')
})

test('cancel and expiry: n cancels; a confirmation over two minutes old is dropped', async ($, on) => {
  const w = crewWorld(['codex-b'])
  const clock = await boot($, on, w)
  await run($, 'clear codex-b')
  expect((await run($, 'no')).text).toBe('cancelled: clear codex-b')
  expect((await run($, 'confirm')).text).toBe('nothing to confirm')
  expect((await run($, 'cancel')).text).toBe('nothing to cancel')
  await run($, 'clear codex-b')
  await clock.advance(3 * MIN)
  await clock.settle()
  expect((await run($, 'confirm')).text).toContain('expired')
  expect(tmuxCalls(w, 'send-keys').length).toBe(0)
  const log = w.files.get(DATA + '/crew-actions.log')?.text ?? ''
  expect(log).toContain('cancelled')
  expect(log).toContain('expired')
})

test('the confirm line and its y / n keys are in the pane while an action waits', async ($, on) => {
  const w = crewWorld(['codex-b'])
  await boot($, on, w)
  await run($, 'clear codex-b')
  const p = await pane($)
  // COCKPIT-26: the confirm line is a card (an Svg with its text as alt), not bare text; the y and n buttons sit under it.
  expect(p.svgs.some(s => s.alt.startsWith('press y to confirm: clear codex-b'))).toBe(true)
  expect(p.texts.some(t => t.startsWith('press y to confirm'))).toBe(false)
  expect(p.buttons.map(b => b.key)).toContain('confirm-y')
  expect(p.buttons.map(b => b.key)).toContain('confirm-n')
  await p.m.press({ key: 'confirm-y' })
  expect(tmuxCalls(w, 'send-keys').length).toBe(1)
})

test('/crew bug and /crew idea append one JSON line to the inbox, and say what they added', async ($, on) => {
  const w = crewWorld([])
  await boot($, on, w)
  const bug = await run($, 'bug the page is blank on phones')
  expect(bug.text).toBe('Saved bug: the page is blank on phones (.cockpit/inbox/bugs.md)')
  const idea = await run($, 'idea dark mode for the shell')
  expect(idea.text).toBe('Saved idea: dark mode for the shell (.cockpit/inbox/ideas.md)')
  expect((await run($, 'feature a third one')).text).toContain('Saved idea')
  const file = w.files.get(DATA + '/inbox.jsonl')?.text ?? ''
  const lines = file.trim().split('\n').map(l => JSON.parse(l))
  expect(lines.length).toBe(3)
  expect(lines[0]).toMatchObject({ kind: 'bug', text: 'the page is blank on phones', by: 'sam', status: 'new' })
  expect(lines[1]).toMatchObject({ kind: 'feature', text: 'dark mode for the shell', status: 'new' })
  expect(new Set(lines.map(l => l.id)).size).toBe(3)
  // It is appended through `tee -a`, with the text on stdin: nothing is run, and no other file is written.
  expect(callsOf(w, 'tee').every(c => c[1] === '-a')).toBe(true)
  expect(w.writes.some(x => x.path.endsWith('inbox.jsonl'))).toBe(false)
  // COCKPIT-23: no Inbox tab or chip; the Status card's YOU line carries the count of new items.
  const p = await pane($)
  expect(p.buttons.some(b => b.key === 'inbox')).toBe(false)
})

test('/crew bug: empty text is refused; text is data, stored as given', async ($, on) => {
  const w = crewWorld([])
  await boot($, on, w)
  expect((await run($, 'bug')).text).toContain('Type /cockpit bug followed by')
  expect((await run($, 'idea    ')).text).toContain('Type /cockpit idea followed by')
  expect(w.files.has(DATA + '/inbox.jsonl')).toBe(false)
  await run($, 'bug $(rm -rf /) </svg> `id`')
  const o = JSON.parse((w.files.get(DATA + '/inbox.jsonl')?.text ?? '').trim())
  expect(o.text).toBe('$(rm -rf /) </svg> `id`')
  // Shown escaped wherever it appears in the pane (the Status card's YOU line, when it shows).
  const p = await pane($)
  for (const s of p.svgs) expect(isWellFormed(s.source)).toBe(true)
  // The commands that act ran nothing else.
  for (const sub of MUTATING) expect(tmuxCalls(w, sub).length).toBe(0)
})

test('an item filed by the coordinator leaves the new count; the inbox file keeps its lines (COCKPIT-23: no inbox card)', async ($, on) => {
  const w = crewWorld([])
  const clock = await boot($, on, w)
  const r = await run($, 'bug first bug')
  await run($, 'idea second idea')
  const id = /#([0-9a-f]+)/.exec(r.text)?.[1] ?? ''
  // The coordinator files the bug by appending a status line; the item lines are not touched.
  const cur = w.files.get(DATA + '/inbox.jsonl')?.text ?? ''
  put(w, DATA + '/inbox.jsonl', cur + JSON.stringify({ id, status: 'filed', ref: '#412' }) + '\n', 0)
  await clock.advance(5000)
  await clock.settle()
  const p = await pane($)
  expect(p.buttons.some(b => b.key === 'inbox')).toBe(false)
  expect(p.svgs.some(s => s.key === 'svg-inbox')).toBe(false)
  expect(w.files.get(DATA + '/inbox.jsonl')?.text.startsWith(cur)).toBe(true)
})

test('/handoff writes HANDOFF-<date>.md from the status, the locks, the queue and what landed', async ($, on) => {
  const w = crewWorld(['codex-b'])
  put(w, DATA + '/status.json', JSON.stringify(STATUS), NOW0)
  put(w, DATA + '/lane-locks/codex-b.lock', 'c\tcodex-b\tt\tb20\n', NOW0 - HOUR)
  put(w, QUEUE + '/brief-b20.md', '# b20: land the installer fix\n', NOW0 - HOUR)
  put(w, QUEUE + '/brief-b30.md', '# b30: Land Place Map\n', NOW0 - MIN)
  w.gitLog = '9dc1cecd chore: bump pin\n'
  await boot($, on, w)
  const r = await run($, '', 'handoff')
  expect(r.text).toMatch(/^\/Users\/alex\/Developer\/github\.com\/example\/home\/.cockpit\/agents\/HANDOFF-\d{4}-\d{2}-\d{2}\.md$/)
  const written = w.writes.find(x => x.path === r.text)
  expect(written).toBeDefined()
  const lines = (written?.text ?? '').split('\n')
  expect(lines[0]).toBe('Rules: org CLAUDE.md, ~/.claude/CLAUDE.md, memory index. Re-arm watchers, rebuild missing tmux lanes, read status.json.')
  expect(written?.text).toContain('Admin Home settings live (3/6)')
  expect(written?.text).toContain('- codex-b: b20 (land the installer fix)')
  expect(written?.text).toContain('- b30: Land Place Map')
  expect(written?.text).toContain('- 9dc1cecd chore: bump pin')
  expect(written?.text).toContain('- approve the pin bump (blocking: b20c waits on it)')
  // Run again the same day: the same file, overwritten.
  const again = await run($, '', 'handoff')
  expect(again.text).toBe(r.text)
  expect(w.writes.filter(x => x.path === r.text).length).toBe(2)
})

// ---------------------------------------------------------------------------
// The band, and the terminal

test('the bar (v8): three thin lines (progress, health and usage, crew), native buttons, no tooltips, one panel icon; presence toggles', async ($, on) => {
  const w = crewWorld(['codex-a', 'codex-b'], { 'codex-a': WORKING_PANE })
  put(w, DATA + '/status.json', JSON.stringify(STATUS), NOW0)
  await boot($, on, w)
  const band = await $.ui.mount(DESKTOP_BAND)
  const tree = await band.drawn()
  const t = walk(tree)
  // Line 1: the milestone progress, always; its svg is first.
  expect(t.svgs[0]?.alt).toBe('Milestone Admin Home settings live 3/6')
  expect(t.svgs[0]?.height).toBe(28)
  // Line 3: the crew count, Active, you, the panel icon; the characters are not in the bar (their names were clipped).
  const keys = t.buttons.map(b => b.key)
  expect(keys).toContain('band-crew')
  expect(keys.some(k => k.startsWith('band-open-'))).toBe(false)
  expect(t.buttons.find(b => b.key === 'band-crew')?.label).toBe('2 crew: 1 working')
  expect(t.buttons.find(b => b.key === 'crew-presence')?.label).toBe('\u25be')
  expect(t.texts).toContain(' Active ')
  expect(t.texts.some(x => x.startsWith('you: '))).toBe(true)
  expect(keys.filter(k => k === 'crew-open').length).toBe(1)
  // COCKPIT-34: the band has no usage strip and no expand glyph.
  expect(keys.filter(k => k === 'band-sys' || k === 'band-credit' || k.startsWith('meter-'))).toEqual([])
  // The pool svgs are 22 px high.
  for (const s of t.svgs.slice(1)) expect(s.height).toBe(22)
  // The loose "sys ctx away panel" text links are gone, and no label is a one-letter abbreviation.
  for (const gone of ['band-ctx', 'sys', 'ctx', 'away', 'panel']) expect(t.buttons.some(b => b.label === gone)).toBe(false)
  // No tooltips: no <title> in any band svg, and no interactive frame.
  for (const s of t.svgs) expect(s.source).not.toContain('<title>')
  expect(JSON.stringify(tree)).not.toContain('isInteractive')
  await band.press({ key: 'crew-presence' })
  expect(JSON.parse(w.writes.find(x => x.path.endsWith('presence.json'))?.text ?? '{}').mode).toBe('away')
})

test('bar clicks: the crew line opens the panel on Crew; "you: N" opens the Status card', async ($, on) => {
  const w = crewWorld(['codex-a', 'codex-b'], { 'codex-a': WORKING_PANE })
  put(w, DATA + '/lane-locks/codex-a.lock', 'c\tcodex-a\tt\tb21\n', NOW0 - HOUR)
  put(w, DATA + '/status.json', JSON.stringify(STATUS), NOW0)
  w.rateLimits = [{ kind: 'five_hour', percentUsed: 0, resetsAt: new Date(NOW0 + 3 * HOUR).toISOString() }, { kind: 'seven_day', percentUsed: 87, resetsAt: new Date(NOW0 + 2 * 24 * HOUR).toISOString() }]
  await boot($, on, w)
  const band = await bandOf($)
  await band.m.press({ key: 'band-crew' })
  expect(w.opened.some(o => o.id === 'crew')).toBe(true)
  let p = await pane($)
  expect(p.svgs.some(s => s.alt.startsWith('Session'))).toBe(true)
  // v16: "you: N" is coloured Text, not a Button (the host refuses a Button with a Text child); the crew line brings the panel back to Crew.
  await (await bandOf($)).m.press({ key: 'band-crew' })
  p = await pane($)
  expect(p.buttons.find(b => b.key === 'row-session')).toBeDefined()
  expect(p.svgs[0]?.key).toBe('svg-status')
})

test('the terminal draws the same things as text', async ($, on) => {
  const w = crewWorld(['codex-a', 'codex-b'], { 'codex-a': WORKING_PANE })
  put(w, DATA + '/status.json', JSON.stringify(STATUS), NOW0)
  await boot($, on, w, 'terminal')
  const p = await pane($, 'terminal')
  expect(p.svgs.length).toBe(0)
  const all = p.texts.join('\n')
  expect(all).toContain('Admin Home settings live')
  expect(all).toContain('Now: lanes mod v3b')
  expect(all).toContain('codex-a  coding')
  expect(all).toContain('codex-b  sleeping')
  expect(all).toContain('Queue: 0 waiting')
  const band = (await bandOf($, 'terminal'))
  expect(band.svgs.length).toBe(0)
  expect(band.texts.join(' ')).toContain('1 working')
  expect(band.texts.join(' ')).toContain('you: 2')
})

test('no svg anywhere carries NaN, undefined or markup from the data, in a full scenario', async ($, on) => {
  const w = crewWorld(['codex-a', 'codex-b', 'opencode-1', 'local-m', 'cloud-x'], { 'codex-a': WORKING_PANE, 'opencode-1': 'esc interrupt\n' })
  put(w, DATA + '/status.json', JSON.stringify({ ...STATUS, you: [{ text: '<script>x</script> & "q"', blocking: '</svg>' }], milestone: '<b>m</b>' }), NOW0)
  put(w, DATA + '/lane-locks/codex-a.lock', 'c\tcodex-a\tt\t<b>1</b>\n', NOW0 - HOUR)
  put(w, DATA + '/crew-deps.json', JSON.stringify({ waits: [{ member: 'codex-b', on: 'codex-a', why: '</text><x>' }] }), NOW0)
  w.ps = 'llama-server -m /models/q<27b>.gguf\n'
  await boot($, on, w)
  const p = await pane($)
  await p.m.press({ key: 'cs-system' })
  await p.m.press({ key: 'cs-blackbox' })
  const open = walk(await p.m.drawn())
  expect(open.svgs.length).toBeGreaterThan(5)
  for (const s of open.svgs) {
    expect(isWellFormed(s.source)).toBe(true)
    expect(s.source).not.toMatch(/NaN|undefined|Infinity/)
    expect(s.source).not.toContain('<script')
    expect(s.source).not.toContain('<b>')
  }
})

// ---------------------------------------------------------------------------
// New in v4b: the By item view, system resources, the new activities

const itemWorld = (): World => {
  const w = crewWorld(['codex-a', 'codex-b', 'codex-c'], { 'codex-a': WORKING_PANE, 'codex-b': WORKING_PANE, 'codex-c': IDLE_PANE })
  put(w, DATA + '/lane-locks/codex-a.lock', 'c\tcodex-a\tt\tb21b\n', NOW0 - 30 * MIN)
  put(w, DATA + '/lane-locks/codex-b.lock', 'c\tcodex-b\tt\tb50\n', NOW0 - 20 * MIN)
  // codex-c holds b60, so the edge "codex-b waits on codex-c" is live (an edge to a member with no lock fades).
  put(w, DATA + '/lane-locks/codex-c.lock', 'c\tcodex-c\tt\tb60\n', NOW0 - 3 * HOUR)
  put(w, QUEUE + '/brief-b60.md', '# b60: the installer fix\n', NOW0 - 3 * HOUR)
  put(w, QUEUE + '/brief-b21.md', '# b21: first try\n', NOW0 - 5 * HOUR)
  put(w, QUEUE + '/brief-b21b.md', '# b21b: land ADMIN-HOME-SETTINGS-01\n', NOW0 - 2 * HOUR)
  put(w, QUEUE + '/brief-b21c.md', '# b21c: the retry\n', NOW0 - 10 * MIN)
  put(w, QUEUE + '/brief-b30.md', '# b30: Land Place Map\n', NOW0 - 15 * MIN)
  put(w, QUEUE + '/brief-b50.md', '# b50: the installer\n', NOW0 - HOUR)
  put(w, QUEUE + '/brief-b22.md', '# b22: place resolution\n', NOW0 - 3 * HOUR)
  put(w, QUEUE + '/reports/b22-report.md', '# b22 report\n- Gate exit code: 0\nscope full\n', NOW0 - 2 * HOUR)
  put(w, QUEUE + '/reports/b17-report.md', '# b17 report\n- Gate exit code: 1\nscope full (scripts/ changed)\n', NOW0 - 30 * MIN)
  put(w, QUEUE + '/reports/b01-report.md', '# old\n- Gate exit code: 0\n', NOW0 - 30 * HOUR)
  w.gitLog = '4d3cf848 feat: place resolution (b22)\n9dc1cecd chore: bump spec pin\n'
  put(w, DATA + '/crew-deps.json', JSON.stringify({ waits: [{ member: 'codex-b', on: 'codex-c', why: 'needs the installer fix' }] }), NOW0)
  put(w, DATA + '/crew-targets.json', JSON.stringify({ b21: 'Home Settings', b30: 'Place Map' }), NOW0)
  put(w, DATA + '/status.json', JSON.stringify({ ...STATUS, now: ['b30 first'], next: ['b50 after'] }), NOW0)
  return w
}

const itemAlts = (p: { svgs: Svg[] }): string[] => p.svgs.filter(s => s.alt.startsWith('Item ')).map(s => s.alt.split(':')[0] ?? '')

test('one page, no tabs (COCKPIT-23): no tab buttons; the view command still answers and is saved; the Health sections live in the System card', async ($, on) => {
  const w = itemWorld()
  await boot($, on, w)
  let p = await pane($)
  expect(p.buttons.some(b => b.key.startsWith('tab-'))).toBe(false)
  expect(p.svgs.some(s => s.alt.startsWith('Item '))).toBe(false)
  expect(p.svgs.some(s => s.alt.startsWith('Session'))).toBe(true)
  // The Status card on top; the Limits area at the bottom.
  expect(p.svgs[0]?.key).toBe('svg-status')
  expect(p.svgs[p.svgs.length - 1]?.key).toBe('svg-limits')
  // The command sets the (terminal) view explicitly, or flips it; the pane does not change.
  expect((await run($, 'view crew')).text).toBe('view: by crew')
  expect((await run($, 'view items')).text).toBe('view: by item')
  expect((await run($, 'view item')).text).toBe('view: by item')
  expect((await run($, 'view')).text).toBe('view: by crew')
  expect((await run($, 'view')).text).toBe('view: by item')
  expect((await run($, 'view crew')).text).toBe('view: by crew')
  p = await pane($)
  expect(p.svgs.some(s => s.alt.startsWith('Item '))).toBe(false)
  // Health: its content is the System card's sub-sections (COCKPIT-26): no section buttons of its own, nothing until System is opened.
  expect(p.buttons.some(b => b.key.startsWith('hs-'))).toBe(false)
  await p.m.press({ key: 'cs-system' })
  const h = walk(await p.m.drawn())
  expect(h.buttons.some(b => b.key.startsWith('hs-'))).toBe(false)
  expect(h.svgs.map(s => s.key)).toEqual(expect.arrayContaining(['svg-sys-ctx', 'svg-sys-sess', 'svg-sys-mem']))
  expect(walk(await p.m.drawn()).svgs.at(-1)?.key).toBe('svg-limits')
  // Add Bug opens an inline text field under the button row.
  expect(JSON.stringify(await p.m.drawn())).not.toContain('"type":"Input"')
  await p.m.press({ key: 'add-bug' })
  expect(JSON.stringify(await p.m.drawn())).toContain('"type":"Input"')
})

test('an old saved tab (Sessions or Health) no longer changes the pane: it is one page', async ($, on) => {
  const w = crewWorld(['codex-a'])
  put(w, DATA + '/crew-ui.json', JSON.stringify({ tab: 'sessions' }), NOW0)
  await boot($, on, w)
  const p = await pane($)
  expect(p.buttons.some(b => b.key === 'hs-h-system')).toBe(false)
  expect(p.buttons.some(b => b.key === 'cs-system')).toBe(true)
})

test('the saved state is restored on load; a broken file gives the defaults; a plain poll never writes it', async ($, on) => {
  const w = crewWorld(['codex-a'])
  put(w, DATA + '/crew-ui.json', JSON.stringify({ tab: 'health', expanded: ['c-system'], mine: true, celebrations: false }), NOW0)
  await boot($, on, w)
  const p = await pane($)
  expect(p.buttons.find(b => b.key === 'cs-system')?.label).toBe('\u25be')
  expect(w.writes.some(x => x.path === DATA + '/crew-ui.json')).toBe(false)
})

test('a broken crew-ui.json gives the defaults', async ($, on) => {
  const w = crewWorld(['codex-a'])
  put(w, DATA + '/crew-ui.json', '{not json', NOW0)
  await boot($, on, w)
  expect((await pane($)).svgs.some(s => s.alt.startsWith('Session'))).toBe(true)
})

test('the items live in the Flight log and the crew rows: the pane has no By item rows, whatever the view command said', async ($, on) => {
  const w = itemWorld()
  await boot($, on, w)
  await run($, 'view items')
  const p = await pane($)
  expect(itemAlts(p)).toEqual([])
  expect(p.buttons.some(b => b.key === 'cs-flight')).toBe(true)
  expect(p.svgs.some(s => s.alt.startsWith('codex-a '))).toBe(true)
  for (const s of p.svgs) {
    expect(isWellFormed(s.source)).toBe(true)
    expect(s.source).not.toMatch(/NaN|undefined/)
  }
})

test('By item on the terminal: the same items as text rows', async ($, on) => {
  const w = itemWorld()
  await boot($, on, w, 'terminal')
  await run($, 'view items')
  const p = await pane($, 'terminal')
  const all = p.texts.join('\n')
  expect(all).toContain('Items')
  expect(all).toContain('1 Place Map [b30]  queued  unassigned')
  expect(all).toContain('[b50]  blocked')
  expect(all).not.toContain('codex-a  coding')
})

// ---------------------------------------------------------------------------

test('System: one line with its summary, the gauges on S, the top three by name, the box through ssh', async ($, on) => {
  const w = crewWorld(['codex-a'])
  await boot($, on, w)
  const p = await pane($)
  // The System card is collapsed; the dots in the band carry the summary, the open card the gauges.
  expect(p.svgs.some(s => s.alt.startsWith('System:'))).toBe(false)
  await p.m.press({ key: 'cs-system' })
  const shown = walk(await p.m.drawn()).svgs.find(s => s.alt.startsWith('System:'))
  expect(shown?.alt).toBe('System: healthy')
  const card = shown?.source ?? ''
  expect(card).toContain('Memory 59% used')
  expect(card).toContain('41% free, swap 1 GB')
  expect(card).toContain('CPU load 2.1')
  expect(card).toContain('10 cores')
  expect(card).toContain('Disk 60% used')
  expect(card).toContain('host-a memory 40% used')
  expect(card).toContain('host-a GPU memory 21% used')
  expect(card).toContain('Top memory: Claude 1.2 GB, node 403 MB, mDNSResponder 96 MB')
  expect(card).not.toContain('gate blocked by memory?')
  expect(isWellFormed(card)).toBe(true)
  await p.m.press({ key: 'cs-system' })
  expect(walk(await p.m.drawn()).svgs.some(s => s.alt.startsWith('System:'))).toBe(false)
})

test('System: tight and problem levels, and the hint when a gate lane waits and memory is red', async ($, on) => {
  const w = crewWorld(['codex-a', 'codex-b'], { 'codex-a': WORKING_PANE, 'codex-b': '• Ran bash scripts/check.sh\n== gate-lock: waiting for lock\n• Working (3s \u2022 esc to interrupt)\n' })
  w.memoryPressure = 'System-wide memory free percentage: 6%\n'
  const clock = await boot($, on, w)
  let p = await pane($)
  await p.m.press({ key: 'cs-system' })
  const sysSvg = async () => walk(await (await pane($)).m.drawn()).svgs.find(s => s.alt.startsWith('System:'))
  let card = await sysSvg()
  expect(card?.alt).toBe('System: problem (memory 6% free) \u00b7 gate blocked by memory?')
  expect(card?.source).toContain('gate blocked by memory?')
  expect(card?.source).toContain('#F85149')
  // The band's first dot is the red one (worst first): native dots, one per resource, coloured by level.
  const sys = (await bandOf($)).svgs.find(s => s.alt.startsWith('System: '))
  expect(sys?.source).toContain('<circle class="errc"')
  // Amber: memory tight, and no hint even with the gate waiting.
  w.memoryPressure = 'System-wide memory free percentage: 18%\n'
  await clock.advance(15000)
  await clock.settle()
  card = await sysSvg()
  expect(card?.alt).toBe('System: memory tight')
  // Swap over 6 GB is red by itself.
  w.memoryPressure = 'System-wide memory free percentage: 60%\n'
  w.swapUsage = 'total = 10.00G  used = 7.25G  free = 2.75G  (encrypted)\n'
  await clock.advance(15000)
  await clock.settle()
  p = await pane($)
  card = await sysSvg()
  expect(card?.alt).toBe('System: problem (swap 7.3 GB used) \u00b7 gate blocked by memory?')
})

test('System: a host that does not answer is grey and does not change this computer\'s summary', async ($, on) => {
  const w = crewWorld([])
  w.boxExit = 255
  await boot($, on, w)
  const p = await pane($)
  await p.m.press({ key: 'cs-system' })
  const shown = walk(await p.m.drawn()).svgs.find(s => s.alt.startsWith('System:'))
  expect(shown?.alt).toBe('System: healthy')
  const card = shown?.source ?? ''
  expect(card).toContain('ssh did not answer')
  expect(card).toContain('host-a')
})

test('System: polled every 15 s, each listed host every 60 s, not every 5 s', async ($, on) => {
  const w = crewWorld([])
  const clock = await boot($, on, w)
  const n = () => callsOf(w, 'memory_pressure').length
  const boxN = () => callsOf(w, 'ssh').filter(c => (c[6] ?? '').startsWith('free -m')).length
  // boot() ran to 5 s: the first read was at 0 s.
  expect(n()).toBe(1)
  expect(boxN()).toBe(1)
  await clock.advance(5000)
  await clock.settle()
  // 10 s after the first read: not yet.
  expect(n()).toBe(1)
  await clock.advance(5000)
  await clock.settle()
  // 15 s: the second.
  expect(n()).toBe(2)
  // Reads at 30, 45 and 60 s too, and the box a second time at 60 s.
  for (let i = 0; i < 9; i++) {
    await clock.advance(5000)
    await clock.settle()
  }
  expect(n()).toBe(5)
  expect(boxN()).toBe(2)
  // The cores are asked once, not every time.
  expect(callsOf(w, 'sysctl').filter(c => c[2] === 'hw.ncpu').length).toBe(1)
})

test('System: unreadable output says unknown, never NaN', async ($, on) => {
  const w = crewWorld([])
  w.memoryPressure = ''
  w.swapUsage = ''
  w.loadAvg = ''
  w.ncpu = ''
  w.df = ''
  w.psAll = ''
  w.boxExit = 255
  await boot($, on, w)
  const p = await pane($)
  await p.m.press({ key: 'cs-system' })
  const shown = walk(await p.m.drawn()).svgs.find(s => s.alt.startsWith('System:'))
  expect(shown?.alt).toBe('System: unknown')
  const card = shown?.source ?? ''
  expect(card).not.toMatch(/NaN|undefined/)
  expect(card).toContain('Top memory: unknown')
  expect(isWellFormed(card)).toBe(true)
})

test('new activities on a real row: researching, documenting (docs only), designing; a .ts edit stays coding', async ($, on) => {
  const w = crewWorld(['codex-a', 'codex-b', 'codex-c', 'codex-d'], {
    'codex-a': '• Searching the web for "swap used"\n• Working (3s \u2022 esc to interrupt)\n',
    'codex-b': '• Edited docs/dev/searxng.md (+60 -0)\n• Working (3s \u2022 esc to interrupt)\n',
    'codex-c': 'drafting the json schema for crew-deps\n• Working (3s \u2022 esc to interrupt)\n',
    'codex-d': '• Edited hooks/core.ts (+4 -1)\n• Working (3s \u2022 esc to interrupt)\n',
  })
  await boot($, on, w)
  const p = await pane($)
  const row = (n: string) => p.svgs.find(s => s.alt.startsWith(n + ' '))
  expect(row('codex-a')?.alt).toContain('researching')
  expect(row('codex-a')?.source).toContain('class="sp c-codex a-researching"')
  expect(row('codex-b')?.alt).toContain('documenting')
  expect(row('codex-b')?.source).toContain('class="sp c-codex a-documenting"')
  expect(row('codex-c')?.alt).toContain('designing')
  expect(row('codex-c')?.source).toContain('class="sp c-codex a-designing"')
  expect(row('codex-d')?.alt).toContain('coding')
  expect(row('codex-d')?.source).toContain('class="sp c-codex a-coding"')
  // Each has its own pill colour.
  expect(row('codex-a')?.source).toContain('#06B6D4')
  expect(row('codex-b')?.source).toContain('#CA8A04')
  expect(row('codex-c')?.source).toContain('#EC4899')
})

// ---------------------------------------------------------------------------
// Addenda 2, 4, 5, 6, 8 wired into the pane and the band

const pasteLines = (...lines: string[]): string => lines.join('\n') + '\n'
const OUT_PANE = pasteLines("You've hit your usage limit. Try again later.", '', '  ? for shortcuts')

test('errored: a dead session shows a red "errored" chip with its reason, the slumped character, the band badge next to blocked, and sits first in the crew', async ($, on) => {
  const w = crewWorld(['codex-a', 'codex-b', 'opencode-1'], { 'codex-a': WORKING_PANE, 'codex-b': WORKING_PANE, 'opencode-1': PANE_OPENCODE_A })
  put(w, DATA + '/lane-locks/opencode-1.lock', 'c\topencode-1\tt\tb70\n', NOW0 - HOUR)
  put(w, DATA + '/crew-deps.json', JSON.stringify({ waits: [{ member: 'codex-b', on: 'codex-a', why: 'needs the pin' }] }), NOW0)
  put(w, DATA + '/lane-locks/codex-a.lock', 'c\tcodex-a\tt\tb20c\n', NOW0 - HOUR)
  await boot($, on, w)
  const p = await pane($)
  const o = p.svgs.find(s => s.alt.startsWith('opencode-1 '))
  // The state chip says "errored"; the reason is on the second line without opening the row.
  expect(o?.source).toContain('>errored<')
  expect(o?.source).toMatch(/<text class="errc"[^>]*>(?:\u00b7 )?errored \u00b7 session died<\/text>/)
  expect(o?.source).toContain('#B91C1C')
  expect(o?.source).toContain('class="sp c-api a-errored"')
  expect(o?.alt).toContain('errored: session died')
  // Errored and blocked share the first group (ties by name), then the active ones.
  const order = p.svgs.filter(s => /^(codex|opencode)-/.test(s.alt)).map(s => s.alt.split(' ')[0])
  expect(order).toEqual(['codex-b', 'opencode-1', 'codex-a'])
  // The coordinator is always first, right after the Status card.
  expect(p.svgs[1]?.alt.startsWith('Session')).toBe(true)
  // The band: "errored" is counted next to "blocked".
  const band = bandSays(await bandOf($))
  expect(band).toContain('! 2')
})

test('errored with no known reason says "errored" alone; a credit refusal is "out of credits", not errored', async ($, on) => {
  const w = crewWorld(['codex-a', 'codex-b'], { 'codex-a': pasteLines('some output', '[Process exited 1]'), 'codex-b': OUT_PANE })
  await boot($, on, w)
  const p = await pane($)
  const a = p.svgs.find(s => s.alt.startsWith('codex-a '))
  expect(a?.source).toContain('>errored<')
  expect(a?.source).not.toMatch(/errored \u00b7/)
  const b = p.svgs.find(s => s.alt.startsWith('codex-b '))
  expect(b?.source).toContain('out of credits')
  expect(b?.source).not.toMatch(/<text[^>]*>errored/)
  expect(b?.source).not.toContain('#B91C1C')
  expect(b?.source).toContain('opacity="0.45"')
})

test('a member that errored shows in the Flight log as ERRORED, and its crew row is first (COCKPIT-23: no Items view)', async ($, on) => {
  const w = crewWorld(['codex-a', 'opencode-1'], { 'codex-a': WORKING_PANE, 'opencode-1': PANE_OPENCODE_A })
  put(w, DATA + '/lane-locks/codex-a.lock', 'c\tcodex-a\tt\tb20c\n', NOW0 - HOUR)
  put(w, DATA + '/lane-locks/opencode-1.lock', 'c\topencode-1\tt\tb70\n', NOW0 - HOUR)
  put(w, QUEUE + '/brief-b20c.md', '# b20c: first\n', NOW0 - HOUR)
  put(w, QUEUE + '/brief-b70.md', '# b70: second\n', NOW0 - HOUR)
  put(w, DATA + '/status.json', JSON.stringify({ ...STATUS, now: ['b20c first'], next: [] }), NOW0)
  await boot($, on, w)
  const p = await pane($)
  expect(itemAlts(p)).toEqual([])
  await p.m.press({ key: 'cs-flight' })
  expect(walk(await p.m.drawn()).svgs.find(s => s.key === 'svg-flight')?.source).toContain('ERRORED')
  const rows = p.svgs.filter(s => /^(codex-a|opencode-1) /.test(s.alt)).map(s => s.alt.split(' ')[0])
  expect(rows[0]).toBe('opencode-1')
})

test('a crew member out of credits is dimmed, sorts below the sleeping', async ($, on) => {
  const w = crewWorld(['codex-a', 'codex-b', 'codex-c'], { 'codex-a': WORKING_PANE, 'codex-b': OUT_PANE, 'codex-c': IDLE_PANE })
  await boot($, on, w)
  const p = await pane($)
  expect(p.svgs.filter(s => /^codex-/.test(s.alt)).map(s => s.alt.split(' ')[0])).toEqual(['codex-a', 'codex-c', 'codex-b'])
  // The row itself is dimmed (the bar has no characters any more).
  expect(p.svgs.find(s => s.alt.startsWith('codex-b '))?.source).toContain('class="sp c-codex sleep out"')
  expect(p.svgs.find(s => s.alt.startsWith('codex-b '))?.source).toContain('opacity="0.45"')
})

test('the order is stable: a member moves only when its group has changed for about 10 s', async ($, on) => {
  const w = crewWorld(['codex-a', 'codex-b'], { 'codex-a': WORKING_PANE, 'codex-b': IDLE_PANE })
  const clock = await boot($, on, w)
  const names = async () => (await pane($)).svgs.filter(s => /^codex-/.test(s.alt)).map(s => s.alt.split(' ')[0])
  expect(await names()).toEqual(['codex-a', 'codex-b'])
  // The two swap groups: codex-b works, codex-a sleeps. The order holds at first (no jitter) ...
  w.panes['codex-a'] = IDLE_PANE
  w.panes['codex-b'] = WORKING_PANE
  await clock.advance(5000)
  await clock.settle()
  expect(await names()).toEqual(['codex-a', 'codex-b'])
  // ... and moves once the new group has held for about 10 s. (v9: a pane that changed in the last 60 s still counts
  // as working, so codex-a is idle for good only a minute after its last change; then the 10 s hold starts.)
  await clock.advance(20000)
  await clock.settle()
  expect(await names()).toEqual(['codex-a', 'codex-b'])
  await clock.advance(60000)
  await clock.settle()
  expect(await names()).toEqual(['codex-b', 'codex-a'])
})

test('the cards (one text source): a row\'s accessible text, an open row, the Limits credits; no delayed tooltips anywhere', async ($, on) => {
  const w = crewWorld(['codex-a'], { 'codex-a': WORKING_PANE })
  put(w, DATA + '/lane-locks/codex-a.lock', 'coordinator\tcodex-a\t2026-10-08T20:00:00Z\tb21\n', NOW0 - HOUR)
  put(w, QUEUE + '/brief-b21.md', '# b21: land ADMIN-HOME-SETTINGS-01\n', NOW0 - HOUR)
  // COCKPIT-22: "Last report" is the item's newest report file (older than the lock, so the item is still the lane's): its heading and Status line.
  put(w, QUEUE + '/reports/b21-report.md', '# b21 report: admin settings save\n\nStatus: done, gate green\n', NOW0 - 3 * HOUR)
  put(w, DATA + '/credits.json', '{"opencode":{"total":200,"left":138,"expires":"2026-10-28"},"cloud":{"expires":"2026-11-30"}}', NOW0)
  put(w, DATA + '/status.json', JSON.stringify(STATUS), NOW0)
  const clock = await boot($, on, w)
  await clock.advance(31000)
  await clock.settle()
  const p = await pane($)
  const a = p.svgs.find(s => s.alt.startsWith('codex-a '))
  expect(a?.alt).toContain('codex-a \u00b7 codex')
  expect(a?.alt).toContain('task: land ADMIN-HOME-SETTINGS-01')
  expect(a?.alt).toContain('lock: coordinator, ')
  // Closed, the row carries none of it; opened in place it shows the same facts as label and text lines.
  expect(a?.source).not.toContain('>Task<')
  await p.m.press({ key: 'row-codex-a' })
  const open = walk(await p.m.drawn()).svgs.find(s => s.alt.startsWith('codex-a '))
  expect(open?.source).toContain('>Task<')
  expect(open?.source).toContain('land ADMIN-HOME-SETTINGS-01')
  expect(open?.source).toContain('>Lock<')
  expect(open?.source).toContain('>Last report<')
  expect(open?.source).toContain('done, gate green')
  const limits = p.svgs.find(s => s.key === 'svg-limits')
  expect(limits?.alt).not.toContain('OpenCode (Claude API): $62 spent \u00b7 $138 left \u00b7 expires Oct 28')
  expect(limits?.source).not.toContain('$62 / $138 \u00b7 Oct 28')
  // No delayed tooltips: no <title> and no interactive frame in the pane or the band.
  const tree = JSON.stringify(await p.m.drawn()) + JSON.stringify(await (await bandOf($)).m.drawn())
  expect(tree).not.toContain('<title>')
  expect(tree).not.toContain('isInteractive')
})

test('the "?" help (v8): a small button opens a CARD with the crew order and keys; no pasted text, no unstyled hint rows; styled buttons under it', async ($, on) => {
  const w = crewWorld(['codex-a'])
  await boot($, on, w)
  let p = await pane($)
  // Closed: nothing of the help is in the page.
  expect(p.svgs.some(s => s.alt.startsWith('Keys and options'))).toBe(false)
  expect(p.texts.some(t => /Crew order|This session \(the coordinator\)/.test(t))).toBe(false)
  // COCKPIT-23: the chip row's "?" is gone; the same help opens from the open System card (a sub-section of it, COCKPIT-26).
  expect(p.buttons.some(b => b.key === 'ui-help')).toBe(false)
  await p.m.press({ key: 'cs-system' })
  p = { m: p.m, ...walk(await p.m.drawn()) }
  expect(p.buttons.find(b => b.key === 'ui-help')?.label).toBe('keys and options')
  await p.m.press({ key: 'ui-help' })
  p = { m: p.m, ...walk(await p.m.drawn()) }
  const card = p.svgs.find(s => s.alt.startsWith('Keys and options'))
  expect(card?.source).toContain('class="tile"')
  expect(card?.alt).toContain('1. This session (the coordinator) is always first')
  expect(card?.alt).toContain('Ties by name')
  expect(card?.alt).toContain('Keys: h this help')
  // Never loose text lines of help.
  expect(p.texts.some(t => t.startsWith('1. This session') || t.startsWith('Keys: '))).toBe(false)
  // The buttons beneath it are real buttons in the tabs' own style (secondary), none plain.
  const tree = await p.m.drawn()
  const tools = find(tree, n => n.type === 'Box' && n.props?.key === 'row-sys-tools')[0]
  const btns = find(tools, n => n.type === 'Button')
  expect(btns.length).toBeGreaterThanOrEqual(4)
  for (const b of btns) {
    expect(b.props?.variant).toBe('secondary')
    expect(b.props?.plain).toBeUndefined()
  }
  expect(p.buttons.find(b => b.key === 'ui-celebrations')?.label).toBe('celebrations: on')
  await p.m.press({ key: 'ui-celebrations' })
  expect(walk(await p.m.drawn()).buttons.find(b => b.key === 'ui-celebrations')?.label).toBe('celebrations: off')
  expect(JSON.parse(w.writes.filter(x => x.path === DATA + '/crew-ui.json').pop()?.text ?? '{}').celebrations).toBe(false)
  // Closing it takes the card away.
  await p.m.press({ key: 'ui-help' })
  expect(walk(await p.m.drawn()).svgs.some(s => s.alt.startsWith('Keys and options'))).toBe(false)
})

// A landing is a new commit on origin/main today. The first poll only records what had landed.
test('celebrations: a landing bursts exactly once (24 pieces, a "landed" chip, the cheer); the next poll has none; no replay at load', async ($, on) => {
  const w = crewWorld(['codex-a'], { 'codex-a': WORKING_PANE })
  put(w, DATA + '/lane-locks/codex-a.lock', 'c\tcodex-a\tt\tb21\n', NOW0 - HOUR)
  w.gitLog = '9dc1cecd chore: bump\n'
  const clock = await boot($, on, w)
  // What had landed before the load is not celebrated.
  let p = await pane($)
  expect(p.svgs.some(s => s.source.includes('class="cfp'))).toBe(false)
  // A new commit lands: one burst on the member that holds b21 ("b21" is in the subject), the chip, the cheer.
  w.gitLog = '4d3cf848 feat: ADMIN-HOME-SETTINGS-01 lands (b21)\n9dc1cecd chore: bump\n'
  // The slow read (landed, every 30 s) finds it at t = 30 s; drawn 1 s later, inside the 2 s burst.
  await clock.advance(26000)
  await clock.settle()
  p = await pane($)
  const burst = p.svgs.filter(s => s.source.includes('class="cfp'))
  expect(burst.length).toBe(1)
  expect(burst[0]?.alt.startsWith('codex-a ')).toBe(true)
  expect((burst[0]?.source.match(/class="cfp/g) ?? []).length).toBe(24)
  expect(burst[0]?.source).toContain('landed ADMIN-HOME-SETTINGS-01')
  expect(burst[0]?.source).toContain('class="sp c-codex a-cheering"')
  expect(burst[0]?.source).toContain('prefers-reduced-motion')
  // The seen id is saved.
  expect(JSON.parse(w.writes.filter(x => x.path === DATA + '/crew-ui.json').pop()?.text ?? '{}').seenLanded).toContain('4d3cf848')
  // The next poll: the commit is known, so no burst; the chip stays for 10 s, then goes.
  await clock.advance(5000)
  await clock.settle()
  p = await pane($)
  expect(p.svgs.some(s => s.source.includes('class="cfp'))).toBe(false)
  expect(p.svgs.find(s => s.alt.startsWith('codex-a '))?.source).toContain('landed ADMIN-HOME-SETTINGS-01')
  await clock.advance(10000)
  await clock.settle()
  p = await pane($)
  expect(p.svgs.find(s => s.alt.startsWith('codex-a '))?.source).not.toContain('landed ADMIN-HOME-SETTINGS-01')
})

test('celebrations off: a landing shows no burst and no chip', async ($, on) => {
  const w = crewWorld(['codex-a'], { 'codex-a': WORKING_PANE })
  put(w, DATA + '/crew-ui.json', JSON.stringify({ celebrations: false }), NOW0)
  w.gitLog = '9dc1cecd chore: bump\n'
  const clock = await boot($, on, w)
  w.gitLog = '4d3cf848 feat: another thing lands\n9dc1cecd chore: bump\n'
  await clock.advance(31000)
  await clock.settle()
  const p = await pane($)
  expect(p.svgs.some(s => s.source.includes('class="cfp') || s.source.includes('landed another'))).toBe(false)
})

// ---------------------------------------------------------------------------
// The pinned layout and the height budget

// The pane at a width: 46 columns draw 360 px, 76 draw 600 and 114 draw 900.
const mountAt = async ($: any, columns: number, rows: number) => {
  if (mountedPane !== null) await mountedPane.unmount().catch(() => undefined)
  const m = await $.ui.mount({ ...DESKTOP_PANE, props: { ...DESKTOP_PANE.props, bodyColumns: columns, scroll: { offset: 0, bodyRows: rows } } })
  mountedPane = m
  return { m, ...walk(await m.drawn()) }
}

// Eight members: two working, one errored, one blocked, one out of credits, three sleeping.
const eightWorld = (): World => {
  const w = crewWorld(['codex-a', 'codex-b', 'codex-c', 'codex-d', 'codex-e', 'codex-f', 'opencode-1', 'cloud-commons-remote-state'], {
    'codex-a': WORKING_PANE,
    'codex-b': WORKING_PANE,
    'codex-c': OUT_PANE,
    'codex-d': IDLE_PANE,
    'codex-e': IDLE_PANE,
    'codex-f': IDLE_PANE,
    'opencode-1': PANE_OPENCODE_A,
    'cloud-commons-remote-state': IDLE_PANE,
  })
  put(w, DATA + '/lane-locks/opencode-1.lock', 'c\topencode-1\tt\tb70\n', NOW0 - HOUR)
  put(w, DATA + '/lane-locks/codex-a.lock', 'c\tcodex-a\tt\tb20c\n', NOW0 - HOUR)
  put(w, DATA + '/crew-deps.json', JSON.stringify({ waits: [{ member: 'codex-b', on: 'codex-a', why: 'needs the pin' }] }), NOW0)
  put(w, DATA + '/status.json', JSON.stringify(STATUS), NOW0)
  return w
}

for (const [width, columns] of [[360, 46], [600, 76], [900, 114]] as const) {
  test('8 members at ' + width + ' px: the whole one-page pane (Status card, crew, Flight log, Black box, Limits area) is under 1100 px, nothing past the edge', async ($, on) => {
    const w = eightWorld()
    const clock = await boot($, on, w)
    await clock.advance(31000)
    await clock.settle()
    const p = await mountAt($, columns, 80)
    // The svgs, plus the native rows between them: the button row and the three card headers (COCKPIT-23: no tab strip, no chips).
    const svgH = p.svgs.reduce((s, x) => s + x.height, 0)
    const total = svgH + 40 + 3 * 36
    // The Flight log and the Black box add their cards to what the Crew tab drew before (about 740 px).
    expect(total).toBeLessThan(1100)
    for (const s of p.svgs) {
      expect(isWellFormed(s.source)).toBe(true)
      // The full width, or 24 px less (3 cells) where the ONE chevron column sits at the row's right.
      expect([width, width - 24]).toContain(s.width)
      expect(s.source).toContain(`viewBox="0 0 ${s.width} ${s.height}"`)
      expect(s.source).not.toMatch(/NaN|undefined/)
    }
    // Active and errored members have their own rows; the four sleepers are ONE line; the cloud name is short.
    const names = p.svgs.map(s => s.alt.split(' ')[0])
    for (const n of ['codex-a', 'codex-b', 'opencode-1', 'codex-c']) expect(names).toContain(n)
    expect(p.svgs.find(s => s.key === 'svg-sleepers')?.alt).toMatch(/^4 sleeping: /)
    expect(p.svgs.some(s => s.alt.startsWith('commons-remote'))).toBe(false)
    expect(p.svgs.find(s => s.key === 'svg-sleepers')?.alt).toContain('commons-remote')
    // Pinned: the Status card first, the Limits area last.
    expect(p.svgs[0]?.key).toBe('svg-status')
    expect(p.svgs[p.svgs.length - 1]?.key).toBe('svg-limits')
    // One type scale (11 caption, 13 body, 15 title); a sprite's own tiny grid text aside.
    for (const s of p.svgs) for (const m of s.source.matchAll(/font-size="([\d.]+)"/g)) if (Number(m[1]) >= 9) expect([11, 13, 15]).toContain(Number(m[1]))
  })
}

test('the pinned layout: with little room only the middle is windowed; the Status card and the Limits area stay; a scroll moves the middle', async ($, on) => {
  const w = eightWorld()
  // Make the sleepers individual rows so there are plenty of blocks to window.
  const clock = await boot($, on, w)
  await clock.advance(31000)
  await clock.settle()
  const p0 = await pane($)
  await p0.m.press({ key: 'sleepers-open' })
  const small = await mountAt($, 76, 14)
  expect(small.svgs[0]?.key).toBe('svg-status')
  expect(small.svgs[small.svgs.length - 1]?.key).toBe('svg-limits')
  // COCKPIT-26: "N more below" is a one-line card (its words are the Svg's alt) with a glyph button beside it.
  expect(small.buttons.find(b => b.key === 'more-down')?.label).toBe('\u25bc')
  expect(small.svgs.some(s => /^\d+ more below$/.test(s.alt))).toBe(true)
  expect(small.buttons.some(b => b.key === 'more-up')).toBe(false)
  const shownFirst = small.svgs.map(s => s.alt.split(' ')[0])
  // The visible button moves the window of the middle blocks by one; the pinned parts do not move.
  await small.m.press({ key: 'more-down' })
  const moved = walk(await small.m.drawn())
  expect(moved.svgs[0]?.key).toBe('svg-status')
  expect(moved.svgs[moved.svgs.length - 1]?.key).toBe('svg-limits')
  expect(moved.buttons.find(b => b.key === 'more-up')?.label).toBe('\u25b2')
  expect(moved.svgs.some(s => /^\d+ more above$/.test(s.alt))).toBe(true)
  expect(moved.svgs.map(s => s.alt.split(' ')[0])).not.toEqual(shownFirst)
  await small.m.press({ key: 'more-up' })
  expect(walk(await small.m.drawn()).svgs.map(s => s.alt.split(' ')[0])).toEqual(shownFirst)
})

test('sleeping members expand on a click and collapse again', async ($, on) => {
  const w = eightWorld()
  const clock = await boot($, on, w)
  await clock.advance(31000)
  await clock.settle()
  const p = await pane($)
  expect(p.svgs.some(s => s.alt.startsWith('codex-d '))).toBe(false)
  await p.m.press({ key: 'sleepers-open' })
  const open = walk(await p.m.drawn())
  for (const n of ["codex-d", "codex-e", "codex-f"]) expect(open.svgs.some(s => s.alt.startsWith(n + ' '))).toBe(true)
  expect(open.svgs.some(s => s.key === 'svg-sleepers')).toBe(false)
  await p.m.press({ key: 'sleepers-close' })
  expect(walk(await p.m.drawn()).svgs.find(s => s.key === 'svg-sleepers')?.alt).toMatch(/^4 sleeping/)
})

test('an OPEN row carries its actions as buttons: restart the lane, clear a stale lock; a closed row has none', async ($, on) => {
  const w = crewWorld(['codex-a', 'opencode-1'], { 'codex-a': WORKING_PANE, 'opencode-1': PANE_OPENCODE_A })
  put(w, DATA + '/lane-locks/opencode-1.lock', 'c\topencode-1\tt\tb70\n', NOW0 - HOUR)
  await boot($, on, w)
  const p = await pane($)
  expect(p.buttons.some(b => b.key.startsWith('act-'))).toBe(false)
  await p.m.press({ key: 'row-opencode-1' })
  const open = walk(await p.m.drawn())
  expect(open.buttons.some(b => b.key === 'act-restart-opencode-1' && b.label === 'restart lane')).toBe(true)
  expect(open.buttons.some(b => b.key === 'act-clear-opencode-1' && b.label === 'clear stale lock')).toBe(true)
  // One row open at a time: opening another closes it.
  await p.m.press({ key: 'row-codex-a' })
  const other = walk(await p.m.drawn())
  expect(other.buttons.some(b => b.key === 'act-restart-opencode-1')).toBe(false)
  expect(other.buttons.some(b => b.key === 'act-restart-codex-a')).toBe(true)
  // Click again closes it.
  await p.m.press({ key: 'row-codex-a' })
  expect(walk(await p.m.drawn()).buttons.some(b => b.key.startsWith('act-'))).toBe(false)
  // The button asks first (the same plan and confirm as the command).
  await p.m.press({ key: 'row-opencode-1' })
  await p.m.press({ key: 'act-clear-opencode-1' })
  expect(walk(await p.m.drawn()).svgs.some(s => s.alt.startsWith('press y to confirm'))).toBe(true)
  for (const sub of MUTATING) expect(tmuxCalls(w, sub).length).toBe(0)
})
