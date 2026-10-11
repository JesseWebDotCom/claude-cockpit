// Desktop drawings for Cockpit: every row is ONE svg string, as in savvy-progress. The desktop
// app wraps sibling elements onto new lines, so a row's sprite, title, bar and numbers all live in
// one drawing. Pure string builders: no mods API, no I/O. Unit tested in tests/draw.test.ts.
//
// Technique (not content) from savvy-progress: PANE_CSS and sprite CSS inside the svg, pixel rects
// grouped by class and animated by CSS keyframes, a dotted textured bar with a rounded pill.
// The characters are this mod's own art (see sprites.ts for the palettes).

import { fin } from './core.ts'
import { themeCss } from './tokens.ts'
import { POSES, POSE_CSS, SHARED, SPRITES } from './sprites.ts'
import type { Activity, EyeStyle } from './sprites.ts'

// What a character is doing:
//   work  walks and bobs
//   idle  sleeps (closed eyes, low and still, slow breathing, floating z)
//   stale sleeps, greyed
//   dim   no session: awake but still and greyed
//   out   out of credits: asleep with no z, greyscale, about 45% opacity
// 'still' (COCKPIT-18) is an awake character standing still, in colour: no run animation and never asleep. The Session's idle look.
export type DrawMode = 'work' | 'idle' | 'stale' | 'dim' | 'out' | 'still'

export const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"
export const GREEN = '#3FB950'
export const AMBER = '#F0A500'
export const GREY = '#8B949E'
export const RED = '#F85149'
export const BLUE = '#2F81F7'

// ---------------------------------------------------------------------------
// Text helpers.

export const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

// Rough advance of system UI text, in em; good enough to size a slot.
const charEm = (ch: string): number => (/[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-Z@%mw]/.test(ch) ? 0.72 : 0.56)

export const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)

// Cuts `s` to fit `maxW` pixels, with an ellipsis when it had to cut.
export const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '\u2026', size) > maxW) break
    out += ch
  }
  return out + '\u2026'
}

// A number that can reach an attribute: never NaN, never Infinity.
export const n = (v: number, fallback = 0): number => (fin(v) ? Math.round(v * 100) / 100 : fallback)

// ---------------------------------------------------------------------------
// Shared CSS. Every animation period divides 5 s (the refresh), so a redraw restarts them in phase.

// The colours come from tokens.ts (dark first, a light set, never a default or white fill).
const paneCss = (): string => `<style>
${themeCss()}
.tw0,.tw1,.tw2,.tw3{opacity:.7}
@keyframes bt{to{stroke-dashoffset:-100}}.bring{stroke-opacity:.3}.bt{animation:bt 5s linear infinite}
@media (prefers-reduced-motion: reduce){.sweep{animation:none}.bring{stroke-opacity:.85}.bt{display:none}}
</style>`

const SPRITE_CSS = `<style>
.sp rect,.sp g{transform-box:fill-box;transform-origin:center}
.run .la{animation:st .5s steps(1) infinite}.run .lb{animation:st .5s steps(1) infinite -.25s}
.run .al{animation:st .5s steps(1) infinite -.25s}.run .ar{animation:st .5s steps(1) infinite}
.run .bd{animation:bob .5s steps(1) infinite -.125s}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
.sleep .bd{transform-origin:50% 100%;animation:zb 4s ease-in-out infinite}
@keyframes zb{50%{transform:scale(1.04)}}
.zz{opacity:0;animation:zf 3s ease-out infinite}
@keyframes zf{0%{opacity:0;transform:translate(0,2px)}20%{opacity:.9}100%{opacity:0;transform:translate(5px,-9px)}}
.c-codex.run .ey{animation:scan 1s steps(1) infinite}
@keyframes scan{33%{transform:translateX(-1px)}66%{transform:translateX(1px)}}
.c-api.run .ant{animation:wag 1s steps(1) infinite}
@keyframes wag{33%{transform:translateX(-1px)}66%{transform:translateX(1px)}}
.c-cloud.run .pf{animation:st .5s steps(1) infinite}
.c-local.run .prop{animation:spin .25s linear infinite}
@keyframes spin{50%{transform:scaleX(.15)}}
@media (prefers-reduced-motion: reduce){.run *,.sleep *{animation:none!important}.sleep .zz{opacity:.6}}
</style>`

// The sleeping animations (4 s breathing, 3 s floating z) do not divide the 5 s refresh, so each
// redraw starts them at the phase the wall clock says (a negative delay), not from the top.
//
// COCKPIT-20: the active card's travelling border (`.bt`, one lap in BORDER_PERIOD_MS) needs the same: the drawing is replaced every second while
// anything works, and without a delay each replacement restarted the lap from the top, so the bright stretch only ever covered the first fifth of
// the perimeter and then jumped back. Its delay is now the wall clock's place in the lap, so the next drawing carries on from where the last one was.
export const BORDER_PERIOD_MS = 5000

/**
 * Where the border's bright stretch is at `phaseMs` (wall-clock ms), as a cell of a perimeter of `cells` cells: 0 to cells - 1, round and
 * round. The CSS does the same with a negative animation delay; this is the rule, kept pure so a test can walk a whole lap.
 */
export function borderCell(phaseMs: number, cells: number): number {
  const n = Math.max(1, Math.floor(cells))
  const p = fin(phaseMs) ? Math.abs(phaseMs) : 0
  return Math.min(n - 1, Math.floor(((p % BORDER_PERIOD_MS) * n) / BORDER_PERIOD_MS))
}

export function phaseCss(phaseMs: number): string {
  const p = fin(phaseMs) ? Math.abs(phaseMs) : 0
  const d = (period: number, offset = 0): string => '-' + Math.round((((p + offset) % period) / 1000) * 100) / 100 + 's'
  return `<style>.bt{animation-delay:${d(BORDER_PERIOD_MS)}}.sleep .bd{animation-delay:${d(4000)}}.zz0{animation-delay:${d(3000)}}.zz1{animation-delay:${d(3000, 1000)}}.zz2{animation-delay:${d(3000, 2000)}}</style>`
}

