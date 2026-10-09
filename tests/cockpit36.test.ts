// COCKPIT-36: five sections in one fixed order (Main status, Crew, System, Flight log, Black box), each independent. Every header is always drawn in the declared
// order; a toggle changes only its own section's flag; the saved file round-trips each flag on its own.
import { test, expect } from './pure.ts'
import { graphOf, paneSvgTree } from '../hooks/register.tsx'
import { PANE_SECTIONS, defaultSections, isSectionOpen, legacySections, toggledSections } from '../hooks/panesections.ts'
import { defaultUi, parseUi, serializeUi } from '../hooks/ui.ts'

const writes: string[] = []
const el = (type: string) => (p: any) => ({ type, props: p, children: p.children ?? [] })
const kit: any = { Box: el('Box'), Text: el('Text'), Button: el('Button'), Svg: el('Svg'), Input: el('Input') }
const $: any = { ui: { invalidate: () => undefined, toast: () => undefined }, fs: { write: async (_p: string, t: string) => { writes.push(t) } } }
const walk = (n: any, out: any[] = []): any[] => {
  if (n && typeof n === 'object') {
    out.push(n)
    if (Array.isArray(n.children)) for (const c of n.children) walk(c, out)
  }
  return out
}
const colsFor = (px: number): number => Math.ceil((px + 8) / 8)
const tree = (px: number, heightPx?: number): any => paneSvgTree($, kit, colsFor(px), heightPx === undefined ? undefined : Math.floor(heightPx / 20), 1_000_000, graphOf())
const keysOf = (t: any): string[] => walk(t).map(n => n.props?.key).filter((k): k is string => typeof k === 'string')
// The toggle Button of each section and the key of its header row.
const BUTTON: Record<string, string> = { status: 'status-open', 'c-agents': 'cs-crew', 'c-system': 'cs-system', 'c-events': 'cs-flight', 'c-syslog': 'cs-blackbox' }
const HEADER: Record<string, string> = { status: 'status-row', 'c-agents': 'sechead-cs-crew', 'c-system': 'sechead-cs-system', 'c-events': 'sechead-cs-flight', 'c-syslog': 'sechead-cs-blackbox' }
const IDS = PANE_SECTIONS.map(s => s.id)
const btn = (id: string, px = 420): any => walk(tree(px)).find(n => n.props?.key === BUTTON[id])
const isOpen = (id: string): boolean => btn(id).props.label === '▾'
const states = (): boolean[] => IDS.map(isOpen)
const setAll = (want: boolean[]): void => IDS.forEach((id, i) => { if (isOpen(id) !== want[i]) btn(id).props.onPress() })
const headers = (px: number, h?: number): string[] => keysOf(tree(px, h)).filter(k => Object.values(HEADER).includes(k))

test('the five sections are one declared list in the fixed order', () => {
  expect(PANE_SECTIONS.map(s => s.title)).toEqual(['Main status', 'Agents', 'System', 'Events', 'System log'])
  expect(defaultSections()).toEqual({ status: true, 'c-agents': true, 'c-system': false, 'c-events': false, 'c-syslog': false })
})

test('first run: Main status and Crew are open, System, Flight log and Black box are closed', () => {
  expect(parseUi(null).sections).toEqual(defaultSections())
  expect(states()).toEqual([true, true, false, false, false])
})

test('all 32 open/closed states at 360, 420 and 520 px wide and 600 px high draw all five headers once, in the declared order', () => {
  const want = IDS.map(id => HEADER[id] as string)
  for (let mask = 0; mask < 32; mask++) {
    setAll(IDS.map((_, i) => Boolean(mask & (1 << i))))
    for (const px of [360, 420, 520]) {
      expect(headers(px, 600)).toEqual(want)
      expect(headers(px)).toEqual(want)
      const keys = keysOf(tree(px, 600))
      expect(keys.filter(k => k.startsWith('more-') || k.startsWith('nav-more'))).toEqual([])
    }
  }
  setAll([true, true, false, false, false])
})

test('toggling one section changes no other section\'s flag or header, in every one of the 32 states', () => {
  for (let mask = 0; mask < 32; mask++) {
    for (let i = 0; i < IDS.length; i++) {
      const start = IDS.map((_, j) => Boolean(mask & (1 << j)))
      setAll(start)
      btn(IDS[i] as string).props.onPress()
      const after = states()
      expect(after).toEqual(start.map((v, j) => (j === i ? !v : v)))
      expect(headers(420, 600)).toEqual(IDS.map(id => HEADER[id] as string))
    }
  }
  setAll([true, true, false, false, false])
})

test('a toggle sequence ends where it started and never reorders', () => {
  setAll([true, true, false, false, false])
  const seq = ['c-system', 'c-events', 'c-syslog', 'status', 'c-agents', 'c-system', 'c-agents', 'status', 'c-events', 'c-syslog']
  const want = IDS.map(id => HEADER[id] as string)
  for (const id of seq) {
    btn(id).props.onPress()
    for (const px of [360, 420, 520]) expect(headers(px, 600)).toEqual(want)
  }
  expect(states()).toEqual([true, true, false, false, false])
})

test('the saved file holds each flag on its own and round-trips', () => {
  setAll([true, true, false, false, false])
  writes.length = 0
  btn('c-events').props.onPress()
  const saved = parseUi(writes[writes.length - 1] ?? null)
  expect(saved.sections).toEqual({ status: true, 'c-agents': true, 'c-system': false, 'c-events': true, 'c-syslog': false })
  for (let mask = 0; mask < 32; mask++) {
    const flags = Object.fromEntries(IDS.map((id, i) => [id, Boolean(mask & (1 << i))]))
    expect(parseUi(serializeUi({ ...defaultUi, sections: flags })).sections).toEqual(flags)
  }
  // toggledSections changes exactly one entry
  for (const id of IDS) {
    const t = toggledSections(defaultSections(), id)
    expect(IDS.filter(x => t[x] !== defaultSections()[x])).toEqual([id])
    expect(isSectionOpen(t, id)).toBe(!defaultSections()[id])
  }
  setAll([true, true, false, false, false])
})

test('a file from before COCKPIT-36 keeps what it had, flag by flag', () => {
  expect(legacySections(['c-system', 'c-crew-shut'])).toEqual({ status: false, 'c-agents': false, 'c-system': true, 'c-events': false, 'c-syslog': false })
  expect(parseUi('{"expanded":["c-blackbox"]}').sections['c-syslog']).toBe(true)
  // a broken sections value falls back to defaults for the missing entries
  expect(parseUi('{"sections":{"c-system":true,"x":1}}').sections).toEqual({ ...defaultSections(), 'c-system': true })
})
