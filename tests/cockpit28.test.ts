// Four health icons (CPU, memory, disk, GPU) in the status bar and in the open System card's gauge rows; the AUTOPILOT control shows its state by colour
// only; the Status card builds NOW from live claims as "ITEM: title (lane)".

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { GLYPH_KINDS, GLYPH_PATHS, glyphDoc, glyphFragment } from '../hooks/glyphs.ts'
import { LEVEL_COLOR, emptyReading, gaugesOf, healthIcons, iconsLevel } from '../hooks/system.ts'
import { BAND_ICON_CELL, apiRow, claudeRow, codexRow, groupPx, stripOf, systemRow } from '../hooks/pools.ts'
import type { PoolRow } from '../hooks/pools.ts'
import { winOf } from '../hooks/limits.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'
import { autopilotAlt, autopilotPill, autopilotSvg } from '../hooks/autopilot.ts'
import { autopilotMark, graphOf, paneSvgTree, setReadingsForTest, systemNodes, useProject } from '../hooks/register.tsx'
import { deriveLive } from '../hooks/statuslive.ts'
import type { LiveIn } from '../hooks/statuslive.ts'
import { parseStatus } from '../hooks/board.ts'
import { plainBandText } from '../hooks/ui.ts'

useProject('/home/user/project')

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
const tree = (): any => paneSvgTree($card, kit, 100, undefined, 1_000_000, graphOf(), [], [])
const byKey = (t: any, k: string): any => walk(t).find(n => n.props?.key === k)

const reading = (o: Record<string, number> = {}) => ({ ...emptyReading, memFree: 38, swapMB: 512, load1: 3.1, cores: 10, diskFree: 52, ...o })
const gpuHost = (usedMB = 5120) => ({ name: 'host-a', answered: true, mem: { totalMB: 31890, availMB: 11000, freePct: 37, swapUsedMB: 0 }, gpu: { usedMB, totalMB: 24576, util: 37 } })

// ---------------------------------------------------------------- the icons and their levels

test('the four icons: CPU, memory, disk, then GPU only when a listed host reports one', () => {
  expect(healthIcons(reading(), []).map(i => i.kind)).toEqual(['cpu', 'memory', 'disk'])
  expect(healthIcons(reading(), [gpuHost()]).map(i => i.kind)).toEqual(['cpu', 'memory', 'disk', 'gpu'])
  // A host that answered without a GPU reading adds no GPU icon.
  expect(healthIcons(reading(), [{ ...gpuHost(), gpu: null }]).map(i => i.kind)).toEqual(['cpu', 'memory', 'disk'])
})

test('each icon takes the colour of the level of its own gauge (the level the card draws)', () => {
  const bad = healthIcons(reading({ memFree: 4 }), [])
  expect(bad.find(i => i.kind === 'memory')!.level).toBe('red')
  expect(bad.find(i => i.kind === 'cpu')!.level).toBe('green')
  expect(iconsLevel(bad)).toBe('red')
  for (const [r, hosts] of [
    [reading(), []],
    [reading({ memFree: 4, load1: 14, diskFree: 3 }), [gpuHost(23000)]],
    [reading({ memFree: 20, load1: 8, diskFree: 9 }), [gpuHost(20000)]],
  ] as const) {
    const gauges = gaugesOf(r as any, hosts as any)
    for (const ic of healthIcons(r as any, hosts as any)) {
      const own = gauges.filter(g => g.kind === ic.kind && (ic.kind === 'gpu' ? g.isGpu === true : g.host === undefined))
      expect(own.length).toBeGreaterThan(0)
      const want = own.some(g => g.level === 'red') ? 'red' : own.some(g => g.level === 'amber') ? 'amber' : own[0]!.level
      expect(ic.level).toBe(want)
      expect(ic.hex).toBe(LEVEL_COLOR[ic.level])
    }
  }
})

test('nothing read yet: three grey icons; the tooltip says what each is ("CPU load 3.1, healthy")', () => {
  expect(healthIcons(emptyReading, [], false).map(i => i.level)).toEqual(['grey', 'grey', 'grey'])
  const icons = healthIcons(reading(), [])
  expect(icons[0]!.tip).toBe('CPU load 3.1, healthy')
  expect(icons[1]!.tip).toMatch(/^Memory 62% used, /)
})

// ---------------------------------------------------------------- one glyph definition

test('the glyphs have one definition: the bar and the open card draw the identical path', () => {
  for (const k of GLYPH_KINDS) {
    expect(glyphFragment(k, '#3FB950', 0, 0, 16)).toContain(GLYPH_PATHS[k])
    expect(glyphDoc(k, '#3FB950', 20, 22, 16, 't')).toContain(`<path d="${GLYPH_PATHS[k]}"/>`)
  }
})

