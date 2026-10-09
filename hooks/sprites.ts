// Sprites for Cockpit. Original art, drawn for this mod.
//
// A sprite is a 13 x 10 pixel canvas drawn as 13 columns x 5 terminal rows: each terminal cell
// holds two pixels (upper and lower half block). Pixels use palette letters:
//   B body   O outline   E eye   M mouth or detail   A accent (hat, tip, beanie)
//   G glasses frame   V visor   C cloud puff   S metal or blade   W white   P pink   K ink
// '.' is transparent.
//
// ADDING A KIND: add one entry to SPRITES below (palette for dark and light themes, optional
// hat variants, optional base grid, idle frames, work frames). Nothing else changes.

export type Theme = 'dark' | 'light'
export type SpriteMode = 'work' | 'idle' | 'dim'

type Patch = { x: number; y: number; rows: string[] }
type Frame = { dx?: number; dy?: number; p: Patch[] }
type Pal = Record<string, string>

export type Kind = {
  label: string
  // The colour the panel uses for this kind's text and bars.
  accent: string
  dark: Pal
  light: Pal
  // Lane variants (hat colours) replace the accent letter A; a lane picks one by index.
  variants?: { dark: string; light: string }[]
  // Replaces the shared base body, for a kind with another silhouette.
  base?: string[]
  idle: Frame[]
  work: Frame[]
}

export const SPRITE_COLUMNS = 13
export const SPRITE_ROWS = 5
const W = SPRITE_COLUMNS
const H = SPRITE_ROWS * 2

const px = (x: number, y: number, ...rows: string[]): Patch => ({ x, y, rows })

// ---------------------------------------------------------------------------
// Shared body: a round blob, outline all round, two feet. Eyes sit at y4 and y5.

const BASE = [
  '.............',
  '.............',
  '....OOOOO....',
  '...OBBBBBO...',
  '..OBBBBBBBO..',
  '..OBBBBBBBO..',
  '..OBBBBBBBO..',
  '...OBBBBBO...',
  '...OO...OO...',
  '.............',
]

// Floaty body for the cloud kind: no feet, a rounded bottom.
const BASE_FLOAT = [
  '.............',
  '.............',
  '....OOOOO....',
  '...OBBBBBO...',
  '..OBBBBBBBO..',
  '..OBBBBBBBO..',
  '..OBBBBBBBO..',
  '...OBBBBBO...',
  '....OOOOO....',
  '.............',
]

// ---------------------------------------------------------------------------
// Parts. Eyes are one pixel wide and two tall at x and x+4.

const eyes = (x = 4): Patch => px(x, 4, 'E...E', 'E...E')
const BLINK = px(4, 4, 'B...B', 'M...M')
const MOUTH = px(6, 6, 'M')
const MOUTH_STRAIGHT = px(5, 6, 'MMM')
const MITTS = [px(1, 6, 'B'), px(11, 6, 'B')]

// Claude: round glasses, one ring per eye, a bridge between.
const GLASSES = (y = 3): Patch => px(3, y, 'GGG.GGG', 'G.GGG.G', 'G.G.G.G', 'GGG.GGG')
const ARM_UP = px(10, 3, 'BB', '.B')

// Codex: a cap, a visor with glowing eyes, hands on a keyboard while working.
const HAT = px(3, 1, '.AAAAA.', 'AAAAAAA')
const visor = (eyeX: number | null): Patch[] => {
  const parts = [px(3, 4, 'VVVVVVV', 'VVVVVVV')]
  if (eyeX !== null) parts.push(px(eyeX, 5, 'E...E'))
  return parts
}
const HAND_L = (up: boolean): Patch => px(1, up ? 6 : 7, 'B')
const HAND_R = (up: boolean): Patch => px(11, up ? 6 : 7, 'B')
const KEYS = (row: string): Patch => px(5, 8, row)

// API: a blinking antenna and a bowtie.
const antenna = (on: boolean): Patch[] => [px(6, 1, 'S'), px(6, 0, on ? 'A' : 'O')]
const BOWTIE = px(5, 7, 'WMW')

// Cloud: a puff above the head, rosy cheeks.
const PUFF_BIG = [px(5, 0, 'CCC'), px(4, 1, 'CCCCC')]
const PUFF_SMALL = [px(6, 0, 'C'), px(5, 1, 'CCC')]
const CHEEKS = [px(3, 6, 'P'), px(9, 6, 'P')]

// Session: a peaked cap on the Claude body: navy crown (N), a white band, a gold badge (A) and a dark bill over the brow.
const CAP_CROWN = [px(4, 0, 'NNNNN'), px(3, 1, 'NNANNN')]
const CAP_BAND = px(3, 2, 'WWWWWWW')
const CAP_BILL = px(4, 3, 'KKKKK')
const CAP = [...CAP_CROWN, CAP_BAND, CAP_BILL]

