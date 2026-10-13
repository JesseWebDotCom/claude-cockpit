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
  expect(A.dance.length).toBeGreaterThanOrEqual(4)
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
