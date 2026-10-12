// COCKPIT-TREE-01: the tiny workers. A separate small set from the agent characters (sprites.ts): one 16 px figure per agent, drawn on ONE line under a
// running step, doing what the step is (its `kind`): research reads papers, docs writes and types, code hammers, test ticks a checklist, bench watches a
// stopwatch, review holds a magnifying glass, wait raises a hand, other is a neutral figure that bobs. Colours are the running blue (or the waiting amber
// for the hand), never red; they come from the classes tokens.ts defines.
// Cheap: pure CSS keyframes (a few frames each), no timers. Every loop starts at the phase the wall clock says (one custom property, --wd, set per
// drawing), so a redraw never restarts it. With reduced motion, or motion off, nothing animates and each worker shows its static pose.

import { FONT, n, textWidth, xml } from './draw.ts'
import type { StepKind } from './plan.ts'

export const WORKER_PX = 16
const GAP = 6
const CAP = 11

export type WorkerTone = 'run' | 'warn'

/** The loop period every worker animation divides evenly, so one phase offset fits them all. */
export const WORKER_CYCLE_MS = 12_000

export const WORKER_CSS = `<style>
.wk-o{transform-box:fill-box}
.wk-flip{transform-origin:0% 50%;animation:wkf 1.2s ease-in-out infinite;animation-delay:var(--wd,0s)}
.wk-grow{transform-origin:0% 50%;animation:wkg 1.2s steps(5,end) infinite;animation-delay:var(--wd,0s)}
.wk-key{animation:wkk .3s steps(1,end) infinite;animation-delay:var(--wd,0s)}
.wk-ham{transform-origin:0% 100%;animation:wkh 1.2s cubic-bezier(.5,0,.8,.4) infinite;animation-delay:var(--wd,0s)}
.wk-t1,.wk-t2,.wk-t3{animation:wkt 2.4s steps(1,end) infinite}
.wk-t1{animation-delay:calc(var(--wd,0s) + 0s)}
.wk-t2{animation-delay:calc(var(--wd,0s) + .6s)}
.wk-t3{animation-delay:calc(var(--wd,0s) + 1.2s)}
.wk-spin{transform-origin:50% 100%;animation:wks 2s linear infinite;animation-delay:var(--wd,0s)}
.wk-scan{animation:wkc 1.5s ease-in-out infinite alternate;animation-delay:var(--wd,0s)}
.wk-wave{transform-origin:0% 100%;animation:wkw .8s ease-in-out infinite alternate;animation-delay:var(--wd,0s)}
.wk-bob{animation:wkb 1.2s ease-in-out infinite;animation-delay:var(--wd,0s)}
@keyframes wkf{0%,100%{transform:scaleX(1)}45%{transform:scaleX(.1)}55%{transform:scaleX(.1)}}
@keyframes wkg{0%{transform:scaleX(.15)}100%{transform:scaleX(1)}}
@keyframes wkk{0%{transform:translateY(0)}50%{transform:translateY(.9px)}}
@keyframes wkh{0%{transform:rotate(-55deg)}60%,100%{transform:rotate(18deg)}}
@keyframes wkt{0%{opacity:.15}25%,100%{opacity:1}}
@keyframes wks{to{transform:rotate(360deg)}}
@keyframes wkc{from{transform:translateX(-2.2px)}to{transform:translateX(1.6px)}}
@keyframes wkw{from{transform:rotate(-14deg)}to{transform:rotate(14deg)}}
@keyframes wkb{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.2px)}}
.wk-still *{animation:none!important}
@media (prefers-reduced-motion: reduce){.wk *{animation:none!important}}
</style>`

const w = (cls: string, extra = ''): string => `class="${cls}" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"${extra}`