// One svg document. Every row and card is one of these, so the desktop cannot wrap its parts.
export const doc = (W: number, H: number, body: string, extraCss = '', phase = 0): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}" height="${n(H)}" viewBox="0 0 ${n(W)} ${n(H)}">${paneCss()}${SPRITE_CSS}${POSE_CSS}${phaseCss(phase)}${extraCss}${body}</svg>`
    // Last resort: a stray NaN or undefined must not break the document.
    .replace(/\bNaN\b/g, '0')
    .replace(/\bundefined\b/g, '')
    // One type scale (tokens.ts): caption 11, body 13, title 15. (Sizes under 9 belong to a sprite's own
    // grid, which is scaled as a whole.)
    .replace(/font-size="([\d.]+)"/g, (whole, v: string) => {
      const s = Number(v)
      // COCKPIT-49: 18 is the status row's own head size (look.ts HEAD_FS); it used to be clamped to 15 here, so the drawn text was narrower than the width look.ts measured.
      return s < 9 ? whole : `font-size="${s >= 17 ? 18 : s >= 14 ? 15 : s >= 12 ? 13 : 11}"`
    })

// ---------------------------------------------------------------------------
// Characters: one pixel-rect sprite each, on a 26 x 23 grid. A rect belongs to a class group:
//   bd body (and props riding the bob)  la lb feet  al ar arms  ey eyes  and a prop's own class.

export const SPRITE_W = 26
export const SPRITE_H = 23

type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void
type Pal = Record<string, string>

const hex = (c: string): number => parseInt(c.slice(1), 16)
const mix = (c: string, to: string, t: number): string => {
  const a = hex(c)
  const b = hex(to)
  const ch = (shift: number) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t)
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)
}

// Round blob with a 1 px outline, two feet and two arms. Body x6..19, y6..17.
function blob(f: Fill, p: Pal): void {
  const O = p.O ?? '#000000'
  const B = p.B ?? '#888888'
  f(8, 4, 10, 1, O); f(6, 5, 14, 1, O); f(5, 6, 16, 12, O); f(6, 18, 14, 1, O); f(8, 19, 10, 1, O)
  f(8, 5, 10, 1, B); f(6, 6, 14, 12, B); f(8, 18, 10, 1, B)
  f(2, 11, 4, 5, O, 'al'); f(3, 12, 2, 3, B, 'al')
  f(20, 11, 4, 5, O, 'ar'); f(21, 12, 2, 3, B, 'ar')
  f(8, 20, 3, 3, O, 'la'); f(15, 20, 3, 3, O, 'lb')
}

// A 3 x 3 spiral for a dizzy eye: a ring with a gap and a dot in the middle (the CSS turns it).
const spiral = (f: Fill, x: number, y: number, c: string): void => {
  for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [1, 1]] as const) f(x + dx, y + dy, 1, 1, c, 'ey')
}

// Eyes by style. Open: two bars. Closed (asleep): lines three wide on the lower row, no blink. Wide:
// bigger squares. Squint: the left eye a line, the right open. Spiral: dizzy.
const eyes = (f: Fill, p: Pal, style: EyeStyle, y = 10): void => {
  const c = p.E ?? '#111111'
  if (style === 'closed') {
    f(8, y + 2, 3, 1, c, 'ey')
    f(15, y + 2, 3, 1, c, 'ey')
  } else if (style === 'wide') {
    f(8, y, 3, 3, c, 'ey')
    f(15, y, 3, 3, c, 'ey')
  } else if (style === 'squint') {
    f(8, y + 2, 3, 1, c, 'ey')
    f(15, y, 2, 3, c, 'ey')
  } else if (style === 'spiral') {
    spiral(f, 8, y, c)
    spiral(f, 15, y, c)
  } else {
    f(9, y, 2, 3, c, 'ey')
    f(15, y, 2, 3, c, 'ey')
  }
}
const mouth = (f: Fill, p: Pal, y = 15): void => f(12, y, 2, 1, p.M ?? '#333333')

const COSTUMES: Record<string, (f: Fill, p: Pal, eye: EyeStyle) => void> = {
  // Claude: Claude orange with round glasses.
  max: (f, p, eye) => {
    blob(f, p)
    eyes(f, p, eye)
    mouth(f, p)
    const g = '#2B2A28'
    f(7, 9, 5, 1, g); f(7, 13, 5, 1, g); f(7, 9, 1, 5, g); f(11, 9, 1, 5, g)
    f(14, 9, 5, 1, g); f(14, 13, 5, 1, g); f(14, 9, 1, 5, g); f(18, 9, 1, 5, g)
    f(12, 11, 2, 1, g)
  },
  // Session: the Claude critter in a classic peaked cap: a dark navy crown, a white band, a small gold badge and a dark bill.
  // Only the Session row wears it (the hat is part of the body group, so it stays on asleep and bobs with the head).
  captain: (f, p, eye) => {
    COSTUMES.max?.(f, p, eye)
    const navy = '#1F3A6E'
    const edge = '#0F2044'
    const gold = '#F5C518'
    f(10, 0, 6, 1, edge, 'hat'); f(8, 1, 10, 1, edge, 'hat')
    f(9, 1, 8, 1, navy, 'hat'); f(7, 2, 12, 2, navy, 'hat'); f(10, 1, 3, 1, mix(navy, '#FFFFFF', 0.3), 'hat')
    f(6, 4, 14, 1, '#FFFFFF', 'hat'); f(6, 5, 14, 1, edge, 'hat')
    f(11, 2, 4, 2, gold, 'hat'); f(12, 2, 2, 1, mix(gold, '#FFFFFF', 0.5), 'hat')
    f(8, 6, 10, 1, '#0A0F1C', 'hat')
  },
  // Codex: ChatGPT green, a dark visor with glowing eyes, a cap in the lane's colour.
  codex: (f, p, eye) => {
    blob(f, p)
    f(7, 9, 12, 5, p.V ?? '#0F2A25')
    eyes(f, p, eye)
    mouth(f, p)
    const a = p.A ?? '#F5C518'
    f(9, 1, 8, 1, a, 'hat'); f(8, 2, 10, 3, a, 'hat'); f(6, 5, 14, 1, mix(a, '#000000', 0.3), 'hat'); f(10, 2, 2, 1, mix(a, '#FFFFFF', 0.45), 'hat')
  },
  // API: violet, a blinking antenna and a bowtie.
  api: (f, p, eye) => {
    blob(f, p)
    eyes(f, p, eye)
    f(11, 14, 4, 1, p.M ?? '#333333')
    f(12, 2, 2, 2, p.S ?? '#C4B5FD'); f(11, 0, 4, 2, p.A ?? '#FDE047', 'ant')
    f(9, 16, 3, 2, '#FFFFFF'); f(14, 16, 3, 2, '#FFFFFF'); f(12, 16, 2, 2, p.M ?? '#333333')
  },
  // Cloud: sky blue, a cloud puff on top, rosy cheeks.
  cloud: (f, p, eye) => {
    blob(f, p)
    eyes(f, p, eye)
    mouth(f, p)
    f(7, 13, 2, 1, '#FF8FB1'); f(17, 13, 2, 1, '#FF8FB1')
    const c = p.C ?? '#EAF4FF'
    f(11, 0, 4, 1, c, 'pf'); f(9, 1, 8, 1, c, 'pf'); f(7, 2, 12, 2, c, 'pf')
  },
  // Local (a local model): near black, one big eye and one small, a crooked grin, a spinning propeller beanie.
  local: (f, p, eye) => {
    blob(f, p)
    const e = p.E ?? '#F2FBFF'
    if (eye === 'closed') {
      // Both eyes shut: a long line and a short one, the same two eyes as awake.
      f(8, 12, 5, 1, e, 'ey'); f(16, 12, 2, 1, e, 'ey')
    } else if (eye === 'squint') {
      f(8, 12, 5, 1, e, 'ey'); f(16, 10, 2, 2, e, 'ey')
    } else if (eye === 'spiral') {
      spiral(f, 9, 10, e); spiral(f, 16, 10, e)
    } else if (eye === 'wide') {
      f(8, 8, 6, 6, e); f(10, 10, 2, 2, '#0D1117', 'ey'); f(16, 9, 3, 3, e, 'ey')
    } else {
      f(8, 9, 5, 5, e); f(10, 11, 2, 2, '#0D1117', 'ey'); f(16, 10, 2, 2, e)
    }
    f(9, 15, 6, 1, p.M ?? '#C9D1D9'); f(15, 14, 2, 1, p.M ?? '#C9D1D9'); f(11, 16, 2, 2, '#FF8FB1')
    const a = p.A ?? '#F5C518'
    f(9, 2, 8, 1, a, 'hat'); f(8, 3, 10, 2, a, 'hat'); f(6, 5, 14, 1, mix(a, '#000000', 0.3), 'hat'); f(12, 2, 2, 3, mix(a, '#000000', 0.3), 'hat')
    f(12, 1, 2, 1, '#B8BEC6'); f(6, 0, 14, 1, '#B8BEC6', 'prop'); f(12, 0, 2, 1, '#FFFFFF')
  },
}

