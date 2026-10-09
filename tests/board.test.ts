import { expect, test } from './pure.ts'

import {
  HANDOFF_FRESH_MS,
  HANDOFF_RULES,
  INBOX_MAX_TEXT,
  STATUS_OLD_MS,
  awayLabel,
  backlogSummary,
  backlogTop,
  briefId,
  buildHandoff,
  contextPressure,
  creditsLines,
  ctxBarLabel,
  ctxPercent,
  diskColor,
  gateExit,
  gateScope,
  handoffName,
  hasBlocking,
  healthSummary,
  inboxAddLine,
  inboxNewCount,
  inboxSummary,
  landedSummary,
  localDate,
  newInboxItems,
  parseAwayLog,
  milestoneProgress,
  parseBacklog,
  parseCredits,
  parseInbox,
  parseLanded,
  parsePresence,
  parseSessionUsage,
  parseStatus,
  presenceText,
  queueItems,
  queueSummary,
  statusAge,
  statusCount,
  statusRatio,
} from '../hooks/board.ts'
import { parseProbe, serviceDot, serviceFrom } from '../hooks/hosts.ts'
import type { ServiceState } from '../hooks/hosts.ts'

const MIN = 60_000
const NOW = Date.parse('2026-10-08T22:00:00Z')

// ---------------------------------------------------------------------------
// Status (v3c)

const STATUS_FILE = JSON.stringify({
  updated: '2026-10-09T01:35:00Z',
  milestone: 'Admin Home settings live',
  done: 3,
  total: 6,
  now: ['lanes mod v3b', 'b21b re-send'],
  next: ['b20c rerun', 'app restart', 'pairing steps'],
  you: [],
})

test('status.json parses: milestone, counts, now, next, you', async () => {
  const s = parseStatus(STATUS_FILE)
  expect(s?.milestone).toBe('Admin Home settings live')
  expect(s?.done).toBe(3)
  expect(s?.total).toBe(6)
  expect(s?.now).toEqual(['lanes mod v3b', 'b21b re-send'])
  expect(s?.next).toEqual(['b20c rerun', 'app restart', 'pairing steps'])
  expect(s?.you).toEqual([])
  expect(s?.updatedMs).toBe(Date.parse('2026-10-09T01:35:00Z'))
  expect(statusRatio(s)).toBe(0.5)
  expect(statusCount(s)).toBe('3/6')
})

test('status.json asks: text with an optional blocking string, strings allowed, empties dropped', async () => {
  const s = parseStatus(
    JSON.stringify({
      you: [{ text: 'approve the pin bump', blocking: 'b20c waits on it' }, { text: 'look at the tile colours' }, 'plain string ask', { text: '  ' }, { blocking: 'no text' }, 5, null, { text: 'yes', blocking: true }],
    }),
  )
  expect(s?.you).toEqual([
    { text: 'approve the pin bump', blocking: 'b20c waits on it' },
    { text: 'look at the tile colours', blocking: '' },
    { text: 'plain string ask', blocking: '' },
    { text: 'yes', blocking: 'yes' },
  ])
  expect(hasBlocking(s?.you ?? [])).toBe(true)
  expect(hasBlocking([{ text: 'a', blocking: '' }])).toBe(false)
  expect(hasBlocking([])).toBe(false)
})

test('status.json: missing or zero total gives no bar and no "NaN"; broken files are no status', async () => {
  for (const text of ['{}', '{"done":3}', '{"total":0,"done":0}', '{"total":"six","done":"x"}', '{"total":-4,"done":2}']) {
    const s = parseStatus(text)
    expect(s).not.toBe(null)
    expect(statusRatio(s)).toBe(null)
    expect(statusCount(s)).toBe('')
  }
  expect(parseStatus('{}')?.now).toEqual([])
  expect(parseStatus('')).toBe(null)
  expect(parseStatus('not json')).toBe(null)
  expect(parseStatus('[1,2]')).toBe(null)
  expect(parseStatus('"x"')).toBe(null)
  expect(statusRatio(null)).toBe(null)
  // done above total is clamped; done missing is 0.
  expect(statusRatio(parseStatus('{"total":4,"done":9}'))).toBe(1)
  expect(statusRatio(parseStatus('{"total":4}'))).toBe(0)
  expect(statusCount(parseStatus('{"total":4,"done":9}'))).toBe('4/4')
})

