import { expect, test } from './pure.ts'

import {
  BAND_H,
  COMPACT_H,
  bandSvg,
  castH,
  castSvg,
  compactSvg,
  confettiSvg,
  dotBar,
  phaseCss,
  reportsH,
  reportsSvg,
  rowHeight,
  rowSvg,
  shortTag,
  sleepRowSvg,
  spriteSvg,
  wrapText,
  toGray,
} from '../hooks/draw.ts'
import type { DrawMode, RowIn } from '../hooks/draw.ts'
import { ACTIVITIES, POSES } from '../hooks/sprites.ts'
import type { Activity } from '../hooks/sprites.ts'
import { count, idsAreUnique, isWellFormed } from './helpers.ts'

const KINDS = ['max', 'codex', 'api', 'cloud', 'local']

const ROW: RowIn = {
  kind: 'codex',
  variant: 0,
  mode: 'work',
  activity: 'working',
  mark: 'working',
  title: 'codex-a',
  powered: { text: 'Codex (ChatGPT plan) \u00b7 GPT-6 Luna low', isDim: false, badge: '' },
  pill: { text: 'coding \u00b7 Billing Settings', color: '#22C55E' },
  meta: 'b21b',
  isStale: false,
  isStuck: false,
  chip: null,
  ratio: null,
  barLabel: '',
  barColor: '',
  rightText: '12s',
  description: 'land FORMS-03b in one pass',
  advice: [],
  tail: 'ran the tests, 14 passed',
}

// ---------------------------------------------------------------------------
// Characters in every mode

test('every character draws in every mode as well-formed svg', async () => {
  for (const kind of KINDS) {
    for (const mode of ['work', 'idle', 'stale', 'dim'] as const) {
      const g = spriteSvg(0, 0, kind, 0, mode)
      expect(isWellFormed('<svg>' + g + '</svg>')).toBe(true)
      expect(g).toContain('c-' + kind)
      expect(g).toContain(`class="sp c-${kind} ${mode === 'work' ? 'run' : mode === 'idle' ? 'sleep' : mode === 'stale' ? 'sleep stale' : 'still'}"`)
      expect(g).not.toMatch(/NaN|undefined/)
    }
  }
})

test('an unknown kind falls back to Max instead of breaking', async () => {
  expect(spriteSvg(0, 0, 'nobody', 0, 'idle')).toContain('c-max')
})

test('codex hats: a red, b blue, c yellow, d purple', async () => {
  // (A sleeping character is black and white since 0.5.1, so the hats are checked on the awake, still character.)
  const hat = (v: number) => spriteSvg(0, 0, 'codex', v, 'still')
  expect(hat(0)).toContain('#E5484D')
  expect(hat(1)).toContain('#3B82F6')
  expect(hat(2)).toContain('#F5C518')
  expect(hat(3)).toContain('#A855F7')
  expect(hat(0)).not.toContain('#A855F7')
})

test('idle and stale characters sleep: closed eye lines, body low, three z, nothing that blinks or walks', async () => {
  for (const kind of KINDS) {
    for (const mode of ['idle', 'stale'] as const) {
      const g = spriteSvg(0, 0, kind, 0, mode)
      expect(g).toContain('<g transform="translate(0,2)">')
      expect(g.indexOf('class="la"')).toBeLessThan(g.indexOf('<g transform="translate(0,2)">'))
      expect(count(g, 'class="zz zz')).toBe(3)
      const eyes = [...g.matchAll(/<g class="ey">(.*?)<\/g>/g)].map(m => m[1] ?? '')
      expect(eyes.length).toBeGreaterThan(0)
      for (const e of eyes) for (const r of e.matchAll(/height="(\d+)"/g)) expect(r[1]).toBe('1')
    }
    const awake = spriteSvg(0, 0, kind, 0, 'work')
    expect(awake).not.toContain('class="zz')
    expect(awake).not.toContain('<g transform="translate(0,2)">')
  }
})

test('a stale or absent character is greyed: its colours differ from the working ones', async () => {
  expect(spriteSvg(0, 0, 'codex', 0, 'dim')).not.toBe(spriteSvg(0, 0, 'codex', 0, 'work'))
  expect(spriteSvg(0, 0, 'codex', 0, 'dim')).not.toContain('#10A37F')
  expect(spriteSvg(0, 0, 'codex', 0, 'stale')).not.toContain('#10A37F')
})

