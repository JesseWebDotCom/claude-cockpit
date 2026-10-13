import { expect, test } from './pure.ts'

import { buildGraph } from '../hooks/crew.ts'
import type { Edge } from '../hooks/crew.ts'
import {
  graphHeight,
  graphSvg,
  limitsAlt,
  limitsAreaHeight,
  limitsAreaSvg,
  listCardSvg,
  listHeight,
  statusHeight,
  statusSvg,
  wrapCardSvg,
  wrapHeight,
} from '../hooks/cards.ts'
import { creditViews, winOf } from '../hooks/limits.ts'
import type { GraphSprite, StatusCardIn } from '../hooks/cards.ts'
import { count, idsAreUnique, isWellFormed } from './helpers.ts'

const CARD: StatusCardIn = {
  hasStatus: true,
  milestone: 'Admin Home settings live',
  ratio: 0.5,
  count: '3/6',
  now: ['lanes mod v3b', 'b21b re-send'],
  next: ['b20c rerun', 'app restart', 'pairing steps'],
  you: [],
  age: 'updated 3m ago',
  isOld: false,
  presence: { text: 'Active', isAway: false, label: '' },
}

const heightOf = (svg: string): number => Number(/height="([\d.]+)"/.exec(svg)?.[1] ?? Number.NaN)
const widthOf = (svg: string): number => Number(/width="([\d.]+)"/.exec(svg)?.[1] ?? Number.NaN)

// ---------------------------------------------------------------------------
// The Status card

test('status card: one svg with the milestone, the bar with done/total, Now, Next, "You: nothing" and the age', async () => {
  const svg = statusSvg(520, CARD)
  expect(isWellFormed(svg)).toBe(true)
  expect(idsAreUnique(svg)).toBe(true)
  expect(count(svg, '<svg ')).toBe(1)
  expect(widthOf(svg)).toBe(520)
  expect(heightOf(svg)).toBe(statusHeight(520, CARD))
  expect(svg).toContain('Admin Home settings live')
  expect(svg).toContain('3/6')
  expect(svg).toContain('Now: lanes mod v3b \u00b7 b21b re-send')
  expect(svg).toContain('Next: b20c rerun, app restart, pairing steps')
  expect(svg).toContain('You: nothing')
  expect(svg).toContain('updated 3m ago')
  expect(svg).not.toContain('status may be old')
  expect(svg).toContain('class="tile"')
  expect(svg).toContain('Active')
  expect(svg).not.toMatch(/NaN|undefined/)
  // Next is dim, Now is bright.
  expect(svg).toMatch(/<text class="m"[^>]*>Next:/)
  expect(svg).toMatch(/<text class="t"[^>]*>Now:/)
})

test('status card: a missing or zero total draws an empty bar, never NaN', async () => {
  for (const bad of [{ ratio: null, count: '' }, { ratio: null, count: '0/0' }]) {
    const svg = statusSvg(520, { ...CARD, ...bad })
    expect(svg).toContain('no count')
    expect(svg).not.toMatch(/NaN|undefined|Infinity/)
    expect(isWellFormed(svg)).toBe(true)
  }
  expect(statusSvg(520, { ...CARD, ratio: 1, count: '6/6' })).not.toContain('no count')
})

test('status card: no status file says so; an empty now or next says "nothing"', async () => {
  const none = statusSvg(520, { ...CARD, hasStatus: false })
  expect(none).toContain('No status yet')
  expect(none).not.toContain('Now:')
  expect(isWellFormed(none)).toBe(true)
  const empty = statusSvg(520, { ...CARD, now: [], next: [] })
  expect(empty).toContain('Now: nothing')
  expect(empty).toContain('Next: nothing')
})

