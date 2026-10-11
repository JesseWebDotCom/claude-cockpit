// COCKPIT-26 (cockpit 0.6.0): System, Flight log and Black box are one family of cards (a header band with a title, a one-line summary at the right and
// a chevron, then a body flush under it when open); Health and limits live INSIDE the System card; no text sits on the bare page background.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { graphOf, paneSvgTree } from '../hooks/register.tsx'
import { SEC_END, SEC_HEAD_TILE, SEC_TOP, blackBoxBodyHeight, blackBoxBodySvg, flightBodyHeight, flightBodySvg, lineCardHeight, lineCardSvg, noticeHeight, noticeSvg, secHeadHeight, secHeadSvg, subHeight, subSvg } from '../hooks/sections.ts'
import { revealOffset } from '../hooks/ui.ts'
import { systemFigures, emptyReading } from '../hooks/system.ts'
import { blackBoxSummary } from '../hooks/blackbox.ts'
import { flightSummary } from '../hooks/flightlog.ts'
import { isWellFormed } from './helpers.ts'

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
const topKeys = (t: any): string[] => (t.children as any[]).map(c => String(c.props?.key ?? ''))
const byKey = (t: any, k: string): any => walk(t).find(n => n.props?.key === k)
const press = (k: string): void => byKey(tree(), k).props.onPress()

// ---------------------------------------------------------------- the one header builder

test('a header is one tidy line when closed (4 px air, the 34 px tile, 4 px air) and joins its body when open (no air under the tile)', () => {
  expect(secHeadHeight(false)).toBe(SEC_TOP + SEC_HEAD_TILE + SEC_END)
  expect(secHeadHeight(true)).toBe(SEC_TOP + SEC_HEAD_TILE)
  // Open, the tile runs on under the viewport so no rounded corner shows at the bottom.
  const open = secHeadSvg(420, { title: 'System', summary: 'x', isOpen: true })
  const closed = secHeadSvg(420, { title: 'System', summary: 'x', isOpen: false })
  const tileH = (s: string): number => Number(/<rect class="tile"[^>]*height="([\d.]+)"/.exec(s)?.[1])
  expect(tileH(open)).toBeGreaterThan(tileH(closed))
  expect(tileH(closed)).toBe(SEC_HEAD_TILE)
})

test('a long summary is cut to what is left beside the title, never over it', () => {
  const s = secHeadSvg(240, { title: 'Events', summary: '12 done, 7 errored, 3 blocked, 9 unknown, 4 more', isOpen: false })
  expect(isWellFormed(s)).toBe(true)
  expect(s).toContain('\u2026')
})

test('the summaries: System "memory 62% . cpu 31% . disk 48%", Flight log "N done, ...", Black box "N events, N problems"', () => {
  expect(systemFigures({ ...emptyReading, memFree: 38, load1: 3.1, cores: 10, diskFree: 52 })).toBe('CPU 31% \u00b7 MEM 62% \u00b7 DISK 48%')
  expect(systemFigures(emptyReading)).toBe('checking')
  expect(systemFigures({ ...emptyReading, memFree: 38 })).toBe('MEM 62%')
  expect(flightSummary([{ key: 'a', name: 'a', status: 'done', detail: '', atMs: 0, source: 'report' }])).toBe('1 done')
  expect(blackBoxSummary([])).toBe('nothing yet')
})

// ---------------------------------------------------------------- the bodies and the small cards

