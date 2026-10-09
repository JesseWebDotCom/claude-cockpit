// The real Claude usage and the other pools, through the mod itself (cockpit v7): $.session.usage() at start,
// session.measure after each response, OpenCode's measured spend through sqlite3, the transcript cost scan, and
// the strip and Limits area that show them.

import { expect, mock, test } from 'claude-code/testing'

import { applyClaude } from '../hooks/register.tsx'
import { DATA, IDLE_PANE, WORKING_PANE, callsOf, newWorld, put, stubWorld } from './world.ts'
import type { World } from './world.ts'

const NOW0 = Date.parse('2026-10-08T22:00:00Z')
const HOUR = 3_600_000
const DAY = 24 * HOUR
const iso = (ms: number): string => new Date(ms).toISOString()

const PANE = { plugin: 'cockpit', component: 'Pane', requestId: 'crew', surface: 'desktop', viewport: { columns: 100, rows: 40 }, props: { title: 'Cockpit', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 60 }, view: {} } } as const
const BAND = { plugin: 'cockpit', component: 'AbovePrompt', requestId: 'band', surface: 'desktop', viewport: { columns: 100, rows: 30 }, props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 11 }, view: {} } } as const

type Svg = { alt: string; source: string; height: number }
function walk(tree: unknown): { svgs: Svg[]; buttons: { key: string; label: string }[]; texts: string[] } {
  const out = { svgs: [] as Svg[], buttons: [] as { key: string; label: string }[], texts: [] as string[] }
  const go = (node: any) => {
    if (node === null || typeof node !== 'object') return
    if (node.type === 'Svg') out.svgs.push({ alt: node.props?.alt ?? '', source: node.props?.source ?? '', height: node.props?.height ?? 0 })
    if (node.type === 'Button') out.buttons.push({ key: node.key ?? node.props?.key ?? '', label: node.props?.label ?? '' })
    if (node.type === 'Text') out.texts.push((node.children ?? []).join(''))
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

const world = (names: string[] = ['codex-a']): World => {
  const w = newWorld()
  w.sessions = [...names]
  for (const n of names) w.panes[n] = IDLE_PANE
  return w
}

const five = (pct: number) => ({ kind: 'five_hour', percentUsed: pct, resetsAt: iso(NOW0 + 2 * HOUR) })
const week = (pct: number) => ({ kind: 'seven_day', percentUsed: pct, resetsAt: iso(NOW0 + 3 * DAY) })

let pane: any = null
let band: any = null
const limitsOf = async ($: any) => {
  if (pane !== null) await pane.unmount().catch(() => undefined)
  pane = await $.ui.mount(PANE)
  return walk(await pane.drawn()).svgs.find(s => s.alt.startsWith('Limits'))
}
const bandOf = async ($: any) => {
  if (band !== null) await band.unmount().catch(() => undefined)
  band = await $.ui.mount(BAND)
  return { m: band, ...walk(await band.drawn()) }
}

// ---------------------------------------------------------------------------
// Part 1: Claude from $.session.usage() and session.measure

test('at session start $.session.usage() fills the Claude line: 5h and week with their resets, and the context from the same call', async ($, on) => {
  const w = world()
  w.rateLimits = [five(31), week(62)]
  w.ctx = { tokens: 148_000 }
  await boot($, on, w)
  const l = await limitsOf($)
  for (const t of ['>31%<', '>62%<', '>5h<', '>wk<']) expect(l?.source).toContain(t)
  // This session's context (74%) is another thing and is not a bar in the Claude line.
  expect(l?.source).not.toContain('>74%<')
  expect(l?.source).not.toContain('>ctx<')
  // Claude is a normal row, not the muted one.
  expect(l?.source).toMatch(/<text class="t"[^>]*font-weight="600">Claude<\/text>/)
  expect(l?.alt).toContain('Claude: 5h 31% used')
  // The context card on the strip: tokens and window from the call.
  const b = await bandOf($)
  const claude = b.svgs.find(s => /^(Claude|C): /.test(s.alt))
  expect(claude?.alt).toContain("The Session's context window: 74% \u00b7 148k of 200k tokens")
  expect(claude?.alt).toContain('This account only')
})

test('rateLimits empty (not a subscription session): the single muted "plan usage not readable" line, and no invented number', async ($, on) => {
  const w = world()
  await boot($, on, w)
  const l = await limitsOf($)
  expect((l?.source.match(/plan usage not readable/g) ?? []).length).toBe(2)
  expect(l?.source).toMatch(/<text class="m"[^>]*>plan usage not readable<\/text>/)
  expect(l?.alt).toContain('Claude: 5h not readable here  week not readable here')
  const b = await bandOf($)
  expect(b.svgs.find(s => /^(Claude|C): /.test(s.alt))?.alt).toContain('plan usage unknown')
})

test('one window only: the other shows "n/a", never hidden', async ($, on) => {
  const w = world()
  w.rateLimits = [five(31)]
  await boot($, on, w)
  const l = await limitsOf($)
  expect(l?.source).toContain('>31%<')
  expect(l?.source).toContain('>n/a<')
  expect(l?.alt).toContain('Claude: 5h 31% used')
  expect(l?.alt).toContain('week not readable here')
})

test('session.measure after a response updates the figures; the same reading again redraws nothing', async ($, on) => {
  const w = world()
  w.rateLimits = [five(31), week(62)]
  w.ctx = { tokens: 100_000 }
  await boot($, on, w)
  expect((await limitsOf($))?.source).toContain('>31%<')
  const reading = { context: { window: 200_000, tokens: 150_000, percent: 75 }, rateLimits: [five(40), week(63)], changed: ['context', 'rateLimits'] as ('context' | 'rateLimits')[] }
  await $.session.measure(reading)
  const l = await limitsOf($)
  for (const t of ['>40%<', '>63%<']) expect(l?.source).toContain(t)
  expect(l?.source).not.toContain('>31%<')
})

test('only a changed reading is written: the same figures again report no change, a moved one does', async () => {
  const a = { rateLimits: [five(10), week(20)], tokens: 1_000, window: 200_000 }
  expect(applyClaude(a)).toBe(true)
  expect(applyClaude(a)).toBe(false)
  expect(applyClaude({ ...a, tokens: 2_000 })).toBe(true)
  expect(applyClaude({ rateLimits: [five(11), week(20)] })).toBe(true)
  // Empty windows or no tokens change nothing.
  expect(applyClaude({ rateLimits: [] })).toBe(false)
  expect(applyClaude({ tokens: null, window: null })).toBe(false)
})

test('a measure with no windows keeps the last readings (empty means "none yet", not "zero")', async ($, on) => {
  const w = world()
  w.rateLimits = [five(31), week(62)]
  await boot($, on, w)
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] })
  expect((await limitsOf($))?.source).toContain('>31%<')
})

