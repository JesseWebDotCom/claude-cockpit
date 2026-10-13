// COCKPIT-44, regrouped by COCKPIT-46: row 1 of the bar. The title and bar fill the left; the right group, left to right, holds the badges ("!", "you"),
// the drawn system icons, AUTOPILOT and the pane button. The agent count is NOT here: it is the footer line (plain text) and the pane.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from './pure.ts'
import { HEAD_PANE_GLYPH, HEAD_LEFT_MIN_PX, HEAD_ICON_PX, headPlan } from '../hooks/headrow.ts'
import { AUTOPILOT } from '../hooks/autopilot.ts'
import { bandPx, progressSvg } from '../hooks/look.ts'
import { LEVEL_ROWS } from '../hooks/bandfit.ts'
import { textWidth } from '../hooks/draw.ts'

const SRC = readFileSync(resolve(import.meta.dir, '../hooks/register.tsx'), 'utf8')
const base = { iconCount: 4, youN: 2, problemLabel: '! 1', hasProblems: true }

for (const cols of [80, 100, 140, 200]) {
  const px = bandPx(cols)
  test(`row 1 at ${cols} columns: the right group takes the last columns, the progress drawing takes the rest, nothing overlaps`, () => {
    const p = headPlan({ ...base, px })
    expect(p.leftPx + p.rightPx).toBe(px)
    expect(p.rightPx).toBeGreaterThan(0)
    expect(p.leftPx).toBeGreaterThanOrEqual(HEAD_LEFT_MIN_PX - 8)
    const svg = progressSvg(p.leftPx, { title: 'Remote Stack pairing', ratio: 0.9, count: '9/10', now: '', isWorking: false, grewFrom: null })
    expect(svg).toContain(`width="${p.leftPx}"`)
  })
}

test('the right group gives up the "!" badge, "you", the system icons, then AUTOPILOT, in that order; the pane button is never dropped', () => {
  let prevRight = Infinity
  const seen: string[] = []
  for (let px = 1000; px >= 100; px -= 8) {
    const p = headPlan({ ...base, px })
    expect(p.rightPx <= prevRight).toBe(true)
    prevRight = p.rightPx
    expect(p.rightPx).toBeGreaterThan(0)
    // a later part never shows while an earlier one is gone: AUTOPILOT outlasts the icons, the icons outlast "you", "you" outlasts "!"
    if (p.showIcons) expect(p.showAutopilot).toBe(true)
    if (p.showYou) expect(p.showIcons).toBe(true)
    if (p.showProblems) expect(p.showYou).toBe(true)
    seen.push([p.showProblems, p.showYou, p.showIcons, p.showAutopilot].map(b => (b ? '1' : '0')).join(''))
  }
  expect(seen[0]).toBe('1111')
  expect(seen).toContain('0111')
  expect(seen).toContain('0011')
  expect(seen).toContain('0001')
  expect(seen[seen.length - 1]).toBe('0000')
  const wide = headPlan({ ...base, px: 1000 })
  expect(wide.rightPx).toBeGreaterThanOrEqual(4 * HEAD_ICON_PX)
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

test('0.23.3: row 1 holds bar, title, count at the left and badges, AWAY and the pane glyph button at the right; icons and "+n off plan" sit on row 2; the card never wraps', () => {
  expect(LEVEL_ROWS).toEqual({ full: 3, compact: 2, line: 1 })
  expect(SRC).not.toContain("key: 'crew-band-left'")
  expect(SRC).not.toContain("key: 'crew-band-right'")
  const i = SRC.indexOf("key: 'head-right'")
  const seg = SRC.slice(i, i + 1500)
  // 0.24.9: the system icons sit in the right group of row 1, left of ACTIVE; the "you: n" label is gone (the Needs you pill carries it)
  expect(seg).toContain('systemNodes(kit, sysIcons)')
  expect(seg).not.toContain('band-you')
  const ctl = seg.slice(seg.indexOf("key: 'head-controls'"), seg.indexOf("key: 'head-controls'") + 220)
  expect(ctl).toContain('columnGap: 0')
  expect(ctl).toContain('children: [...(plan.showAutopilot ? [presencePillBand, autopilotButton] : []), panelButton]')
  expect(SRC).not.toContain('crew-show-plan')
  expect(SRC).not.toContain('Show plan')
  // "+n off plan" is on row 2 and cannot wrap
  const left = SRC.slice(SRC.indexOf('const leftPieces'), SRC.indexOf('const headLeft'))
  expect(left).not.toContain('band-off')
  expect(SRC).not.toContain("key: 'band-off'")
  expect(SRC).toContain('presenceSvg(pres.isAway)')
  expect(AUTOPILOT).toBe('AWAY')
  expect(HEAD_PANE_GLYPH).toBe('\u25a4')
  expect(seg).not.toContain('crewLabel')
  const rich = SRC.slice(SRC.indexOf('const headRight'), SRC.indexOf('const headRow'))
  expect(rich).not.toContain('PRESENCE_SWITCH')
  expect(rich).not.toContain('presenceButton')
})

test('the footer slot carries ONLY the agent count (plain wording); the system figures are not in it', () => {
  expect(SRC).toContain('const full = countLine(counts)')
  expect(SRC).toContain('countLine(counts, false)')
  expect(SRC).toContain('refreshFooter($)')
  expect(SRC).toContain('if (text === footerShown) return')
  expect(SRC).not.toContain('footerText')
})

test('0.24.0: the pane opener is ONE plain Button with the drawn glyph, no words, and a second press closes only a pane that is drawn', () => {
  expect(SRC).toContain("const panelButton = Button({ key: 'crew-open', label: '\\u25a4', plain: true, onPress: () => void togglePane($) })")
  expect(SRC).not.toContain('crew-show-plan')
  expect(SRC).toContain('mine !== undefined && mine.isPlaced')
})