// Local: a propeller beanie, one big eye and one small, a crooked grin, tongue out.
const BEANIE = [px(4, 1, 'AAAAA'), px(3, 2, 'AAAAAAA')]
const BLADES = {
  wide: px(3, 0, 'SSSWSSS'),
  mid: px(4, 0, 'SSWSS'),
  narrow: px(5, 0, 'SWS'),
}
const EYE_BIG = px(3, 4, 'EE', 'EK')
const EYE_SMALL = px(8, 4, 'E')
const EYE_BIG_BLINK = px(3, 5, 'MM')
const GRIN = [px(4, 7, 'MM'), px(6, 6, 'MM')]
const tongue = (x: number): Patch => px(x, 8, 'P')

// ---------------------------------------------------------------------------
// THE SPRITE TABLE. One entry per kind.

export const SHARED: Record<Theme, Pal> = {
  dark: { W: '#FFFFFF', P: '#FF8FB1', S: '#B8BEC6', K: '#0D1117', C: '#EAF4FF' },
  light: { W: '#FFFFFF', P: '#F2709C', S: '#59606B', K: '#0D1117', C: '#8FBFFF' },
}

export const SPRITES: Record<string, Kind> = {
  // Claude: the base critter in Claude orange, round glasses. Tidy; nods and pushes the glasses up while working.
  max: {
    label: 'Claude',
    accent: '#D97757',
    dark: { B: '#D97757', O: '#9C4326', E: '#1F1E1D', M: '#5C2A19', G: '#2B2A28' },
    light: { B: '#D97757', O: '#7E3319', E: '#1F1E1D', M: '#5C2A19', G: '#1F1E1D' },
    idle: [
      { p: [eyes(), MOUTH, GLASSES(), ...MITTS] },
      { p: [eyes(), MOUTH, GLASSES(), ...MITTS] },
      { p: [eyes(), MOUTH, GLASSES(), ...MITTS] },
      { p: [BLINK, MOUTH, GLASSES(), ...MITTS] },
    ],
    work: [
      { p: [eyes(), MOUTH, GLASSES(), ...MITTS] },
      { dy: 1, p: [eyes(), MOUTH, GLASSES(), ...MITTS] },
      { p: [eyes(), MOUTH, GLASSES(2), MITTS[0] as Patch, ARM_UP] },
      { p: [eyes(), MOUTH, GLASSES(2), MITTS[0] as Patch, ARM_UP] },
    ],
  },

  // Session (the coordinator's row): the Claude critter in a captain's peaked cap, the only character that wears it.
  captain: {
    label: 'Session',
    accent: '#D97757',
    dark: { B: '#D97757', O: '#9C4326', E: '#1F1E1D', M: '#5C2A19', G: '#2B2A28', N: '#1F3A6E', A: '#F5C518' },
    light: { B: '#D97757', O: '#7E3319', E: '#1F1E1D', M: '#5C2A19', G: '#1F1E1D', N: '#1F3A6E', A: '#E0A800' },
    idle: [
      { p: [eyes(), MOUTH, GLASSES(), ...MITTS, ...CAP] },
      { p: [eyes(), MOUTH, GLASSES(), ...MITTS, ...CAP] },
      { p: [eyes(), MOUTH, GLASSES(), ...MITTS, ...CAP] },
      { p: [BLINK, MOUTH, GLASSES(), ...MITTS, ...CAP] },
    ],
    work: [
      { p: [eyes(), MOUTH, GLASSES(), ...MITTS, ...CAP] },
      { dy: 1, p: [eyes(), MOUTH, GLASSES(), ...MITTS, ...CAP] },
      { p: [eyes(), MOUTH, GLASSES(2), MITTS[0] as Patch, ARM_UP, ...CAP] },
      { p: [eyes(), MOUTH, GLASSES(2), MITTS[0] as Patch, ARM_UP, ...CAP] },
    ],
  },

  // Codex lanes: ChatGPT green, visor and cap (cap colour per lane: a red, b blue, c yellow, d purple), typing hands.
  codex: {
    label: 'Codex',
    accent: '#10A37F',
    dark: { B: '#10A37F', O: '#0A6E55', V: '#0F2A25', E: '#B7FFE9', M: '#06382C', A: '#F5C518' },
    light: { B: '#10A37F', O: '#064B3B', V: '#0B1F1B', E: '#B7FFE9', M: '#06382C', A: '#F5C518' },
    variants: [
      { dark: '#E5484D', light: '#C42B31' }, // a: red
      { dark: '#3B82F6', light: '#1D4ED8' }, // b: blue
      { dark: '#F5C518', light: '#E0A800' }, // c: yellow
      { dark: '#A855F7', light: '#7E22CE' }, // d: purple
    ],
    idle: [
      { p: [HAT, ...visor(4), MOUTH, HAND_L(false), HAND_R(false)] },
      { p: [HAT, ...visor(4), MOUTH, HAND_L(false), HAND_R(false)] },
      { p: [HAT, ...visor(4), MOUTH, HAND_L(false), HAND_R(false)] },
      { p: [HAT, ...visor(null), MOUTH, HAND_L(false), HAND_R(false)] },
    ],
    work: [
      { p: [HAT, ...visor(4), MOUTH, HAND_L(true), HAND_R(false), KEYS('WSS')] },
      { p: [HAT, ...visor(5), MOUTH, HAND_L(false), HAND_R(true), KEYS('SSW')] },
      { p: [HAT, ...visor(4), MOUTH, HAND_L(true), HAND_R(false), KEYS('SWS')] },
      { p: [HAT, ...visor(3), MOUTH, HAND_L(false), HAND_R(true), KEYS('SSW')] },
    ],
  },

  // API (opencode-1): violet, a little formal, bowtie, an antenna whose tip blinks.
  api: {
    label: 'API',
    accent: '#8B5CF6',
    dark: { B: '#8B5CF6', O: '#5B34B8', E: '#150B2E', M: '#2B1A57', A: '#FDE047', S: '#C4B5FD' },
    light: { B: '#8B5CF6', O: '#3E2290', E: '#150B2E', M: '#2B1A57', A: '#E0A800', S: '#4C2BA6' },
    idle: [
      { p: [...antenna(true), eyes(), MOUTH_STRAIGHT, BOWTIE, ...MITTS] },
      { p: [...antenna(true), eyes(), MOUTH_STRAIGHT, BOWTIE, ...MITTS] },
      { p: [...antenna(false), eyes(), MOUTH_STRAIGHT, BOWTIE, ...MITTS] },
      { p: [...antenna(false), eyes(), MOUTH_STRAIGHT, BOWTIE, ...MITTS] },
    ],
    work: [
      { p: [...antenna(true), eyes(3), MOUTH_STRAIGHT, BOWTIE, ...MITTS] },
      { p: [...antenna(false), eyes(4), MOUTH_STRAIGHT, BOWTIE, ...MITTS] },
      { p: [...antenna(true), eyes(5), MOUTH_STRAIGHT, BOWTIE, ...MITTS] },
      { p: [...antenna(false), eyes(4), MOUTH_STRAIGHT, BOWTIE, ...MITTS] },
    ],
  },

  // Cloud: sky blue, floaty, a cloud puff above the head, bobs up and down.
  cloud: {
    label: 'Cloud',
    accent: '#4A9EFF',
    dark: { B: '#4A9EFF', O: '#2A6FCC', E: '#0E2A4D', M: '#0E2A4D' },
    light: { B: '#4A9EFF', O: '#1B4F9C', E: '#0E2A4D', M: '#0E2A4D' },
    base: BASE_FLOAT,
    idle: [
      { p: [...PUFF_BIG, eyes(), MOUTH, ...CHEEKS] },
      { p: [...PUFF_BIG, eyes(), MOUTH, ...CHEEKS] },
      { dy: 1, p: [...PUFF_BIG, eyes(), MOUTH, ...CHEEKS] },
      { dy: 1, p: [...PUFF_BIG, BLINK, MOUTH, ...CHEEKS] },
    ],
    work: [
      { p: [...PUFF_BIG, eyes(), MOUTH, ...CHEEKS] },
      { dy: 1, p: [...PUFF_SMALL, eyes(), MOUTH, ...CHEEKS] },
      { p: [...PUFF_BIG, eyes(), MOUTH, ...CHEEKS] },
      { dy: 1, p: [...PUFF_SMALL, eyes(), MOUTH, ...CHEEKS] },
    ],
  },

  // Local: near black with a light outline, bright eyes, goofy. Propeller beanie spins while
  // working and the whole critter wobbles side to side when idle.
  local: {
    label: 'Local',
    accent: '#F5C518',
    dark: { B: '#1F2328', O: '#AAB4BF', E: '#F2FBFF', M: '#C9D1D9', A: '#F5C518' },
    light: { B: '#1F2328', O: '#5B6570', E: '#F2FBFF', M: '#C9D1D9', A: '#F5C518' },
    idle: [
      { dx: -1, p: [...BEANIE, BLADES.narrow, EYE_BIG, EYE_SMALL, ...GRIN, tongue(5)] },
      { p: [...BEANIE, BLADES.narrow, EYE_BIG, EYE_SMALL, ...GRIN, tongue(5)] },
      { dx: 1, p: [...BEANIE, BLADES.narrow, EYE_BIG, EYE_SMALL, ...GRIN, tongue(5)] },
      { p: [...BEANIE, BLADES.narrow, EYE_BIG_BLINK, EYE_SMALL, ...GRIN, tongue(5)] },
    ],
    work: [
      { p: [...BEANIE, BLADES.wide, EYE_BIG, EYE_SMALL, ...GRIN, tongue(5)] },
      { p: [...BEANIE, BLADES.narrow, EYE_BIG, EYE_SMALL, ...GRIN, tongue(6)] },
      { p: [...BEANIE, BLADES.mid, EYE_BIG, EYE_SMALL, ...GRIN, tongue(5)] },
      { p: [...BEANIE, BLADES.narrow, EYE_BIG, EYE_SMALL, ...GRIN, tongue(6)] },
    ],
  },
}

