// The pane's characters (0.26.70): the same drawn frames, picker and trip rules as the plan page, reused from assets/characters.js (one definition).
// The pane draws each card as a still svg and redraws it every 1 to 5 s, so a character here is a CSS-animated strip: the frames of the current animation sit side by side,
// a steps() animation slides the strip, and the picker's choice at the time of the redraw (scheduleAt, a pure function of the clock) says which animation that is.
// Reduced motion is a media query inside the svg: the strip stops on its first frame and the trip is skipped (the characters just sit where the trip ends).
// The shared script is compiled into hooks/charsdata.ts (bun tools/charmod.ts) and called in startUp, inside a try.

import { getTheme } from './tokens.ts'
import { buildChars } from './charsdata.ts'

type Frames = { fps: number; frames: string[][] }
type Phase = 'home' | 'out' | 'away' | 'back'
export type Trip = { phase: Phase; t0: number }
type Shared = {
  CHAR_FR: Record<string, Record<string, Frames>>
  poseFor(key: string, count: number): string
  scheduleAt(group: string, seed: number, now: number): { anim: string; start: number }
  travelNext(st: Trip, complete: boolean, now: number, reduced: boolean): Trip
  TRAVEL_MS: number
  DIM_O: number
  CHAR_COLORS: Record<string, string>
  CHAR_OUTLINE: { light: string; dark: string }
}
let C: Shared | null = null

/** Builds the shared characters (hooks/charsdata.ts, generated from assets/characters.js). Returns whether the pane can draw characters. */
export async function loadChars(): Promise<boolean> {
  try {
    C = buildChars() as Shared
  } catch {
    C = null
  }
  return C !== null
}
export const setCharsForTest = (c: unknown): void => { C = c as Shared | null }
export const charsReady = (): boolean => C !== null
export const dimOpacity = (): number => C?.DIM_O ?? 0.5

let seed = Math.floor(Math.random() * 1e9)
export const setSeedForTest = (s: number): void => { seed = s }

/** Tile key -> the colour class its character wears (b and d letters). A todo tile is the muted grey. */
const bodyClass = (cls: string): string => (cls === 't' ? 's' : cls)

let tripSt: Trip = { phase: 'home', t0: 0 }
export const resetTripForTest = (): void => { tripSt = { phase: 'home', t0: 0 } }
export type TripView = { phase: Phase; elapsed: number; now: number }
/** Moves the goal-area trip along (the same state machine as the page) and says where it is. */
export function tripNow(complete: boolean, now: number): TripView | null {
  if (C === null) return null
  tripSt = C.travelNext(tripSt, complete, now, false)
  return { phase: tripSt.phase, elapsed: Math.max(0, now - tripSt.t0), now }
}
export const TRAVEL = (): number => C?.TRAVEL_MS ?? 1200

/** The dancers' slots in the goal card: right-aligned, four in a row. x of each, size and gap. */
export const GOAL_SIZE = 34
export const GOAL_GAP = 2
export const goalWidth = (n = 4): number => n * GOAL_SIZE + (n - 1) * GOAL_GAP
export const goalX = (W: number, gutter: number, i: number, n = 4): number => W - gutter - goalWidth(n) + i * (GOAL_SIZE + GOAL_GAP)

const frameCounts = (): number[] => {
  const s = new Set<number>()
  if (C !== null) for (const g of Object.values(C.CHAR_FR)) for (const a of Object.values(g)) s.add(a.frames.length)
  return [...s].sort((a, b) => a - b)
}

/** The class rules for a character, once per svg that has one. Letters are ch-<letter>; the body takes the tile's colour class. */
export function charBase(): string {
  if (C === null) return ''
  const mode = getTheme()
  const o = (c: string): string => `.ch-o{fill:${c}}`
  const outline = mode === 'dark' ? o(C.CHAR_OUTLINE.dark) : mode === 'light' ? o(C.CHAR_OUTLINE.light) : o(C.CHAR_OUTLINE.light) + `@media (prefers-color-scheme: dark){${o(C.CHAR_OUTLINE.dark)}}`
  const fills = Object.entries(C.CHAR_COLORS).map(([k, v]) => `.ch-${k}{fill:${v}}`).join('')
  const kf = frameCounts().map(n => `@keyframes chs${n}{to{transform:translateX(-${20 * n}px)}}`).join('')
  return `<style>${outline}${fills}.ch-dk{fill:#000;fill-opacity:.38}.ch-x{opacity:.6}${kf}@media (prefers-reduced-motion: reduce){.chp,.cht{animation:none!important}.chx{display:none}}</style>`
}