test('sleeping keeps the hat, visor, glasses and beanie; the propeller, antenna and puff move only while running', async () => {
  // Sleeping keeps the shapes, drawn in grey of the same brightness (no colour accent while asleep).
  expect(spriteSvg(0, 0, 'codex', 0, 'idle')).toContain(toGray('#E5484D'))
  expect(spriteSvg(0, 0, 'codex', 0, 'idle')).not.toContain('#E5484D')
  expect(spriteSvg(0, 0, 'codex', 0, 'idle')).toContain(toGray('#0F2A25'))
  expect(spriteSvg(0, 0, 'max', 0, 'idle')).toContain(toGray('#2B2A28'))
  expect(spriteSvg(0, 0, 'local', 0, 'idle')).toContain(toGray('#F5C518'))
  const css = rowSvg(420, { ...ROW, kind: 'local', mode: 'idle' })
  expect(css).toContain('.c-local.run .prop{animation:spin')
  expect(css).not.toMatch(/\.c-local \.prop\{animation/)
  expect(css).toContain('.c-api.run .ant')
  expect(css).toContain('.c-cloud.run .pf')
})

test('the sleeping animations: 4 s breathing pulse and 3 s staggered z, phased by the clock', async () => {
  const svg = rowSvg(420, { ...ROW, mode: 'idle', mark: 'idle', activity: 'sleeping' })
  expect(svg).toContain('.sleep .bd{transform-origin:50% 100%;animation:zb 4s ease-in-out infinite}')
  expect(svg).toContain('animation:zf 3s ease-out infinite')
  expect(svg).not.toContain('@keyframes sl{')
  expect(phaseCss(0)).toBe('<style>.bt{animation-delay:-0s}.sleep .bd{animation-delay:-0s}.zz0{animation-delay:-0s}.zz1{animation-delay:-1s}.zz2{animation-delay:-2s}</style>')
  expect(phaseCss(5000)).toContain('.sleep .bd{animation-delay:-1s}')
  expect(phaseCss(5000)).toContain('.zz0{animation-delay:-2s}')
  expect(phaseCss(Number.NaN)).toBe(phaseCss(0))
  expect(rowSvg(420, { ...ROW, phase: 5000 })).toContain('.sleep .bd{animation-delay:-1s}')
})

// ---------------------------------------------------------------------------
// Poses: one animation per activity (Addendum E)

test('every activity has a pose, and every pose draws on every character type', async () => {
  for (const a of ACTIVITIES) expect(POSES[a]).toBeDefined()
  for (const kind of KINDS) {
    for (const a of ACTIVITIES) {
      const g = spriteSvg(0, 0, kind, 0, a === 'sleeping' ? 'idle' : 'work', 1.25, a)
      expect(isWellFormed('<svg>' + g + '</svg>')).toBe(true)
      expect(g).not.toMatch(/NaN|undefined/)
      expect(g).toContain('c-' + kind)
    }
  }
})

test('no two activities share an identical svg, for any character type', async () => {
  for (const kind of KINDS) {
    const seen = new Map<string, Activity>()
    for (const a of ACTIVITIES) {
      const g = spriteSvg(0, 0, kind, 0, a === 'sleeping' ? 'idle' : 'work', 1.25, a)
      const other = seen.get(g)
      expect(other).toBeUndefined()
      seen.set(g, a)
    }
    expect(seen.size).toBe(ACTIVITIES.length)
  }
})

test('each activity carries its own props and class: the whole character animates, not a cue', async () => {
  const g = (a: Activity) => spriteSvg(0, 0, 'codex', 0, 'work', 1.25, a)
  expect(g('working')).toContain('class="sp c-codex run"')
  expect(g('reading')).toContain('class="sp c-codex a-reading"')
  expect(g('reading')).toContain('class="pg"')
  expect(g('reading')).toContain('class="bk"')
  expect(g('planning')).toContain('class="tb"')
  expect(count(g('planning'), 'class="d')).toBe(3)
  expect(g('coding')).toContain('class="kb"')
  expect(g('coding')).toContain('class="hl"')
  expect(g('coding')).toContain('class="hr"')
  expect(g('coding')).toContain('class="sc"')
  expect(g('testing')).toContain('class="cb"')
  expect(count(g('testing'), 'class="t')).toBeGreaterThanOrEqual(3)
  expect(g('testing')).toContain('class="mg"')
  expect(g('reviewing')).toContain('class="mg2"')
  expect(g('reviewing')).toContain('class="pp"')
  // Researching: magnifier, globe with a moving meridian, result cards popping in one by one.
  expect(g('researching')).toContain('class="sp c-codex a-researching"')
  expect(g('researching')).toContain('class="mg3"')
  expect(g('researching')).toContain('class="gl"')
  expect(g('researching')).toContain('class="gm"')
  expect(count(g('researching'), 'class="cd')).toBe(3)
  // Documenting: a scroll, lines appearing, a page turn, a quill.
  expect(g('documenting')).toContain('class="sp c-codex a-documenting"')
  expect(g('documenting')).toContain('class="sr"')
  expect(count(g('documenting'), 'class="tl')).toBe(3)
  expect(g('documenting')).toContain('class="pg2"')
  expect(g('documenting')).toContain('class="qu"')
  // Designing: a blueprint with a grid appearing, a pencil and a ruler.
  expect(g('designing')).toContain('class="sp c-codex a-designing"')
  expect(g('designing')).toContain('class="bp"')
  expect(g('designing')).toContain('class="gd0"')
  expect(g('designing')).toContain('class="gd1"')
  expect(g('designing')).toContain('class="pc"')
  expect(g('designing')).toContain('class="rl"')
  expect(g('landing')).toContain('class="rk"')
  expect(g('landing')).toContain('class="fg"')
  expect(g('asking')).toContain('class="qb"')
  expect(g('asking')).toContain('>?</text>')
  expect(g('red')).toContain('class="rf"')
  expect(g('red')).toContain('class="sw"')
  expect(g('red')).toContain('class="xm"')
  expect(g('stuck')).toContain('class="sp c-codex a-stuck"')
  // The hat, visor, glasses, antenna and propeller still apply in every pose.
  for (const a of ACTIVITIES) {
    if (a === 'sleeping') continue
    expect(g(a)).toContain('#E5484D')
    expect(g(a)).toContain('#0F2A25')
    expect(spriteSvg(0, 0, 'max', 0, 'work', 1.25, a)).toContain('#2B2A28')
    expect(spriteSvg(0, 0, 'local', 0, 'work', 1.25, a)).toContain('class="prop"')
    expect(spriteSvg(0, 0, 'api', 0, 'work', 1.25, a)).toContain('class="ant"')
  }
})

test('the eyes follow the pose: wide when asking, one squint when planning, spirals when stuck', async () => {
  const eyesOf = (a: Activity, kind = 'max') => {
    const g = spriteSvg(0, 0, kind, 0, 'work', 1.25, a)
    return (/<g class="ey">(.*?)<\/g>/.exec(g)?.[1] ?? '').match(/<rect/g)?.length ?? 0
  }
  expect(eyesOf('working')).toBe(2)
  expect(eyesOf('asking')).toBe(2)
  expect(spriteSvg(0, 0, 'max', 0, 'work', 1.25, 'asking')).toContain('width="3" height="3"')
  expect(eyesOf('planning')).toBe(2)
  expect(spriteSvg(0, 0, 'max', 0, 'work', 1.25, 'planning')).toContain('width="3" height="1"')
  // A spiral is a ring with a gap and a dot in the middle: 8 pixels per eye.
  expect(eyesOf('stuck')).toBe(16)
  expect(eyesOf('stuck', 'local')).toBe(16)
})

test('the pose CSS is CSS only, loops under 3 s, and is switched off for reduced motion', async () => {
  const svg = rowSvg(420, { ...ROW, activity: 'coding' })
  // Reduced motion leaves the pose, drops the motion.
  expect(svg).toContain('@media (prefers-reduced-motion: reduce){.sp *{animation:none!important}}')
  const css = svg.slice(svg.indexOf('.a-reading'))
  const periods = [...css.matchAll(/animation:[a-z0-9]+ ([0-9.]+)s/g)].map(m => Number(m[1]))
  expect(periods.length).toBeGreaterThan(20)
  for (const p of periods) expect(p).toBeLessThan(3)
  // Motion is transform and opacity only.
  const keyframes = [...css.matchAll(/@keyframes [a-z0-9]+\{(.*?)\}\}/g)].map(m => m[1] ?? '')
  for (const k of keyframes) expect(k).not.toMatch(/\b(width|height|top|left|margin|fill|stroke|color)\s*:/)
  // Every pose's animations divide the 5 s refresh (so a redraw restarts them in phase).
  for (const p of periods) expect(Math.abs(5 / p - Math.round(5 / p))).toBeLessThan(1e-9)
})

