// COCKPIT-TREE-01 round 2: builds the tiny workers' pixel-art frames. Run `bun tools/buildsprites.ts`; it writes hooks/workersprites.ts (committed, so the plugin never reads a PNG at run time).
//
// The people are the characters of Kenney's "Tiny Dungeon" pack (CC0, public domain; see NOTICE and assets/workers/). Each of the eight job kinds uses its own person from the
// same pack, so the cast reads as one family. The pack has no people reading, typing or hammering, so the props (book, laptop, hammer and anvil, clipboard, stopwatch,
// magnifier, raised hand, speech dots) are drawn here as small pixel grids in the pack's own palette. Frames are composed on a 22 x 21 canvas: the 16 x 16 person at (3, 4),
// the props around them. Output is SVG rectangles (one per horizontal run of one colour), so it draws crisp on any surface without an image decoder.
import { writeFileSync } from 'node:fs'
import { readPng } from './pngpix.ts'

const SHEET = new URL('../assets/workers/tiny-dungeon-tilemap.png', import.meta.url).pathname
export const CW = 24
export const CH = 21
const PX = 3
const PY = 4

// The pack's palette (read from the tiles below) plus the few colours the props need.
const C: Record<string, string> = {
  o: '#3f2631', // outline
  w: '#f4f6fa', // paper, white
  l: '#c0cbdc', // light steel
  g: '#8b9bb4', // steel
  d: '#52607c', // dark steel
  b: '#bd6c4a', // wood
  B: '#763b36', // dark wood
  s: '#f7c282', // skin
  S: '#e19a65', // skin shade
  k: '#262b44', // ink
  G: '#3fb950', // tick green
  y: '#ffd75e', // spark
  c: '#9ad1ff', // glass
  r: '#d9534f', // red marker
}

type Cell = string | null
type Grid = Cell[][]
const blank = (): Grid => Array.from({ length: CH }, () => Array<Cell>(CW).fill(null))

/** A person from the sheet: a 16 x 16 grid of hex colours (null = clear). Tiles sit 17 px apart (1 px gutter). */
const sheet = readPng(SHEET)
function person(col: number, row: number): Grid {
  const g: Grid = []
  for (let y = 0; y < 16; y++) {
    const r: Cell[] = []
    for (let x = 0; x < 16; x++) {
      const i = ((row * 17 + y) * sheet.w + col * 17 + x) * 4
      r.push(sheet.rgba[i + 3]! < 128 ? null : '#' + [0, 1, 2].map(k => sheet.rgba[i + k]!.toString(16).padStart(2, '0')).join(''))
    }
    g.push(r)
  }
  return g
}

function stamp(cv: Grid, art: readonly string[] | Grid, x: number, y: number): void {
  art.forEach((line, j) => {
    for (let i = 0; i < line.length; i++) {
      const v = typeof line === 'string' ? (line[i] === '.' || line[i] === ' ' ? null : C[line[i]!] ?? null) : (line as Cell[])[i] ?? null
      const px = x + i
      const py = y + j
      if (v !== null && px >= 0 && px < CW && py >= 0 && py < CH) cv[py]![px] = v
    }
  })
}
const erase = (cv: Grid, x0: number, y0: number, x1: number, y1: number): void => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cv[y]![x] = null
}
const recolour = (g: Grid, from: string, to: string): Grid => g.map(r => r.map(v => (v === from ? to : v)))

type Pose = { dy?: number; mod?: (cv: Grid) => void }

/** One frame: the person (shifted by dy), then the props on top. */
function frame(p: Grid, pose: Pose, props: (cv: Grid) => void, under?: (cv: Grid) => void): Grid {
  const cv = blank()
  under?.(cv)
  stamp(cv, p, PX, PY + (pose.dy ?? 0))
  pose.mod?.(cv)
  props(cv)
  // Shift everything one pixel right so the person sits centred with room for props on both sides.
  return cv.map(r => [null, ...r.slice(0, CW - 1)])
}

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Props (pixel grids; letters are the C palette)

const BOOK_A = ['oooooooooo', 'owgggowggo', 'owwwwowwwo', 'owgggowggo', 'owwwwowwwo', 'oooooooooo']
const BOOK_B = ['oooooooooo', 'owgggoowwo', 'owwwwowlwo', 'owgggowwlo', 'owwwwowwwo', 'oooooooooo']
const BOOK_C = ['oooooooooo', 'owwwwowggo', 'owgggowwwo', 'owwwwowggo', 'owgggowwwo', 'oooooooooo']

const LAPTOP = ['llllllllll', 'lggggggggl', 'lgggllgggl', 'lggggggggl', 'dddddddddd']
const bubble = (dots: number): string[] => {
  const mid = Array.from('owwwwwo')
  for (let i = 0; i < dots; i++) mid[1 + i * 2] = 'k'
  return ['.ooooo.', 'owwwwwo', mid.join(''), 'owwwwwo', '.ooooo.', '..o....']
}