export function palOf(kind: string, variant: number): Pal {
  const def = SPRITES[kind] ?? SPRITES.max
  const pal: Pal = { ...SHARED.dark, ...(def?.dark ?? {}) }
  const variants = def?.variants ?? []
  const v = variants[variants.length > 0 ? Math.abs(variant) % variants.length : 0]
  if (v) pal.A = v.dark
  return pal
}

export function accentColor(kind: string): string {
  return (SPRITES[kind] ?? SPRITES.max)?.accent ?? '#D97757'
}

// One character as an svg fragment at (x, y), `scale` times its 26 x 23 grid.
//   work moves: `activity` picks how (the plain walk and bob for "working", else that activity's pose);
//   idle and stale sleep (stale greyed); dim is still and greyed (no session).
// A colour as its grey of the same brightness (no hue at all).
export const toGray = (c: string): string => {
  const v = hex(c)
  const g = Math.round(0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255))
  return '#' + ((1 << 24) | (g << 16) | (g << 8) | g).toString(16).slice(1)
}

export function spriteSvg(x: number, y: number, kind: string, variant: number, mode0: DrawMode, scale = 1.25, activity: Activity = 'working'): string {
  const known = COSTUMES[kind] ? kind : 'max'
  const pal = palOf(known, variant)
  // COCKPIT-18: the Session never sleeps: any asleep look is the awake still one, in colour, with no z, no breathing and no drooping.
  const wouldSleep = mode0 === 'idle' || mode0 === 'stale' || mode0 === 'out' || (mode0 === 'work' && activity === 'sleeping')
  const mode: DrawMode = known === 'captain' && wouldSleep ? 'still' : mode0
  const asleep = mode === 'idle' || mode === 'stale' || mode === 'out' || (mode === 'work' && activity === 'sleeping')
  const grey = mode === 'stale' || mode === 'dim' || mode === 'out'
  // COCKPIT-18: every other character that sleeps (or is dimmed) is drawn black and white, no colour accent.
  const bw = known !== 'captain' && (asleep || mode === 'dim')
  const pose = POSES[asleep ? 'sleeping' : mode === 'work' ? activity : 'working']
  const groups = new Map<string, string[]>([['bd', []]])
  const f: Fill = (cx, cy, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    const color = bw ? toGray(grey ? mix(c, '#808080', 0.6) : c) : grey ? mix(c, '#808080', 0.6) : c
    groups.get(cls)?.push(`<rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="${color}"/>`)
  }
  ;(COSTUMES[known] ?? COSTUMES.max)?.(f, pal, mode === 'dim' ? 'open' : pose.eyes)
  const group = (cls: string) => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  const outside = new Set(['bd', 'la', 'lb', 'al', 'ar'])
  const props = [...groups.keys()].filter(k => !outside.has(k))
  const body = `<g class="bd">${(groups.get('bd') ?? []).join('')}${props.map(group).join('')}</g>`
  const cls = asleep ? (mode === 'stale' ? 'sleep stale' : mode === 'out' ? 'sleep out' : 'sleep') : mode === 'work' ? (activity === 'working' ? 'run' : 'a-' + activity) : 'still'
  // The pose's props sit in front of the body, outside the group that bobs or tilts with the head.
  const poseGroups = new Map<string, string[]>()
  if (!asleep && mode === 'work') {
    pose.props((px, py, w, h, c, pcls) => {
      if (!poseGroups.has(pcls)) poseGroups.set(pcls, [])
      poseGroups.get(pcls)?.push(`<rect x="${px}" y="${py}" width="${w}" height="${h}" fill="${c}"/>`)
    }, pal)
  }
  const poseSvg = [...poseGroups].map(([pcls, rects]) => `<g class="${pcls}">${rects.join('')}</g>`).join('') + (!asleep && mode === 'work' ? pose.glyphs : '')
  const feet = `${group('la')}${group('lb')}`
  const arms = `${group('al')}${group('ar')}`
  let inner: string
  if (asleep) {
    // Asleep: the feet are drawn first and the body sits 2 px lower over them, arms with it; three z
    // drift up from the head. The hat, visor, glasses and beanie are part of the body and stay on.
    const zc = bw ? '#9a9a9a' : grey ? '#7d848c' : '#9AA4B2'
    // An out-of-credits member sleeps with no z: it is not idle by choice, it cannot work.
    const z = mode === 'out' ? '' : [
      `<text class="zz zz0" x="19" y="8" font-size="5" font-weight="700" font-family="${FONT}" fill="${zc}">z</text>`,
      `<text class="zz zz1" x="21" y="5" font-size="6" font-weight="700" font-family="${FONT}" fill="${zc}">z</text>`,
      `<text class="zz zz2" x="23" y="2" font-size="7" font-weight="700" font-family="${FONT}" fill="${zc}">z</text>`,
    ].join('')
    inner = `${feet}<g transform="translate(0,2)">${body}${arms}</g>${z}`
  } else {
    inner = `${body}${arms}${feet}${poseSvg}`
  }
  return `<g transform="translate(${n(x)},${n(y)}) scale(${n(scale, 1)})" opacity="${mode === 'out' ? 0.45 : grey ? 0.75 : 1}" shape-rendering="crispEdges"><g class="sp c-${known} ${cls}">${inner}</g></g>`
}

