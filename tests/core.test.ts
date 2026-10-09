import { expect, test } from './pure.ts'

import {
  ageLabel,
  briefHeading,
  briefNames,
  buildItems,
  buildRow,
  classifyCodex,
  classifyLane,
  classifyOpencode,
  ctxLabel,
  describeLane,
  describeSession,
  describeSub,
  fmtTime,
  fmtTokens,
  HOUR_MS,
  isShellPrompt,
  isStaleLane,
  itemFamily,
  itemId,
  itemStatusRank,
  lastLines,
  limitColor,
  limitCompact,
  meaningfulTail,
  newestFile,
  newestReports,
  oneLine,
  parseLock,
  parseProgress,
  progressIsNewer,
  progressRatio,
  summaryLine,
  trackChange,
} from '../hooks/core.ts'

// Pane texts as the screenshot showed them, as far as the brief quotes them: the Codex footer
// ("? for shortcuts", "4 warnings", "f2 to view") and the OpenCode shell prompt (it carries the
// user name and "main \u2193"). The brief gave those fragments, not the whole screen, so the
// lines around them are written to look like a Codex pane and a zsh prompt.
const CODEX_IDLE_PANE = [
  '\u2022 Added docs/dev/searxng.md and linked it from docs/dev.md.',
  '',
  '\u256d\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256e',
  '\u2502 > Ask Codex to do anything                \u2502',
  '\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256f',
  '  ? for shortcuts                                  4 warnings \u00b7 f2 to view',
  '',
]
const CODEX_FOOTER_ONLY = ['  ? for shortcuts', '  4 warnings', '  f2 to view', '  ctrl+t for agents']
const OPENCODE_SHELL_PANE = [
  'Session saved.',
  'alex@alex-laptop home-c-100 main \u2193 % ',
]

test('codex: working when the pane says Working or esc to interrupt', async () => {
  expect(classifyCodex(['> hi', 'Working (3s \u2022 esc to interrupt)'])).toBe('working')
  expect(classifyCodex(['\u2022 Working (12s)'])).toBe('working')
  expect(classifyCodex(['something', 'press esc to interrupt'])).toBe('working')
})

test('codex: idle otherwise, including the footer of an idle pane', async () => {
  expect(classifyCodex([])).toBe('idle')
  expect(classifyCodex(['Worked for 2m 10s', '> ask codex'])).toBe('idle')
  expect(classifyCodex(CODEX_IDLE_PANE)).toBe('idle')
  expect(classifyCodex(CODEX_FOOTER_ONLY)).toBe('idle')
})

test('opencode: working only when the pane has "esc interrupt"', async () => {
  expect(classifyOpencode(['building the thing', '  esc interrupt   ctrl+p commands'])).toBe('working')
  expect(classifyOpencode(['building the thing', 'tool: read file'])).toBe('idle')
  expect(classifyOpencode(OPENCODE_SHELL_PANE)).toBe('idle')
  expect(classifyOpencode(['done', '$', '', ''])).toBe('idle')
  expect(classifyOpencode([])).toBe('idle')
})

test('shell prompt detection', async () => {
  expect(isShellPrompt('sam@box ~/code % ')).toBe(true)
  expect(isShellPrompt('\u276f')).toBe(true)
  expect(isShellPrompt('# ')).toBe(true)
  expect(isShellPrompt('thinking about 100%')).toBe(false)
  expect(isShellPrompt('')).toBe(false)
})

test('classifyLane: absent, codex and opencode', async () => {
  expect(classifyLane('codex-a', false, ['Working'])).toBe('absent')
  expect(classifyLane('codex-b', true, ['Working'])).toBe('working')
  expect(classifyLane('opencode-1', true, ['$'])).toBe('idle')
  expect(classifyLane('opencode-1', true, ['streaming...', 'esc interrupt'])).toBe('working')
  expect(classifyLane('opencode-1', true, ['streaming...'])).toBe('idle')
})

test('lastLines keeps 40 lines and drops blank rows below the cursor', async () => {
  const text = Array.from({ length: 60 }, (_, i) => 'line ' + i).join('\n') + '\n\n\n   \n'
  const lines = lastLines(text, 40)
  expect(lines.length).toBe(40)
  expect(lines[39]).toBe('line 59')
  expect(lines[0]).toBe('line 20')
})

test('lock parser: tab separated owner, lane, time, item', async () => {
  const lock = parseLock('coordinator\tcodex-a\t2026-10-08T20:00:00Z\tagents step 3\n')
  expect(lock).toEqual({ owner: 'coordinator', lane: 'codex-a', time: '2026-10-08T20:00:00Z', item: 'agents step 3' })
})