const ANVIL = ['dddddd', '.dllgd', '..dd..']
const hammer = (cv: Grid, mode: 'up' | 'mid' | 'hit'): void => {
  if (mode === 'up') {
    for (let y = 8; y <= 17; y++) cv[y]![19] = C.b!
    stamp(cv, ['lllll', 'lllgd', 'dddddd'.slice(0, 5)], 17, 5)
    stamp(cv, ['..o..'], 17, 4)
  } else if (mode === 'mid') {
    for (let x = 17; x <= 20; x++) cv[13]![x] = C.b!
    stamp(cv, ['ll', 'lg', 'dd', 'dd'], 19, 11)
  } else {
    for (let y = 11; y <= 17; y++) cv[y]![18] = C.b!
    stamp(cv, ['lllll', 'lllgd', 'ddddd'], 16, 14)
    for (const [x, y] of [[15, 15], [21, 14], [20, 12], [15, 18]] as const) cv[y]![x] = C.y!
  }
}

const CLIP = (ticks: number): string[] => {
  const row = (i: number): string => (i < ticks ? 'owGGggwo' : 'owllggwo')
  return ['..oggo..', 'obbbbbbo', row(0), row(1), row(2), 'owwwwwwo', 'oooooooo']
}

const WATCH = ['...oo...', '..olgo..', '.owwwwo.', 'owwwwwwo', 'owwwwwwo', 'owwwwwwo', '.owwwwo.', '..oooo..']
const watchHand = (cv: Grid, x: number, y: number, dir: 0 | 1 | 2 | 3): void => {
  const cells: Record<number, [number, number][]> = {
    0: [[3, 2], [3, 3], [4, 3]],
    1: [[4, 3], [5, 3], [6, 3]],
    2: [[3, 3], [4, 3], [4, 4], [4, 5]],
    3: [[1, 4], [2, 4], [3, 4]],
  }
  for (const [i, j] of cells[dir]!) cv[y + j]![x + i] = C.r!
}

const GLASS = ['..oooo..', '.obccbo.', 'obcccccbo'.slice(0, 8), 'occccccb'.slice(0, 8), 'occccccb'.slice(0, 8), '.obccbo.', '..oooo..']
const HAND = ['ss', 'sS']

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
const raise = (cv: Grid, hx: number): void => {
  erase(cv, 17, 15, 18, 17)
  for (let y = 10; y <= 14; y++) { cv[y]![17] = '#c0cbdc'; cv[y]![18] = '#8b9bb4' }
  stamp(cv, ['.ooo.', 'osssso', 'osssso', 'osSsso', '.ooo.'].map(r => r.slice(0, 5)), hx - 1, 4)
}

// The eight kinds. Frame 0 is the still pose (reduced motion), so it is the most readable one.

export const KINDS = ['research', 'docs', 'code', 'test', 'bench', 'review', 'wait', 'other'] as const
export type Kind = (typeof KINDS)[number]

const WIZARD = person(0, 7)
const VILLAGER = person(1, 7)
const BALD = person(2, 7)
const VIKING = person(3, 7)
const PEASANT = person(4, 7)
const KNIGHT = person(0, 8)
const GIRL = person(3, 8)
const ELDER = person(4, 8)

export const FRAME_MS = 250