// ---------------------------------------------------------------------------
// The dotted bar: a rounded track, a dithered fill, and a pill with a label (as savvy-progress).

const CELL = 3

// Deterministic noise so the dither does not shimmer between redraws.
const noise = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

export type BarIn = {
  x: number
  y: number
  w: number
  h: number
  // 0..1, or null for no known percent.
  ratio: number | null
  isWorking: boolean
  color: string
  label: string
  // The clipPath id, when one svg holds more than one bar.
  id?: string
}

// Returns the bar fragment and the css its sweep needs.
export function dotBar(o: BarIn): { svg: string; css: string } {
  const cid = (o.id ?? 'bc').replace(/[^\w-]/g, '')
  const w = Math.max(30, n(o.w, 30))
  const h = n(o.h, 12)
  const rx = h / 2
  const rows = Math.max(1, Math.floor(h / CELL))
  const label = o.label.trim()
  const pillW = (text: string) => Math.min(w, Math.round(16 + textWidth(text, 10.5)))
  const dots: string[] = []
  let css = ''
  let pill = ''

  const ratio = o.ratio === null || !fin(o.ratio) ? null : Math.max(0, Math.min(1, o.ratio))
  if (ratio !== null) {
    const fillW = Math.round(w * ratio)
    const cols = Math.floor(fillW / CELL)
    for (let c = 0; c < cols; c++) {
      const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
      for (let r = 0; r < rows; r++) {
        if (noise(c, r) < density) dots.push(`<rect class="tw${Math.floor(noise(r, c) * 4)}" x="${c * CELL + 1}" y="${r * CELL + 1}" width="2" height="2"/>`)
      }
    }
    const text = fitText(label || Math.round(ratio * 100) + '%', 10.5, w - 16)
    const pw = pillW(text)
    const px = Math.max(0, Math.min(w - pw, fillW - pw))
    pill = pillSvg(px, h, pw, text, o.color)
  } else if (o.isWorking) {
    // Indeterminate: a soft band of dots sweeps across while the lane works.
    const win = Math.min(Math.round(w * 0.4), 90)
    const cols = Math.floor(win / CELL)
    for (let c = 0; c < cols; c++) {
      const density = 0.9 * Math.sin((Math.PI * (c + 0.5)) / Math.max(1, cols))
      for (let r = 0; r < rows; r++) {
        if (noise(c + 3, r) < density) dots.push(`<rect x="${c * CELL + 1}" y="${r * CELL + 1}" width="2" height="2"/>`)
      }
    }
    css = `<style>.sweep{animation:sw 2.5s linear infinite}@keyframes sw{from{transform:translateX(${-win}px)}to{transform:translateX(${w}px)}}</style>`
    const text = fitText(label || 'Active', 10.5, w - 16)
    pill = pillSvg(0, h, pillW(text), text, o.color)
    return {
      css,
      svg: `<g transform="translate(${n(o.x)},${n(o.y)})"><defs><clipPath id="${cid}"><rect width="${w}" height="${h}" rx="${rx}"/></clipPath></defs><rect class="k" width="${w}" height="${h}" rx="${rx}"/><g clip-path="url(#${cid})"><g class="sweep" fill="${o.color}">${dots.join('')}</g></g>${pill}</g>`,
    }
  } else {
    // Empty bar: the track and a small grey label.
    const text = fitText(label || 'idle', 10.5, w - 16)
    pill = pillSvg(0, h, pillW(text), text, GREY)
  }
  return {
    css,
    svg: `<g transform="translate(${n(o.x)},${n(o.y)})"><defs><clipPath id="${cid}"><rect width="${w}" height="${h}" rx="${rx}"/></clipPath></defs><rect class="k" width="${w}" height="${h}" rx="${rx}"/><g clip-path="url(#${cid})"><g fill="${o.color}">${dots.join('')}</g></g>${pill}</g>`,
  }
}

// A rounded pill with centred white text, at (x, 0) in the caller's group.
export function pillSvg(x: number, h: number, w: number, text: string, color: string): string {
  return `<rect x="${n(x)}" width="${n(w)}" height="${n(h)}" rx="${n(h / 2)}" fill="${color}"/><text x="${n(x + w / 2)}" y="${n(h / 2 + 3.8)}" text-anchor="middle" font-family="${FONT}" font-size="10.5" font-weight="600" fill="#ffffff">${xml(text)}</text>`
}

// ---------------------------------------------------------------------------
// A status mark at the end of a row's first line.

export type Mark = 'working' | 'idle' | 'stale' | 'stuck' | 'absent' | 'done' | 'failed'

function markSvg(x: number, y: number, m: Mark): string {
  if (m === 'working') return `<circle class="live" cx="${x}" cy="${y}" r="3.5" fill="${GREEN}"/>`
  if (m === 'done') return `<path d="M${x - 5} ${y}l3.5 3.5 6.5-7" fill="none" stroke="#3B9C5F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  if (m === 'failed') return `<path d="M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="#D0453F" stroke-width="1.8" stroke-linecap="round"/>`
  const color = m === 'stale' || m === 'stuck' ? AMBER : GREY
  return `<circle cx="${x}" cy="${y}" r="4.5" fill="none" stroke="${color}" stroke-width="1.4"/>`
}

