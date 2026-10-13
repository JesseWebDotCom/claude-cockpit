// The plan page's one custom character, drawn by us (no outside art): a 20 x 20 pixel person, built pose by pose into real frames.
// Run `bun tools/charart.ts`; it writes assets/characters-frames.js (committed, the page and the tests read it).
//
// Each animation is a list of POSES (hand-placed head, body, arm and leg positions). A pose is drawn into a 20 x 20 letter grid, then a one-pixel
// outline is added round the figure, so every frame shares one style. Letters: o outline, b body (the tile's colour), d body shade, s skin,
// e eye, m mouth, k shoe, w white glint, y spark, z sleep z, x dust.
import { writeFileSync } from 'node:fs'

export const W = 20
export const H = 20
type Hand = 'p' | 'f' | 't' | 'o'
/** [dx, dy, hand, elbowDx?, elbowDy?]: the hand's offset from the shoulder, its shape, and an optional elbow offset (a bent arm). */
type Arm = [number, number, Hand?, number?, number?]
type Extra = [number, number, string]
export type Pose = {
  bx?: number; by?: number; hx?: number; hy?: number
  eyes?: 'o' | 'c' | 'l' | 'r'
  mouth?: 'n' | 's' | 'o'
  turn?: 0 | 1 | 2 // 0 front, 1 side (faces right), 2 back
  face?: 1 | -1 // -1 mirrors the whole figure
  aL?: Arm; aR?: Arm
  fL?: [number, number]; fR?: [number, number] // feet, absolute
  ex?: Extra[]
}
const BASE: Required<Omit<Pose, 'ex'>> & { ex: Extra[] } = { bx: 0, by: 0, hx: 0, hy: 0, eyes: 'o', mouth: 'n', turn: 0, face: 1, aL: [0, 4], aR: [0, 4], fL: [8, 17], fR: [11, 17], ex: [] }

// Small stamps (letters as above), drawn after the outline.
const STAMPS: Record<string, string[]> = {
  z: ['zzz', '.z.', 'zzz'],
  zs: ['zz', '.z'],
  bang: ['b', 'b', 'b', '.', 'b'],
  spark: ['.y.', 'yyy', '.y.'],
  dot: ['y'],
  dust: ['x.x', '.x.'],
  dust2: ['.x', 'x.', '.x'],
  puff: ['x'],
  glint: ['w'],
  note: ['.bb', '.b.', 'bb.'],
}

function line(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = []
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
  for (let i = 0; i <= n; i++) out.push([Math.round(x0 + ((x1 - x0) * i) / (n || 1)), Math.round(y0 + ((y1 - y0) * i) / (n || 1))])
  return out
}