test('lock parser: tolerant of short, empty and CRLF input', async () => {
  expect(parseLock('')).toBe(null)
  expect(parseLock('\n  \n')).toBe(null)
  expect(parseLock('me\tcodex-b')).toEqual({ owner: 'me', lane: 'codex-b', time: '', item: '' })
  expect(parseLock('me\tcodex-b\tnow\ta\tb\r\n')).toEqual({ owner: 'me', lane: 'codex-b', time: 'now', item: 'a\tb' })
})

test('oneLine trims to 80 and collapses whitespace', async () => {
  expect(oneLine('a   b\t c')).toBe('a b c')
  const long = 'x'.repeat(200)
  expect(oneLine(long).length).toBe(80)
  expect(oneLine(long).endsWith('...')).toBe(true)
})

test('ageLabel', async () => {
  expect(ageLabel(0)).toBe('0s')
  expect(ageLabel(12_400)).toBe('12s')
  expect(ageLabel(180_000)).toBe('3m')
  expect(ageLabel(7_200_000)).toBe('2h')
  expect(ageLabel(-5)).toBe('0s')
})

test('trackChange moves the clock only when the text changes', async () => {
  const a = trackChange(undefined, ['x'], 1000)
  expect(a.since).toBe(1000)
  const b = trackChange(a, ['x'], 9000)
  expect(b.since).toBe(1000)
  const c = trackChange(b, ['x', 'y'], 9500)
  expect(c.since).toBe(9500)
})

test('newestReports sorts by mtime and keeps three', async () => {
  const files = [
    { name: 'a.md', mtimeMs: 1 },
    { name: 'd.md', mtimeMs: 4 },
    { name: 'b.md', mtimeMs: 2 },
    { name: 'c.md', mtimeMs: 3 },
  ]
  expect(newestReports(files).map(f => f.name)).toEqual(['d.md', 'c.md', 'b.md'])
})

const LOCK = { owner: 'o', lane: 'codex-a', time: 't', item: 'x' }
const NOW = 100 * HOUR_MS

test('stale needs an idle lane, a lock file over 6 h old AND a pane quiet for 30 min', async () => {
  const old = NOW - 7 * HOUR_MS
  expect(isStaleLane('idle', LOCK, old, 31 * 60_000, NOW)).toBe(true)
  // Lock under 6 h old: not stale, however quiet the pane.
  expect(isStaleLane('idle', LOCK, NOW - 5 * HOUR_MS, 3 * HOUR_MS, NOW)).toBe(false)
  // Pane changed within 30 min: not stale, however old the lock.
  expect(isStaleLane('idle', LOCK, old, 29 * 60_000, NOW)).toBe(false)
  // Working, absent, no lock, unknown lock age: never stale.
  expect(isStaleLane('working', LOCK, old, 3 * HOUR_MS, NOW)).toBe(false)
  expect(isStaleLane('absent', LOCK, old, 3 * HOUR_MS, NOW)).toBe(false)
  expect(isStaleLane('idle', null, old, 3 * HOUR_MS, NOW)).toBe(false)
  expect(isStaleLane('idle', LOCK, null, 3 * HOUR_MS, NOW)).toBe(false)
  expect(isStaleLane('idle', LOCK, Number.NaN, 3 * HOUR_MS, NOW)).toBe(false)
})

test('buildRow: an idle lane with a fresh lock is no longer labelled stale', async () => {
  const seen = { sig: 'x', since: NOW - 2 * HOUR_MS }
  // The old rule marked every idle lane with a lock. Now the lock file must be old too.
  expect(buildRow('codex-a', 'idle', LOCK, ['> '], seen, NOW, NOW - HOUR_MS).isStale).toBe(false)
  expect(buildRow('codex-a', 'idle', LOCK, ['> '], seen, NOW, null).isStale).toBe(false)
  expect(buildRow('codex-a', 'idle', LOCK, ['> '], seen, NOW, NOW - 7 * HOUR_MS).isStale).toBe(true)
  expect(buildRow('codex-a', 'working', LOCK, ['Working'], seen, NOW, NOW - 7 * HOUR_MS).isStale).toBe(false)
  expect(buildRow('codex-a', 'absent', LOCK, [], undefined, NOW, NOW - 7 * HOUR_MS).isStale).toBe(false)
})

test('tail: drops the Codex footer and shows the last meaningful line', async () => {
  // The empty input prompt is footer too now: the last real line is the message above the box.
  expect(meaningfulTail(CODEX_IDLE_PANE)).toBe('\u2022 Added docs/dev/searxng.md and linked it from docs/dev.md.')
  expect(meaningfulTail(CODEX_FOOTER_ONLY)).toBe('')
  expect(meaningfulTail(['ran the tests', ...CODEX_FOOTER_ONLY])).toBe('ran the tests')
  expect(meaningfulTail(['\u2022 Working (3s \u2022 esc to interrupt)'])).toBe('')
  expect(meaningfulTail(['all green', '  esc interrupt'])).toBe('all green')
})

