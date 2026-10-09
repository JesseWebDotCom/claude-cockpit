// COCKPIT-23 (cockpit 0.5.6): the Cockpit pane is ONE page with no tabs. Top to bottom: a) the Status card, b) the button row,
// c) the crew rows, d) the System card (collapsed), e) the Flight log, f) the Black box. No tab strip (Crew, Items, Inbox, Health) and no
// counter-chip row ("INBOX 0", "SERVICE down", "0 blocked"). The Health content lives inside the System card, shown when it is opened.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { graphOf, paneSvgTree } from '../hooks/register.tsx'

const ROOT = resolve(import.meta.dir, '..')
const SRC = readFileSync(resolve(ROOT, 'hooks/register.tsx'), 'utf8')

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
const tree = (cols = 100, rows?: number): any => paneSvgTree($, kit, cols, rows, 1_000_000, graphOf())
const keysOf = (t: any): string[] => walk(t).map(n => n.props?.key).filter((k): k is string => typeof k === 'string')
// The keys of the root's direct children, in order (the pane's page order).
const topKeys = (t: any): string[] => (t.children as any[]).map(c => String(c.props?.key ?? ''))

test('the pane tree order: status-row, button-row, crew rows, cs-system (collapsed), flight log, black box', () => {
  const t = tree()
  const top = topKeys(t)
  const order = ['status-row', 'button-row', 'rowbox-session', 'sechead-cs-system', 'sechead-cs-flight', 'sechead-cs-blackbox']
  const at = order.map(k => top.indexOf(k))
  expect(at.every(i => i >= 0)).toBe(true)
  expect(at).toEqual([...at].sort((a, b) => a - b))
  // The first two are the status card and the button row, and nothing sits between them.
  expect(at[0]).toBe(0)
  expect(at[1]).toBe(1)
  // The System card is collapsed: its header band and chevron only, no gauges and no health content.
  const sys = walk(t).find(n => n.props?.key === 'cs-system')
  expect(sys.props.label).toBe('\u25b8')
  const keys = keysOf(t)
  for (const k of ['svg-system', 'svg-health', 'sys-res', 'sys-services']) expect(keys).not.toContain(k)
  expect(keys.some(k => k.startsWith('hs-'))).toBe(false)
})

test('every crew row sits between the button row and the System card', () => {
  const top = topKeys(tree())
  const rows = top.filter(k => k.startsWith('rowbox-') || k.startsWith('subline-') || k === 'sleepers' || k === 'no-crew')
  expect(rows.length).toBeGreaterThan(0)
  for (const k of rows) {
    expect(top.indexOf(k)).toBeGreaterThan(top.indexOf('button-row'))
    expect(top.indexOf(k)).toBeLessThan(top.indexOf('sechead-cs-system'))
  }
})

test('there is no tab strip and no counter-chip row in the pane tree, on any width', () => {
  for (const cols of [40, 60, 100, 140]) {
    const t = tree(cols)
    const keys = keysOf(t)
    expect(keys).not.toContain('tabs')
    expect(keys).not.toContain('chips')
    expect(keys).not.toContain('ui-help')
    expect(keys.filter(k => k.startsWith('tab-') || k.startsWith('tabbox-') || k.startsWith('chip-'))).toEqual([])
    const labels = walk(t).filter(n => n.type === 'Button').map(n => String(n.props.label))
    for (const l of ['Crew', 'Items', 'Inbox', 'Health']) expect(labels).not.toContain(l)
    const texts = JSON.stringify(t)
    expect(texts).not.toMatch(/Inbox \d/)
    expect(texts).not.toMatch(/Service (up|down|\?)/)
    expect(texts).not.toMatch(/\d+ blocked/)
  }
})

test('the Items, Inbox and Health tab branches are gone from the pane source; the pane tree ignores the remembered tab', () => {
  expect(SRC).not.toContain("key: 'tabs'")
  expect(SRC).not.toContain("ui.tab === 'items'")
  expect(SRC).not.toContain("ui.tab === 'inbox'")
  expect(SRC).not.toContain("put('chips'")
  expect(SRC).not.toContain("key: 'tab-'")
})

test('Health lives inside the System card: opening it adds the Resources and Health sub-sections once each, under the header and before the Flight log', () => {
  walk(tree()).find(n => n.props?.key === 'cs-system').props.onPress()
  const t = tree()
  const top = topKeys(t)
  const keys = keysOf(t)
  expect((walk(t).find(n => n.props?.key === 'cs-system')).props.label).toBe('\u25be')
  for (const k of ['sys-res', 'sys-plans', 'sys-ctx', 'sys-sess', 'sys-mem']) expect(keys.filter(x => x === 'svg-' + k)).toHaveLength(1)
  // No other health view: no Health card, no "hs-" section buttons.
  for (const k of ['svg-system', 'svg-health']) expect(keys).not.toContain(k)
  expect(keys.some(k => k.startsWith('hs-'))).toBe(false)
  // Everything the open card adds comes after its header and before the Flight log's header.
  const body = top.filter(k => k.startsWith('svg-sys-') || k === 'sys-tools')
  expect(body.length).toBeGreaterThan(0)
  for (const k of body) {
    expect(top.indexOf(k)).toBeGreaterThan(top.indexOf('sechead-cs-system'))
    expect(top.indexOf(k)).toBeLessThan(top.indexOf('sechead-cs-flight'))
  }
  // close it again for the other tests
  walk(t).find(n => n.props?.key === 'cs-system').props.onPress()
  expect(keysOf(tree())).not.toContain('svg-sys-res')
})

test('Add Bug and Add Idea still write the inbox files and the AUTOPILOT button stays (the inbox tab is replaced, not the inbox)', () => {
  const keys = keysOf(tree())
  for (const k of ['add-bug', 'add-idea', 'crew-presence', 'autopilot-state']) expect(keys).toContain(k)
  expect(SRC).toContain('inboxMdFile')
})