export function draw(pose: Pose): string[] {
  const p = { ...BASE, ...pose }
  const g: string[][] = Array.from({ length: H }, () => Array(W).fill('.'))
  const set = (x: number, y: number, c: string): void => { if (x >= 0 && x < W && y >= 0 && y < H) g[y]![x] = c }
  const side = p.turn === 1
  const bx = p.bx, by = p.by
  // legs
  const hips: [number, number][] = side ? [[9 + bx, 13 + by], [10 + bx, 13 + by]] : [[8 + bx, 13 + by], [11 + bx, 13 + by]]
  const feet = [p.fL, p.fR]
  hips.forEach((h, i) => {
    const f = feet[i]!
    for (const [x, y] of line(h[0], h[1], f[0], f[1])) set(x, y, 'd')
    set(f[0], f[1], 'k')
    set(f[0] + (side ? 1 : i === 0 ? -1 : 1), f[1], 'k')
  })
  // torso
  const tx0 = side ? 8 : 7, tw = side ? 4 : 6
  for (let r = 0; r < 5; r++) for (let c = 0; c < tw; c++) set(tx0 + bx + c, 8 + by + r, r === 4 ? 'd' : 'b')
  // arms
  const sh: [number, number][] = side ? [[9 + bx, 9 + by], [10 + bx, 9 + by]] : [[6 + bx, 9 + by], [13 + bx, 9 + by]]
  ;([p.aL, p.aR] as Arm[]).forEach((a, i) => {
    const s = sh[i]!
    const dir = side ? 1 : i === 0 ? -1 : 1
    const pts: [number, number][] = [s]
    if (a[3] !== undefined) pts.push([s[0] + a[3]!, s[1] + a[4]!])
    const end: [number, number] = [s[0] + a[0], s[1] + a[1]]
    pts.push(end)
    for (let k = 0; k + 1 < pts.length; k++) for (const [x, y] of line(pts[k]![0], pts[k]![1], pts[k + 1]![0], pts[k + 1]![1])) set(x, y, 'b')
    const hand = a[2] ?? 'p'
    set(end[0], end[1], 's')
    if (hand === 'f' || hand === 't') { set(end[0] + dir, end[1], 's'); set(end[0], end[1] - 1, 's'); set(end[0] + dir, end[1] - 1, 's') }
    if (hand === 't') set(end[0], end[1] - 2, 's')
    if (hand === 'o') { set(end[0], end[1] - 1, 's'); set(end[0] + dir, end[1] - 1, 's') }
  })
  // head
  const hw = side ? 5 : 6
  const x0 = (side ? 8 : 7) + bx + p.hx, y0 = 2 + by + p.hy
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < hw; c++) {
      if (r === 0 && (c === 0 || c === hw - 1)) continue
      const cap = r < 2 || (p.turn === 2 && r < 5) || (side && c === 0 && r < 4)
      set(x0 + c, y0 + r, cap ? 'b' : 's')
    }
  }
  if (p.turn !== 2) {
    const sh1 = p.eyes === 'l' ? -1 : p.eyes === 'r' ? 1 : 0
    const cols = side ? [3] : [1, 4]
    for (const c of cols) {
      const x = x0 + c + (side ? 0 : sh1)
      if (p.eyes !== 'c') set(x, y0 + 3, 'e')
      set(x, y0 + 4, 'e')
    }
    if (side) set(x0 + hw, y0 + 3, 's')
    const mc = side ? [2, 3] : [2, 3]
    if (p.mouth === 's' || p.mouth === 'o') for (const c of mc) set(x0 + c + (side ? 0 : sh1), y0 + 5, 'm')
    if (p.mouth === 'o') for (const c of mc) set(x0 + c + (side ? 0 : sh1), y0 + 4, 'm')
  }
  // outline: every clear cell next to the figure
  const o: string[][] = g.map(r => r.slice())
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y]![x] !== '.') continue
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy!]?.[x + dx!] !== undefined && g[y + dy!]![x + dx!] !== '.')) o[y]![x] = 'o'
  }
  if (p.face === -1) o.forEach(r => r.reverse())
  for (const [x, y, name] of p.ex) STAMPS[name]!.forEach((row, j) => [...row].forEach((c, i) => { if (c !== '.' && y + j >= 0 && y + j < H && x + i >= 0 && x + i < W) o[y + j]![x + i] = c }))
  return o.map(r => r.join(''))
}

type Anim = { fps: number; poses: Pose[] }
const P = (o: Pose): Pose => o
const SIDE: Pose = { turn: 1 }
const UP = (dx: number): Arm => [dx, -6, 'o']

