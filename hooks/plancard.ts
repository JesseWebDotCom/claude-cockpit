// COCKPIT-66: the plan card. It replaces the Main status card: the goal, a progress bar counted from the rows, then RUNNING, BLOCKED,
// TODO, DONE and OFF PLAN. One drawing (an svg string) from the same PlanShown the top bar and the footer line read.
//
// Look: dark first, mono ids and timers, tight rows, one accent per state (blue running and waiting on you, green done, amber blocked, grey
// "no live owner"; red is only for failed or errored, 0.22.0).
// Motion (all CSS, off under prefers-reduced-motion and when `motion` is false):
//   running   a pulsing dot with a ripple ring, a tinted row, a pulsing left edge, a thin light sweeping across it, a live timer
//   done      the dot pops and a check draws, the row holds ~3 s in RUNNING, then slides down into DONE; the bar fills and the count ticks
//   blocked   static amber (no pulse, 0.22.0); waiting on Jesse is static blue; an owner that is gone is a quiet grey "no live owner" label
//   off plan  fades in with an amber tag
// The drawing is replaced every second while anything runs, so every loop starts at the phase the wall clock says (a negative delay)
// and every one-shot starts at the age it has reached; nothing restarts from the top on a redraw.

import { FONT, doc, n, textWidth, wrapText, xml } from './draw.ts'
import { elapsedText, plainNote, plainTitle, syncedText } from './plan.ts'
import type { PlanRow, PlanShown, RowMotion } from './plan.ts'
import { GAP, GUTTER, RADIUS } from './tokens.ts'

const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
const CAP = 11
const BODY = 13
const TITLE = 15
const TITLE_LINE = 16
const META_LINE = 14
const MAX_LINES = 40
const NOTE_H = 14
const HEAD_H = 20
const clock = (ms: number): string => new Date(ms).toTimeString().slice(0, 5)
const EDGE = 3
const MONO_EM = 0.6

export type PlanCardOpts = {
  /** The card is open: TODO and DONE list every row; closed, each is one line. */
  open: boolean
  /** Animate. False draws the same card still (the person turned motion off). */
  motion: boolean
  nowMs: number
}

