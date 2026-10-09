// Cockpit 0.4.0, the Deck's drawing and its surface modules, with a fake kit and a fake surface. Plain `bun test`.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { MINI_ROWS, PANELS, parseDeckConfig, visiblePanels } from '../hooks/deckconfig.ts'
import { fmtTimer } from '../hooks/deckfmt.ts'
import { deckOnAgentStep, deckOnCheck, deckOnCompact, deckOnLanes, deckOnMainComplete, deckOnMainStep, deckOnMeasure, deckOnSpawn, deckOnToolCall, deckOnTurnStart, deckOnAgentComplete, emptyDeck, lanesWorking, panelFactsOf } from '../hooks/deckstate.ts'
import type { Deck } from '../hooks/deckstate.ts'
import { drawDeck } from '../hooks/deckview.ts'
import { winOf } from '../hooks/limits.ts'
import { PACKET_GAP, flowOf, packetCells, stillRail } from '../hooks/motion.ts'
import Elapsed from '../hooks/elapsed.tsx'
import Rail from '../hooks/rail.tsx'
import { DARK } from '../hooks/tokens.ts'

const ROOT = resolve(import.meta.dir, '..')
const SECRET = 'sk-proj-1234567890abcdef'

// ---------------------------------------------------------------- the surface modules

type Fake = { state: unknown; frames: (() => void)[]; setCalls: number; surface: any }
function fakeSurface(columns = 30): Fake {
  const f: Fake = { state: undefined, frames: [], setCalls: 0, surface: null }
  const el = (type: string) => (p: any) => ({ type, props: p, children: p.children ?? [] })
  f.surface = {
    elements: { Box: el('Box'), Text: el('Text') },
    get state() { return f.state },
    setState: (s: unknown) => { f.state = s; f.setCalls++ },
    columns,
    rows: 1,
    every: (_ms: number, fn: () => void) => { f.frames.push(fn) },
  }
  return f
}
const textOf = (n: any): string => (typeof n === 'string' ? n : Array.isArray(n) ? n.map(textOf).join('') : n && typeof n === 'object' ? textOf(n.children) : '')

test('rail.tsx: a still dim rule at rest that never asks for a frame; packets that match motion.ts while active', () => {
  const f = fakeSurface(30)
  const rest = Rail({ active: false, width: 30, color: 'c', dim: 'd', marks: [3], isMerge: false }, f.surface) as any
  expect(textOf(rest)).toBe(stillRail(30, [3], false))
  expect(f.frames).toHaveLength(1)
  const before = f.setCalls
  f.frames[0]!()
  expect(f.setCalls).toBe(before)
  const on = Rail({ active: true, width: 30, color: 'c', dim: 'd', marks: [], isMerge: false }, f.surface) as any
  f.frames[0]!()
  f.frames[0]!()
  const moved = Rail({ active: true, width: 30, color: 'c', dim: 'd', marks: [], isMerge: false }, f.surface) as any
  expect(textOf(on)).not.toBe(textOf(moved))
  const phase = (f.state as { ref: { phase: number } }).ref.phase
  expect(phase).toBe(2)
  const drawn = textOf(moved)
  expect(drawn).toHaveLength(30)
  for (const [cell, glyph] of packetCells(30, phase)) expect(drawn[cell]).toBe(glyph)
  expect(PACKET_GAP).toBe(24)
  // The frame clock was started once, not on every call.
  expect(f.frames).toHaveLength(1)
})

test('rail.tsx: a merge mark instead of a branch mark; the lit run is coloured, the rest dim', () => {
  const f = fakeSurface(12)
  const r = Rail({ active: true, width: 12, color: 'LIT', dim: 'DIM', marks: [5], isMerge: true }, f.surface) as any
  const runs = r.children as any[]
  expect(runs.some(t => t.props.color === 'LIT' && t.props.bold === true)).toBe(true)
  expect(runs.some(t => t.props.color === 'DIM')).toBe(true)
  const rest = Rail({ active: false, width: 12, color: 'LIT', dim: 'DIM', marks: [5], isMerge: true }, fakeSurface(12).surface) as any
  expect(textOf(rest)[5]).toBe('\u2534')
})

