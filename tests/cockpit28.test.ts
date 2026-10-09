// COCKPIT-28 (cockpit 0.8.0): four health icons (CPU, memory, disk, GPU) in the status bar, the System card header and the card's gauge rows; the AUTOPILOT
// control shows its state by colour only; the Status card derives NOW from live claims; no user path in shipped code.

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { GLYPH_KINDS, GLYPH_PATHS, glyphDoc, glyphFragment } from '../hooks/glyphs.ts'
import { LEVEL_COLOR, emptyReading, gaugesOf, healthIcons, iconsLevel } from '../hooks/system.ts'
import { BAND_ICON_CELL, apiRow, claudeRow, codexRow, groupPx, stripOf, systemRow } from '../hooks/pools.ts'
import type { PoolRow } from '../hooks/pools.ts'
import { winOf } from '../hooks/limits.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'
import { autopilotAlt, autopilotSvg, autopilotPill } from '../hooks/autopilot.ts'
import { autopilotMark, graphOf, paneSvgTree, setReadingsForTest, setRootForTest, systemNodes } from '../hooks/register.tsx'
import { deriveLive } from '../hooks/statuslive.ts'
import type { LiveIn } from '../hooks/statuslive.ts'
import { parseStatus } from '../hooks/board.ts'
import { secHeadSvg } from '../hooks/sections.ts'

setRootForTest('/home/alex/projects/example-app')

const ROOT = resolve(import.meta.dir, '..')

const el = (type: string) => (p: any) => ({ type, props: p, children: p.children ?? [] })
const kit: any = { Box: el('Box'), Text: el('Text'), Button: el('Button'), Svg: el('Svg'), Input: el('Input') }
const walk = (n: any, out: any[] = []): any[] => {
  if (n && typeof n === 'object') {
    out.push(n)
    if (Array.isArray(n.children)) for (const c of n.children) walk(c, out)
  }
  return out
}
const $card: any = { ui: { invalidate: () => undefined, toast: () => undefined }, fs: { write: async () => undefined } }
const tree = (): any => paneSvgTree($card, kit, 100, undefined, 1_000_000, graphOf())
const byKey = (t: any, k: string): any => walk(t).find(n => n.props?.key === k)

const reading = (o: Record<string, number> = {}) => ({ ...emptyReading, memFree: 38, swapMB: 512, load1: 3.1, cores: 10, diskFree: 52, ...o })
const gpuHost = (usedMB = 5120) => ({ name: 'host-a', answered: true, mem: { totalMB: 31890, availMB: 11000, freePct: 37, swapUsedMB: 0 }, gpu: { usedMB, totalMB: 24576, util: 37 } })

// ---------------------------------------------------------------- the icons and their levels

test('the four icons: CPU, memory, disk, then GPU only when a listed host reports one', () => {
  const three = healthIcons(reading(), [])
  expect(three.map(i => i.kind)).toEqual(['cpu', 'memory', 'disk'])
  const four = healthIcons(reading(), [gpuHost()])
  expect(four.map(i => i.kind)).toEqual(['cpu', 'memory', 'disk', 'gpu'])
  // A host that answered without a GPU reading adds no GPU icon.
  expect(healthIcons(reading(), [{ ...gpuHost(), gpu: null }]).map(i => i.kind)).toEqual(['cpu', 'memory', 'disk'])
})

test('each icon takes its colour from the level of its own gauge (the same level the card draws)', () => {
  for (const [r, hosts] of [
    [reading(), []],
    [reading({ memFree: 4, load1: 14, diskFree: 3 }), [gpuHost(23000)]],
    [reading({ memFree: 20, load1: 8, diskFree: 9 }), [gpuHost(20000)]],
  ] as const) {
    const gauges = gaugesOf(r as any, hosts as any)
    const icons = healthIcons(r as any, hosts as any)
    for (const ic of icons) {
      const own = gauges.filter(g => g.kind === ic.kind && (ic.kind === 'gpu' ? g.isGpu === true : g.host === undefined))
      expect(own.length).toBeGreaterThan(0)
      expect(ic.level).toBe(own.map(g => g.level).sort((a, b) => ['green', 'amber', 'red', 'grey'].indexOf(b) - ['green', 'amber', 'red', 'grey'].indexOf(a)).includes('red') ? 'red' : own.some(g => g.level === 'amber') ? 'amber' : own[0]!.level)
      expect(ic.hex).toBe(LEVEL_COLOR[ic.level])
    }
  }
  const bad = healthIcons(reading({ memFree: 4 }), [])
  expect(bad.find(i => i.kind === 'memory')!.level).toBe('red')
  expect(bad.find(i => i.kind === 'cpu')!.level).toBe('green')
  expect(iconsLevel(bad)).toBe('red')
})

test('nothing read yet: three grey icons, and the tooltip says what each is ("CPU load 3.1, healthy")', () => {
  const grey = healthIcons(emptyReading, [], false)
  expect(grey.map(i => i.level)).toEqual(['grey', 'grey', 'grey'])
  const icons = healthIcons(reading(), [])
  expect(icons[0]!.tip).toBe('CPU load 3.1, healthy')
  expect(icons[1]!.tip).toMatch(/^Memory 62% used, /)
})