test('status card: Now, Next and You are three single lines; You is amber, red when an ask blocks; the full text is the hover', async () => {
  const you = [{ text: 'approve the pin bump', blocking: '' }, { text: 'look at the tile colours', blocking: 'b20c waits on it' }]
  const svg = statusSvg(520, { ...CARD, you })
  expect(svg).toContain('approve the pin bump')
  expect(svg).toContain('look at the tile colours')
  expect(svg).not.toContain('You: nothing')
  // The blocking reason is in the hover text.
  expect(svg).toMatch(/<title>[^<]*\[blocking: b20c waits on it\]/)
  // One red line (an ask blocks); with none blocking it is amber.
  expect(svg).toMatch(/<text fill="#F85149"[^>]*>You:/)
  expect(statusSvg(520, { ...CARD, you: [{ text: 'look at the tiles', blocking: '' }] })).toMatch(/<text fill="#F0A500"[^>]*>You:/)
  // The card is the same height with any number of asks: three lines, not a box per ask.
  expect(heightOf(svg)).toBe(heightOf(statusSvg(520, CARD)))
  expect(heightOf(svg)).toBeLessThanOrEqual(90)
  expect(isWellFormed(svg)).toBe(true)
})

test('status card: a long line is cut with an ellipsis on ONE line, never wider than the card; the hover has it all', async () => {
  const text = 'please look at the new settings screens on your phone and tell me whether the spacing feels right before I merge the whole thing tonight'
  const you = [{ text, blocking: 'the merge waits for your answer on the spacing question above, nothing else can land until then' }]
  for (const W of [300, 360, 600, 900]) {
    const svg = statusSvg(W, { ...CARD, you })
    expect(svg).toContain('\u2026')
    expect(heightOf(svg)).toBe(statusHeight(W, CARD))
    expect(svg).toMatch(/<title>[^<]*tonight/)
    expect(svg).toMatch(/<title>[^<]*nothing else can land until then/)
    expect(isWellFormed(svg)).toBe(true)
  }
})

test('status card: the title and the bar share one line; the age shows only past 30 minutes, as an amber dot', async () => {
  const fresh = statusSvg(520, CARD)
  expect(fresh).not.toMatch(/<text[^>]*>3m ago/)
  expect(fresh).not.toContain('<circle')
  const old = statusSvg(520, { ...CARD, age: 'updated 45m ago', isOld: true })
  expect(old).toMatch(/<circle [^>]*fill="#F0A500"/)
  expect(old).toMatch(/<text[^>]*>45m ago<\/text>/)
  // The bar is solid (no dot texture) on line 1.
  expect(fresh).toContain('rx="4" fill="#3FB950"')
  expect(fresh).not.toContain('class="tw')
})

test('status card: over 30 minutes old it is dimmed and says "status may be old"', async () => {
  const old = statusSvg(520, { ...CARD, age: 'updated 45m ago', isOld: true })
  expect(old).toContain('updated 45m ago')
  expect(old).toContain('status may be old')
  expect(old).toContain('<g opacity="0.6">')
  const fresh = statusSvg(520, CARD)
  expect(fresh).not.toContain('<g opacity="0.6">')
  // No file: nothing to dim, no "may be old" line.
  expect(statusSvg(520, { ...CARD, hasStatus: false, isOld: true })).not.toContain('status may be old')
})

test('status card: the Active / Away pill, with "away since 2h ago"', async () => {
  const active = statusSvg(520, CARD)
  expect(active).toContain('>Active<')
  expect(active).not.toContain('\u263e')
  const away = statusSvg(520, { ...CARD, presence: { text: 'Away', isAway: true, label: 'away since 2h ago' } })
  expect(away).toContain('\u263e Away')
  expect(away).toContain('away since 2h ago')
  expect(away).toContain('#F0A500')
})

test('status card: everything shown is escaped', async () => {
  const evil = '</text><script>alert(1)</script> & "x"'
  const svg = statusSvg(520, { ...CARD, milestone: evil, now: [evil], next: [evil], you: [{ text: evil, blocking: evil }], age: evil })
  expect(svg).not.toContain('<script')
  expect(svg).toContain('&lt;script&gt;')
  expect(isWellFormed(svg)).toBe(true)
})