// ---------------------------------------------------------------------------
// The row

test('a row is ONE line of 28 px: character, name, activity chip with its target, short tag, time in state', async () => {
  const svg = rowSvg(420, ROW)
  expect(isWellFormed(svg)).toBe(true)
  expect(idsAreUnique(svg)).toBe(true)
  expect(count(svg, '<svg ')).toBe(1)
  expect(svg).toContain('width="420"')
  expect(svg).toContain('height="28"')
  expect(rowHeight(420, ROW)).toBe(28)
  expect(svg).toContain('codex-a')
  expect(svg).toContain('coding \u00b7 Billing Settings')
  expect(svg).toContain('#22C55E')
  expect(svg).toContain('>GPT-6 low<')
  expect(svg).toContain('>12s<')
  expect(svg).toContain('@keyframes')
  expect(svg).not.toMatch(/NaN|undefined/)
})

test('the one line carries nothing else: no description, tail, brief heading, meta, progress bar or hollow circle', async () => {
  const svg = rowSvg(420, { ...ROW, ratio: null, barLabel: 'tests running' })
  for (const gone of ['land FORMS-03b in one pass', 'ran the tests, 14 passed', 'b21b', 'tests running', 'Codex (ChatGPT plan)']) expect(svg).not.toContain(gone)
  expect(svg).not.toContain('class="sweep"')
  expect(svg).not.toContain('<circle')
  expect(svg).not.toContain('class="live"')
  for (const mode of ['work', 'idle', 'stale', 'dim'] as const) expect(rowHeight(420, { ...ROW, mode })).toBe(28)
})