test('elapsed.tsx: a running clock ticks on its own frame clock and restarts from a fresh reading; a stopped one draws its final reading', () => {
  const f = fakeSurface()
  const out = (p: { since: number; now: number; endAt: number | null }) => textOf(Elapsed({ ...p, color: 'x' }, f.surface))
  expect(out({ since: 0, now: 65_000, endAt: null })).toBe('1:05')
  f.frames[0]!()
  f.frames[0]!()
  expect(out({ since: 0, now: 65_000, endAt: null })).toBe('1:07')
  expect(out({ since: 0, now: 100_000, endAt: null })).toBe('1:40')
  const g = fakeSurface()
  const done = (now: number) => textOf(Elapsed({ since: 0, now, endAt: 125_000, color: 'x' }, g.surface))
  expect(done(500_000)).toBe('2:05')
  const calls = g.setCalls
  g.frames[0]!()
  expect(g.setCalls).toBe(calls)
  expect(done(500_000)).toBe('2:05')
  expect(fmtTimer(3_725_000)).toBe('1h02')
})

test('the surface modules import nothing at run time (a surface module stands alone)', () => {
  for (const f of ['hooks/rail.tsx', 'hooks/elapsed.tsx']) {
    const src = readFileSync(resolve(ROOT, f), 'utf8')
    const imports = [...src.matchAll(/^import\s+(?!type\b)[^\n]*$/gm)]
    expect(imports).toEqual([])
  }
})

// ---------------------------------------------------------------- the drawing

const kit = (() => {
  const el = (type: string) => (p: any) => ({ type, props: p, children: p.children ?? [] })
  return { Box: el('Box'), Text: el('Text'), Button: el('Button') }
})()
const walk = (n: any, out: any[] = []): any[] => {
  if (n && typeof n === 'object') {
    out.push(n)
    if (Array.isArray(n.children)) for (const c of n.children) walk(c, out)
  }
  return out
}
const clientFake = { rail: (key: string, p: any) => ({ type: 'Rail', props: { key, ...p }, children: [] }), clock: (key: string, p: any) => ({ type: 'Clock', props: { key, ...p }, children: [] }) }

function draw(d: Deck, o: Record<string, unknown> = {}): any {
  return drawDeck({
    kit,
    deck: d,
    layout: 'compact',
    panels: visiblePanels(PANELS, panelFactsOf(d)),
    width: 66,
    maxRows: MINI_ROWS,
    maxCards: 3,
    now: 5000,
    mode: 'auto',
    wins: [winOf('5h', 31, 9e9), winOf('week', 12, 9e9)],
    motion: true,
    flow: flowOf({ turnRunning: d.main.isRunning, agentsRunning: d.cards.filter(c => c.status === 'running').length, lanesWorking: lanesWorking(d) }),
    pal: DARK,
    viewedAgent: null,
    client: clientFake,
    act: { expand: () => undefined, gate: () => undefined, logOlder: () => undefined, logNewer: () => undefined, logToggle: () => undefined },
    ...o,
  } as Parameters<typeof drawDeck>[0])
}

function calm(): Deck {
  let d = emptyDeck()
  d = deckOnMainStep(d, { model: 'claude-opus-5-5', effort: 'high' })
  d = deckOnTurnStart(d, { at: 1000, text: 'please fix the failing test in core.ts', cost: 1 })
  d = deckOnMeasure(d, { percent: 41, tokens: 82_000, window: 200_000, costUsd: 1.0 })
  d = deckOnCheck(d, { id: 'c1', tool: 'Read', input: { file_path: '/r/hooks/core.ts' }, decision: 'allow', at: 1100 })
  d = deckOnToolCall(d, { id: 'c1', tool: 'Read', input: {}, wasDenied: false, isError: false, at: 1110 })
  d = deckOnCheck(d, { id: 'c2', tool: 'Bash', input: { command: 'curl -H "Authorization: Bearer abc.def.ghi123" x --token=' + SECRET }, decision: 'ask', at: 1200 })
  d = deckOnToolCall(d, { id: 'c2', tool: 'Bash', input: {}, wasDenied: true, isError: false, at: 1210 })
  d = deckOnCompact(d, { trigger: 'auto', at: 2600 })
  d = deckOnMeasure(d, { percent: 12, tokens: 24_000, window: 200_000, costUsd: 1.2 })
  d = deckOnLanes(d, [{ name: 'codex-a', state: 'working' }], 2700)
  d = deckOnLanes(d, [{ name: 'codex-a', state: 'idle' }], 2800)
  d = deckOnMainComplete(d, { reason: 'answer', durationMs: 65_000, cost: 1.5 })
  return d
}