test('tail: drops box-drawing lines and the shell prompt line', async () => {
  expect(meaningfulTail(['saved the file', '\u2500\u2500\u2500\u2500\u2500\u2500', '\u2502        \u2502', '\u2570\u2500\u2500\u2500\u2500\u256f'])).toBe('saved the file')
  expect(meaningfulTail(OPENCODE_SHELL_PANE)).toBe('Session saved.')
  expect(meaningfulTail(['alex@alex-laptop home-c-100 % '])).toBe('')
  expect(meaningfulTail(['repo main \u2193 %'])).toBe('')
  expect(meaningfulTail(['done', '%'])).toBe('done')
  expect(meaningfulTail([])).toBe('')
})

test('buildRow tail is the filtered line, not the footer or the prompt', async () => {
  expect(buildRow('codex-a', 'idle', null, CODEX_IDLE_PANE, undefined, 0).tail).toBe('\u2022 Added docs/dev/searxng.md and linked it from docs/dev.md.')
  expect(buildRow('opencode-1', 'idle', null, OPENCODE_SHELL_PANE, undefined, 0).tail).toBe('Session saved.')
  expect(buildRow('codex-a', 'absent', null, CODEX_IDLE_PANE, undefined, 0).tail).toBe('')
})

test('numbers are never NaN: an unknown value prints as "-"', async () => {
  expect(ctxLabel(Number.NaN, Number.NaN)).toBe('context - \u00b7 - tokens')
  expect(ctxLabel(undefined, undefined)).toBe('context - \u00b7 - tokens')
  expect(ctxLabel(null, 'x')).toBe('context - \u00b7 - tokens')
  expect(ctxLabel(23.4, 230_000)).toBe('context 23% \u00b7 230k tokens')
  expect(ctxLabel(12, Number.NaN)).toBe('context 12% \u00b7 - tokens')
  expect(fmtTokens(Number.NaN)).toBe('-')
  expect(fmtTokens(Number.POSITIVE_INFINITY)).toBe('-')
  expect(fmtTime(Number.NaN)).toBe('-')
  expect(ageLabel(Number.NaN)).toBe('-')
})

test('progress file: pct and label; the older done/total form still works', async () => {
  expect(parseProgress('{"pct": 42, "label": "tests"}')).toEqual({ item: '', pct: 42, label: 'tests' })
  expect(parseProgress('{"pct": 250}')?.pct).toBe(100)
  expect(parseProgress('{"done": 3, "total": 8, "note": "tests running", "item": "b21"}')).toEqual({ item: 'b21', pct: 37.5, label: 'tests running' })
  expect(parseProgress('{"done": 3, "total": 8}')?.label).toBe('3/8')
  expect(parseProgress('{"label": "thinking"}')?.pct).toBe(null)
  expect(parseProgress('not json')).toBe(null)
  expect(progressRatio(parseProgress('{"pct": 50}'))).toBe(0.5)
  expect(progressRatio(null)).toBe(null)
})

test('codex limit colours: amber under 30% left, red under 10%', async () => {
  expect(limitColor(null)).toBe('#8B949E')
  expect(limitColor(80)).toBe('#3FB950')
  expect(limitColor(30)).toBe('#3FB950')
  expect(limitColor(29)).toBe('#F0A500')
  expect(limitColor(10)).toBe('#F0A500')
  expect(limitColor(9)).toBe('#F85149')
  expect(limitColor(0)).toBe('#F85149')
})

test('limitCompact: percent left with its reset, or "-" when unknown', async () => {
  const now = 1_000_000_000_000
  const future = now / 1000 + 3600
  expect(limitCompact('5h', { leftPct: 62, resetsAt: future }, now).text).toBe('5h 62%')
  expect(limitCompact('week', { leftPct: 8, resetsAt: future }, now).color).toBe('#F85149')
  expect(limitCompact('5h', null, now).text).toBe('5h -')
  expect(limitCompact('5h', { leftPct: 62, resetsAt: now / 1000 - 5 }, now).text).toBe('5h -')
  expect(limitCompact('week', null, now, 12).text).toBe('wk 12%')
  expect(limitCompact('week', { leftPct: Number.NaN, resetsAt: future }, now).text).toBe('wk -')
})