test('the short tag: "GPT-6 low", "Sonnet 5.5", "API $"; the full powered-by text is not on the row', async () => {
  expect(shortTag('Codex (ChatGPT plan) \u00b7 GPT-6 Luna low')).toBe('GPT-6 low')
  expect(shortTag('Claude API \u00b7 Sonnet 5.5')).toBe('Sonnet 5.5')
  expect(shortTag('Claude API credit')).toBe('API $')
  expect(shortTag('')).toBe('')
  const live = rowSvg(520, { ...ROW, kind: 'api', powered: { text: 'Claude API \u00b7 Sonnet 5.5', isDim: false, badge: '$ API credit' } })
  expect(live).toContain('>Sonnet 5.5<')
  expect(live).not.toContain('$ API credit')
  expect(live).toMatch(/fill="#8B5CF6"[^>]*>Sonnet 5\.5/)
  // Dim when it is the last model seen; an explicit tag wins.
  expect(rowSvg(520, { ...ROW, kind: 'api', powered: { text: 'Claude API \u00b7 Sonnet 5.5', isDim: true, badge: '' } })).toMatch(/class="m"[^>]*>Sonnet 5\.5/)
  expect(rowSvg(520, { ...ROW, tag: 'API $' })).toContain('>API $<')
  expect(rowSvg(240, { ...ROW, powered: { text: '', isDim: false, badge: '' } })).not.toContain('GPT-6')
})

test('the context line: only on a row with a ratio, 3 px thin, no label, and a percent only from 70%', async () => {
  const none = rowSvg(420, ROW)
  expect(none).not.toContain('rx="1.5"')
  const low = rowSvg(420, { ...ROW, ratio: 0.42, barColor: '#22C55E' })
  expect(low).toContain('height="3" rx="1.5"')
  expect(low).not.toContain('42%')
  expect(rowHeight(420, { ...ROW, ratio: 0.42 })).toBe(28)
  const high = rowSvg(420, { ...ROW, ratio: 0.74, barColor: '#F0A500' })
  expect(high).toContain('74%')
  expect(high).toContain('fill="#F0A500"')
  expect(rowSvg(420, { ...ROW, ratio: 0.69 })).not.toContain('69%')
})

