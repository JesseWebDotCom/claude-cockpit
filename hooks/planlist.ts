// COCKPIT-TREE-02 (0.23.4): the plan's list sections in the look of the 0.21.0 panel (Jesse: "look how much better our old one looks"): one section per header
// (WAITING ON YOU, MILESTONES, RUNNING, BLOCKED, TODO, DONE, OFF PLAN, SYSTEM), each header a collapsible control, each row the old row: the plain title wrapped over as
// many lines as it needs, one small line with the mono id and the owner and timer at the right, then the note. Added on top of that look and nothing else: a tiny
// pixel-art worker under a running row (workers.ts), and "<owner> gone" in amber (red means an error and a plan state is never one).
// Pure: every function returns an svg string and its height. The panel (register.tsx) puts a native toggle button beside each header, because an Svg takes no press.

import { doc, n, textWidth, wrapText, xml } from './draw.ts'
import { elapsedText, plainNote, plainTitle } from './plan.ts'
import type { PlanRow, PlanShown, RowMotion } from './plan.ts'
import { GAP, GUTTER, RADIUS } from './tokens.ts'
import { WORKER_PX, workersLine } from './workers.ts'
import { MONO_EM, fitText, loop, mono, planCss, shot, text } from './plancard.ts'

const CAP = 11
const closedRightW = (r: PlanRow, live: boolean, now: number): number => {
  if (live) return Math.ceil(elapsedText(r.startedMs === null ? null : now - r.startedMs).length * CAP * MONO_EM) + 14
  if (r.state === 'blocked') return Math.ceil(textWidth('waiting: ' + (r.onYou ? 'you' : r.owner !== '' ? r.owner : 'a decision'), CAP)) + 14
  if (!r.planned) return Math.ceil(textWidth('off plan', CAP)) + 14
  return 0
}
const BODY = 13
const TITLE_LINE = 16
const META_LINE = 14
const NOTE_H = 14
const MAX_LINES = 40
const EDGE = 3
const WORKER_LINE_H = WORKER_PX + 3

export type ListDrawing = { svg: string; height: number }

/** The header strip's height. */
export const LIST_HEAD_H = 26

/** The word for a running step whose owner is not alive anywhere. Amber (warnc), never red. */
export const goneText = (owner: string): string => (owner !== '' ? owner + ' gone' : 'owner gone')

/**
 * A section header on the tile: a drawn chevron (a triangle, a shape, so it never depends on a font having the glyph), the label in capitals, the mono count.
 * `cls` is the section's colour class (runc, warnc, okc, m); a count of 0 draws grey. `hint` is a small right-aligned word ("open" or "close").
 */
export function listHeadSvg(W: number, o: { label: string; count: number | string; cls: string; open: boolean; hint?: string }): ListDrawing {
  const H = LIST_HEAD_H
  const cls = o.count === 0 || o.count === '0' ? 'm' : o.cls
  const cy = H / 2 + 1
  const tri = o.open ? `M${GUTTER} ${n(cy - 3)} l9 0 l-4.5 6.5 z` : `M${GUTTER + 1} ${n(cy - 5)} l6.5 5 l-6.5 5 z`
  const label = o.label.toUpperCase()
  const body =
    `<rect class="tile" x="0" y="0" width="${n(W)}" height="${H}"/>` +
    `<path class="${cls}" d="${tri}"/>` +
    text(GUTTER + 18, cy + 4, label, cls, CAP, ' font-weight="700" letter-spacing=".6"') +
    mono(GUTTER + 18 + Math.ceil(textWidth(label, CAP)) + 14 + Math.ceil(label.length * 0.6), cy + 4, String(o.count), 's', CAP, ' font-weight="700"') +
    (o.hint !== undefined ? text(W - GUTTER, cy + 4, o.hint, 'm', CAP, ' text-anchor="end"') : '')
  return { svg: doc(W, H, body), height: H }
}

/** One plain wrapped line on the tile ("+20 more", "latest: ...", an empty section's "nothing here"). */
export function listLineSvg(W: number, s: string, cls = 's'): ListDrawing {
  const ls = wrapText(s, CAP, Math.max(60, W - GUTTER * 2), MAX_LINES)
  const H = 6 + ls.length * NOTE_H + 4
  return { svg: doc(W, H, `<rect class="tile" x="0" y="0" width="${n(W)}" height="${H}"/>` + ls.map((l, i) => text(GUTTER + 18, 15 + i * NOTE_H, l, cls, CAP)).join('')), height: H }
}