test('summary line counts lanes and running subagents', async () => {
  const row = (lane: string, state: 'working' | 'idle' | 'absent') => buildRow(lane, state, null, [], undefined, 0)
  const rows = [row('codex-a', 'working'), row('codex-b', 'working'), row('codex-c', 'idle'), row('codex-d', 'idle')]
  const subs = [
    { id: '1', name: 'n', type: 't', model: '', status: 'running' },
    { id: '2', name: 'n', type: 't', model: '', status: 'completed' },
  ]
  expect(summaryLine(rows, subs)).toBe('lanes 2 active / 2 idle  |  subagents 1 running')
  expect(summaryLine([...rows, row('opencode-1', 'absent')], [])).toBe('lanes 2 active / 2 idle / 1 absent  |  subagents 0 running')
})

// ---------------------------------------------------------------------------
// Descriptions

const B20 = { owner: 'coordinator', lane: 'codex-a', time: '2026-10-08T20:00:00Z', item: 'b20' }
const B20_BRIEF = '# b20: land GENUI-03b in one pass\n\nWork only inside the repo.\n\n## Goal\nsomething\n'

test('brief heading: the first "# " line, with the "<item>:" prefix cut off', async () => {
  expect(briefHeading(B20_BRIEF, 'b20')).toBe('land GENUI-03b in one pass')
  // Prefix match ignores case and keeps the rest as is.
  expect(briefHeading('# B20: Land it\n', 'b20')).toBe('Land it')
  // No prefix to cut: the heading stays whole.
  expect(briefHeading('# Lanes mod v3b: say what each session is doing\n')).toBe('Lanes mod v3b: say what each session is doing')
  expect(briefHeading('# c-101: write the doc\n', 'b20')).toBe('c-101: write the doc')
  // Only a first-level heading counts, and the first one wins.
  expect(briefHeading('intro\n## Not this\n# This one\n# Not the second\n')).toBe('This one')
  expect(briefHeading('## only a subheading\ntext')).toBe('')
  expect(briefHeading('')).toBe('')
  expect(briefHeading('# b20:\n', 'b20')).toBe('')
  expect(briefHeading('#nospace\n')).toBe('')
  expect(briefHeading('# b20: windows line\r\n', 'b20')).toBe('windows line')
})

test('lock item to brief files: the id is the first safe word; b and c variants are candidates', async () => {
  expect(itemId(B20)).toBe('b20')
  expect(itemId({ ...B20, item: 'b20 land the thing' })).toBe('b20')
  expect(itemId({ ...B20, item: 'agents step 3' })).toBe('agents')
  // Nothing that could leave the queue folder.
  expect(itemId({ ...B20, item: '../../etc/passwd' })).toBe('')
  expect(itemId({ ...B20, item: '/abs/path' })).toBe('')
  expect(itemId({ ...B20, item: '' })).toBe('')
  expect(itemId(null)).toBe('')
  expect(briefNames('b20')).toEqual(['brief-b20.md', 'brief-b20b.md', 'brief-b20c.md'])
  expect(briefNames('')).toEqual([])
})

test('newest match wins; a missing or NaN mtime is never newest', async () => {
  const files = [{ p: 'brief-b20.md', mtimeMs: 10 }, { p: 'brief-b20b.md', mtimeMs: 30 }, { p: 'brief-b20c.md', mtimeMs: 20 }]
  expect(newestFile(files)?.p).toBe('brief-b20b.md')
  expect(newestFile([])).toBe(null)
  expect(newestFile([{ p: 'x', mtimeMs: Number.NaN }, { p: 'y', mtimeMs: 1 }])?.p).toBe('y')
})

test('progress counts only when newer than the lock', async () => {
  expect(progressIsNewer(200, 100)).toBe(true)
  expect(progressIsNewer(100, 200)).toBe(false)
  expect(progressIsNewer(100, 100)).toBe(false)
  expect(progressIsNewer(100, null)).toBe(true)
  expect(progressIsNewer(null, 100)).toBe(false)
  expect(progressIsNewer(Number.NaN, 100)).toBe(false)
})

test('describeLane: b20 gives its brief heading', async () => {
  expect(describeLane(B20, briefHeading(B20_BRIEF, 'b20'), null, 'ran the tests')).toBe('land GENUI-03b in one pass')
})

test('describeLane: a missing brief falls back to the progress label, then to the tail', async () => {
  const prog = { item: '', pct: 40, label: 'tests running' }
  expect(describeLane(B20, '', prog, 'ran the tests')).toBe('tests running')
  // Progress older than the lock is passed in as null: the tail is next.
  expect(describeLane(B20, '', null, 'ran the tests')).toBe('ran the tests')
  // A progress file with no label says nothing.
  expect(describeLane(B20, '', { item: '', pct: 40, label: '' }, 'ran the tests')).toBe('ran the tests')
  // The brief heading beats both.
  expect(describeLane(B20, 'land it', prog, 'ran the tests')).toBe('land it')
})

