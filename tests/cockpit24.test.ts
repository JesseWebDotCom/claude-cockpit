// COCKPIT-24 (cockpit 0.5.7): 12 px of space between the button row and the first crew row, and the lower cards (System, Flight log, Black box)
// stay in view when the crew rows fill the room: only the crew rows scroll, the Flight log shows fewer entries before the crew gives up its room.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { BUTTON_GAP_PX, buttonGapSvg, graphOf, paneSvgTree } from '../hooks/register.tsx'

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
const topKeys = (t: any): string[] => (t.children as any[]).map(c => String(c.props?.key ?? ''))
const keysOf = (t: any): string[] => walk(t).map(n => n.props?.key).filter((k): k is string => typeof k === 'string')

test('a 12 px gap sits between the button row and the first crew row, on every width', () => {
  expect(BUTTON_GAP_PX).toBe(12)
  for (const cols of [40, 80, 100, 140]) {
    const t = tree(cols)
    const top = topKeys(t)
    const gap = (t.children as any[])[top.indexOf('button-gap')]
    expect(gap.type).toBe('Svg')
    expect(gap.props.height).toBe(12)
    expect(gap.props.source).toContain('height="12"')
    // After the button row (and whatever line sits under it: the field, a confirm or reply line, a note), before the first crew row.
    expect(top.indexOf('button-gap')).toBeGreaterThan(top.indexOf('button-row'))
    expect(top.slice(top.indexOf('button-row') + 1, top.indexOf('button-gap')).every(k => !k.startsWith('rowbox-') && !k.startsWith('subline-'))).toBe(true)
    expect(top.indexOf('rowbox-session')).toBe(-1)
  }
  expect(buttonGapSvg(300)).toContain('width="300"')
})

test('the pane scroll hook passes a move it cannot take to the engine instead of swallowing it; the draw is logged', () => {
  expect(SRC).toContain('return next(e)')
  expect(SRC).toMatch(/on\('ui\.scroll', \{ component: 'Pane', requestId: PANE \}, async \(\$, e, next\) =>/)
  expect(SRC).toContain('paneMaxOffset')
  expect(SRC).toContain("DATA + '/crew-pane.log'")
})
