// COCKPIT-30 (cockpit 0.8.2): the Session and the crew are one collapsible card, "Crew": a header like System's, the rows on the card's own tile.

import { test, expect } from './pure.ts'
import { graphOf, paneSvgTree } from '../hooks/register.tsx'
import { CREW_CAP_H, CREW_LINE_H, crewCapSvg, crewLineSvg, crewSummary } from '../hooks/sections.ts'
import { rowSvg, sleepersSvg } from '../hooks/look.ts'
import type { LookRow } from '../hooks/look.ts'
import { defaultUi, parseUi, serializeUi } from '../hooks/ui.ts'
import { isWellFormed } from './helpers.ts'

const el = (type: string) => (p: any) => ({ type, props: p, children: p.children ?? [] })
const kit: any = { Box: el('Box'), Text: el('Text'), Button: el('Button'), Svg: el('Svg'), Input: el('Input') }
const $: any = { ui: { invalidate: () => undefined, toast: () => undefined }, fs: { write: async () => undefined } }
const walk = (n: any, out: any[] = []): any[] => {
  if (n && typeof n === 'object') {
    out.push(n)
    if (Array.isArray(n.children)) for (const c of n.children) walk(c, out)
  }
  return out
}
const tree = (rows?: number): any => paneSvgTree($, kit, 100, rows, 1_000_000, graphOf())
const keysOf = (t: any): string[] => walk(t).map(n => n.props?.key).filter((k): k is string => typeof k === 'string')
const byKey = (t: any, k: string): any => walk(t).find(n => n.props?.key === k)

const row: LookRow = { kind: 'max', variant: 0, mode: 'dim', activity: 'sleeping', title: 'Claude', state: { text: 'sleeping', color: '#888' }, item: '', tag: '', since: '', trouble: null, isOut: false, indent: 0, isOpen: false, detail: [], bars: [], burst: '', landed: '', phase: 0 }

test('the summary names the trouble first, then working, idle and sleeping; zero counts are left out', () => {
  expect(crewSummary({ working: 2, idle: 1, sleeping: 3, blocked: 0, errored: 0 })).toEqual({ text: '2 active, 1 idle, 3 sleeping', tone: 'ok' })
  expect(crewSummary({ working: 1, idle: 0, sleeping: 0, blocked: 1, errored: 0 })).toEqual({ text: '1 blocked, 1 active', tone: 'warn' })
  expect(crewSummary({ working: 0, idle: 0, sleeping: 2, blocked: 1, errored: 1 })).toEqual({ text: '1 errored, 1 blocked, 2 sleeping', tone: 'err' })
  expect(crewSummary({ working: 0, idle: 0, sleeping: 0, blocked: 0, errored: 0 }).text).toBe('no agents running')
})

test('a row inside the card is drawn on the card tile: straight sides, a hairline on top, no tile of its own', () => {
  const alone = rowSvg(360, row)
  const inside = rowSvg(360, { ...row, inCard: true })
  expect(isWellFormed(inside)).toBe(true)
  expect(alone).not.toContain('class="tile"')
  expect(inside).toContain('class="tile"')
  expect(/<rect class="tile"[^>]*rx=/.test(inside)).toBe(false)
  expect(inside).toContain('<line class="ln" x1="')
  const open = rowSvg(360, { ...row, inCard: true, isOpen: true, detail: [{ label: 'Doing', text: 'x' }] })
  expect(/<rect class="tile"[^>]*rx=/.test(open)).toBe(false)
})

test('the sleeping summary row, the one-line row and the cap are well formed and as tall as they say', () => {
  const sl = sleepersSvg(360, [{ kind: 'max', variant: 0, name: 'Claude' }, { kind: 'codex', variant: 0, name: 'Codex' }], true)
  expect(isWellFormed(sl)).toBe(true)
  expect(sl).toContain('class="tile"')
  expect(isWellFormed(crewLineSvg(360, 'no agents running', 'm'))).toBe(true)
  expect(crewLineSvg(360, 'x')).toContain(`height="${CREW_LINE_H}"`)
  const cap = crewCapSvg(360)
  expect(isWellFormed(cap)).toBe(true)
  expect(cap).toContain(`height="${CREW_CAP_H}"`)
  expect(cap).toContain('rx="8"')
})

test('the page: a Crew header, then the Session, then the cap, then System, Flight log and Black box; open by default', () => {
  const ks = keysOf(tree())
  const at = (k: string): number => ks.indexOf(k)
  expect(at('sechead-cs-crew')).toBeGreaterThanOrEqual(0)
  expect(at('rowbox-session')).toBeGreaterThan(at('sechead-cs-crew'))
  expect(at('svg-crew-cap')).toBeGreaterThanOrEqual(0)
  expect(at('svg-crew-cap')).toBeGreaterThan(at('rowbox-session'))
  expect(at('sechead-cs-system')).toBeGreaterThan(at('svg-crew-cap'))
  expect(at('sechead-cs-flight')).toBeGreaterThan(at('sechead-cs-system'))
  expect(at('sechead-cs-blackbox')).toBeGreaterThan(at('sechead-cs-flight'))
})

test('shutting the card hides the Session and the crew and its state is kept; opening brings them back', () => {
  expect(byKey(tree(), 'cs-crew').props.label).toBe('▾')
  byKey(tree(), 'cs-crew').props.onPress()
  const shut = keysOf(tree())
  expect(shut).toContain('sechead-cs-crew')
  expect(shut).not.toContain('rowbox-session')
  expect(shut).not.toContain('svg-crew-cap')
  expect(byKey(tree(), 'cs-crew').props.label).toBe('▸')
  expect(shut).toContain('sechead-cs-system')
  byKey(tree(), 'cs-crew').props.onPress()
  expect(keysOf(tree())).toContain('rowbox-session')
})

test('the shut state is saved with the other sections and survives a reload', () => {
  const saved = serializeUi({ ...defaultUi, expanded: ['c-crew-shut', 'c-system'] })
  expect(parseUi(saved).expanded).toEqual(['c-crew-shut', 'c-system'])
  expect(defaultUi.expanded).not.toContain('c-crew-shut')
})
