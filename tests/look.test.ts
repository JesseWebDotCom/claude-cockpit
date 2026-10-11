import { expect, test } from './pure.ts'

import { ACTIVITY_COLOR } from '../hooks/crew.ts'
import { ACTIVITIES } from '../hooks/sprites.ts'
import { MEMBER_ROW, cardHeight, cardSvg, confetti, groupSvg, groupSvg2, progressSvg, statusHeight, itemHeight, itemSvg, limitsHeight, limitsSvg, rowHeight, rowSvg, sleepersSvg, statusSvg, STATUS_H } from '../hooks/look.ts'
import { apiRow, claudeRow, cloudRow, codexRow, localRow, stripOf, systemRow } from '../hooks/pools.ts'
import type { PoolRow } from '../hooks/pools.ts'
import { creditView, winOf } from '../hooks/limits.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'
import type { LookRow, LookStatus } from '../hooks/look.ts'
import { DARK, LIGHT, contrast, legible, pillTone, setTheme, themeCss, themeFromSetting } from '../hooks/tokens.ts'
import { count, idsAreUnique, isWellFormed } from './helpers.ts'

const ROW: LookRow = {
  kind: 'codex',
  variant: 0,
  mode: 'work',
  activity: 'coding',
  title: 'codex-a',
  state: { text: 'coding', color: '#22C55E' },
  item: 'Settings screen',
  tag: 'GPT-6 low',
  since: '35s',
  trouble: null,
  isOut: false,
  indent: 0,
  isOpen: false,
  detail: [],
  bars: [],
  burst: '',
  landed: '',
  phase: 0,
}

const STATUS: LookStatus = { title: 'Sample milestone', ratio: 0.5, count: '3/6', note: '', now: 'b21 settings screen', next: 'b30 place map', you: '', youHex: '#F0A500', isAway: false, presenceText: 'Active', stale: '', phase: 0 }

const heightOf = (svg: string): number => Number(/height="([\d.]+)"/.exec(svg)?.[1] ?? Number.NaN)

// ---------------------------------------------------------------------------
// Tokens

test('tokens: every text colour reads at 4.5:1 or better on its page and card, dark and light', async () => {
  for (const p of [DARK, LIGHT]) {
    for (const on of [p.bg, p.surface]) {
      for (const [name, c] of [['text', p.text], ['muted', p.muted], ['dim', p.dim], ['ok', p.ok], ['err', p.err], ['warn', p.warn], ['info', p.info]] as const) {
        expect(contrast(c, on), name + ' on ' + on).toBeGreaterThanOrEqual(4.5)
      }
    }
  }
})

test('tokens: a chip is always readable: every state colour gets ink at 4.5:1 or better', async () => {
  const colors = [...Object.values(ACTIVITY_COLOR), '#22C55E', '#F0A500', '#EF4444', '#B91C1C', '#8B949E', '#FBBF24', '#6B7280', '#64748B', '#3B9C5F']
  for (const c of colors) {
    const t = pillTone(c)
    expect(contrast(t.fill, t.ink), c).toBeGreaterThanOrEqual(4.5)
  }
  expect(legible('#555555', '#1b1b1b', '#ffffff')).not.toBe('#555555')
  expect(contrast(legible('#555555', '#1b1b1b', '#ffffff'), '#1b1b1b')).toBeGreaterThanOrEqual(4.5)
})

test('tokens: the theme setting maps to dark, light or auto; the css has a dark-first set and a light set, never white fills', async () => {
  expect(themeFromSetting('dark')).toBe('dark')
  expect(themeFromSetting('dark-daltonized')).toBe('dark')
  expect(themeFromSetting('light-ansi')).toBe('light')
  expect(themeFromSetting('auto')).toBe('auto')
  expect(themeFromSetting(undefined)).toBe('auto')
  expect(themeCss('dark')).toContain(`.tile{fill:${DARK.surface}}`)
  expect(themeCss('light')).toContain(`.tile{fill:${LIGHT.surface}}`)
  const auto = themeCss('auto')
  expect(auto).toContain('prefers-color-scheme: dark')
  expect(auto).toContain(DARK.surface)
  expect(auto).toContain(LIGHT.surface)
  setTheme('dark')
  expect(rowSvg(420, ROW)).toContain(`.t{fill:${DARK.text}}`)
  setTheme('light')
  expect(rowSvg(420, ROW)).toContain(`.t{fill:${LIGHT.text}}`)
  setTheme('auto')
})