function busy(): Deck {
  let d = calm()
  d = deckOnTurnStart(d, { at: 6000, text: 'next', cost: 1.5 })
  d = deckOnMeasure(d, { percent: 55, tokens: 110_000, window: 200_000, costUsd: 1.6 })
  for (let n = 0; n < 5; n++) d = deckOnSpawn(d, { id: 'b' + n, type: 'Explore', model: 'claude-sonnet-5-5', description: 'explore part ' + n, prompt: 'go', at: 6100 + n, isConsult: false })
  for (let n = 0; n < 30; n++) d = deckOnCheck(d, { id: 'k' + n, tool: n % 3 === 0 ? 'Bash' : 'Read', input: { command: 'ls' }, decision: n % 7 === 0 ? 'ask' : 'allow', at: 6200 + n })
  return d
}

test('every Button the deck draws is a plain string label with no children, in every layout', () => {
  for (const layout of ['mini', 'compact', 'wide'] as const) {
    const d = busy()
    const tree = draw({ ...d, ui: { ...d.ui, gateOpen: 'shell', expanded: 'b1' } }, { layout, width: layout === 'wide' ? 120 : 70 })
    const buttons = walk(tree).filter(n => n.type === 'Button')
    for (const b of buttons) {
      expect(typeof b.props.label).toBe('string')
      expect(b.props.children).toBeUndefined()
      expect(b.children).toEqual([])
    }
    if (layout !== 'mini') expect(buttons.length).toBeGreaterThan(5)
  }
})

test('mini: at most 8 rows even with everything to show, one line each; vitals, gate and agents come first', () => {
  const rows = draw(busy(), { layout: 'mini', width: 80 }).children as any[]
  expect(rows.length).toBeLessThanOrEqual(8)
  expect(rows.length).toBeGreaterThanOrEqual(5)
  expect(textOf(rows[0])).toContain('Opus 5.5')
  expect(textOf(rows[0])).toContain('ctx')
  expect(textOf(rows[0])).toContain('\u27f21')
  expect(rows.some(r => textOf(r).startsWith('gate '))).toBe(true)
  expect(rows.some(r => textOf(r).includes('more agents'))).toBe(true)
  for (const r of rows) expect(['Text', 'Box']).toContain(r.type)
  expect((draw(emptyDeck(), { layout: 'mini' }).children as any[]).length).toBe(1)
  expect((draw(busy(), { layout: 'mini', panels: ['vitals'] }).children as any[]).length).toBe(1)
  expect((draw(busy(), { layout: 'mini', maxRows: 3 }).children as any[]).length).toBe(3)
})

test('compact: the panels in the chosen order, connectors that move only while work flows, empty panels absent', () => {
  const d = busy()
  const tree = draw(d)
  const keys = walk(tree).map(n => n.props?.key).filter(Boolean)
  const order = ['p-vitals', 'p-gate', 'p-agents', 'p-receipt', 'p-log']
  for (const k of order) expect(keys).toContain(k)
  const at = order.map(k => keys.indexOf(k))
  expect(at).toEqual([...at].sort((a, b) => a - b))
  const rails = walk(tree).filter(n => n.type === 'Rail')
  expect(rails.find(r => r.props.key === 'link-gate').props.active).toBe(true)
  expect(rails.find(r => r.props.key === 'link-receipt')?.props.active ?? true).toBe(true)
  const idle = draw(calm())
  expect(walk(idle).filter(n => n.type === 'Rail').every(r => !r.props.active)).toBe(true)
  expect(walk(idle).some(n => n.props?.key === 'p-agents')).toBe(false)
  const re = draw(d, { panels: ['log', 'gate', 'vitals'] })
  const rk = walk(re).map(n => n.props?.key).filter(Boolean)
  expect(rk.indexOf('p-log')).toBeLessThan(rk.indexOf('p-gate'))
  expect(rk).not.toContain('p-agents')
  for (const o of [{ motion: false }, { client: null }]) expect(walk(draw(d, o)).some(n => n.type === 'Rail')).toBe(false)
  expect(walk(draw(d, { client: null })).some(n => n.type === 'Clock')).toBe(false)
  expect(textOf(draw(d, { client: null }))).toMatch(/\d:\d\d/)
})

