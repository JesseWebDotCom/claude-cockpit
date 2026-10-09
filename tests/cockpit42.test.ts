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
import { bandPx, creditLayout, creditsSvg, progressSvg, statusSvg, CREDIT_H } from '../hooks/look.ts'
import type { LookStatus } from '../hooks/look.ts'
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
  test(`row 1 at ${cols} columns: the short description then the bar, no "Main status", no text after the bar`, () => {
    const svg = progressSvg(W, { ...PROG, title: 'Account settings' })
    const t = texts(svg)
    expect(t.length).toBe(1)
    expect(t[0]).toBe('Account settings')
    expect(/Main status|milestone/i.test(svg)).toBe(false)
    expect(svg.lastIndexOf('<text') < svg.indexOf('class="k"')).toBe(true)
    // the bar reaches the right edge: the track ends at W minus the gap and nothing follows it
    const track = /<rect class="k" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/.exec(svg)!
    expect(Math.abs(Number(track[1]) + Number(track[2]) - (W - 8)) < 1.5).toBe(true)
  })

  for (const [label, input] of [['with data', base], ['no data', NONE]] as const) {
    test(`row 2 at ${cols} columns (${label}): three flush left, Codex at the right edge, cloud "?", fits`, () => {
      const rows = serviceRows(input)
      const lay = creditLayout(W, rows)
      expect(lay.places.map(p => p.seg.id)).toEqual(['claude', 'cloud', 'api', 'codex'])
      expect(lay.places[0]!.x).toBe(8)
      for (let i = 1; i < 3; i++) expect(lay.places[i]!.x >= lay.places[i - 1]!.x + lay.places[i - 1]!.w).toBe(true)
      const last = lay.places[3]!
      expect(last.x + last.w).toBe(W - 8)
      expect(last.x >= lay.places[2]!.x + lay.places[2]!.w).toBe(true)
      const cloud = lay.places[1]!.seg
      expect(cloud.fig).toBe('?')
      expect(cloud.unknown).toBe(true)
      const svg = creditsSvg(W, rows)
      expect(/day|\d+d\b/.test(texts(svg).join(' '))).toBe(false)
      expect(texts(svg).filter(t => /\d/.test(t) && lay.places[1]!.seg.fig === t).length).toBe(0)
      expect(svg.includes('height="' + CREDIT_H + '"')).toBe(true)
    })
  }
}

test('narrow widths shorten the bars first and never drop a service or wrap', () => {
  const rows = serviceRows(base)
  expect(creditLayout(bandPx(200), rows).level).toBe(0)
  const narrow = creditLayout(240, rows)
  expect(narrow.level > 0).toBe(true)
  expect(narrow.places.length).toBe(4)
  const last = narrow.places[3]!
  expect(last.x + last.w).toBe(240 - 8)
  expect(narrow.places[2]!.x + narrow.places[2]!.w <= last.x).toBe(true)
})

test('the cloud shows no days, no expiry and no marker anywhere, whatever credits.json says', () => {
  const r = serviceRows(base).find(x => x.id === 'cloud')!
  expect(r.text).toBe('unknown')
  expect(r.when).toBe('')
  expect(r.left).toBe(null)
  expect(markerOf(r)).toBe('')
  expect(r.check).toBe(false)
  expect(serviceLine(r)).toBe('Claude cloud: unknown')
  const card: LookStatus = { title: 'Main status', ratio: 0.5, count: '1/2', note: '', now: '', next: '', you: '', youHex: '#F0A500', isAway: false, presenceText: 'Active', stale: '', phase: 0, main: { running: '', landed: '', report: '', notes: '' }, services: serviceRows(base) }
  const t = texts(statusSvg(420, card)).join('|')
  expect(/day|expires Nov 30|manual/.test(t.replace(/expires Nov 1\b/, ''))).toBe(false)
  expect(creditsLines(parseCredits('{"cloud":{"expires":"2026-11-30"}}'))[1]).toBe('Claude cloud credit unknown')
})

test('the bar draws the same glyphs as the Main status card, built by the same call', () => {
  const ids = ['claude', 'cloud', 'api', 'codex'] as const
  const rows = serviceRows(base)
  const bar = creditsSvg(bandPx(140), rows)
  const card: LookStatus = { title: 'Main status', ratio: 0.5, count: '1/2', note: '', now: '', next: '', you: '', youHex: '#F0A500', isAway: false, presenceText: 'Active', stale: '', phase: 0, main: { running: '', landed: '', report: '', notes: '' }, services: rows }
  const cardSvg = statusSvg(420, card)
  for (const i of ids) {
    const p = '<path d="' + GLYPH_PATHS[SERVICE_GLYPH[i]] + '"/>'
    expect(bar.includes(p)).toBe(true)
    expect(cardSvg.includes(p)).toBe(true)
  }
  expect(glyphFragment('cloud', '#fff', 0, 0, 14).includes(GLYPH_PATHS.cloud)).toBe(true)
})

test('shortWork: the milestone, else the first active item without its id, else a plain line', () => {
  expect(shortWork('Account settings', ['X-1: other'])).toBe('Account settings')
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