test('the open System card: each gauge row has its icon and short figure in place of the text label; the full label is the icon tooltip', () => {
  useProject('/home/user/project')
  setReadingsForTest({ at: 1, reading: reading(), hosts: [gpuHost()], hostsAt: 1 }, { at: 1, services: [], credits: null })
  byKey(tree(), 'cs-system').props.onPress()
  const t = tree()
  const sys = String(byKey(t, 'svg-system').props.source)
  for (const k of GLYPH_KINDS) expect(sys).toContain(`<path d="${GLYPH_PATHS[k]}"/>`)
  expect(sys).toContain('<title>Memory 62% used</title>')
  expect(sys).toContain('>62% used<')
  expect(sys).toContain('>load 3.1<')
  byKey(t, 'cs-system').props.onPress()
})

// ---------------------------------------------------------------- the band

const RNOW = Date.parse('2026-10-08T22:00:00Z')
const rowsFor = (icons: ReturnType<typeof healthIcons>): PoolRow[] => [
  systemRow({ dots: [], summary: '', card: ['System: ok'], icons }),
  claudeRow({ ctx: { percent: 20, tokens: 40000, window: 200000 }, windows: claudeWindows([{ kind: 'five_hour', percentUsed: 20, resetsAt: new Date(RNOW + 2 * 3_600_000).toISOString() }, { kind: 'seven_day', percentUsed: 60, resetsAt: new Date(RNOW + 3 * 86_400_000).toISOString() }], emptyCache, RNOW), cost: null, nowMs: RNOW }),
  codexRow({ id: 'codex', name: 'Codex', five: winOf('5h', 52, RNOW + 2 * 3_600_000), week: winOf('week', 80, RNOW + 3 * 86_400_000) }, RNOW),
  apiRow({ measured: { usd: 3.4, messages: 34 }, limit: 200 }),
]
const press = { system: () => undefined, meter: () => undefined }

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

test('AUTOPILOT shows its state by colour only: no "off", no "on", no chip, in the band and the pane', () => {
  expect(autopilotPill(false)).toEqual({ color: 'gray', bold: true, text: 'AUTOPILOT' })
  expect(autopilotPill(true)).toEqual({ color: 'green', bold: true, text: 'AUTOPILOT' })
  const off = autopilotSvg(false)
  const on = autopilotSvg(true)
  expect(off).toContain('#8B949E')
  expect(on).toContain('#3FB950')
  for (const s of [off, on]) expect(s).not.toMatch(/>[^<]*\b(off|on|OFF|ON)\b[^<]*</)
  expect(autopilotAlt(false)).toBe('Autopilot off')
  expect(autopilotAlt(true)).toBe('Autopilot on')
  const mark: any = autopilotMark(kit, 'k', false, true)
  expect(mark.type).toBe('Svg')
  expect(mark.props.alt).toBe('Autopilot off')
  const plain: any = autopilotMark(kit, 'k', true, false)
  expect(plain.props).toMatchObject({ color: 'green', children: ['AUTOPILOT'] })
})

test('the pane button row has no "OFF" text; its mark is the drawing with the "Autopilot off" label', () => {
  const t = tree()
  const text = JSON.stringify(byKey(t, 'button-row')).replace(/"alt":"[^"]*"/g, '')
  expect(text).not.toMatch(/\bOFF\b|\bON\b|[" ]off[" ]/)
  expect(byKey(t, 'autopilot-state').props.alt).toBe('Autopilot off')
})

test('the plain last-resort line names AUTOPILOT only while it is on, never "off"', () => {
  expect(plainBandText({ working: 2, idle: 5, total: 7, isAway: false, needLook: 0 })).not.toMatch(/AUTOPILOT|off/i)
  expect(plainBandText({ working: 2, idle: 5, total: 7, isAway: true, needLook: 0 })).toContain('AUTOPILOT')
})

test('no hooks source writes an OFF chip or an "ON" / "OFF" label for the control', () => {
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

test('status.json 2 h old and a live claim: NOW is "ITEM: title (lane)", no stale badge; NEXT and YOU stay from the file', () => {
  const d = deriveLive(live({ claims: [{ id: 'FEAT-28', mtimeMs: NOW - 20 * MIN, lane: 'worker-2', title: 'Status bar health icons' }] }))
  expect(d.nowSource).toBe('live')
  expect(d.now).toEqual(['FEAT-28: Status bar health icons (worker-2)'])
  expect(d.stale).toBe('')
  expect(d.next).toEqual(['A-01: later'])
})

test('a claim with no title reads "ITEM (lane, claimed N ago)"', () => {
  const d = deriveLive(live({ claims: [{ id: 'FEAT-29', mtimeMs: NOW - 20 * MIN, lane: 'worker-2' }] }))
  expect(d.now[0]).toMatch(/^FEAT-29 \(worker-2, claimed /)
})

test('status.json 2 h old and nothing live: the stale badge shows', () => {
  const d = deriveLive(live({}))
  expect(d.now).toEqual([])
  expect(d.stale).toBe('updated 2h ago')
})