test('the age rule: "updated 3m ago"; over 30 minutes it is old', async () => {
  const at = (ago: number) => parseStatus(JSON.stringify({ updated: new Date(NOW - ago).toISOString() }))
  expect(statusAge(at(3 * MIN), NOW)).toEqual({ label: 'updated 3m ago', isOld: false })
  expect(statusAge(at(20 * 1000), NOW)).toEqual({ label: 'updated 20s ago', isOld: false })
  expect(statusAge(at(30 * MIN), NOW).isOld).toBe(false)
  expect(statusAge(at(STATUS_OLD_MS + 1000), NOW).isOld).toBe(true)
  expect(statusAge(at(2 * 60 * MIN), NOW)).toEqual({ label: 'updated 2h ago', isOld: true })
  // A clock a little ahead is not negative.
  expect(statusAge(at(-5000), NOW).label).toBe('updated 0s ago')
  // No time, no file, no clock: old, and never NaN.
  expect(statusAge(parseStatus('{}'), NOW)).toEqual({ label: 'update time unknown', isOld: true })
  expect(statusAge(parseStatus('{"updated":"yesterday"}'), NOW).isOld).toBe(true)
  expect(statusAge(null, NOW)).toEqual({ label: 'update time unknown', isOld: true })
  expect(statusAge(at(MIN), Number.NaN).isOld).toBe(true)
})

// ---------------------------------------------------------------------------
// Presence and the away log (C)

test('presence.json: active or away with a time; a missing or broken file is active', async () => {
  expect(parsePresence('{"mode":"active","since":"2026-10-09T01:55:00Z"}')).toEqual({ mode: 'active', since: '2026-10-09T01:55:00Z', sinceMs: Date.parse('2026-10-09T01:55:00Z') })
  expect(parsePresence('{"mode":"away","since":"2026-10-08T20:00:00Z"}').mode).toBe('away')
  expect(parsePresence('').mode).toBe('active')
  expect(parsePresence('nope').mode).toBe('active')
  expect(parsePresence('{"mode":"sideways"}').mode).toBe('active')
  expect(parsePresence('{"mode":"away"}').sinceMs).toBe(null)
})

test('the toggle writes {mode, since} with an ISO time and reads back', async () => {
  const away = presenceText('away', NOW)
  expect(away.endsWith('\n')).toBe(true)
  expect(JSON.parse(away)).toEqual({ mode: 'away', since: '2026-10-08T22:00:00.000Z' })
  expect(parsePresence(away).mode).toBe('away')
  expect(parsePresence(presenceText('active', NOW)).mode).toBe('active')
  // Round trip through the label.
  expect(awayLabel(parsePresence(away), NOW + 2 * 60 * MIN)).toBe('AWAY on since 2h ago')
  expect(awayLabel(parsePresence(away), NOW + 5 * MIN)).toBe('AWAY on since 5m ago')
  expect(awayLabel(parsePresence(presenceText('active', NOW)), NOW)).toBe('')
  expect(awayLabel({ mode: 'away', since: '', sinceMs: null }, NOW)).toBe('AWAY on')
})

test('away-log.md: decisions, BLOCKED items and notes; headings and blanks skipped', async () => {
  const log = [
    '# Away log',
    '',
    '- Decided to keep the pin at v0.1.112',
    '- BLOCKED: b20c needs the pairing code from Sam',
    '* chose the shorter retry loop',
    '1. codex-d finished d17',
    '---',
    'plain line with no bullet',
    '   ',
  ].join('\n')
  expect(parseAwayLog(log)).toEqual([
    { text: 'Decided to keep the pin at v0.1.112', kind: 'decision' },
    { text: 'BLOCKED: b20c needs the pairing code from Sam', kind: 'blocked' },
    { text: 'chose the shorter retry loop', kind: 'decision' },
    { text: 'codex-d finished d17', kind: 'note' },
    { text: 'plain line with no bullet', kind: 'note' },
  ])
  expect(parseAwayLog('')).toEqual([])
  expect(parseAwayLog('\n\n# only a heading\n')).toEqual([])
})

// ---------------------------------------------------------------------------
// Inbox (H)

const L1 = '{"id":"a3f","kind":"bug","text":"the page is blank on phones","at":"2026-10-08T20:00:00.000Z","by":"sam","status":"new"}'
const L2 = '{"id":"b71","kind":"feature","text":"dark mode for the shell","at":"2026-10-08T21:00:00.000Z","by":"sam","status":"new"}'
const L3 = '{"id":"c02","kind":"bug","text":"settings lose the theme","at":"2026-10-08T21:30:00.000Z","by":"sam","status":"new"}'