// ---------------------------------------------------------------------------
// The dollar estimate: once a minute, off the poll, only changed files, no message text

const SCAN_FILES = '1791500000 480000 /Users/test/.claude/projects/p/a.jsonl\n1791500100 1200 /Users/test/.claude/projects/p/b.jsonl\n'
const SCAN_OUT = ['a.jsonl', 'b.jsonl'].map((f, i) => `/Users/test/.claude/projects/p/${f}\t2026-10-08T20:${i}\tclaude-opus-5-5\t10\t1000\t1000000\t0\t0`).join('\n') + '\n'

test('the cost scan prices the transcripts per window and shows it on the Claude card as an estimate', async ($, on) => {
  const w = world()
  w.rateLimits = [five(31), week(62)]
  w.costFind = SCAN_FILES
  w.costAwk = SCAN_OUT
  const clock = await boot($, on, w)
  await clock.advance(6000)
  await clock.settle()
  const b = await bandOf($)
  const card = b.svgs.find(s => /^(Claude|C): /.test(s.alt))?.alt ?? ''
  // Two buckets at 10 in, 1000 out, 1M cache read of opus-5-5: (10*4 + 1000*20 + 1e6*0.2) / 1e6 = $0.22 each.
  expect(card).toContain('\u2248 $0.44 at API rates in this 5h window (an estimate')
  expect(card).toContain('7d window')
  // Only usage fields were asked for: the awk call prints buckets, and no auth or key file is named anywhere.
  const all = w.calls.flat().join(' ')
  expect(all).not.toMatch(/auth\.json|\.key\b/)
  expect(callsOf(w, 'awk').length).toBe(1)
})

