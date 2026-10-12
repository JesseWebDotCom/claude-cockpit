// COCKPIT-TREE-01: the plan card, now the Title of one calm tree (Plan > Milestones > Steps) and the drawing of one step.
//   head   the plan's name, "Plan 7/10" counted from the steps, a progress bar, the sync line.
//   row    one step: a state mark and a short title (timer at the right while it runs), the agents underneath (one line: a tiny worker per agent while the
//          step runs, see workers.ts), and, only when the step is expanded, one detail line and the id; a longer note sits behind a second expand.
// Colour (tokens.ts, one place): todo grey, running blue (never red), waiting on Jesse amber, blocked orange (stuck on a fault), done green, red only
// for a failure (a failed gate, a crashed agent), which this card never draws.
// Motion (all CSS, off under prefers-reduced-motion and when `motion` is false): a running step has a pulsing dot, a tinted row, a pulsing edge, a
// light sweep and a live timer; a step that just finished pops its dot and draws the check; a new off-plan step fades in. The drawing is replaced every
// second while anything runs, so every loop starts at the phase the wall clock says (a negative delay) and nothing restarts from the top on a redraw.

import { FONT, doc, n, textWidth, wrapText, xml } from './draw.ts'
import { elapsedText, plainNote, plainTitle, syncedText } from './plan.ts'
import type { PlanRow, PlanShown, RowMotion } from './plan.ts'
import { GAP, GUTTER, RADIUS } from './tokens.ts'
import { WORKER_CSS, WORKER_PX, workersLine } from './workers.ts'

export const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
const CAP = 11
const BODY = 13
const TITLE = 15
const TITLE_LINE = 16
const META_LINE = 14
const MAX_LINES = 40
const NOTE_H = 14
const WORKER_LINE_H = WORKER_PX + 2
const clock = (ms: number): string => new Date(ms).toTimeString().slice(0, 5)
const EDGE = 3
export const MONO_EM = 0.6

/** The detail line is one short sentence; longer text stays behind the second expand. */
export const DETAIL_MAX = 100

export type PlanCardOpts = {
  /** The step is expanded: its detail line and id show. */
  open: boolean
  /** The second expand: the full note and the history of the step. */
  more?: boolean
  /** Animate. False draws the same card still (the person turned motion off). */
  motion: boolean
  nowMs: number
}

/** The one-line detail of a step (its note, else the newest plain sentence said about it) and whether more sits behind the second expand. */
export function stepDetail(r: PlanRow): { full: string; short: string; hasMore: boolean } {
  const full = plainNote(r) !== '' ? plainNote(r) : r.say
  let short = full
  if (full.length > DETAIL_MAX) {
    const cut = full.slice(0, DETAIL_MAX)
    short = cut.slice(0, Math.max(DETAIL_MAX - 20, cut.lastIndexOf(' '))).trimEnd() + '\u2026'
  }
  return { full, short, hasMore: full.length > DETAIL_MAX || r.history.length > (full !== '' && r.say === full ? 1 : 0) }
}

export const planCss = (W: number, grewFrom: number | null, ratio: number): string => {
  const f = grewFrom !== null && ratio > 0 ? Math.max(0, Math.min(1, grewFrom / ratio)) : 1
  return `<style>
.pl-o{transform-box:fill-box;transform-origin:center}
.pl-l{transform-box:fill-box;transform-origin:left center}
.pl-run .pl-scan{animation:pls 3.2s linear infinite}
.pl-hold .pl-dot{animation:plk .5s cubic-bezier(.2,1.6,.4,1) both}
.pl-hold .pl-chk{stroke-dasharray:12;animation:plc .4s ease-out .15s both}
.pl-rise{animation:pli .8s ease-out both}
.pl-slide{animation:plsl .7s ease-out both}
.pl-fade{animation:plf 1.4s ease-out both}
.pl-grow{animation:plg 1.2s cubic-bezier(.2,.8,.2,1) both}
.pl-tick{animation:plt .6s ease-out both}
.pl-sweep{animation:plw 3.6s linear infinite}
@keyframes pls{0%{transform:translateX(-90px)}100%{transform:translateX(${n(W)}px)}}
@keyframes plk{0%{transform:scale(.4)}60%{transform:scale(1.4)}100%{transform:scale(1)}}
@keyframes plc{from{stroke-dashoffset:12}to{stroke-dashoffset:0}}
@keyframes pli{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes plsl{from{opacity:0;transform:translateY(-18px)}to{opacity:1;transform:none}}
@keyframes plf{from{opacity:0}to{opacity:1}}
@keyframes plg{from{transform:scaleX(${n(f)})}to{transform:scaleX(1)}}
@keyframes plt{0%{transform:scale(1.35)}100%{transform:scale(1)}}
@keyframes plw{0%{transform:translateX(-60px)}100%{transform:translateX(${n(W)}px)}}
@media (prefers-reduced-motion: reduce){.pl-run *,.pl-hold *,.pl-rise,.pl-slide,.pl-fade,.pl-grow,.pl-tick,.pl-sweep{animation:none!important}.pl-scan,.pl-sweep{display:none}}
</style>${WORKER_CSS}`
}