test('status card: narrow and wide panes both draw clean', async () => {
  for (const W of [240, 360, 900]) {
    const svg = statusSvg(W, { ...CARD, you: [{ text: 'an ask', blocking: 'a block' }] })
    expect(isWellFormed(svg)).toBe(true)
    expect(widthOf(svg)).toBe(W)
    expect(svg).not.toMatch(/NaN|undefined/)
  }
})

// ---------------------------------------------------------------------------
// Usage bars

const LNOW = 1_000_000_000_000
const pool = (id: string, name: string, five: number | null, week: number | null) => ({
  id,
  name,
  five: winOf('5h', five, five === null ? null : LNOW + 3 * 3600_000),
  week: winOf('week', week, week === null ? null : LNOW + 3 * 86_400_000),
})
const CREDS = creditViews({ opencode: { total: 200, left: 138, expires: '2026-10-28' }, cloud: { total: null, left: null, expires: '2026-11-30' } }, LNOW)

test('limits area: two thin bars per plan (5h and week), the percent inside the right end, credits one line each, under 90 px', async () => {
  const input = { pools: [pool('claude', 'Claude', 31, 62), pool('codex', 'Codex', 52, 97)], credits: CREDS, outPools: new Set<string>(), nowMs: LNOW }
  const svg = limitsAreaSvg(520, input)
  expect(isWellFormed(svg)).toBe(true)
  expect(idsAreUnique(svg)).toBe(true)
  expect(heightOf(svg)).toBe(limitsAreaHeight(2, 2))
  expect(heightOf(svg)).toBeLessThanOrEqual(90)
  expect(svg).toContain('Claude 5h / wk')
  expect(svg).toContain('Codex 5h / wk')
  for (const pct of ['31%', '62%', '52%', '97%']) expect(svg).toContain('>' + pct + '<')
  // Colour rules: green, amber over 70, red over 85.
  expect(svg).toContain('#3FB950')
  expect(svg).toContain('#F85149')
  expect(svg).toContain('$62 spent \u00b7 $138 left \u00b7 expires Oct 28')
  expect(svg).toContain('expires Nov 30')
  expect(svg).not.toMatch(/NaN|undefined/)
  expect(svg).not.toContain('class="sweep"')
})

test('limits area: an unreadable window says "not readable here" in amber, and BOTH windows of every plan are always drawn', async () => {
  const input = { pools: [pool('claude', 'Claude', null, null), pool('codex', 'Codex', 40, null)], credits: [], outPools: new Set<string>(), nowMs: LNOW }
  const svg = limitsAreaSvg(520, input)
  expect(count(svg, 'not readable here')).toBe(3)
  expect(svg).toMatch(/fill="#F0A500"[^>]*>not readable here/)
  expect(svg).toContain('>40%<')
  expect(isWellFormed(svg)).toBe(true)
  // The hover text names both windows of every plan.
  const alt = limitsAlt(input)
  expect(alt).toContain('Claude: 5h not readable here  week not readable here')
  expect(alt).toContain('Codex: 5h 40% used')
  expect(alt).toContain('week not readable here')
})