test('wide: two columns (vitals, gate, receipt | agents) with the log full width below; one column when one side is empty', () => {
  const tree = draw(busy(), { layout: 'wide', width: 120 })
  const cols = walk(tree).find(n => n.props?.key === 'deck-cols')
  expect(cols.children).toHaveLength(2)
  const kids = (tree.children as any[]).map(c => c.props?.key)
  expect(kids[kids.length - 1]).toBe('p-log')
  expect(walk(draw(busy(), { layout: 'wide', width: 120, panels: ['vitals', 'gate'] })).some(n => n.props?.key === 'deck-cols')).toBe(false)
})

test('agents: cards up to the limit, lanes beyond; 1-9 are the card hotkeys; max_tokens is red; context is labelled ctx', () => {
  let d = calm()
  d = deckOnSpawn(d, { id: 'x1', type: 'Explore', model: 'claude-sonnet-5-5', description: 'first', prompt: 'p', at: 3000, isConsult: false })
  d = deckOnAgentStep(d, { agentId: 'x1', model: 'm', usage: { input_tokens: 5, cache_read_input_tokens: 9000, output_tokens: 50 }, stopReason: 'max_tokens', at: 3100 })
  d = deckOnSpawn(d, { id: 'x2', type: 'Explore', model: 'claude-sonnet-5-5', description: 'second', prompt: 'p', at: 3200, isConsult: false })
  const cards = draw(d, { panels: ['agents'] })
  const boxes = walk(cards).filter(n => String(n.props?.key ?? '').startsWith('card-box-'))
  expect(boxes).toHaveLength(2)
  expect(walk(cards).filter(n => n.type === 'Button').map(n => n.props.hotkey)).toEqual(['1', '2'])
  expect(boxes.find(b => b.props.key === 'card-box-x1').props.borderColor).toBe(DARK.err)
  expect(textOf(cards)).toContain('ctx 9k')
  expect(textOf(cards)).toContain('max_tokens')
  const lanesTree = draw(busy(), { panels: ['agents'] })
  expect(walk(lanesTree).filter(n => /^lane-b\d$/.test(String(n.props?.key ?? '')))).toHaveLength(5)
  expect(walk(lanesTree).some(n => String(n.props?.key ?? '').startsWith('card-box-'))).toBe(false)
  const done = deckOnAgentComplete(d, { agentId: 'x2', reason: 'answer', answer: 'ok', at: 4000 })
  expect(textOf(draw(done, { panels: ['agents'] }))).toContain('\u2713 done')
  const big = busy()
  const open = draw({ ...big, ui: { ...big.ui, expanded: 'b1' } }, { panels: ['agents'] })
  expect(walk(open).some(n => n.props?.key === 'p-expanded')).toBe(true)
})

test('vitals box: model, effort, mode, requests, the context gauge with its compaction mark row, cost and the two windows', () => {
  const d = busy()
  const v = draw(d, { panels: ['vitals'] })
  const t = textOf(v)
  expect(t).toContain('Opus 5.5')
  expect(t).toContain('effort')
  expect(t).toContain('high')
  expect(t).toContain('55%')
  expect(t).toContain('110k/200k')
  expect(t).toContain('\u27f21')
  expect(t).toContain('$1.60')
  expect(t).toContain('5h')
  expect(t).toContain('week')
  expect(walk(v).some(n => n.props?.key === 'v-marks')).toBe(true)
  expect(walk(draw(emptyDeck(), { panels: ['vitals'] })).some(n => n.props?.key === 'v-marks')).toBe(false)
})

