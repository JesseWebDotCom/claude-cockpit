// COCKPIT-34: no expand dots on the status bar, the old System block gone (pane and band), generic services from the config, and the Flight log and
// Black box headers pinned in view at the pane bottom whenever they are collapsed.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { creditIcons } from '../hooks/credit.ts'
import { healthIcons, emptyReading } from '../hooks/system.ts'
import { parseExtras, serviceCommand, serviceFrom, serviceRunMs } from '../hooks/hosts.ts'
import { creditNodes, graphOf, paneSvgTree, setReadingsForTest, systemNodes } from '../hooks/register.tsx'

const SRC = readFileSync(resolve(import.meta.dir, '../hooks/register.tsx'), 'utf8')
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
// Columns for a pixel width (the pane draws at cols * 8 - 8 px) and rows for a pixel height (20 px a row).
const colsFor = (px: number): number => Math.ceil((px + 8) / 8)
const tree = (px: number, heightPx?: number): any => paneSvgTree($, kit, colsFor(px), heightPx === undefined ? undefined : Math.floor(heightPx / 20), 1_000_000, graphOf(), [], [])
const topKeys = (t: any): string[] => (t.children as any[]).map(c => String(c.props?.key ?? ''))
const keysOf = (t: any): string[] => walk(t).map(n => n.props?.key).filter((k): k is string => typeof k === 'string')
const press = (px: number, key: string, heightPx?: number): void => {
  // Pressed from the unwindowed page: an open card's header can be scrolled out of view of a short pane.
  void heightPx
  walk(tree(px)).find(n => n.props?.key === key).props.onPress()
}

// ---------------------------------------------------------------- 1. no expand dots

test('the status bar draws no expand control: the system icons and the credit icons are Svgs only, no Button', () => {
  const sys = walk(systemNodes(kit, healthIcons({ ...emptyReading, memFree: 38, cores: 10, diskFree: 52 } as any, [])))
  const credit = walk(creditNodes(kit, creditIcons([], [{ kind: 'claude', outage: null }])))
  for (const nodes of [sys, credit]) {
    expect(nodes.filter(n => n.type === 'Button')).toEqual([])
    expect(JSON.stringify(nodes)).not.toMatch(/▸|▾/)
  }
  expect(SRC).not.toContain("'band-sys'")
  expect(SRC).not.toContain("'band-credit'")
})

// ---------------------------------------------------------------- 2. the old block is gone

test('the old System block (System, Claude, Codex, API, Cloud with bars) is gone from the pane and the band', () => {
  expect(SRC).not.toContain('limitsSvg(W')
  expect(SRC).not.toContain('stripGroupNodes')
  expect(SRC).not.toContain('openMeter')
  expect(SRC).not.toContain("'meter-'")
  for (const [px, h] of [[360, 600], [420, 600], [520, 600], [420, undefined]] as const) {
    const keys = keysOf(tree(px, h))
    expect(keys).not.toContain('svg-limits')
    expect(keys.filter(k => k.startsWith('meter-'))).toEqual([])
  }
})

test('what only the old block showed (API spend, cloud credit days) is a line of the System card Health and limits section', () => {
  press(420, 'cs-system')
  const t = tree(420)
  expect(keysOf(t)).toContain('svg-health')
  const src = String(walk(t).find(n => n.props?.key === 'svg-health').props.source)
  expect(src).toContain('API')
  press(420, 'cs-system')
})

// ---------------------------------------------------------------- 3. services from the config

test('services come from the config: name, kind http | tcp | ssh-tunnel, target, timeout; the default is none', () => {
  expect(parseExtras({}).services).toEqual([])
  const w: string[] = []
  const x = parseExtras(
    {
      services: [
        { name: 'Web app', kind: 'http', target: 'http://localhost:3000/health' },
        { name: 'Queue', kind: 'tcp', target: 'localhost:5672', timeoutMs: 1500 },
        { name: 'Remote api', kind: 'ssh-tunnel', ssh: 'gpu-alias', target: 'http://127.0.0.1:9000/health', timeoutMs: 3000 },
      ],
    },
    w,
  )
  expect(x.services.map(s => [s.name, s.kind, s.target, s.timeoutMs, s.ssh])).toEqual([
    ['Web app', 'http', 'http://localhost:3000/health', 2000, ''],
    ['Queue', 'tcp', 'localhost:5672', 1500, ''],
    ['Remote api', 'ssh-tunnel', 'http://127.0.0.1:9000/health', 3000, 'gpu-alias'],
  ])
  expect(w).toEqual([])
  // An ssh-tunnel without an ssh alias, a tcp target that is not host:port and a bad kind are refused with a warning, not guessed.
  const bad: string[] = []
  expect(parseExtras({ services: [{ name: 'a', kind: 'ssh-tunnel', target: 'http://x' }, { name: 'b', kind: 'tcp', target: 'nohost' }, { name: 'c', kind: 'carrier-pigeon', target: 'http://x' }] }, bad).services).toEqual([])
  expect(bad.length).toBeGreaterThan(0)
})

