// COCKPIT-45 (with the COCKPIT-46 additions): one declared state list, one count definition, plain names, the colored System summary, the row 1 count.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from './pure.ts'
import { STATES, STATE_LABELS, stateDef, stateText, stateOfTool, stateOfAgent, stateOfActivity, activityCounts, breakdownText, countLine } from '../hooks/activity.ts'
import type { StateId } from '../hooks/activity.ts'
import { ACTIVITIES } from '../hooks/sprites.ts'
import { graphOf, paneSvgTree, servicesNow } from '../hooks/register.tsx'
import { PANE_SECTIONS, parseSections, legacySections, isSectionOpen, withSection } from '../hooks/panesections.ts'
import { secHeadSvg } from '../hooks/sections.ts'
import { subSvg } from '../hooks/sections.ts'
import { bandPx, creditsSvg, progressSvg, landedRows, statusSvg, statusHeight, LANDED_CAP } from '../hooks/look.ts'
import type { LookStatus } from '../hooks/look.ts'
import { headPlan } from '../hooks/headrow.ts'
import { systemFigureParts, emptyReading, LEVEL_TONE } from '../hooks/system.ts'
import { textWidth } from '../hooks/draw.ts'

const texts = (svg: string): string[] => [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map(m => (m[1] ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&'))
const walk = (n: any, out: any[] = []): any[] => { if (n && typeof n === 'object') { out.push(n); if (Array.isArray(n.children)) for (const c of n.children) walk(c, out) } return out }
const el = (type: string) => (p: any) => ({ type, props: p, children: p.children ?? [] })
const kit: any = { Box: el('Box'), Text: el('Text'), Button: el('Button'), Svg: el('Svg'), Input: el('Input') }
const $: any = { ui: { invalidate: () => undefined, toast: () => undefined }, fs: { write: async () => undefined } }

test('tool calls map to the declared states', () => {
  const cases: [string, string, StateId][] = [
    ['Read', '', 'reading'], ['Edit', '', 'editing'], ['Write', '', 'editing'], ['Grep', '', 'searching'], ['Glob', '', 'searching'],
    ['WebFetch', '', 'browsing'], ['mcp__claude-in-chrome__navigate', '', 'browsing'], ['TodoWrite', '', 'planning'], ['AskUserQuestion', '', 'needs-you'],
    ['Bash', 'bun test tests/x.test.ts', 'testing'], ['Bash', 'bash scripts/check.sh', 'testing'], ['Bash', 'rg foo src', 'searching'], ['Bash', 'ls -la', 'reading'], ['Bash', 'make all', 'active'],
    ['Skill', 'code-review', 'reviewing'], ['Mystery', '', 'active'], ['', '', 'active'],
  ]
  for (const [tool, text, want] of cases) expect(stateOfTool(tool, text)).toBe(want)
  expect(stateOfAgent(undefined)).toBe('active')
  expect(stateOfAgent([{ tool: 'Read', text: '' }, { tool: 'Edit', text: '' }])).toBe('editing')
})

test('every detector activity maps to a listed state; Blocked carries its reason; Done carries its age', () => {
  for (const a of [...ACTIVITIES, 'absent'] as const) for (const blocked of [false, true]) {
    const r = stateOfActivity(a, { blocked })
    expect(STATE_LABELS).toContain(stateDef(r.id).label)
  }
  expect(stateOfActivity('red')).toEqual({ id: 'blocked', reason: 'gate failed' })
  expect(stateOfActivity('asking')).toEqual({ id: 'needs-you', reason: '' })
  expect(stateOfActivity('sleeping')).toEqual({ id: 'idle', reason: '' })
  expect(stateText('blocked', { reason: 'gate failed' })).toBe('Blocked: gate failed')
  expect(stateText('done', { agoMin: 12.4 })).toBe('Done (12 min ago)')
  expect(stateText('done')).toBe('Done')
  expect(STATES.map(s => s.label)).toEqual(['Editing', 'Running tests', 'Reading', 'Searching', 'Browsing', 'Reviewing', 'Planning', 'Active', 'Needs you', 'Blocked', 'Done', 'Idle'])
  expect(STATES.some(s => /working/i.test(s.label + s.phrase))).toBe(false)
})

test('the count definition: sessions = this one plus awake lanes; agents = running subagents; breakdown omits zeros', () => {
  const c = activityCounts({ lanesAwake: 0, agents: ['editing', 'editing', 'testing', 'needs-you', 'reading'] })
  expect(c.sessions).toBe(1)
  expect(c.agents).toBe(5)
  expect(countLine(c)).toBe('1 session, 5 agents (2 editing, 1 running tests, 1 reading, 1 needs you)')
  expect(countLine(c, false)).toBe('1 session, 5 agents')
  expect(countLine(activityCounts({ lanesAwake: 2, agents: ['idle'] }))).toBe('3 sessions, 1 agent (1 idle)')
  expect(countLine(activityCounts({ lanesAwake: 0, agents: [] }))).toBe('1 session, 0 agents')
  expect(breakdownText({})).toBe('')
})

test('single definition: every renderer reads currentCounts(); no second count of the roster', () => {
  const src = readFileSync(resolve(import.meta.dir, '../hooks/register.tsx'), 'utf8')
  expect(src.match(/activityCounts\(/g)?.length).toBe(1)
  expect(src).toContain('countLine(currentCounts()')
})

test('no "crew", "captain" or "working" in any drawn pane text, open or closed, at pane widths 360, 420 and 520', () => {
  for (const px of [360, 420, 520]) for (const open of [true, false]) {
    const t = paneSvgTree($, kit, Math.ceil((px + 8) / 8), undefined, 1_000_000, graphOf())
    const all = walk(t).flatMap(n => (typeof n.props?.source === 'string' ? texts(n.props.source) : [])).concat(walk(t).flatMap(n => (typeof n.props?.label === 'string' ? [n.props.label] : [])))
    expect(all.length).toBeGreaterThan(0)
    for (const s of all) expect(/\b(crew|captain|working)\b/i.test(s)).toBe(false)
    void open
  }
})

test('no "crew", "captain" or "working" in the bar at 80, 140 and 200 columns', () => {
  const rows = servicesNow(Date.parse('2026-10-09T15:00:00Z'))
  for (const cols of [80, 140, 200]) {
    const W = bandPx(cols)
    const svg = progressSvg(W, { title: 'Remote Stack pairing', ratio: 0.5, count: '1/7', now: '', isWorking: true, grewFrom: null }) + creditsSvg(W, rows)
    for (const s of texts(svg)) expect(/\b(crew|captain|working)\b/i.test(s)).toBe(false)
  }
})

test('row 1: the done count sits right beside the bar and survives the narrowest width; the right group drops icons before AUTOPILOT and never the pane button', () => {
  for (const cols of [200, 140, 100, 70, 50]) {
    const W = bandPx(cols)
    const pl = headPlan({ px: W, iconCount: 4, youN: 2, problemLabel: '! 1', hasProblems: true })
    const svg = progressSvg(pl.leftPx, { title: 'A long milestone description that cannot fit at all', ratio: 0.3, count: '1/7', now: '', isWorking: false, grewFrom: null })
    expect(/<text[^>]*>1\/7<\/text>/.test(svg)).toBe(true)
    expect(pl.rightPx).toBeGreaterThan(0)
    if (pl.showAutopilot === false) expect(pl.showIcons).toBe(false)
  }
})

test('System header, collapsed: plain text "CPU n% · MEM n% · DISK n% · GPU n%", each part colored by its level; expanded keeps no icons', () => {
  const parts = systemFigureParts({ ...emptyReading, memFree: 12, cores: 10, diskFree: 52, load1: 1 } as never, [])
  expect(parts.length).toBeGreaterThan(1)
  const svg = secHeadSvg(420, { title: 'System', summary: parts.map(p => p.text).join(' · '), isOpen: false, parts: parts.map(p => ({ text: p.text, tone: LEVEL_TONE[p.level] })) })
  const t = texts(svg).join(' ')
  for (const p of parts) expect(t).toContain(p.text)
  expect(t).toMatch(/CPU \d+%/)
  expect(svg).toContain('okc')
  expect(svg).toMatch(/warnc|errc/) // memory at 12% free is not green
  expect(svg).not.toContain('<path')
})

const BASE: LookStatus = { title: 'Main status', ratio: 0.5, count: '1/2', note: '', now: '', next: '', you: '', youHex: '#F0A500', isAway: false, presenceText: 'Active', stale: '', phase: 0, main: { running: 'r', landed: 'a; b; c', report: '', notes: '' } }
const ITEMS = ['COCKPIT-44 row one and the footer', 'COCKPIT-43 icons on the bar', 'COCKPIT-42 right aligned codex', 'STACK-1 x', 'STACK-2 y', 'STACK-3 z', 'STACK-4 w']

test('Main status: LANDED is one line per item when expanded (capped, with its own "N more"), one line when collapsed', () => {
  const closed: LookStatus = { ...BASE, landedItems: ITEMS }
  const open: LookStatus = { ...BASE, landedItems: ITEMS, open: { landed: true } }
  for (const W of [360, 420, 520]) {
    expect(landedRows(W, closed)).toBeNull()
    const rows = landedRows(W, open)!
    expect(rows.length).toBeGreaterThanOrEqual(LANDED_CAP + 1)
    expect(rows.at(-1)).toBe(ITEMS.length - LANDED_CAP + ' more')
    expect(statusHeight(W, open)).toBeGreaterThan(statusHeight(W, closed))
    const t = texts(statusSvg(W, open)).join('|')
    expect(t).toContain('COCKPIT-44')
    expect(t).toContain('2 more')
    expect(t).not.toContain('STACK-3')
  }
  expect(landedRows(420, { ...open, landedItems: ['only one'] })).toBeNull()
})