test('limits area: a plan that is out is drawn at 45% opacity (97% is not out); credits are not dimmed on "low"', async () => {
  const base = { pools: [pool('codex', 'Codex', 52, 100), pool('claude', 'Claude', 31, 97)], credits: CREDS, nowMs: LNOW }
  const out = limitsAreaSvg(520, { ...base, outPools: new Set(['codex']) })
  expect(count(out, 'opacity="0.45"')).toBe(1)
  expect(limitsAreaSvg(520, { ...base, outPools: new Set<string>() })).not.toContain('opacity="0.45"')
  expect(limitsAlt({ ...base, outPools: new Set(['codex']) })).toMatch(/Codex: .*\(out, back /)
})

test('limits area at 360, 600 and 900 px: nothing past the edge', async () => {
  const input = { pools: [pool('claude', 'Claude', 31, 62), pool('codex', 'Codex', 52, 97)], credits: CREDS, outPools: new Set<string>(), nowMs: LNOW }
  for (const W of [360, 600, 900]) {
    const svg = limitsAreaSvg(W, input)
    expect(svg).toContain(`viewBox="0 0 ${W} ${limitsAreaHeight(2, 2)}"`)
    for (const m of svg.matchAll(/<rect class="k" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)) expect(Number(m[1]) + Number(m[2])).toBeLessThanOrEqual(W)
  }
})

// ---------------------------------------------------------------------------
// List and wrapped-text cards

test('list card: a title and one row per item, with an optional dot and a coloured note', async () => {
  const rows = [{ dot: '#3FB950', text: 'Web app', right: 'up, 12 ms', rightColor: '#3FB950' }, { dot: '#8B949E', text: 'Queue', right: 'checking' }, { text: 'OpenCode credit unknown' }]
  const svg = listCardSvg(520, 'Health and credits', rows)
  expect(isWellFormed(svg)).toBe(true)
  expect(heightOf(svg)).toBe(listHeight(3))
  expect(svg).toContain('Health and credits')
  expect(svg).toContain('Web app')
  expect(count(svg, '<circle')).toBe(2)
  expect(svg).toContain('>up, 12 ms<')
  expect(listCardSvg(520, 'Queue', [], 'nothing waiting')).toContain('nothing waiting')
  expect(heightOf(listCardSvg(520, 'Queue', []))).toBe(listHeight(0))
  // A long row is cut to fit, not wrapped onto the right-hand note.
  const long = listCardSvg(240, 'Landed', [{ text: 'x'.repeat(200), right: 'gate 0', rightColor: '#3FB950' }])
  expect(long).toContain('\u2026')
  expect(isWellFormed(long)).toBe(true)
})

test('list card: eight rows (the queue and backlog limit) draw clean and escape their text', async () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ text: 'id' + i + ': <b>heading</b> & more ' + i }))
  const svg = listCardSvg(520, 'Queue', rows)
  expect(heightOf(svg)).toBe(listHeight(8))
  expect(svg).not.toContain('<b>')
  expect(svg).toContain('&lt;b&gt;')
  expect(isWellFormed(svg)).toBe(true)
})

test('wrapped card (inbox, away log): pills, wrapped text, an age note, red for a bug and blue for a feature', async () => {
  const entries = [
    { pill: { text: 'bug', color: '#EF4444' }, text: 'the page is blank on phones after the second tap on the settings tab', note: '3m' },
    { pill: { text: 'feature', color: '#2F81F7' }, text: 'dark mode for the shell', note: '1h' },
    { text: 'a plain note with no pill' },
  ]
  const svg = wrapCardSvg(300, 'Inbox', entries)
  expect(isWellFormed(svg)).toBe(true)
  expect(heightOf(svg)).toBe(wrapHeight(300, entries))
  expect(svg).toContain('#EF4444')
  expect(svg).toContain('#2F81F7')
  expect(svg).toContain('>3m<')
  expect(svg).toContain('dark mode for the shell')
  // The long bug wraps: it takes more than one text line.
  expect(wrapHeight(300, [entries[0]!])).toBeGreaterThan(wrapHeight(300, [entries[1]!]))
  expect(wrapCardSvg(300, 'Inbox', [], 'nothing new')).toContain('nothing new')
  expect(svg).not.toMatch(/NaN|undefined/)
})

test('wrapped card: text is escaped and an overlong entry is capped at four lines with an ellipsis', async () => {
  const evil = '<script>x</script> & "q" ' + 'word '.repeat(200)
  const svg = wrapCardSvg(300, 'Inbox', [{ pill: { text: 'bug', color: '#EF4444' }, text: evil }])
  expect(svg).not.toContain('<script')
  expect(svg).toContain('&lt;script&gt;')
  expect(svg).toContain('\u2026')
  expect(isWellFormed(svg)).toBe(true)
  expect(count(svg, '<text class="t"')).toBeLessThanOrEqual(4)
})

// ---------------------------------------------------------------------------
// The "Blocked by" graph

