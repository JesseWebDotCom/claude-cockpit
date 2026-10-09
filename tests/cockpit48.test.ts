// COCKPIT-48: the milestone title is emitted exactly once by the status row and the footer.
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { progressSvg } from '../hooks/look.ts'
import { activityCounts, countLine } from '../hooks/activity.ts'

const SRC = readFileSync(join(import.meta.dir, '../hooks/register.tsx'), 'utf8')
const TITLE = 'Remote Stack pairing'

test('the bar drawing carries the title once, AFTER the bar, then the count right after the title', () => {
  const svg = progressSvg(600, { title: TITLE, ratio: 0.9, count: '9/10', now: '', isWorking: false, grewFrom: null })
  expect(svg.split(TITLE).length - 1).toBe(1)
  expect(svg.indexOf('9/10')).toBeGreaterThan(svg.indexOf(TITLE))
  expect(svg.indexOf('<rect class="k"')).toBeLessThan(svg.indexOf(TITLE))
})

test('the footer text never holds the title', () => {
  expect(countLine(activityCounts({ lanesAwake: 0, agents: ['editing'] }))).not.toContain(TITLE)
})

test('the status row bar is plain Text: no picture whose alt could show the title', () => {
  expect(/kit\.Svg\(\{ key: 'band-progress'/.test(SRC)).toBe(false)
})

test('only one AbovePrompt band is registered and st.short is used only for the bar title', () => {
  expect(SRC.split("component: 'AbovePrompt'").length - 1).toBe(1)
  expect(SRC.split('st.short').length - 1).toBe(1)
})

// COCKPIT-49: the live status row. lookStatusIn builds count as "<milestone> · <done>/<total>" (the Main status card's right-hand text) from the real
// .cockpit/status.json shape; the row already shows the milestone as its title, so it must pass only "<done>/<total>" (the title showed twice).
import { liveBandCount, parseStatus, statusCount } from '../hooks/board.ts'
import { progressSvg } from '../hooks/look.ts'
import { doc } from '../hooks/draw.ts'

const REAL_STATUS = '{"updated": "2026-10-09T16:32:27-0500", "milestone": "Search fix", "done": 1, "total": 7, "now": "codex-a SEARCH-FRESH-01, codex-b OFFLINE-TEST-01, codex-c KS-00 running", "next": ["KS-BENCH-00", "KS-01 local Wikipedia reader"], "you": []}'
test('COCKPIT-49: the row shows the milestone once and the count is only done/total (real status.json shape)', () => {
  const s = parseStatus(REAL_STATUS)
  const cardCount = (s?.milestone ?? '') + ' · ' + statusCount(s)
  expect(cardCount).toBe('Search fix · 1/7')
  expect(liveBandCount(cardCount)).toBe('1/7')
  expect(liveBandCount('1/7')).toBe('1/7')
  const svg = progressSvg(576, { title: 'Search fix', ratio: 1 / 7, count: liveBandCount(cardCount), now: '', isWorking: false, grewFrom: null })
  expect((svg.match(/Search fix/g) ?? []).length).toBe(1)
  expect(svg.includes('<tspan')).toBe(false)
  expect(/>Search fix<\/text><text[^>]*>1\/7<\/text>/.test(svg)).toBe(true)
})
test('COCKPIT-49: the 18 px head size is not clamped to 15 by doc()', () => {
  expect(doc(100, 20, '<text font-size="18">a</text>').includes('font-size="18"')).toBe(true)
  expect(doc(100, 20, '<text font-size="15">a</text>').includes('font-size="15"')).toBe(true)
})