/** One worker's drawing in a 16 x 16 box at the origin (the caller translates it). `s` is the stroke class, `f` the fill class. */
export function workerBody(kind: StepKind, s: string, f: string): string {
  const head = `<circle class="${f}" cx="8" cy="3.8" r="2.5"/>`
  const torso = `<path ${w(s)} d="M8 6.8V12M8 12L6 15M8 12L10 15"/>`
  const armDown = (side: 'l' | 'r'): string => `<path ${w(s)} d="M8 8.2L${side === 'l' ? '5.6' : '10.4'} 10.6"/>`
  switch (kind) {
    case 'research':
      return `${head}${torso}${armDown('l')}<path ${w(s)} d="M8 8.2L10.2 9.4"/><g class="wk-o wk-flip"><rect ${w(s)} x="10" y="6.4" width="5" height="6.6" stroke-width="1.1"/><path ${w(s)} d="M11.2 8.6h2.6M11.2 10.6h2.6" stroke-width="1"/></g>`
    case 'docs':
      return `${head}${torso}<path ${w(s)} d="M8 8.2L10.4 10.6"/><path ${w(s)} d="M8 8.2L5.6 10.6"/><g class="wk-key"><rect class="${f}" x="9.6" y="11.4" width="6" height="2.4" rx=".6" fill-opacity=".55"/></g><g class="wk-o wk-grow"><path ${w(s)} d="M10 7.4h5.2" stroke-width="1.3"/></g>`
    case 'code':
      return `${head}${torso}${armDown('l')}<g class="wk-o wk-ham"><path ${w(s)} d="M8 8.6L12.6 4.6" stroke-width="1.4"/><rect class="${f}" x="11.4" y="2.4" width="3.8" height="2.6" rx=".5" transform="rotate(-35 13.3 3.7)"/></g>`
    case 'test':
      return `${head}${torso}${armDown('l')}<path ${w(s)} d="M8 8.2L9.6 9.2"/><rect ${w(s)} x="9.4" y="2.2" width="6" height="12" rx="1" stroke-width="1.1"/><path class="wk-t1 ${s}" fill="none" stroke-width="1.2" stroke-linecap="round" d="M10.6 5l.9.9 1.7-1.8"/><path class="wk-t2 ${s}" fill="none" stroke-width="1.2" stroke-linecap="round" d="M10.6 8.4l.9.9 1.7-1.8"/><path class="wk-t3 ${s}" fill="none" stroke-width="1.2" stroke-linecap="round" d="M10.6 11.8l.9.9 1.7-1.8"/>`
    case 'bench':
      return `${head}${torso}${armDown('l')}<path ${w(s)} d="M8 8.2L9.4 9.6"/><circle ${w(s)} cx="12.2" cy="9.6" r="3.6" stroke-width="1.2"/><path ${w(s)} d="M11.2 5.4h2M12.2 5.4V6" stroke-width="1.1"/><g class="wk-o wk-spin"><path ${w(s)} d="M12.2 9.6V7" stroke-width="1.2"/></g>`
    case 'review':
      return `${head}${torso}${armDown('l')}<path ${w(s)} d="M8 8.2L10 9.2"/><rect ${w(s)} x="9" y="5.2" width="6.6" height="8.6" rx=".8" stroke-width="1" stroke-opacity=".6"/><g class="wk-o wk-scan"><circle ${w(s)} cx="11.4" cy="9" r="2.6" stroke-width="1.3"/><path ${w(s)} d="M13.3 10.9L15.2 12.8" stroke-width="1.6"/></g>`
    case 'wait':
      return `${head}${torso}${armDown('l')}<g class="wk-o wk-wave"><path ${w(s)} d="M8 8.2L10.6 3" stroke-width="1.4"/><circle class="${f}" cx="10.9" cy="2.4" r="1.7"/></g>`
    default:
      return `<g class="wk-bob">${head}${torso}${armDown('l')}${armDown('r')}</g>`
  }
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
    const need = WORKER_PX + lw
    const more = names.length - i - 1
    const reserve = more > 0 ? Math.ceil(textWidth('+' + more, CAP)) + GAP + 4 : 0
    if (i > 0 && cx + need + reserve > room) break
    parts.push(`<g transform="translate(${n(cx)} 0)">${workerBody(kind, s, f)}</g>`)
    if (label !== '') parts.push(`<text class="s" x="${n(cx + WORKER_PX + 4)}" y="12" font-family="${FONT}" font-size="${CAP}">${xml(label)}</text>`)
    cx += need + GAP
    shown++
  }
  if (shown < names.length) parts.push(`<text class="m" x="${n(cx)}" y="12" font-family="${FONT}" font-size="${CAP}">+${names.length - shown}</text>`)
  const cls = 'wk' + (o.motion ? '' : ' wk-still')
  return { svg: `<g class="${cls}" transform="translate(${n(x)} ${n(y)})" style="--wd:${wd}">${parts.join('')}</g>`, width: Math.max(0, cx - GAP) }
}