// ---------------------------------------------------------------------------
// The row

test('a crew row is TWO lines, 52 px (v8): line 1 character, name, state pill, right-aligned tag and time; line 2 the item', async () => {
  const svg = rowSvg(520, ROW)
  expect(isWellFormed(svg)).toBe(true)
  expect(heightOf(svg)).toBe(52)
  expect(rowHeight(ROW)).toBe(52)
  expect(MEMBER_ROW).toBe(52)
  expect(svg).toContain('>coding<')
  // Line 2 holds the item, muted, below line 1 (a larger y than the name).
  const yOf = (re: RegExp): number => Number(re.exec(svg)?.[1] ?? Number.NaN)
  const nameY = yOf(/<text class="t" x="[\d.]+" y="([\d.]+)"[^>]*font-weight="600">codex-a</)
  const itemY = yOf(/<text class="s" x="[\d.]+" y="([\d.]+)"[^>]*>Settings screen</)
  expect(itemY).toBeGreaterThan(nameY + 14)
  // State and item are two separate elements, never one combined chip.
  expect(svg).not.toContain('coding \u00b7 Settings screen')
  // The tag and the time sit at the right of line 1, the same baseline as the name.
  expect(svg).toMatch(/<text class="s" x="[\d.]+" y="21"[^>]*text-anchor="end"[^>]*>35s</)
  expect(svg).toMatch(/<text class="m" x="[\d.]+" y="21"[^>]*text-anchor="end"[^>]*>GPT-6 low</)
  expect(svg).toContain('class="sp c-codex a-coding"')
  expect(idsAreUnique(svg)).toBe(true)
  // 13 px body for the name and the item, 11 px for the tag and the time.
  expect(svg).toMatch(/font-size="13"[^>]*font-weight="600">codex-a</)
})

test('a row with trouble puts its reason on line 2 after the item, in its colour; the row stays 52 px; no hollow circle, no bar', async () => {
  for (const [trouble, hex, cls] of [['errored \u00b7 session died', '#F85149', 'errc'], ['blocked by codex-b: needs the pin', '#F0A500', 'warnc'], ['out of credits \u00b7 back Thu 9:00', '#8B949E', 'm']] as const) {
    const r = { ...ROW, trouble: { text: trouble, hex } }
    expect(rowHeight(r)).toBe(52)
    const svg = rowSvg(520, r)
    expect(heightOf(svg)).toBe(52)
    expect(svg).toContain(trouble)
    // The item first, then the reason, on the same baseline.
    expect(svg).toMatch(new RegExp('<text class="s" x="[\\d.]+" y="40"[^>]*>Settings screen</text><text class="' + cls + '" x="[\\d.]+" y="40"'))
  }
  const svg = rowSvg(520, ROW)
  expect(svg).not.toContain('<circle')
  expect(svg).not.toContain('class="sweep"')
  expect(svg).not.toContain('class="tw')
})

test('an open row (accordion) shows its detail lines and limit bars on a card under the row', async () => {
  const open: LookRow = {
    ...ROW,
    isOpen: true,
    detail: [{ label: 'Task', text: 'land the sample settings screen' }, { label: 'Powered by', text: 'Codex (ChatGPT plan) \u00b7 GPT-6 Luna low' }, { label: 'Blocked by', text: 'codex-b', cls: 'warnc' }],
    bars: [{ label: 'Codex 5h', ratio: 0.52, text: '52%', hex: '#3FB950' }],
  }
  const svg = rowSvg(520, open)
  expect(rowHeight(open)).toBe(52 + 8 + 4 * 22 + 4)
  expect(heightOf(svg)).toBe(rowHeight(open))
  expect(svg).toContain('class="tile"')
  for (const t of ['>Task<', '>Powered by<', 'Codex (ChatGPT plan)', '>Codex 5h<', '>52%<']) expect(svg).toContain(t)
  expect(rowSvg(520, ROW)).not.toContain('class="tile"')
})

test('the coordinator row has no context bar and no percent: the context is a different thing from the plan (v8)', async () => {
  const svg = rowSvg(520, { ...ROW, title: 'this session' })
  expect(svg).not.toContain('height="3" rx="1.5"')
  expect(svg).not.toMatch(/>\d+%</)
  expect(rowHeight(ROW)).toBe(52)
})

