// COCKPIT-42: the bar above the input box: row 1 is the short description and the bar alone; row 2 has Claude plan, cloud and API flush left, Codex
// right-aligned, the cloud always "?"; the icons are the Main status card's own.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from './pure.ts'
import { serviceRows, serviceLine, markerOf } from '../hooks/services.ts'
import type { ServicesIn } from '../hooks/services.ts'
import { codexPool, parseCreditsFile } from '../hooks/limits.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'
import { GLYPH_PATHS, SERVICE_GLYPH, glyphFragment } from '../hooks/glyphs.ts'
import { bandPx, creditsSvg, progressSvg, statusSvg } from '../hooks/look.ts'
import { subSvg } from '../hooks/sections.ts'
import type { LookStatus } from '../hooks/look.ts'
import { textWidth } from '../hooks/draw.ts'
import { shortWork } from '../hooks/register.tsx'
import { creditsLines, parseCredits } from '../hooks/board.ts'

const NOW = Date.parse('2026-10-09T15:00:00Z')
const CREDITS = parseCreditsFile('{"opencode":{"total":200,"left":105.08,"expires":"2026-11-01","source":"console 2026-10-09"},"cloud":{"expires":"2026-11-30"}}')
const w = claudeWindows([{ kind: 'five_hour', percentUsed: 20, resetsAt: '2026-10-09T20:00:00Z' }, { kind: 'seven_day', percentUsed: 40, resetsAt: '2026-10-12T17:00:00Z' }], emptyCache, NOW)
const base: ServicesIn = { nowMs: NOW, claude: { five: w.five, week: w.week }, codex: codexPool(null, NOW, null), codexAtMs: null, credits: CREDITS, creditsAtMs: NOW, apiSpendSince: { usd: 5, atMs: NOW }, rows: [], outages: [], localUp: true }
const NONE: ServicesIn = { ...base, claude: null, credits: null, creditsAtMs: null, apiSpendSince: null, localUp: null }
const PROG = { ratio: 0.9, count: '9/10', now: '', isWorking: false, grewFrom: null }
const texts = (svg: string): string[] => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1] ?? '')

for (const cols of [80, 100, 140, 200]) {
  const W = bandPx(cols)
  test(`row 1 at ${cols} columns: the bar, then the short description, then the done count flush against it`, () => {
    const svg = progressSvg(W, { ...PROG, title: 'Remote Stack pairing' })
    expect(/<text[^>]*>Remote Stack pairing<\/text><text[^>]*>9\/10<\/text>/.test(svg)).toBe(true)
    expect(svg.includes('<tspan')).toBe(false)
    expect(/Main status|milestone/i.test(svg)).toBe(false)
    expect(svg.indexOf('class="k"') < svg.indexOf('<text')).toBe(true)
    // the bar starts at the left edge and the text starts after it
    const track = /<rect class="k" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/.exec(svg)!
    const tx = Number(/<text[^>]* x="([\d.]+)"/.exec(svg)![1])
    expect(tx > Number(track[1]) + Number(track[2])).toBe(true)
    expect(tx + textWidth('Remote Stack pairing 9/10', 18) <= W + 2).toBe(true)
  })
}

// COCKPIT-46 replaced the row 2 layout tests (tests/cockpit46.test.ts).
test('the cloud shows no days, no expiry and no marker anywhere, whatever credits.json says', () => {
  const r = serviceRows(base).find(x => x.id === 'cloud')!
  expect(r.text).toBe('unknown')
  expect(r.when).toBe('')
  expect(r.left).toBe(null)
  expect(markerOf(r)).toBe('')
  expect(r.check).toBe(false)
  expect(serviceLine(r)).toBe('Claude cloud: unknown')
  const card: LookStatus = { title: 'Main status', ratio: 0.5, count: '1/2', note: '', now: '', next: '', you: '', youHex: '#F0A500', isAway: false, presenceText: 'Active', stale: '', phase: 0, main: { running: '', landed: '', report: '', notes: '' } }
  void card
  const t = texts(subSvg(420, { title: 'Plan limits', services: serviceRows(base) }, true)).join('|')
  expect(/day|expires Nov 30|manual/.test(t.replace(/expires Nov 1\b/, ''))).toBe(false)
  expect(creditsLines(parseCredits('{"cloud":{"expires":"2026-11-30"}}'))[1]).toBe('Claude cloud credit unknown')
})

test('the bar draws the same glyphs as the System Plan limits section; the Main status card has none', () => {
  const ids = ['claude', 'cloud', 'api', 'codex'] as const
  const rows = serviceRows(base)
  const bar = creditsSvg(bandPx(140), rows)
  const card: LookStatus = { title: 'Main status', ratio: 0.5, count: '1/2', note: '', now: '', next: '', you: '', youHex: '#F0A500', isAway: false, presenceText: 'Active', stale: '', phase: 0, main: { running: '', landed: '', report: '', notes: '' } }
  const cardSvg = statusSvg(420, card)
  const plans = subSvg(420, { title: 'Plan limits', services: rows }, true)
  for (const i of ids) {
    const p = '<path d="' + GLYPH_PATHS[SERVICE_GLYPH[i]] + '"/>'
    expect(bar.includes(p)).toBe(true)
    expect(plans.includes(p)).toBe(true)
    expect(cardSvg.includes(p)).toBe(false)
  }
  expect(glyphFragment('cloud', '#fff', 0, 0, 14).includes(GLYPH_PATHS.cloud)).toBe(true)
})

test('shortWork: the milestone, else the first active item without its id, else a plain line', () => {
  expect(shortWork('Remote Stack pairing', ['X-1: other'])).toBe('Remote Stack pairing')
  expect(shortWork('', ['COCKPIT-42: bar fixes', 'Y'])).toBe('bar fixes')
  expect(shortWork('', ['COCKPIT-42'])).toBe('COCKPIT-42')
  expect(shortWork('', [])).toBe('No active work')
  expect(/Main status|milestone/i.test(shortWork('', []))).toBe(false)
})

test('COCKPIT-42 (changed by COCKPIT-44): the status row has no state dots; its right group sits at the right of row 1 and nothing lies between AUTOPILOT and the pane button', () => {
  const src = readFileSync(resolve(import.meta.dir, '../hooks/register.tsx'), 'utf8')
  expect(src).not.toContain("key: 'band-dots'")
  const i = src.indexOf("key: 'crew-band', flexDirection")
  expect(src.slice(i, i + 200)).toContain("justifyContent: 'space-between'")
  const j = src.indexOf("key: 'head-controls'")
  expect(src.slice(j, j + 200)).toContain('columnGap: 0')
})
