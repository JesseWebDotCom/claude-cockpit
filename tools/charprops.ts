// Props for the plan page character (pillows, flags, trophies, guitars ...), drawn by us as pixel stamps, and the animations that use them.
// Merged into the animation set by tools/charart.ts. Letters as in charart.ts; props add p wood, c paper, r red, u light blue, h metal, n pink, g green.
import type { Anim, Pose } from './charart.ts'

type Stamps = Record<string, string[]>
type Ex = [number, number, string]
export const PROP_STAMPS: Stamps = {
  dr: ['r'], du: ['u'], dg: ['g'], dn: ['n'], dw: ['w'],
  pillow: ['.ccccccccc.', 'ccccccccccc', 'ccccccccccc', '.ccccccccc.'],
  ncap: ['....ww', '..rrrr', '.rrrr.', 'rrrrrr'],
  blanket: ['rrrrrrrrrr', 'rcrcrcrcrc', 'rrrrrrrrrr', 'rcrcrcrcrc'],
  teddy: ['y...y', 'yyyyy', 'yeyey', 'yyyyy', '.y.y.'],
  sling: ['rcrcrcrcrcrc'],
  sn1: ['u'], sn2: ['uu', 'uu'], sn3: ['.uu.', 'u..u', 'u..u', '.uu.'],
  sn4: ['.uuuu.', 'u....u', 'u..c.u', 'u....u', 'u....u', '.uuuu.'],
  flagA: ['prrr', 'prrr', 'pr..', 'p...', 'p...', 'p...', 'p...', 'p...'],
  flagB: ['p...', 'prr.', 'prrr', 'prr.', 'p...', 'p...', 'p...', 'p...'],
  case: ['.hhh.', 'ppppp', 'ppwpp', 'ppppp'],
  cup: ['ccc', 'ppp', 'ppp', '.p.'],
  bug1: ['.h.h.', 'ggggg', 'g.g.g'], bug2: ['..h..', 'ggggg', '.g.g.'],
  board: ['pppppppppppp', '.hh......hh.'],
  pack: ['hh', 'hh', 'hh', 'rr'], fl1: ['.y', 'yy', '.y'], fl2: ['yr', 'yy', 'y.'], fl3: ['rr', 'yr', '.y'],
  sign1: ['ccrrcc', 'ccrrcc', 'ccrrcc', 'cccccc', 'ccrrcc', 'cccccc'],
  sign2: ['crrrrc', 'cccrrc', 'ccrrcc', 'cccccc', 'ccrrcc', 'cccccc'],
  bellA: ['.yy.', 'yyyy', 'yyyy', 'hhhh'], bellL: ['yy..', 'yyyy', '.yyy', '..hh'], bellR: ['..yy', 'yyyy', 'yyy.', 'hh..'],
  mega: ['....rr.', '..rrrrr', 'hhrrrrr', '..rrrrr', '....rr.'],
  wv1: ['y', 'y'], wv2: ['y.', '.y', '.y', 'y.'], wv3: ['y..', '.y.', '..y', '..y', '.y.', 'y..'],
  dome: ['.rr.', 'rrrr', 'hhhh'], domeW: ['.ww.', 'wwww', 'hhhh'],
  phone: ['hh', 'hc', 'hh'],
  clip0: ['.phhp.', 'pccccp', 'phuucp', 'phuucp', 'phuucp', 'pppppp'],
  clip1: ['.phhp.', 'pccccp', 'pguucp', 'phuucp', 'phuucp', 'pppppp'],
  clip2: ['.phhp.', 'pccccp', 'pguucp', 'pguucp', 'phuucp', 'pppppp'],
  clip3: ['.phhp.', 'pccccp', 'pguucp', 'pguucp', 'pguucp', 'pppppp'],
  bookA: ['cuuhuuc', 'cuuhuuc', 'cuuhuuc', 'ppppppp'], bookB: ['cuuhuc.', 'cuuhucc', 'cuuhuuc', 'ppppppp'], bookC: ['cuhcuuc', 'cuhcuuc', 'cuhcuuc', 'ppppppp'],
  laptop: ['hhhhhh', 'hhwwhh', 'hhhhhh', 'hhhhhh'], lapbase: ['hhhhhhhh'], table: ['pppppppppppp'], leg: ['p', 'p'],
  mug: ['pppp.', 'ccccc', 'cccc.', '.cc..'],
  fish: ['.uuw', 'uuu.'],
  b2r: ['rr', 'rr'], b2y: ['yy', 'yy'], b2u: ['uu', 'uu'],
  tro: ['.yyy.', 'yyyyy', 'yyyyy', '.yyy.', '..y..', '.yyy.'],
  cone: ['..y', '.rr', 'rrr'],
  star5: ['..y..', '.yyy.', 'yyyyy', '.yyy.', '.y.y.'],
  medal: ['r..r', '.rr.', '.yy.', '.yy.'],
  balR: ['.r.', 'rrr', 'rrr', '.r.'], balU: ['.u.', 'uuu', 'uuu', '.u.'], balN: ['.n.', 'nnn', 'nnn', '.n.'],
  guitar: ['.pp.', 'pppp', 'phhp', 'pppp', '.pp.'],
  ballD: ['.hhh.', 'hwhwh', 'hhwhh', 'hwhwh', '.hhh.'],
  pom: ['y.y', 'yyy', '.y.'], pomN: ['n.n', 'nnn', '.n.'],
  boxA: ['.hhhhhh.', 'hhhhhhhh', 'hcchhcch', 'hcchhcch', 'hhhhhhhh'], boxB: ['.hhhhhh.', 'hhhhhhhh', 'hwchhcwh', 'hcwhhwch', 'hhhhhhhh'],
  hat: ['.kkkk.', '.kkkk.', '.rrrr.', 'kkkkkk'],
}