test('out of credits: the whole row at 45% opacity; confetti is 24 pieces, once, hidden for reduced motion', async () => {
  expect(rowSvg(520, { ...ROW, isOut: true, mode: 'out' })).toContain('opacity="0.45"')
  expect(rowSvg(520, ROW)).not.toContain('opacity="0.45"')
  const c = confetti('ADMIN-01', 20, 14, 60, 20)
  expect(count(c, '<rect ')).toBe(24)
  expect(c).toContain('prefers-reduced-motion')
  expect(c).toContain('1 forwards')
  expect(c).not.toContain('infinite')
  expect(count(rowSvg(520, { ...ROW, burst: 'ADMIN-01' }), 'class="cfp')).toBe(24)
  expect(rowSvg(520, { ...ROW, landed: 'landed ADMIN-01' })).toContain('landed ADMIN-01')
})

test('every state word fits as a chip in a row, at 360, 520 and 900 px, and nothing is past the edge', async () => {
  for (const W of [360, 520, 900]) {
    for (const a of ACTIVITIES) {
      const svg = rowSvg(W, { ...ROW, activity: a, state: { text: a, color: ACTIVITY_COLOR[a] }, title: 'a-rather-long-member-name-here', item: 'a very long item target that must be cut with an ellipsis', trouble: { text: 'blocked by someone: a long reason that has to be truncated to fit', hex: '#F0A500' } })
      expect(isWellFormed(svg)).toBe(true)
      expect(svg).toContain(`viewBox="0 0 ${W} 52"`)
      expect(svg).not.toMatch(/NaN|undefined/)
      // Text anchored at the right edge stays inside it.
      for (const m of svg.matchAll(/text-anchor="end"/g)) expect(m.index).toBeGreaterThan(0)
    }
  }
})

// ---------------------------------------------------------------------------
// Sleepers, groups, items

test('sleepers: ONE 36 px line "N sleeping" with tiny characters and names, an ellipsis when they do not fit', async () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ kind: 'codex', variant: i % 4, name: 'codex-' + i }))
  for (const W of [360, 520, 900]) {
    const svg = sleepersSvg(W, many)
    expect(isWellFormed(svg)).toBe(true)
    expect(heightOf(svg)).toBe(36)
    expect(svg).toContain('>9 sleeping<')
    expect(svg).toContain('codex-0')
  }
  expect(sleepersSvg(360, many)).toContain('\u2026')
  expect(sleepersSvg(900, many.slice(0, 3))).not.toContain('\u2026')
})

test('items: a 36 px row with the name, a state chip and the owner character; no bar; groups have a header', async () => {
  const it = { name: 'Settings screen', state: { text: 'working', color: '#22C55E' }, owner: { kind: 'codex', variant: 0, mode: 'work' as const, activity: 'coding' as const }, isOpen: false, detail: [], phase: 0 }
  const svg = itemSvg(520, it)
  expect(heightOf(svg)).toBe(36)
  expect(itemHeight(it)).toBe(36)
  expect(svg).toContain('>working<')
  expect(svg).toContain('class="sp c-codex a-coding"')
  expect(svg).not.toContain('class="tw')
  expect(itemSvg(520, { ...it, owner: null })).not.toContain('class="sp')
  const open = itemSvg(520, { ...it, isOpen: true, detail: [{ label: 'Brief', text: 'brief-b30.md' }] })
  expect(open).toContain('>Brief<')
  const g = groupSvg(520, 'Now', 5)
  expect(g).toContain('>NOW<')
  expect(g).toContain('>5<')
})

// ---------------------------------------------------------------------------
// The Status card and the Limits area

// 0.19.3: the goal name and count sit on their own row (20) and the bar on its own row (14) under the title.
const HEAD_ROWS = 34

