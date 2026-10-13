// Idle animations for the plan page character: what a tile character does between its main animations, so it is never a still image.
// Four per state, six frames each, named <group>-idle-<name>. Merged into the animation set by tools/charart.ts.
import type { Anim, Pose } from './charart.ts'

type Ex = [number, number, string]
const F = (n: number, fn: (i: number) => Pose): Pose[] => Array.from({ length: n }, (_, i) => fn(i))
const A = (poses: Pose[], fps = 5): Anim => ({ fps, poses })
const ZZ: Ex[] = [[14, 5, 'zs'], [14, 4, 'zs'], [15, 2, 'zs'], [15, 1, 'z'], [16, 0, 'z'], [15, 0, 'zs']]
const SL: Pose = { by: 2, eyes: 'c', aL: [1, 4], aR: [-1, 4], fL: [7, 17], fR: [12, 17] }

export const IDLE_ANIMS: Record<string, Record<string, Anim>> = {
  asleep: {
    // Slow breathing: the body rises and falls, a z drifts up.
    'idle-breathe': A(F(6, i => ({ ...SL, by: [2, 2, 3, 3, 3, 2][i]!, hy: [0, 0, 0, 1, 1, 0][i]!, ex: [ZZ[i]!] })), 6),
    // Dreaming: a thought bubble grows with a spark in it, then fades.
    'idle-dream': A(F(6, i => {
      const ex: Ex[][] = [[[13, 6, 'sn1']], [[13, 5, 'sn2']], [[13, 2, 'sn3'], [14, 3, 'dot']], [[13, 0, 'sn4'], [15, 2, 'spark']], [[13, 0, 'sn4'], [16, 3, 'dot']], [[13, 4, 'sn2']]]
      return { ...SL, hy: i % 3 === 1 ? 1 : 0, ex: ex[i]! }
    }), 6),
    // A twitch: a foot and a hand jerk in the dream.
    'idle-twitch': A(F(6, i => ({ ...SL, aR: i === 2 || i === 4 ? [-1, 3] : [-1, 4], fR: i === 3 ? [12, 16] : [12, 17], by: i === 2 ? 1 : 2, ex: [ZZ[(i + 2) % 6]!] })), 6),
    // Rolling over: front, side, back, side, front.
    'idle-roll': A([
      { ...SL, ex: [ZZ[0]!] },
      { ...SL, turn: 1, by: 2, aL: [-1, 4], aR: [1, 4], fL: [9, 17], fR: [10, 17] },
      { ...SL, turn: 2, by: 2, ex: [ZZ[1]!] },
      { ...SL, turn: 1, face: -1, by: 2, aL: [-1, 4], aR: [1, 4], fL: [9, 17], fR: [10, 17] },
      { ...SL, hy: 1, ex: [ZZ[3]!] },
      { ...SL, by: 3, ex: [ZZ[4]!] },
    ], 6),
  },
  running: {
    // Catching breath, hands on knees, sweat drops.
    'idle-pant': A(F(6, i => ({ by: 1 + (i % 2), hy: 1, mouth: 'o', aL: [-2, 3 + (i % 2), 'f', -3, 2], aR: [2, 3 + (i % 2), 'f', 3, 2], ex: [[3 + (i % 3), 4 + (i >> 1), 'du'], [16 - (i % 2), 6, i >= 3 ? 'du' : 'dot']] })), 6),
    // Tying a shoe.
    'idle-shoe': A(F(6, i => ({ by: 3, hy: 1, mouth: 'n', eyes: i % 3 === 2 ? 'l' : 'o', aL: [-2, 4 + (i % 2), 'f'], aR: [-1, 4, 'f'], fL: [7, 17], fR: [12, 17], ex: i === 5 ? [[15, 6, 'spark']] : [] })), 6),
    // Stretching: one arm across, then overhead.
    'idle-stretch': A(F(6, i => {
      const a: [Pose['aL'], Pose['aR']][] = [[[-1, 4], [1, 4]], [[-1, 4], [-2, 0, 'f', 2, 1]], [[-1, 4], [-3, -1, 'f', 2, 1]], [[-2, -5, 'o'], [2, -5, 'o']], [[-2, -6, 'o'], [2, -6, 'o']], [[-1, 2], [1, 2]]]
      return { aL: a[i]![0], aR: a[i]![1], mouth: i === 4 ? 'o' : 'n', by: i === 4 ? -1 : 0, fL: [8, 17], fR: [11, 17] }
    }), 6),
    // Bouncing on the spot, ready to go.
    'idle-bounce': A(F(6, i => ({ turn: 1, mouth: 's', by: [0, -1, -1, 0, 0, 0][i]!, aL: [-1, 3 + (i % 2), 'f', -2, 2], aR: [1, 3 + (i % 2), 'f', 2, 2], fL: [9, i === 1 || i === 2 ? 16 : 17], fR: [10, i === 2 || i === 3 ? 16 : 17] })), 6),
  },
  you: {
    // Looking left and right for somebody.
    'idle-lookaround': A(F(6, i => ({ mouth: 'o', eyes: (['l', 'l', 'o', 'r', 'r', 'o'] as const)[i], hx: [0, -1, 0, 0, 1, 0][i]!, aR: i === 3 ? [3, 0, 'f'] : [0, 4], ex: i === 1 ? [[16, 2, 'bang']] : i === 4 ? [[2, 2, 'bang']] : [] })), 6),
    // Tapping a foot, impatient.
    'idle-tap': A(F(6, i => ({ mouth: i % 2 ? 'o' : 'n', aL: [-1, 3, 'f', -3, 2], aR: [1, 3, 'f', 3, 2], fL: [8, 17], fR: [11, i % 2 ? 16 : 17], hy: i % 4 === 3 ? 1 : 0, ex: i % 2 ? [[15, 17, 'dot']] : [] })), 6),
    // Wringing hands, fidgeting.
    'idle-fidget': A(F(6, i => ({ mouth: i % 3 === 0 ? 's' : 'o', hy: i % 2, aL: [2 - (i % 2), 3, 'f'], aR: [-2 + (i % 2), 3, 'f'], by: i === 3 ? 1 : 0, ex: i === 4 ? [[15, 3, 'du']] : [] })), 6),
    // A shrug.
    'idle-shrug': A(F(6, i => {
      const up = [0, 1, 2, 2, 1, 0][i]!
      return { mouth: up === 2 ? 'o' : 'n', eyes: up === 2 ? 'c' : 'o', by: up === 2 ? 1 : 0, aL: [-2, 3 - up * 2, 'f', -3, 3 - up], aR: [2, 3 - up * 2, 'f', 3, 3 - up], ex: i === 2 ? [[8, 0, 'dot']] : i === 3 ? [[11, 0, 'dot']] : [], ...(i === 5 ? { mouth: 's' } : {}) }
    }), 6),
  },
  todo: {
    // Standing and blinking, breathing.
    'idle-blink': A(F(6, i => ({ eyes: i === 3 ? 'c' : 'o', hy: i === 4 ? 1 : 0, mouth: i === 5 ? 's' : 'n', aR: ([[0, 4], [0, 3], [1, 3], [1, 4], [0, 4], [0, 4]] as [number, number][])[i]! })), 6),
    // Scratching the head.
    'idle-scratch': A(F(6, i => ({ eyes: i % 2 ? 'l' : 'o', mouth: 'n', hy: i % 2, aR: [i % 2 ? 1 : 0, -4, 'f'], ex: i === 3 ? [[16, 2, 'dot']] : [] })), 6),
    // A yawn, hand to the mouth.
    'idle-yawn': A(F(6, i => {
      const w = [0, 1, 2, 2, 1, 0][i]!
      return { eyes: w >= 2 || i === 5 ? 'c' : 'o', mouth: w >= 1 ? 'o' : 'n', by: w >= 2 ? -1 : 0, aR: w >= 1 ? [-2 + (w - 1), -2, 'o'] : [0, 4], aL: [-1, 4], ex: i === 2 ? [[15, 3, 'dot']] : i === 3 ? [[16, 4, 'dot']] : [] }
    }), 6),
    // Tapping a foot and humming.
    'idle-hum': A(F(6, i => ({ mouth: i % 2 ? 'o' : 's', bx: i % 3 === 2 ? 1 : 0, fR: [11 + (i % 3 === 2 ? 1 : 0), i % 2 ? 16 : 17], fL: [8 + (i % 3 === 2 ? 1 : 0), 17], ex: i >= 1 && i <= 4 ? [[14 + (i % 2), 4 - i, 'note']] : [] })), 6),
  },
  done: {
    // Proud, hands on hips, a glint on the chest.
    'idle-proud': A(F(6, i => {
      const g: [number, number][] = [[9, 10], [11, 11], [10, 12], [12, 10], [8, 11], [10, 9]]
      return { mouth: 's', by: i === 2 || i === 3 ? 1 : 0, hy: i === 3 ? 1 : 0, aL: [-3, 1, 'f', -3, 3], aR: [3, 1, 'f', 3, 3], ex: [[g[i]![0], g[i]![1], 'dw']] }
    }), 6),
    // Whistling a tune.
    'idle-whistle': A(F(6, i => ({ mouth: i % 2 ? 'o' : 's', eyes: i === 4 ? 'c' : 'o', hy: i % 3 === 1 ? 1 : 0, aL: [-1, 4], aR: [1, 4 - (i % 2)], ex: i >= 1 ? [[13 + (i % 3), 5 - i, 'note']] : [] })), 6),
    // A satisfied nod.
    'idle-nod': A(F(6, i => ({ mouth: i === 5 ? 'n' : 's', eyes: i === 2 ? 'c' : 'o', by: [0, 0, 1, 1, 0, 0][i]!, hy: [0, 1, 1, 1, 0, 0][i]!, aL: [-1, 4], aR: [1, 4], ex: i === 4 ? [[16, 2, 'dot']] : [] })), 6),
    // A happy sway from side to side.
    'idle-sway': A(F(6, i => {
      const bx = [0, 1, 1, 0, -1, -1][i]!
      return { mouth: 's', bx, hy: i % 3 === 0 ? 0 : 1, aL: [-2, 2, 'f'], aR: [2, 2, 'f'], fL: [8 + bx, 17], fR: [11 + bx, 17], ex: i === 2 ? [[2, 4, 'dot']] : i === 5 ? [[17, 5, 'dot']] : [] }
    }), 6),
  },
}