test('"stale?" and "stuck?": only when stale or stuck; stuck turns the row amber', async () => {
  expect(rowSvg(420, ROW)).not.toContain('stale?')
  expect(rowSvg(420, ROW)).not.toContain('stuck?')
  expect(rowSvg(420, { ...ROW, mode: 'stale', mark: 'stale', isStale: true })).toContain('stale?')
  const stuck = rowSvg(420, { ...ROW, mark: 'stuck', isStuck: true, activity: 'stuck', pill: { text: 'stuck \u00b7 Billing Settings', color: '#F59E0B' } })
  expect(stuck).toContain('stuck?')
  expect(stuck).toContain('opacity="0.12"')
  expect(rowSvg(420, ROW)).not.toContain('opacity="0.12"')
})

test('"blocked by": only a row with something wrong grows a second line: the amber chip and the reason; the asking pose on a sleeper', async () => {
  const chip = { text: 'blocked by codex-b', why: 'needs b20c installer fix on main' }
  const blocked = rowSvg(420, { ...ROW, mode: 'idle', mark: 'idle', activity: 'sleeping', chip })
  expect(blocked).toContain('blocked by codex-b')
  expect(blocked).toContain('needs b20c installer fix on main')
  expect(blocked).toContain('class="sp c-codex a-asking"')
  expect(blocked).not.toContain('class="zz')
  expect(isWellFormed(blocked)).toBe(true)
  expect(rowHeight(420, { ...ROW, chip })).toBe(28 + 18)
  expect(rowHeight(420, { ...ROW, chip: { text: 'blocked by you', why: '' } })).toBe(28 + 18)
  expect(rowHeight(420, ROW)).toBe(28)
  // A working blocked member keeps its own pose.
  expect(rowSvg(420, { ...ROW, activity: 'coding', chip })).toContain('class="sp c-codex a-coding"')
})

test('errored, out of credits and stuck each grow the second line; an inline chip ("landed") does not', async () => {
  const errored = rowSvg(420, { ...ROW, activity: 'errored', chips: [{ text: 'errored \u00b7 out of credits', color: '#B91C1C' }] })
  expect(errored).toContain('errored \u00b7 out of credits')
  expect(rowHeight(420, { ...ROW, chips: [{ text: 'errored', color: '#B91C1C' }] })).toBe(46)
  const out = { ...ROW, isOut: true, chips: [{ text: 'out of credits \u00b7 back Thu 9:00', color: '#6B7280' }] }
  expect(rowHeight(420, out)).toBe(46)
  expect(rowSvg(420, out)).toContain('back Thu 9:00')
  expect(rowHeight(420, { ...ROW, isStuck: true })).toBe(46)
  const landed = { ...ROW, chips: [{ text: 'landed ADMIN-01', color: '#FBBF24', inline: true }] }
  expect(rowHeight(420, landed)).toBe(28)
  expect(rowSvg(420, landed)).toContain('landed ADMIN-01')
})

test('out of credits: dimmed to 45%, the character sleeps with no z; a normal row is not dimmed', async () => {
  const out = rowSvg(420, { ...ROW, isOut: true, mode: 'idle', mark: 'idle' })
  expect(out).toContain('opacity="0.45"')
  expect(out).toContain('class="sp c-codex sleep out"')
  expect(out).not.toContain('class="zz')
  expect(rowSvg(420, ROW)).not.toContain('opacity="0.45"')
})

test('advice lines (context pressure) sit under the row in their own colours, 12 px each', async () => {
  const advice = [{ text: 'context 74%: write the handoff, then /clear', color: '#F0A500' }, { text: 'write the handoff first (ask the coordinator)', color: '#F0A500' }]
  const svg = rowSvg(520, { ...ROW, advice })
  expect(svg).toContain('context 74%: write the handoff, then /clear')
  expect(svg).toContain('write the handoff first (ask the coordinator)')
  expect(rowHeight(520, { ...ROW, advice })).toBe(28 + 24)
  expect(rowHeight(520, { ...ROW, advice: advice.slice(0, 1) })).toBe(28 + 12)
  expect(isWellFormed(svg)).toBe(true)
})