const MEMBERS = new Set(['codex-a', 'codex-b', 'codex-c', 'opencode-1'])
const SPRITES = new Map<string, GraphSprite>([
  ['codex-a', { kind: 'codex', variant: 0, mode: 'work', activity: 'coding' }],
  ['codex-b', { kind: 'codex', variant: 1, mode: 'idle', activity: 'sleeping' }],
  ['codex-c', { kind: 'codex', variant: 2, mode: 'work', activity: 'red' }],
])
const graph = (edges: Edge[], bad: string[] = [], faded: (e: Edge) => boolean = () => false) => buildGraph(edges, { members: MEMBERS, isBad: n => bad.includes(n), isFaded: faded })

test('graph: members as small characters, curved arrows with moving dashes, and a line saying why', async () => {
  const g = graph([{ member: 'codex-c', on: 'codex-b', why: 'needs b20c installer fix on main' }])
  const svg = graphSvg(520, g, SPRITES)
  expect(isWellFormed(svg)).toBe(true)
  expect(idsAreUnique(svg)).toBe(true)
  expect(heightOf(svg)).toBe(graphHeight(g))
  expect(svg).toContain('Blocked by')
  expect(count(svg, 'class="sp c-')).toBe(2)
  // The arrow: a quadratic curve with an arrowhead, dashes that move.
  expect(svg).toMatch(/<path class="ed" d="M[\d. -]+ Q[\d. -]+"/)
  expect(svg).toContain('marker-end="url(#ah-amber)"')
  expect(svg).toContain('@keyframes dsh')
  expect(svg).toContain('stroke-dasharray:5 3')
  expect(svg).toContain('codex-c waits on codex-b: needs b20c installer fix on main')
  expect(svg).not.toContain('deadlock?')
  expect(svg).not.toMatch(/NaN|undefined/)
})

test('graph: a chain is thicker, a stuck or red blocker is red, sam is a person and the gate is a lock', async () => {
  const chain = graphSvg(520, graph([{ member: 'codex-a', on: 'codex-b', why: '' }, { member: 'codex-b', on: 'codex-c', why: '' }]), SPRITES)
  expect(count(chain, 'stroke-width="2.4"')).toBe(2)
  const single = graphSvg(520, graph([{ member: 'codex-a', on: 'codex-b', why: '' }]), SPRITES)
  expect(single).toContain('stroke-width="1.5"')
  expect(single).not.toContain('stroke-width="2.4"')
  // A stuck or red blocker: red arrow and a red ring around it.
  const red = graphSvg(520, graph([{ member: 'codex-a', on: 'codex-c', why: '' }], ['codex-c']), SPRITES)
  expect(red).toContain('marker-end="url(#ah-red)"')
  expect(red).toContain('stroke="#F85149"')
  expect(red).toContain('r="17"')
  const people = graphSvg(520, graph([{ member: 'codex-a', on: 'sam', why: 'needs the code' }, { member: 'codex-b', on: 'gate', why: '' }]), SPRITES)
  expect(people).toContain('>sam<')
  expect(people).toContain('>gate<')
  expect(people).toContain('<path d="M')
  expect(isWellFormed(people)).toBe(true)
})

test('graph: a cycle says "deadlock?" in red; the arrows of a cycle are red', async () => {
  const g = graph([{ member: 'codex-a', on: 'codex-b', why: '' }, { member: 'codex-b', on: 'codex-a', why: '' }])
  const svg = graphSvg(520, g, SPRITES)
  expect(svg).toContain('deadlock?')
  expect(svg).toMatch(/fill="#F85149">deadlock\?/)
  expect(count(svg, 'marker-end="url(#ah-red)"')).toBe(2)
  expect(isWellFormed(svg)).toBe(true)
})

