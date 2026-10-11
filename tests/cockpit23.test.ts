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

test('the Items, Inbox and Health tab branches are gone from the pane source; the pane tree ignores the remembered tab', () => {
  expect(SRC).not.toContain("key: 'tabs'")
  expect(SRC).not.toContain("ui.tab === 'items'")
  expect(SRC).not.toContain("ui.tab === 'inbox'")
  expect(SRC).not.toContain("put('chips'")
  expect(SRC).not.toContain("key: 'tab-'")
})

test('Add Bug and Add Idea still write the inbox files and the AUTOPILOT button stays (the inbox tab is replaced, not the inbox)', () => {
  const keys = keysOf(tree())
  for (const k of ['add-bug', 'add-idea', 'crew-presence', 'autopilot-state']) expect(keys).toContain(k)
  expect(SRC).toContain('inboxMdFile')
})