test('sleeping members collapse into ONE 28 px line: "3 sleeping" and the names; it never overflows', async () => {
  const members = [
    { kind: 'codex', variant: 0, name: 'codex-a' },
    { kind: 'codex', variant: 2, name: 'codex-c' },
    { kind: 'codex', variant: 3, name: 'codex-d' },
  ]
  for (const W of [360, 600, 900]) {
    const svg = sleepRowSvg(W, members)
    expect(isWellFormed(svg)).toBe(true)
    expect(svg).toContain('3 sleeping')
    expect(svg).toContain('height="28"')
    expect(svg).toContain('codex-a')
    expect(svg).not.toMatch(/NaN|undefined/)
    expect(svg).not.toContain('class="zz')
  }
  // Too many names for the width end in an ellipsis instead of running off.
  const many = Array.from({ length: 20 }, (_, i) => ({ kind: 'codex', variant: i % 4, name: 'codex-' + i }))
  const narrow = sleepRowSvg(360, many)
  expect(narrow).toContain('20 sleeping')
  expect(narrow).toContain('\u2026')
  expect(sleepRowSvg(360, members, true)).not.toBe(sleepRowSvg(360, members, false))
})

test('confetti: 24 pieces by default, CSS only, once, hidden for reduced motion, the same seed the same burst', async () => {
  const a = confettiSvg('ADMIN-01', 20, 14, 60, 20)
  expect(count(a, '<rect ')).toBe(24)
  expect(a).toContain('prefers-reduced-motion')
  expect(a).toContain('2s ease-out')
  expect(a).toContain('1 forwards')
  expect(a).not.toContain('infinite')
  expect(a).not.toMatch(/NaN|undefined/)
  expect(a).toBe(confettiSvg('ADMIN-01', 20, 14, 60, 20))
  expect(a).not.toBe(confettiSvg('ADMIN-02', 20, 14, 60, 20))
  const row = rowSvg(420, { ...ROW, burst: 'ADMIN-01' })
  expect(count(row, 'class="cfp')).toBe(24)
  expect(isWellFormed(row)).toBe(true)
  expect(rowSvg(420, ROW)).not.toContain('class="cf"')
})

test('everything shown is escaped: nothing renders as markup', async () => {
  const evil = '</text><script>alert(1)</script> & "quoted" <b>x</b>'
  const svg = rowSvg(520, {
    ...ROW,
    title: evil,
    powered: { text: evil, isDim: false, badge: evil },
    pill: { text: evil, color: '#22C55E' },
    meta: evil,
    description: evil,
    tail: evil,
    barLabel: evil,
    rightText: evil,
    chip: { text: evil, why: evil },
    advice: [{ text: evil, color: '#F0A500' }],
  })
  expect(svg).not.toContain('<script')
  expect(svg).not.toContain('<b>')
  expect(svg).toContain('&lt;script&gt;')
  expect(svg).toContain('&amp;')
  expect(svg).toContain('&quot;quoted&quot;')
  expect(isWellFormed(svg)).toBe(true)
})

test('a long description or tail never grows the row: they live in the hover card', async () => {
  const long = 'land the whole FORMS-03b change in one pass, then re-run the full gate and write the report for the coordinator'
  const svg = rowSvg(360, { ...ROW, description: long, tail: long })
  expect(svg).not.toContain('land the whole')
  expect(rowHeight(360, { ...ROW, description: long, tail: long })).toBe(28)
})

test('type scale: only 13, 11 and 10 px text in a row, whatever sizes a part asked for', async () => {
  const svg = rowSvg(420, { ...ROW, chip: { text: 'blocked by codex-b', why: 'a reason' }, advice: [{ text: 'x', color: '#F0A500' }], ratio: 0.8 })
  const sizes = new Set([...svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1])).filter((s) => s >= 9))
  for (const s of sizes) expect([11, 13, 15]).toContain(s)
})

test('a row with every number unknown still draws clean', async () => {
  const svg = rowSvg(Number.NaN, { ...ROW, ratio: Number.NaN, rightText: '-' })
  expect(isWellFormed(svg)).toBe(true)
  expect(svg).not.toMatch(/NaN|undefined|Infinity/)
  expect(rowSvg(120, { ...ROW, ratio: 2 })).not.toMatch(/NaN|undefined/)
  expect(rowSvg(120, { ...ROW, ratio: -1 })).not.toMatch(/NaN|undefined/)
})