test('describeLane: with nothing but the lock, its item; with nothing at all, "no task"', async () => {
  expect(describeLane(B20, '', null, '')).toBe('b20')
  expect(describeLane(null, '', null, '')).toBe('no task')
  expect(describeLane(null, '  ', null, '   ')).toBe('no task')
  expect(describeLane({ ...B20, item: '' }, '', null, '')).toBe('no task')
})

test('describeLane: OpenCode has no lock; the brief heading or the filtered tail', async () => {
  expect(describeLane(null, briefHeading('# Lanes mod v3b: say what each session is doing\n'), null, 'x')).toBe('Lanes mod v3b: say what each session is doing')
  expect(describeLane(null, '', null, 'Session saved.')).toBe('Session saved.')
})

test('describeLane: whitespace is squashed and a very long text is cut', async () => {
  expect(describeLane(B20, 'land   it\n  now', null, '')).toBe('land it now')
  expect(describeLane(null, '', null, 'x'.repeat(500)).length).toBeLessThanOrEqual(200)
})

test('this session: the newest lock names what it coordinates, else idle', async () => {
  const locks = [{ item: 'b19', mtimeMs: 100 }, { item: 'b20', mtimeMs: 300 }, { item: 'c-4', mtimeMs: 200 }]
  expect(describeSession(locks, false)).toBe('coordinating: b20')
  expect(describeSession(locks, true)).toBe('coordinating: b20')
  expect(describeSession([], false)).toBe('idle, waiting for reports')
  expect(describeSession([{ item: '', mtimeMs: 5 }, { item: 'x', mtimeMs: null }], false)).toBe('idle, waiting for reports')
  // No lock but a turn is running: it does not claim to be idle.
  expect(describeSession([], true)).toBe('active')
})

test('subagent: its description, else its type', async () => {
  expect(describeSub('scout the repo', 'Explore', 'agent-1')).toBe('scout the repo')
  expect(describeSub('', 'Explore', 'agent-1')).toBe('Explore')
  // The title already says it: show the type instead of the same words twice.
  expect(describeSub('scout the repo', 'Explore', 'scout the repo')).toBe('Explore')
  expect(describeSub('', '', 'agent-1')).toBe('subagent')
})

// ---------------------------------------------------------------------------
// Work items (the "By item" view)

const IN = Date.parse('2026-10-08T22:00:00Z')
const M = 60_000
const H = 60 * M
const crewOf = (name: string, activity: string, state: 'working' | 'idle' = 'working', over: object = {}) => ({ name, kind: 'codex', variant: 0, state, activity, sinceMs: 0, ratio: null, ...over })
const lockOf = (member: string, item: string, ago = 30 * M) => ({ member, item, mtimeMs: IN - ago })
const briefOf = (id: string, heading = '', ago = H, isOpencode = false) => ({ id, heading, mtimeMs: IN - ago, isOpencode })
const reportOf = (id: string, ago = H, gate: number | null = 0, scope = 'full') => ({ id, mtimeMs: IN - ago, gate, scope })
const ids = (items: { family: string }[]) => items.map(i => i.family)

test('items: nothing at all is no items', async () => {
  expect(buildItems([], [], [], [], [], [], { nowMs: IN })).toEqual([])
  expect(buildItems([], [], [], [], [], [])).toEqual([])
})

test('item families: "b21", "b21b" and "b21c" are one family; an id that does not end in a letter after a digit is alone', async () => {
  expect(itemFamily('b21b')).toEqual({ family: 'b21', variant: 'b' })
  expect(itemFamily('b21')).toEqual({ family: 'b21', variant: '' })
  expect(itemFamily('B20C')).toEqual({ family: 'b20', variant: 'c' })
  expect(itemFamily('oc-lanes-mod3c')).toEqual({ family: 'oc-lanes-mod3', variant: 'c' })
  expect(itemFamily('place-map-d17')).toEqual({ family: 'place-map-d17', variant: '' })
  expect(itemFamily('c-101')).toEqual({ family: 'c-101', variant: '' })
})