test('inbox: items in file order, with kind, text, time and status', async () => {
  const items = parseInbox([L1, L2].join('\n') + '\n')
  expect(items.map(i => i.id)).toEqual(['a3f', 'b71'])
  expect(items[0]).toEqual({ id: 'a3f', kind: 'bug', text: 'the page is blank on phones', at: '2026-10-08T20:00:00.000Z', atMs: Date.parse('2026-10-08T20:00:00.000Z'), by: 'sam', status: 'new', ref: '' })
  expect(items[1]?.kind).toBe('feature')
  expect(inboxNewCount(items)).toBe(2)
  expect(inboxSummary(2)).toBe('Inbox: 2 new')
})

test('inbox: the coordinator\'s status lines merge in; a later line for the same id wins', async () => {
  const file = [L1, L2, L3, '{"id":"a3f","status":"filed","ref":"#412"}', '{"id":"b71","status":"triaged"}', '{"id":"b71","status":"filed","ref":"CHAT-DARK-01"}', '{"id":"a3f","status":"new"}'].join('\n')
  const items = parseInbox(file)
  expect(items.find(i => i.id === 'a3f')).toMatchObject({ status: 'new', ref: '' })
  expect(items.find(i => i.id === 'b71')).toMatchObject({ status: 'filed', ref: 'CHAT-DARK-01' })
  expect(items.find(i => i.id === 'c02')?.status).toBe('new')
  expect(inboxNewCount(items)).toBe(2)
  // The item lines themselves are never rewritten: the file only grows by lines.
  expect(file.split('\n').length).toBe(7)
})

test('inbox: a status line that came before its item line is replaced by the later item line', async () => {
  const items = parseInbox(['{"id":"a3f","status":"filed","ref":"#1"}', L1].join('\n'))
  expect(items[0]?.status).toBe('new')
  // A status line for an id that never appeared makes no item.
  expect(parseInbox('{"id":"zzz","status":"filed","ref":"#1"}')).toEqual([])
})

test('inbox: empty file, blank lines and malformed lines are skipped without a crash', async () => {
  expect(parseInbox('')).toEqual([])
  expect(parseInbox('\n\n')).toEqual([])
  const messy = ['garbage', '{"id":"x"}', '{"kind":"bug","text":"no id"}', '[1,2]', '{"id":5,"kind":"bug","text":"numeric id"}', '{"id":"d","kind":"idea","text":"unknown kind"}', L1, '{broken'].join('\n')
  expect(parseInbox(messy).map(i => i.id)).toEqual(['a3f'])
})

test('inbox card: new items newest first, at most six, the others not shown', async () => {
  const lines = Array.from({ length: 9 }, (_, i) => JSON.stringify({ id: 'i' + i, kind: i % 2 ? 'bug' : 'feature', text: 'item ' + i, at: new Date(NOW + i * MIN).toISOString(), by: 'sam', status: i === 8 ? 'filed' : 'new' }))
  const top = newInboxItems(parseInbox(lines.join('\n')))
  expect(top.map(i => i.id)).toEqual(['i7', 'i6', 'i5', 'i4', 'i3', 'i2'])
  expect(newInboxItems(parseInbox(lines.join('\n')), 3).length).toBe(3)
})

test('/crew bug and /crew idea: one JSON line, the confirm text, a free short id', async () => {
  const r = inboxAddLine('bug', '  the page is blank on phones  ', NOW, new Set(), () => 0.5)
  expect(r.ok).toBe(true)
  if (r.ok) {
    const o = JSON.parse(r.line)
    expect(o).toEqual({ id: r.id, kind: 'bug', text: 'the page is blank on phones', at: '2026-10-08T22:00:00.000Z', by: 'sam', status: 'new' })
    expect(r.id).toMatch(/^[0-9a-f]{3}$/)
    expect(r.reply).toBe('added bug #' + r.id + ': the page is blank on phones')
    expect(r.line.includes('\n')).toBe(false)
  }
  // idea and feature are the same kind.
  for (const word of ['idea', 'feature']) {
    const f = inboxAddLine(word, 'dark mode', NOW, new Set())
    expect(f.ok && JSON.parse(f.line).kind).toBe('feature')
  }
  // The line reads back as an item.
  if (r.ok) expect(parseInbox(r.line + '\n')[0]?.text).toBe('the page is blank on phones')
})

test('inbox: empty text is refused, long text is cut at 2000, ids do not repeat', async () => {
  expect(inboxAddLine('bug', '', NOW, new Set()).ok).toBe(false)
  expect(inboxAddLine('bug', '   \n\t ', NOW, new Set()).ok).toBe(false)
  expect(inboxAddLine('idea', '\u0007\u0001', NOW, new Set()).ok).toBe(false)
  expect(inboxAddLine('rant', 'x', NOW, new Set()).ok).toBe(false)
  const long = inboxAddLine('bug', 'y'.repeat(5000), NOW, new Set())
  expect(long.ok && JSON.parse(long.line).text.length).toBe(INBOX_MAX_TEXT)
  // The random number 0.5 gives "800"; with it taken the next tries still find a free id.
  let calls = 0
  const rand = () => (calls++ < 3 ? 0.5 : 0.25)
  const r = inboxAddLine('bug', 'x', NOW, new Set(['800']), rand)
  expect(r.ok && r.id).not.toBe('800')
})

