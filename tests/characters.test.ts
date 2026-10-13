// The plan page characters: the count-to-pose mapping and the animation picker (assets/characters.js, shared with the page).
import { createRequire } from 'node:module'
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const C = createRequire(import.meta.url)('../assets/characters.js')

test('a tile with count 0 is asleep, above 0 is its own active group', () => {
  for (const k of ['running', 'you', 'todo', 'done']) {
    expect(C.poseFor(k, 0)).toBe('asleep')
    expect(C.poseFor(k, 1)).toBe(k)
    expect(C.poseFor(k, 12)).toBe(k)
  }
})

test('the dancer shows only when there are steps and every one is done', () => {
  expect(C.danceOn({ n: 4, done: 4 })).toBe(true)
  expect(C.danceOn({ n: 4, done: 3 })).toBe(false)
  expect(C.danceOn({ n: 0, done: 0 })).toBe(false)
  expect(C.danceOn({ n: 5, done: 4, running: 1 })).toBe(false)
})

test('every state has enough distinct animations', () => {
  const A = C.CHAR_ANIMS
  expect(A.asleep.length).toBeGreaterThanOrEqual(2)
  for (const k of ['running', 'you', 'todo', 'done']) expect(A[k].length).toBeGreaterThanOrEqual(3)
  expect(A.dance.length).toBeGreaterThanOrEqual(5)
  const names = Object.values(A).flat() as string[]
  expect(new Set(names).size).toBe(names.length)
})

test('the picker never repeats an animation twice in a row and covers the whole group', () => {
  for (const g of Object.keys(C.CHAR_ANIMS)) {
    const p = C.makePicker(g, 42)
    const seen = new Set<string>()
    let prev = ''
    for (let i = 0; i < 300; i++) {
      const a = p.next()
      expect(a).not.toBe(prev)
      expect(C.CHAR_ANIMS[g]).toContain(a)
      seen.add(a)
      prev = a
    }
    expect(seen.size).toBe(C.CHAR_ANIMS[g].length)
  }
})

test('the same seed gives the same sequence and holds; another seed differs', () => {
  const run = (seed: number) => { const p = C.makePicker('dance', seed); return Array.from({ length: 20 }, () => [p.next(), p.holdMs()]) }
  expect(run(7)).toEqual(run(7))
  expect(run(7)).not.toEqual(run(8))
})

test('holds last 2.5 to 6 seconds', () => {
  const p = C.makePicker('running', 3)
  for (let i = 0; i < 200; i++) { const h = p.holdMs(); expect(h).toBeGreaterThanOrEqual(2500); expect(h).toBeLessThanOrEqual(6000) }
})

test('the built page carries the characters, the sticky goal card and reduced-motion handling', () => {
  const tpl = readFileSync(new URL('../assets/plan-page.tpl.html', import.meta.url), 'utf8')
  expect(tpl).toContain('__CHARACTERS__')
  expect(tpl).toContain('.head{position:sticky;top:0')
  expect(tpl).toContain('prefers-reduced-motion:reduce')
  expect(readFileSync(new URL('../assets/characters-page.js', import.meta.url), 'utf8')).toContain('prefers-reduced-motion:reduce')
})

const FR = C.CHAR_FR
const all = Object.entries(FR).flatMap(([g, m]: any) => Object.entries(m).map(([n, a]: any) => [g, n, a] as const))

test('every state has its animations with 2+ frames and the same 20x20 size', () => {
  expect(Object.keys(FR).sort()).toEqual(['asleep', 'dance', 'done', 'running', 'todo', 'you'])
  for (const [g, n, a] of all) {
    expect(a.frames.length, n).toBeGreaterThanOrEqual(2)
    expect(a.fps, n).toBeGreaterThanOrEqual(6)
    expect(a.fps, n).toBeLessThanOrEqual(10)
    for (const f of a.frames) { expect(f.length, n).toBe(20); for (const r of f) expect(r.length, n).toBe(20) }
    if (g === 'dance') expect(a.frames.length, n).toBeGreaterThanOrEqual(6)
  }
})

test('no frame equals the one before it, wrap included', () => {
  for (const [, n, a] of all) a.frames.forEach((f: string[], i: number) => {
    const prev = a.frames[(i + a.frames.length - 1) % a.frames.length]
    expect(f.join('/') === prev.join('/'), `${n} frame ${i}`).toBe(false)
  })
})

test('the frame player advances frames with a fake clock and wraps', () => {
  const a = FR.running['running-cycle']
  const step = 1000 / a.fps
  const seq = [0, 1, 2, 3, 4, 5].map(i => C.frameIndex('running', 'running-cycle', 1000, 1000 + i * step + 1))
  expect(seq).toEqual([0, 1, 2, 3, 0, 1].map(i => i % a.frames.length))
  expect(C.frameIndex('running', 'running-cycle', 1000, 0)).toBe(0)
})

test('an actor steps through frames and switches animation after its hold', () => {
  const act = C.makeActor('done', 5, 0)
  const first = act.tick(0).anim
  const idxs = new Set<number>()
  for (let t = 0; t < 2400; t += 50) { const r = act.tick(t); if (r.anim === first) idxs.add(r.idx) }
  expect(idxs.size).toBeGreaterThan(1)
  let changed = false
  for (let t = 2400; t < 20000; t += 100) if (act.tick(t).anim !== first) { changed = true; break }
  expect(changed).toBe(true)
})

test('frameRects makes crisp rects from letters and the reduced-motion still is a real frame', () => {
  expect(C.frameRects(['..bb', 'o...'])).toBe('<rect class="b" x="2" y="0" width="2" height="1"/><rect class="o" x="0" y="1" width="1" height="1"/>')
  expect(C.stillFrame('todo')).toHaveLength(20)
})