test('gate panel: the strip colours, the totals, the family buttons, the last 5 of the open family; the receipt and the log', () => {
  const d = busy()
  const g = draw({ ...d, ui: { ...d.ui, gateOpen: 'shell' } }, { panels: ['gate'] })
  const colours = new Set(walk(g).filter(n => n.type === 'Text' && n.props.key?.startsWith('gs-')).map(n => n.props.color))
  expect(colours.has(DARK.ok)).toBe(true)
  expect(colours.has(DARK.warn)).toBe(true)
  expect(walk(g).filter(n => n.type === 'Button').map(n => n.props.hotkey)).toEqual(['f', 's', 'o'])
  expect(walk(g).filter(n => String(n.props?.key ?? '').startsWith('gd-'))).toHaveLength(5)
  expect(textOf(g)).toContain('classifier')
  const r = textOf(draw(calm(), { panels: ['receipt'] }))
  expect(r).toContain('last turn 1m05s')
  expect(r).toContain('+$0.50')
  expect(textOf(draw(busy(), { panels: ['receipt'] }))).toContain('turn')
  const log = draw(busy(), { panels: ['log'] })
  expect(walk(log).filter(n => String(n.props?.key ?? '').startsWith('ll-')).length).toBeLessThanOrEqual(8)
  expect(walk(log).filter(n => n.type === 'Button').map(n => n.props.hotkey)).toEqual(['u', 'n', 'e'])
})

test('nothing the deck draws contains a credential; an empty deck says so', () => {
  const d = calm()
  const all = draw({ ...d, ui: { ...d.ui, gateOpen: 'shell', logOpen: true } }, { layout: 'wide', width: 120 })
  expect(textOf(all)).not.toContain('abc.def')
  expect(textOf(all)).not.toContain(SECRET)
  expect(textOf(draw(emptyDeck(), { panels: [] }))).toContain('nothing to show')
  expect(draw(emptyDeck()).children).toHaveLength(2)
})

// ---------------------------------------------------------------- the host's rules, read off the source

test('register.tsx: every event is hooked once without a matcher (the host refuses two); the Deck pane has its own render hook and Client modules', () => {
  const src = readFileSync(resolve(ROOT, 'hooks/register.tsx'), 'utf8')
  const seen = new Map<string, number>()
  for (const m of src.matchAll(/^\s*on\('([a-zA-Z.]+)',\s*(?:async\s+)?(?:function\*?\s*)?\(/gm)) seen.set(m[1] ?? '', (seen.get(m[1] ?? '') ?? 0) + 1)
  expect(seen.size).toBeGreaterThan(8)
  for (const [event, n] of seen) if (event !== 'command.run' && event !== 'ui.render' && event !== 'ui.scroll') expect([event, n]).toEqual([event, 1])
  expect(src).toContain("on('ui.render', { component: 'Pane', requestId: DECK_PANE }")
  expect(src).toContain("module: './rail.tsx'")
  expect(src).toContain("module: './elapsed.tsx'")
  expect(src).toContain('export const register: Register = (on, options) =>')
})

test('every deck hook passes its event on: the Deck-only handlers all return next(e) or the event\'s own result, and swallow their own errors', () => {
  const src = readFileSync(resolve(ROOT, 'hooks/register.tsx'), 'utf8')
  const block = src.slice(src.indexOf('function registerDeck'), src.indexOf('export const register: Register'))
  expect(block.match(/catch \{/g)?.length ?? 0).toBeGreaterThanOrEqual(5)
  expect(block).not.toMatch(/deny\s*:/)
  expect(block.match(/return (?:next\(e\)|done|verdict)/g)?.length ?? 0).toBeGreaterThanOrEqual(5)
})

test('the manifest declares the Deck\'s options and is 0.4.x; the options parse to the defaults; NOTICE credits claude-flightdeck and keeps its copyright line', () => {
  const plugin = JSON.parse(readFileSync(resolve(ROOT, '.claude-plugin/plugin.json'), 'utf8')) as { version: string; userConfig: Record<string, { default: unknown }> }
  expect(plugin.version).toMatch(/^0\.\d+\.\d+$/)
  for (const k of ['layout', 'motion', 'panels', 'maxCards', 'deckOnStart', 'statusLine']) expect(plugin.userConfig[k]).toBeDefined()
  expect(parseDeckConfig(Object.fromEntries(Object.entries(plugin.userConfig).map(([k, v]) => [k, v.default])))).toMatchObject({ layout: 'auto', motion: true, openOnStart: false, statusLine: true })
  const notice = readFileSync(resolve(ROOT, 'NOTICE'), 'utf8')
  expect(notice).toContain('claude-flightdeck')
  expect(notice).toContain('https://github.com/scasella/claude-flightdeck')
  expect(notice).toContain('Copyright (c) 2026 Stephen Casella')
  expect(notice).toContain('Copyright (c) 2026 johnnyvizz')
})
