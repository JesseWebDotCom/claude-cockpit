// COCKPIT-35: the card order is fixed (System, Flight log, Black box). Collapsing, expanding or the bottom pinning never moves one card above another.
import { test, expect } from './pure.ts'
import { graphOf, LOWER_CARDS, paneSvgTree } from '../hooks/register.tsx'

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
const tree = (px: number, heightPx?: number): any => paneSvgTree($, kit, colsFor(px), heightPx === undefined ? undefined : Math.floor(heightPx / 20), 1_000_000, graphOf(), [], [])
const keysOf = (t: any): string[] => walk(t).map(n => n.props?.key).filter((k): k is string => typeof k === 'string')
const HEADS = ['cs-system', 'svg-flight', 'cs-blackbox']
const press = (key: string): void => walk(tree(420)).find(n => n.props?.key === key).props.onPress()
const has = (key: string): boolean => keysOf(tree(420)).includes(key)
// The cards that can be toggled here: System and Black box always, the Flight log's longer view when there are more entries than the short view.
const toggles = (): string[] => ['cs-system', ...(has('flight-more') ? ['flight-more'] : []), 'cs-blackbox']
const isOpen = (key: string): boolean => (key === 'flight-more' ? walk(tree(420)).find(n => n.props?.key === key)?.props.label === 'show fewer' : walk(tree(420)).find(n => n.props?.key === key)?.props.label.startsWith('▾'))
const setOnly = (want: Record<string, boolean>): void => { for (const k of Object.keys(want)) if (isOpen(k) !== want[k]) press(k) }
const drawn = (px: number, h: number): string[] => keysOf(tree(px, h)).filter(k => HEADS.includes(k))
const inOrder = (got: string[]): boolean => got.every((k, i) => i === 0 || HEADS.indexOf(got[i - 1] as string) < HEADS.indexOf(k))

test('the order is one declared list: System, Flight log, Black box', () => {
  expect(LOWER_CARDS.map(c => c.keys[0])).toEqual(HEADS)
})

test('every open/closed state at 360, 420 and 520 px wide and 600 px high keeps the headers in the declared order', () => {
  const ks = toggles()
  for (let mask = 0; mask < 1 << ks.length; mask++) {
    const want: Record<string, boolean> = {}
    ks.forEach((k, i) => { want[k] = Boolean(mask & (1 << i)) })
    for (const px of [360, 420, 520]) {
      setOnly(want)
      expect(inOrder(drawn(px, 600))).toBe(true)
    }
    setOnly(Object.fromEntries(ks.map(k => [k, false])))
  }
})

test('a toggle sequence keeps the order and closing all restores System, Flight log, Black box', () => {
  const ks = toggles()
  const seq: Array<[string, boolean]> = [['cs-system', true], ['cs-system', false], ...(ks.includes('flight-more') ? [['flight-more', true] as [string, boolean]] : []), ['cs-blackbox', true], ['cs-blackbox', false], ...(ks.includes('flight-more') ? [['flight-more', false] as [string, boolean]] : [])]
  for (const [k, to] of seq) {
    if (isOpen(k) !== to) press(k)
    for (const px of [360, 420, 520]) expect(inOrder(drawn(px, 600))).toBe(true)
  }
  expect(drawn(420, 600)).toEqual(HEADS)
})