test('each kind has its own read-only probe, bounded by its timeout', () => {
  const base = { name: 'n', timeoutMs: 2500, ssh: '' }
  expect(serviceCommand({ ...base, kind: 'http', target: 'http://localhost:3000/health' })[0]).toBe('curl')
  expect(serviceCommand({ ...base, kind: 'tcp', target: 'localhost:5672' })[0]).toBe('nc')
  const tun = serviceCommand({ ...base, kind: 'ssh-tunnel', ssh: 'gpu-alias', target: 'http://127.0.0.1:9000/health' })
  expect(tun[0]).toBe('ssh')
  expect(tun).toContain('BatchMode=yes')
  expect(serviceRunMs({ ...base, kind: 'http', target: 'http://x' })).toBeGreaterThanOrEqual(2500)
  expect(serviceRunMs({ ...base, kind: 'ssh-tunnel', ssh: 'a', target: 'http://x' })).toBeGreaterThan(serviceRunMs({ ...base, kind: 'http', target: 'http://x' }))
})

const sysWith = () => ({ at: 1, reading: { ...emptyReading, memFree: 38, swapMB: 512, load1: 3.1, cores: 10, diskFree: 52 }, hosts: [], hostsAt: 1 })
const spec = (name: string, target: string) => ({ name, kind: 'http' as const, target, timeoutMs: 2000, ssh: '' })

test('the Services rows: none configured shows no service row; two configured show two; an unconfigured service is not shown', () => {
  setReadingsForTest(sysWith(), { at: 1, services: [], credits: null })
  press(420, 'cs-system')
  const none = String(walk(tree(420)).find(n => n.props?.key === 'svg-health').props.source)
  expect(none).not.toContain('Web app')
  press(420, 'cs-system')
  setReadingsForTest(sysWith(), { at: 1, services: [serviceFrom(spec('Web app', 'http://localhost:3000/health'), '200 0.0421'), serviceFrom(spec('Queue', 'http://localhost:4000'), '000 0')], credits: null })
  press(420, 'cs-system')
  const svc = String(walk(tree(420)).find(n => n.props?.key === 'svg-health').props.source)
  expect(svc).toContain('Web app')
  expect(svc).toContain('Queue')
  expect(svc).not.toContain('Unlisted')
  press(420, 'cs-system')
  setReadingsForTest({ at: 0, reading: emptyReading, hosts: [], hostsAt: -Infinity }, { at: 0, services: [], credits: null })
})

// ---------------------------------------------------------------- 4 and 5. the Flight log and Black box stay in view

const open = (key: string, px = 420): boolean => walk(tree(px)).find(n => n.props?.key === key)?.props.label?.startsWith('\u25be') === true
const hasFlight = (t: any): boolean => keysOf(t).includes('svg-flight')

test('the System card, Flight log and Black box are pinned at the bottom at 360, 420 and 520 px wide and 600 px high, the System card closed and open', () => {
  for (const px of [360, 420, 520]) {
    for (const systemOpen of [false, true]) {
      if (systemOpen) press(px, 'cs-system', 600)
      const t = tree(px, 600)
      const keys = keysOf(t)
      expect(keys).toContain('svg-flight')
      expect(keys).toContain('cs-blackbox')
      const top = topKeys(t)
      const iFlight = keys.indexOf('svg-flight')
      const iBox = keys.indexOf('cs-blackbox')
      expect(iFlight).toBeLessThan(iBox)
      // Nothing scrolling follows the pinned cards.
      expect(keys.indexOf('cs-blackbox')).toBeGreaterThan(keys.indexOf('svg-flight'))
      if (!systemOpen) expect(keys.indexOf('cs-system')).toBeLessThan(iFlight)
      if (systemOpen) press(px, 'cs-system', 600)
    }
  }
})

test('a short pane (10 to 40 rows): the collapsed Flight log and Black box header still show', () => {
  for (const rows of [10, 18, 24, 30, 40]) {
    const keys = keysOf(paneSvgTree($, kit, colsFor(420), rows, 1_000_000, graphOf(), [], []))
    expect(keys).toContain('svg-flight')
    expect(keys).toContain('cs-blackbox')
    expect(keys).toContain('cs-system')
  }
})

test('an open Black box is not pinned, and the Flight log never moves below it', () => {
  press(420, 'cs-blackbox', 600)
  expect(open('cs-blackbox')).toBe(true)
  const keys = keysOf(tree(420, 600))
  if (keys.includes('svg-flight')) expect(keys.indexOf('svg-flight')).toBeLessThan(keys.indexOf('cs-blackbox'))
  press(420, 'cs-blackbox', 600)
  expect(open('cs-blackbox')).toBe(false)
})