const P = (o: Pose): Pose => o
const F = (n: number, fn: (i: number) => Pose): Pose[] => Array.from({ length: n }, (_, i) => fn(i))
const SIDE: Pose = { turn: 1 }
/** The head's top-left corner for a pose. */
const head = (p: Pose): [number, number] => [(p.turn === 1 ? 8 : 7) + (p.bx ?? 0) + (p.hx ?? 0), 2 + (p.by ?? 0) + (p.hy ?? 0)]
/** Where a hand ends up for a pose (L or R). */
const hand = (p: Pose, w: 'L' | 'R'): [number, number] => {
  const side = p.turn === 1, i = w === 'L' ? 0 : 1
  const sh = side ? [[9, 9], [10, 9]][i]! : [[6, 9], [13, 9]][i]!
  const a = (w === 'L' ? p.aL : p.aR) ?? [0, 4]
  return [sh[0]! + (p.bx ?? 0) + a[0], sh[1]! + (p.by ?? 0) + a[1]]
}
const RUN: Pose[] = [
  { aL: [-3, 2, 'f'], aR: [3, -1, 'f'], fL: [6, 17], fR: [13, 15] },
  { by: -1, aL: [-1, 4, 'f'], aR: [1, 4, 'f'], fL: [8, 17], fR: [10, 15] },
  { aL: [3, -1, 'f'], aR: [-3, 2, 'f'], fL: [13, 15], fR: [6, 17] },
  { by: -1, aL: [1, 4, 'f'], aR: [-1, 4, 'f'], fL: [10, 15], fR: [8, 17] },
]
const run = (i: number, o: Pose = {}): Pose => ({ ...SIDE, mouth: 's', ...RUN[i % 4]!, ...o })
const ZP: Ex[] = [[14, 5, 'zs'], [14, 4, 'zs'], [15, 2, 'zs'], [15, 1, 'z'], [16, 0, 'z'], [15, 0, 'zs'], [14, 2, 'zs'], [13, 4, 'zs']]
const wave = (i: number, n: number, amp = 1): number => Math.round(Math.sin((i / n) * Math.PI * 2) * amp)