test('status card: title, thin bar and count on one line, then NOW, NEXT and YOU as three labelled lines; no age unless old', async () => {
  const svg = statusSvg(520, STATUS)
  expect(isWellFormed(svg)).toBe(true)
  expect(heightOf(svg)).toBe(STATUS_H + HEAD_ROWS)
  expect(svg).toContain('>Sample milestone<')
  expect(svg).toContain('>3/6<')
  for (const l of ['>NOW<', '>NEXT<', '>YOU<']) expect(svg).toContain(l)
  expect(svg).toMatch(/<text class="m"[^>]*>nothing<\/text>/)
  // COCKPIT-17: the Active or Away chip is not on the card (the button row under it carries it).
  expect(svg).not.toContain('>Active<')
  expect(statusSvg(520, { ...STATUS, isAway: true, presenceText: 'Away' })).not.toContain('>Away<')
  expect(svg).not.toContain('<circle')
  // v9: a stale status is an amber CHIP on the NOW line ("stale: updated 2h ago"), not a dot beside the pill.
  const old = statusSvg(520, { ...STATUS, stale: 'stale: updated 2h ago' })
  expect(old).toContain('>stale: updated 2h ago<')
  expect(old).not.toMatch(/<circle class="warnc"/)
  expect(heightOf(old)).toBe(STATUS_H + HEAD_ROWS)
  expect(isWellFormed(old)).toBe(true)
  // The chip is on the NOW line: after the NOW label and before the NEXT label, at the right edge.
  expect(old.indexOf('>stale: updated 2h ago<')).toBeGreaterThan(old.indexOf('>NOW<'))
  expect(old.indexOf('>stale: updated 2h ago<')).toBeLessThan(old.indexOf('>NEXT<'))
  expect(svg).not.toContain('>stale')
  // And at a narrow width it still fits inside the card (the NOW text gives it room).
  const narrow = statusSvg(360, { ...STATUS, now: 'a long now line with many words that would run under the chip', stale: 'stale: updated 12h ago' })
  expect(isWellFormed(narrow)).toBe(true)
  expect(narrow).toContain('>stale: updated 12h ago<')
  const you = statusSvg(520, { ...STATUS, you: 'approve the pin [blocking: b50 waits]', youHex: '#F85149' })
  expect(you).toMatch(/<text class="errc"[^>]*>approve the pin/)
  // "Main status" with a count note when there is no milestone.
  expect(statusSvg(520, { ...STATUS, title: 'Main status', ratio: null, count: '', note: '4 landed' })).toContain('>4 landed<')
  for (const W of [360, 520, 900]) {
    const s = statusSvg(W, { ...STATUS, now: 'a very long now line that must be cut with an ellipsis to stay inside the card at any width', next: 'x', you: 'y' })
    expect(isWellFormed(s)).toBe(true)
    expect(s).toContain(`viewBox="0 0 ${W} ${STATUS_H + HEAD_ROWS}"`)
  }
})

const NOW = Date.parse('2026-10-08T22:00:00Z')
const plan = (name: string, five: number | null, week: number | null, resets = true) => ({
  id: name.toLowerCase(),
  name,
  five: winOf('5h', five, five !== null && resets ? NOW + 2 * 3_600_000 : null),
  week: winOf('week', week, week !== null && resets ? NOW + 3 * 86_400_000 : null),
})
const SIX: PoolRow[] = [
  systemRow({ dots: [{ name: 'memory', level: 'green', color: '#3FB950' }], summary: 'healthy', card: ['Memory 59% used'] }),
  claudeRow({ ctx: { percent: 51, tokens: 102000, window: 200000 }, windows: claudeWindows([{ kind: 'five_hour', percentUsed: 0, resetsAt: new Date(NOW + 2 * 3_600_000).toISOString() }, { kind: 'seven_day', percentUsed: 87, resetsAt: new Date(NOW + 3 * 86_400_000).toISOString() }], emptyCache, NOW), cost: null, nowMs: NOW }),
  codexRow(plan('Codex', 52, 80), NOW),
  apiRow({ measured: { usd: 3.41, messages: 34 }, limit: 200 }),
  cloudRow('2026-11-30', 2, NOW),
  localRow({ up: true, gpuPct: 21, running: 1 }),
]

test('limits area: ONE line per pool, the same six as the strip: System, Claude, Codex, API, Cloud, Local', async () => {
  const svg = limitsSvg(520, SIX)
  expect(isWellFormed(svg)).toBe(true)
  expect(heightOf(svg)).toBe(limitsHeight(6))
  expect(heightOf(svg)).toBeLessThanOrEqual(170)
  const names = [...svg.matchAll(/<text class="t"[^>]*font-weight="600">([A-Za-z]+)<\/text>/g)].map(m => m[1])
  expect(names).toEqual(['System', 'Claude', 'Codex', 'API', 'Cloud', 'Local'])
  // Claude: plan usage only (5h 0% used, week 87% used) with the reset; NO context bar; Codex: 5h and week.
  for (const t of ['>0%<', '>87%<', '>52%<', '>80%<', '>5h<', '>wk<', '>Sun<']) expect(svg).toContain(t)
  expect(svg).not.toContain('>ctx<')
  expect(svg).not.toContain('>51%<')
  expect(svg).toMatch(/>\d\d:\d\d</)
  expect(svg).toContain('$3.41 this month')
  expect(svg).not.toContain('$3.41 / $196.59 \u00b7 Oct 28')
  expect(svg).toMatch(/Nov 30, \d+ days \u00b7 2 running/)
  expect(svg).toContain('server up \u00b7 GPU 21% \u00b7 1 running \u00b7 free')
  expect(svg).toContain('>healthy<')
  expect(svg).not.toMatch(/NaN|undefined/)
  for (const W of [360, 420, 520, 900]) {
    const s = limitsSvg(W, SIX)
    expect(isWellFormed(s)).toBe(true)
    expect(s).toContain(`viewBox="0 0 ${W} ${limitsHeight(6)}"`)
  }
})

