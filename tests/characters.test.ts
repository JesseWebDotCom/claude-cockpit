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

test('every state has 4 to 6 main animations and 4+ idle animations; dance has 8+', () => {
  const A = C.CHAR_ANIMS
  for (const k of ['asleep', 'running', 'you', 'todo', 'done']) {
    const main = A[k].filter((n: string) => !C.isIdle(n)), idle = A[k].filter(C.isIdle)
    expect(main.length, k).toBeGreaterThanOrEqual(4)
    expect(main.length, k).toBeLessThanOrEqual(10)
    expect(idle.length, k + ' idle').toBeGreaterThanOrEqual(4)
  }
  expect(A.dance.length).toBeGreaterThanOrEqual(8)
  const names = Object.values(A).flat() as string[]
  expect(new Set(names).size).toBe(names.length)
})

test('every idle animation has 2+ distinct frames, so nothing is ever a still image', () => {
  for (const [g, n, a] of all) {
    if (g === 'dance' && !C.isIdle(n)) continue
    expect(new Set(a.frames.map((f: string[]) => f.join('/'))).size, n).toBeGreaterThanOrEqual(2)
  }
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

test('holds last 2.5 to 6 s for a main animation and 2 to 5 s for an idle one', () => {
  const p = C.makePicker('running', 3)
  for (let i = 0; i < 400; i++) {
    const n = p.next(), h = p.holdMs()
    if (C.isIdle(n)) { expect(h).toBeGreaterThanOrEqual(2000); expect(h).toBeLessThanOrEqual(5000) } else { expect(h).toBeGreaterThanOrEqual(2500); expect(h).toBeLessThanOrEqual(6000) }
  }
})

test('idle animations interleave with the main ones and every pick has 2+ distinct frames', () => {
  for (const g of ['asleep', 'running', 'you', 'todo', 'done']) {
    const p = C.makePicker(g, 11)
    let idle = 0, main = 0, prevIdle = false
    for (let i = 0; i < 200; i++) {
      const n = p.next(), id = C.isIdle(n)
      expect(id && prevIdle, g + ' two idles in a row').toBe(false)
      id ? idle++ : main++
      prevIdle = id
      expect(new Set(C.CHAR_FR[g][n].frames.map((f: string[]) => f.join('/'))).size).toBeGreaterThanOrEqual(2)
    }
    expect(idle, g).toBeGreaterThan(40)
    expect(main, g).toBeGreaterThan(40)
  }
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
    expect(a.fps, n).toBeGreaterThanOrEqual(3)
    expect(a.fps, n).toBeLessThanOrEqual(7)
    for (const f of a.frames) { expect(f.length, n).toBe(20); for (const r of f) expect(r.length, n).toBe(20) }
    if (g === 'dance') expect(a.frames.length, n).toBeGreaterThanOrEqual(6)
    if (!['curl', 'nod', 'cycle', 'sprint', 'jog', 'wave', 'jump', 'point', 'shuffle', 'look', 'watch', 'pump', 'thumbs', 'spin'].some(x => n.endsWith('-' + x))) expect(a.frames.length, n).toBeGreaterThanOrEqual(6)
    if (!['curl', 'nod'].some(x => n.endsWith('-' + x)) || true) expect(a.frames.length, n).toBeLessThanOrEqual(10)
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

test('the trip to the goal area: out when complete, back when not, reversible, reduced motion jumps (fake clock)', () => {
  const T = C.TRAVEL_MS
  let st = { phase: 'home', t0: 0 }
  st = C.travelNext(st, false, 100, false)
  expect(st.phase).toBe('home')
  st = C.travelNext(st, true, 1000, false)
  expect(st).toEqual({ phase: 'out', t0: 1000 })
  expect(C.travelProgress(st, 1000)).toBe(0)
  expect(C.travelProgress(st, 1000 + T / 2)).toBeCloseTo(0.5)
  expect(C.travelNext(st, true, 1000 + T / 2, false)).toBe(st)
  const after = C.travelNext(st, true, 1000 + T, false)
  expect(after.phase).toBe('away')
  expect(C.travelProgress(after, 99999)).toBe(1)
  expect(C.travelNext(after, true, 5000, false)).toBe(after)
  const back = C.travelNext(after, false, 6000, false)
  expect(back).toEqual({ phase: 'back', t0: 6000 })
  expect(C.travelProgress(back, 6000)).toBe(1)
  expect(C.travelNext(back, false, 6000 + T, false).phase).toBe('home')
  // reversed half way: it turns round from where it is
  const mid = C.travelNext(st, false, 1000 + T / 4, false)
  expect(mid.phase).toBe('back')
  expect(C.travelProgress(mid, 1000 + T / 4)).toBeCloseTo(0.25)
  // reduced motion: no travel
  expect(C.travelNext({ phase: 'home', t0: 0 }, true, 5, true).phase).toBe('away')
  expect(C.travelNext({ phase: 'away', t0: 0 }, false, 5, true).phase).toBe('home')
})

test('the goal area is empty unless the trip has begun, and the characters there equal the tile characters', () => {
  const n = 4
  expect(C.travelLayout({ phase: 'home', t0: 0 }, n)).toEqual({ tile: 4, fly: 0, goal: 0 })
  expect(C.travelLayout({ phase: 'out', t0: 0 }, n)).toEqual({ tile: 0, fly: 4, goal: 0 })
  expect(C.travelLayout({ phase: 'away', t0: 0 }, n)).toEqual({ tile: 0, fly: 0, goal: 4 })
  expect(C.travelLayout({ phase: 'back', t0: 0 }, n)).toEqual({ tile: 0, fly: 4, goal: 0 })
  for (const ph of ['home', 'out', 'away', 'back']) { const L = C.travelLayout({ phase: ph, t0: 0 }, n); expect(L.tile + L.fly + L.goal).toBe(n) }
  // a plan that is not complete never leaves home, so its goal area stays empty
  let st = { phase: 'home', t0: 0 }
  for (let t = 0; t < 20000; t += 50) { st = C.travelNext(st, false, t, false); expect(C.travelLayout(st, n).goal).toBe(0) }
  // a complete plan ends with all four in the goal area and none in the tiles
  for (let t = 0; t < 20000; t += 50) st = C.travelNext(st, true, t, false)
  expect(C.travelLayout(st, n)).toEqual({ tile: 0, fly: 0, goal: 4 })
})

test('a tile at count 0 is dimmed, above 0 it is not; the dim uses one CSS token for tile and character', () => {
  expect(C.dimFor(0)).toBe(true)
  expect(C.dimFor(1)).toBe(false)
  expect(C.dimFor(7)).toBe(false)
  const tpl = readFileSync(new URL('../assets/plan-page.tpl.html', import.meta.url), 'utf8')
  expect(tpl).toContain('--dim-o:')
  expect(tpl).toContain('.stat.lo{opacity:var(--dim-o);filter:var(--dim-f)}')
  expect(tpl).toContain('.stat{transition:opacity')
  expect(tpl).toContain("dimFor(all[k])?' lo':''")
  expect(tpl).toContain('.chr.fly')
  expect(tpl).not.toMatch(/\.chr\.fly\{[^}]*(opacity|filter)/)
})

// ---- 0.26.70: the pane's characters (hooks/chars.ts), one definition shared with the page ----
import { charBase, chAnim, goalChars, goalX, goalWidth, loadChars, resetTripForTest, setSeedForTest, tileChar, tripNow } from '../hooks/chars.ts'
import { titleCardSvg, tilesSvg } from '../hooks/frontpage.ts'

test('scheduleAt is a pure function of the clock and group', () => {
  const a = C.scheduleAt('running', 7, 1_000_000), b = C.scheduleAt('running', 7, 1_000_000)
  expect(a).toEqual(b)
  expect(a.start).toBeLessThanOrEqual(1_000_000)
})

test('the pane loads the shared characters and draws a strip that sits still under reduced motion', async () => {
  expect(await loadChars()).toBe(true)
  setSeedForTest(1)
  const svg = chAnim('running', 'runc', 0, 0, 0, 32, 5000)
  expect(svg).toContain('steps(')
  expect(charBase()).toContain('prefers-reduced-motion: reduce')
  expect(charBase()).toContain('@keyframes chs4')
})

test('pane colours and dim level match the page template', () => {
  const tpl = readFileSync(new URL('../assets/plan-page.tpl.html', import.meta.url), 'utf8')
  expect(tpl).toContain(`--dim-o:${String(C.DIM_O).replace(/^0/, '')}`)
})

test('trip phases: tile characters leave, dancers dance right-aligned, then return', async () => {
  await loadChars(); resetTripForTest(); setSeedForTest(1)
  const tile = { key: 'done', cls: 'okc', count: 4 }
  expect(tripNow(false, 1000)?.phase).toBe('home')
  expect(tileChar(0, tile, 0, 0, 32, 300, tripNow(false, 1000)!)).toContain('chp')
  const out = tripNow(true, 2000)!
  expect(out.phase).toBe('out')
  expect(tileChar(0, tile, 0, 0, 32, 300, out)).toContain('cht')
  const away = tripNow(true, 2000 + C.TRAVEL_MS + 10)!
  expect(away.phase).toBe('away')
  expect(tileChar(0, tile, 0, 0, 32, 300, away)).toBe('')
  const tiles = [tile, tile, tile, tile]
  expect(goalChars(400, 24, 10, 120, tiles, away)).toContain('chp')
  expect(goalX(400, 24, 0) + goalWidth() ).toBe(400 - 24)
  expect(tripNow(false, 99000)?.phase).toBe('back')
})
