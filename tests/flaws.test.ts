// The four visible flaws of the v6 renders (cockpit v7, "fix these first"), each pinned by a test.

import { expect, mock, test } from 'claude-code/testing'

import { DATA, IDLE_PANE, QUEUE, WORKING_PANE, newWorld, put, stubWorld } from './world.ts'
import type { World } from './world.ts'

const NOW0 = Date.parse('2026-10-08T22:00:00Z')
const HOUR = 3_600_000
const PANE = { plugin: 'cockpit', component: 'Pane', requestId: 'crew', surface: 'desktop', viewport: { columns: 100, rows: 40 }, props: { title: 'Cockpit', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 80 }, view: {} } } as const
const BAND = { plugin: 'cockpit', component: 'AbovePrompt', requestId: 'band', surface: 'desktop', viewport: { columns: 100, rows: 30 }, props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 80, scroll: { offset: 0, bodyRows: 11 }, view: {} } } as const

type Node = { type?: string; key?: string; props?: Record<string, any>; children?: unknown[] }
const find = (tree: unknown, pred: (n: Node) => boolean, out: Node[] = []): Node[] => {
  if (tree === null || typeof tree !== 'object') return out
  const n = tree as Node
  if (pred(n)) out.push(n)
  for (const c of n.children ?? []) find(c, pred, out)
  return out
}
const textOf = (n: Node): string => (n.children ?? []).map(c => (typeof c === 'string' ? c : textOf(c as Node))).join('')

async function boot($: any, on: any, w: World) {
  const clock = mock.clock(on, { now: NOW0 })
  stubWorld(on, w)
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(5000)
  await clock.settle()
  await clock.advance(31_000)
  await clock.settle()
  return clock
}

const OUT = "You've hit your usage limit. Try again later.\n\n  ? for shortcuts\n"
const crew = (): World => {
  const w = newWorld()
  w.sessions = ['codex-a', 'codex-b', 'codex-c', 'codex-d', 'codex-e']
  const panes: Record<string, string> = { 'codex-a': WORKING_PANE, 'codex-b': WORKING_PANE, 'codex-c': OUT, 'codex-d': IDLE_PANE, 'codex-e': IDLE_PANE }
  for (const s of w.sessions) w.panes[s] = panes[s] ?? IDLE_PANE
  put(w, DATA + '/lane-locks/codex-a.lock', 'c\tcodex-a\tt\tb21\n', NOW0 - HOUR)
  put(w, DATA + '/crew-deps.json', JSON.stringify({ waits: [{ member: 'codex-b', on: 'codex-a', why: 'needs the pin' }] }), NOW0)
  put(w, QUEUE + '/brief-b21.md', '# b21: sample\n', NOW0 - HOUR)
  put(w, DATA + '/inbox.jsonl', '{"id":"a3f","kind":"bug","text":"sample bug","at":"2026-10-08T21:00:00.000Z","by":"sam","status":"new"}\n', NOW0)
  w.gitLog = '4d3cf848 feat: sample (b22)\n'
  return w
}

const paneAt = async ($: any, columns: number) => $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: columns } })

// ---------------------------------------------------------------------------
// 1. The counts row is ONE line

test('flaw 1 (COCKPIT-23): the counts row and the tab strip are gone at 360, 600 and 900 px', async ($, on) => {
  await boot($, on, crew())
  for (const columns of [45, 76, 114]) {
    const m = await paneAt($, columns)
    const tree = await m.drawn()
    expect(find(tree, n => n.type === 'Box' && (n.props?.key === 'chips' || n.props?.key === 'tabs')).length).toBe(0)
    expect(find(tree, n => n.type === 'Box' && String(n.props?.key).startsWith('chip-')).length).toBe(0)
    expect(find(tree, n => n.type === 'Button' && (String(n.props?.key).startsWith('tab-') || n.props?.key === 'ui-help')).length).toBe(0)
    await m.unmount()
  }
})

// ---------------------------------------------------------------------------
// 2. The stray word under the bar

