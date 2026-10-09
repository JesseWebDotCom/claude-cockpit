// COCKPIT-37: every open section is reachable in a pane taller than its window; the first card is titled "Main status".
// Who scrolls: the host when it can (the full column is drawn, tested here as total height), else the plugin's own window of whole blocks (tested here as the
// offset range, what each offset shows, and that the last line of the Black box shows at the end).
import { test, expect } from './pure.ts'
import { graphOf, paneSvgTree, paneScrollForTest } from '../hooks/register.tsx'
import { PANE_SECTIONS } from '../hooks/panesections.ts'
import { scrollMove, stepOffset, ROW_PX } from '../hooks/ui.ts'

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
const colsFor = (px: number): number => Math.ceil((px + 8) / 8)
const tree = (px: number, heightPx: number): any => paneSvgTree($, kit, colsFor(px), Math.floor(heightPx / 20), 1_000_000, graphOf())
const btn = (key: string, px = 420): any => walk(tree(px, 600)).find(n => n.props?.key === key)
const IDS = PANE_SECTIONS.map(s => s.id)
const BUTTON: Record<string, string> = { status: 'status-open', 'c-agents': 'cs-crew', 'c-system': 'cs-system', 'c-events': 'cs-flight', 'c-syslog': 'cs-blackbox' }
const HEADERS = IDS.map(id => (id === 'status' ? 'status-row' : 'sechead-' + BUTTON[id]))
const isOpen = (id: string): boolean => btn(BUTTON[id] as string).props.label === '▾'
const openAll = (): void => { for (const id of IDS) if (!isOpen(id)) btn(BUTTON[id] as string).props.onPress() }
const resetAll = (): void => { for (const id of IDS) if (isOpen(id) !== PANE_SECTIONS.find(s => s.id === id)?.openByDefault) btn(BUTTON[id] as string).props.onPress() }
const keys = (t: any): string[] => walk(t).map(n => n.props?.key).filter((k): k is string => typeof k === 'string')
const svgPx = (t: any): number => (t.children as any[]).reduce((s, c) => s + (walk(c).find(n => n.type === 'Svg')?.props?.height ?? 0), 0)

test('the first card is titled "Main status"', () => {
  resetAll()
  const t = tree(420, 600)
  const status = walk(t).find(n => n.type === 'Svg' && n.props.key === 'svg-status')
  expect(String(status.props.source)).toContain('>Main status<')
  expect(String(status.props.source)).not.toContain('>Today<')
})

test('host scroll: the full column keeps the five headers in order and is taller than the window; the host owns the range', () => {
  openAll()
  paneScrollForTest.mode('host')
  for (const px of [360, 420, 520]) {
    const t = tree(px, 600)
    expect(keys(t).filter(k => HEADERS.includes(k))).toEqual(HEADERS)
    expect(paneScrollForTest.state().treePx).toBeGreaterThan(600)
    expect(paneScrollForTest.state().maxOffset).toBe(0)
  }
  paneScrollForTest.mode('unknown')
  resetAll()
})

test('own scroll: with every section open at 600 px high, every block is reachable and the last line of the Black box shows at the end', () => {
  openAll()
  paneScrollForTest.mode('own')
  for (const px of [360, 420, 520]) {
    paneScrollForTest.move(-1e9)
    let t = tree(px, 600)
    const { treePx, maxOffset } = paneScrollForTest.state()
    expect(treePx).toBeGreaterThan(600)
    expect(maxOffset).toBeGreaterThan(0)
    const full = (() => { paneScrollForTest.mode('host'); const f = keys(tree(px, 600)); paneScrollForTest.mode('own'); return f })()
    const seen = new Set<string>()
    const shownOrders: string[][] = []
    for (let guard = 0; guard < 200; guard++) {
      t = tree(px, 600)
      expect(svgPx(t)).toBeLessThanOrEqual(600 - 40 + 1)
      const ks = keys(t)
      ks.forEach(k => seen.add(k))
      shownOrders.push(ks.filter(k => HEADERS.includes(k)))
      if (paneScrollForTest.state().offset >= maxOffset) break
      paneScrollForTest.move(ROW_PX * 3)
      t = tree(px, 600)
    }
    // the offset range ends at the end: the last block (Black box) is shown
    const lastKey = full[full.length - 1] as string
    expect(keys(tree(px, 600))).toContain(lastKey)
    expect(paneScrollForTest.state().offset).toBe(maxOffset)
    // every block the full column holds was shown at some offset
    for (const k of full) expect(seen.has(k)).toBe(true)
    // headers keep their order in every window
    for (const o of shownOrders) expect(o).toEqual(HEADERS.filter(h => o.includes(h)))
  }
  paneScrollForTest.mode('unknown')
  paneScrollForTest.move(-1e9)
  resetAll()
})

test('own scroll: Home and End are told from a page key', () => {
  expect(scrollMove(3, 60, 30)).toBe(3)
  expect(scrollMove(30, 60, 30)).toBe(30)
  expect(scrollMove(60, 60, 30)).toBe('end')
  expect(scrollMove(-60, 60, 30)).toBe('start')
})

test('own scroll: a one-row tick always reaches another block, up and down, and stops at both ends', () => {
  const starts = [0, 200, 230, 400]
  expect(stepOffset(starts, 0, 20, 300)).toBe(200)
  expect(stepOffset(starts, 200, 20, 300)).toBe(230)
  expect(stepOffset(starts, 230, 20, 300)).toBe(300)
  expect(stepOffset(starts, 300, 20, 300)).toBe(300)
  expect(stepOffset(starts, 230, -20, 300)).toBe(200)
  expect(stepOffset(starts, 0, -20, 300)).toBe(0)
  expect(stepOffset(starts, 0, 600, 300)).toBe(300)
})