test('inbox: the text is data. Markup, shell and JSON in it are stored as text and never interpreted', async () => {
  const nasty = '$(rm -rf /) `id` </svg><script>x()</script> {"id":"hijack","status":"filed"} ; DROP TABLE'
  const r = inboxAddLine('bug', nasty, NOW, new Set())
  expect(r.ok).toBe(true)
  if (r.ok) {
    // One physical line, whatever the text held.
    expect(r.line.split('\n').length).toBe(1)
    const items = parseInbox(r.line + '\n')
    expect(items.length).toBe(1)
    expect(items[0]?.text).toBe(nasty)
    expect(items[0]?.id).toBe(r.id)
    expect(items[0]?.status).toBe('new')
  }
  // Text with a newline cannot become a second record.
  const multi = inboxAddLine('bug', 'first\n{"id":"evil","kind":"bug","text":"second","status":"new"}', NOW, new Set())
  expect(multi.ok && multi.line.split('\n').length).toBe(1)
  expect(multi.ok && parseInbox(multi.line + '\n').length).toBe(1)
})

// ---------------------------------------------------------------------------
// Backlog (H): ten real rows copied from docs/BACKLOG.md

const REAL_ROWS = [
  '- [x] **CLOSED-CHAT-01: closed conversations remain readable and resume before their next turn** (S, owner bug 2026-10-08). Selecting an older chat reads its history;',
  '- [x] **REMOTE-SVC-P0: one real chat turn through a hand-run link** (S, Sonnet; P0; after SVC-LINUX-CUDA-01 and the homelab session stopping the box\'s old 27B unit).',
  '- [x] **REMOTE-SVC-LINK-01: the engine link (tunnel, probes, states, backoff)** (M small, Sonnet; P1; after REMOTE-SVC-SPEC-01, CORE-01, SVC-CONTRACT-01).',
  '- [x] **REMOTE-SVC-BREAKER-01: fail fast while the link is down, and keep the person\'s words** (S, Sonnet; P1; after LINK-01). Objective: while the state is connecting',
  '- [ ] **REMOTE-SVC-LOG-01: typed link events, nothing else** (S, Sonnet; P2; after LOG-PRIV-01\'s event registry lands). Objective:',
  '- [ ] **REMOTE-SVC-LIVE-01: live pairing walkthrough** (S): complete the first live pairing walkthrough with the owner on the real remote computer',
  '- [ ] **IMG-REVERSE-01: "where is this picture from / what is this?" for a picture a person gives chat** (S design note first, then M, owner asked 2026-10-07',
  '- [ ] **ANSWER-IMG-OWNER-01: owner\'s picture-in-answer examples become acceptance prompts for IMGQ-05 and ANSWER-IMG-06** (S, 2026-10-07; no new build: the feature exists',
  '- [~] **TOOL-OFFER-01: a tool can never silently go missing from what the model is offered** (S to M, owner question after the show_images bug: the tool was insta',
  '- [ ] **MODEL-VET-01 (design note: .cockpit/design/MODEL-VETTING-DESIGN.md, owner answers 2026-10-07 in OWNER-ANSWERS.md; eight slices, spec first; the seed list below is superseded by the design note): a model vetter: a new or changed model answers a fixed set of simple questions, and a model that gets them wrong is not loaded** (M, owner idea 2026-10-07',
]

test('backlog: ten real rows parse, with open, in progress and done counted', async () => {
  const b = parseBacklog(['# Backlog', '', '## Engines', '', ...REAL_ROWS].join('\n'))
  expect(b.items.length).toBe(10)
  expect(b.done).toBe(4)
  expect(b.open).toBe(5)
  expect(b.progress).toBe(1)
  expect(b.items[0]).toEqual({ id: 'CLOSED-CHAT-01', title: 'closed conversations remain readable and resume before their next turn', state: 'done', section: 'Engines' })
  expect(b.items[6]?.id).toBe('IMG-REVERSE-01')
  expect(b.items[6]?.title).toBe('"where is this picture from / what is this?" for a picture a person gives chat')
  expect(b.items[8]).toMatchObject({ id: 'TOOL-OFFER-01', state: 'progress' })
  // An id with a parenthesised note before the colon still parses.
  expect(b.items[9]?.id).toBe('MODEL-VET-01')
  expect(b.items[9]?.title.startsWith('a model vetter')).toBe(true)
})