test('graph: a faded edge is dim and still; an unknown member is a text node; an empty graph says nothing is blocked', async () => {
  const faded = graphSvg(520, graph([{ member: 'codex-a', on: 'codex-b', why: 'x' }], [], () => true), SPRITES)
  expect(faded).toContain('opacity="0.22"')
  expect(faded).not.toContain('<path class="ed"')
  expect(faded).not.toContain('codex-a waits on')
  expect(heightOf(faded)).toBe(graphHeight(graph([{ member: 'codex-a', on: 'codex-b', why: 'x' }], [], () => true)))
  const unknown = graphSvg(520, graph([{ member: 'ghost', on: 'the new CI box', why: '' }]), SPRITES)
  expect(unknown).toContain('>ghost<')
  expect(unknown).toContain('>the new CI box<')
  expect(isWellFormed(unknown)).toBe(true)
  const empty = graphSvg(520, graph([]), SPRITES)
  expect(empty).toContain('nothing is blocked')
  expect(heightOf(empty)).toBe(graphHeight(graph([])))
  expect(isWellFormed(empty)).toBe(true)
})

test('graph: many members stay inside the width; text is escaped', async () => {
  const names = Array.from({ length: 12 }, (_, i) => 'codex-' + i)
  const g = buildGraph(
    names.slice(1).map((n, i) => ({ member: n, on: names[i] ?? '', why: '<b>why</b>' })),
    { members: new Set(names), isBad: () => false, isFaded: () => false },
  )
  const svg = graphSvg(300, g, new Map())
  expect(isWellFormed(svg)).toBe(true)
  expect(svg).not.toContain('<b>')
  expect(svg).toContain('&lt;b&gt;')
  expect(svg).not.toMatch(/NaN|undefined/)
  const xs = [...svg.matchAll(/ x="(-?[\d.]+)"/g)].map(m => Number(m[1]))
  expect(xs.every(x => x >= -2 && x <= 302)).toBe(true)
  // At most eight "waits on" lines.
  expect(count(svg, ' waits on ')).toBeLessThanOrEqual(8)
})

// ---------------------------------------------------------------------------
// By item

import { ITEM_STATUS_COLOR, ITEM_STATUS_LABEL, itemRowHeight, itemRowSvg, systemCardSvg, systemHeight } from '../hooks/cards.ts'
import type { ItemRowIn } from '../hooks/cards.ts'
import { gaugesOf, topLine } from '../hooks/system.ts'

const ITEM: ItemRowIn = {
  index: 1,
  title: 'Home Settings',
  id: 'b21c',
  status: 'working',
  assignees: [{ name: 'codex-c', kind: 'codex', variant: 2, mode: 'work', activity: 'coding', pill: 'coding' }],
  blockedBy: null,
  since: '12m',
  gate: '',
  ratio: 0.5,
}

test('item row: one svg with the number, title, dim id, status pill, assignee with its activity, time and bar', async () => {
  const svg = itemRowSvg(520, ITEM)
  expect(isWellFormed(svg)).toBe(true)
  expect(idsAreUnique(svg)).toBe(true)
  expect(count(svg, '<svg ')).toBe(1)
  expect(widthOf(svg)).toBe(520)
  expect(heightOf(svg)).toBe(itemRowHeight(ITEM))
  expect(svg).toContain('Home Settings')
  expect(svg).toMatch(/<text class="m"[^>]*>b21c<\/text>/)
  expect(svg).toMatch(/<text class="m"[^>]*font-weight="600">1<\/text>/)
  expect(svg).toContain('>in progress<')
  expect(svg).toContain('#58A6FF')
  expect(svg).toContain('codex-c \u00b7 coding')
  expect(count(svg, 'class="sp c-codex a-coding"')).toBe(1)
  expect(svg).toContain('for 12m')
  expect(svg).not.toMatch(/NaN|undefined/)
})