const CSS = (W: number, grewFrom: number | null, ratio: number): string => {
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
</style>`
}

const text = (x: number, y: number, s: string, cls: string, size = BODY, extra = ''): string =>
  `<text class="${cls}" x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${size}"${extra}>${xml(s)}</text>`
const mono = (x: number, y: number, s: string, cls: string, size = CAP, extra = ''): string =>
  `<text class="${cls}" x="${n(x)}" y="${n(y)}" font-family="${MONO}" font-size="${size}"${extra}>${xml(s)}</text>`

/** A loop starts where the wall clock says: a negative delay of `now mod period`. */
const loop = (nowMs: number, periodMs: number): string => `animation-delay:-${(Math.round(nowMs % periodMs) / 1000).toFixed(2)}s`
/** A one-shot starts at the age it has reached. */
const shot = (ageMs: number): string => `animation-delay:-${(Math.max(0, ageMs) / 1000).toFixed(2)}s`

export const NO_OWNER = 'no live owner'
type Tone = { cls: string; label: string }
const toneOf = (r: PlanRow, motion: RowMotion | undefined): Tone => {
  if (r.state === 'done' || motion === 'hold') return { cls: 'okc', label: 'done' }
  if (r.state === 'blocked') return r.onYou ? { cls: 'infoc', label: 'waiting on you' } : { cls: 'warnc', label: 'blocked' }
  // Red means failed or errored and nothing else: a running row whose owner is not alive is a quiet grey one.
  if (r.state === 'running') return r.gone ? { cls: 'm', label: NO_OWNER } : { cls: 'okc', label: 'running' }
  return { cls: 'k', label: 'todo' }
}

export type PlanCard = { svg: string; height: number }

/** Which part of the card to draw. Nothing given: the whole old card. `head` is the goal, count and bar; `row` is one row on its own tile (no heading). */
export type PlanSel = { head?: boolean; row?: PlanRow; /** A row drawing is at least this tall (room for the button grid beside it). */ minH?: number }

/** One row of the plan as its own drawing (used by the cards of the panel, each with its buttons beside it). */
export const planRowSvg = (W: number, shown: PlanShown, o: PlanCardOpts, r: PlanRow): PlanCard => planCardSvg(W, shown, o, { row: r })

export function planCardSvg(W: number, shown: PlanShown, o: PlanCardOpts, sel?: PlanSel): PlanCard {
  const all = sel === undefined
  const rowOnly = sel?.row !== undefined
  const wantHead = all || sel?.head === true
  const v = shown.view
  const mo = o.motion
  const now = o.nowMs
  const RIGHT = W - GUTTER
  const parts: string[] = []
  let y = rowOnly ? 0 : GUTTER

  // --- Head: the goal, the count line, the bar.
  if (wantHead) {
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
  }
  const sync = syncedText(v.updatedMs, now)
  if (sync !== '') {
    const cls = v.drift.level === 'red' ? 'errc' : v.drift.level === 'amber' ? 'warnc' : 'm'
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
    dl.forEach((l, i) => parts.push(text(GUTTER, y + 10 + i * NOTE_H, l, v.drift.level === 'red' ? 'errc' : 'warnc', CAP)))
    y += 2 + dl.length * NOTE_H
  }
  y += 4
  }

  const section = (label: string, count: number, cls = 'm'): void => {
    parts.push(text(GUTTER, y + 13, label, cls, CAP, ' font-weight="600" letter-spacing=".6"'))
    parts.push(mono(GUTTER + Math.ceil(textWidth(label, CAP)) + 14, y + 13, String(count), 's'))
    y += HEAD_H
  }

  // A row of the list (COCKPIT-67): the plain title first, wrapped over as many lines as it needs (never an ellipsis), then one small line with the
  // id (mono, secondary) and the owner, timer or waiting phrase, then the note wrapped. Open, the history of the item follows.
  const row = (r: PlanRow, kind: 'live' | 'done' | 'list'): void => {
    const m = shown.motion.get(r.id)
    const mk = m?.kind
    const tone = toneOf(r, mk)
    const live = r.state === 'running' && mk !== 'hold' && !r.gone
    const blk = r.state === 'blocked'
    const dim = r.state === 'done' && mk !== 'hold'
    const textX = GUTTER + 20
    const room = Math.max(60, RIGHT - textX)
    const titleLines = wrapText(plainTitle(r), BODY, room, MAX_LINES)
    const noteLines = plainNote(r) !== '' ? wrapText(plainNote(r), CAP, room, MAX_LINES) : []
    const hist = o.open ? r.history.slice(-3).map(h => (h.atMs === null ? '' : clock(h.atMs) + ' ') + (h.state !== '' ? h.state + ': ' : '') + h.say) : []
    const histLines = hist.flatMap(h => wrapText(h, CAP, room, MAX_LINES))
    // The right-hand group: owner and timer (running), the waiting phrase (blocked), the off-plan tag.
    const right: { s: string; cls: string; mono: boolean }[] = []
    if (live) {
      right.push({ s: r.owner, cls: 's', mono: false })
      right.push({ s: elapsedText(r.startedMs === null ? null : now - r.startedMs), cls: 'infoc', mono: true })
    } else if (r.state === 'running' && r.gone) right.push({ s: NO_OWNER, cls: 'm', mono: false })
    else if (blk) right.push({ s: 'waiting: ' + (r.onYou ? 'you' : r.owner !== '' ? r.owner : 'a decision'), cls: tone.cls, mono: false })
    else if (!r.planned) right.push({ s: 'off plan', cls: 'warnc', mono: false })
    if (o.open && !live && !blk && r.owner !== '') right.push({ s: r.owner, cls: 's', mono: false })
    const rights = right.filter(x => x.s !== '')
    const widthOf = (x: { s: string; mono: boolean }): number => Math.ceil(x.mono ? x.s.length * CAP * MONO_EM : textWidth(x.s, CAP))
    const rightW = rights.reduce((w, x) => w + widthOf(x) + GAP, 0)
    const idW = Math.ceil(r.id.length * CAP * MONO_EM)
    const metaFits = idW + rightW + GAP <= room
    const metaLines = rights.length > 0 && !metaFits ? 2 : 1
    const H = 8 + titleLines.length * TITLE_LINE + metaLines * META_LINE + noteLines.length * NOTE_H + histLines.length * NOTE_H
    const classes = ['pl-row']
    if (mo) {
      if (live) classes.push('pl-run')
      if (mk === 'hold') classes.push('pl-hold')
      if (mk === 'rise') classes.push('pl-rise')
      if (mk === 'slide') classes.push('pl-slide')
      if (mk === 'fade') classes.push('pl-fade')
    }
    const style = [live ? loop(now, 1600) : '', mk === 'rise' || mk === 'slide' || mk === 'fade' ? shot(m?.ageMs ?? 0) : ''].filter(x => x !== '').join(';')
    const cy = y + 4 + 9
    const g: string[] = []
    const tintCls = tone.cls === 'k' ? '' : tone.cls
    const slug = xml(r.id).replace(/[^A-Za-z0-9]/g, '_')
    if (tintCls !== '') g.push(`<rect class="${tintCls}" x="0" y="${n(y)}" width="${n(W)}" height="${H}" fill-opacity="${live || blk || mk === 'hold' ? '.09' : '.04'}"/>`)
    if (tintCls !== '') g.push(`<rect class="${tintCls} pl-edge" x="0" y="${n(y)}" width="${EDGE}" height="${H}"/>`)
    if (live) {
      g.push(`<clipPath id="plc-${slug}"><rect x="0" y="${n(y)}" width="${n(W)}" height="${H}"/></clipPath>`)
      g.push(`<g clip-path="url(#plc-${slug})"><rect class="infoc pl-scan" x="0" y="${n(y)}" width="60" height="${H}" fill-opacity=".10" style="${loop(now, 3200)}"/></g>`)
    }
    if (r.state === 'done' || mk === 'hold') {
      g.push(`<circle class="okc pl-dot pl-o" cx="${GUTTER + 6}" cy="${n(cy)}" r="5.5"/><path class="pl-chk" d="M${GUTTER + 3.2} ${n(cy)} l2 2 l3.6 -4" fill="none" stroke="#0b0b0b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="${mk === 'hold' ? shot(m?.ageMs ?? 0) : ''}"/>`)
    } else if (r.state === 'todo') {
      g.push(`<circle class="k" cx="${GUTTER + 6}" cy="${n(cy)}" r="4"/>`)
    } else {
      g.push(`<circle class="${tone.cls} pl-dot pl-o" cx="${GUTTER + 6}" cy="${n(cy)}" r="4" />`)
    }
    let ty = y + 4 + 13
    for (const l of titleLines) {
      g.push(text(textX, ty, l, dim ? 'm' : 't', BODY))
      ty += TITLE_LINE
    }
    // Meta line: the id small and secondary, the right group at the right edge (on a line of its own when both do not fit).
    ty += 1
    g.push(mono(textX, ty, r.id, 'm', CAP - 1))
    let rx = RIGHT
    const rightY = metaFits ? ty : ty + META_LINE
    for (const x of rights) {
      g.push(x.mono ? mono(rx, rightY, x.s, x.cls, CAP, ' text-anchor="end" font-variant-numeric="tabular-nums"') : text(rx, rightY, x.s, x.cls, CAP, ' text-anchor="end"'))
      rx -= widthOf(x) + GAP
    }
    ty += metaLines * META_LINE
    for (const l of noteLines) {
      g.push(text(textX, ty, l, blk ? tone.cls : 's', CAP))
      ty += NOTE_H
    }
    for (const l of histLines) {
      g.push(text(textX, ty, l, 'm', CAP))
      ty += NOTE_H
    }
    void kind
    parts.push(`<g class="${classes.filter(Boolean).join(' ')}" style="${style}">${g.join('')}</g>`)
    y += H
  }

  // A plain line, wrapped (never cut with an ellipsis).
  const line = (cls: string, label: string): void => {
    const ls = wrapText(label, CAP, W - GUTTER * 2, MAX_LINES)
    ls.forEach((l, i) => parts.push(text(GUTTER, y + 14 + i * NOTE_H, l, cls, CAP)))
    y += 6 + ls.length * NOTE_H
  }

  if (rowOnly && sel?.row !== undefined) {
    row(sel.row, 'list')
    const Hr = Math.max(y, sel.minH ?? 1)
    return { svg: doc(W, Hr, `<rect class="tile" x="0" y="0" width="${n(W)}" height="${Hr}"/>${parts.join('')}`, CSS(W, null, v.ratio)), height: Hr }
  }

  // --- RUNNING (with a row just done, held for a moment).
  if (all && shown.running.length > 0) {
    section('RUNNING', v.running.length, 'infoc')
    for (const r of shown.running) row(r, 'live')
    y += 4
  }
  // --- BLOCKED
  if (all && v.blocked.length > 0) {
    section('BLOCKED', v.blocked.length, 'warnc')
    for (const r of v.blocked) row(r, 'list')
    y += 4
  }
  // --- TODO
  if (all && v.todo.length > 0) {
    section('TODO', v.todo.length)
    if (o.open) {
      for (const r of v.todo) row(r, 'list')
    } else {
      for (const r of v.todo.slice(0, 4)) row(r, 'list')
      if (v.todo.length > 4) line('s', '+' + (v.todo.length - 4) + ' more (open the card to see them)')
    }
    y += 4
  }
  // --- DONE (newest first)
  if (all && shown.done.length > 0) {
    section('DONE', shown.done.length, 'okc')
    if (o.open) {
      for (const r of shown.done) row(r, 'done')
    } else {
      const newest = shown.done[0]
      line('m', newest !== undefined ? 'latest: ' + plainTitle(newest) + ' (' + newest.id + ')' : '')
      // A row that just slid in still animates when the section is closed.
      const sliding = shown.done.filter(r => shown.motion.get(r.id)?.kind === 'slide')
      if (sliding.length > 0 && mo) {
        for (const r of sliding) row(r, 'done')
      }
    }
    y += 4
  }
  // --- OFF PLAN
  if (all && v.off.length > 0) {
    section('OFF PLAN', v.off.length, 'warnc')
    for (const r of v.off) row(r, 'list')
    y += 4
  }
  if (wantHead && v.queue.length > 0) {
    const q = v.queue[0]
    if (q !== undefined) line('m', 'next goal: ' + (q.milestone || 'unnamed') + ' (' + q.count + (q.count === 1 ? ' item)' : ' items)') + (v.queue.length > 1 ? ' +' + (v.queue.length - 1) + ' more' : ''))
  }
  if (wantHead && v.lastSay !== '') line('m', 'last: ' + v.lastSay)
  if (wantHead && v.planned === 0 && v.off.length === 0) line('m', 'the plan has no items yet')

  const H = y + GUTTER - 2
  const body = `<rect class="tile" x="0" y="0" width="${n(W)}" height="${n(H - 8)}" rx="${RADIUS}"/>${parts.join('')}`
  // The tile is the card; 8 px under it stay transparent before the next card (the same as the status card it replaces).
  return { svg: doc(W, H, body, CSS(W, shown.grewFrom, v.ratio)), height: H }
}
