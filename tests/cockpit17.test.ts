// COCKPIT-17 (cockpit 0.5.0): the pane's new layout, top to bottom: a) the Status card (no Active chip, expandable), b) the button row
// (Add Bug, Add Idea, the Active/Away switch), c) the crew rows (the task wrapped, an animated border on every active row), d) the System card
// (collapsed), e) the Flight log, f) the Black box. Pure rules, the drawings as text, and the pane's tree with a fake kit and a fake `$`.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { BLACK_BOX_EMPTY, BOX_COLLAPSED, BOX_EXPANDED, blackBoxRows, blackBoxSummary } from '../hooks/blackbox.ts'
import { memberDetail } from '../hooks/details.ts'
import type { MemberCardIn } from '../hooks/details.ts'
import { FLIGHT_EXPANDED, FLIGHT_SHOWN, STATUS_HEX, crewEntries, finalGateExit, flightRows, flightSummary, parseReport, reportName, statusLine } from '../hooks/flightlog.ts'
import type { FlightEntry } from '../hooks/flightlog.ts'
import { blackBoxHeight, blackBoxSvg, flightHeight, flightSvg } from '../hooks/flightsvg.ts'
import { inboxKindOf, inboxMdFile, inboxMdLine, promptStarter, typeHint } from '../hooks/inboxmd.ts'
import { borderFor, rowSvg, statusHeight, statusSvg } from '../hooks/look.ts'
import type { LookRow, LookStatus } from '../hooks/look.ts'
import { LOG_KEEP, pushLog } from '../hooks/sessionlog.ts'
import { isWellFormed } from './helpers.ts'
import { addInbox, graphOf, paneSvgTree, startInbox, setRootForTest } from '../hooks/register.tsx'
const TEST_ROOT = '/home/alex/projects/example-app'
setRootForTest(TEST_ROOT)

const ROOT = resolve(import.meta.dir, '..')
const SRC = readFileSync(resolve(ROOT, 'hooks/register.tsx'), 'utf8')

// ---------------------------------------------------------------- a) the Status card

const STATUS: LookStatus = { title: 'Pair the app with the remote service', ratio: 0.5, count: '3/6', note: '', now: 'a; b', next: 'n1, n2', you: '', youHex: '#F0A500', isAway: false, presenceText: 'Active', stale: '', phase: 0 }
const LONG_NOW = 'LINK-PROBE-01 (opencode-2): the first health probe waits for ssh to open its tunnel instead of killing it, with retries and a connect window of fifteen seconds'
const OPEN: LookStatus = {
  ...STATUS,
  now: LONG_NOW + '; COCKPIT-17 (opencode-1): revamp the pane',
  next: 'n1, n2, n3',
  you: 'approve the pin bump',
  nowItems: [LONG_NOW, 'COCKPIT-17 (opencode-1): revamp the pane'],
  nextItems: ['H1-SETTINGS-SAVE-01: save the settings page', 'B30: place map', 'DOCTOR-HOPS-01: hops 7 and 9'],
  youItems: ['approve the pin bump'],
}

test('a) the Status card has no Active or Away chip, in either state', () => {
  expect(statusSvg(520, STATUS)).not.toContain('>Active<')
  expect(statusSvg(520, { ...STATUS, isAway: true, presenceText: 'Away' })).not.toContain('>Away<')
  expect(isWellFormed(statusSvg(520, STATUS))).toBe(true)
})