test('item row: every status has its own pill text and colour; landed is green, done-not-landed says so', async () => {
  const statuses = Object.keys(ITEM_STATUS_LABEL) as (keyof typeof ITEM_STATUS_LABEL)[]
  expect(statuses.length).toBe(9)
  // Blocked and a stale lock are both amber (a thing that waits); every other status has its own colour.
  expect(new Set(statuses.map(s => ITEM_STATUS_COLOR[s])).size).toBe(8)
  expect(ITEM_STATUS_COLOR['stale-lock']).toBe(ITEM_STATUS_COLOR.blocked)
  // Red means failed and nothing else: queued is muted grey, never red.
  expect(ITEM_STATUS_LABEL.red).toBe('gate failed')
  expect(ITEM_STATUS_COLOR.queued).toBe('#8B949E')
  expect(ITEM_STATUS_LABEL['stale-lock']).toBe('stale lock')
  for (const s of statuses) if (s !== 'red') expect(ITEM_STATUS_COLOR[s]).not.toBe(ITEM_STATUS_COLOR.red)
  for (const status of statuses) {
    const svg = itemRowSvg(520, { ...ITEM, status })
    expect(svg).toContain('>' + ITEM_STATUS_LABEL[status] + '<')
    expect(svg).toContain(ITEM_STATUS_COLOR[status])
    expect(isWellFormed(svg)).toBe(true)
  }
  expect(ITEM_STATUS_LABEL['done-not-landed']).toBe('done, not landed')
  expect(ITEM_STATUS_COLOR.landed).toBe('#3FB950')
})

test('item row: queued says "unassigned"; several members share the row; more than three say how many more', async () => {
  const queued = itemRowSvg(520, { ...ITEM, status: 'queued', assignees: [], since: '3m' })
  expect(queued).toContain('unassigned')
  expect(count(queued, 'class="sp c-')).toBe(0)
  const mk = (name: string) => ({ name, kind: 'codex', variant: 0, mode: 'work' as const, activity: 'testing' as const, pill: 'testing' })
  const two = itemRowSvg(520, { ...ITEM, assignees: [mk('codex-a'), mk('codex-b')] })
  expect(count(two, 'class="sp c-')).toBe(2)
  expect(two).toContain('codex-a \u00b7 testing')
  expect(two).toContain('codex-b \u00b7 testing')
  const five = itemRowSvg(520, { ...ITEM, assignees: ['a', 'b', 'c', 'd', 'e'].map(x => mk('codex-' + x)) })
  expect(count(five, 'class="sp c-')).toBe(3)
  expect(five).toContain('>+2<')
  // A sleeping member sleeps in the item row too.
  expect(itemRowSvg(520, { ...ITEM, assignees: [{ ...mk('codex-a'), mode: 'idle' as const, activity: 'sleeping' as const, pill: 'sleeping' }] })).toContain('class="sp c-codex sleep"')
})

test('item row: a blocked item shows the amber chip, the why, how long and the gate result', async () => {
  const row = { ...ITEM, status: 'blocked' as const, blockedBy: { on: 'codex-b', why: 'needs b20c installer fix on main' }, gate: 'gate exit 1 (full)' }
  const svg = itemRowSvg(560, row)
  expect(svg).toContain('blocked by codex-b')
  expect(svg).toContain('#F0A500')
  expect(svg).toContain('needs b20c installer fix on main')
  expect(svg).toContain('for 12m')
  expect(svg).toContain('gate exit 1 (full)')
  expect(itemRowHeight(row)).toBe(92)
  // No chip, no time, no gate: a shorter row.
  expect(itemRowHeight({ ...ITEM, since: '', gate: '' })).toBe(72)
  expect(heightOf(itemRowSvg(520, { ...ITEM, since: '', gate: '' }))).toBe(72)
  expect(isWellFormed(svg)).toBe(true)
})

test('item row: the thin bar follows the ratio, clamped; no NaN', async () => {
  const w = (ratio: number) => itemRowSvg(520, { ...ITEM, ratio })
  const fill = (svg: string) => Number(/<rect x="10" y="[\d.]+" width="([\d.]+)" height="4" rx="2" fill="#58A6FF"\/>/.exec(svg)?.[1] ?? Number.NaN)
  expect(fill(w(0.5))).toBe(250)
  expect(fill(w(1))).toBe(500)
  expect(fill(w(7))).toBe(500)
  expect(fill(w(-2))).toBe(0)
  expect(fill(w(Number.NaN))).toBe(0)
  expect(w(Number.NaN)).not.toMatch(/NaN/)
})