export const text = (x: number, y: number, s: string, cls: string, size = BODY, extra = ''): string =>
  `<text class="${cls}" x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${size}"${extra}>${xml(s)}</text>`
export const mono = (x: number, y: number, s: string, cls: string, size = CAP, extra = ''): string =>
  `<text class="${cls}" x="${n(x)}" y="${n(y)}" font-family="${MONO}" font-size="${size}"${extra}>${xml(s)}</text>`

/** A loop starts where the wall clock says: a negative delay of `now mod period`. */
export const loop = (nowMs: number, periodMs: number): string => `animation-delay:-${(Math.round(nowMs % periodMs) / 1000).toFixed(2)}s`
/** A one-shot starts at the age it has reached. */
export const shot = (ageMs: number): string => `animation-delay:-${(Math.max(0, ageMs) / 1000).toFixed(2)}s`

export const NO_OWNER = 'no live owner'
type Tone = { cls: string; label: string }
/** The colour and word of a step. Red is never used here: it means a failure, and a plan state is not one. */
const toneOf = (r: PlanRow, motion: RowMotion | undefined): Tone => {
  if (r.state === 'done' || motion === 'hold') return { cls: 'okc', label: 'done' }
  if (r.state === 'blocked') return r.onYou ? { cls: 'warnc', label: 'waiting on you' } : { cls: 'stuckc', label: 'blocked' }
  if (r.state === 'running') return { cls: 'runc', label: 'running' }
  return { cls: 'k', label: 'todo' }
}

export type PlanCard = { svg: string; height: number }

const ELLIPSIS = '\u2026'
/** The text cut to fit `room` px, with an ellipsis (a closed row is one short line). */
export function fitText(s: string, size: number, room: number): string {
  if (textWidth(s, size) <= room) return s
  let t = s
  while (t.length > 1 && textWidth(t + ELLIPSIS, size) > room) t = t.slice(0, -1)
  return t.trimEnd() + ELLIPSIS
}

/** Which part to draw: `head` is the plan name, count and bar; `row` is one step on its own tile. */
export type PlanSel = { head?: boolean; /** The head tile runs on into the sections under it (square at the bottom, no gap). */ joined?: boolean; row?: PlanRow; /** A row drawing is at least this tall (room for the button grid beside it). */ minH?: number }

/** One step as its own drawing (the cards of the panel, each with its buttons or chevron beside it). */
export const planRowSvg = (W: number, shown: PlanShown, o: PlanCardOpts, r: PlanRow): PlanCard => planCardSvg(W, shown, o, { row: r })