test('a) expanded, NOW, NEXT and YOU are multi-line sections: long text wraps over several lines, one list item per line for NEXT', () => {
  const closed = statusSvg(360, OPEN)
  const open = statusSvg(360, { ...OPEN, open: { now: true, next: true, you: true } })
  expect(isWellFormed(open)).toBe(true)
  expect(statusHeight(360, { ...OPEN, open: { now: true, next: true, you: true } })).toBeGreaterThan(statusHeight(360, OPEN) + 60)
  for (const label of ['>NOW<', '>NEXT<', '>YOU<']) expect(open).toContain(label)
  // The long NOW entry is not cut with an ellipsis when open, and it is spread over more than one text row.
  expect(closed).toContain('\u2026')
  const rows = [...open.matchAll(/<text class="t" x="52"[^>]*>([^<]*)<\/text>/g)].map(m => m[1])
  expect(rows.length).toBeGreaterThan(3)
  expect(open).not.toMatch(/probe waits[^<]*\u2026/)
  // One NEXT item per row (three items, each at the first row of its own).
  for (const item of ['H1-SETTINGS-SAVE-01', 'B30: place map', 'DOCTOR-HOPS-01']) expect(open).toContain(item.slice(0, 12))
  const nextRows = [...open.matchAll(/<text class="s" x="52"[^>]*>([^<]*)<\/text>/g)].map(m => m[1] ?? '')
  expect(nextRows.filter(r => /^(H1-SETTINGS|B30|DOCTOR-HOPS)/.test(r))).toHaveLength(3)
})

// ---------------------------------------------------------------- the pane tree with a fake kit

const el = (type: string) => (p: any) => ({ type, props: p, children: p.children ?? [] })
const kit: any = { Box: el('Box'), Text: el('Text'), Button: el('Button'), Svg: el('Svg'), Input: el('Input') }
const calls: string[] = []
const $: any = { ui: { invalidate: () => calls.push('invalidate'), toast: (t: string) => calls.push('toast:' + t) }, fs: { write: async () => undefined } }
const walk = (n: any, out: any[] = []): any[] => {
  if (n && typeof n === 'object') {
    out.push(n)
    if (Array.isArray(n.children)) for (const c of n.children) walk(c, out)
  }
  return out
}
const tree = (cols = 100, rows?: number): any => paneSvgTree($, kit, cols, rows, 1_000_000, graphOf())
const keysOf = (t: any): string[] => walk(t).map(n => n.props?.key).filter((k): k is string => typeof k === 'string')

test('every Button the pane draws is a string label with no children (COCKPIT-16)', () => {
  for (const b of walk(tree()).filter(n => n.type === 'Button')) {
    expect(typeof b.props.label).toBe('string')
    expect(b.props.children).toBeUndefined()
  }
})

test('b) the button row: Add Bug and Add Idea on the left, the AUTOPILOT button on the right with its coloured word beside it (COCKPIT-28: no ON/OFF)', () => {
  const row = walk(tree()).find(n => n.props?.key === 'button-row')
  expect(row.props.justifyContent).toBe('space-between')
  const [left, right] = row.children as any[]
  expect(left.children.map((b: any) => [b.type, b.props.key, b.props.label])).toEqual([['Button', 'add-bug', 'Add Bug'], ['Button', 'add-idea', 'Add Idea']])
  expect(right.children.map((b: any) => [b.type, b.props.key])).toEqual([['Svg', 'autopilot-state'], ['Button', 'crew-presence']])
  expect(right.children[0].props).toMatchObject({ alt: 'Away off' })
  expect(right.children[0].props.source).toContain('#8B949E')
  expect(right.children[0].props.source).not.toMatch(/>\s*(OFF|off)\s*</)
  expect(right.children[1].props.label).toBe('\u25be')
  // the status card's own svg no longer carries the chip
  const status = walk(tree()).find(n => n.props?.key === 'svg-status')
  expect(status.props.source).not.toContain('>Active<')
})

test('a) the status chevron is one Button with a string label beside the card, and its svg is as wide as a crew row', () => {
  const row = walk(tree()).find(n => n.props?.key === 'status-row')
  const [svg, chev] = row.children as any[]
  expect(svg.type).toBe('Svg')
  expect(svg.props.width).toBe(100 * 8 - 8 - 24)
  expect(walk(chev).find(n => n.type === 'Button').props.label).toBe('\u25be')
})