test('wrapText: wraps to the asked lines, ends with an ellipsis when cut, never loses a short text', async () => {
  expect(wrapText('short', 12, 300)).toEqual(['short'])
  expect(wrapText('', 12, 300)).toEqual([''])
  const two = wrapText('one two three four five six seven eight nine ten eleven twelve', 12, 160, 2)
  expect(two.length).toBe(2)
  expect(two[1]?.endsWith('\u2026')).toBe(true)
  expect(wrapText('alpha beta gamma delta', 12, 100, 2).join(' ')).toBe('alpha beta gamma delta')
  expect(wrapText('x'.repeat(200), 12, 100, 2).every(l => l.length < 60)).toBe(true)
  // Many lines allowed: nothing is cut.
  const all = wrapText('word '.repeat(60), 12, 120, 40)
  expect(all.join(' ').replace(/\u2026/g, '').split(' ').filter(Boolean).length).toBe(60)
})

test('dotBar: a percent over 1 or under 0 is clamped; two bars in one svg need two ids', async () => {
  const over = dotBar({ x: 0, y: 0, w: 100, h: 12, ratio: 5, isWorking: false, color: '#fff', label: '' })
  const full = dotBar({ x: 0, y: 0, w: 100, h: 12, ratio: 1, isWorking: false, color: '#fff', label: '' })
  expect(over.svg).toBe(full.svg)
  expect(dotBar({ x: 0, y: 0, w: 100, h: 12, ratio: -3, isWorking: false, color: '#fff', label: '' }).svg).toContain('0%')
  expect(dotBar({ x: 0, y: 0, w: 100, h: 12, ratio: 0.5, isWorking: false, color: '#fff', label: '', id: 'x1' }).svg).toContain('id="x1"')
})

// ---------------------------------------------------------------------------
// The band, compact, reports and cast

const CHARS = [
  { kind: 'max', variant: 0, mode: 'work' as DrawMode, activity: 'working' as Activity },
  { kind: 'codex', variant: 0, mode: 'work' as DrawMode, activity: 'coding' as Activity },
  { kind: 'codex', variant: 1, mode: 'idle' as DrawMode },
  { kind: 'codex', variant: 2, mode: 'stale' as DrawMode },
  { kind: 'codex', variant: 3, mode: 'dim' as DrawMode },
  { kind: 'api', variant: 0, mode: 'idle' as DrawMode },
]

const BAND = {
  pillText: '2 working \u00b7 3 idle',
  isWorking: true,
  presence: { text: 'Active', isAway: false },
  badges: [] as { text: string; color: string }[],
  chars: CHARS,
  dots: [{ name: 'memory', color: '#F85149' }, { name: 'cpu', color: '#F0A500' }, { name: 'disk', color: '#3FB950' }],
}

test('band: counts pill, presence pill, characters and system dots in one svg row; no limits text', async () => {
  const wide = bandSvg(760, BAND)
  expect(isWellFormed(wide)).toBe(true)
  expect(count(wide, '<svg ')).toBe(1)
  expect(wide).toContain(`height="${BAND_H}"`)
  expect(wide).toContain('2 working')
  expect(wide).toContain('Active')
  // Codex usage is not in the band any more: it lives in the Limits area.
  expect(wide).not.toMatch(/5h|week|used|codex</)
  // Three system dots, worst first, in their level colours.
  expect(count(wide, '<circle')).toBe(3)
  expect([...wide.matchAll(/<circle [^>]*fill="(#\w+)"/g)].map(m => m[1])).toEqual(['#F85149', '#F0A500', '#3FB950'])
  expect(count(wide, 'class="sp c-')).toBe(6)
  // Idle characters sleep in the band; the coding one has its pose.
  expect(wide).toContain('class="sp c-codex sleep"')
  expect(wide).toContain('class="sp c-codex a-coding"')
  expect(wide).not.toMatch(/NaN|undefined/)
})

test('band: Away is an amber pill with a moon', async () => {
  const away = bandSvg(760, { ...BAND, presence: { text: 'Away', isAway: true } })
  expect(away).toContain('\u263e Away')
  expect(away).toContain('#F0A500')
  expect(bandSvg(760, BAND)).not.toContain('\u263e')
})