test('the scan runs at most once a minute and re-reads only the files that changed', async ($, on) => {
  const w = world()
  w.rateLimits = [five(31), week(62)]
  w.costFind = SCAN_FILES
  w.costAwk = SCAN_OUT
  const clock = await boot($, on, w)
  await clock.advance(30_000)
  await clock.settle()
  expect(callsOf(w, 'find').length).toBe(1)
  expect(callsOf(w, 'awk').length).toBe(1)
  // After a minute it lists again, but nothing changed: no awk.
  await clock.advance(40_000)
  await clock.settle()
  expect(callsOf(w, 'find').length).toBe(2)
  expect(callsOf(w, 'awk').length).toBe(1)
  // One file grew: only that file goes through awk.
  w.costFind = '1791500000 480000 /Users/test/.claude/projects/p/a.jsonl\n1791500900 2400 /Users/test/.claude/projects/p/b.jsonl\n'
  await clock.advance(61_000)
  await clock.settle()
  expect(callsOf(w, 'awk').length).toBe(2)
  expect(callsOf(w, 'awk')[1]?.slice(2)).toEqual(['/Users/test/.claude/projects/p/b.jsonl'])
})

test('without the windows\' reset times there is nothing to price against: no scan, no dollars, nothing invented', async ($, on) => {
  const w = world()
  w.costFind = SCAN_FILES
  w.costAwk = SCAN_OUT
  const clock = await boot($, on, w)
  await clock.advance(10_000)
  await clock.settle()
  expect(callsOf(w, 'find').length).toBe(0)
  expect((await bandOf($)).svgs.find(s => /^(Claude|C): /.test(s.alt))?.alt).not.toContain('API rates')
})

// ---------------------------------------------------------------------------
// Part 3: the other pools

const credits = (extra: Record<string, unknown> = {}) => JSON.stringify({ opencode: { total: 200, left: 197, expires: '2026-10-28', ...extra }, cloud: { expires: '2026-11-30' } })

test('API (v9): measured through sqlite3 -readonly for THIS calendar month (since the 1st, UTC); "$3.41 this month . OpenCode"; no balance, no expiry', async ($, on) => {
  const w = world()
  put(w, DATA + '/credits.json', credits(), NOW0)
  w.sqlite = '3.41|34'
  const clock = await boot($, on, w)
  await clock.advance(31_000)
  await clock.settle()
  const l = await limitsOf($)
  expect(l?.source).toContain('$3.41 this month ')
  expect(l?.source).not.toContain('\u00b7 Oct 28')
  expect(l?.source).toContain('OpenCode')
  expect(l?.alt).toContain('API: $3.41 this month, logged by OpenCode')
  expect(l?.alt).toContain('Other API use is not counted')
  expect(l?.alt).not.toMatch(/expires Oct|\$197|manual/)
  const q = callsOf(w, 'sqlite3')[0] ?? []
  expect(q.slice(0, 2)).toEqual(['sqlite3', '-readonly'])
  expect(q[2]).toMatch(/\.local\/share\/opencode\/opencode\.db$/)
  // The month of NOW0 (Oct 8) starts at Oct 1 00:00 UTC.
  expect(q[3]).toContain('>= ' + Date.UTC(2026, 9, 1))
  expect(q.join(' ')).not.toMatch(/auth\.json|\.key\b/)
})

test('API (v9): the limit is the config\'s: credits.json "limit", else its "total", else $200; no start date is needed any more', async ($, on) => {
  const w = world()
  put(w, DATA + '/credits.json', JSON.stringify({ opencode: { limit: 50, total: 200 } }), NOW0)
  w.sqlite = '30|9'
  const clock = await boot($, on, w)
  await clock.advance(31_000)
  await clock.settle()
  const l = await limitsOf($)
  expect(l?.source).not.toContain('$3 / $197 \u00b7 Oct 28')
  expect(l?.alt).toContain('monthly limit $50')
})