// ---------------------------------------------------------------- b) the buttons and the commands

type Filled = { text: string; mode: string }
function fakeHost(over: Record<string, unknown> = {}): { $: any; filled: Filled[]; toasts: string[]; writes: Record<string, string>; mkdirs: string[] } {
  const filled: Filled[] = []
  const toasts: string[] = []
  const writes: Record<string, string> = {}
  const mkdirs: string[] = []
  const host: any = {
    prompt: { fill: async (i: Filled) => { filled.push(i); return { isFilled: true } } },
    ui: { toast: (t: string) => toasts.push(t), invalidate: () => undefined, status: () => undefined, panes: async () => [], open: async () => ({ isPlaced: false }), close: async () => undefined, resolve: () => ({}) },
    clock: { now: async () => Date.parse('2026-10-09T15:04:05.000Z') },
    fs: { exists: async () => false, read: async () => '', list: async () => [], write: async () => undefined, stat: async () => null },
    process: {
      run: async (argv: string[], opts: { stdin?: string }) => {
        if (argv[0] === 'mkdir') mkdirs.push(argv[2] ?? '')
        else if (argv[0] === 'tee') writes[argv[2] ?? ''] = (writes[argv[2] ?? ''] ?? '') + (opts.stdin ?? '')
        return { exitCode: 0, stdout: '' }
      },
    },
    env: { get: async () => '/Users/x' },
    session: { id: async () => 's', usage: async () => null },
    agent: { list: async () => [] },
    ...over,
  }
  return { $: host, filled, toasts, writes, mkdirs }
}

test('b) Add Bug and Add Idea put "/cockpit bug " or "/cockpit idea " in the prompt box (replace, with the trailing space)', async () => {
  for (const kind of ['bug', 'idea'] as const) {
    const h = fakeHost()
    await startInbox(h.$, kind)
    expect(h.filled).toEqual([{ text: '/cockpit ' + kind + ' ', mode: 'replace' }])
    expect(h.toasts).toHaveLength(1)
    expect(h.toasts[0]).toContain('/cockpit ' + kind)
  }
  expect(promptStarter('bug')).toBe('/cockpit bug ')
})

test('b) when the prompt box cannot be filled (a dialog, no composer, or an error) a one-line toast says what to type', async () => {
  for (const fill of [async () => ({ isFilled: false, refusal: 'dialog' }), async () => { throw new Error('no composer') }]) {
    const h = fakeHost({ prompt: { fill } })
    await startInbox(h.$, 'idea')
    expect(h.toasts).toEqual([typeHint('idea')])
    expect(h.toasts[0]).toBe('Type /cockpit idea followed by what you would like.')
    expect(h.toasts[0]!.includes('\n')).toBe(false)
  }
  expect(typeHint('bug')).toBe('Type /cockpit bug followed by what went wrong.')
})

test('b) /cockpit bug <text> and idea <text> append "- <ISO time> <text>" to inbox/bugs.md and ideas.md, make the folder, and toast Saved', async () => {
  const h = fakeHost()
  const r = await addInbox(h.$, 'bug', '  the Add Bug button\n  does nothing  ')
  const bugs = '/home/alex/projects/example-app/.cockpit/inbox/bugs.md'
  expect(h.mkdirs).toEqual(['/home/alex/projects/example-app/.cockpit/inbox'])
  expect(h.writes[bugs]).toBe('- 2026-10-09T15:04:05.000Z the Add Bug button does nothing\n')
  expect(h.toasts).toEqual(['Saved'])
  expect(r).toContain('Saved bug')
  const again = await addInbox(h.$, 'idea', 'show the black box in the Deck too')
  expect(h.writes['/home/alex/projects/example-app/.cockpit/inbox/ideas.md']).toBe('- 2026-10-09T15:04:05.000Z show the black box in the Deck too\n')
  expect(again).toContain('ideas.md')
  expect(h.toasts).toEqual(['Saved', 'Saved'])
  // a second bug is a second line in the same file
  await addInbox(h.$, 'bug', 'second')
  expect(h.writes[bugs]!.split('\n').filter(Boolean)).toHaveLength(2)
})

