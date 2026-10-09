// COCKPIT-25 (cockpit 0.5.8): the open crew card says each fact once (no item id, no status word twice), "Powered by" carries the model, where it runs,
// the tool and the month's cost, and the card's rows never overlap at 360, 420 and 520 px. "restart lane" has a little space above it.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { memberDetail, packParts, poweredParts, stripItemId } from '../hooks/details.ts'
import type { MemberCardIn } from '../hooks/details.ts'
import { textWidth } from '../hooks/draw.ts'
import { ACTION_GAP_PX, actionGapSvg } from '../hooks/register.tsx'
import { BAR_MIN_W, DETAIL_H, rowHeight, rowSvg } from '../hooks/look.ts'
import type { LookRow } from '../hooks/look.ts'

const SRC = readFileSync(resolve(import.meta.dir, '..', 'hooks/register.tsx'), 'utf8')

const CARD: MemberCardIn = {
  name: 'opencode-2',
  kind: 'api',
  activity: 'working',
  powered: 'Claude API \u00b7 Sonnet 5.5',
  target: '',
  item: 'COCKPIT-24',
  doing: 'working',
  description: 'COCKPIT-24: space below the button row and the lower cards',
  lastReport: 'COCKPIT-24 report: done in code and installed',
  since: '4m',
  lockOwner: '',
  lockAge: '',
  context: '',
  limits: 'API: $183.47 this month \u00b7 OpenCode',
  blockedBy: [],
  errored: false,
  errorReason: '',
  out: false,
  back: '',
  isStale: false,
  isStuck: false,
  header: 'COCKPIT-24 \u00b7 working',
  cost: '$183.47 this month',
}

const text = (rows: { label: string; text: string }[]): string => rows.map(r => r.text).join('\n')

test('an open card never repeats the item id or the status word the header already carries', () => {
  const rows = memberDetail(CARD)
  expect(rows.some(r => r.label === 'Item')).toBe(false)
  expect(rows.some(r => r.label === 'Doing')).toBe(false)
  // The item id is in no row at all.
  expect(text(rows)).not.toContain('COCKPIT-24')
  expect(rows.find(r => r.label === 'Task')?.text).toBe('space below the button row and the')
  expect(text(rows)).not.toMatch(/\bworking\b/)
  // The labels are each shown once.
  const labels = rows.map(r => r.label).filter(l => l !== '')
  expect(new Set(labels).size).toBe(labels.length)
})

test('"Doing" shows only when it adds something: not the status word, the item, the task or the header text; a real action stays', () => {
  const doing = (d: string, over: Partial<MemberCardIn> = {}) => memberDetail({ ...CARD, doing: d, ...over }).filter(r => r.label === 'Doing').map(r => r.text)
  expect(doing('working')).toEqual([])
  expect(doing('COCKPIT-24')).toEqual([])
  expect(doing('space below the button row and the lower cards')).toEqual([])
  expect(doing('COCKPIT-24: space below the button row and the lower cards')).toEqual([])
  expect(doing('editing register.tsx', { header: 'COCKPIT-24 \u00b7 editing register.tsx' })).toEqual([])
  expect(doing('editing register.tsx')).toEqual(['editing register.tsx'])
  expect(doing('Moving the gap under the button row')).toEqual(['Moving the gap under the button row'])
})

test('"Task" is the plain title without the item id; with nothing left the row is hidden', () => {
  expect(stripItemId('COCKPIT-24: space below the button row', 'COCKPIT-24')).toBe('space below the button row')
  expect(stripItemId('b20: the sample installer', 'b20')).toBe('the sample installer')
  expect(stripItemId('PAIR-WIRE-01 \u00b7 pair the app', '')).toBe('pair the app')
  expect(stripItemId('Fix the gap', 'COCKPIT-24')).toBe('Fix the gap')
  expect(memberDetail({ ...CARD, description: 'COCKPIT-24' }).some(r => r.label === 'Task')).toBe(false)
  expect(memberDetail({ ...CARD, description: '' }).some(r => r.label === 'Task')).toBe(false)
})