/** The green banner of an empty Waiting section: nothing is waiting on you. */
export function listBannerSvg(W: number, s: string): ListDrawing {
  const H = 30
  return { svg: doc(W, H, `<rect class="okc" x="0" y="2" width="${n(W)}" height="${H - 4}" rx="${RADIUS}" fill-opacity=".12"/>${text(GUTTER, 20, s, 'okc', BODY)}`), height: H }
}

type Tone = { cls: string; label: string }
/** The colour of a row. Red is not here: running blue, waiting on you amber, an owner gone amber, stuck orange, done green, todo grey. */
const toneOf = (r: PlanRow, motion: RowMotion | undefined): Tone => {
  if (r.state === 'done' || motion === 'hold') return { cls: 'okc', label: 'done' }
  if (r.state === 'blocked') return r.onYou ? { cls: 'warnc', label: 'waiting on you' } : { cls: 'stuckc', label: 'blocked' }
  if (r.state === 'running') return { cls: 'runc', label: 'running' }
  return { cls: 'k', label: 'todo' }
}

/**
 * One row of a list section, as the 0.21.0 panel drew it. `kind` says which section it sits in (DONE rows are dim). A running row whose owner is alive gets a worker line
 * (a tiny pixel-art worker and the agent's name) under its note; a row whose owner is gone gets amber, still and no worker.
 */