// ---------------------------------------------------------------------------
// A lane, this session or a subagent: one row. The height depends on the description (one or two
// lines) and on whether a tail is shown; `rowHeight` says it, for the Svg element's `height` prop.

// Greedy word wrap into at most `maxLines` lines of at most `maxW` pixels; the last line ends with an
// ellipsis when the text did not fit. A word longer than a line is cut.
export function wrapText(text: string, size: number, maxW: number, maxLines = 2): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(w => w !== '')
  if (words.length === 0) return ['']
  const lines: string[] = []
  let line = ''
  let i = 0
  for (; i < words.length; i++) {
    const word = words[i] ?? ''
    const next = line === '' ? word : line + ' ' + word
    if (textWidth(next, size) <= maxW) {
      line = next
      continue
    }
    if (line === '') {
      // One word wider than a whole line: cut it.
      line = fitText(word, size, maxW)
      continue
    }
    // The last line takes whatever is left, with an ellipsis.
    if (lines.length === maxLines - 1) break
    lines.push(line)
    line = textWidth(word, size) <= maxW ? word : fitText(word, size, maxW)
  }
  if (i >= words.length) lines.push(line)
  else lines.push(fitText([line, ...words.slice(i)].join(' '), size, maxW))
  return lines
}

// The compact row (Addendum 8): ONE line of 28 px. [character 20 px] [name] [activity chip with its
// target] ... [right: state glyph, model short tag, time in state]. Nothing else. The description, the
// powered-by line, the brief heading, the lock and the report line live in the hover card. A row with
// something wrong (blocked, errored, red, stuck, out of credits) grows one second line of 18 px with
// the chip and the reason; context advice adds 12 px a line. Spacing is on a 4/8/12 px grid.
export const ROW_H = 28
export const WRONG_LINE = 18
export const ADVICE_LINE = 12
const GAP = 8
const CHAR = 20

type Layout = {
  H: number
  // The second line (the chip and the reason) is drawn.
  second: boolean
  adviceY: number[]
  TX: number
}

// A row is "wrong" when a chip says so: blocked, errored, out of credits, stuck.
const isWrong = (r: RowIn): boolean => r.chip !== null || (r.chips ?? []).some((c) => !c.inline) || r.isStuck === true

function layoutOf(_W: number, r: RowIn): Layout {
  const TX = Math.max(0, r.indent ?? 0) + 4 + CHAR + 6
  const second = isWrong(r)
  const top = ROW_H + (second ? WRONG_LINE : 0)
  const adviceY = r.advice.map((_, i) => top + i * ADVICE_LINE)
  return { H: top + r.advice.length * ADVICE_LINE, second, adviceY, TX }
}

export const rowHeight = (W: number, r: RowIn): number => layoutOf(W, r).H

// The short tag for what powers a member: "GPT-6 low", "Sonnet 5.5", "API $"; the full text is on hover.
export function shortTag(text: string): string {
  const t = text.trim()
  if (t === '') return ''
  const gpt = /\bGPT-?(\d+(?:\.\d+)?)\b(?:.*?\b(minimal|low|medium|high|xhigh)\b)?/i.exec(t)
  if (gpt) return `GPT-${gpt[1]}${gpt[2] ? ' ' + gpt[2].toLowerCase() : ''}`
  const claude = /\b(Sonnet|Opus|Haiku)\s*(\d+(?:\.\d+)?)/i.exec(t)
  if (claude) return `${claude[1]} ${claude[2]}`
  if (/^claude$/i.test(t)) return 'Claude'
  if (/\bcodex\b/i.test(t)) return 'Codex'
  if (/api|credit|\$/i.test(t)) return 'API $'
  if (/cloud/i.test(t)) return 'cloud'
  if (/local|ollama/i.test(t)) return 'local'
  return fitText(t, 10, 70)
}

export type RowIn = {
  kind: string
  variant: number
  mode: DrawMode
  // How a working member moves: "coding" types, "reading" holds a book, and so on (sprites.ts).
  activity: Activity
  mark: Mark
  title: string
  // What powers the member, next to its name in the type colour; dim when it is the last model seen.
  powered: { text: string; isDim: boolean; badge: string }
  // The one activity word and its target, in a coloured pill: "coding . Home Settings".
  pill: { text: string; color: string }
  // After the pill: the item id, for instance.
  meta: string
  isStale: boolean
  // A working member whose pane has not changed for 45 minutes: the row turns amber.
  isStuck: boolean
  // "blocked by codex-b" with its why on the lines below.
  chip: { text: string; why: string } | null
  ratio: number | null
  barLabel: string
  // The bar's colour; empty is the type colour (amber when stale or stuck).
  barColor: string
  // Right of the bar: a percent, or how long the pane has been unchanged.
  rightText: string
  // What the session is doing, in plain words: one line, two at most, brighter than the tail.
  description: string
  // Lines under the description, each in its own colour (context pressure and the handoff advice).
  advice: { text: string; color: string }[]
  // The filtered last line of the pane (not drawn in the compact row; kept for the details).
  tail: string
  // Wall-clock ms, so the sleeping animations continue in phase across redraws.
  phase?: number
  // Chips: errored and out of credits (with its reset) go on the second line with the reason; an
  // `inline` chip ("landed <item>") sits on the one line.
  chips?: { text: string; color: string; inline?: boolean }[]
  // The short model tag at the right ("GPT-6 low"); empty derives it from `powered.text`.
  tag?: string
  // Time in state at the right ("12s", "4m"); empty uses `rightText`.
  since?: string
  // Out of credits: the row is dimmed (about 45% opacity) and the character sleeps with no z.
  isOut?: boolean
  // A confetti burst over the character: the seed, or '' for none. CSS only; drawn for 2 s after a landing.
  burst?: string
  // Pixels to indent the row (a subagent sits under its owner).
  indent?: number
  // The details card text (details.ts), as the row's hover tooltip: one `<title>`, lines joined with newlines.
  tip?: string
}

// A hover tooltip for the whole svg: the card's lines, escaped, one per line.
export const titleSvg = (lines: readonly string[] | string | undefined): string => {
  const text = (typeof lines === 'string' ? [lines] : lines ?? []).filter(l => l.trim() !== '').join('\n')
  return text === '' ? '' : `<title>${xml(text)}</title>`
}

