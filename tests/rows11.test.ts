// Cockpit v11: the look of a crew row. Active rows are green, a row says what it is doing and which item it owns, and a row
// that is not asleep sits on a faint tone with a bar at its left edge. Pure drawings; run with
// `bun test tests/rows11.test.ts` or the host's runner.

import { ACTIVE_GREEN, ACTIVITY_COLOR, WAIT_AMBER, rowToneOf } from '../hooks/crew.ts'
import { DOING_LINES, DOING_WIDTH, memberDetail } from '../hooks/details.ts'
import type { MemberCardIn } from '../hooks/details.ts'
import { chipWordOf, itemLineOf } from '../hooks/doing.ts'
import { MEMBER_ROW, TONE_BAR_W, TONE_OPACITY, rowSvg, toneClassOf } from '../hooks/look.ts'
import type { LookRow } from '../hooks/look.ts'
import { ACTIVITIES } from '../hooks/sprites.ts'
import { themeCss } from '../hooks/tokens.ts'
import { isWellFormed } from './helpers.ts'
import { expect, test } from './pure.ts'

const ROW: LookRow = {
  kind: 'codex',
  variant: 0,
  mode: 'work',
  activity: 'coding',
  title: 'codex-a',
  state: { text: 'coding', color: ACTIVITY_COLOR.coding },
  item: 'FEAT-11 \u00b7 editing look.ts',
  tag: 'GPT-6 low',
  since: '4m',
  trouble: null,
  isOut: false,
  indent: 0,
  isOpen: false,
  detail: [],
  bars: [],
  burst: '',
  landed: '',
  phase: 0,
}

test('colours: every active word is the one green, waiting is amber, a failure red, sleeping grey', () => {
  const active = ACTIVITIES.filter(a => !['sleeping', 'asking', 'stuck', 'red', 'errored', 'cheering'].includes(a))
  expect(active.length).toBeGreaterThan(5)
  for (const a of active) expect(ACTIVITY_COLOR[a]).toBe(ACTIVE_GREEN)
  expect(ACTIVITY_COLOR.working).toBe(ACTIVE_GREEN)
  expect(ACTIVITY_COLOR.asking).toBe(WAIT_AMBER)
  expect(ACTIVITY_COLOR.stuck).toBe(WAIT_AMBER)
  expect(ACTIVITY_COLOR.sleeping).toBe('#8B949E')
  // The chip of a working row is drawn in that green (not the old slate grey).
  const svg = rowSvg(520, { ...ROW, activity: 'working', state: { text: 'editing', color: ACTIVITY_COLOR.working } })
  expect(svg).not.toContain('#64748B')
  expect(svg).toContain('>editing<')
})

test('tone: active green, blocked or waiting or stuck amber, failed red, sleeping and out of credits none; red beats amber', () => {
  const t = (o: Partial<Parameters<typeof rowToneOf>[0]>) => rowToneOf({ activity: 'coding', errored: false, blocked: false, stuck: false, exhausted: false, ...o })
  expect(t({})).toBe('green')
  expect(t({ activity: 'working' })).toBe('green')
  expect(t({ activity: 'testing' })).toBe('green')
  expect(t({ activity: 'sleeping' })).toBe('')
  expect(t({ activity: 'asking' })).toBe('amber')
  expect(t({ blocked: true })).toBe('amber')
  expect(t({ stuck: true })).toBe('amber')
  expect(t({ activity: 'red' })).toBe('red')
  expect(t({ errored: true, blocked: true })).toBe('red')
  expect(t({ activity: 'sleeping', blocked: true })).toBe('amber')
  expect(t({ exhausted: true })).toBe('')
  expect(t({ activity: 'sleeping', errored: true })).toBe('red')
})

test('a row that is not asleep has a tinted background and a left accent bar in its tone; a plain row has neither', () => {
  for (const [tone, cls] of [['green', 'okc'], ['amber', 'warnc'], ['red', 'errc']] as const) {
    const svg = rowSvg(520, { ...ROW, tone })
    expect(isWellFormed(svg)).toBe(true)
    expect(toneClassOf(tone)).toBe(cls)
    // The tint: the whole row at a low opacity; the bar: a narrow rect at x=0, inside the row's height.
    expect(svg).toContain(`<rect class="${cls}" x="0" y="0" width="520" height="${MEMBER_ROW}" rx="`)
    expect(svg).toContain(`opacity="${TONE_OPACITY}"`)
    expect(svg).toContain(`<rect class="${cls}" x="0" y="6" width="${TONE_BAR_W}" height="${MEMBER_ROW - 12}"`)
  }
  for (const plain of [{ ...ROW }, { ...ROW, tone: '' as const }]) {
    const svg = rowSvg(520, plain)
    expect(svg).not.toContain(`opacity="${TONE_OPACITY}"`)
    expect(svg).not.toMatch(/<rect class="(?:okc|warnc|errc)" x="0" y="6"/)
  }
  expect(TONE_OPACITY).toBeLessThanOrEqual(0.15)
  // The row keeps its height, and an open row's tint covers its card.
  expect(rowSvg(520, { ...ROW, tone: 'green' })).toContain(`height="${MEMBER_ROW}"`)
  const open = rowSvg(520, { ...ROW, tone: 'green', isOpen: true, detail: [{ label: 'Doing', text: 'editing look.ts' }] })
  expect(open).toMatch(/<rect class="okc" x="0" y="0" width="520" height="(?!52")\d+/)
})

