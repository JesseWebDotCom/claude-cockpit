// COCKPIT-TREE-01: the tiny workers, round 2: real pixel-art people. Each job kind is one person from Kenney's Tiny Dungeon pack (CC0, see NOTICE) doing the job:
// research reads a book, docs types on a laptop, code hammers, test ticks a checklist, bench times with a stopwatch, review holds a magnifier, wait raises a hand,
// other stands and breathes. The frames are built by tools/buildsprites.ts into hooks/workersprites.ts (SVG rectangles on a 24 x 21 canvas, drawn crisp, never smoothed).
// A soft backing in the state colour (blue running, amber waiting, never red) keeps the outlined sprite readable on light and dark tiles.
// Animation is frame stepping in CSS (a stack of frames, each visible for its share of the loop); no timers. Every loop starts at the phase the wall clock says (one
// custom property, --wd, set per drawing), so a redraw never restarts it. With reduced motion, or motion off, nothing animates and frame 0 shows.

import { FONT, n, textWidth, xml } from './draw.ts'
import type { StepKind } from './plan.ts'
import { SPRITE_FRAMES, SPRITE_FRAME_MS, SPRITE_H, SPRITE_W } from './workersprites.ts'

/** Display scale of the worker under a step (a whole number, so the pixels stay square) and of the small marker on a collapsed card. */
export const WORKER_SCALE = 1
export const MARKER_SCALE = 1
export const WORKER_PX = SPRITE_H * WORKER_SCALE
export const WORKER_W = SPRITE_W * WORKER_SCALE
const GAP = 8
const CAP = 11

export type WorkerTone = 'run' | 'warn'

/** The loop period every worker animation divides evenly, so one phase offset fits them all (frame length times 2, 3 or 4 frames all divide it). */
export const WORKER_CYCLE_MS = 12_000

const frameKeyframes = (): string => {
  const out: string[] = []
  for (const N of [2, 3, 4]) {
    for (let i = 0; i < N; i++) {
      const a = (i * 100) / N
      const b = ((i + 1) * 100) / N
      const stops = i === 0 ? `0%{visibility:visible}${b}%{visibility:hidden}` : `0%{visibility:hidden}${a}%{visibility:visible}${i < N - 1 ? b + '%{visibility:hidden}' : ''}`
      out.push(`@keyframes wf${N}_${i}{${stops}}`)
    }
  }
  return out.join('')
}

export const WORKER_CSS = `<style>
.wf{visibility:hidden}.wf.f0{visibility:visible}
${[2, 3, 4].map(N => `.wk-n${N} .wf{animation-duration:${(N * SPRITE_FRAME_MS) / 1000}s;animation-timing-function:step-end;animation-iteration-count:infinite;animation-delay:var(--wd,0s)}${Array.from({ length: N }, (_, i) => `.wk-n${N} .f${i}{animation-name:wf${N}_${i}}`).join('')}`).join('')}
${frameKeyframes()}
.wk-still .wf{animation:none!important}
@media (prefers-reduced-motion: reduce){.wk .wf{animation:none!important}}
</style>`

/** One worker's drawing in a SPRITE_W x SPRITE_H box at the origin (the caller scales and translates it). `s` and `f` are the tone's stroke and fill classes. */
export function workerBody(kind: StepKind, s: string, f: string): string {
  const frames = SPRITE_FRAMES[kind] ?? SPRITE_FRAMES.other!
  const nn = frames.length
  const back = `<rect class="${f}" x="0" y="0" width="${SPRITE_W}" height="${SPRITE_H}" rx="3" fill-opacity=".22"/><rect class="${s}" x=".5" y=".5" width="${SPRITE_W - 1}" height="${SPRITE_H - 1}" rx="2.5" fill="none" stroke-width="1" stroke-opacity=".7" style="fill:none"/>`
  return `${back}<g class="wk-sp wk-n${nn}" shape-rendering="crispEdges">${frames.map((fr, i) => `<g class="wf f${i}">${fr}</g>`).join('')}</g>`
}

export type WorkerLine = { svg: string; width: number }

/**
 * The one line of workers under a step: a tiny worker then the agent's name, for each agent, left to right from `x`. More than fit in `room` end in "+n".
 * `labels` may hold '' (a worker with no name). The returned svg is a <g> positioned at (x, y) (the top of the 16 px line).
 */
export function workersLine(kind: StepKind, labels: readonly string[], tone: WorkerTone, x: number, y: number, room: number, o: { motion: boolean; nowMs: number }): WorkerLine {
  const s = tone === 'warn' ? 'warns' : 'runs'
  const f = tone === 'warn' ? 'warnc' : 'runc'
  const names = labels.length === 0 ? [''] : labels
  const wd = '-' + (Math.round(o.nowMs % WORKER_CYCLE_MS) / 1000).toFixed(2) + 's'
  const parts: string[] = []
  let cx = 0
  let shown = 0
  for (let i = 0; i < names.length; i++) {
    const label = names[i] ?? ''
    const lw = label === '' ? 0 : Math.ceil(textWidth(label, CAP)) + 4
    const need = WORKER_W + lw
    const more = names.length - i - 1
    const reserve = more > 0 ? Math.ceil(textWidth('+' + more, CAP)) + GAP + 4 : 0
    if (i > 0 && cx + need + reserve > room) break
    parts.push(`<g transform="translate(${n(cx)} 0) scale(${WORKER_SCALE})">${workerBody(kind, s, f)}</g>`)
    if (label !== '') parts.push(`<text class="s" x="${n(cx + WORKER_W + 4)}" y="${n(WORKER_PX / 2 + 4)}" font-family="${FONT}" font-size="${CAP}">${xml(label)}</text>`)
    cx += need + GAP
    shown++
  }
  if (shown < names.length) parts.push(`<text class="m" x="${n(cx)}" y="12" font-family="${FONT}" font-size="${CAP}">+${names.length - shown}</text>`)
  const cls = 'wk' + (o.motion ? '' : ' wk-still')
  return { svg: `<g class="${cls}" transform="translate(${n(x)} ${n(y)})" style="--wd:${wd}">${parts.join('')}</g>`, width: Math.max(0, cx - GAP) }
}

/** The small marker on a collapsed card: one worker at MARKER_SCALE, top-left at (x, y). Blue while running, amber while waiting. */
export function workerMarker(kind: StepKind, tone: WorkerTone, x: number, y: number, o: { motion: boolean; nowMs: number }): { svg: string; width: number; height: number } {
  const s = tone === 'warn' ? 'warns' : 'runs'
  const f = tone === 'warn' ? 'warnc' : 'runc'
  const wd = '-' + (Math.round(o.nowMs % WORKER_CYCLE_MS) / 1000).toFixed(2) + 's'
  const cls = 'wk wk-marker' + (o.motion ? '' : ' wk-still')
  return { svg: `<g class="${cls}" transform="translate(${n(x)} ${n(y)}) scale(${MARKER_SCALE})" style="--wd:${wd}">${workerBody(kind, s, f)}</g>`, width: SPRITE_W * MARKER_SCALE, height: SPRITE_H * MARKER_SCALE }
}