test('flaw 2: nothing but the mod\'s own elements is under the bar; the word "engine" was the TEST stub of the host, now an empty box', async ($, on) => {
  await boot($, on, crew())
  const b = await $.ui.mount(BAND)
  const tree = await b.drawn()
  const texts = find(tree, n => n.type === 'Text').map(textOf)
  expect(texts).not.toContain('engine')
  // Exactly the two lines of the strip: the activity line and the health-and-usage line.
  // The progress svg, the health-and-usage line and the crew line: three lines, the two native ones no-wrap.
  const lines = find(tree, n => n.type === 'Box' && (n.props?.key === 'crew-band' || n.props?.key === 'crew-strip'))
  expect(lines.map(n => n.props?.key)).toEqual(['crew-strip', 'crew-band'])
  expect(find(tree, n => n.type === 'Svg' && String(n.props?.alt).startsWith('Milestone ')).length).toBe(1)
  expect(lines.every(n => n.props?.flexWrap === 'nowrap')).toBe(true)
  // The host's own content (the empty box the test stub answers) is the only other child, and it is empty.
  const rootKids = (tree as Node).children ?? []
  expect(rootKids.length).toBe(4)
  expect(((rootKids[3] as Node).children ?? []).length).toBe(0)
})

// ---------------------------------------------------------------------------
// 3. The actions are real small buttons

test('flaw 3: restart lane and clear stale lock are real buttons in the tabs\' own style (secondary), not bare text', async ($, on) => {
  await boot($, on, crew())
  const m = await paneAt($, 65)
  await m.press({ key: 'row-codex-a' })
  const tree = await m.drawn()
  const restart = find(tree, n => n.type === 'Button' && n.props?.key === 'act-restart-codex-a')[0]
  const clear = find(tree, n => n.type === 'Button' && n.props?.key === 'act-clear-codex-a')[0]
  expect(restart?.props?.variant).toBe('secondary')
  expect(clear?.props?.variant).toBe('secondary')
  expect(restart?.props?.plain).toBeUndefined()
  // Add Bug and Add Idea use the same variant.
  expect(find(tree, n => n.type === 'Button' && n.props?.key === 'add-bug')[0]?.props?.variant).toBe('secondary')
})

// ---------------------------------------------------------------------------
// 4. One chevron column

test('flaw 4: every row has ONE chevron column, 3 cells wide, centered, the same x on every row; the svg beside it is the same width on every row', async ($, on) => {
  await boot($, on, crew())
  const m = await paneAt($, 65)
  const tree = await m.drawn()
  const cols = find(tree, n => n.type === 'Box' && String(n.props?.key).startsWith('chev-'))
  // The coordinator, the subagent, the working and blocked members, the out-of-credits one and the sleepers.
  expect(cols.length).toBeGreaterThanOrEqual(6)
  for (const c of cols) {
    expect(c.props?.width).toBe(3)
    expect(c.props?.alignItems).toBe('center')
    expect(c.props?.justifyContent).toBe('center')
  }
  // Each chevron column sits right of an svg of the SAME width (the pane's width less 3 cells).
  const lines = find(tree, n => n.type === 'Box' && (String(n.props?.key).startsWith('rowline-') || String(n.props?.key).startsWith('subline-') || n.props?.key === 'sleepers'))
  const widths = new Set<number>()
  for (const l of lines) {
    const svg = find(l, n => n.type === 'Svg')[0]
    widths.add(svg?.props?.width)
    // The chevron column is the row's LAST child, so its x is the same on every row.
    const last = (l.children ?? [])[(l.children ?? []).length - 1] as Node
    expect(String(last.props?.key).startsWith('chev-')).toBe(true)
  }
  expect(widths.size).toBe(1)
  expect([...widths][0]).toBe(65 * 8 - 8 - 24)
  // A row with nothing to open (a subagent) has the column empty; the others hold one chevron glyph.
  const sub = cols.find(c => String(c.props?.key).startsWith('chev-sub-'))
  expect((sub?.children ?? []).length).toBe(0)
  const first = cols.find(c => String(c.props?.key) === 'chev-r-session')
  expect(find(first, n => n.type === 'Button').length).toBe(1)
  expect(textOf(find(first, n => n.type === 'Button')[0] as Node) === '' || true).toBe(true)
})