test('API (v9): an empty month is "$0 this month", not "not readable"', async ($, on) => {
  const w = world()
  w.sqlite = '0|0'
  const clock = await boot($, on, w)
  await clock.advance(31_000)
  await clock.settle()
  const l = await limitsOf($)
  expect(l?.source).toContain('$0 this month ')
  expect(l?.alt).toContain('API: $0 this month, logged by OpenCode')
  expect(l?.alt).not.toContain('API: not readable')
})

test('API (v9): the month boundary: just after midnight UTC on the 1st it is the new month; a second before, still the old one', async ($, on) => {
  // Only the new month is checked per run (one clock per test): midnight plus ten seconds on Oct 1.
  const w = world()
  w.sqlite = '1.00|2'
  const clock = mock.clock(on, { now: Date.parse('2026-10-01T00:00:10Z') })
  stubWorld(on, w)
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(31_000)
  await clock.settle()
  expect((callsOf(w, 'sqlite3')[0] ?? [])[3]).toContain('>= ' + Date.UTC(2026, 9, 1))
})

test('API (v9): the month boundary, the other side: 23:59:50 UTC on Sep 30 is still September', async ($, on) => {
  const w = world()
  w.sqlite = '1.00|2'
  const clock = mock.clock(on, { now: Date.parse('2026-09-30T23:59:50Z') })
  stubWorld(on, w)
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.settle()
  expect((callsOf(w, 'sqlite3')[0] ?? [])[3]).toContain('>= ' + Date.UTC(2026, 8, 1))
})

test('API (v9): sqlite3 cannot run or the database cannot be read: "not readable" with the fix, never a figure', async ($, on) => {
  const w = world()
  put(w, DATA + '/credits.json', credits(), NOW0)
  w.sqlite = null
  const clock = await boot($, on, w)
  await clock.advance(31_000)
  await clock.settle()
  const l = await limitsOf($)
  expect(l?.source).not.toContain('$3 / $197 \u00b7 Oct 28')
  expect(l?.alt).toContain('To fix: Install sqlite3')
  expect(l?.source).not.toContain('this month')
})

test('API (v9): output that is not a number pair is also "not readable"', async ($, on) => {
  const w = world()
  w.sqlite = 'Error: no such table: message'
  const clock = await boot($, on, w)
  await clock.advance(31_000)
  await clock.settle()
  expect((await limitsOf($))?.source).toContain('>not readable<')
})

test('Cloud and Local: the cloud shows its expiry and the sessions running; the local pool is up when a local lane has a model server, with the GPU share', async ($, on) => {
  const w = world(['cloud-commons-remote', 'local-llama'])
  w.panes['cloud-commons-remote'] = WORKING_PANE
  put(w, DATA + '/credits.json', credits(), NOW0)
  w.ps = 'llama-server -m /models/llama-9b.gguf --port 8081\n'
  const clock = await boot($, on, w)
  await clock.advance(31_000)
  await clock.settle()
  const l = await limitsOf($)
  expect(l?.source).toMatch(/Nov 30, \d+ days \u00b7 1 running/)
  expect(l?.source).toContain('server up \u00b7 GPU 21% \u00b7 free')
  // The cloud card says what it cannot read.
  expect(l?.alt).toContain('not readable here; nothing is invented')
})

test('Local: no local lane means no server claim, only the box GPU and "free"', async ($, on) => {
  await boot($, on, world())
  const s = (await limitsOf($))?.source ?? ''
  expect(s).toContain('GPU 21% \u00b7 free')
  expect(s).not.toContain('server up')
  expect(s).not.toContain('server down')
})

test('Local: a lane with no model server behind it is down', async ($, on) => {
  const down = world(['local-llama'])
  down.ps = 'zsh\n'
  const clock = await boot($, on, down)
  await clock.advance(31_000)
  await clock.settle()
  expect((await limitsOf($))?.source).toContain('server down')
})