test('light and dark: the tint and the bar use the theme classes, so each theme gets its own green, amber and red', () => {
  const dark = themeCss('dark')
  const light = themeCss('light')
  for (const cls of ['okc', 'warnc', 'errc']) {
    expect(dark).toContain('.' + cls + '{fill:')
    expect(light).toContain('.' + cls + '{fill:')
  }
  expect(dark.match(/\.okc\{fill:([^}]+)\}/)?.[1]).not.toBe(light.match(/\.okc\{fill:([^}]+)\}/)?.[1])
  // The row svg carries no fixed hex for them (a fixed colour would ignore the theme).
  const svg = rowSvg(520, { ...ROW, tone: 'green' })
  expect(svg).not.toMatch(/<rect class="okc"[^>]*fill=/)
})

test('"working" says what it is doing: the chip takes the verb, line 2 the item and the phrase; other words stay', () => {
  const doing = { verb: 'editing', phrase: 'editing core.ts', full: '\u2022 Edited hooks/core.ts (+4 -1)' }
  expect(chipWordOf('working', doing)).toBe('editing')
  expect(chipWordOf('working', null)).toBe('working')
  expect(chipWordOf('working', { verb: '', phrase: 'The gate is red.', full: '' })).toBe('working')
  expect(chipWordOf('testing', doing)).toBe('testing')
  expect(chipWordOf('working', { verb: 'running a really long command name', phrase: '', full: '' }).length).toBe(18)
  expect(itemLineOf('SYNC-LINK-01', doing, false)).toBe('SYNC-LINK-01 \u00b7 editing core.ts')
  expect(itemLineOf('', doing, false)).toBe('editing core.ts')
  expect(itemLineOf('SYNC-LINK-01', null, false)).toBe('SYNC-LINK-01')
  expect(itemLineOf('FEAT-10', { verb: 'running tests', phrase: 'running tests', full: '' }, false)).toBe('FEAT-10 \u00b7 running tests')
  expect(itemLineOf('check.sh', { verb: 'running the gate', phrase: 'running the gate', full: '' }, false)).toBe('check.sh \u00b7 running the gate')
  // A sleeper shows its live item only, never a doing line from old pane text; nothing known is the empty string.
  expect(itemLineOf('b50', doing, true)).toBe('b50')
  expect(itemLineOf('', doing, true)).toBe('')
  expect(itemLineOf('', null, false)).toBe('')
})

const CARD: MemberCardIn = {
  name: 'codex-a',
  kind: 'codex',
  activity: 'working',
  powered: 'Codex',
  target: '',
  item: 'FEAT-11',
  description: 'crew rows',
  lastReport: '',
  since: '4m',
  lockOwner: '',
  lockAge: '',
  context: '',
  limits: '',
  blockedBy: [],
  errored: false,
  errorReason: '',
  out: false,
  back: '',
  isStale: false,
  isStuck: false,
}

test('the open row shows the full text of what it is doing, wrapped, under "Doing"; closed or empty it shows nothing', () => {
  const full = '\u2022 Ran rtk bun test tests/laneitem.test.ts tests/rows11.test.ts tests/statuscard.test.ts tests/statuslive.test.ts && echo done with all of the pure tests'
  const rows = memberDetail({ ...CARD, doing: full })
  const doing = rows.filter((_, i) => i < DOING_LINES + 1).filter(r => r.label === 'Doing' || r.label === '')
  expect(rows[0]?.label).toBe('Doing')
  expect(doing.length).toBeGreaterThan(1)
  for (const r of doing) expect(r.text.length).toBeLessThanOrEqual(DOING_WIDTH)
  expect(rows[0]?.text.startsWith('\u2022 Ran rtk bun test')).toBe(true)
  expect(rows.some(r => r.label === 'Item' && r.text === 'FEAT-11')).toBe(true)
  expect(memberDetail({ ...CARD }).some(r => r.label === 'Doing')).toBe(false)
  expect(memberDetail({ ...CARD, doing: '   ' }).some(r => r.label === 'Doing')).toBe(false)
})