// ---------------------------------------------------------------------------------------------------------------------------------------------
export const ANIMS: Record<string, Record<string, Anim>> = {
  // Sleeping (the tile's count is 0): slumped with slow breathing and a drifting z; or head nodding.
  asleep: {
    curl: { fps: 6, poses: [
      P({ by: 3, hy: 1, eyes: 'c', aL: [2, 3], aR: [-2, 3], fL: [7, 17], fR: [12, 17], ex: [[13, 6, 'zs']] }),
      P({ by: 3, hy: 1, eyes: 'c', aL: [2, 3], aR: [-2, 3], fL: [7, 17], fR: [12, 17], ex: [[14, 4, 'zs']] }),
      P({ by: 3, hy: 0, eyes: 'c', aL: [2, 3], aR: [-2, 3], fL: [7, 17], fR: [12, 17], ex: [[14, 2, 'z']] }),
      P({ by: 3, hy: 0, eyes: 'c', aL: [2, 3], aR: [-2, 3], fL: [7, 17], fR: [12, 17], ex: [[15, 0, 'z']] }),
      P({ by: 3, hy: 1, eyes: 'c', aL: [2, 3], aR: [-2, 3], fL: [7, 17], fR: [12, 17], ex: [[15, 0, 'zs']] }),
      P({ by: 3, hy: 1, eyes: 'c', aL: [2, 3], aR: [-2, 3], fL: [7, 17], fR: [12, 17], ex: [[13, 5, 'zs']] }),
    ] },
    nod: { fps: 6, poses: [
      P({ by: 2, hy: 0, eyes: 'c', aL: [1, 4], aR: [-1, 4], fL: [7, 17], fR: [12, 17] }),
      P({ by: 2, hy: 1, eyes: 'c', aL: [1, 4], aR: [-1, 4], fL: [7, 17], fR: [12, 17], ex: [[14, 3, 'zs']] }),
      P({ by: 2, hy: 2, eyes: 'c', aL: [1, 4], aR: [-1, 4], fL: [7, 17], fR: [12, 17], ex: [[15, 1, 'z']] }),
      P({ by: 2, hy: 3, eyes: 'c', aL: [1, 4], aR: [-1, 4], fL: [7, 17], fR: [12, 17], ex: [[15, 0, 'z']] }),
      P({ by: 2, hy: 1, eyes: 'o', mouth: 'o', aL: [1, 4], aR: [-1, 4], fL: [7, 17], fR: [12, 17] }),
      P({ by: 2, hy: 0, eyes: 'c', aL: [1, 4], aR: [-1, 4], fL: [7, 17], fR: [12, 17], ex: [[14, 2, 'zs']] }),
    ] },
  },
  // Running: run cycle, sprint with dust, jog with a head bob.
  running: {
    cycle: { fps: 8, poses: [
      P({ ...SIDE, aL: [-3, 2, 'f'], aR: [3, -1, 'f'], fL: [6, 17], fR: [13, 15] }),
      P({ ...SIDE, by: -1, aL: [-1, 4, 'f'], aR: [1, 4, 'f'], fL: [8, 17], fR: [10, 15] }),
      P({ ...SIDE, aL: [3, -1, 'f'], aR: [-3, 2, 'f'], fL: [13, 15], fR: [6, 17] }),
      P({ ...SIDE, by: -1, aL: [1, 4, 'f'], aR: [-1, 4, 'f'], fL: [10, 15], fR: [8, 17] }),
    ] },
    sprint: { fps: 10, poses: [
      P({ ...SIDE, bx: 1, hx: 1, mouth: 'o', aL: [-4, 0, 'f', -2, 3], aR: [3, -2, 'f', 1, 3], fL: [5, 17], fR: [14, 15], ex: [[1, 16, 'dust']] }),
      P({ ...SIDE, bx: 1, hx: 1, by: -2, mouth: 'o', aL: [-3, 1, 'f', -1, 3], aR: [2, -1, 'f', 0, 3], fL: [8, 16], fR: [11, 16], ex: [[0, 14, 'dust2'], [2, 17, 'puff']] }),
      P({ ...SIDE, bx: 1, hx: 1, mouth: 'o', aL: [3, -2, 'f', 1, 3], aR: [-4, 0, 'f', -2, 3], fL: [14, 15], fR: [5, 17], ex: [[1, 15, 'dust2']] }),
      P({ ...SIDE, bx: 1, hx: 1, by: -2, mouth: 'o', aL: [2, -1, 'f', 0, 3], aR: [-3, 1, 'f', -1, 3], fL: [11, 16], fR: [8, 16], ex: [[0, 16, 'dust'], [3, 17, 'puff']] }),
    ] },
    jog: { fps: 8, poses: [
      P({ ...SIDE, hy: 0, mouth: 's', aL: [-2, 3, 'f', -2, 1], aR: [2, 2, 'f', 2, 1], fL: [7, 17], fR: [12, 16] }),
      P({ ...SIDE, hy: -1, by: -1, mouth: 's', aL: [-1, 4, 'f', -1, 2], aR: [1, 4, 'f', 1, 2], fL: [9, 17], fR: [10, 17] }),
      P({ ...SIDE, hy: 0, mouth: 's', aL: [2, 2, 'f', 2, 1], aR: [-2, 3, 'f', -2, 1], fL: [12, 16], fR: [7, 17] }),
      P({ ...SIDE, hy: -1, by: -1, mouth: 's', aL: [1, 4, 'f', 1, 2], aR: [-1, 4, 'f', -1, 2], fL: [10, 17], fR: [9, 17] }),
    ] },
  },
  // Needs you: waving, jumping with both arms up, pacing and pointing.
  you: {
    wave: { fps: 8, poses: [
      P({ mouth: 'o', aR: [3, -5, 'o'], ex: [[16, 1, 'bang']] }),
      P({ mouth: 'o', aR: [2, -6, 'o'] }),
      P({ mouth: 'o', aR: [0, -6, 'o'], ex: [[16, 1, 'bang']] }),
      P({ mouth: 'o', aR: [2, -6, 'o'] }),
      P({ mouth: 's', aR: [3, -5, 'o'], ex: [[16, 1, 'bang']] }),
      P({ mouth: 'o', aR: [1, -6, 'o'] }),
    ] },
    jump: { fps: 8, poses: [
      P({ by: 2, mouth: 's', aL: [-1, 3], aR: [1, 3], fL: [7, 17], fR: [12, 17] }),
      P({ by: -1, mouth: 'o', aL: [-3, -5, 'o'], aR: [3, -5, 'o'], fL: [8, 16], fR: [11, 16] }),
      P({ by: -3, mouth: 'o', aL: [-4, -4, 'o'], aR: [4, -4, 'o'], fL: [8, 14], fR: [12, 15], ex: [[15, 0, 'bang']] }),
      P({ by: -3, mouth: 'o', aL: [-3, -6, 'o'], aR: [3, -6, 'o'], fL: [7, 15], fR: [11, 14] }),
      P({ by: -1, mouth: 'o', aL: [-4, -3, 'o'], aR: [4, -3, 'o'], fL: [8, 16], fR: [11, 16] }),
      P({ by: 2, mouth: 's', aL: [-2, 2], aR: [2, 2], fL: [7, 17], fR: [12, 17] }),
    ] },
    point: { fps: 8, poses: [
      P({ ...SIDE, mouth: 'o', aL: [-2, 3], aR: [5, -1, 'p'], fL: [7, 17], fR: [12, 16], ex: [[15, 4, 'bang']] }),
      P({ ...SIDE, by: -1, mouth: 'o', aL: [-1, 4], aR: [5, -2, 'p'], fL: [9, 17], fR: [10, 17] }),
      P({ ...SIDE, mouth: 'o', aL: [-2, 3], aR: [5, -1, 'p'], fL: [12, 16], fR: [7, 17], ex: [[15, 4, 'bang']] }),
      P({ ...SIDE, by: -1, mouth: 'o', aL: [-1, 4], aR: [5, 0, 'p'], fL: [10, 17], fR: [9, 17] }),
    ] },
  },
  // To go (waiting its turn): an idle shuffle, looking around, stretching and checking a watch.
  todo: {
    shuffle: { fps: 6, poses: [
      P({ bx: 0 }),
      P({ bx: 1, aL: [0, 4], aR: [1, 3], fL: [9, 17], fR: [12, 17] }),
      P({ bx: 1, hy: 1, fL: [9, 17], fR: [12, 16] }),
      P({ bx: 0, mouth: 's' }),
      P({ bx: -1, aL: [-1, 3], aR: [0, 4], fL: [7, 17], fR: [10, 17] }),
      P({ bx: -1, hy: 1, fL: [7, 16], fR: [10, 17] }),
    ] },
    look: { fps: 6, poses: [
      P({}),
      P({ eyes: 'l' }),
      P({ eyes: 'l', hx: -1 }),
      P({ eyes: 'l' }),
      P({}),
      P({ eyes: 'r' }),
      P({ eyes: 'r', hx: 1 }),
      P({ eyes: 'r' }),
    ] },
    watch: { fps: 6, poses: [
      P({}),
      P({ aL: [-1, 1, 'f'], aR: [1, 1, 'f'], mouth: 'o' }),
      P({ aL: [-1, -4, 'o'], aR: [1, -4, 'o'], mouth: 'o', by: -1 }),
      P({ aL: [-1, -6, 'o'], aR: [1, -6, 'o'], mouth: 'o', by: -1 }),
      P({ aL: [-1, -3, 'o'], aR: [1, -3, 'o'], mouth: 'n' }),
      P({}),
      P({ aL: [4, 0, 'f', 3, 3], hy: 1, mouth: 'n' }),
      P({ aL: [4, 0, 'f', 3, 3], hy: 1, mouth: 'n', ex: [[11, 8, 'glint']] }),
      P({ aL: [3, 2, 'f', 3, 3], mouth: 'n' }),
    ] },
  },
  // Done: fist pump, thumbs up, spin.
  done: {
    pump: { fps: 8, poses: [
      P({ mouth: 's', aR: [1, -4, 'f'] }),
      P({ mouth: 's', by: -1, aR: [1, -6, 'f'], fL: [8, 17], fR: [11, 16], ex: [[3, 1, 'spark']] }),
      P({ mouth: 's', aR: [1, -4, 'f'] }),
      P({ mouth: 's', by: -1, aL: [-1, -6, 'f'], aR: [0, 4], fL: [8, 16], fR: [11, 17], ex: [[15, 1, 'spark']] }),
      P({ mouth: 's', aL: [-1, -4, 'f'] }),
      P({ mouth: 's', by: -1, aL: [-1, -6, 'f'], aR: [1, -6, 'f'], fL: [8, 16], fR: [11, 16], ex: [[2, 4, 'dot'], [17, 3, 'dot']] }),
    ] },
    thumbs: { fps: 8, poses: [
      P({ mouth: 's', aR: [1, 2, 'f', 2, 3] }),
      P({ mouth: 's', aR: [3, -1, 't', 2, 2] }),
      P({ mouth: 's', aR: [4, -3, 't', 3, 1], ex: [[17, 1, 'dot']] }),
      P({ mouth: 's', by: -1, aR: [4, -3, 't', 3, 1], fL: [8, 17], fR: [11, 16], ex: [[16, 0, 'spark']] }),
      P({ mouth: 's', aR: [4, -4, 't', 3, 1] }),
      P({ mouth: 's', aR: [3, -1, 't', 2, 2] }),
    ] },
    spin: { fps: 8, poses: [
      P({ mouth: 's' }),
      P({ ...SIDE, mouth: 's', by: -1, aL: [-1, 3], aR: [1, 3], fL: [9, 16], fR: [10, 16] }),
      P({ turn: 2, by: -2, aL: [-1, -3, 'o'], aR: [1, -3, 'o'], fL: [8, 15], fR: [11, 15] }),
      P({ ...SIDE, face: -1, mouth: 's', by: -1, aL: [-1, 3], aR: [1, 3], fL: [9, 16], fR: [10, 16] }),
      P({ mouth: 's', aL: [-2, -5, 'o'], aR: [2, -5, 'o'], ex: [[1, 2, 'spark'], [16, 3, 'spark']] }),
      P({ mouth: 's', aL: [-3, -2, 'f'], aR: [3, -2, 'f'] }),
    ] },
  },
  // The plan is done: five dance routines, eight frames each.
  dance: {
    disco: { fps: 8, poses: [
      P({ mouth: 's', aR: [3, -6, 'p'], aL: [-2, 2, 'f', -3, 1] }),
      P({ mouth: 's', bx: -1, aR: [3, -5, 'p'], aL: [-2, 2, 'f', -3, 1], fL: [7, 17], fR: [10, 17] }),
      P({ mouth: 's', by: 1, aR: [3, -6, 'p'], aL: [-2, 2, 'f', -3, 1], fL: [6, 17], fR: [13, 17] }),
      P({ mouth: 's', bx: 1, aR: [3, -5, 'p'], aL: [-2, 2, 'f', -3, 1], fL: [9, 17], fR: [12, 17] }),
      P({ mouth: 's', aL: [-3, -6, 'p'], aR: [2, 2, 'f', 3, 1] }),
      P({ mouth: 's', bx: 1, aL: [-3, -5, 'p'], aR: [2, 2, 'f', 3, 1], fL: [9, 17], fR: [12, 17] }),
      P({ mouth: 's', by: 1, aL: [-3, -6, 'p'], aR: [2, 2, 'f', 3, 1], fL: [6, 17], fR: [13, 17] }),
      P({ mouth: 's', bx: -1, aL: [-3, -5, 'p'], aR: [2, 2, 'f', 3, 1], fL: [7, 17], fR: [10, 17], ex: [[15, 1, 'note']] }),
    ] },
    runningman: { fps: 8, poses: [
      P({ ...SIDE, mouth: 's', aL: [-3, 1, 'f', -2, 3], aR: [3, -2, 'f', 2, 3], fL: [6, 17], fR: [11, 15] }),
      P({ ...SIDE, mouth: 's', by: -1, aL: [-2, 2, 'f', -2, 3], aR: [2, -1, 'f', 2, 3], fL: [7, 17], fR: [12, 17] }),
      P({ ...SIDE, mouth: 's', aL: [-3, 1, 'f', -2, 3], aR: [3, -2, 'f', 2, 3], fL: [5, 17], fR: [10, 16] }),
      P({ ...SIDE, mouth: 's', by: -1, aL: [-2, 2, 'f', -2, 3], aR: [2, -1, 'f', 2, 3], fL: [6, 17], fR: [11, 17] }),
      P({ ...SIDE, mouth: 's', aL: [3, -2, 'f', 2, 3], aR: [-3, 1, 'f', -2, 3], fL: [11, 15], fR: [6, 17] }),
      P({ ...SIDE, mouth: 's', by: -1, aL: [2, -1, 'f', 2, 3], aR: [-2, 2, 'f', -2, 3], fL: [12, 17], fR: [7, 17] }),
      P({ ...SIDE, mouth: 's', aL: [3, -2, 'f', 2, 3], aR: [-3, 1, 'f', -2, 3], fL: [10, 16], fR: [5, 17] }),
      P({ ...SIDE, mouth: 's', by: -1, aL: [2, -1, 'f', 2, 3], aR: [-2, 2, 'f', -2, 3], fL: [11, 17], fR: [6, 17], ex: [[15, 2, 'note']] }),
    ] },
    robot: { fps: 8, poses: [
      P({ aL: [-3, -3, 'f', -3, 0], aR: [3, 3, 'f', 3, 0] }),
      P({ hx: -1, aL: [-3, -3, 'f', -3, 0], aR: [3, 3, 'f', 3, 0], bx: 0 }),
      P({ hx: -1, aL: [-3, 3, 'f', -3, 0], aR: [3, -3, 'f', 3, 0] }),
      P({ hx: 0, aL: [-3, 3, 'f', -3, 0], aR: [3, -3, 'f', 3, 0], fL: [7, 17], fR: [11, 17] }),
      P({ hx: 1, aL: [-3, -3, 'f', -3, 0], aR: [3, 3, 'f', 3, 0], fL: [7, 17], fR: [12, 17] }),
      P({ hx: 1, aL: [-3, 3, 'f', -3, 0], aR: [3, -3, 'f', 3, 0], fL: [8, 17], fR: [12, 17] }),
      P({ hx: 0, aL: [-3, -3, 'f', -3, 0], aR: [-0, -3, 'f', 3, 0] }),
      P({ hx: 0, by: 0, aL: [0, -3, 'f', -3, 0], aR: [3, -3, 'f', 3, 0], ex: [[15, 2, 'note']] }),
    ] },
    clap: { fps: 8, poses: [
      P({ mouth: 's', aL: [-2, -2, 'o'], aR: [2, -2, 'o'] }),
      P({ mouth: 's', aL: [3, 1, 'f', 1, 3], aR: [-3, 1, 'f', -1, 3], ex: [[8, 5, 'spark']] }),
      P({ mouth: 's', bx: -1, aL: [-2, -2, 'o'], aR: [2, -2, 'o'], fL: [7, 17], fR: [10, 17] }),
      P({ mouth: 's', bx: -1, aL: [3, 1, 'f', 1, 3], aR: [-3, 1, 'f', -1, 3], fL: [7, 17], fR: [10, 17] }),
      P({ mouth: 's', aL: [-2, -2, 'o'], aR: [2, -2, 'o'] }),
      P({ mouth: 's', aL: [3, 1, 'f', 1, 3], aR: [-3, 1, 'f', -1, 3], ex: [[8, 5, 'spark']] }),
      P({ mouth: 's', bx: 1, aL: [-2, -2, 'o'], aR: [2, -2, 'o'], fL: [9, 17], fR: [12, 17] }),
      P({ mouth: 's', bx: 1, aL: [3, 1, 'f', 1, 3], aR: [-3, 1, 'f', -1, 3], fL: [9, 17], fR: [12, 17] }),
    ] },
    spinpose: { fps: 8, poses: [
      P({ mouth: 's', aL: [-2, 2, 'f'], aR: [2, 2, 'f'] }),
      P({ ...SIDE, mouth: 's', by: -1, aL: [-1, 3], aR: [1, 3], fL: [9, 16], fR: [10, 16] }),
      P({ turn: 2, by: -2, aL: [-3, 0, 'o'], aR: [3, 0, 'o'], fL: [8, 15], fR: [11, 15] }),
      P({ ...SIDE, face: -1, mouth: 's', by: -1, aL: [-1, 3], aR: [1, 3], fL: [9, 16], fR: [10, 16] }),
      P({ mouth: 's', aL: [-2, 2, 'f'], aR: [2, 2, 'f'] }),
      P({ mouth: 's', by: 1, aL: [-1, 2, 'f', -3, 1], aR: [3, -6, 'p'], fL: [6, 17], fR: [12, 17], ex: [[1, 3, 'spark']] }),
      P({ mouth: 's', by: 1, aL: [-1, 2, 'f', -3, 1], aR: [3, -6, 'p'], fL: [6, 17], fR: [12, 17], ex: [[16, 2, 'spark']] }),
      P({ mouth: 's', aL: [-1, 2, 'f', -3, 1], aR: [3, -5, 'p'], fL: [7, 17], fR: [12, 17], ex: [[1, 5, 'dot'], [16, 4, 'dot']] }),
    ] },
  },
}