test('band: badges (you, errored, blocked, stuck, context, inbox) show in order; the characters give way first', async () => {
  const badges = [
    { text: 'you: 2', color: '#F85149' },
    { text: '1 errored', color: '#B91C1C' },
    { text: '2 blocked', color: '#F0A500' },
    { text: 'stuck?: codex-b', color: '#F0A500' },
    { text: 'context 74%: handoff', color: '#F0A500' },
    { text: '3 new', color: '#2F81F7' },
  ]
  const roomy = bandSvg(900, { ...BAND, badges })
  for (const b of badges) expect(roomy).toContain(b.text)
  expect(roomy).toContain('#2F81F7')
  expect(count(roomy, 'class="sp c-')).toBeGreaterThan(0)
  // Narrower: characters are dropped before a badge is.
  const mid = bandSvg(640, { ...BAND, badges })
  expect(mid).toContain('you: 2')
  expect(count(mid, 'class="sp c-')).toBeLessThan(6)
  // Very narrow: later badges go, but the first badge (the ask) stays; the errored badge sits next to blocked.
  const tight = bandSvg(420, { ...BAND, badges })
  expect(tight).toContain('you: 2')
  expect(tight).not.toContain('3 new')
  expect(isWellFormed(tight)).toBe(true)
  expect(tight).not.toMatch(/NaN|undefined/)
  expect(roomy.indexOf('1 errored')).toBeLessThan(roomy.indexOf('2 blocked'))
})

test('band: ONE line that never wraps and never overflows, at 360, 600 and 900 px, with everything on', async () => {
  const badges = [
    { text: 'you: 2', color: '#F85149' },
    { text: '1 errored', color: '#B91C1C' },
    { text: '2 blocked', color: '#F0A500' },
    { text: 'context 74%: handoff', color: '#F0A500' },
  ]
  for (const W of [360, 600, 900]) {
    const svg = bandSvg(W, { ...BAND, badges })
    expect(isWellFormed(svg)).toBe(true)
    expect(count(svg, '<svg ')).toBe(1)
    expect(svg).toContain(`viewBox="0 0 ${W} ${BAND_H}"`)
    expect(svg).toContain('2 working')
    for (const m of svg.matchAll(/<g transform="translate\(([\d.]+),4\)"><rect width="([\d.]+)"/g)) {
      expect(Number(m[1]) + Number(m[2])).toBeLessThanOrEqual(W)
    }
  }
})

test('band: zero characters and zero badges still draw', async () => {
  const svg = bandSvg(500, { ...BAND, chars: [], badges: [] })
  expect(isWellFormed(svg)).toBe(true)
  expect(count(svg, 'class="sp c-')).toBe(0)
})

test('compact, reports and cast are each one well-formed svg of the right height', async () => {
  const compact = compactSvg(400, [{ kind: 'max', variant: 0, mode: 'idle' }, { kind: 'codex', variant: 0, mode: 'work', activity: 'reading' }], '1 working \u00b7 1 idle')
  expect(isWellFormed(compact)).toBe(true)
  expect(compact).toContain(`height="${COMPACT_H}"`)
  expect(compact).toContain('a-reading')
  const reports = reportsSvg(400, [{ age: '4m ago', name: 'c-101-searxng-dev-doc.md' }, { age: '1h ago', name: 'c-100.md' }])
  expect(isWellFormed(reports)).toBe(true)
  expect(reports).toContain(`height="${reportsH(2)}"`)
  expect(reportsSvg(400, [])).toContain('none')
  const cast = KINDS.map(k => ({ kind: k, variant: 0, label: k }))
  const svg = castSvg(200, cast, 'work')
  expect(isWellFormed(svg)).toBe(true)
  expect(svg).toContain(`height="${castH(cast.length, 200)}"`)
  expect(count(svg, 'class="sp c-')).toBe(5)
})

test('awake animation periods divide the 5 s refresh; the sleeping 4 s and 3 s ones are phased', async () => {
  const svg = rowSvg(420, ROW) + spriteSvg(0, 0, 'local', 0, 'work')
  const rules = [...svg.matchAll(/animation(?:-duration)?:([a-z0-9]+) ?(-?[0-9.]+m?s)/g)].map(m => ({ name: m[1] ?? '', period: m[2] ?? '' }))
  const awake = rules.filter(r => r.name !== 'zb' && r.name !== 'zf')
  for (const { period } of awake) {
    const sec = period.endsWith('ms') ? parseFloat(period) / 1000 : parseFloat(period)
    if (!Number.isFinite(sec) || sec < 0) continue
    expect(Math.abs(5 / sec - Math.round(5 / sec))).toBeLessThan(1e-9)
  }
  expect(awake.length).toBeGreaterThan(3)
  expect(rules.some(r => r.name === 'zb' && r.period === '4s')).toBe(true)
  expect(rules.some(r => r.name === 'zf' && r.period === '3s')).toBe(true)
})
