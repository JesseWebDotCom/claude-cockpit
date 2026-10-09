// COCKPIT-44: the status row regrouped. Row 1 = title + bar (shortened) + crew count + AUTOPILOT + pane button at the right; row 2 = credit line;
// no third row; the system icons moved to the footer slot (the host's status line, a string only) in their text form.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from './pure.ts'
import { HEAD_PANE_GLYPH, HEAD_LEFT_MIN_PX, headPlan } from '../hooks/headrow.ts'
import { AUTOPILOT } from '../hooks/autopilot.ts'
import { bandPx, progressSvg } from '../hooks/look.ts'
import { GLYPH_KINDS, TEXT_GLYPH } from '../hooks/glyphs.ts'
import { LEVEL_MARK, emptyReading, footerText, healthIcons } from '../hooks/system.ts'
import { LEVEL_ROWS } from '../hooks/bandfit.ts'
import { textWidth } from '../hooks/draw.ts'

const SRC = readFileSync(resolve(import.meta.dir, '../hooks/register.tsx'), 'utf8')
const base = { total: 7, working: 1, erroredText: '', youN: 2, problemLabel: '! 1', hasProblems: true }

for (const cols of [80, 100, 140, 200]) {
  const px = bandPx(cols)
  test(`row 1 at ${cols} columns: the right group takes the last columns, the progress drawing takes the rest, nothing overlaps`, () => {
    const p = headPlan({ ...base, px })
    expect(p.leftPx + p.rightPx).toBe(px)
    expect(p.rightPx).toBeGreaterThan(0)
    expect(p.crewLabel.startsWith('7 crew')).toBe(true)
    // the bar is shorter than the full width by exactly the right group
    const svg = progressSvg(p.leftPx, { title: 'Account settings', ratio: 0.9, count: '9/10', now: '', isWorking: false, grewFrom: null })
    expect(svg).toContain(`width="${p.leftPx}"`)
  })
}

test('the right group gives up badges, then words, then the count, before the left part falls under its minimum; it is never empty', () => {
  let prevRight = Infinity
  for (let px = 1000; px >= 240; px -= 8) {
    const p = headPlan({ ...base, erroredText: '2 errored', px })
    expect(p.rightPx <= prevRight).toBe(true)
    prevRight = p.rightPx
    expect(p.leftPx).toBeGreaterThanOrEqual(40)
    expect(p.crewLabel.length).toBeGreaterThan(0)
  }
  const wide = headPlan({ ...base, erroredText: '2 errored', px: 1000 })
  expect(wide.crewLabel).toBe('7 crew: 1 working, 2 errored')
  expect(wide.showYou && wide.showProblems).toBe(true)
  const narrow = headPlan({ ...base, erroredText: '2 errored', px: 300 })
  expect(narrow.crewLabel).toBe('7 crew')
  expect(narrow.showYou || narrow.showProblems).toBe(false)
  expect(HEAD_LEFT_MIN_PX).toBeGreaterThan(40)
})

test('the title truncates only after the bar has shortened to its minimum', () => {
  const title = 'A long milestone title that is quite long'
  const full = textWidth(title, 13)
  const texts = (svg: string): string => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)][0]?.[1] ?? ''
  expect(texts(progressSvg(900, { title, ratio: 0.5, count: '', now: '', isWorking: false, grewFrom: null }))).toBe(title)
  expect(texts(progressSvg(160, { title, ratio: 0.5, count: '', now: '', isWorking: false, grewFrom: null })).length).toBeLessThan(title.length)
  expect(full).toBeGreaterThan(0)
})

test('two rows only: the third row (crew band) is gone, the band has no system icons, AUTOPILOT is one Button with nothing after it but the pane button', () => {
  expect(LEVEL_ROWS).toEqual({ full: 3, compact: 2, line: 1 })
  expect(SRC).not.toContain("key: 'crew-band-left'")
  expect(SRC).not.toContain("key: 'crew-band-right'")
  expect(SRC).not.toContain('plan.icons')
  const i = SRC.indexOf("key: 'head-controls'")
  const seg = SRC.slice(i, i + 220)
  expect(seg).toContain('columnGap: 0')
  expect(seg).toContain('children: [autopilotButton, panelButton]')
  expect(SRC).toContain('label: AUTOPILOT')
  expect(AUTOPILOT).toBe('AUTOPILOT')
  expect(HEAD_PANE_GLYPH).toBe('▤')
  // the old press glyph is not drawn in the rich bar
  const rich = SRC.slice(SRC.indexOf('const headRight'), SRC.indexOf('const headRow'))
  expect(rich).not.toContain('PRESENCE_SWITCH')
  expect(rich).not.toContain('presenceButton')
})

test('the footer slot shows the system icons: the same kinds as the drawn icons (one definition), one mark per level, cleared when there are none', () => {
  const icons = healthIcons({ ...emptyReading, memFree: 38, cores: 10, diskFree: 52, load1: 3 } as never, [])
  expect(icons.map(i => i.kind)).toEqual(['cpu', 'memory', 'disk'])
  expect(GLYPH_KINDS.slice(0, 3)).toEqual(['cpu', 'memory', 'disk'])
  const t = footerText(icons) as string
  for (const k of ['cpu', 'memory', 'disk'] as const) expect(t).toContain(TEXT_GLYPH[k])
  expect(t).toContain(LEVEL_MARK.green)
  expect(footerText([])).toBeUndefined()
  const withGpu = healthIcons({ ...emptyReading } as never, [{ name: 'host-a', answered: true, mem: null, gpu: { usedMB: 20000, totalMB: 24576, util: 40 } } as never])
  expect(footerText(withGpu)).toContain('GPU')
  // the tick writes it, and only when the text changed
  expect(SRC).toContain('refreshFooter($)')
  expect(SRC).toContain('if (text === footerShown) return')
})