const FRAMES: Record<Kind, Grid[]> = {
  // Reads a book held open in front, turning a page.
  research: [
    frame(WIZARD, {}, cv => stamp(cv, BOOK_A, 7, 14)),
    frame(WIZARD, { dy: 1 }, cv => stamp(cv, BOOK_B, 7, 15)),
    frame(WIZARD, {}, cv => stamp(cv, BOOK_C, 7, 14)),
  ],
  // Types on a laptop; the speech dots fill in.
  docs: [
    frame(GIRL, {}, cv => { stamp(cv, LAPTOP, 7, 15); stamp(cv, bubble(3), 15, 0) }),
    frame(GIRL, { dy: 1 }, cv => { stamp(cv, LAPTOP, 7, 16); stamp(cv, bubble(1), 15, 0) }),
    frame(GIRL, {}, cv => { stamp(cv, LAPTOP, 7, 15); stamp(cv, bubble(2), 15, 0) }),
  ],
  // Hammers on an anvil, sparks on the hit.
  code: [
    frame(VIKING, {}, cv => { stamp(cv, ANVIL, 16, 18); hammer(cv, 'hit') }),
    frame(VIKING, {}, cv => { stamp(cv, ANVIL, 16, 18); hammer(cv, 'up') }),
    frame(VIKING, {}, cv => { stamp(cv, ANVIL, 16, 18); hammer(cv, 'mid') }),
  ],
  // Ticks a checklist, one more tick each frame.
  test: [
    frame(KNIGHT, {}, cv => stamp(cv, CLIP(3), 7, 14)),
    frame(KNIGHT, {}, cv => stamp(cv, CLIP(0), 7, 14)),
    frame(KNIGHT, {}, cv => stamp(cv, CLIP(1), 7, 14)),
    frame(KNIGHT, {}, cv => stamp(cv, CLIP(2), 7, 14)),
  ],
  // Times it: a stopwatch with a sweeping hand.
  bench: [
    frame(BALD, {}, cv => { stamp(cv, WATCH, 14, 11); watchHand(cv, 14, 11, 0) }),
    frame(BALD, {}, cv => { stamp(cv, WATCH, 14, 11); watchHand(cv, 14, 11, 1) }),
    frame(BALD, {}, cv => { stamp(cv, WATCH, 14, 11); watchHand(cv, 14, 11, 2) }),
    frame(BALD, {}, cv => { stamp(cv, WATCH, 14, 11); watchHand(cv, 14, 11, 3) }),
  ],
  // Looks closely: a magnifier sliding side to side with a glint.
  review: [
    frame(ELDER, {}, cv => { stamp(cv, GLASS, 13, 6); stamp(cv, ['B', 'B', 'B'], 16, 13); cv[8]![15] = C.w! }),
    frame(ELDER, {}, cv => { stamp(cv, GLASS, 14, 6); stamp(cv, ['B', 'B', 'B'], 17, 13); cv[8]![16] = C.w! }),
    frame(ELDER, {}, cv => { stamp(cv, GLASS, 15, 6); stamp(cv, ['B', 'B', 'B'], 18, 13); cv[8]![17] = C.w! }),
    frame(ELDER, {}, cv => { stamp(cv, GLASS, 14, 6); stamp(cv, ['B', 'B', 'B'], 17, 13); cv[8]![16] = C.w! }),
  ],
  // Raises a hand and waves.
  wait: [
    frame(VILLAGER, {}, cv => raise(cv, 17)),
    frame(VILLAGER, {}, cv => raise(cv, 18)),
  ],
  // No job named: stands and breathes, and blinks.
  other: [
    frame(PEASANT, {}, () => undefined),
    frame(PEASANT, { dy: 1 }, () => undefined),
    frame(PEASANT, { dy: 0, mod: cv => { for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (cv[y]![x] === '#262b44') cv[y]![x] = '#f7c282' } }, () => undefined),
    frame(PEASANT, { dy: 1 }, () => undefined),
  ],
}

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// Output: one <rect> per horizontal run of one colour.

function rects(g: Grid): string {
  const out: string[] = []
  for (let y = 0; y < CH; y++) {
    let x = 0
    while (x < CW) {
      const v = g[y]![x]
      if (v === null || v === undefined) { x++; continue }
      let e = x
      while (e + 1 < CW && g[y]![e + 1] === v) e++
      out.push(`<rect x="${x}" y="${y}" width="${e - x + 1}" height="1" fill="${v}"/>`)
      x = e + 1
    }
  }
  return out.join('')
}

export function buildAll(): Record<Kind, string[]> {
  const out = {} as Record<Kind, string[]>
  for (const k of KINDS) out[k] = FRAMES[k].map(rects)
  return out
}

/** The plan page's tile and dance characters: a plain person (no props) awake and with eyes closed. Animated by CSS in the page (assets/characters.js). */
export function characterSprites(): Record<string, { awake: string; asleep: string }> {
  const cast: Record<string, Grid> = { run: VILLAGER, you: WIZARD, todo: PEASANT, done: GIRL, dance: BALD }
  const out: Record<string, { awake: string; asleep: string }> = {}
  for (const [k, p] of Object.entries(cast)) {
    const awake = frame(p, {}, () => undefined)
    out[k] = { awake: rects(awake), asleep: rects(awake.map(r => r.map(v => (v === '#262b44' ? '#f7c282' : v)))) }
  }
  return out
}

if (import.meta.main) {
  const all = buildAll()
  const body = `// GENERATED by tools/buildsprites.ts from Kenney's Tiny Dungeon (CC0, see NOTICE). Do not edit: change the builder and run \`bun tools/buildsprites.ts\`.
// One entry per job kind: its frames as SVG rectangles on a ${CW} x ${CH} canvas. Frame 0 is the still pose.

export const SPRITE_W = ${CW}
export const SPRITE_H = ${CH}
export const SPRITE_FRAME_MS = ${FRAME_MS}
export const SPRITE_FRAMES: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(all)}
`
  writeFileSync(new URL('../hooks/workersprites.ts', import.meta.url).pathname, body)
  writeFileSync(new URL('../assets/characters-sprites.js', import.meta.url).pathname, `// GENERATED by tools/buildsprites.ts (Kenney's Tiny Dungeon, CC0). Inlined into the plan page by tools/plan-page-build.\nconst CHAR_SPRITES=${JSON.stringify(characterSprites())};\n`)
  console.log('wrote hooks/workersprites.ts', Object.entries(all).map(([k, f]) => k + ':' + f.length).join(' '))
}