export function build(): Record<string, Record<string, { fps: number; frames: string[][] }>> {
  const out: Record<string, Record<string, { fps: number; frames: string[][] }>> = {}
  for (const [g, set] of Object.entries(ANIMS)) {
    out[g] = {}
    for (const [name, a] of Object.entries(set)) out[g]![g + '-' + name] = { fps: a.fps, frames: a.poses.map(draw) }
  }
  return out
}

if (import.meta.main) {
  const all = build()
  const rows = Object.entries(all).map(([g, set]) => `  ${g}: {\n${Object.entries(set).map(([n, a]) => `    '${n}': { fps: ${a.fps}, frames: [\n${a.frames.map(f => '      ' + JSON.stringify(f)).join(',\n')},\n    ] },`).join('\n')}\n  },`).join('\n')
  writeFileSync(new URL('../assets/characters-frames.js', import.meta.url).pathname, `// GENERATED by tools/charart.ts from the poses drawn there. Do not edit: change the poses and run \`bun tools/charart.ts\`.\n// Every animation is a list of frames; a frame is 20 strings of 20 letters (o outline, b body, d shade, s skin, e eye, m mouth, k shoe, w glint, y spark, z sleep z, x dust, . clear).\nconst CHAR_FRAMES = {\n${rows}\n};\nif (typeof module !== 'undefined') module.exports = CHAR_FRAMES\n`)
  console.log('wrote assets/characters-frames.js', Object.entries(all).map(([g, s]) => g + ':' + Object.keys(s).length).join(' '))
}