test('items: variants merge into one family shown with the latest variant', async () => {
  const items = buildItems(
    [lockOf('codex-c', 'b21b')],
    [briefOf('b21', 'b21: first try', 5 * H), briefOf('b21b', 'b21b: land ADMIN-HOME-SETTINGS-01', 2 * H), briefOf('b21c', 'b21c: the retry', 10 * M)],
    [],
    [],
    [],
    [crewOf('codex-c', 'coding')],
    { nowMs: IN },
  )
  expect(items.length).toBe(1)
  expect(items[0]).toMatchObject({ family: 'b21', latest: 'b21c', ids: ['b21', 'b21b', 'b21c'], heading: 'b21c: the retry', briefName: 'brief-b21c.md', status: 'working' })
  expect(items[0]?.assignees.map(a => a.name)).toEqual(['codex-c'])
  // The title comes from the name function, else the heading.
  expect(buildItems([], [briefOf('b21', 'land it')], [], [], [], [], { nowMs: IN })[0]?.title).toBe('land it')
  expect(buildItems([], [briefOf('b21', 'land it')], [], [], [], [], { nowMs: IN, nameOf: (id: string) => 'Home Settings ' + id })[0]?.title).toBe('Home Settings b21')
})

test('items: a queued brief with no lock and no report is unassigned', async () => {
  const [it] = buildItems([], [briefOf('b30', 'b30: Land Place Map', 20 * M)], [], [], [], [crewOf('codex-a', 'sleeping', 'idle')], { nowMs: IN })
  expect(it).toMatchObject({ family: 'b30', status: 'queued', assignees: [], blockedBy: null, gate: null, ratio: 0.2, sinceAt: IN - 20 * M, briefName: 'brief-b30.md', reportName: '' })
  expect(itemStatusRank('queued')).toBeGreaterThan(itemStatusRank('working'))
})

test('items: a commit that landed today with the item id makes it landed', async () => {
  const items = buildItems([], [], [reportOf('b22', 2 * H, 0, 'full')], [{ hash: '4d3cf848', subject: 'feat: place resolution (b22)' }, { hash: '9dc1cecd', subject: 'chore: bump spec pin' }], [], [], { nowMs: IN })
  expect(items.length).toBe(1)
  expect(items[0]).toMatchObject({ family: 'b22', status: 'landed', hashes: ['4d3cf848'], ratio: 1, sinceAt: null, gate: { exit: 0, scope: 'full' } })
  // A backlog id in the brief's heading also links a commit to the item.
  const byBacklog = buildItems([], [briefOf('b40', 'b40: land PLACE-MAP-01', H)], [reportOf('b40', H)], [{ hash: 'abc1234', subject: 'feat: PLACE-MAP-01 backend' }], [], [], { nowMs: IN })
  expect(byBacklog[0]).toMatchObject({ status: 'landed', hashes: ['abc1234'] })
  // A subject carrying an id nobody knows makes no item, and "b2" is not "b22".
  expect(buildItems([], [], [reportOf('b2', H)], [{ hash: 'x', subject: 'fix b22 and b210' }], [], [], { nowMs: IN })[0]?.status).toBe('done-not-landed')
  expect(buildItems([], [], [], [{ hash: 'x', subject: 'fix zz9 now' }], [], [], { nowMs: IN })).toEqual([])
})

test('items: a failing gate in the report, or a red member, makes it red', async () => {
  const failing = buildItems([], [], [reportOf('b17', 30 * M, 1, 'full')], [], [], [], { nowMs: IN })
  expect(failing[0]).toMatchObject({ status: 'red', gate: { exit: 1, scope: 'full' }, ratio: 0.8, sinceAt: IN - 30 * M, reportName: 'b17-report.md' })
  // The same failing report but the lane works on it again: not red.
  const retry = buildItems([lockOf('codex-b', 'b17')], [], [reportOf('b17', 30 * M, 1)], [], [], [crewOf('codex-b', 'coding')], { nowMs: IN })
  expect(retry[0]?.status).toBe('working')
  // A red member is red whatever the report says.
  expect(buildItems([lockOf('codex-b', 'b18')], [], [], [], [], [crewOf('codex-b', 'red')], { nowMs: IN })[0]?.status).toBe('red')
  // A failing report whose commit landed anyway is landed.
  expect(buildItems([], [], [reportOf('b19', H, 2)], [{ hash: 'h1', subject: 'land b19' }], [], [], { nowMs: IN })[0]?.status).toBe('landed')
})

