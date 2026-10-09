// COCKPIT-32: the system icons sit on the bottom row of the status bar, the cloud and API credit icons on the middle row.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from './pure.ts'
import { creditIcons, stateOfRow } from '../hooks/credit.ts'
import { GLYPH_PATHS } from '../hooks/glyphs.ts'
import { BAND_ICON_CELL, STRIP_ORDER, apiRow, cloudRow, groupPx, stripOf, claudeRow } from '../hooks/pools.ts'
import { LEVEL_COLOR, emptyReading, healthIcons } from '../hooks/system.ts'
import { creditNodes, systemNodes } from '../hooks/register.tsx'
import { outageOf } from '../hooks/outage.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'

const el = (type: string) => (p: any) => ({ type, props: p, children: p.children ?? [] })
const kit: any = { Box: el('Box'), Text: el('Text'), Button: el('Button'), Svg: el('Svg'), Input: el('Input') }
const walk = (n: any, out: any[] = []): any[] => {
  if (n && typeof n === 'object') {
    out.push(n)
    if (Array.isArray(n.children)) for (const c of n.children) walk(c, out)
  }
  return out
}
const SRC = readFileSync(resolve(import.meta.dir, '../hooks/register.tsx'), 'utf8')
const NOW = Date.parse('2026-10-08T22:00:00Z')
const noOut = [{ kind: 'claude', outage: null }]

test('the strip carries no System group: the credit icons end the middle row, the system icons lead the bottom row', () => {
  expect(STRIP_ORDER).not.toContain('system' as never)
  expect(SRC).toMatch(/creditNodes\(kit, creditIcons\(/)
  // The credit group is built inside the strip row; the system group inside the bottom row's right-hand box.
  const at = SRC.indexOf('creditNodes(kit, creditIcons(')
  const strip = SRC.slice(at - 600, at + 300)
  expect(strip).toContain('line2')
  expect(strip).not.toContain('systemNodes(')
  const right = SRC.slice(SRC.indexOf("key: 'crew-band-right'"), SRC.indexOf("key: 'crew-band-right'") + 400)
  expect(right).toContain('systemNodes(')
  expect(right).not.toContain('creditNodes(')
})

test('system icons: CPU, memory, disk (and GPU when read), each an Svg with an alt, then one press glyph', () => {
  const icons = healthIcons({ ...emptyReading, memFree: 38, cores: 10, diskFree: 52 } as any, [])
  const nodes = systemNodes(kit, icons, () => undefined) as any[]
  const all = walk(nodes[0])
  expect(all.filter(n => n.type === 'Svg').map(n => n.props.key)).toEqual(['hi-cpu', 'hi-memory', 'hi-disk'])
  expect(all.filter(n => n.type === 'Button').map(n => n.props.key)).toEqual(['band-sys'])
  expect(systemNodes(kit, [], () => undefined)).toEqual([])
})

test('credit icons: a cloud and a coin, each with an alt, then one press glyph that opens the Crew card', () => {
  let pressed = 0
  const nodes: any = creditNodes(kit, creditIcons([cloudRow('2026-11-30', 1, NOW), apiRow({ measured: { usd: 3.4, messages: 34 }, limit: 200 })], noOut), () => { pressed += 1 })
  const all = walk(nodes)
  const svgs = all.filter(n => n.type === 'Svg')
  expect(svgs.map(n => n.props.key)).toEqual(['ci-cloud', 'ci-api'])
  expect(svgs[0].props.source).toContain(`<path d="${GLYPH_PATHS.cloud}"/>`)
  expect(svgs[1].props.source).toContain(`<path d="${GLYPH_PATHS.coin}"/>`)
  svgs.forEach(n => expect(n.props.alt).toMatch(/: (ok|low|out|unknown)$/))
  all.find(n => n.type === 'Button').props.onPress()
  expect(pressed).toBe(1)
})

test('credit colours follow state: ok green, low amber, out red; the API icon goes red from a credit outage in an API pane', () => {
  const ok = creditIcons([cloudRow('2026-11-30', 1, NOW), apiRow({ measured: { usd: 3.4, messages: 34 }, limit: 200 })], noOut)
  expect(ok.map(i => [i.state, i.hex])).toEqual([['ok', LEVEL_COLOR.green], ['ok', LEVEL_COLOR.green]])
  const low = creditIcons([apiRow({ measured: { usd: 190, messages: 900 }, limit: 200 })], noOut)
  expect(low.find(i => i.id === 'api')!.state).toBe('low')
  expect(low.find(i => i.id === 'api')!.hex).toBe(LEVEL_COLOR.amber)
  const out = outageOf(['Error: credit balance is too low'], { state: 'idle' } as any)
  expect(out?.id).toBe('credit')
  const red = creditIcons([apiRow({ measured: { usd: 3.4, messages: 34 }, limit: 200 })], [{ kind: 'api', outage: out }])
  expect(red.find(i => i.id === 'api')!.state).toBe('out')
  expect(red.find(i => i.id === 'api')!.hex).toBe(LEVEL_COLOR.red)
  // The cloud icon is untouched by an API outage.
  expect(red.find(i => i.id === 'cloud')!.state).toBe('unknown')
})

test('an unknown reading is a grey icon with the alt "unknown", present, never hidden; no number is invented', () => {
  const icons = creditIcons([], noOut)
  expect(icons.map(i => i.id)).toEqual(['cloud', 'api'])
  for (const i of icons) {
    expect(i.state).toBe('unknown')
    expect(i.hex).toBe(LEVEL_COLOR.grey)
    expect(i.tip).toMatch(/: unknown$/)
    expect(i.tip).not.toMatch(/\d/)
  }
  expect(stateOfRow(undefined)).toBe('unknown')
  const nodes = walk(creditNodes(kit, icons, () => undefined)).filter(n => n.type === 'Svg')
  expect(nodes).toHaveLength(2)
  nodes.forEach(n => expect(n.props.alt).toContain('unknown'))
})

test('the API tooltip can carry a configured provider label; the default wording names no provider', () => {
  expect(creditIcons([], noOut).find(i => i.id === 'api')!.tip).toBe('API credit: unknown')
  expect(creditIcons([], noOut, 'Provider X credit').find(i => i.id === 'api')!.tip).toBe('Provider X credit: unknown')
})

test('fit at 360, 420 and 520 px: the strip plus the credit group never exceeds the row, Claude is kept; the bottom row has room for the icons', () => {
  const rows = [claudeRow({ ctx: { percent: 20, tokens: 1, window: 2 }, windows: claudeWindows([], emptyCache, NOW), cost: null, nowMs: NOW }), apiRow({ measured: { usd: 3.4, messages: 34 }, limit: 200 }), cloudRow('2026-11-30', 1, NOW)]
  const creditPx = 2 * BAND_ICON_CELL + 32
  for (const w of [360, 420, 520]) {
    const strip = stripOf(rows, w - 16 - creditPx)
    const px = strip.groups.reduce((s, g) => s + groupPx(g), 0) + Math.max(0, strip.groups.length - 1) * 12
    expect(px + creditPx).toBeLessThanOrEqual(w - 16)
    expect(strip.groups.some(g => g.id === 'claude')).toBe(true)
  }
  // Four system icons and the press glyph fit beside the crew count even at the narrowest width.
  expect(4 * BAND_ICON_CELL + 32).toBeLessThanOrEqual(360 / 3)
  expect(SRC).toContain('px - 16 - (2 * BAND_ICON_CELL + 32)')
})