test('b) empty text is refused with a toast that says what to type, and nothing is written', async () => {
  for (const [kind, text] of [['bug', ''], ['idea', '   \n '], ['bug', '\u0001\u0002']] as const) {
    const h = fakeHost()
    const r = await addInbox(h.$, kind, text)
    expect(h.toasts).toEqual([typeHint(kind)])
    expect(r).toBe(typeHint(kind))
    expect(Object.keys(h.writes)).toEqual([])
    expect(h.mkdirs).toEqual([])
  }
  expect(await addInbox(fakeHost().$, 'nope', 'x')).toContain('kind must be bug or idea')
})

test('b) the pure line rule: one line, control characters out, a "feature" is an idea, the file names', () => {
  expect(inboxKindOf('feature')).toBe('idea')
  expect(inboxKindOf('bug')).toBe('bug')
  expect(inboxKindOf('x')).toBe(null)
  expect([inboxMdFile('bug'), inboxMdFile('idea')]).toEqual(['bugs.md', 'ideas.md'])
  const l = inboxMdLine('bug', 'a\tb\u0000c\nd', 0)
  expect(l).toEqual({ ok: true, line: '- 1970-01-01T00:00:00.000Z a b c d\n', shown: 'a b c d' })
  const long = inboxMdLine('idea', 'x'.repeat(3000), 0)
  expect(long.ok && long.line.length).toBeLessThan(2100)
})

test('b) the pane\'s /cockpit bug and idea go through addInbox (the command) and the Inbox field does too', () => {
  expect(SRC).toContain("c.cmd === 'bug' || c.cmd === 'idea' || c.cmd === 'feature'")
  expect(SRC).toContain('submitInbox($, kind, v)')
})

// ---------------------------------------------------------------- c) the crew rows

const CARD: MemberCardIn = {
  name: 'opencode-1', kind: 'api', activity: 'working', powered: 'OpenCode', target: '', item: 'COCKPIT-17', doing: '', description: '', lastReport: '', since: '', lockOwner: '', lockAge: '',
  context: '', limits: '', blockedBy: [], errored: false, errorReason: '', out: false, back: '', isStale: false, isStuck: false,
}

test('c) an expanded crew card shows the task over several lines, wrapped and not truncated', () => {
  const task = 'Revamp the Cockpit pane in the order status card, button row, crew rows, system card, flight log and black box, and keep every existing test green while adding tests for each item'
  const detail = memberDetail({ ...CARD, description: task })
  const lines = detail.filter((d, i) => d.label === 'Task' || (d.label === '' && detail.slice(0, i).some(x => x.label === 'Task') && detail[i - 1]?.label !== 'Powered by'))
  const taskLines = detail.slice(detail.findIndex(d => d.label === 'Task')).filter((d, i) => i === 0 || d.label === '')
  expect(taskLines.length).toBeGreaterThan(3)
  expect(taskLines[0]!.label).toBe('Task')
  expect(taskLines.every(d => d.text.length <= 38)).toBe(true)
  expect(taskLines.map(d => d.text).join(' ')).toBe(task)
  expect(lines.length).toBeGreaterThan(0)
  expect(memberDetail({ ...CARD, description: 'short task' }).find(d => d.label === 'Task')?.text).toBe('short task')
  expect(memberDetail({ ...CARD, description: '' }).some(d => d.label === 'Task')).toBe(false)
})

const ROW: LookRow = {
  kind: 'codex', variant: 0, mode: 'work', activity: 'coding', title: 'codex-a', state: { text: 'coding', color: '#22C55E' }, item: 'X-01 \u00b7 editing core.ts', tag: '', since: '4m', trouble: null, isOut: false,
  indent: 0, isOpen: false, detail: [], bars: [], burst: '', landed: '', phase: 0, tone: 'green',
}