test('backlog: the top eight items that are not done, in file order; summary line', async () => {
  const b = parseBacklog(REAL_ROWS.join('\n'))
  expect(backlogTop(b, 8).map(i => i.id)).toEqual(['REMOTE-SVC-LOG-01', 'REMOTE-SVC-LIVE-01', 'IMG-REVERSE-01', 'ANSWER-IMG-OWNER-01', 'TOOL-OFFER-01', 'MODEL-VET-01'])
  expect(backlogTop(b, 2).length).toBe(2)
  expect(backlogSummary(b)).toBe('Backlog: 6 open')
  expect(backlogSummary(null)).toBe('Backlog: unreadable')
})

test('backlog: unparseable rows, prose and empty text are skipped, never a crash', async () => {
  const text = ['intro prose with [brackets]', '- [ ] no bold id here', '- [ ] **NOCOLON** missing colon', '- [x] **OK-01: fine**', '    - [ ] **NESTED-02: indented rows count**', '**bold only**', '- [ ] **: empty id**', ''].join('\n')
  const b = parseBacklog(text)
  expect(b.items.map(i => i.id)).toEqual(['OK-01', 'NESTED-02'])
  expect(parseBacklog('').items).toEqual([])
  expect(parseBacklog('\n\n\n').open).toBe(0)
})

test('backlog: "Milestone: <name>" names the milestone, and its section is counted done and total', async () => {
  const text = ['# Backlog', 'Milestone: Admin Home settings live', '', '## Admin Home settings live', '- [x] **A-01: one**', '- [~] **A-02: two**', '- [ ] **A-03: three**', '', '## Other work', '- [ ] **B-01: elsewhere**'].join('\n')
  const b = parseBacklog(text)
  expect(b.milestone).toBe('Admin Home settings live')
  expect(b.items.map(i => i.section)).toEqual(['Admin Home settings live', 'Admin Home settings live', 'Admin Home settings live', 'Other work'])
  expect(milestoneProgress(b)).toEqual({ done: 1, total: 3 })
  // No milestone line, or a name no section has: nothing to count.
  expect(parseBacklog('## S\n- [ ] **X-1: a**').milestone).toBe('')
  expect(milestoneProgress(parseBacklog('## S\n- [ ] **X-1: a**'))).toBeNull()
  expect(milestoneProgress(parseBacklog('Milestone: Nowhere\n## S\n- [ ] **X-1: a**'))).toBeNull()
  // Prose that mentions a milestone is not a milestone line.
  expect(parseBacklog('the next Milestone: is far away\n').milestone).toBe('')
})

// ---------------------------------------------------------------------------
// Queue (v4.2)

test('queue: briefs with no report, not held by a lock, newest first, at most eight', async () => {
  const files = [
    { name: 'brief-b20.md', mtimeMs: 5 },
    { name: 'brief-b21.md', mtimeMs: 9 },
    { name: 'brief-b22.md', mtimeMs: 7 },
    { name: 'brief-b23.md', mtimeMs: 3 },
    { name: 'brief-oc-lanes-mod4.md', mtimeMs: 100 },
    { name: 'README.md', mtimeMs: 50 },
    { name: 'brief-.md', mtimeMs: 60 },
  ]
  const q = queueItems(files, new Set(['b21-report.md']), new Set(['b20']))
  expect(q.items.map(i => i.id)).toEqual(['b22', 'b23'])
  expect(q.total).toBe(2)
  expect(q.items[0]?.name).toBe('brief-b22.md')
  // Held ids are matched without case.
  expect(queueItems(files, new Set(), new Set(['B22'])).items.map(i => i.id)).toEqual(['b21', 'b20', 'b23'])
  expect(queueSummary(2)).toBe('Queue: 2 waiting')
  expect(briefId('brief-b20c.md')).toBe('b20c')
})

test('queue: more than eight shows eight and counts them all', async () => {
  const files = Array.from({ length: 12 }, (_, i) => ({ name: 'brief-q' + i + '.md', mtimeMs: i }))
  const q = queueItems(files, new Set(), new Set())
  expect(q.items.length).toBe(8)
  expect(q.total).toBe(12)
  expect(q.items[0]?.id).toBe('q11')
  expect(queueItems([], new Set(), new Set())).toEqual({ items: [], total: 0 })
})

// ---------------------------------------------------------------------------
// Landed today (v4.3)