export function planCardSvg(W: number, shown: PlanShown, o: PlanCardOpts, sel: PlanSel = { head: true }): PlanCard {
  const rowOnly = sel.row !== undefined
  const v = shown.view
  const mo = o.motion
  const now = o.nowMs
  const RIGHT = W - GUTTER
  const parts: string[] = []
  let y = rowOnly ? 0 : GUTTER

  // --- Head: the plan's name, "Plan 7/10", the bar.
  if (sel.head === true && !rowOnly) {
    const title = v.milestone === '' ? 'Plan' : v.milestone
    const titleLs = wrapText(title, TITLE, W - GUTTER * 2, MAX_LINES)
    titleLs.forEach((l, i) => parts.push(text(GUTTER, y + 15 + i * 19, l, 't', TITLE, ' font-weight="700"')))
    y += 5 + titleLs.length * 19
    const countStr = v.doneN + '/' + v.planned
    const countCls = shown.ticked && mo ? 'pl-o pl-tick' : 'pl-o'
    parts.push(`<g class="${countCls}" style="${shown.ticked ? shot(0) : ''}">${mono(GUTTER, y + 11, countStr, 't', BODY, ' font-weight="700"')}</g>`)
    let cx = GUTTER + Math.ceil(countStr.length * BODY * MONO_EM) + GAP
    parts.push(text(cx, y + 11, 'planned', 's', CAP))
    cx += Math.ceil(textWidth('planned', CAP)) + GAP
    if (v.off.length > 0) {
      const tag = '+' + v.off.length + ' off plan'
      parts.push(text(cx, y + 11, tag, 'warnc', CAP, ' font-weight="600"'))
      cx += Math.ceil(textWidth(tag, CAP)) + GAP
    }
    const sync = syncedText(v.updatedMs, now)
    if (sync !== '') {
      const cls = v.drift.level === 'red' ? 'stuckc' : v.drift.level === 'amber' ? 'warnc' : 'm'
      const dot = v.drift.level === 'ok' ? '' : `<circle class="${cls}" cx="${n(RIGHT - Math.ceil(textWidth(sync, CAP)) - 12)}" cy="${n(y + 7.5)}" r="3"/>`
      parts.push(dot + text(RIGHT, y + 11, sync, cls, CAP, ' text-anchor="end"'))
    }
    y += 20
    const bw = W - GUTTER * 2
    const fillW = Math.max(v.ratio > 0 ? 6 : 0, bw * v.ratio)
    parts.push(`<rect class="k" x="${GUTTER}" y="${y}" width="${n(bw)}" height="6" rx="3"/>`)
    if (fillW > 0) {
      parts.push(`<rect class="okc pl-l${shown.grewFrom !== null && mo ? ' pl-grow' : ''}" x="${GUTTER}" y="${y}" width="${n(fillW)}" height="6" rx="3"/>`)
      if (v.running.length > 0 && mo) parts.push(`<clipPath id="plc-bar"><rect x="${GUTTER}" y="${y}" width="${n(fillW)}" height="6" rx="3"/></clipPath><rect class="pl-sweep" clip-path="url(#plc-bar)" x="${GUTTER}" y="${y}" width="40" height="6" fill="#ffffff" fill-opacity=".28" style="${loop(now, 3600)}"/>`)
    }
    y += 14
    if (v.drift.text !== '' && v.drift.level !== 'ok') {
      const dl = wrapText(v.drift.text + ' (plan not updated for ' + Math.round(v.drift.ms / 60000) + ' min)', CAP, W - GUTTER * 2, MAX_LINES)
      dl.forEach((l, i) => parts.push(text(GUTTER, y + 10 + i * NOTE_H, l, v.drift.level === 'red' ? 'stuckc' : 'warnc', CAP)))
      y += 2 + dl.length * NOTE_H
    }
    if (v.planned === 0 && v.off.length === 0) {
      parts.push(text(GUTTER, y + 10, 'the plan has no steps yet', 'm', CAP))
      y += NOTE_H
    }
    y += 4
    const joined = sel.joined === true
    const H = y + GUTTER - 2 - (joined ? 8 : 0)
    return { svg: doc(W, H, `<rect class="tile" x="0" y="0" width="${n(W)}" height="${n(joined ? H + RADIUS : H - 8)}" rx="${RADIUS}"/>${parts.join('')}`, planCss(W, shown.grewFrom, v.ratio)), height: H }
  }

  // --- One step.
  const r = sel.row
  if (r === undefined) return { svg: doc(W, 1, ''), height: 1 }
  const m = shown.motion.get(r.id)
  const mk = m?.kind
  const tone = toneOf(r, mk)
  const live = r.state === 'running' && mk !== 'hold'
  const blk = r.state === 'blocked'
  const dim = r.state === 'done' && mk !== 'hold'
  const textX = GUTTER + 20
  const room = Math.max(60, RIGHT - textX)
  const timer = live && r.startedMs !== null ? elapsedText(now - r.startedMs) : ''
  const timerW = timer === '' ? 0 : Math.ceil(timer.length * CAP * MONO_EM) + GAP
  const titleLines = o.open ? wrapText(plainTitle(r), BODY, Math.max(60, room - timerW), MAX_LINES) : [fitText(plainTitle(r), BODY, Math.max(60, room - timerW - (!live && !blk && !r.planned ? 50 : 0)))]
  const det = stepDetail(r)
  const detailLines = o.open && det.full !== '' ? wrapText(o.more === true ? det.full : det.short, CAP, room, MAX_LINES) : []
  const histLines = o.open && o.more === true ? r.history.slice(-3).flatMap(h => wrapText((h.atMs === null ? '' : clock(h.atMs) + ' ') + (h.state !== '' ? h.state + ': ' : '') + h.say, CAP, room, MAX_LINES)) : []
  // The agents line: tiny workers while the step runs (and the raised hand while it waits on Jesse), plain names otherwise.
  const waitingOnYou = blk && r.onYou
  const workerLine = live || waitingOnYou
  const agentNames = r.agents.length > 0 ? r.agents : r.owner !== '' ? [r.owner] : []
  const agentsText = o.open && !workerLine && agentNames.length > 0 ? agentNames.join(', ') : ''
  const lineH = workerLine ? WORKER_LINE_H : agentsText !== '' ? META_LINE : 0
  const idLine = o.open
  const H = 8 + titleLines.length * TITLE_LINE + lineH + detailLines.length * NOTE_H + (idLine ? META_LINE : 0) + histLines.length * NOTE_H
  const classes = ['pl-row']
  if (mo) {
    if (live) classes.push('pl-run')
    if (mk === 'hold') classes.push('pl-hold')
    if (mk === 'rise') classes.push('pl-rise')
    if (mk === 'fade') classes.push('pl-fade')
  }
  const style = [live ? loop(now, 1600) : '', mk === 'rise' || mk === 'fade' ? shot(m?.ageMs ?? 0) : ''].filter(x => x !== '').join(';')
  const cy = y + 4 + 9
  const g: string[] = []
  const tintCls = tone.cls === 'k' ? '' : tone.cls
  const slug = xml(r.id).replace(/[^A-Za-z0-9]/g, '_')
  if (tintCls !== '') g.push(`<rect class="${tintCls}" x="0" y="${n(y)}" width="${n(W)}" height="${H}" fill-opacity="${live || blk || mk === 'hold' ? '.09' : '.04'}"/>`)
  if (tintCls !== '') g.push(`<rect class="${tintCls} pl-edge" x="0" y="${n(y)}" width="${EDGE}" height="${H}"/>`)
  if (live) {
    g.push(`<clipPath id="plc-${slug}"><rect x="0" y="${n(y)}" width="${n(W)}" height="${H}"/></clipPath>`)
    g.push(`<g clip-path="url(#plc-${slug})"><rect class="runc pl-scan" x="0" y="${n(y)}" width="60" height="${H}" fill-opacity=".10" style="${loop(now, 3200)}"/></g>`)
  }
  if (r.state === 'done' || mk === 'hold') {
    g.push(`<circle class="okc pl-dot pl-o" cx="${GUTTER + 6}" cy="${n(cy)}" r="5.5"/><path class="pl-chk" d="M${GUTTER + 3.2} ${n(cy)} l2 2 l3.6 -4" fill="none" stroke="#0b0b0b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="${mk === 'hold' ? shot(m?.ageMs ?? 0) : ''}"/>`)
  } else if (r.state === 'todo') {
    g.push(`<circle class="k" cx="${GUTTER + 6}" cy="${n(cy)}" r="4"/>`)
  } else {
    g.push(`<circle class="${tone.cls} pl-dot pl-o" cx="${GUTTER + 6}" cy="${n(cy)}" r="4" />`)
  }
  let ty = y + 4 + 13
  titleLines.forEach((l, i) => {
    g.push(text(textX, ty, l, dim ? 'm' : 't', BODY))
    if (i === 0 && timer !== '') g.push(mono(RIGHT, ty, timer, 'runc', CAP, ' text-anchor="end" font-variant-numeric="tabular-nums"'))
    if (i === 0 && !live && !blk && !r.planned) g.push(text(RIGHT, ty, 'off plan', 'warnc', CAP, ' text-anchor="end"'))
    ty += TITLE_LINE
  })
  ty -= TITLE_LINE
  const afterTitle = y + 8 + titleLines.length * TITLE_LINE
  if (workerLine) {
    const wl = workersLine(waitingOnYou ? 'wait' : r.kind, waitingOnYou ? ['you'] : agentNames, waitingOnYou ? 'warn' : 'run', textX, afterTitle - 2, room, { motion: mo, nowMs: now })
    g.push(wl.svg)
  } else if (agentsText !== '') {
    g.push(text(textX, afterTitle + 9, agentsText, 's', CAP))
  }
  ty = afterTitle + lineH + 9
  for (const l of detailLines) {
    g.push(text(textX, ty, l, blk ? tone.cls : 's', CAP))
    ty += NOTE_H
  }
  if (idLine) {
    g.push(mono(textX, ty, r.id, 'm', CAP - 1))
    g.push(text(RIGHT, ty, tone.label, tone.cls === 'k' ? 'm' : tone.cls, CAP - 1, ' text-anchor="end"'))
    ty += META_LINE
  }
  for (const l of histLines) {
    g.push(text(textX, ty, l, 'm', CAP))
    ty += NOTE_H
  }
  parts.push(`<g class="${classes.join(' ')}" style="${style}">${g.join('')}</g>`)
  y += H
  const Hr = Math.max(y, sel.minH ?? 1)
  return { svg: doc(W, Hr, `<rect class="tile" x="0" y="0" width="${n(W)}" height="${Hr}"/>${parts.join('')}`, planCss(W, null, v.ratio)), height: Hr }
}