// ---------------------------------------------------------------- one glyph definition

test('the glyphs have one definition: the bar, the card header and the gauge rows draw the identical path', () => {
  for (const k of GLYPH_KINDS) {
    const frag = glyphFragment(k, '#3FB950', 0, 0, 16)
    expect(frag).toContain(GLYPH_PATHS[k])
    expect(glyphDoc(k, '#3FB950', 20, 22, 16, 't')).toContain(GLYPH_PATHS[k])
  }
  const icons = healthIcons(reading(), [gpuHost()])
  const head = secHeadSvg(420, { title: 'System', summary: 'x', isOpen: false, icons, accent: '#3FB950' })
  for (const ic of icons) expect(head).toContain(glyphFragment(ic.kind, ic.hex, 0, 0, 16).replace(/translate\([^)]*\) scale\([^)]*\)/, '').slice(0, 0) + GLYPH_PATHS[ic.kind])
  // Every glyph path is drawn once in the header and nothing but the glyph differs in the bar's icon.
  for (const ic of icons) expect(glyphDoc(ic.kind, ic.hex, BAND_ICON_CELL, 22, 16, ic.tip)).toContain(`<path d="${GLYPH_PATHS[ic.kind]}"/>`)
  for (const ic of icons) expect(head).toContain(`<path d="${GLYPH_PATHS[ic.kind]}"/>`)
})

test('the System card: closed, the header holds a coloured text summary (COCKPIT-46, no icons); open, each gauge row has its icon instead of a text label', () => {
  setReadingsForTest({ at: 1, reading: reading(), hosts: [gpuHost()], hostsAt: 1 }, { at: 1, services: [], credits: null })
  const t = tree()
  const head = String(byKey(t, 'svg-cs-system').props.source)
  for (const k of GLYPH_KINDS) expect(head).not.toContain(`<path d="${GLYPH_PATHS[k]}"/>`)
  expect(head).toContain('MEM 62%')
  expect(head).toContain('<tspan class="')
  byKey(t, 'cs-system').props.onPress()
  const open = tree()
  const res = String(byKey(open, 'svg-sys-res').props.source)
  for (const k of GLYPH_KINDS) expect(res).toContain(`<path d="${GLYPH_PATHS[k]}"/>`)
  expect(res).toContain('62% used')
  byKey(open, 'cs-system').props.onPress()
})

// ---------------------------------------------------------------- the band

const RNOW = Date.parse('2026-10-08T22:00:00Z')
const rowsFor = (icons: ReturnType<typeof healthIcons>): PoolRow[] => [
  systemRow({ dots: [], summary: '', card: ['System: ok'], icons }),
  claudeRow({ ctx: { percent: 20, tokens: 40000, window: 200000 }, windows: claudeWindows([{ kind: 'five_hour', percentUsed: 20, resetsAt: new Date(RNOW + 2 * 3_600_000).toISOString() }, { kind: 'seven_day', percentUsed: 60, resetsAt: new Date(RNOW + 3 * 86_400_000).toISOString() }], emptyCache, RNOW), cost: null, nowMs: RNOW }),
  codexRow({ id: 'codex', name: 'Codex', five: winOf('5h', 52, RNOW + 2 * 3_600_000), week: winOf('week', 80, RNOW + 3 * 86_400_000) }, RNOW),
  apiRow({ measured: { usd: 3.4, messages: 34 }, limit: 200 }),
]

test('the band: the System group is the icons alone (no expand glyph); no "System" label and no LED dot', () => {
  const icons = healthIcons(reading(), [gpuHost()])
  const nodes = systemNodes(kit, icons) as any[]
  const box = walk(nodes[0])
  expect(box.filter(n => n.type === 'Svg').map(n => n.props.key)).toEqual(['hi-cpu', 'hi-memory', 'hi-disk', 'hi-gpu'])
  const svgs = box.filter(n => n.type === 'Svg')
  svgs.forEach((n, i) => {
    expect(n.props.alt).toBe(icons[i]!.tip)
    expect(n.props.source).toContain(`<path d="${GLYPH_PATHS[icons[i]!.kind]}"/>`)
    expect(n.props.source).toContain(`stroke="${icons[i]!.hex}"`)
    expect(n.props.source).not.toMatch(/<text/)
  })
  expect(box.filter(n => n.type === 'Button')).toEqual([])
  expect(JSON.stringify(nodes[0])).not.toContain('System')
  // The strip no longer carries a System group at all (COCKPIT-32: the icons live on the bottom row).
  expect(stripOf(rowsFor(icons), 520).groups.map(g => g.id)).not.toContain('system')
})

test('the band: the GPU icon is absent when there is no GPU reading', () => {
  const nodes = systemNodes(kit, healthIcons(reading(), [])) as any[]
  expect(walk(nodes[0]).filter(n => n.type === 'Svg').map(n => n.props.key)).toEqual(['hi-cpu', 'hi-memory', 'hi-disk'])
})