// Sam (v8): "why do some line items say red". Cause: an item family merges b21, b21b and b21c; b21b's failed
// gate report turned the NEW queued b21c red. A failed gate belongs to the work it reported on.
test('items: a queued item is never red: a newer brief behind an old failing report stays queued', async () => {
  // b21b reported red 2 h ago; b21c was briefed 10 minutes ago and nobody holds it.
  const [it] = buildItems([], [briefOf('b21b', 'b21b: first try', 3 * H), briefOf('b21c', 'b21c: the retry', 10 * M)], [reportOf('b21b', 2 * H, 2, 'full')], [], [], [crewOf('codex-a', 'sleeping', 'idle')], { nowMs: IN })
  expect(it?.family).toBe('b21')
  expect(it?.status).toBe('queued')
  // The same family with no newer brief: the failure is current and the item is red (it did fail).
  expect(buildItems([], [briefOf('b21b', 'b21b: first try', 3 * H)], [reportOf('b21b', 2 * H, 2, 'full')], [], [], [], { nowMs: IN })[0]?.status).toBe('red')
  // A lock taken after the failing report (someone started again) is not red either.
  expect(buildItems([lockOf('codex-a', 'b21c', 10 * M)], [], [reportOf('b21b', 2 * H, 2)], [], [], [crewOf('codex-a', 'coding')], { nowMs: IN })[0]?.status).toBe('working')
  expect(buildItems([lockOf('codex-a', 'b21c', 10 * M)], [], [reportOf('b21b', 2 * H, 2)], [], [], [crewOf('codex-a', 'sleeping', 'idle')], { nowMs: IN })[0]?.status).toBe('working')
})

test('items: a lock held by an idle lane that is stale says "stale-lock" (amber), not working', async () => {
  const stale = buildItems([lockOf('codex-d', 'b40', 8 * H)], [briefOf('b40', 'b40: old work', 9 * H)], [], [], [], [crewOf('codex-d', 'sleeping', 'idle', { isStale: true })], { nowMs: IN })
  expect(stale[0]?.status).toBe('stale-lock')
  // A stale-looking lane that is actually working is working; a fresh lock on an idle lane is working.
  expect(buildItems([lockOf('codex-d', 'b40', 8 * H)], [], [], [], [], [crewOf('codex-d', 'coding', 'working', { isStale: true })], { nowMs: IN })[0]?.status).toBe('working')
  expect(buildItems([lockOf('codex-d', 'b40', 20 * M)], [], [], [], [], [crewOf('codex-d', 'sleeping', 'idle')], { nowMs: IN })[0]?.status).toBe('working')
  expect(itemStatusRank('stale-lock')).toBeLessThan(itemStatusRank('working'))
})

test('items: a member that waits on someone makes it blocked, with the chip; so does a member asking you', async () => {
  const blocked = buildItems([lockOf('codex-c', 'b20c')], [briefOf('b20c', 'b20c: the installer fix')], [], [], [{ member: 'codex-c', on: 'codex-b', why: 'needs b20c installer fix on main' }], [crewOf('codex-c', 'coding')], { nowMs: IN })
  expect(blocked[0]).toMatchObject({ status: 'blocked', blockedBy: { on: 'codex-b', why: 'needs b20c installer fix on main' }, ratio: 0.5 })
  const asking = buildItems([lockOf('codex-c', 'b20c')], [], [], [], [], [crewOf('codex-c', 'asking')], { nowMs: IN })
  expect(asking[0]?.status).toBe('blocked')
  expect(asking[0]?.blockedBy?.on).toBe('sam')
  // Red beats blocked.
  expect(buildItems([lockOf('codex-c', 'b20c')], [], [], [], [{ member: 'codex-c', on: 'x', why: '' }], [crewOf('codex-c', 'red')], { nowMs: IN })[0]?.status).toBe('red')
})

test('items: working, testing and reviewing follow what the member is doing; a lock on an idle member is still working', async () => {
  const st = (activity: string, state: 'working' | 'idle' = 'working') => buildItems([lockOf('codex-a', 'b50')], [], [], [], [], [crewOf('codex-a', activity, state)], { nowMs: IN })[0]
  expect(st('coding')?.status).toBe('working')
  expect(st('coding')?.ratio).toBe(0.5)
  expect(st('testing')?.status).toBe('testing')
  expect(st('testing')?.ratio).toBe(0.8)
  expect(st('reviewing')?.status).toBe('reviewing')
  expect(st('sleeping', 'idle')?.status).toBe('working')
  expect(st('coding')?.sinceAt).toBe(IN - 30 * M)
})

test('items: a report with a clean gate and nothing on main yet is done-not-landed; reports older than 24 h are not items', async () => {
  const items = buildItems([], [], [reportOf('b19', 3 * H, 0, 'frontend'), reportOf('b01', 25 * H, 0)], [], [], [], { nowMs: IN })
  expect(ids(items)).toEqual(['b19'])
  expect(items[0]).toMatchObject({ status: 'done-not-landed', gate: { exit: 0, scope: 'frontend' }, ratio: 0.9, sinceAt: IN - 3 * H })
  // A brief whose report exists (even an old one) is not queued.
  expect(buildItems([], [briefOf('b01', 'old')], [], [], [], [], { nowMs: IN, allReportIds: new Set(['b01']) })).toEqual([])
  // The gate is "none" when the report has no exit code.
  expect(buildItems([], [], [reportOf('b19', H, null)], [], [], [], { nowMs: IN })[0]?.gate).toBe(null)
})

