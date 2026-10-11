// COCKPIT-67: the "Waiting on me" section, the first thing in the plan area. One row per thing that needs Jesse: a plan item blocked with owner
// jesse (the exact ask in full, wrapped, never cut), plus the YOU lines of status.json. A row that is a plan item carries two buttons (drawn by
// register.tsx beside the svg): a check marks it done, an X removes it from the plan (undoable for a few seconds). Empty: "Nothing is waiting on you".
// Pure drawing and list building; the file edits are in planedit.ts.

import { FONT, doc, n, textWidth, wrapText, xml } from './draw.ts'
import { plainNote, plainTitle } from './plan.ts'
import type { PlanRow } from './plan.ts'
import { GUTTER, RADIUS } from './tokens.ts'

export type WaitingItem = {
  /** The plan item id; '' for a YOU line that is not on the plan (it gets no buttons). */
  id: string
  /** The plain sentence naming the thing. */
  title: string
  /** The exact ask, in full. */
  ask: string
  /** Where the ask came from, small and secondary. */
  tag: string
}

export const WAITING_EMPTY = 'Nothing is waiting on you'
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Plan items blocked on Jesse first, then the YOU lines of status.json that say something new ("nothing" and repeats are left out). */
export function waitingItems(waiting: readonly PlanRow[], youLines: readonly string[]): WaitingItem[] {
  const out: WaitingItem[] = waiting.map(r => ({ id: r.id, title: plainTitle(r), ask: plainNote(r) !== '' ? plainNote(r) : r.say, tag: r.id }))
  const seen = out.map(w => norm(w.title + ' ' + w.ask))
  for (const raw of youLines) {
    const t = raw.trim()
    if (t === '' || /^(nothing|none|n\/a|-)\.?$/i.test(t)) continue
    const k = norm(t)
    if (seen.some(s => s.includes(k) || k.includes(s))) continue
    out.push({ id: '', title: t, ask: '', tag: 'from the status file' })
    seen.push(k)
  }
  return out
}

const text = (x: number, y: number, s: string, cls: string, size: number, extra = ''): string =>
  `<text class="${cls}" x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${size}"${extra}>${xml(s)}</text>`

const LINE = 16
const SMALL = 14
const LINE_CAP = 40
/** Two stacked 20 px buttons beside a row need this much height. */
export const WAITING_MIN_H = 44

export type WaitingDrawing = { svg: string; height: number }

/** The section heading card: "Waiting on me" and the count. Always drawn, so the section is always findable. */
export function waitingHeadSvg(W: number, count: number): WaitingDrawing {
  const H = 34
  const label = 'WAITING ON ME'
  const body = `<rect class="tile" x="0" y="0" width="${n(W)}" height="${H + (count > 0 ? RADIUS : 0)}" rx="${RADIUS}"/>${text(GUTTER, 22, label, count > 0 ? 'warnc' : 'm', 13, ' font-weight="700" letter-spacing=".6"')}${text(GUTTER + Math.ceil(textWidth(label, 13)) + 22, 22, String(count), count > 0 ? 'warnc' : 's', 13, ' font-weight="700"')}`
  return { svg: doc(W, H, body), height: H }
}

/** The empty state card. */
export function waitingEmptySvg(W: number): WaitingDrawing {
  const H = 30
  return { svg: doc(W, H, `<rect class="tile" x="0" y="0" width="${n(W)}" height="${H}" rx="${RADIUS}"/>${text(GUTTER, 20, WAITING_EMPTY, 'okc', 13)}`), height: H }
}

/** One ask: the plain title (bold), the ask in full under it, the id small. `W` is the svg width; the buttons sit beside it. */
export function waitingRowSvg(W: number, w: WaitingItem): WaitingDrawing {
  const room = Math.max(60, W - GUTTER * 2 - 6)
  const t = wrapText(w.title, 13, room, LINE_CAP)
  const a = w.ask !== '' ? wrapText(w.ask, 12, room, LINE_CAP) : []
  const H = Math.max(WAITING_MIN_H, 8 + t.length * LINE + a.length * SMALL + 16 + 4)
  let y = 8 + 12
  const parts = [`<rect class="tile" x="0" y="0" width="${n(W)}" height="${H}"/>`, `<rect class="warnc pl-edge" x="0" y="0" width="3" height="${H}"/>`]
  for (const l of t) {
    parts.push(text(GUTTER + 4, y, l, 't', 13, ' font-weight="600"'))
    y += LINE
  }
  for (const l of a) {
    parts.push(text(GUTTER + 4, y - 2, l, 'warnc', 12))
    y += SMALL
  }
  if (a.length > 0) y -= 2
  parts.push(text(GUTTER + 4, y + 2, w.tag, 'm', 10))
  return { svg: doc(W, H, parts.join('')), height: H }
}

/** The inline notice after a removal: what went, and that Undo is beside it. */
export function undoNoticeSvg(W: number, title: string): WaitingDrawing {
  const room = Math.max(60, W - GUTTER * 2)
  const ls = wrapText('Removed from the plan: ' + title + '. Press the arrow beside this to put it back.', 12, room, LINE_CAP)
  const H = 12 + ls.length * SMALL + 6
  return { svg: doc(W, H, `<rect class="tile" x="0" y="0" width="${n(W)}" height="${H}"/>` + ls.map((l, i) => text(GUTTER, 18 + i * SMALL, l, 's', 12)).join('')), height: H }
}

/** The card's bottom edge. */
export function waitingCapSvg(W: number): WaitingDrawing {
  const H = RADIUS + 4
  return { svg: doc(W, H, `<rect class="tile" x="0" y="${-RADIUS}" width="${n(W)}" height="${n(2 * RADIUS)}" rx="${RADIUS}"/>`), height: H }
}