// ---------------------------------------------------------------------------
// Rendering

const DEFAULT_COLOR = 0x01000000

const hexToInt = (hex: string): number => parseInt(hex.slice(1), 16)

const mix = (c: number, toward: number, t: number): number => {
  const ch = (shift: number) => {
    const a = (c >> shift) & 255
    const b = (toward >> shift) & 255
    return Math.round(a + (b - a) * t)
  }
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

function buildGrid(def: Kind, frame: Frame): string[][] {
  const grid: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'))
  const dx = frame.dx ?? 0
  const dy = frame.dy ?? 0
  const put = (x: number, y: number, ch: string) => {
    const gx = x + dx
    const gy = y + dy
    if (ch === '.' || gx < 0 || gx >= W || gy < 0 || gy >= H) return
    const row = grid[gy]
    if (row) row[gx] = ch
  }
  ;(def.base ?? BASE).forEach((line, y) => [...line].forEach((ch, x) => put(x, y, ch)))
  for (const patch of frame.p) patch.rows.forEach((line, ry) => [...line].forEach((ch, rx) => put(patch.x + rx, patch.y + ry, ch)))
  return grid
}

export function frameCount(kind: string, mode: SpriteMode): number {
  const def = SPRITES[kind] ?? SPRITES.max
  return mode === 'work' ? (def?.work.length ?? 1) : (def?.idle.length ?? 1)
}

export function accentOf(kind: string): string {
  return (SPRITES[kind] ?? SPRITES.max)?.accent ?? '#D97757'
}

// The cells of one sprite, packed for a Raster: per cell a code point, a colour and a background.
// Reduced motion and the dim mode both hold frame 0, so nothing moves.
export function spriteCells(
  kind: string,
  variant: number,
  mode: SpriteMode,
  tick: number,
  theme: Theme,
  isReduced: boolean,
): number[] {
  const def = SPRITES[kind] ?? (SPRITES.max as Kind)
  const frames = mode === 'work' ? def.work : def.idle
  const still = mode === 'dim' || isReduced
  const frame = (still ? frames[0] : frames[Math.abs(tick) % frames.length]) as Frame
  const pal: Pal = { ...SHARED[theme], ...def[theme] }
  const v = def.variants?.[variant % (def.variants?.length || 1)]
  if (v) pal.A = v[theme]
  const dimTo = theme === 'dark' ? 0x4a4a4a : 0xb4b4b4

  const grid = buildGrid(def, frame)
  const color = (ch: string): number | null => {
    const hex = pal[ch]
    if (ch === '.' || !hex) return null
    const c = hexToInt(hex)
    return mode === 'dim' ? mix(c, dimTo, 0.6) : c
  }

  const cells: number[] = []
  for (let r = 0; r < SPRITE_ROWS; r++) {
    for (let x = 0; x < W; x++) {
      const top = color(grid[2 * r]?.[x] ?? '.')
      const bottom = color(grid[2 * r + 1]?.[x] ?? '.')
      if (top === null && bottom === null) cells.push(0x20, DEFAULT_COLOR, DEFAULT_COLOR)
      else if (top !== null && bottom === null) cells.push(0x2580, top, DEFAULT_COLOR)
      else if (top === null && bottom !== null) cells.push(0x2584, bottom, DEFAULT_COLOR)
      else cells.push(0x2580, top as number, bottom as number)
    }
  }
  return cells
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Base64 of the cells as little-endian 32-bit numbers, written out here because the hooks
// module has no Buffer and no guarantee of btoa.
export function packCells(cells: number[]): string {
  const bytes: number[] = []
  for (const n of cells) bytes.push(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    out += B64[a >> 2]
    out += B64[((a & 3) << 4) | (b >> 4)]
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '='
    out += i + 2 < bytes.length ? B64[c & 63] : '='
  }
  return out
}

export function renderSprite(
  kind: string,
  variant: number,
  mode: SpriteMode,
  tick: number,
  theme: Theme,
  isReduced: boolean,
): { columns: number; rows: number; cells: string } {
  return {
    columns: SPRITE_COLUMNS,
    rows: SPRITE_ROWS,
    cells: packCells(spriteCells(kind, variant, mode, tick, theme, isReduced)),
  }
}

// ---------------------------------------------------------------------------
// Poses for the desktop svg: one function per activity. Every character type shares one skeleton
// (the 26 x 23 grid in draw.ts: body x6..19, y6..17, arms at x2..5 and x20..23, feet at y20..22), so a
// pose adds eyes and props to whatever character wears it and the hat, visor, glasses, antenna or
// propeller still apply. Motion is CSS only (transform and opacity), every loop under 3 s; the
// keyframes are in POSE_CSS and are switched off for prefers-reduced-motion, which leaves the pose.

export type Activity =
  | 'asking'
  | 'red'
  | 'stuck'
  | 'landing'
  | 'testing'
  | 'reviewing'
  | 'coding'
  | 'reading'
  | 'planning'
  | 'researching'
  | 'documenting'
  | 'designing'
  | 'working'
  | 'sleeping'
  // The member itself broke (a dead session, an API or auth error); and the cheer after a landing.
  | 'errored'
  | 'cheering'

export const ACTIVITIES: readonly Activity[] = [
  'errored',
  'cheering',
  'asking',
  'red',
  'stuck',
  'landing',
  'testing',
  'reviewing',
  'researching',
  'documenting',
  'designing',
  'coding',
  'reading',
  'planning',
  'working',
  'sleeping',
]

export type EyeStyle = 'open' | 'closed' | 'wide' | 'squint' | 'spiral'

// Draws one rect of a prop into the named class group.
export type PoseFill = (x: number, y: number, w: number, h: number, c: string, cls: string) => void

export type Pose = {
  eyes: EyeStyle
  // Props around and in front of the body, in their own class groups so CSS can move them.
  props: (f: PoseFill, p: Pal) => void
  // Extra svg that is not a rect (a glyph), in the sprite's own coordinates.
  glyphs: string
}

const PAPER = '#F6F1E3'
const GREY = '#9CA3AF'
const GREEN_TICK = '#22C55E'

// A 4 x 3 tick at (x, y).
const tick = (f: PoseFill, x: number, y: number, c: string, cls: string): void => {
  f(x, y + 1, 1, 1, c, cls)
  f(x + 1, y + 2, 1, 1, c, cls)
  f(x + 2, y + 1, 1, 1, c, cls)
  f(x + 3, y, 1, 1, c, cls)
}

const none: Pose = { eyes: 'open', props: () => {}, glyphs: '' }

export const POSES: Record<Activity, Pose> = {
  // The v3 walk and bob: nothing more is known.
  working: none,

  // Asleep: eyes closed; draw.ts adds the low body, the breathing and the three z.
  sleeping: { eyes: 'closed', props: () => {}, glyphs: '' },

  // A small open book held in front, the head tilting left and right in a slow scan, a page flipping.
  reading: {
    eyes: 'open',
    props: f => {
      f(8, 15, 10, 6, '#7C4A2D', 'bk')
      f(9, 15, 8, 5, PAPER, 'bk')
      f(12, 15, 2, 6, '#5A3519', 'bk')
      f(13, 15, 4, 5, '#E9E2CC', 'pg')
    },
    glyphs: '',
  },

  // Chin on a hand, one eye squinting, a thought bubble whose ellipsis cycles, a small head tilt.
  planning: {
    eyes: 'squint',
    props: (f, p) => {
      f(8, 14, 4, 4, p.O ?? '#333333', 'hd')
      f(9, 15, 2, 2, p.B ?? '#888888', 'hd')
      f(18, 0, 8, 5, '#FFFFFF', 'tb')
      f(17, 5, 1, 1, '#FFFFFF', 'tb')
      f(16, 6, 1, 1, '#FFFFFF', 'tb')
      f(19, 2, 1, 1, '#6B7280', 'd0')
      f(21, 2, 1, 1, '#6B7280', 'd1')
      f(23, 2, 1, 1, '#6B7280', 'd2')
    },
    glyphs: '',
  },

  // Both hands typing on a tiny keyboard, code lines scrolling on a mini screen, quick head nods.
  coding: {
    eyes: 'open',
    props: (f, p) => {
      f(6, 21, 14, 2, '#374151', 'kb')
      f(8, 21, 2, 1, GREY, 'kb')
      f(13, 21, 3, 1, GREY, 'kb')
      f(5, 19, 3, 2, p.B ?? '#888888', 'hl')
      f(18, 19, 3, 2, p.B ?? '#888888', 'hr')
      f(20, 5, 6, 8, '#0B1220', 'sc')
      f(21, 6, 4, 1, '#22C55E', 'ln0')
      f(21, 8, 3, 1, '#60A5FA', 'ln1')
      f(21, 10, 4, 1, '#F59E0B', 'ln0')
      f(21, 12, 2, 1, '#22C55E', 'ln1')
    },
    glyphs: '',
  },

  // A checklist whose ticks appear one by one, a magnifier sweeping beside it.
  testing: {
    eyes: 'open',
    props: f => {
      f(19, 9, 6, 11, '#E5E7EB', 'cb')
      f(21, 8, 2, 1, '#6B7280', 'cb')
      tick(f, 20, 10, GREEN_TICK, 't0')
      tick(f, 20, 13, GREEN_TICK, 't1')
      tick(f, 20, 16, GREEN_TICK, 't2')
      f(0, 8, 5, 1, GREY, 'mg')
      f(0, 12, 5, 1, GREY, 'mg')
      f(0, 8, 1, 5, GREY, 'mg')
      f(4, 8, 1, 5, GREY, 'mg')
      f(1, 9, 3, 3, 'rgba(169,214,245,.45)', 'mg')
      f(2, 13, 1, 3, GREY, 'mg')
    },
    glyphs: '',
  },

  // A magnifier over a page, a slow nod yes then no.
  reviewing: {
    eyes: 'open',
    props: f => {
      f(7, 15, 12, 6, PAPER, 'pp')
      f(8, 16, 8, 1, GREY, 'pp')
      f(8, 18, 6, 1, GREY, 'pp')
      f(9, 13, 6, 1, '#6B7280', 'mg2')
      f(9, 18, 6, 1, '#6B7280', 'mg2')
      f(9, 13, 1, 6, '#6B7280', 'mg2')
      f(14, 13, 1, 6, '#6B7280', 'mg2')
      f(10, 14, 4, 4, 'rgba(169,214,245,.45)', 'mg2')
      f(15, 19, 2, 2, '#6B7280', 'mg2')
    },
    glyphs: '',
  },

  // Arms up, a small rocket lifting off and coming back, a flag waving.
  landing: {
    eyes: 'open',
    props: f => {
      f(21, 11, 3, 6, '#E5E7EB', 'rk')
      f(22, 9, 1, 2, '#EF4444', 'rk')
      f(20, 15, 1, 2, '#EF4444', 'rk')
      f(24, 15, 1, 2, '#EF4444', 'rk')
      f(22, 13, 1, 1, '#60A5FA', 'rk')
      f(22, 17, 1, 2, '#F59E0B', 'fl')
      f(1, 5, 1, 12, GREY, 'fp')
      f(2, 5, 5, 3, '#EF4444', 'fg')
    },
    glyphs: '',
  },

  // Wide eyes, one arm waving, a big "?" bubble bouncing.
  asking: {
    eyes: 'wide',
    props: f => {
      f(16, 0, 9, 8, '#D946EF', 'qb')
      f(17, 1, 7, 6, '#FFFFFF', 'qb')
    },
    glyphs: '<text class="qb" x="20.5" y="6.2" text-anchor="middle" font-size="7" font-weight="800" fill="#D946EF">?</text>',
  },

  // Shakes, a sweat drop falls, a red outline flashes, a failed tick (an x) on the left.
  red: {
    eyes: 'open',
    props: f => {
      f(5, 3, 16, 1, '#EF4444', 'rf')
      f(5, 20, 16, 1, '#EF4444', 'rf')
      f(4, 4, 1, 16, '#EF4444', 'rf')
      f(21, 4, 1, 16, '#EF4444', 'rf')
      f(19, 6, 2, 3, '#7DD3FC', 'sw')
      f(19, 5, 1, 1, '#7DD3FC', 'sw')
      f(0, 9, 1, 1, '#EF4444', 'xm')
      f(2, 9, 1, 1, '#EF4444', 'xm')
      f(1, 10, 1, 1, '#EF4444', 'xm')
      f(0, 11, 1, 1, '#EF4444', 'xm')
      f(2, 11, 1, 1, '#EF4444', 'xm')
    },
    glyphs: '',
  },

  // A magnifier and a small globe, eyes scanning the page, result cards popping in one by one.
  researching: {
    eyes: 'open',
    props: f => {
      // The globe: a ball, a meridian that shifts, an equator.
      f(20, 6, 5, 1, '#38BDF8', 'gl')
      f(19, 7, 7, 6, '#0EA5E9', 'gl')
      f(20, 13, 5, 1, '#38BDF8', 'gl')
      f(19, 10, 7, 1, '#BAE6FD', 'gl')
      f(22, 6, 1, 8, '#BAE6FD', 'gm')
      // The magnifier on the left, sweeping.
      f(0, 8, 5, 1, GREY, 'mg3')
      f(0, 12, 5, 1, GREY, 'mg3')
      f(0, 8, 1, 5, GREY, 'mg3')
      f(4, 8, 1, 5, GREY, 'mg3')
      f(1, 9, 3, 3, 'rgba(169,214,245,.45)', 'mg3')
      f(2, 13, 1, 3, GREY, 'mg3')
      // Three result cards, each with a coloured line.
      f(19, 15, 6, 2, '#F8FAFC', 'cd0')
      f(20, 15, 3, 1, '#22C55E', 'cd0')
      f(19, 17, 6, 2, '#F8FAFC', 'cd1')
      f(20, 17, 3, 1, '#F59E0B', 'cd1')
      f(19, 19, 6, 2, '#F8FAFC', 'cd2')
      f(20, 19, 3, 1, '#EF4444', 'cd2')
    },
    glyphs: '',
  },

  // A quill writing on a scroll, lines of text appearing, now and then a page turn.
  documenting: {
    eyes: 'open',
    props: f => {
      f(7, 15, 12, 6, PAPER, 'sr')
      f(6, 15, 1, 6, '#CBB88A', 'sr')
      f(19, 15, 1, 6, '#CBB88A', 'sr')
      f(8, 16, 8, 1, GREY, 'tl0')
      f(8, 18, 6, 1, GREY, 'tl1')
      f(8, 20, 9, 1, GREY, 'tl2')
      f(15, 15, 4, 6, '#E9E2CC', 'pg2')
      // The quill: a feather and a long nib, moving across the lines.
      f(18, 8, 2, 3, '#F8FAFC', 'qu')
      f(17, 10, 1, 1, '#F8FAFC', 'qu')
      f(16, 11, 1, 1, GREY, 'qu')
      f(15, 12, 1, 1, GREY, 'qu')
      f(14, 13, 1, 1, '#1F2937', 'qu')
    },
    glyphs: '',
  },

  // A pencil and a ruler over a blueprint, a grid appearing line by line.
  designing: {
    eyes: 'open',
    props: f => {
      f(6, 14, 14, 7, '#1D4ED8', 'bp')
      for (const x of [9, 12, 15, 18]) f(x, 14, 1, 7, '#60A5FA', 'gd0')
      for (const y of [16, 18, 20]) f(6, y, 14, 1, '#60A5FA', 'gd1')
      f(3, 12, 10, 2, '#E5E7EB', 'rl')
      for (const x of [4, 6, 8, 10, 12]) f(x, 12, 1, 1, '#6B7280', 'rl')
      f(19, 8, 1, 5, '#FBBF24', 'pc')
      f(19, 13, 1, 1, '#78350F', 'pc')
    },
    glyphs: '',
  },

  // Dizzy spiral eyes turning slowly; the hat, antenna or puff droops (draw.ts marks them `hat`).
  stuck: { eyes: 'spiral', props: () => {}, glyphs: '' },

  // The member itself broke: slumped and leaning, swirl eyes, a red exclamation mark that blinks.
  errored: {
    eyes: 'spiral',
    props: f => {
      f(21, 1, 3, 5, '#DC2626', 'ex')
      f(21, 7, 3, 2, '#DC2626', 'ex')
    },
    glyphs: '',
  },

  // Arms up and hopping, a few sparkles: the cheer after a landing.
  cheering: {
    eyes: 'wide',
    props: f => {
      f(1, 4, 1, 3, '#FBBF24', 'sk0')
      f(0, 5, 3, 1, '#FBBF24', 'sk0')
      f(23, 2, 1, 3, '#F472B6', 'sk1')
      f(22, 3, 3, 1, '#F472B6', 'sk1')
    },
    glyphs: '',
  },
}

// The keyframes behind the poses. `.a-<activity>` is on the sprite's group.
export const POSE_CSS = `<style>
.a-reading .bd{transform-origin:50% 100%;animation:rdt 2.5s ease-in-out infinite}
@keyframes rdt{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
.a-reading .pg{animation:pgf 1.25s steps(1) infinite}
@keyframes pgf{50%{transform:scaleX(-1)}}
.a-planning .bd{transform-origin:50% 100%;animation:pnt 2.5s ease-in-out infinite}
@keyframes pnt{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(2deg)}}
.a-planning .d0,.a-planning .d1,.a-planning .d2{animation:dt 1.25s steps(1) infinite}
.a-planning .d1{animation-delay:-.4s}.a-planning .d2{animation-delay:-.8s}
@keyframes dt{0%{opacity:0}34%{opacity:1}100%{opacity:1}}
.a-coding .bd{animation:nd .5s steps(1) infinite}
@keyframes nd{50%{transform:translateY(1px)}}
.a-coding .hl{animation:ty .25s steps(1) infinite}.a-coding .hr{animation:ty .25s steps(1) infinite -.125s}
@keyframes ty{50%{transform:translateY(-1px)}}
.a-coding .ln0{animation:sc .5s steps(1) infinite}.a-coding .ln1{animation:sc .5s steps(1) infinite -.25s}
@keyframes sc{50%{transform:translateY(1px)}}
.a-testing .t0{animation:k0 2.5s steps(1) infinite}.a-testing .t1{animation:k1 2.5s steps(1) infinite}.a-testing .t2{animation:k2 2.5s steps(1) infinite}
@keyframes k0{0%,14%{opacity:0}15%,94%{opacity:1}95%,100%{opacity:0}}
@keyframes k1{0%,39%{opacity:0}40%,94%{opacity:1}95%,100%{opacity:0}}
@keyframes k2{0%,64%{opacity:0}65%,94%{opacity:1}95%,100%{opacity:0}}
.a-testing .mg{animation:mgs 2.5s ease-in-out infinite}
@keyframes mgs{50%{transform:translateY(4px)}}
.a-reviewing .bd{animation:yn 2.5s ease-in-out infinite}
@keyframes yn{0%,40%,100%{transform:translate(0,0)}10%,30%{transform:translate(0,1px)}55%{transform:translate(-1px,0)}70%{transform:translate(1px,0)}85%{transform:translate(-1px,0)}}
.a-reviewing .mg2{animation:mg2s 2.5s ease-in-out infinite}
@keyframes mg2s{50%{transform:translateX(4px)}}
.a-landing .al,.a-landing .ar{transform:translateY(-5px)}
.a-landing .ar{animation:wv 1s ease-in-out infinite}
@keyframes wv{50%{transform:translateY(-8px)}}
.a-landing .rk,.a-landing .fl{animation:lift 2.5s ease-in-out infinite}
@keyframes lift{0%,100%{transform:translateY(0);opacity:1}50%{transform:translateY(-9px);opacity:.3}}
.a-landing .fg{transform-origin:0 50%;animation:fw .5s steps(1) infinite}
@keyframes fw{50%{transform:skewY(-12deg) scaleX(.85)}}
.a-asking .al,.a-asking .ar{transform:translateY(-3px)}
.a-asking .ar{transform-origin:50% 100%;animation:aw .5s ease-in-out infinite}
@keyframes aw{0%,100%{transform:translateY(-6px) rotate(10deg)}50%{transform:translateY(-6px) rotate(-25deg)}}
.a-asking .qb{animation:bn 1s ease-in-out infinite}
@keyframes bn{50%{transform:translateY(-2px)}}
.a-red .bd,.a-red .al,.a-red .ar{animation:shk .25s steps(1) infinite}
@keyframes shk{25%{transform:translateX(-1px)}75%{transform:translateX(1px)}}
.a-red .sw{animation:drip 1.25s ease-in infinite}
@keyframes drip{0%{transform:translateY(0);opacity:1}100%{transform:translateY(9px);opacity:0}}
.a-red .rf{animation:rfl .5s steps(1) infinite}
@keyframes rfl{50%{opacity:.2}}
.a-researching .ey{animation:psc 1s steps(1) infinite}
@keyframes psc{33%{transform:translateX(-1px)}66%{transform:translateX(1px)}}
.a-researching .gm{animation:gms 1.25s steps(1) infinite}
@keyframes gms{25%{transform:translateX(-2px)}50%{transform:translateX(0)}75%{transform:translateX(2px)}}
.a-researching .mg3{animation:rss 2.5s ease-in-out infinite}
@keyframes rss{25%{transform:translate(3px,0)}50%{transform:translate(3px,3px)}75%{transform:translate(0,3px)}}
.a-researching .cd0{animation:cp0 2.5s steps(1) infinite}.a-researching .cd1{animation:cp1 2.5s steps(1) infinite}.a-researching .cd2{animation:cp2 2.5s steps(1) infinite}
@keyframes cp0{0%,14%{opacity:0}15%,94%{opacity:1}95%,100%{opacity:0}}
@keyframes cp1{0%,39%{opacity:0}40%,94%{opacity:1}95%,100%{opacity:0}}
@keyframes cp2{0%,64%{opacity:0}65%,94%{opacity:1}95%,100%{opacity:0}}
.a-documenting .tl0{animation:k0 2.5s steps(1) infinite}.a-documenting .tl1{animation:k1 2.5s steps(1) infinite}.a-documenting .tl2{animation:k2 2.5s steps(1) infinite}
.a-documenting .pg2{animation:pgf 2.5s steps(1) infinite}
.a-documenting .qu{animation:wrt 1.25s ease-in-out infinite}
@keyframes wrt{0%,100%{transform:translate(-4px,3px)}50%{transform:translate(2px,3px)}}
.a-designing .gd0{animation:k0 2.5s steps(1) infinite}.a-designing .gd1{animation:k1 2.5s steps(1) infinite}
.a-designing .pc{animation:pcm 2.5s ease-in-out infinite}
@keyframes pcm{0%,100%{transform:translate(-9px,6px)}50%{transform:translate(-2px,4px)}}
.a-designing .rl{animation:rls 2.5s ease-in-out infinite}
@keyframes rls{50%{transform:translateY(3px)}}
.a-errored .bd{transform-origin:50% 100%;transform:translateY(2px) rotate(-9deg)}
.a-errored .al,.a-errored .ar{transform:translateY(3px)}
.a-errored .ey{animation:dz 2.5s linear infinite}
.a-errored .ex{animation:rfl 1s steps(1) infinite}
.a-cheering .bd{animation:hop .5s ease-in-out infinite}
.a-cheering .la,.a-cheering .lb{animation:hop .5s ease-in-out infinite}
.a-cheering .al,.a-cheering .ar{transform:translateY(-6px)}
.a-cheering .sk0{animation:blink 1s steps(1) infinite}.a-cheering .sk1{animation:blink 1s steps(1) infinite -.5s}
@keyframes hop{50%{transform:translateY(-3px)}}
.a-stuck .bd{transform-origin:50% 100%;animation:swy 2.5s ease-in-out infinite}
@keyframes swy{0%,100%{transform:rotate(0deg) translateY(1px)}50%{transform:rotate(-3deg) translateY(1px)}}
.a-stuck .ey{animation:dz 2.5s linear infinite}
@keyframes dz{to{transform:rotate(360deg)}}
.a-stuck .hat,.a-stuck .ant,.a-stuck .pf{transform-origin:50% 100%;transform:rotate(-14deg) translateY(1px)}
@media (prefers-reduced-motion: reduce){.sp *{animation:none!important}}
</style>`