test('the open bodies are slices that join the header: straight sides, the last one rounds off and leaves 4 px of air', () => {
  const flight = flightBodySvg(420, [{ name: 'COCKPIT-24', detail: 'done', word: 'DONE', hex: '#3FB950' }])
  const box = blackBoxBodySvg(420, [{ time: '12:01', label: 'edit', who: 'main', text: 'Edit hooks/look.ts', cls: 'okc', isProblem: false }], 'nothing')
  expect(isWellFormed(flight)).toBe(true)
  expect(isWellFormed(box)).toBe(true)
  expect(flight).toContain(`height="${flightBodyHeight(1)}"`)
  expect(box).toContain(`height="${blackBoxBodyHeight(1)}"`)
  expect(flight).toContain('DONE')
  expect(box).toContain('Edit hooks/look.ts')
  // A sub-section that is not the last is taller by none of the end air, the last one by SEC_END.
  const sub = { title: 'Services', lines: [{ dot: '#3FB950', text: 'Web app', right: 'up', rightCls: 'okc' }] }
  expect(subHeight(420, sub, true) - subHeight(420, sub, false)).toBe(SEC_END)
  expect(isWellFormed(subSvg(420, sub, false))).toBe(true)
  expect(isWellFormed(subSvg(420, { title: 'Resources', gauges: [{ label: 'Memory 62% used', ratio: 0.62, hex: '#3FB950', note: '38% free' }], foot: 'Top memory: node 1.2 GB' }, true))).toBe(true)
})

test('a notice and a one-line card are cards (a tile with their text), 8 px of air between neighbours', () => {
  const n = noticeSvg(300, 'press y to confirm: restart codex-a', 'warn')
  const l = lineCardSvg(300, '3 more above', 's')
  for (const s of [n, l]) {
    expect(isWellFormed(s)).toBe(true)
    expect(s).toContain('class="tile"')
  }
  expect(n).toContain('press y to confirm')
  expect(l).toContain('3 more above')
  expect(noticeHeight(300, 'one line')).toBeGreaterThan(lineCardHeight() - 20)
  expect(lineCardHeight()).toBe(SEC_TOP + 30 + SEC_END)
  // A long notice wraps (three lines at most) instead of running off the card.
  const long = noticeSvg(240, 'press y to confirm: ' + 'restart the lane and clear its stale lock '.repeat(8), '')
  expect(isWellFormed(long)).toBe(true)
  expect(noticeHeight(240, 'press y to confirm: ' + 'restart the lane and clear its stale lock '.repeat(8))).toBeLessThanOrEqual(SEC_TOP + 12 + 3 * 18 + 6 + SEC_END)
})

// ---------------------------------------------------------------- the pane tree

test('the section source has no plain-text link left: no "Sessions" / "System" / "Black box" label button, the clear log link is a secondary button', () => {
  expect(SRC).not.toContain("put('cs-help'")
  expect(SRC).not.toContain("'hs-'")
  expect(SRC).not.toContain('function healthBlocks')
  expect(SRC).not.toContain("'Black box \\u00b7 '")
  expect(SRC).toMatch(/key: 'away-clear', label: 'clear log', hotkey: 'x', variant: 'secondary'/)
  // COCKPIT-34: the band's System label and its expand glyph are gone.
  expect(SRC).not.toContain("key: 'band-sys'")
})

// ---------------------------------------------------------------- bringing an opened card into view

test('revealOffset: an opened section is brought into view, its header at the top when it is taller than the room', () => {
  const blocks = Array.from({ length: 12 }, (_, i) => ({ key: i < 6 ? 'r' + i : 'sys-' + (i - 6), el: null, h: i === 6 ? 42 : 52 }))
  // The section is blocks 6..11 (42 + 5 x 52 = 302 px). Room 400: it all fits, so the offset is the first block start from which it does.
  const top = 52 * 6
  const fit = revealOffset(blocks, 'sys-0', 'sys-5', 0, 400)
  expect(fit).toBeLessThanOrEqual(top)
  expect(blocks.reduce((s, b) => s + b.h, 0) - fit).toBeGreaterThan(0)
  // Room 200: shorter than the section, so the header is at the top of the window.
  expect(revealOffset(blocks, 'sys-0', 'sys-5', 0, 200)).toBe(top)
  // An unknown header leaves the offset alone.
  expect(revealOffset(blocks, 'nope', 'nope', 104, 300)).toBe(104)
  // The person is already past the header: the header is brought back, never left above the window.
  expect(revealOffset(blocks, 'sys-0', 'sys-5', 9999, 400)).toBeLessThanOrEqual(top)
})