export const EXTRA_ANIMS: Record<string, Record<string, Anim>> = {
  asleep: {
    // Tucked in: a pillow behind, a blanket that rises with each breath, a nightcap, a drifting z.
    tuck: { fps: 6, poses: F(8, i => {
      const o: Pose = { by: 2, hy: i % 4 < 2 ? 0 : 1, eyes: 'c', aL: [1, 4], aR: [-1, 4], fL: [7, 17], fR: [12, 17] }
      const [x0, y0] = head(o)
      return P({ ...o, bg: [[4, 7, 'pillow']], pr: [[x0, y0 - 2, 'ncap'], [5, 14 + ((i >> 1) & 1), 'blanket']], ex: [ZP[i]!] })
    }) },
    // Hugging a teddy bear.
    teddy: { fps: 6, poses: F(8, i => P({ by: 2, hy: i % 4 < 2 ? 0 : 1, eyes: 'c', aL: [1, 3], aR: [-1, 3], fL: [7, 17], fR: [12, 17], pr: [[7, 11 + ((i >> 1) & 1), 'teddy']], ex: [ZP[(i + 2) % 8]!] })) },
    // Swaying in a hammock.
    hammock: { fps: 6, poses: F(8, i => {
      const sw = wave(i, 8)
      return P({ bx: sw, by: 3, hy: i % 4 < 2 ? 0 : 1, eyes: 'c', aL: [1, 3], aR: [-1, 3], fL: [7, 17], fR: [12, 17], ln: [[0, 7, 5, 13, 'p'], [19, 7, 15, 13, 'p']], pr: [[4 + sw, 16, 'sling']], ex: [ZP[(i + 4) % 8]!] })
    }) },
    // A snore bubble that grows, pops and starts again.
    snore: { fps: 6, poses: F(8, i => {
      const o: Pose = { by: 2, hy: [0, 0, 0, 1, 1, 1, 0, 0][i]!, eyes: 'c', mouth: i === 6 ? 'o' : 'n', aL: [1, 4], aR: [-1, 4], fL: [7, 17], fR: [12, 17] }
      const [, y0] = head(o)
      const bub: Ex[][] = [[[13, y0 + 4, 'sn1']], [[13, y0 + 3, 'sn2']], [[13, y0 + 2, 'sn3']], [[13, y0, 'sn4']], [[13, y0, 'sn4'], [16, y0 - 1, 'dot']], [[13, y0 + 1, 'du'], [16, y0 - 1, 'du'], [18, y0 + 3, 'du'], [15, y0 + 6, 'du'], [12, y0, 'du']], [], [[14, y0 - 2, 'zs']]]
      return P({ ...o, ex: bub[i]! })
    }) },
  },
  running: {
    // Carrying a flag that waves.
    flag: { fps: 8, poses: F(8, i => {
      const p = run(i, { aR: [3, -1, 'f'] }), [hx, hy] = hand(p, 'R')
      return P({ ...p, pr: [[hx, hy - 6, i % 2 ? 'flagB' : 'flagA']], ex: i % 4 === 3 ? [[1, 15, 'dust']] : [] })
    }) },
    // Hurrying with a briefcase.
    case: { fps: 8, poses: F(8, i => {
      const p = run(i, { aR: [2, 3, 'f'] }), [hx, hy] = hand(p, 'R')
      return P({ ...p, bx: i % 4 === 1 ? 1 : 0, pr: [[hx - 2, hy, 'case']], ex: i % 2 ? [[2, 14 + (i >> 2), 'dust2']] : [] })
    }) },
    // Running without spilling the coffee.
    coffee: { fps: 8, poses: F(8, i => {
      const p = run(i, { aR: [3, -1, 'f'] }), [hx, hy] = hand(p, 'R')
      return P({ ...p, pr: [[hx - 1, hy - 3, 'cup']], ex: [[hx - 1 + (i % 3), hy - 5 - (i % 2), 'puff'], [hx + (i % 2), hy - 6 + (i % 3 === 0 ? 1 : 0), 'puff']] })
    }) },
    // Chased by a small bug.
    bug: { fps: 8, poses: F(8, i => P({ ...run(i, { bx: 3, hx: 1, mouth: 'o' }), bg: [[0, 15, i % 2 ? 'bug2' : 'bug1']], ex: [[i % 3, 18, 'puff']] })) },
    // Rolling along on a skateboard, pushing and jumping.
    skate: { fps: 8, poses: [
      P({ ...SIDE, mouth: 's', aL: [-2, 3, 'f'], aR: [2, 3, 'f'], fL: [8, 17], fR: [11, 17], pr: [[4, 18, 'board']] }),
      P({ ...SIDE, mouth: 's', aL: [-3, 2, 'f'], aR: [3, 1, 'f'], fL: [7, 17], fR: [13, 17], pr: [[4, 18, 'board']], ex: [[0, 18, 'puff']] }),
      P({ ...SIDE, mouth: 's', by: 1, aL: [-2, 2, 'f', -2, 3], aR: [3, 0, 'f', 1, 3], fL: [8, 17], fR: [12, 17], pr: [[4, 18, 'board']], ex: [[0, 17, 'dust2']] }),
      P({ ...SIDE, mouth: 'o', by: -1, aL: [-3, 1, 'f'], aR: [3, -2, 'f'], fL: [8, 16], fR: [12, 16], pr: [[4, 17, 'board']] }),
      P({ ...SIDE, mouth: 'o', by: -3, aL: [-3, 0, 'f'], aR: [3, -3, 'f'], fL: [8, 15], fR: [12, 14], pr: [[4, 15, 'board']] }),
      P({ ...SIDE, mouth: 'o', by: -4, aL: [-2, -1, 'f'], aR: [3, -3, 'f'], fL: [8, 14], fR: [12, 14], pr: [[4, 14, 'board']], ex: [[15, 4, 'spark']] }),
      P({ ...SIDE, mouth: 'o', by: -2, aL: [-3, 1, 'f'], aR: [3, -1, 'f'], fL: [8, 16], fR: [12, 16], pr: [[4, 16, 'board']] }),
      P({ ...SIDE, mouth: 's', by: 1, aL: [-2, 3, 'f'], aR: [2, 3, 'f'], fL: [8, 17], fR: [11, 17], pr: [[4, 18, 'board']], ex: [[1, 17, 'dust'], [16, 17, 'dust2']] }),
    ] },
    // Flying with a jetpack.
    jetpack: { fps: 8, poses: F(8, i => {
      const by = [-1, -2, -3, -4, -4, -3, -2, -1][i]!
      return P({ ...SIDE, mouth: 'o', by, aL: [2, 0, 'f'], aR: [3, -1, 'f'], fL: [8, 16 + by + 1], fR: [11, 17 + by + 1], pr: [[6, 8 + by, 'pack'], [6, 12 + by, ['fl1', 'fl2', 'fl3', 'fl1'][i % 4]!]], ex: i % 2 ? [[4, 16, 'puff'], [7, 18, 'puff']] : [[5, 17, 'puff']] })
    }) },
  },
  you: {
    // Holding up a sign that flips between ! and ?.
    sign: { fps: 6, poses: F(8, i => {
      const o: Pose = { by: i % 2 ? -1 : 0, mouth: 'o', aR: [3, -3, 'f'], aL: [-1, 3], fL: [8, 17], fR: [11, 17] }
      const [hx, hy] = hand(o, 'R')
      return P({ ...o, pr: [[hx - 2, hy - 6, i % 4 < 2 ? 'sign1' : 'sign2']] })
    }) },
    // Ringing a hand bell.
    bell: { fps: 8, poses: F(8, i => {
      const t = i % 4, o: Pose = { mouth: 'o', aR: [3, -4 + (t === 1 || t === 3 ? 1 : 0), 'f'], aL: [-1, 3] }
      const [hx, hy] = hand(o, 'R')
      return P({ ...o, pr: [[hx - 1, hy - 4, ['bellA', 'bellL', 'bellA', 'bellR'][t]!]], ex: [[hx - 3 + (t === 1 ? -1 : 0), hy - 6, i < 4 ? 'dot' : 'dw'], [hx + 3 + (t === 3 ? 1 : 0), hy - 6, i < 4 ? 'dot' : 'dw']] })
    }) },
    // Calling through a megaphone, sound waves growing.
    mega: { fps: 6, poses: F(8, i => {
      const o: Pose = { ...SIDE, bx: -3, by: i % 2 ? -1 : 0, mouth: 'o', aR: [2, -2, 'f'], aL: [-1, 4], fL: [6, 17], fR: [8, 17] }
      const [x0, y0] = head(o), w = [0, 1, 2, 3, 3, 2, 1, 0][i]!
      const ex: Ex[] = []
      if (w >= 1) ex.push([17, y0 + 3, 'wv1'])
      if (w >= 2) ex.push([18, y0 + 1, 'wv2'])
      if (w >= 3) ex.push([19, y0 - 1, 'wv3'])
      return P({ ...o, pr: [[x0 + 5, y0 + 2, 'mega']], ex })
    }) },
    // A flashing siren on top of the head.
    siren: { fps: 8, poses: F(8, i => {
      const on = i % 2 === 0, o: Pose = { by: 2, mouth: 'o', aL: [-2, [-3, 1][i % 2]!, 'f'], aR: [2, [1, -3][i % 2]!, 'f'], fL: [8, 17], fR: [11, 17] }
      const [x0, y0] = head(o)
      return P({ ...o, pr: [[x0 + 1, y0 - 3, on ? 'domeW' : 'dome']], ex: on ? [[x0 - 2, y0 - 3, 'dot'], [x0 + 6, y0 - 3, 'dot'], [x0 - 3, y0 - 1, 'dot'], [x0 + 7, y0 - 1, 'dot']] : [[x0 + 5, y0 - 4, 'dot'], [x0, y0 - 4, 'dot']] })
    }) },
    // A phone to the ear: it rings, then they answer.
    phone: { fps: 6, poses: F(8, i => {
      const ring = i < 4, o: Pose = ring ? { mouth: 'o', aR: [0, -4, 'f'], aL: [-1, 3], by: i % 2 ? -1 : 0 } : { mouth: i % 2 ? 's' : 'o', aR: [0, -4, 'f'], aL: [-1, 3] }
      const [hx, hy] = hand(o, 'R')
      return P({ ...o, pr: [[hx, hy - 2, 'phone']], ex: ring ? [[hx + 3, hy - 3, i % 2 ? 'dot' : 'dw'], [hx + 4 + (i % 2), hy - 1, 'dot']] : [[hx + 3, hy - 4 - (i % 2), 'note']] })
    }) },
  },
  todo: {
    // Checking things off a clipboard.
    clipboard: { fps: 6, poses: F(8, i => P({ mouth: 'n', eyes: i % 2 ? 'l' : 'o', aL: [0, 3, 'f'], aR: [1, 2 + (i % 2), 'f'], hy: i % 2, pr: [[7, 9, 'clip' + Math.min(3, i >> 1)]] })) },
    // Reading a book and turning the page.
    book: { fps: 6, poses: F(8, i => P({ eyes: i % 2 ? 'l' : 'r', aL: [-1, 1, 'f'], aR: [1, 1, 'f'], hy: i % 4 === 3 ? 1 : 0, pr: [[6, 9, ['bookA', 'bookA', 'bookB', 'bookC', 'bookC', 'bookA', 'bookB', 'bookC'][i]!]], ex: i === 6 ? [[16, 3, 'dot']] : [] })) },
    // Typing on a laptop at a table.
    laptop: { fps: 8, poses: F(8, i => {
      const t = i % 2
      const pr: Ex[] = [[7, 10, 'laptop'], [6, 14, 'lapbase'], [4, 15, 'table'], [5, 16, 'leg'], [14, 16, 'leg']]
      return P({ mouth: i === 5 ? 's' : 'n', eyes: i % 4 === 2 ? 'l' : 'o', aL: [0, 3 + t, 'f'], aR: [0, 4 - t, 'f'], hy: i === 6 ? 1 : 0, pr, ex: i === 7 ? [[16, 5, 'spark']] : i % 3 === 0 ? [[3, 3 + (i >> 1), 'dot']] : [] })
    }) },
    // Sipping coffee with both hands.
    sip: { fps: 6, poses: F(8, i => {
      const up = [0, 1, 2, 3, 3, 2, 1, 0][i]!
      const my = 12 - up * 2
      return P({ aL: [1, 4 - up * 2, 'f'], aR: [-1, 4 - up * 2, 'f'], eyes: up >= 3 ? 'c' : 'o', mouth: up >= 3 ? 'n' : 's', pr: [[8, my, 'mug']], ex: [[9 + (i % 2), my - 1, 'puff'], [11, my - 3 + (i % 3 === 0 ? 1 : 0), 'puff'], ...(i === 4 ? [[15, 3, 'spark'] as Ex] : [])] })
    }) },
    // Fishing: cast, wait, a bite, reel in a fish.
    fishing: { fps: 6, poses: ([[12, 2], [17, 4], [18, 8], [18, 9], [18, 11], [18, 13], [18, 6], [17, 3]] as [number, number][]).map(([fx, fy], i) => {
      const o: Pose = { ...SIDE, aL: [2, 0, 'f'], aR: [3, i >= 5 ? -1 : 0, 'f'], mouth: i >= 4 ? 'o' : 'n' }
      const [hx, hy] = hand(o, 'R'), tipY = i === 1 || i === 2 ? 0 : 1
      return P({ ...o, ln: [[hx, hy, 18, tipY, 'p'], [18, tipY, fx, fy, 'c']], ex: [[fx - 1, fy, i >= 6 ? 'fish' : 'dr']] })
    }) },
    // Juggling three balls.
    juggle: { fps: 8, poses: F(8, i => {
      const path: [number, number][] = [[3, 9], [2, 5], [4, 2], [8, 0], [12, 0], [15, 2], [17, 5], [16, 9]]
      const t = i % 2, at = (k: number): [number, number] => path[(i + k) % 8]!
      return P({ mouth: 's', aL: [-3, t ? 0 : 1, 'f'], aR: [3, t ? 1 : 0, 'f'], pr: [[...at(0), 'b2r'], [...at(3), 'b2y'], [...at(5), 'b2u']] })
    }) },
  },
  done: {
    // Raising a trophy.
    trophy: { fps: 8, poses: F(8, i => {
      const lift = [0, 1, 2, 3, 3, 3, 2, 3][i]!
      const o: Pose = { by: lift >= 3 ? -1 : 0, mouth: 's', aR: [3, 1 - lift * 2, 'f'], aL: [-1, 4], fL: [8, 17], fR: [11, lift >= 3 ? 16 : 17] }
      const [hx, hy] = hand(o, 'R')
      return P({ ...o, pr: [[hx - 2, hy - 6, 'tro']], ex: [[hx - 4 + (i % 3) * 2, hy - 7, i % 2 ? 'dw' : 'dot'], [hx + 3, hy - 4 - (i % 2), 'dot'], [1 + ((i * 5) % 17), 1 + ((i * 3) % 7), 'dw']] })
    }) },
    // A confetti popper.
    popper: { fps: 8, poses: F(8, i => {
      const o: Pose = { mouth: i >= 2 ? 'o' : 's', aR: [3, i === 0 ? 0 : i === 1 ? -2 : -3, 'f'], aL: [-1, 3], by: i === 2 ? -1 : 0 }
      const [hx, hy] = hand(o, 'R')
      const bur: Ex[][] = [[], [], [[hx, hy - 6, 'dr'], [hx + 2, hy - 7, 'dot']], [[hx - 3, hy - 8, 'dg'], [hx + 1, hy - 9, 'dr'], [hx + 3, hy - 7, 'du'], [hx - 1, hy - 6, 'dn'], [hx + 4, hy - 9, 'dot']], [[hx - 5, hy - 7, 'du'], [hx - 2, hy - 10, 'dot'], [hx + 3, hy - 11, 'dn'], [hx + 5, hy - 8, 'dg'], [hx - 4, hy - 4, 'dr'], [hx + 1, hy - 8, 'dn']], [[hx - 5, hy - 4, 'dn'], [hx - 3, hy - 7, 'dg'], [hx + 4, hy - 5, 'dr'], [hx + 1, hy - 3, 'du'], [hx + 6, hy - 7, 'dot'], [hx - 1, hy - 9, 'dr']], [[hx - 6, hy - 2, 'dg'], [hx - 3, hy - 4, 'dot'], [hx + 5, hy - 2, 'dn'], [hx + 2, hy - 1, 'dr'], [hx + 6, hy - 5, 'du']], [[hx - 6, hy + 1, 'dr'], [hx + 6, hy, 'dg'], [hx - 2, hy - 1, 'dn'], [hx + 3, hy + 1, 'du']]]
      return P({ ...o, pr: [[hx - 1, hy - 3, 'cone']], ex: bur[i]! })
    }) },
    // A star above the head.
    star: { fps: 8, poses: F(8, i => {
      const sy = [0, 1, 1, 0, 0, 1, 1, 0][i]!
      const sp: [number, number][] = [[3, 2], [14, 1], [4, 6], [15, 5], [2, 4], [16, 3], [5, 1], [13, 4]]
      return P({ by: 3, hy: i % 2 ? 1 : 0, mouth: 's', aL: [-1, -2, 'o'], aR: [1, -2, 'o'], fL: [8, 17], fR: [11, 17], pr: [[7 + (i >= 5 ? 1 : 0), sy, 'star5']], ex: [[sp[i]![0], sp[i]![1], i % 2 ? 'dw' : 'dot']] })
    }) },
    // Fireworks going off behind.
    fireworks: { fps: 8, poses: F(8, i => {
      const ex: Ex[] = []
      const burst = (cx: number, cy: number, r: number, ch: string): void => { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) ex.push([cx + dx * r, cy + dy * r, ch]) }
      if (i === 0) ex.push([3, 8, 'dot'])
      if (i === 1) ex.push([3, 5, 'dot'], [16, 9, 'dot'])
      if (i >= 2) burst(3, 4, Math.min(3, i - 1), i >= 5 ? 'dn' : 'dr')
      if (i >= 3) burst(16, 5, Math.min(3, i - 2), i >= 6 ? 'du' : 'dg')
      if (i === 7) ex.push([10, 0, 'dot'])
      return P({ mouth: 's', aL: [-2, -3 + (i % 2), 'f'], aR: [2, -3 + ((i + 1) % 2), 'f'], by: i % 2 ? -1 : 0, ex })
    }) },
    // Showing off a medal.
    medal: { fps: 6, poses: F(8, i => {
      const by = i === 6 ? -1 : 0, gl: [number, number][] = [[10, 10], [9, 11], [10, 12], [9, 9], [11, 11], [10, 9], [9, 12], [8, 10]]
      return P({ mouth: 's', by, hy: i === 3 || i === 4 ? 1 : 0, aR: [-1, 1, 'f'], aL: i >= 5 ? [-1, -4, 'f'] : [-1, 4], pr: [[8, 8 + by, 'medal']], ex: [[gl[i]![0], gl[i]![1], 'dw'], ...(i === 6 ? [[16, 2, 'spark'] as Ex] : [])] })
    }) },
    // Holding three balloons that sway.
    balloons: { fps: 6, poses: F(8, i => {
      const s = wave(i, 8), o: Pose = { mouth: 's', aR: [3, 0, 'f'], aL: [-1, 4], by: i % 4 === 2 ? -1 : 0 }
      const [hx, hy] = hand(o, 'R')
      const bs: Ex[] = [[hx - 4 + s, hy - 9 + (i % 3 === 0 ? 1 : 0), 'balR'], [hx - 1 + s, hy - 9 + (i % 2), 'balU'], [hx + 1 + s, hy - 7, 'balN']]
      return P({ ...o, pr: bs, ln: bs.map(([x, y]) => [x + 1, y + 4, hx, hy, 'c'] as [number, number, number, number, string]) })
    }) },
  },
  dance: {
    // Strumming a guitar.
    guitar: { fps: 8, poses: F(8, i => {
      const bx = [0, 0, -1, -1, 0, 0, 1, 1][i]!
      return P({ bx, mouth: 's', hy: i % 4 === 2 ? 1 : 0, aL: [6, -2, 'f'], aR: [-3, 2 + (i % 2), 'f'], fL: [8 + bx, 17], fR: [11 + bx, 17], pr: [[6 + bx, 11, 'guitar']], ln: [[10 + bx, 11, 17 + bx, 6, 'p']], ex: i === 3 || i === 7 ? [[15, 2, 'note']] : i === 5 ? [[1, 4, 'dot']] : [] })
    }) },
    // A disco ball swinging overhead.
    discoball: { fps: 8, poses: F(8, i => {
      const sw = [0, 1, 1, 0, 0, -1, -1, 0][i]!
      const gl: [number, number][] = [[13, 0], [18, 0], [12, 3], [19, 3], [14, 5], [17, 5], [13, 6], [18, 6]]
      const gl2: [number, number][] = [[12, 8], [19, 8], [17, 9], [13, 4], [15, 7], [18, 4], [12, 6], [16, 8]]
      return P({ bx: -2, mouth: 's', by: i % 2 ? 1 : 0, aR: [i % 3 === 0 ? 3 : 2, i % 2 ? -5 : -6, 'p'], aL: [-2, 2, 'f'], fL: [6, 17], fR: [i % 2 ? 11 : 10, 17], pr: [[14 + sw, 1, 'ballD']], ln: [[16 + sw, 0, 16 + sw, 1, 'c']], ex: [[gl[i]![0], gl[i]![1], 'dw'], [gl2[i]![0], gl2[i]![1], 'dot']] })
    }) },
    // Cheering with pom-poms.
    pompoms: { fps: 8, poses: F(8, i => {
      const A: [Pose['aL'], Pose['aR']][] = [[[-2, -5], [2, -5]], [[-3, -2], [3, -2]], [[-3, -5], [3, 0]], [[-1, -6], [1, -6]], [[3, -2, 'f'], [-3, -2, 'f']], [[-3, 0], [3, -5]], [[-2, -6], [2, -3]], [[-3, -3], [3, -3]]]
      const [l, r] = A[i]!, o: Pose = { aL: l, aR: r, mouth: 's', by: i % 2 ? -1 : 0, fL: [i % 4 < 2 ? 7 : 8, 17], fR: [i % 4 < 2 ? 11 : 12, 17] }
      const [lx, ly] = hand(o, 'L'), [rx, ry] = hand(o, 'R')
      return P({ ...o, pr: [[lx - 1, ly - 2, 'pom'], [rx - 1, ry - 2, 'pomN']] })
    }) },
    // Dancing next to a boombox.
    boombox: { fps: 8, poses: F(8, i => {
      const o: Pose = { bx: -3, mouth: 's', by: i % 2 ? -1 : 0, aL: [-1, i % 4 < 2 ? -4 : 3, 'f'], aR: [i % 4 < 2 ? 3 : 2, i % 2 ? -4 : -1, 'f'], hy: i % 4 === 3 ? 1 : 0, fL: [i % 2 ? 6 : 5, 17], fR: [i % 2 ? 9 : 8, 17] }
      const nt: [number, number][] = [[11, 9], [12, 7], [13, 5], [14, 3], [15, 2], [11, 8], [13, 6], [14, 4]]
      return P({ ...o, pr: [[12, 15, i % 2 ? 'boxB' : 'boxA']], ex: [[nt[i]![0], nt[i]![1], 'note']] })
    }) },
    // Waving glow sticks.
    glow: { fps: 8, poses: F(8, i => {
      const A: [number, number][][] = [[[-3, -4], [3, -4]], [[-4, -2], [4, -2]], [[-3, 0], [3, 0]], [[-2, -5], [2, 1]], [[-3, -5], [3, -5]], [[-4, 0], [4, -4]], [[-2, 1], [2, -5]], [[-4, -3], [4, -1]]]
      const [l, r] = A[i]!, o: Pose = { aL: [l![0], l![1], 'f'], aR: [r![0], r![1], 'f'], mouth: 's', by: i % 2 ? -1 : 0 }
      const [lx, ly] = hand(o, 'L'), [rx, ry] = hand(o, 'R'), a = i % 2
      return P({ ...o, ln: [[lx, ly, lx - 2 - a, ly - 3, 'u'], [rx, ry, rx + 2 + a, ry - 3, 'n']], ex: [[lx - 2 - a, ly - 3, 'dw'], [rx + 2 + a, ry - 3, 'dw']] })
    }) },
    // Tipping a top hat with a bow.
    hattip: { fps: 6, poses: F(8, i => {
      const lift = [0, 0, 1, 3, 3, 1, 0, 0][i]!, bow = [0, 0, 0, 0, 1, 1, 0, 0][i]!
      const o: Pose = { by: bow, hy: bow, mouth: 's', eyes: i === 1 ? 'c' : 'o', aR: [1 + (lift > 0 ? 2 : 0), lift > 0 ? -5 - (lift > 2 ? 2 : 0) + bow : 3, 'f'], aL: [-1, 3], fL: [8, 17], fR: [11, 17] }
      const [x0, y0] = head(o)
      return P({ ...o, pr: [[x0, y0 - 3 - lift, 'hat']], ex: i === 3 ? [[16, 2, 'spark']] : i === 6 ? [[15, 4, 'note']] : i === 7 ? [[16, 6, 'dot']] : [] })
    }) },
  },
}