test('landed: short hash and subject, at most eight lines', async () => {
  const out = '9dc1cecd chore: bump spec pin to v0.1.112\n4d3cf848 feat: add place resolution and location se\nnot a line\n\n53ac90c feat: Home settings row for owners'
  expect(parseLanded(out)).toEqual([
    { hash: '9dc1cecd', subject: 'chore: bump spec pin to v0.1.112' },
    { hash: '4d3cf848', subject: 'feat: add place resolution and location se' },
    { hash: '53ac90c', subject: 'feat: Home settings row for owners' },
  ])
  const many = Array.from({ length: 12 }, (_, i) => 'abcdef' + i + ' subject ' + i).join('\n')
  expect(parseLanded(many).length).toBe(8)
  expect(parseLanded('')).toEqual([])
})

test('landed: the gate result is the "Gate exit code" of a report that names the hash', async () => {
  const reports = [
    { text: '# b20c report\nCommit 4d3cf848 pushed.\n- **Gate exit code: 1.** Exact blocking failure' },
    { text: '# d15 report\nlanded in 9dc1cecd\n- Gate exit code: **0**' },
    { text: '# other\n- Gate exit code: `2`\nno hash here' },
  ]
  expect(gateExit('4d3cf848', reports)).toBe(1)
  expect(gateExit('9dc1cecd', reports)).toBe(0)
  expect(gateExit('deadbeef', reports)).toBe(null)
  expect(gateExit('abc', reports)).toBe(null)
  // A report that names the hash but has no number gives none.
  expect(gateExit('9dc1cecd', [{ text: 'landed in 9dc1cecd, gate unknown' }])).toBe(null)
  expect(landedSummary([{ gate: 0 }, { gate: 1 }, { gate: null }, { gate: 0 }])).toBe('Landed today: 4, 1 red')
  expect(landedSummary([{ gate: 0 }])).toBe('Landed today: 1')
  expect(landedSummary([])).toBe('Landed today: none')
})

// ---------------------------------------------------------------------------
// Health and credits (v4.4)

test('health: a service is up on a 2xx or 3xx with its time, down on anything else', async () => {
  expect(parseProbe('200 0.012345')).toEqual({ code: 200, ms: 12 })
  expect(parseProbe('000 0.000000')).toEqual({ code: null, ms: null })
  expect(parseProbe('')).toEqual({ code: null, ms: null })
  expect(serviceDot(200)).toBe('green')
  expect(serviceDot(302)).toBe('green')
  expect(serviceDot(500)).toBe('red')
  expect(serviceDot(null)).toBe('red')
  const spec = { name: 'Web app', kind: 'http' as const, target: 'http://localhost:3000/health', timeoutMs: 2000, ssh: '' }
  expect(serviceFrom(spec, '200 0.0421')).toEqual({ name: 'Web app', target: spec.target, dot: 'green', ms: 42, unreachable: false })
  expect(serviceFrom(spec, '503 0.01')).toMatchObject({ dot: 'red', ms: null })
  expect(serviceFrom(spec, '')).toMatchObject({ dot: 'red' })
})

test('credits.json: shown when there, "unknown" when missing', async () => {
  const c = parseCredits('{"opencode":{"left":"$12","expires":"Oct 20"},"cloud":{"expires":"Oct 25"}}')
  expect(creditsLines(c)).toEqual(['OpenCode credit $12 left, expires Oct 20', 'Claude cloud credit unknown'])
  expect(creditsLines(null)).toEqual(['OpenCode credit unknown', 'Claude cloud credit unknown'])
  expect(creditsLines(parseCredits('{}'))).toEqual(['OpenCode credit unknown', 'Claude cloud credit unknown'])
  expect(creditsLines(parseCredits('{"opencode":{"left":"$3"}}'))[0]).toBe('OpenCode credit $3 left')
  expect(parseCredits('garbage')).toBe(null)
  expect(parseCredits('[]')).toBe(null)
})

test('health summary: one line, services by their own names', async () => {
  const credits = parseCredits('{}')
  const svc = (name: string, dot: 'green' | 'red' | 'grey'): ServiceState => ({ name, target: 'http://x', dot, ms: null, unreachable: false })
  expect(healthSummary({ services: [], credits })).toBe('All healthy')
  expect(healthSummary({ services: [svc('Web app', 'green')], credits })).toBe('All healthy')
  expect(healthSummary({ services: [], credits: null })).toBe('All healthy (credits unknown)')
  expect(healthSummary({ services: [svc('Web app', 'red'), svc('Queue', 'green')], credits })).toBe('Web app down')
  expect(healthSummary({ services: [svc('Web app', 'red'), svc('Queue', 'red')], credits })).toBe('Web app down, Queue down')
  expect(healthSummary({ services: [svc('Web app', 'grey')], credits })).toBe('All healthy')
  expect(healthSummary({ services: [{ ...svc('Service-like', 'grey'), unreachable: true }], credits })).toBe('Service-like unknown')
})