test('items: the member\'s own progress file wins over the status mapping', async () => {
  const it = buildItems([lockOf('codex-a', 'b50')], [], [], [], [], [crewOf('codex-a', 'coding', 'working', { ratio: 0.42 })], { nowMs: IN })[0]
  expect(it?.ratio).toBe(0.42)
  expect(buildItems([lockOf('codex-a', 'b50')], [], [], [], [], [crewOf('codex-a', 'coding', 'working', { ratio: 7 })], { nowMs: IN })[0]?.ratio).toBe(1)
})

test('items: several members on one item; a lock for a member that is not in the crew has no assignee', async () => {
  const two = buildItems([lockOf('codex-a', 'b50'), lockOf('codex-b', 'b50b')], [], [], [], [], [crewOf('codex-a', 'coding'), crewOf('codex-b', 'testing')], { nowMs: IN })
  expect(two.length).toBe(1)
  expect(two[0]?.assignees.map(a => a.name)).toEqual(['codex-a', 'codex-b'])
  expect(two[0]?.status).toBe('testing')
  const gone = buildItems([lockOf('codex-z', 'b60')], [briefOf('b60')], [], [], [], [], { nowMs: IN })
  expect(gone[0]?.assignees).toEqual([])
  expect(gone[0]?.status).toBe('queued')
})

test('items: the OpenCode item is the newest OpenCode brief family, assigned to the OpenCode member', async () => {
  const items = buildItems(
    [],
    [briefOf('oc-lanes-mod3', 'Lanes mod v3', 8 * H, true), briefOf('oc-lanes-mod4', 'Crew mod v4', 3 * H, true), briefOf('oc-lanes-mod4b', 'Crew mod v4b', 10 * M, true)],
    [],
    [],
    [],
    [{ name: 'opencode-1', kind: 'api', variant: 0, state: 'working', activity: 'coding', sinceMs: 0, ratio: null }, crewOf('codex-a', 'coding')],
    { nowMs: IN },
  )
  expect(items.length).toBe(1)
  expect(items[0]).toMatchObject({ family: 'oc-lanes-mod4', latest: 'oc-lanes-mod4b', isOpencode: true, status: 'working', briefName: 'brief-oc-lanes-mod4b.md' })
  expect(items[0]?.assignees.map(a => a.name)).toEqual(['opencode-1'])
  // With no OpenCode member it is queued.
  expect(buildItems([], [briefOf('oc-x', 'x', M, true)], [], [], [], [], { nowMs: IN })[0]?.status).toBe('queued')
})

test('items: sorted red, blocked, working, queued, done-not-landed, landed', async () => {
  const items = buildItems(
    [lockOf('codex-a', 'w1'), lockOf('codex-b', 'bl1')],
    [briefOf('q1', 'queued one', 10 * M)],
    [reportOf('r1', H, 1), reportOf('d1', H, 0), reportOf('l1', H, 0)],
    [{ hash: 'h', subject: 'land l1' }],
    [{ member: 'codex-b', on: 'codex-a', why: '' }],
    [crewOf('codex-a', 'coding'), crewOf('codex-b', 'coding')],
    { nowMs: IN },
  )
  expect(ids(items)).toEqual(['r1', 'bl1', 'w1', 'q1', 'd1', 'l1'])
  expect(items.map(i => i.status)).toEqual(['red', 'blocked', 'working', 'queued', 'done-not-landed', 'landed'])
})

test('items: the ones status.json lists in "now" then "next" come first, in that order', async () => {
  const items = buildItems(
    [lockOf('codex-a', 'w1')],
    [briefOf('q1', 'queued one', 10 * M), briefOf('q2', 'queued two', 20 * M), briefOf('q3', 'queued three', 30 * M)],
    [reportOf('r1', H, 1)],
    [],
    [],
    [crewOf('codex-a', 'coding')],
    { nowMs: IN, statusNow: ['q3 re-send', 'lanes mod'], statusNext: ['q2 later', 'w1 after'] },
  )
  expect(ids(items)).toEqual(['q3', 'q2', 'w1', 'r1', 'q1'])
  expect(items.map(i => i.group)).toEqual(['now', 'next', 'next', 'other', 'other'])
  // An entry may match by the item's name too.
  const named = buildItems([], [briefOf('q1', 'queued one')], [], [], [], [], { nowMs: IN, nameOf: () => 'Home Settings', statusNow: ['Home Settings polish'] })
  expect(named[0]?.group).toBe('now')
  // "q1" does not match an entry that only has "q10".
  expect(buildItems([], [briefOf('q1')], [], [], [], [], { nowMs: IN, statusNow: ['q10 now'] })[0]?.group).toBe('other')
})