/** The frames of one animation as one strip: a path per letter, frame i drawn 20 units right of frame i-1. */
function strip(group: string, anim: string, bodyCls: string): { paths: string; n: number; fps: number } {
  const a = C!.CHAR_FR[group][anim]
  const by: Record<string, string> = {}
  a.frames.forEach((rows, fi) => {
    rows.forEach((row, y) => {
      let x = 0
      while (x < row.length) {
        const c = row[x]
        if (c === '.') { x++; continue }
        let e = x
        while (e + 1 < row.length && row[e + 1] === c) e++
        by[c] = (by[c] ?? '') + `M${fi * 20 + x} ${y}h${e - x + 1}v1h-${e - x + 1}z`
        x = e + 1
      }
    })
  })
  return { paths: byPaths(by, bodyCls), n: a.frames.length, fps: a.fps }
}
function byPaths(by: Record<string, string>, bodyCls: string): string {
  const out: string[] = []
  for (const [c, d] of Object.entries(by)) {
    if (c === 'b') out.push(`<path class="${bodyCls}" d="${d}"/>`)
    else if (c === 'd') out.push(`<path class="${bodyCls}" d="${d}"/><path class="ch-dk" d="${d}"/>`)
    else if (c === 'z') out.push(`<path class="m" d="${d}"/>`)
    else if (c === 'x') out.push(`<path class="m ch-x" d="${d}"/>`)
    else out.push(`<path class="ch-${c}" d="${d}"/>`)
  }
  return out.join('')
}

/** One character at (x,y), size px square, playing `anim` of `group` as it would be at `now` had it started at `startMs`. */
function charAt(group: string, anim: string, cls: string, x: number, y: number, size: number, startMs: number, now: number): string {
  const s = strip(group, anim, bodyClass(cls))
  const dur = s.n / s.fps
  const delay = (((now - startMs) / 1000) % dur).toFixed(2)
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 20 20" shape-rendering="crispEdges"><g class="chp" style="animation:chs${s.n} ${dur.toFixed(3)}s steps(${s.n}) infinite -${delay}s">${s.paths}</g></svg>`
}

/** A character playing whatever the picker has for it at `now`. */
export function chAnim(group: string, cls: string, i: number, x: number, y: number, size: number, now: number): string {
  const sc = C!.scheduleAt(group, seed + i * 7919 + group.length, now)
  return charAt(group, sc.anim, cls, x, y, size, sc.start, now)
}
/** A character running (the trip's pose). */
const chRun = (cls: string, x: number, y: number, size: number, startMs: number, now: number): string => charAt('running', 'running-cycle', cls, x, y, size, startMs, now)

const move = (name: string, ax: number, ay: number, bx: number, by2: number): string => `<style>@keyframes ${name}{from{transform:translate(${ax}px,${ay}px)}to{transform:translate(${bx}px,${by2}px)}}</style>`
/** Wraps a character in the trip movement: it moves `from` to `to` in half the trip, starting `startAfterMs` into it; `elapsed` is how far the trip already is. */
function travel(name: string, inner: string, from: [number, number], to: [number, number], startAfterMs: number, elapsed: number, leave: boolean): string {
  const half = TRAVEL() / 2
  const delay = ((startAfterMs - elapsed) / 1000).toFixed(3)
  return move(name, from[0], from[1], to[0], to[1]) + `<g class="cht${leave ? ' chx' : ''}" style="animation:${name} ${(half / 1000).toFixed(3)}s ease-in-out ${delay}s both">${inner}</g>`
}

export type TileIn = { key: string; cls: string; count: number }
/** A tile's character in the count tiles at (x,y): in its tile, running out of it, or running back in, by the trip. '' when the character is away. */
export function tileChar(i: number, t: TileIn, x: number, y: number, size: number, gx: number, trip: TripView): string {
  if (C === null) return ''
  const dx = gx - x
  const up = -(y + size + 2)
  if (trip.phase === 'home') return chAnim(C.poseFor(t.key, t.count), t.cls, i, x, y, size, trip.now)
  if (trip.phase === 'away') return ''
  const run = chRun(t.cls, x, y, size, trip.now - trip.elapsed, trip.now)
  if (trip.phase === 'out') return travel('tout' + i, run, [0, 0], [dx, up], 0, trip.elapsed, true)
  return travel('tin' + i, run, [dx, up], [0, 0], TRAVEL() / 2, trip.elapsed, false)
}

/** The four dancers in the goal card, right-aligned with their top at `y`: arriving from the tiles below, dancing, or leaving back down. '' when they are home. */
export function goalChars(W: number, gutter: number, y: number, H: number, tiles: readonly TileIn[], trip: TripView): string {
  if (C === null || trip.phase === 'home') return ''
  const below = H - y + 2
  return tiles.map((t, i) => {
    const x = goalX(W, gutter, i, tiles.length)
    if (trip.phase === 'away') return chAnim('dance', t.cls, 50 + i, x, y, GOAL_SIZE, trip.now)
    const run = chRun(t.cls, x, y, GOAL_SIZE, trip.now - trip.elapsed, trip.now)
    if (trip.phase === 'out') return travel('gin' + i, run, [0, below], [0, 0], TRAVEL() / 2, trip.elapsed, false)
    return travel('gout' + i, run, [0, 0], [0, below], 0, trip.elapsed, true)
  }).join('')
}