// A small chip: a rounded pill with caption text, `dark` text on a light colour (amber).
const chipSvg = (x: number, y: number, w: number, text: string, color: string): string =>
  `<g transform="translate(${n(x)},${n(y)})"><rect width="${n(w)}" height="16" rx="8" fill="${color}"/><text x="${n(w / 2)}" y="11.4" text-anchor="middle" font-family="${FONT}" font-size="10" font-weight="600" fill="${color === AMBER || color === '#FBBF24' ? '#1f1f1f' : '#ffffff'}">${xml(text)}</text></g>`

// A group wrapper at a scale puts a 26x24 sprite grid into a 20 px character.
const CHAR_SCALE = CHAR / 26

export function rowSvg(W: number, r: RowIn): string {
  const L = layoutOf(W, r)
  const TX = L.TX
  const ind = Math.max(0, r.indent ?? 0)
  const accent = accentColor(r.kind)
  const blocked = r.chip !== null
  // A blocked member that is idle or stale is drawn in the asking pose instead of asleep; an errored one is
  // slumped with dizzy eyes whatever the pane is doing. An out-of-credits member sleeps with no z, greyscale.
  const sx = ind + 4
  const sprite = r.isOut
    ? spriteSvg(sx, 4, r.kind, r.variant, 'out', CHAR_SCALE)
    : (blocked || r.activity === 'errored' || r.activity === 'cheering') && r.mode !== 'work' && r.mode !== 'dim'
      ? spriteSvg(sx, 4, r.kind, r.variant, 'work', CHAR_SCALE, r.activity === 'errored' || r.activity === 'cheering' ? r.activity : 'asking')
      : spriteSvg(sx, 4, r.kind, r.variant, r.mode, CHAR_SCALE, r.activity)

  // The right end, from the edge in: the state glyph (a check or a cross only), the time in state, the short tag.
  let rx = W - GAP
  const glyph = r.mark === 'done' || r.mark === 'failed' ? markSvg(n(rx - 5), 14, r.mark) : ''
  if (glyph !== '') rx -= 16
  const since = (r.since ?? r.rightText).trim()
  const sinceText = since === '' ? '' : fitText(since, 10, 44)
  const sinceX = rx
  if (sinceText !== '') rx -= textWidth(sinceText, 10) + 6
  const tagText = (r.tag ?? shortTag(r.powered.text)).trim()
  const tag = tagText === '' ? '' : fitText(tagText, 10, Math.max(0, Math.min(86, W * 0.24)))
  const tagX = rx
  if (tag !== '') rx -= textWidth(tag, 10) + 6

  // The name and the activity chip with its target, in what room is left; flags and inline chips follow.
  const room = Math.max(40, rx - TX - GAP)
  const name = fitText(r.title, 13, Math.max(30, room * 0.42))
  const nameW = textWidth(name, 13)
  const pillX = TX + nameW + 6
  const flag = r.isStuck ? 'stuck?' : r.isStale ? 'stale?' : ''
  const flagW = flag === '' ? 0 : textWidth(flag, 10) + 6
  const pillText = fitText(r.pill.text, 10, Math.max(20, rx - pillX - flagW - 14 - 4))
  const pillW = Math.round(textWidth(pillText, 10) + 14)
  let cx = pillX + pillW + 6
  const flagParts = flag === '' ? '' : `<text x="${n(cx)}" y="17" font-family="${FONT}" font-size="10" font-weight="600" fill="${AMBER}">${xml(flag)}</text>`
  cx += flagW
  const inline = (r.chips ?? []).filter((c) => c.inline === true)
  const inlineParts: string[] = []
  for (const c of inline) {
    const w = Math.round(textWidth(c.text, 10) + 14)
    if (cx + w > rx - 4) break
    inlineParts.push(chipSvg(cx, 6, w, c.text, c.color))
    cx += w + 4
  }

  // The second line, only for a row with something wrong: the chips, then the reason.
  let second = ''
  if (L.second) {
    const chips: { text: string; color: string }[] = [...(r.chip !== null ? [{ text: r.chip.text, color: AMBER }] : []), ...(r.chips ?? []).filter((c) => c.inline !== true)]
    if (r.isStuck && !chips.some((c) => /stuck/i.test(c.text))) chips.push({ text: 'stuck', color: AMBER })
    let sx2 = TX
    for (const c of chips) {
      const text = fitText(c.text, 10, Math.max(20, W - sx2 - GAP - 14))
      const w = Math.round(textWidth(text, 10) + 14)
      if (sx2 + w > W - GAP) break
      second += chipSvg(sx2, 26, w, text, c.color)
      sx2 += w + 4
    }
    const why = r.chip !== null ? r.chip.why.trim() : ''
    const whyRoom = W - GAP - sx2
    if (why !== '' && whyRoom > 40) second += `<text class="s" x="${n(sx2)}" y="${ROW_H + 11}" font-family="${FONT}" font-size="10">${xml(fitText(why, 10, whyRoom))}</text>`
  }
  const advice = r.advice
    .map((a, i) => `<text x="${TX}" y="${(L.adviceY[i] ?? 0) + 9}" font-family="${FONT}" font-size="10" font-weight="600" fill="${a.color}">${xml(fitText(a.text, 10, W - TX - GAP))}</text>`)
    .join('')

  // The coordinator's context: a thin 3 px under-line, never a labelled bar; a percent only at 70% and over.
  const ratio = r.ratio !== null && fin(r.ratio) ? Math.max(0, Math.min(1, r.ratio)) : null
  const color = r.barColor !== '' ? r.barColor : r.isStale || r.isStuck ? AMBER : accent
  const lineW = Math.max(0, W - TX - GAP)
  const thin = ratio === null ? '' : `<rect class="k" x="${n(TX)}" y="${ROW_H - 4}" width="${n(lineW)}" height="3" rx="1.5"/><rect x="${n(TX)}" y="${ROW_H - 4}" width="${n(lineW * ratio)}" height="3" rx="1.5" fill="${color}"/>`
  const pct = ratio !== null && ratio >= 0.7 ? `<text x="${n(sinceText !== '' ? sinceX - textWidth(sinceText, 10) - 6 : sinceX)}" y="17" text-anchor="end" font-family="${FONT}" font-size="10" font-weight="600" fill="${color}">${Math.round(ratio * 100)}%</text>` : ''

  const texts = `<text class="t" x="${n(TX)}" y="19" font-family="${FONT}" font-size="13" font-weight="600">${xml(name)}</text>${tag !== '' ? `<text x="${n(tagX - textWidth(tag, 10))}" y="18" font-family="${FONT}" font-size="10"${r.powered.isDim ? ' class="m"' : ` fill="${accent}"`}>${xml(tag)}</text>` : ''}${sinceText !== '' ? `<text class="s" x="${n(sinceX)}" y="18" text-anchor="end" font-family="${FONT}" font-size="10" font-variant-numeric="tabular-nums">${xml(sinceText)}</text>` : ''}${flagParts}${pct}`
  const burst = r.burst !== undefined && r.burst !== '' ? confettiSvg(r.burst, sx + 10, 14, 60, 20) : ''
  return doc(
    W,
    L.H,
    `${titleSvg(r.tip)}${r.isStuck ? `<rect width="${n(W)}" height="${L.H}" fill="${AMBER}" opacity="0.12"/>` : ''}<g${r.isOut ? ' opacity="0.45"' : ''}>${sprite}${texts}<g transform="translate(${n(pillX)},6)">${pillSvg(0, 16, pillW, pillText, r.pill.color)}</g>${inlineParts.join('')}</g>${second}${advice}${glyph}${thin}${burst}
<line class="ln" x1="0" y1="${L.H - 0.5}" x2="${n(W)}" y2="${L.H - 0.5}"/>`,
    '',
    r.phase ?? 0,
  )
}