test('item row: long titles and ids are cut; text is escaped; a narrow pane still draws', async () => {
  const evil = '<script>x()</script> & "q"'
  const svg = itemRowSvg(240, { ...ITEM, title: evil + ' '.repeat(3) + 'x'.repeat(80), id: evil, blockedBy: { on: evil, why: evil }, gate: evil, assignees: [{ name: evil, kind: 'codex', variant: 0, mode: 'work', activity: 'coding', pill: evil }] })
  expect(svg).not.toContain('<script')
  expect(svg).toContain('&lt;script&gt;')
  expect(svg).toContain('\u2026')
  expect(isWellFormed(svg)).toBe(true)
  expect(widthOf(svg)).toBe(240)
})

// ---------------------------------------------------------------------------
// System resources

test('system card: gauges as disk-style bars in their level colours, the top processes by name, and the gate hint', async () => {
  const gauges = gaugesOf({ memFree: 6, swapMB: 7424, load1: 12, cores: 10, diskFree: 40.5, top: [] }, [{ name: 'host-a', answered: true, mem: { totalMB: 31890, availMB: 19000, freePct: 59.6, swapUsedMB: 0 }, gpu: { usedMB: 5120, totalMB: 24576, util: 37 } }])
  const c = { gauges, top: topLine([{ name: 'Claude', mb: 1229 }, { name: 'node', mb: 403 }]), hint: 'gate blocked by memory?' }
  const svg = systemCardSvg(520, c)
  expect(isWellFormed(svg)).toBe(true)
  expect(idsAreUnique(svg)).toBe(true)
  expect(heightOf(svg)).toBe(systemHeight(c))
  // The section header carries the title; the card is the gauges.
  expect(svg).not.toContain('System resources')
  expect(svg).toContain('Memory 94% used')
  // Solid thin bars, no dotted texture.
  expect(svg).not.toContain('class="tw')
  expect(svg).toContain('height="6" rx="3"')
  expect(svg).toContain('#F85149')
  expect(svg).toContain('#F0A500')
  expect(svg).toContain('#3FB950')
  expect(svg).toContain('swap 7.3 GB')
  expect(svg).toContain('host-a GPU memory 21% used')
  expect(svg).toContain('Top memory: Claude 1.2 GB, node 403 MB')
  expect(svg).toContain('gate blocked by memory?')
  expect(svg).not.toMatch(/NaN|undefined/)
  // No hint: a shorter card; a grey host line when ssh did not answer.
  expect(systemHeight({ ...c, hint: '' })).toBe(systemHeight(c) - 22)
  const grey = systemCardSvg(520, { gauges: gaugesOf({ memFree: 41, swapMB: 0, load1: 1, cores: 8, diskFree: 50, top: [] }, [{ name: 'host-a', answered: false, mem: null, gpu: null }]), top: topLine([]), hint: '' })
  expect(grey).toContain('ssh did not answer')
  // An unknown gauge is an empty track, never a made-up fill.
  expect(grey).not.toMatch(/fill="#8B949E"/)
  expect(grey).toContain('Top memory: unknown')
  expect(isWellFormed(grey)).toBe(true)
})

import { tilesSvg as tilesSvgFull } from '../hooks/frontpage.ts'
test('the Done tile is shaded green and pulses only when nothing is left, running or waiting', () => {
  const mk = (todo: number, running: number, you: number, done: number) => tilesSvgFull(400, [
    { n: running, label: 'Running', cls: 'runc', key: 'running' }, { n: you, label: 'Needs you', cls: 'warnc', key: 'you' },
    { n: todo, label: 'To go', cls: 't', key: 'todo' }, { n: done, label: 'Done', cls: 'okc', key: 'done' },
  ], true, null).svg
  expect(mk(0, 0, 0, 5)).toContain('dpulse')
  expect(mk(1, 0, 0, 4)).not.toContain('dpulse')
  expect(mk(0, 1, 0, 4)).not.toContain('dpulse')
  expect(mk(0, 0, 0, 0)).not.toContain('dpulse')
})
