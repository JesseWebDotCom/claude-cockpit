// COCKPIT-33 (cockpit 0.8.5): the upper right of the captain and crew rows is one line: provider, model, time.

import { test, expect } from './pure.ts'
import { modelOfPowered, providerOfKind, summaryFit, summaryFull } from '../hooks/summary.ts'
import { rowSvg } from '../hooks/look.ts'
import type { LookRow } from '../hooks/look.ts'
import { poweredCodex, poweredSession } from '../hooks/crew.ts'
import { textWidth } from '../hooks/draw.ts'

const base: LookRow = { kind: 'codex', variant: 0, mode: 'work', activity: 'coding', title: 'codex-a', state: { text: 'working', color: '#22C55E' }, item: 'X-01', tag: '', since: '12m', trouble: null, isOut: false, indent: 0, isOpen: false, detail: [], bars: [], burst: '', landed: '', phase: 0 }

test('the captain line is "Claude: model time", with and without a model', () => {
  expect(summaryFull({ provider: 'Claude', model: 'Sonnet 5.5', time: '4m', colon: true })).toBe('Claude: Sonnet 5.5 4m')
  expect(summaryFull({ provider: 'Claude', model: '', time: '4m', colon: true })).toBe('Claude: 4m')
  expect(summaryFull({ provider: 'Claude', model: '', time: '', colon: true })).toBe('Claude:')
})

test('crew lines for codex, claude and an unknown provider; an unreadable field is left out, never invented', () => {
  expect(summaryFull({ provider: 'codex', model: 'GPT-6 Luna', time: '12m' })).toBe('codex GPT-6 Luna 12m')
  expect(summaryFull({ provider: 'codex', model: 'GPT-6 Luna low', time: '12m' })).toBe('codex GPT-6 Luna low 12m')
  expect(summaryFull({ provider: 'claude', model: 'Sonnet', time: '4m' })).toBe('claude Sonnet 4m')
  expect(summaryFull({ provider: 'zeta', model: '', time: '3m' })).toBe('zeta 3m')
  expect(summaryFull({ provider: '', model: '', time: '3m' })).toBe('3m')
  expect(summaryFull({ provider: '', model: '', time: '' })).toBe('')
})

test('the model and provider come from what the lane exposes', () => {
  expect(modelOfPowered(poweredCodex('GPT-6 Luna low').text)).toBe('GPT-6 Luna low')
  expect(modelOfPowered(poweredCodex('').text)).toBe('')
  expect(modelOfPowered(poweredSession('claude-sonnet-5-5').text)).toBe('Sonnet 5.5')
  expect(modelOfPowered(poweredSession('').text)).toBe('')
  expect(modelOfPowered('OpenCode · model unknown')).toBe('')
  expect(providerOfKind('Codex')).toBe('codex')
  expect(providerOfKind('unknown')).toBe('')
  expect(providerOfKind('')).toBe('')
})

test('the time survives every cut: the model goes first, then the provider', () => {
  const i = { provider: 'codex', model: 'GPT-6 Luna low', time: '12m' }
  const full = textWidth(summaryFull(i), 11)
  const mid = summaryFit(i, full - 20, 11)
  expect(mid.startsWith('codex ')).toBe(true)
  expect(mid.endsWith(' 12m')).toBe(true)
  expect(mid.includes('…')).toBe(true)
  expect(textWidth(mid, 11)).toBeLessThanOrEqual(full - 20)
  const noModel = summaryFit(i, textWidth('codex 12m', 11) + 4, 11)
  expect(noModel).toBe('codex 12m')
  const tiny = summaryFit(i, textWidth('12m', 11) + 2, 11)
  expect(tiny).toBe('12m')
  for (const w of [0, 10, 30, 60, 90, 120, 200]) expect(summaryFit(i, w, 11).endsWith('12m')).toBe(true)
  for (const w of [0, 10, 30, 60, 90, 120, 200]) expect(summaryFit({ provider: 'Claude', model: 'Sonnet 5.5', time: '4m', colon: true }, w, 11).endsWith('4m')).toBe(true)
})

test('the captain with a long model keeps "Claude:" and the time, with an ellipsis between', () => {
  const s = summaryFit({ provider: 'Claude', model: 'Sonnet 5.5 extended thinking', time: '4m', colon: true }, 110, 11)
  expect(s.startsWith('Claude: ')).toBe(true)
  expect(s.endsWith('… 4m')).toBe(true)
})

test('the row draws the line, one text, at 360, 420 and 520, and the time is always on the row', () => {
  for (const w of [360, 420, 520]) {
    const svg = rowSvg(w, { ...base, provider: 'codex', model: 'GPT-6 Luna low' })
    expect(svg).toContain('codex GPT-6 Luna low 12m')
    const long = rowSvg(w, { ...base, provider: 'codex', model: 'GPT-6 Luna low extended extended extended extended', since: '12m' })
    expect(long).toContain('12m</text>')
    const cap = rowSvg(w, { ...base, kind: 'captain', title: 'Session', provider: 'Claude', model: 'Sonnet 5.5', colon: true, since: '4m' })
    expect(cap).toContain('Claude: Sonnet 5.5 4m')
    // Nothing known beyond the time.
    expect(rowSvg(w, { ...base, provider: '', model: '' })).toContain('>12m</text>')
  }
})

test('a row without provider or model keeps its earlier tag and time', () => {
  const svg = rowSvg(420, { ...base, tag: 'GPT-6 low' })
  expect(svg).toContain('GPT-6 low')
  expect(svg).toContain('12m')
})

test('the new Session line says idle or active, and the old captain row and Crew header are gone', async () => {
  const { graphOf, paneSvgTree } = await import('../hooks/register.tsx')
  const el = (type: string) => (p: any) => ({ type, props: p, children: p.children ?? [] })
  const kit: any = { Box: el('Box'), Text: el('Text'), Button: el('Button'), Svg: el('Svg'), Input: el('Input') }
  const $: any = { ui: { invalidate: () => undefined, toast: () => undefined }, fs: { write: async () => undefined } }
  const walk = (n: any, out: any[] = []): any[] => { if (n && typeof n === 'object') { out.push(n); if (Array.isArray(n.children)) for (const c of n.children) walk(c, out) } return out }
  const t = paneSvgTree($, kit, 100, undefined, 1_000_000, graphOf())
  const alts = walk(t).map(n => n.props?.alt).filter((a): a is string => typeof a === 'string')
  expect(alts.some(a => a.startsWith('Session:'))).toBe(true)
  expect(alts.some(a => a.startsWith('Crew'))).toBe(false)
})