// "3 sleeping: codex-a, codex-c, codex-d" as ONE 28 px line of tiny characters with names. Click expands.
export type SleepIn = { kind: string; variant: number; name: string }

export function sleepRowSvg(W: number, members: SleepIn[], expanded = false): string {
  const label = `${members.length} sleeping`
  let x = 8 + textWidth(label, 11) + 10
  const parts: string[] = []
  for (const m of members) {
    const nm = fitText(m.name, 10, 90)
    const w = 14 + 4 + textWidth(nm, 10) + 10
    if (x + w > W - 22) {
      parts.push(`<text class="m" x="${n(x)}" y="18" font-family="${FONT}" font-size="10">…</text>`)
      break
    }
    parts.push(`${spriteSvg(x, 7, m.kind, m.variant, 'dim', 14 / 26)}<text class="s" x="${n(x + 18)}" y="18" font-family="${FONT}" font-size="10">${xml(nm)}</text>`)
    x += w
  }
  const chevron = `<path d="${expanded ? `M${n(W - 18)} 16l4-4 4 4` : `M${n(W - 18)} 12l4 4 4-4`}" fill="none" stroke="${GREY}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
  return doc(
    W,
    ROW_H,
    `<text class="s" x="8" y="18" font-family="${FONT}" font-size="11" font-weight="600">${xml(label)}</text>${parts.join('')}${chevron}
<line class="ln" x1="0" y1="${ROW_H - 0.5}" x2="${n(W)}" y2="${ROW_H - 0.5}"/>`,
    '',
    0,
  )
}

// ---------------------------------------------------------------------------
// Confetti: a 2 s burst of small pieces in the palette colours, CSS only (transform and opacity), once.
// Each piece has its own keyframes so the svg needs no CSS variables. Reduced motion hides the burst.

const CONFETTI = ['#F5C518', '#EF4444', '#3B82F6', '#22C55E', '#A855F7', '#F472B6', '#06B6D4', '#F97316']

// A small deterministic generator from a seed string.
function rng(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return () => {
    h ^= h << 13
    h >>>= 0
    h ^= h >>> 17
    h ^= h << 5
    h >>>= 0
    return h / 4294967296
  }
}

// `count` pieces start at (cx, cy) and fly out over about `spread` px wide and `rise` px up, spinning and
// fading, for 2 s, then stay gone (animation-fill-mode forwards at opacity 0).
export function confettiSvg(seed: string, cx: number, cy: number, spread: number, rise: number, count = 24): string {
  const rand = rng(seed || 'burst')
  const pieces: string[] = []
  const css: string[] = []
  for (let i = 0; i < count; i++) {
    const dx = (rand() - 0.5) * 2 * spread
    const dy = -rand() * rise - 6 + rand() * 18
    const rot = Math.round((rand() - 0.5) * 720)
    const w = 2 + Math.round(rand() * 2)
    const h = 2 + Math.round(rand() * 3)
    const color = CONFETTI[i % CONFETTI.length] ?? '#F5C518'
    const delay = Math.round(rand() * 20) / 100
    css.push(`@keyframes cf${i}{from{transform:translate(0,0) rotate(0deg);opacity:1}to{transform:translate(${n(dx)}px,${n(dy)}px) rotate(${rot}deg);opacity:0}}.cfp${i}{animation:cf${i} 2s ease-out ${delay}s 1 forwards;opacity:0}`)
    pieces.push(`<rect class="cfp${i}" x="${n(cx)}" y="${n(cy)}" width="${w}" height="${h}" fill="${color}"/>`)
  }
  return `<style>${css.join('')}@media (prefers-reduced-motion: reduce){.cf{display:none}}</style><g class="cf">${pieces.join('')}</g>`
}

// ---------------------------------------------------------------------------
export type Run = { text: string; color?: string }

// ---------------------------------------------------------------------------
// The band above the prompt: the counts pill, the Active/Away pill, the badges that need a look
// (you, blocked, stuck, context, inbox), the characters, and the codex limits at the right.

export const BAND_H = 26

export type Badge = { text: string; color: string; tip?: string }

export type BandIn = {
  pillText: string
  isWorking: boolean
  // "Active" (green) or "Away" (amber, with a moon).
  presence: { text: string; isAway: boolean }
  // In priority order; a badge that does not fit is left out, and the characters give way first.
  badges: Badge[]
  // `tip` is the member's details card, a hover tooltip.
  chars: { kind: string; variant: number; mode: DrawMode; activity?: Activity; tip?: string }[]
  // The system dots (memory, CPU, disk, each listed host that answers), worst first, each a small dot in its level colour.
  dots?: { name: string; color: string }[]
  // The numbers behind the dots, as one hover tooltip.
  dotsTip?: string
  phase?: number
}

export const DOT_STEP = 12

// A badge pill: dark text on amber, white on the rest.
const badgeSvg = (x: number, w: number, text: string, color: string, tip?: string): string =>
  `<g transform="translate(${n(x)},4)">${titleSvg(tip)}<rect width="${n(w)}" height="18" rx="9" fill="${color}"/><text x="${n(w / 2)}" y="12.6" text-anchor="middle" font-family="${FONT}" font-size="10.5" font-weight="700" fill="${color === AMBER ? '#1f1f1f' : '#ffffff'}">${xml(text)}</text></g>`

export function bandSvg(W: number, b: BandIn): string {
  const pillW = Math.round(textWidth(b.pillText, 11) + 22)
  const presText = (b.presence.isAway ? '\u263e ' : '') + b.presence.text
  const presW = Math.round(textWidth(presText, 11) + 20)
  // One line, never wraps: [counts] [Active] [characters] [system dots] [badges: you, errored, blocked, context...].
  // The pills and the system dots stay; the badges are placed in priority order and stop at the first that
  // does not fit (the first one, the most important, is always placed); the characters take what is left.
  const dots = (b.dots ?? []).slice(0, 4)
  const dotsW = dots.length === 0 ? 0 : dots.length * DOT_STEP + 6
  const left = pillW + 6 + presW + 8
  let tail = 0
  const shown: { text: string; color: string; w: number; tip?: string }[] = []
  for (const [i, bd] of b.badges.entries()) {
    const w = Math.round(textWidth(bd.text, 10) + 16)
    if (i > 0 && left + dotsW + tail + w + 6 > W - 4) break
    shown.push({ ...bd, w })
    tail += w + 6
  }
  const step = 25
  const room = W - left - dotsW - tail - 8
  const fit = Math.max(0, Math.min(b.chars.length, Math.floor(room / step)))
  const scale = 0.72
  const sy = (BAND_H - SPRITE_H * scale) / 2
  const chars = b.chars
    .slice(0, fit)
    .map((c, i) => `<g>${titleSvg(c.tip)}${spriteSvg(left + 4 + i * step, sy, c.kind, c.variant, c.mode, scale, c.activity ?? 'working')}</g>`)
    .join('')
  const dotsX = left + (fit > 0 ? fit * step + 8 : 0)
  const dotParts = dots.length === 0 ? '' : `<g>${titleSvg(b.dotsTip)}${dots.map((d, i) => `<circle cx="${n(dotsX + 5 + i * DOT_STEP)}" cy="${BAND_H / 2}" r="4" fill="${d.color}"/>`).join('')}</g>`
  let bx = dotsX + dotsW
  const badges = shown
    .map(s => {
      const out = badgeSvg(bx, s.w, s.text, s.color, s.tip)
      bx += s.w + 6
      return out
    })
    .join('')
  return doc(
    W,
    BAND_H,
    `<rect x="0" y="3" width="${pillW}" height="20" rx="10" fill="${b.isWorking ? GREEN : GREY}"/>
<text x="${n(pillW / 2)}" y="17" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" fill="#ffffff">${xml(b.pillText)}</text>
<rect x="${n(pillW + 6)}" y="3" width="${presW}" height="20" rx="10" fill="${b.presence.isAway ? AMBER : GREEN}"/>
<text x="${n(pillW + 6 + presW / 2)}" y="17" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" fill="${b.presence.isAway ? '#1f1f1f' : '#ffffff'}">${xml(presText)}</text>
${chars}${dotParts}
${badges}`,
    '',
    b.phase ?? 0,
  )
}

// ---------------------------------------------------------------------------
// Compact: the characters in a row and the totals at the right.

export const COMPACT_H = 32

export function compactSvg(
  W: number,
  chars: { kind: string; variant: number; mode: DrawMode; activity?: Activity }[],
  summary: string,
  phase = 0,
): string {
  const step = 34
  const fit = Math.max(1, Math.floor((W - textWidth(summary, 12) - 16) / step))
  const shown = chars.slice(0, fit)
  const more = chars.length - shown.length
  return doc(
    W,
    COMPACT_H,
    `${shown.map((c, i) => spriteSvg(i * step, 0, c.kind, c.variant, c.mode, 1.1, c.activity ?? 'working')).join('')}${more > 0 ? `<text class="s" x="${shown.length * step}" y="21" font-family="${FONT}" font-size="12">+${more}</text>` : ''}
<text class="s" x="${n(W)}" y="21" text-anchor="end" font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">${xml(summary)}</text>`,
    '',
    phase,
  )
}