test('"Powered by" carries the model, where it runs and the tool (OpenCode), and the month cost as text for an OpenCode lane', () => {
  expect(poweredParts('api', 'Claude API \u00b7 Sonnet 5.5')).toEqual(['Sonnet 5.5', 'Claude API', 'OpenCode'])
  expect(poweredParts('api', 'OpenAI API \u00b7 gpt-6')).toEqual(['gpt-6', 'OpenAI API', 'OpenCode'])
  expect(poweredParts('api', 'OpenCode \u00b7 model unknown')).toEqual(['model unknown', 'OpenCode'])
  expect(poweredParts('codex', 'Codex (ChatGPT plan) \u00b7 GPT-6 Luna low')).toEqual(['GPT-6 Luna low', 'ChatGPT plan', 'Codex'])
  expect(poweredParts('local', 'Local \u00b7 llama-9b')).toEqual(['llama-9b', 'Local', 'llama-server'])
  expect(poweredParts('captain', 'Claude \u00b7 Opus 5.5')).toEqual(['Opus 5.5', 'Claude'])
  expect(poweredParts('api', '')).toEqual([])

  const rows = memberDetail(CARD)
  const at = rows.findIndex(r => r.label === 'Powered by')
  expect(rows[at]?.text).toBe('Sonnet 5.5 \u00b7 Claude API \u00b7 OpenCode')
  // The cost is on the next line of the same row (blank label), as text, and the Limits row does not say it again.
  expect(rows[at + 1]).toEqual({ label: '', text: '$183.47 this month' })
  expect(rows.some(r => r.label === 'Limits')).toBe(false)
  expect(text(rows).match(/183\.47/g)?.length).toBe(1)
})

test('"Powered by" lines fit the narrowest pane without being cut (a part moves to the next line instead)', () => {
  const codex = memberDetail({ ...CARD, kind: 'codex', powered: 'Codex (ChatGPT plan) \u00b7 GPT-6 Luna low', cost: '' })
  const svg = rowSvg(360, { ...ROW, kind: 'codex', detail: codex })
  expect(svg).not.toContain('\u2026')
  const lines = packParts(['GPT-6 Luna low', 'ChatGPT plan', 'Codex'], 120)
  expect(lines.join(' \u00b7 ')).toBe('GPT-6 Luna low \u00b7 ChatGPT plan \u00b7 Codex')
  expect(lines.length).toBeGreaterThan(1)
  expect(packParts([], 100)).toEqual([])
})

test('a Codex lane keeps its plan usage as bars, a local lane has no cost row', () => {
  const codex = memberDetail({ ...CARD, kind: 'codex', powered: 'Codex (ChatGPT plan) \u00b7 GPT-6 Luna low', cost: '', limits: 'Codex 5h 52% used' })
  // Too long for one line at 360 px: the last part moves to the next line (blank label), nothing is cut.
  const at = codex.findIndex(r => r.label === 'Powered by')
  expect([codex[at]?.text, codex[at + 1]?.text].join(' \u00b7 ')).toBe('GPT-6 Luna low \u00b7 ChatGPT plan \u00b7 Codex')
  expect(codex.some(r => r.label === 'Limits')).toBe(true)
  const local = memberDetail({ ...CARD, kind: 'local', powered: 'Local \u00b7 llama-9b', cost: '', limits: '' })
  expect(text(local)).not.toContain('$')
  expect(local.find(r => r.label === 'Powered by')?.text).toBe('llama-9b \u00b7 Local \u00b7 llama-server')
})

// ---------------------------------------------------------------------------
// No overlap: parse the drawn open card and compare the boxes of its texts and bar tracks.

type Box = { what: string; x0: number; x1: number; y0: number; y1: number }