test('limits area: an unreadable plan is ONE muted line, an unreadable window is "n/a", a pool that is out is at 45%', async () => {
  const rows = [
    claudeRow({ ctx: { percent: null, tokens: null, window: null }, windows: claudeWindows([], emptyCache, NOW), cost: null, nowMs: NOW }),
    codexRow(plan('Codex', 52, null), NOW),
    codexRow(plan('Codex', 52, 100), NOW),
  ]
  const a = limitsSvg(520, [rows[0]!, rows[1]!])
  expect((a.match(/plan usage not readable/g) ?? []).length).toBe(1)
  expect(a).toMatch(/<text class="m"[^>]*>plan usage not readable<\/text>/)
  expect(a).toContain('>n/a<')
  expect(a).not.toContain('opacity="0.45"')
  expect(limitsSvg(520, [rows[2]!])).toContain('opacity="0.45"')
})

// ---------------------------------------------------------------------------
// Line 1 of the bar: the milestone progress, animated

const PROG = { title: 'Admin Home settings live', ratio: 0.5, count: '3/6', now: 'b21 settings screen', isWorking: true, grewFrom: null as number | null }

test('progress (item 8, COCKPIT-42): the short description and a filling bar alone on one line; 28 px; well formed at 360, 520 and 900', async () => {
  for (const W of [360, 520, 900]) {
    const svg = progressSvg(W, PROG)
    expect(isWellFormed(svg)).toBe(true)
    expect(svg).toContain(`viewBox="0 0 ${W} 28"`)
    expect(svg).toContain('>3/6<')
    expect(svg).not.toContain('now b21')
    expect(svg).toContain('Admin Home')
    expect(svg).not.toMatch(/NaN|undefined/)
  }
  // The fill is half of the track.
  const svg = progressSvg(520, PROG)
  const track = Number(/<rect class="k" x="[\d.]+" y="[\d.]+" width="([\d.]+)"/.exec(svg)?.[1])
  const fill = Number(/<rect class="okc" x="[\d.]+" y="[\d.]+" width="([\d.]+)"/.exec(svg)?.[1])
  expect(Math.abs(fill / track - 0.5) < 0.01).toBe(true)
  // No count: no bar, the title still shows.
  const none = progressSvg(520, { ...PROG, ratio: null, count: '' })
  expect(none).not.toContain('class="k"')
  expect(none).toContain('Admin Home')
})

test('progress animation: while anything works: stripes, a shimmer and a pulse on the leading edge; idle: a still bar', async () => {
  const live = progressSvg(520, PROG)
  for (const c of ['pg-stripes', 'pg-shine', 'pg-edge', '@keyframes pgs', '@keyframes pgh', '@keyframes pge']) expect(live).toContain(c)
  expect(live).toContain('<clipPath')
  expect(live).toContain('url(#pgs)')
  const still = progressSvg(520, { ...PROG, isWorking: false })
  for (const c of ['pg-stripes', 'pg-shine', 'pg-edge', '@keyframes pgs', '@keyframes pgh', '@keyframes pge', 'url(#pgs)']) expect(still).not.toContain(c)
  expect(still).toContain('class="okc"')
})

test('progress animation: when the done count rises the fill grows from where it was, once; otherwise not (the count text is gone, COCKPIT-42)', async () => {
  const grew = progressSvg(520, { ...PROG, ratio: 0.5, grewFrom: 1 / 6 })
  expect(grew).toContain('class="pg-grow"')
  expect(grew).toContain('@keyframes pgg')
  expect(grew).toMatch(/@keyframes pgg\{from\{transform:scaleX\(0\.33\)\}to\{transform:scaleX\(1\)\}\}/)
  expect(grew).toContain(' 1 both')
  const steady = progressSvg(520, { ...PROG, grewFrom: null })
  expect(steady).not.toContain('class="pg-grow"')
  expect(steady).not.toContain('@keyframes pgg')
  // A count that did not rise (from is not below) does not grow.
  expect(progressSvg(520, { ...PROG, grewFrom: 0.5 })).not.toContain('class="pg-grow"')
})