test('the band fits at 360, 420 and 520 px: the strip never wider than the room, Claude never dropped, the System icons a fixed width', () => {
  for (const w of [360, 420, 520]) {
    const strip = stripOf(rowsFor(healthIcons(reading(), [gpuHost()])), w - 16)
    const px = strip.groups.reduce((s, g) => s + groupPx(g), 0) + Math.max(0, strip.groups.length - 1) * 12
    expect(px).toBeLessThanOrEqual(w - 16)
    expect(strip.groups.some(g => g.id === 'claude')).toBe(true)
  }
  // Four icons and one press glyph take 4 cells each plus the glyph.
  expect(4 * BAND_ICON_CELL + 32).toBeLessThan(110)
})

// ---------------------------------------------------------------- AUTOPILOT

test('AWAY shows its state by colour only: no "off", no "on", no chip, in the band and the pane', () => {
  expect(autopilotPill(false)).toEqual({ color: 'gray', bold: true, text: 'AWAY' })
  expect(autopilotPill(true)).toEqual({ color: 'green', bold: true, text: 'AWAY' })
  const off = autopilotSvg(false)
  const on = autopilotSvg(true)
  expect(off).toContain('#8B949E')
  expect(on).toContain('#3FB950')
  for (const s of [off, on]) expect(s).not.toMatch(/>[^<]*\b(off|on|OFF|ON)\b[^<]*</)
  expect(autopilotAlt(false)).toBe('Away off')
  expect(autopilotAlt(true)).toBe('Away on')
  const mark: any = autopilotMark(kit, 'k', false, true)
  expect(mark.type).toBe('Svg')
  expect(mark.props.alt).toBe('Away off')
  const plain: any = autopilotMark(kit, 'k', true, false)
  expect(plain.props).toMatchObject({ color: 'green', children: ['AWAY'] })
})

test('the pane button row has no "OFF" text; the state toggles between the grey and the green drawing', () => {
  const t = tree()
  const row = byKey(t, 'button-row')
  const text = JSON.stringify(row).replace(/"alt":"[^"]*"/g, '')
  expect(text).not.toMatch(/\bOFF\b|\bON\b|[" ]off[" ]/)
  const mark = byKey(t, 'autopilot-state')
  expect(mark.props.alt).toBe('Away off')
})

test('no hooks source writes "AWAY off" or " OFF " as text of the control', () => {
  const src = readFileSync(resolve(ROOT, 'hooks/register.tsx'), 'utf8')
  expect(src).not.toMatch(/autopilotChip/)
  expect(src).not.toMatch(/' OFF '|' ON '/)
})

// ---------------------------------------------------------------- the Status card heals itself

const NOW = Date.parse('2026-10-09T13:00:00Z')
const MIN = 60_000
const HOUR = 60 * MIN
const status = (ageMs: number) => parseStatus(JSON.stringify({ updated: new Date(NOW - ageMs).toISOString(), milestone: 'M', done: 1, total: 4, now: [], next: ['A-01: later'], you: ['a thing'] }))
const live = (o: Partial<LiveIn>): LiveIn => ({ status: status(2 * HOUR), members: [], claims: [], reports: [], landed: [], nowMs: NOW, ...o })

test('status.json 2 h old and a live claim: NOW is the claim title and lane, no stale badge; NEXT and YOU stay from the file', () => {
  const d = deriveLive(live({ claims: [{ id: 'COCKPIT-28', mtimeMs: NOW - 20 * MIN, lane: 'opencode-2', title: 'Status bar health icons' }] }))
  expect(d.nowSource).toBe('live')
  expect(d.now).toEqual(['COCKPIT-28: Status bar health icons (opencode-2)'])
  expect(d.stale).toBe('')
  expect(d.next).toEqual(['A-01: later'])
})

test('status.json 2 h old and a working lane: NOW is the lane, no stale badge', () => {
  const d = deriveLive(live({ members: [{ name: 'codex-a', awake: true, label: 'GENUI-14: next block', lockItem: '', lockMtimeMs: null, sinceMs: 5 * MIN }] }))
  expect(d.now).toEqual(['GENUI-14: next block (codex-a)'])
  expect(d.stale).toBe('')
})

test('status.json 2 h old and nothing live: the stale badge shows', () => {
  const d = deriveLive(live({}))
  expect(d.now).toEqual([])
  expect(d.stale).toBe('updated 2h ago')
})

// ---------------------------------------------------------------- no user path or project name in shipped code

test('hooks/ holds no user path, user name or project name', () => {
  const dir = resolve(ROOT, 'hooks')
  for (const f of readdirSync(dir).filter(n => /\.(ts|tsx|json)$/.test(n))) {
    const text = readFileSync(resolve(dir, f), 'utf8')
    for (const bad of ['alex', 'example-app', '/Users/']) if (text.includes(bad)) throw new Error(f + ' holds ' + JSON.stringify(bad))
  }
})