test('c) an ACTIVE row gets an animated border: a dim ring plus a travelling bright stretch, in the theme green, that reduced motion turns into a still ring', () => {
  const pulse = rowSvg(520, { ...ROW, border: 'pulse' })
  expect(isWellFormed(pulse)).toBe(true)
  expect(pulse).toContain('class="okcs bring"')
  expect(pulse).toContain('class="okcs bt"')
  expect(pulse).toContain('pathLength="100" stroke-dasharray="14 86"')
  expect(pulse).toContain('@keyframes bt{to{stroke-dashoffset:-100}}')
  expect(pulse).toContain('.bt{animation:bt 5s linear infinite}')
  expect(pulse).toContain('@media (prefers-reduced-motion: reduce){.sweep{animation:none}.bring{stroke-opacity:.85}.bt{display:none}}')
  expect(pulse).toMatch(/\.okcs\{stroke:#3FB950\}/)
  // 5 s divides the refresh, so a redraw restarts it in phase
  expect(pulse).toContain('bt 5s linear')
})

test('c) with motion off the border is a still coloured ring, not an animated one; a row that is not active has none', () => {
  const still = rowSvg(520, { ...ROW, border: 'still' })
  expect(still).toContain('class="okcs" x="1" y="1"')
  expect(still).toContain('stroke-opacity="0.85"')
  expect(still).not.toContain('class="okcs bt"')
  expect(still).not.toContain('class="okcs bring"')
  expect(rowSvg(520, { ...ROW, tone: '', border: '' })).not.toContain('class="okcs')
  expect(rowSvg(520, ROW)).not.toContain('class="okcs')
  expect([borderFor('green', true), borderFor('green', false), borderFor('amber', true), borderFor('red', false), borderFor('', true), borderFor(undefined, true)]).toEqual(['pulse', 'still', '', '', '', ''])
  // an open row's ring goes round the whole card
  const open = rowSvg(520, { ...ROW, isOpen: true, border: 'pulse', detail: [{ label: 'Task', text: 'x' }, { label: '', text: 'y' }] })
  expect(open).toMatch(/class="okcs bring" x="1" y="1" width="518" height="(?!52")\d+/)
})

test('c) every row the crew tab draws goes through the border rule, and it follows the /cockpit motion setting', () => {
  expect(SRC).toContain('const motionOn = effectiveMotion(deckCfg, deckView)')
  expect(SRC).toContain('borderFor(row.tone, motionOn)')
  // 0.23.4: the crew rows are gone from the pane, so no row of the old Agents section is drawn at all.
  expect(SRC).not.toContain("rowBox('session'")
  expect(SRC).not.toContain("rowBox(m.name, m.name")
})

// ---------------------------------------------------------------- e) the Flight log

const R_DONE = '# DOCTOR-HOPS-01 report: engine-link doctor hops 7 and 9 read the right fields\n\nStatus: done and pushed. Commit `e26a8245` on `origin/main`.\n\nGate exit code **0**.\n'
const R_GATE_OK = '# b23 report\n\n- The root cause was a matcher.\n- Full gate: **exit 0**.\n'
const R_RED = '# b20 report\n\n- Commit: not created.\n- Gate exit code: `1`\n- Proof exit code: `0`\n'
const R_RED_THEN_GREEN = '# b21c report: ADMIN-HOME-SETTINGS-01\n\nFirst run: `bash scripts/check.sh` exit code **1**.\n\nSecond run: `bash scripts/check.sh` exit code **0**.\n'
const R_NOT_PUSHED = '# ENGINES-AI-01 report: committed locally (not pushed); the gate is red in ONE test\n\nDetails.\n'
const R_BLOCKED = '# b16: service readiness\n\nStatus: blocked on the service update.\n\nNothing ran.\n'
const R_LANDED_LATER = '# GENUI-13c report: landed\n\nThis replaces the earlier "blocked" report.\n\nGate: `bash scripts/check.sh` exit 0.\n'
const R_UNREADABLE = '# a note\n\nJust some words with no verdict at all in them.\n'
const R_EMPTY = ''

test('e) a report is judged by its headline first, then its final gate exit; the exact wording each lane uses', () => {
  const at = (name: string, text: string): FlightEntry => parseReport(name, text, 1000)
  expect(at('doctorfix-report.md', R_DONE).name.startsWith('DOCTOR-HOPS-01: engine-link')).toBe(true)
  expect(at('doctorfix-report.md', R_DONE).name.length).toBeLessThanOrEqual(40)
  expect(at('doctorfix-report.md', R_DONE).status).toBe('done')
  expect(at('doctorfix-report.md', R_DONE).detail).toContain('done and pushed')
  expect(at('b23-report.md', R_GATE_OK)).toMatchObject({ name: 'b23', status: 'done', detail: 'gate exit 0' })
  // the gate's exit code (1), not the proof command's (0)
  expect(at('b20-report.md', R_RED)).toMatchObject({ status: 'errored', detail: 'gate exit 1' })
  // an earlier red run followed by a green one is DONE; the last gate wins
  expect(at('b21c-report.md', R_RED_THEN_GREEN).status).toBe('done')
  expect(at('b21c-report.md', R_RED_THEN_GREEN.split('\n').reverse().join('\n')).status).not.toBe('unknown')
  expect(at('e-report.md', R_NOT_PUSHED).status).toBe('errored')
  expect(at('b16-report.md', R_BLOCKED).status).toBe('blocked')
  // "blocked" mentioned in the body of a report that landed is not BLOCKED
  expect(at('g-report.md', R_LANDED_LATER).status).toBe('done')
})

test('e) a report nothing can read is UNKNOWN, never DONE; a missing heading falls back to the file name', () => {
  expect(parseReport('note-report.md', R_UNREADABLE, 1).status).toBe('unknown')
  expect(parseReport('empty-report.md', R_EMPTY, 1)).toMatchObject({ status: 'unknown', name: 'empty' })
  expect(parseReport('weird.md', '\u0000\u0001 garbage ### ??? exit', 1).status).toBe('unknown')
  expect(reportName('x-report.md', '## second level only')).toBe('x')
  expect(statusLine(R_DONE)).toBe('Status: done and pushed. Commit e26a8245 on origin/main.')
  expect(finalGateExit('Exit code: **2**')).toBe(2)
  expect(finalGateExit('Proof: exit code 0')).toBe(null)
  expect(finalGateExit('Gate: `bash scripts/check.sh` exit 0')).toBe(0)
  expect(finalGateExit('nothing here')).toBe(null)
})

test('e) every report in the real queue folder parses to one of the four statuses, and a sample of known ones is judged right', async () => {
  const { readdirSync, readFileSync: read, statSync } = await import('node:fs')
  const dir = '/home/alex/projects/example-app/.cockpit/agents/queue/reports/'
  let files: string[] = []
  try {
    files = readdirSync(dir).filter(f => f.endsWith('.md'))
  } catch {
    return
  }
  const seen: Record<string, string> = {}
  for (const f of files.slice(0, 120)) {
    const e = parseReport(f, read(dir + f, 'utf8'), statSync(dir + f).mtimeMs)
    expect(['done', 'errored', 'blocked', 'unknown']).toContain(e.status)
    expect(e.name.length).toBeGreaterThan(0)
    expect(e.detail.length).toBeLessThanOrEqual(90)
    seen[f] = e.status
  }
  for (const [f, want] of [['askpass-report.md', 'done'], ['probe-report.md', 'done'], ['b19-report.md', 'errored'], ['b20-report.md', 'errored']] as const) if (f in seen) expect(seen[f]).toBe(want)
})

test('e) newest first, 8 shown and 20 when expanded; crew trouble sits in the same list stamped with when it began', () => {
  const entries: FlightEntry[] = Array.from({ length: 30 }, (_, i) => ({ key: 'r' + i, name: 'r' + i, status: 'done' as const, detail: '', atMs: i * 1000, source: 'report' as const }))
  const shown = flightRows(entries, FLIGHT_SHOWN)
  expect(shown.map(e => e.name)).toEqual(['r29', 'r28', 'r27', 'r26', 'r25', 'r24', 'r23', 'r22'])
  expect(flightRows(entries, FLIGHT_EXPANDED)).toHaveLength(20)
  const crew = crewEntries([{ name: 'codex-b', kind: 'errored', reason: 'session died', sinceMs: 60_000 }, { name: 'codex-c', kind: 'blocked', reason: 'blocked by codex-a: needs the installer', sinceMs: 0 }], 100_000)
  expect(crew.map(c => [c.name, c.status, c.atMs, c.source])).toEqual([['codex-b', 'errored', 40_000, 'crew'], ['codex-c', 'blocked', 100_000, 'crew']])
  expect(flightRows([...entries, ...crew], 3).map(e => e.name)).toEqual(['codex-c', 'codex-b', 'r29'])
  expect(flightSummary([...crew, ...shown.slice(0, 2)])).toBe('2 done, 1 errored, 1 blocked')
  expect(flightSummary([])).toBe('')
})

test('e) the Flight log card: one row per entry with DONE green, ERRORED red, BLOCKED amber and UNKNOWN grey chips, the name, and a one-line detail', () => {
  const entries: FlightEntry[] = [
    { key: 'a', name: 'COCKPIT-16', status: 'done', detail: 'fixed and reinstalled', atMs: 4, source: 'report' },
    { key: 'b', name: 'b20c', status: 'errored', detail: 'gate exit 1', atMs: 3, source: 'report' },
    { key: 'c', name: 'codex-c', status: 'blocked', detail: 'blocked by codex-a & more <x>', atMs: 2, source: 'crew' },
    { key: 'd', name: 'a note', status: 'unknown', detail: '', atMs: 1, source: 'report' },
  ]
  const svg = flightSvg(520, entries, '1 done, 1 errored')
  expect(isWellFormed(svg)).toBe(true)
  for (const w of ['>DONE<', '>ERRORED<', '>BLOCKED<', '>UNKNOWN<']) expect(svg).toContain(w)
  expect(svg).toContain('>Events<')
  expect(svg).toContain('COCKPIT-16')
  expect(svg).toContain('blocked by codex-a &amp; more &lt;x&gt;')
  expect(svg).not.toContain('&amp;amp;')
  expect(STATUS_HEX).toEqual({ done: '#3FB950', errored: '#F85149', blocked: '#F0A500', unknown: '#8B949E' })
  expect(flightHeight(4)).toBeGreaterThan(flightHeight(1))
  expect(flightSvg(520, [], '')).toContain('no reports yet')
  expect(svg).toContain(`height="${flightHeight(4)}"`)
})

// ---------------------------------------------------------------- f) the Black box

function sessionLog(n: number): ReturnType<typeof pushLog> {
  let log: ReturnType<typeof pushLog> = []
  const kinds = ['prompt', 'spawn', 'done', 'consult', 'edit', 'error', 'deny', 'lane', 'info'] as const
  for (let i = 0; i < n; i++) log = pushLog(log, { at: 1_000_000 + i * 1000, kind: kinds[i % kinds.length]!, who: i % 2 === 0 ? 'main' : 'agent', text: 'event ' + i, agentId: null })
  return log
}

test('f) collapsed it shows the last 3 events, expanded the last 40, newest first, each with a time and a short label', () => {
  const log = sessionLog(60)
  const small = blackBoxRows(log, false)
  expect(small).toHaveLength(BOX_COLLAPSED)
  expect(small.map(r => r.text)).toEqual(['event 59', 'event 58', 'event 57'])
  const big = blackBoxRows(log, true)
  expect(big).toHaveLength(BOX_EXPANDED)
  expect(big[0]!.text).toBe('event 59')
  expect(big[39]!.text).toBe('event 20')
  for (const r of big) {
    expect(r.time).toMatch(/^\d\d:\d\d:\d\d$/)
    expect(r.label.length).toBeGreaterThan(2)
    expect(r.label.length).toBeLessThan(9)
  }
  expect(new Set(blackBoxRows(sessionLog(9), true).map(r => r.label))).toEqual(new Set(['prompt', 'spawn', 'done', 'consult', 'edit', 'error', 'denied', 'lane', 'note']))
  expect(blackBoxRows([], false)).toEqual([])
  expect(blackBoxRows(sessionLog(2), true)).toHaveLength(2)
  expect(LOG_KEEP).toBeGreaterThanOrEqual(BOX_EXPANDED)
})

test('f) the box records prompts, spawns, completions, consults, edits, errors and denials, masks credentials, and marks problems', () => {
  const log = pushLog([], { at: 1, kind: 'error', who: 'main', text: 'curl --token=abcdefgh123456 \u2717', agentId: null })
  const rows = blackBoxRows(log, false)
  expect(rows[0]!.text).not.toContain('abcdefgh123456')
  expect(rows[0]!.isProblem).toBe(true)
  expect(blackBoxSummary(sessionLog(9))).toBe('9 items, 2 problems')
  expect(blackBoxSummary([])).toBe('nothing yet')
  expect(blackBoxSummary(sessionLog(1))).toBe('1 items')
})

test('f) the Black box card draws the rows newest first, problems in red, and says so when empty', () => {
  const svg = blackBoxSvg(520, blackBoxRows(sessionLog(9), true), 'last 9, newest first')
  expect(isWellFormed(svg)).toBe(true)
  expect(svg).toContain('>System log<')
  expect(svg.indexOf('event 8')).toBeLessThan(svg.indexOf('event 0'))
  expect(svg).toMatch(/class="errc"[^>]*>error</)
  expect(svg).toMatch(/class="errc"[^>]*>denied</)
  expect(svg).toContain(`height="${blackBoxHeight(9)}"`)
  expect(blackBoxSvg(520, [], '')).toContain(BLACK_BOX_EMPTY)
})

test('f) the Black box is fed by the Deck\'s own hooks and is rebuilt here: no dependency on the Flightdeck plugin, and NOTICE keeps its licence', () => {
  expect(SRC).toContain('blackBoxRows(deck.log')
  expect(SRC).not.toMatch(/claude-flightdeck\/flightdeck/)
  const notice = readFileSync(resolve(ROOT, 'NOTICE'), 'utf8')
  expect(notice).toContain('Copyright (c) 2026 Stephen Casella')
  expect(notice.toLowerCase()).toContain('black box')
})

// ---------------------------------------------------------------- the terminal and the diagnostics

test('the terminal text view carries the Flight log and the Black box too', () => {
  expect(SRC).toContain("Text({ key: 't-flight'")
  expect(SRC).toContain("Text({ key: 't-box'")
})

test('the diagnostics are still there: the band log, the band fault log, the last-resort one-line bar', () => {
  expect(SRC).toContain("DATA + '/crew-band.log'")
  expect(SRC).toContain("DATA + '/crew-band-fault.log'")
  expect(SRC).toContain('plainBandText(')
})

test('the manifest is 0.5.x to 0.9.x', () => {
  const plugin = JSON.parse(readFileSync(resolve(ROOT, '.claude-plugin/plugin.json'), 'utf8')) as { version: string }
  expect(plugin.version).toMatch(/^0\.(?:[5-9]|\d{2})\.\d+$/)
})