// ---------------------------------------------------------------------------
// Context (v3c A3, A5) and its pressure (v4.8, B4)

const jl = (o: unknown): string => JSON.stringify(o)
const USAGE = { input_tokens: 6, cache_creation_input_tokens: 1000, cache_read_input_tokens: 146994, output_tokens: 500 }

test('session usage: the last main-session assistant line gives used = input + cache creation + cache read', async () => {
  const tail = ['{"truncated first li', jl({ type: 'user', message: { content: 'hi' } }), jl({ type: 'assistant', message: { model: 'claude-sonnet-5-5', usage: { input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 3 } } }), jl({ type: 'assistant', message: { model: 'claude-opus-5-5', usage: USAGE } })].join('\n')
  const u = parseSessionUsage(tail)
  expect(u).toEqual({ used: 148000, window: 200000, model: 'claude-opus-5-5' })
  expect(ctxPercent(u)).toBe(74)
  expect(ctxBarLabel(u)).toBe('context 74% \u00b7 148k of 200k')
  expect(diskColor(74)).toBe('#F0A500')
})

test('session usage: a "[1m]" model has a million-token window; sidechain and synthetic lines are skipped', async () => {
  const main = jl({ type: 'assistant', message: { model: 'claude-opus-5-5[1m]', usage: USAGE } })
  expect(parseSessionUsage(main)?.window).toBe(1_000_000)
  expect(ctxBarLabel(parseSessionUsage(main))).toBe('context 15% \u00b7 148k of 1.0M')
  const side = jl({ type: 'assistant', isSidechain: true, message: { model: 'claude-haiku-5-5', usage: { input_tokens: 5, cache_creation_input_tokens: 5, cache_read_input_tokens: 90000 } } })
  const synth = jl({ type: 'assistant', message: { model: '<synthetic>', usage: { input_tokens: 9, cache_creation_input_tokens: 9, cache_read_input_tokens: 9 } } })
  expect(parseSessionUsage([main, side, synth].join('\n'))?.used).toBe(148000)
})

test('session usage: unreadable files say "no data", never NaN', async () => {
  expect(parseSessionUsage('')).toBe(null)
  expect(parseSessionUsage('not json\n"usage" but broken')).toBe(null)
  expect(parseSessionUsage(jl({ message: { usage: {} } }))).toBe(null)
  expect(parseSessionUsage(jl({ message: { model: 'x', usage: { input_tokens: 'many' } } }))).toBe(null)
  expect(ctxBarLabel(null)).toBe('no data')
  expect(ctxPercent(null)).toBe(null)
  expect(ctxPercent({ used: Number.NaN, window: 200000, model: '' })).toBe(null)
  expect(ctxPercent({ used: 5, window: 0, model: '' })).toBe(null)
  expect(ctxBarLabel({ used: Number.NaN, window: 200000, model: '' })).toBe('no data')
})

test('disk bars: green, amber over 70% used, red over 85%, grey when unknown', async () => {
  expect(diskColor(0)).toBe('#3FB950')
  expect(diskColor(70)).toBe('#3FB950')
  expect(diskColor(71)).toBe('#F0A500')
  expect(diskColor(85)).toBe('#F0A500')
  expect(diskColor(86)).toBe('#F85149')
  expect(diskColor(null)).toBe('#8B949E')
  expect(diskColor(Number.NaN)).toBe('#8B949E')
})

test('context pressure: nothing under 70%, amber at 70, red at 85; a fresh handoff says it is safe', async () => {
  const none = (p: number | null) => contextPressure(p, null, NOW)
  expect(none(0).level).toBe('none')
  expect(none(69).level).toBe('none')
  expect(none(69).badge).toBe('')
  expect(none(69).advice).toBe(null)
  expect(none(null).level).toBe('none')
  expect(none(Number.NaN).level).toBe('none')
  expect(none(70).level).toBe('amber')
  expect(none(70).badge).toBe('context 70%: write the handoff, then /clear')
  expect(none(84).level).toBe('amber')
  expect(none(85).level).toBe('red')
  expect(none(97).badge).toBe('context 97%: write the handoff, then /clear')
  // No handoff: amber advice.
  expect(none(74).advice).toEqual({ text: 'write the handoff first (ask the coordinator)', color: '#F0A500' })
  // A handoff from the last 15 minutes: green and safe. An older one, or none, is not.
  expect(contextPressure(74, NOW - 14 * MIN, NOW).advice).toEqual({ text: 'safe to /clear: handoff saved', color: '#3FB950' })
  expect(contextPressure(74, NOW - HANDOFF_FRESH_MS, NOW).advice?.color).toBe('#3FB950')
  expect(contextPressure(74, NOW - 16 * MIN, NOW).advice?.color).toBe('#F0A500')
  expect(contextPressure(74, NOW + 5 * MIN, NOW).advice?.color).toBe('#F0A500')
  expect(contextPressure(74, null, NOW).advice?.color).toBe('#F0A500')
  // The level does not change with the handoff.
  expect(contextPressure(90, NOW - MIN, NOW).level).toBe('red')
})