function boxesOf(svg: string): Box[] {
  const out: Box[] = []
  for (const m of svg.matchAll(/<text class="[^"]*" x="([\d.-]+)" y="([\d.-]+)" font-family="[^"]*" font-size="(\d+)"([^>]*)>([^<]*)<\/text>/g)) {
    const x = Number(m[1])
    const y = Number(m[2])
    const size = Number(m[3])
    const content = (m[5] ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    const w = textWidth(content, size)
    const end = (m[4] ?? '').includes('text-anchor="end"')
    out.push({ what: content, x0: end ? x - w : x, x1: end ? x : x + w, y0: y - size * 0.8, y1: y + size * 0.2 })
  }
  for (const m of svg.matchAll(/<rect class="k" x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="(\d+)"/g)) {
    out.push({ what: 'bar', x0: Number(m[1]), x1: Number(m[1]) + Number(m[3]), y0: Number(m[2]), y1: Number(m[2]) + Number(m[4]) })
  }
  return out
}

const hit = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

const ROW: LookRow = {
  kind: 'api',
  variant: 0,
  mode: 'work',
  activity: 'working',
  title: 'opencode-2',
  state: { text: 'working', color: '#22C55E' },
  item: 'COCKPIT-24 \u00b7 working',
  tag: 'Sonnet 5.5',
  since: '4m',
  trouble: null,
  isOut: false,
  indent: 0,
  isOpen: true,
  detail: memberDetail(CARD),
  bars: [],
  burst: '',
  landed: '',
  phase: 0,
}

test('the open card has no overlapping rows at 360, 420 and 520 px (api card, Codex bars, and long figures)', () => {
  const variants: LookRow[] = [
    ROW,
    { ...ROW, kind: 'codex', detail: memberDetail({ ...CARD, kind: 'codex', powered: 'Codex (ChatGPT plan) \u00b7 GPT-6 Luna low', cost: '' }), bars: [{ label: 'Codex 5h', ratio: 0.52, text: '52%', hex: '#3FB950' }, { label: 'Codex week', ratio: 0.97, text: '97%', hex: '#F85149' }] },
    // The longest figure the old layout crushed: a bar label of any length and the cost text with the tool name.
    { ...ROW, bars: [{ label: 'API this month', ratio: 0.9, text: '$183.47 this month \u00b7 OpenCode', hex: '#F85149' }, { label: 'Claude 5h', ratio: 0.4, text: '40% used as of 3m ago', hex: '#3FB950' }] },
  ]
  for (const W of [360, 420, 520]) {
    for (const row of variants) {
      const svg = rowSvg(W, row)
      const all = boxesOf(svg)
      // The open section: below the 52 px header lines.
      const card = all.filter(b => b.y0 >= 52)
      expect(card.length).toBeGreaterThan(6)
      for (let i = 0; i < card.length; i++) {
        const a = card[i] as Box
        // Everything stays inside the drawing.
        expect(a.x0).toBeGreaterThanOrEqual(0)
        expect(a.x1).toBeLessThanOrEqual(W)
        expect(a.y1).toBeLessThanOrEqual(rowHeight(row))
        for (let j = i + 1; j < card.length; j++) expect(hit(a, card[j] as Box)).toBe(false)
      }
      // The bars keep at least their minimum width.
      for (const b of card.filter(b => b.what === 'bar')) expect(b.x1 - b.x0).toBeGreaterThanOrEqual(BAR_MIN_W)
      // Rows are DETAIL_H apart and the last one ends inside the card.
      expect(rowHeight(row)).toBe(52 + 8 + (row.detail.length + row.bars.length) * DETAIL_H + 4)
    }
  }
})

test('"restart lane" has a few pixels of space above it, counted in the row height', () => {
  expect(ACTION_GAP_PX).toBeGreaterThanOrEqual(4)
  expect(actionGapSvg(300)).toContain('height="' + ACTION_GAP_PX + '"')
  expect(actionGapSvg(300)).toContain('width="300"')
  expect(SRC).toContain("key: 'act-gap-' + key")
  expect(SRC).toContain('ROW_PX * 1.5 + ACTION_GAP_PX')
})

test('the open OpenCode card draws no month-cost bar; the cost is in the detail rows', () => {
  expect(SRC).not.toContain("label: 'API this month'")
  expect(SRC).toContain("cost: m.kind === 'api'")
})