// ---------------------------------------------------------------------------
// The newest reports: up to three lines in one svg.

export const reportsH = (count: number): number => Math.max(1, count) * 18 + 4

export function reportsSvg(W: number, rows: { age: string; name: string }[]): string {
  const list = rows.length > 0 ? rows : [{ age: '', name: 'none' }]
  return doc(
    W,
    reportsH(list.length),
    list
      .map((r, i) => {
        const y = 14 + i * 18
        const ageW = r.age ? 44 : 0
        return `${r.age ? `<text class="m" x="0" y="${y}" font-family="${FONT}" font-size="11.5" font-variant-numeric="tabular-nums">${xml(r.age)}</text>` : ''}<text class="s" x="${ageW}" y="${y}" font-family="${FONT}" font-size="11.5">${xml(fitText(r.name, 11.5, Math.max(20, W - ageW)))}</text>`
      })
      .join(''),
  )
}

// ---------------------------------------------------------------------------
// The cast: every character, with its name, to look at them.

export const CAST_CELL_W = 64
export const CAST_ROW_H = 56

export function castH(count: number, W: number): number {
  const perRow = Math.max(1, Math.floor(W / CAST_CELL_W))
  return Math.ceil(count / perRow) * CAST_ROW_H
}

/** The cast's drawing without its document wrapper (from y 0), so a card can hold it. */
export function castInner(W: number, cast: { kind: string; variant: number; label: string }[], mode: DrawMode): string {
  const perRow = Math.max(1, Math.floor(W / CAST_CELL_W))
  return cast
    .map((c, i) => {
      const x = (i % perRow) * CAST_CELL_W
      const y = Math.floor(i / perRow) * CAST_ROW_H
      return `${spriteSvg(x + 14, y + 2, c.kind, c.variant, mode, 1.4)}<text class="s" x="${x + 32}" y="${y + 50}" text-anchor="middle" font-family="${FONT}" font-size="11">${xml(c.label)}</text>`
    })
    .join('')
}

export function castSvg(
  W: number,
  cast: { kind: string; variant: number; label: string }[],
  mode: DrawMode,
  phase = 0,
): string {
  return doc(W, castH(cast.length, W), castInner(W, cast, mode), '', phase)
}