// ---------------------------------------------------------------------------
// The handoff file (v4.7)

test('handoff: the fixed rules paragraph first, then milestone, now, next, you, locks, queue, landed, open briefs', async () => {
  const text = buildHandoff({
    nowMs: NOW,
    status: parseStatus(JSON.stringify({ milestone: 'Admin Home settings live', done: 3, total: 6, now: ['lanes mod'], next: ['b20c rerun'], you: [{ text: 'approve the pin', blocking: 'b20c' }, { text: 'look at tiles' }] })),
    locks: [{ member: 'codex-b', item: 'b20', heading: 'land the installer fix' }, { member: 'codex-a', item: 'x1', heading: '' }],
    queue: { items: [{ id: 'b22', heading: 'GenUI 03b' }, { id: 'b23', heading: '' }], total: 5 },
    landed: [{ hash: '9dc1cecd', subject: 'chore: bump pin', gate: 0 }, { hash: '4d3cf848', subject: 'feat: place', gate: null }, ...Array.from({ length: 6 }, (_, i) => ({ hash: 'ab' + i + '0000', subject: 's' + i, gate: null }))],
  })
  const lines = text.split('\n')
  expect(lines[0]).toBe('Rules: org CLAUDE.md, ~/.claude/CLAUDE.md, memory index. Re-arm watchers, rebuild missing tmux lanes, read status.json.')
  expect(HANDOFF_RULES).toBe(lines[0])
  expect(text).toContain('# Handoff 2026-10-08')
  expect(text).toContain('Admin Home settings live (3/6)')
  expect(text).toContain('## Now\n\n- lanes mod')
  expect(text).toContain('## Next\n\n- b20c rerun')
  expect(text).toContain('- approve the pin (blocking: b20c)')
  expect(text).toContain('- look at tiles')
  expect(text).toContain('- codex-b: b20 (land the installer fix)')
  expect(text).toContain('- codex-a: x1')
  expect(text).toContain('## Queue (5 waiting)\n\n- b22: GenUI 03b\n- b23')
  expect(text).toContain('- 9dc1cecd chore: bump pin [gate exit 0]')
  expect(text).toContain('## Open briefs\n\n- b20: land the installer fix (codex-b)')
  // Only the last five landed lines.
  expect(text.split('\n').filter(l => /^- (9dc1|4d3c|ab)/.test(l)).length).toBe(5)
})

test('handoff: empty everything still writes a readable file', async () => {
  const text = buildHandoff({ nowMs: NOW, status: null, locks: [], queue: { items: [], total: 0 }, landed: [] })
  expect(text.startsWith(HANDOFF_RULES)).toBe(true)
  expect(text).toContain('## Milestone\n\nunknown')
  expect(text).toContain('## Now\n\n- none')
  expect(text).toContain('## Queue (0 waiting)\n\n- none')
  expect(text).not.toMatch(/NaN|undefined/)
})

test('handoff file name: HANDOFF-<local date>.md, the same name all day', async () => {
  const noon = new Date(2026, 9, 8, 12, 0, 0).getTime()
  const late = new Date(2026, 9, 8, 23, 59, 0).getTime()
  const next = new Date(2026, 9, 9, 0, 1, 0).getTime()
  expect(handoffName(noon)).toBe('HANDOFF-2026-10-08.md')
  expect(handoffName(late)).toBe(handoffName(noon))
  expect(handoffName(next)).toBe('HANDOFF-2026-10-09.md')
  expect(localDate(noon)).toBe('2026-10-08')
})

test('gate scope: the short form of "scope full (...)" in a report', async () => {
  expect(gateScope('exit code 2, scope full (scripts/ changed (scripts/screenshot.ts) - it holds the pin tags)')).toBe('full')
  expect(gateScope('- Gate scope: frontend')).toBe('frontend')
  expect(gateScope('scope **Full**')).toBe('full')
  expect(gateScope('the scope of this change is large')).toBe('')
  expect(gateScope('The gate ran with scope docs.')).toBe('docs')
  expect(gateScope('no scope word here')).toBe('')
  expect(gateScope('')).toBe('')
})