export function listRowSvg(W: number, shown: PlanShown, r: PlanRow, o: { motion: boolean; nowMs: number; kind: 'live' | 'done' | 'list'; open?: boolean }): ListDrawing {
  const open = o.open === true
  const mo = o.motion
  const now = o.nowMs
  const RIGHT = W - GUTTER
  const m = shown.motion.get(r.id)
  const mk = m?.kind
  const tone = toneOf(r, mk)
  const live = r.state === 'running' && mk !== 'hold'
  const gone = false
  const blk = r.state === 'blocked'
  const dim = r.state === 'done' && mk !== 'hold'
  const textX = GUTTER + 20
  const room = Math.max(60, RIGHT - textX)
  // 0.24.0: a closed row is one short line (the title cut to fit); the wrapped title, the id and the note show only when the row is opened.
  const titleLines = open ? wrapText(plainTitle(r), BODY, room, MAX_LINES) : [fitText(plainTitle(r), BODY, room - closedRightW(r, live, now))]
  const noteLines = open && plainNote(r) !== '' ? wrapText(plainNote(r), CAP, room, MAX_LINES) : []
  // The right-hand group: owner and timer (running), the waiting phrase (blocked), the off-plan tag.
  const right: { s: string; cls: string; mono: boolean }[] = []
  if (live || gone) {
    if (open) right.push({ s: r.owner, cls: 's', mono: false })
    right.push({ s: elapsedText(r.startedMs === null ? null : now - r.startedMs), cls: 'runc', mono: true })
  } else if (blk) right.push({ s: 'waiting: ' + (r.onYou ? 'you' : r.owner !== '' ? r.owner : 'a decision'), cls: 'warnc', mono: false })
  else if (!r.planned) right.push({ s: 'off plan', cls: 'warnc', mono: false })
  const rights = right.filter(x => x.s !== '')
  const widthOf = (x: { s: string; mono: boolean }): number => Math.ceil(x.mono ? x.s.length * CAP * MONO_EM : textWidth(x.s, CAP))
  const rightW = rights.reduce((w, x) => w + widthOf(x) + GAP, 0)
  const idW = Math.ceil(r.id.length * CAP * MONO_EM)
  const showMeta = open && r.id !== ''
  const metaFits = idW + rightW + GAP <= room
  const metaLines = rights.length > 0 && !metaFits ? 2 : 1
  const agentNames = r.agents.length > 0 ? r.agents : r.owner !== '' ? [r.owner] : []
  const workerLine = live
  const H = 8 + titleLines.length * TITLE_LINE + (showMeta ? metaLines * META_LINE : 0) + noteLines.length * NOTE_H + (workerLine ? WORKER_LINE_H : 0)
  const classes = ['pl-row']
  if (mo) {
    if (live) classes.push('pl-run')
    if (mk === 'hold') classes.push('pl-hold')
    if (mk === 'rise') classes.push('pl-rise')
    if (mk === 'slide') classes.push('pl-slide')
    if (mk === 'fade') classes.push('pl-fade')
  }
  const style = [live ? loop(now, 1600) : '', mk === 'rise' || mk === 'slide' || mk === 'fade' ? shot(m?.ageMs ?? 0) : ''].filter(x => x !== '').join(';')
  const cy = 4 + 9
  const g: string[] = []
  const tintCls = tone.cls === 'k' ? '' : tone.cls
  const slug = xml(r.id).replace(/[^A-Za-z0-9]/g, '_')
  if (tintCls !== '') g.push(`<rect class="${tintCls}" x="0" y="0" width="${n(W)}" height="${H}" fill-opacity="${live || blk || gone || mk === 'hold' ? '.09' : '.04'}"/>`)
  if (tintCls !== '') g.push(`<rect class="${tintCls}" x="0" y="0" width="${EDGE}" height="${H}"/>`)
  if (live) {
    g.push(`<clipPath id="pls-${slug}"><rect x="0" y="0" width="${n(W)}" height="${H}"/></clipPath>`)
    g.push(`<g clip-path="url(#pls-${slug})"><rect class="runc pl-scan" x="0" y="0" width="60" height="${H}" fill-opacity=".10" style="${loop(now, 3200)}"/></g>`)
  }
  if (r.state === 'done' || mk === 'hold') {
    g.push(`<circle class="okc pl-dot pl-o" cx="${GUTTER + 6}" cy="${n(cy)}" r="5.5"/><path class="pl-chk" d="M${GUTTER + 3.2} ${n(cy)} l2 2 l3.6 -4" fill="none" stroke="#0b0b0b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="${mk === 'hold' ? shot(m?.ageMs ?? 0) : ''}"/>`)
  } else if (r.state === 'todo') {
    g.push(`<circle class="k" cx="${GUTTER + 6}" cy="${n(cy)}" r="4"/>`)
  } else {
    g.push(`<circle class="${tone.cls} pl-dot pl-o" cx="${GUTTER + 6}" cy="${n(cy)}" r="4"/>`)
  }
  let ty = 4 + 13
  for (const l of titleLines) {
    g.push(text(textX, ty, l, dim ? 'm' : 't', BODY))
    ty += TITLE_LINE
  }
  if (!open && rights.length > 0) {
    let rx = RIGHT
    for (const x of rights) {
      g.push(x.mono ? mono(rx, 4 + 13, x.s, x.cls, CAP, ' text-anchor="end" font-variant-numeric="tabular-nums"') : text(rx, 4 + 13, x.s, x.cls, CAP, ' text-anchor="end"'))
      rx -= widthOf(x) + GAP
    }
  }
  if (showMeta) {
    ty += 1
    g.push(mono(textX, ty, r.id, 'm', CAP - 1))
    let rx = RIGHT
    const rightY = metaFits ? ty : ty + META_LINE
    for (const x of rights) {
      g.push(x.mono ? mono(rx, rightY, x.s, x.cls, CAP, ' text-anchor="end" font-variant-numeric="tabular-nums"') : text(rx, rightY, x.s, x.cls, CAP, ' text-anchor="end"'))
      rx -= widthOf(x) + GAP
    }
    ty += metaLines * META_LINE
  }
  for (const l of noteLines) {
    g.push(text(textX, ty, l, blk ? 'warnc' : 's', CAP))
    ty += NOTE_H
  }
  if (workerLine) {
    const wl = workersLine(r.kind, agentNames, 'run', textX, ty - 9, room, { motion: mo, nowMs: now })
    g.push(wl.svg)
  }
  void o.kind
  return { svg: doc(W, H, `<rect class="tile" x="0" y="0" width="${n(W)}" height="${H}"/><g class="${classes.join(' ')}" style="${style}">${g.join('')}</g>`, planCss(W, null, shown.view.ratio)), height: H }
}