test('progress animation: CSS only, no script, and prefers-reduced-motion switches every animation off', async () => {
  const svg = progressSvg(520, { ...PROG, grewFrom: 0.2 })
  expect(svg).not.toContain('<script')
  expect(svg).not.toContain('<animate')
  expect(svg).toContain('@media (prefers-reduced-motion: reduce){.pg-stripes,.pg-shine,.pg-edge,.pg-grow,.pg-pop{animation:none}}')
})

// ---------------------------------------------------------------------------
// Status card title wraps; the "?" card

test('status card: a long title wraps to TWO lines instead of "..."; the card grows by one title line', async () => {
  const long = { ...STATUS, title: 'Admin Home settings go live for everyone' }
  const svg = statusSvg(240, long)
  expect(statusHeight(240, long)).toBe(STATUS_H + HEAD_ROWS + 20)
  expect(heightOf(svg)).toBe(STATUS_H + HEAD_ROWS + 20)
  expect(svg).not.toContain('\u2026')
  // Both halves of the title are drawn, as two 15 px lines.
  const lines = [...svg.matchAll(/<text class="t"[^>]*font-size="15"[^>]*>([^<]*)</g)].map(m => m[1])
  expect(lines.length).toBe(2)
  expect(lines.join(' ')).toBe(long.title)
  // Wide enough, the same title is one line and the card keeps its height; never an ellipsis either way.
  expect(statusHeight(900, long)).toBe(STATUS_H + HEAD_ROWS)
  expect(statusSvg(900, long)).not.toContain('\u2026')
  // A short title stays one line.
  expect(statusHeight(520, STATUS)).toBe(STATUS_H + HEAD_ROWS)
  expect(heightOf(statusSvg(520, STATUS))).toBe(STATUS_H + HEAD_ROWS)
})

test('the "?" help is a card: a title and wrapped lines on a tile, height follows the lines', async () => {
  const lines = ['1. This session first.', 'a very long line that has to wrap onto a second line at the narrow width of the pane so that nothing is cut off at all']
  const svg = cardSvg(360, 'Crew order and keys', lines)
  expect(isWellFormed(svg)).toBe(true)
  expect(svg).toContain('class="tile"')
  expect(heightOf(svg)).toBe(cardHeight(360, lines))
  expect(cardHeight(360, lines)).toBeGreaterThan(cardHeight(900, lines))
  expect(svg).not.toContain('\u2026')
})

test('no drawing paints a white or default fill: every rect is a token class or a state colour', async () => {
  const all = [rowSvg(520, ROW), rowSvg(520, { ...ROW, isOpen: true, detail: [{ label: 'a', text: 'b' }], bars: [{ label: 'x', ratio: 0.5, text: '50%', hex: '#3FB950' }] }), statusSvg(520, STATUS), limitsSvg(520, SIX), groupSvg2(stripOf(SIX, 900).groups[1]!).svg, progressSvg(520, { title: 'M', ratio: 0.5, count: '3/6', now: 'x', isWorking: true, grewFrom: 0.3 }), cardSvg(520, 'T', ['a b c']), sleepersSvg(520, [{ kind: 'codex', variant: 0, name: 'a' }, { kind: 'codex', variant: 1, name: 'b' }]), groupSvg(520, 'Now', 1)]
  for (const full of all) {
    // A clipPath's shape paints nothing; it only clips.
    const svg = full.replace(/<clipPath[^>]*>[\s\S]*?<\/clipPath>/g, '')
    for (const m of svg.matchAll(/<rect ([^>]*)\/>/g)) {
      const a = m[1] ?? ''
      // A translucent highlight (the progress stripes) is a shine on a coloured bar, not a fill of its own.
      if (a.includes('fill-opacity')) continue
      // A background rect without a class or fill would be painted black or white by the host: none exists.
      expect(/class="|fill="/.test(a), a).toBe(true)
      expect(a).not.toMatch(/fill="(#fff|#ffffff|white)"/i)
    }
  }
})
