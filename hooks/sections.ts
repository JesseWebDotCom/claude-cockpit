// The section cards of the pane (cockpit 0.6.0, COCKPIT-26): System, Flight log and Black box are one family. Each is a card with a HEADER BAND
// (a 15 px bold title like the Status card's, a one-line summary at the right) and, when it is open, a body drawn flush under it in the same
// tile, so the two read as one rounded card. The chevron is the native Button beside the card (an Svg takes no press), the same column the
// crew rows use. Every other piece of text in the pane that is not a crew row or the button row is a card from here too: a notice (the confirm
// and reply lines, the poll note), a one-line card ("no agents running", "3 more above"). Pure string builders; tests/cockpit26.test.ts.
//
// How a section joins up: the header Svg is `secHeadHeight` tall (4 px of air above the tile, the 34 px tile, 4 px of air under it when closed;
// open, the tile runs on into the body). A body is one or more slices: a slice draws the tile with its corners pushed out of the viewport, so a
// middle slice has straight sides and the LAST slice rounds its bottom and leaves 4 px of air, which with the next header's 4 px makes the 8 px
// gap between cards. Sub-sections of the System body are slices of their own, so the page can scroll between them.

import { breakdownText } from './activity.ts'
import type { StateId } from './activity.ts'
import { FONT, doc, fitText, n, textWidth, wrapText, xml } from './draw.ts'
import { glyphFragment } from './glyphs.ts'
import type { GlyphKind } from './glyphs.ts'
import { chip, servicesHeight, servicesParts } from './look.ts'
import type { ServiceRow } from './services.ts'
import type { HealthIcon } from './system.ts'
import { GUTTER, RADIUS } from './tokens.ts'

export const SEC_TOP = 4
export const SEC_HEAD_TILE = 34
export const SEC_END = 4

/** The header Svg's height: closed, it carries the air under the tile; open, the body takes over from the tile's bottom edge. */
export const secHeadHeight = (isOpen: boolean): number => SEC_TOP + SEC_HEAD_TILE + (isOpen ? 0 : SEC_END)

export type SecTone = '' | 'ok' | 'warn' | 'err'
/**
 * `icons` (COCKPIT-28): health icons drawn in the summary slot, right-aligned, in place of the summary text while the card is closed; `accent` is a hex
 * colour for a thin bar at the header's left edge (the System card paints the worst health level there, so the whole header carries it).
 */
export type SecHeadIn = { title: string; summary: string; isOpen: boolean; tone?: SecTone; icons?: readonly HealthIcon[]; accent?: string; parts?: readonly SecPart[] }
/** COCKPIT-46: a summary made of parts, each coloured by its own tone (the System card: CPU 12% green, MEM 80% amber). */
export type SecPart = { text: string; tone: SecTone }

const toneCls = (t: SecTone | undefined): string => (t === 'err' ? 'errc' : t === 'warn' ? 'warnc' : t === 'ok' ? 'okc' : 's')

const text = (x: number, y: number, s: string, cls: string, size: number, extra = ''): string =>
  `<text class="${cls}" x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${size}"${extra}>${xml(s)}</text>`

/** The header's icon size and the space between two icons. */
export const HEAD_ICON = 18
export const HEAD_ICON_GAP = 10

/** THE header builder: System, Flight log and Black box all draw theirs here, and nothing else does. */
export function secHeadSvg(W: number, h: SecHeadIn): string {
  const H = secHeadHeight(h.isOpen)
  // Open, the tile is taller than the viewport so its bottom corners are cut off and the body below carries on in the same colour.
  const tileH = SEC_HEAD_TILE + (h.isOpen ? RADIUS : 0)
  const titleW = Math.ceil(textWidth(h.title, 15)) + 2
  const icons = !h.isOpen && h.icons !== undefined && h.icons.length > 0 ? h.icons : []
  const room = Math.max(0, W - GUTTER * 2 - titleW - 12)
  // Parts: drop trailing ones until the line fits, then draw each in its own tone with a muted separator.
  const parts0 = h.parts ?? []
  let shown = parts0.length
  const widthOf = (k: number): number => textWidth(parts0.slice(0, k).map(p => p.text).join(' \u00b7 '), 11)
  while (shown > 0 && widthOf(shown) > room) shown--
  const partsSvg = parts0.length === 0 || icons.length > 0 || shown === 0 ? '' : `<text x="${n(W - GUTTER)}" y="${SEC_TOP + 21}" font-family="${FONT}" font-size="11" text-anchor="end" font-variant-numeric="tabular-nums">${parts0.slice(0, shown).map((p, i) => (i > 0 ? '<tspan class="m"> \u00b7 </tspan>' : '') + `<tspan class="${toneCls(p.tone)}">${xml(p.text)}</tspan>`).join('')}</text>`
  const summary = h.summary === '' || icons.length > 0 || partsSvg !== '' ? '' : fitText(h.summary, 11, Math.max(0, W - GUTTER * 2 - titleW - 12))
  // The icons are laid out from the right edge, the last one against the gutter.
  const iconsW = icons.length * HEAD_ICON + Math.max(0, icons.length - 1) * HEAD_ICON_GAP
  const iconY = SEC_TOP + (SEC_HEAD_TILE - HEAD_ICON) / 2
  const parts = [
    `<rect class="tile" x="0" y="${SEC_TOP}" width="${n(W)}" height="${tileH}" rx="${RADIUS}"/>`,
    h.accent === undefined ? '' : `<rect x="0" y="${SEC_TOP + 7}" width="3" height="${SEC_HEAD_TILE - 14}" rx="1.5" fill="${h.accent}"/>`,
    text(GUTTER, SEC_TOP + 22, h.title, 't', 15, ' font-weight="700"'),
    partsSvg,
    summary === '' ? '' : text(W - GUTTER, SEC_TOP + 21, summary, toneCls(h.tone), 11, ' text-anchor="end" font-variant-numeric="tabular-nums"'),
    ...icons.map((ic, i) => glyphFragment(ic.kind, ic.hex, W - GUTTER - iconsW + i * (HEAD_ICON + HEAD_ICON_GAP), iconY, HEAD_ICON)),
  ]
  return doc(W, H, parts.join(''))
}

// One slice of an open body: the tile, a hairline at its top, then `inner`.
function slice(W: number, H: number, inner: string, isLast: boolean, phase = 0): string {
  const bottom = isLast ? H - SEC_END : H
  const rect = `<rect class="tile" x="0" y="${-RADIUS}" width="${n(W)}" height="${n(bottom + RADIUS + (isLast ? 0 : RADIUS))}" rx="${RADIUS}"/>`
  const line = `<line class="ln" x1="${GUTTER}" y1="0.5" x2="${n(W - GUTTER)}" y2="0.5"/>`
  return doc(W, H, rect + line + inner, '', phase)
}

// ---------------------------------------------------------------------------
// A sub-section of the System body: a small title, then lines (a dot, the text, a figure at the right) and gauges (a label, a bar, a note).

export type SecLine = { dot?: string; text: string; right?: string; rightCls?: string; cls?: string }
/** A gauge row. With a `kind` the left column is that glyph (coloured `hex`) and the short `figure`; the full `label` is its title. Without one it is the label as text. */
export type SecGauge = { label: string; ratio: number | null; hex: string; note: string; kind?: GlyphKind; figure?: string }

/** The glyph's size in a gauge row, and the room it takes before the figure. */
export const GAUGE_ICON = 16
const GAUGE_ICON_ROOM = GAUGE_ICON + 6
export type SubIn = { title: string; lines?: readonly SecLine[]; gauges?: readonly SecGauge[]; foot?: string; footCls?: string; notes?: readonly string[]; services?: readonly ServiceRow[] }

const SUB_TITLE_H = 28
const LINE_PITCH = 22
const GAUGE_PITCH = 26
const FOOT_H = 22
const NOTE_PITCH = 18
const SUB_PAD = 8

// The wrapped paragraphs of a sub-section (the keys and options), as lines of text, three at most for each.
const noteLines = (W: number, s: SubIn): string[] => (s.notes ?? []).flatMap(t => wrapText(t, 13, Math.max(60, W - GUTTER * 2), 3))

export function subHeight(W: number, s: SubIn, isLast: boolean): number {
  const lines = s.lines ?? []
  const gauges = s.gauges ?? []
  const empty = lines.length === 0 && gauges.length === 0 && (s.services ?? []).length === 0 && (s.foot ?? '') === '' && (s.notes ?? []).length === 0
  return SUB_TITLE_H + gauges.length * GAUGE_PITCH + Math.max(empty ? 1 : 0, lines.length) * LINE_PITCH + noteLines(W, s).length * NOTE_PITCH + ((s.services ?? []).length > 0 ? servicesHeight(W, s.services ?? []) : 0) + ((s.foot ?? '') !== '' ? FOOT_H : 0) + SUB_PAD + (isLast ? SEC_END : 0)
}

export function subSvg(W: number, s: SubIn, isLast: boolean): string {
  const H = subHeight(W, s, isLast)
  const parts: string[] = [text(GUTTER, 19, s.title, 'm', 11, ' font-weight="700"')]
  let y = SUB_TITLE_H
  const inner = Math.max(80, W - GUTTER * 2)
  // The label column is 150 px (or 38% of a narrow pane), wider when a listed host's name needs it ("host-a memory 63% used"), never past 54% of the width.
  const leftOf = (g: SecGauge): string => (g.kind !== undefined ? g.figure ?? '' : g.label)
  const roomOf = (g: SecGauge): number => (g.kind !== undefined ? GAUGE_ICON_ROOM : 0)
  const widest = Math.max(0, ...(s.gauges ?? []).map(g => roomOf(g) + Math.ceil(textWidth(leftOf(g), 13)) + 4))
  const labelW = Math.min(Math.max(Math.min(150, inner * 0.38), widest), inner * 0.54)
  // The note column gives a little room to a long label (never under 130 px, or its own third of a narrow pane) so the bar keeps at least 40 px.
  const noteW = Math.max(Math.min(130, inner * 0.36), Math.min(Math.min(170, inner * 0.36), W - GUTTER - 8 - (GUTTER + labelW + 8) - 40))
  const barX = GUTTER + labelW + 8
  const barW = Math.max(30, W - GUTTER - noteW - 8 - barX)
  for (const g of s.gauges ?? []) {
    const r = g.ratio === null ? 0 : Math.max(0, Math.min(1, g.ratio))
    if (g.kind !== undefined) {
      // The glyph (the same fragment the status bar draws) in the health colour, then the figure; the full label is the glyph's tooltip.
      parts.push(`<g><title>${xml(g.label)}</title>${glyphFragment(g.kind, g.hex, GUTTER, y + 11 - GAUGE_ICON / 2, GAUGE_ICON)}</g>`)
      parts.push(text(GUTTER + GAUGE_ICON_ROOM, y + 14, fitText(g.figure ?? '', 13, labelW - GAUGE_ICON_ROOM), 't', 13))
    } else parts.push(text(GUTTER, y + 14, fitText(g.label, 13, labelW), 't', 13))
    parts.push(`<rect class="k" x="${n(barX)}" y="${y + 8}" width="${n(barW)}" height="6" rx="3"/>`)
    if (g.ratio !== null) parts.push(`<rect x="${n(barX)}" y="${y + 8}" width="${n(Math.max(6, barW * r))}" height="6" rx="3" fill="${g.hex}"/>`)
    if (g.note !== '') parts.push(text(W - GUTTER, y + 14, fitText(g.note, 11, noteW), 's', 11, ' text-anchor="end"'))
    y += GAUGE_PITCH
  }
  const lines = s.lines ?? []
  const notes = noteLines(W, s)
  if (lines.length === 0 && (s.gauges ?? []).length === 0 && (s.services ?? []).length === 0 && (s.foot ?? '') === '' && notes.length === 0) parts.push(text(GUTTER, y + 15, 'nothing', 'm', 13))
  for (const l of lines) {
    const x = GUTTER + (l.dot !== undefined ? 14 : 0)
    const rightW = l.right === undefined ? 0 : Math.ceil(textWidth(l.right, 11)) + 10
    if (l.dot !== undefined) parts.push(`<circle cx="${GUTTER + 4}" cy="${y + 11}" r="4" fill="${l.dot}"/>`)
    parts.push(text(x, y + 15, fitText(l.text, 13, W - x - GUTTER - rightW), l.cls ?? 't', 13))
    if (l.right !== undefined) parts.push(text(W - GUTTER, y + 15, l.right, l.rightCls ?? 's', 11, ' font-weight="600" text-anchor="end"'))
    y += LINE_PITCH
  }
  notes.forEach((l, i) => parts.push(text(GUTTER, y + 13 + i * NOTE_PITCH, l, 's', 13)))
  y += notes.length * NOTE_PITCH
  // COCKPIT-46: the plans and credits (Claude, Cloud, API, Codex, Local), one compact row each; this is the ONLY place they are drawn besides the bar's one-row summary.
  if ((s.services ?? []).length > 0) {
    const p = servicesParts(W, s.services ?? [], y)
    parts.push(p.svg)
    y += p.h
  }
  if ((s.foot ?? '') !== '') parts.push(text(GUTTER, y + 13, fitText(s.foot ?? '', 11, inner), s.footCls ?? 'm', 11))
  return slice(W, H, parts.join(''), isLast)
}

/** An open body slice that holds `innerSvg` (already positioned from y 0) under a small title, for a drawing the section does not own (the cast). */
export function drawingSvg(W: number, title: string, innerSvg: string, innerH: number, isLast: boolean, phase = 0): { svg: string; h: number } {
  const h = SUB_TITLE_H + innerH + SUB_PAD + (isLast ? SEC_END : 0)
  return { svg: slice(W, h, text(GUTTER, 19, title, 'm', 11, ' font-weight="700"') + `<g transform="translate(0,${SUB_TITLE_H})">${innerSvg}</g>`, isLast, phase), h }
}

// ---------------------------------------------------------------------------
// The Flight log body (COCKPIT-29): two fixed rows for each entry. Row 1 is the status chip and the title, nothing else. Row 2 is all the details
// (the short statement, who, when, how long), in one line, cut with an ellipsis; never a third line.

/** `detail` is the whole of row 2 (see flightDetails in flightlog.ts). */
export type FlightRowIn = { name: string; detail: string; word: string; hex: string }
export const FLIGHT_ROWS_PER_ENTRY = 2
export const FLIGHT_PITCH = 46
const FLIGHT_TOP = 8
export const flightBodyHeight = (rows: number): number => FLIGHT_TOP + Math.max(1, rows) * FLIGHT_PITCH + 4 + SEC_END

export function flightBodySvg(W: number, rows: readonly FlightRowIn[]): string {
  const H = flightBodyHeight(rows.length)
  const body =
    rows.length === 0
      ? text(GUTTER, FLIGHT_TOP + 18, 'no reports yet', 'm', 13)
      : rows
          .map((r, i) => {
            const y = FLIGHT_TOP + i * FLIGHT_PITCH
            const c = chip(GUTTER, y + 3, r.word, r.hex)
            const x = GUTTER + 76
            const name = fitText(r.name, 13, W - GUTTER - x)
            const detail = r.detail === '' ? '' : fitText(r.detail, 13, W - GUTTER * 2)
            return `${c.svg}${text(x, y + 17.5, name, 't', 13, ' font-weight="600"')}${detail === '' ? '' : text(GUTTER, y + 37, detail, 's', 13)}`
          })
          .join('')
  return slice(W, H, body, true)
}

// ---------------------------------------------------------------------------
// The Black box body: a time, a short label (coloured; red for a problem), who (when there is room), and the event, newest first.

export type BoxRowIn = { time: string; label: string; who: string; text: string; cls: string; isProblem: boolean }
const BOX_PITCH = 22
const BOX_TOP = 8
export const blackBoxBodyHeight = (rows: number): number => BOX_TOP + Math.max(1, rows) * BOX_PITCH + 4 + SEC_END
/** Under this width the "who" column is left out: the time, the label and the event keep the room. */
export const BOX_WHO_MIN_W = 420

export function blackBoxBodySvg(W: number, rows: readonly BoxRowIn[], empty: string): string {
  const H = blackBoxBodyHeight(rows.length)
  const withWho = W >= BOX_WHO_MIN_W
  const body =
    rows.length === 0
      ? text(GUTTER, BOX_TOP + 16, fitText(empty, 13, W - GUTTER * 2), 'm', 13)
      : rows
          .map((r, i) => {
            const y = BOX_TOP + 15 + i * BOX_PITCH
            const labelX = GUTTER + 62
            const whoX = labelX + 62
            const who = withWho ? fitText(r.who, 13, 84) : ''
            const textX = withWho ? whoX + Math.ceil(textWidth(who, 13)) + 8 : labelX + 62
            return `${text(GUTTER, y, r.time, 'm', 11, ' font-variant-numeric="tabular-nums"')}${text(labelX, y, r.label, r.cls, 11, ' font-weight="600"')}${withWho ? text(whoX, y, who, 's', 13) : ''}${text(textX, y, fitText(r.text, 13, W - GUTTER - textX), r.isProblem ? 'errc' : 't', 13)}`
          })
          .join('')
  return slice(W, H, body, true)
}

// ---------------------------------------------------------------------------
// A notice card (the confirm line, the reply, the poll note) and a one-line card ("no agents running", "3 more above"): the same tile, 4 px of air
// above and under (so 8 px between cards). A notice wraps to three lines at most; a tone paints a thin bar at its left edge like a crew row's.

const NOTICE_LINE = 18
const noticeLines = (W: number, s: string): string[] => wrapText(s, 13, Math.max(60, W - GUTTER * 2 - 6), 3)
export const noticeHeight = (W: number, s: string): number => SEC_TOP + 12 + Math.max(1, noticeLines(W, s).length) * NOTICE_LINE + 6 + SEC_END

export function noticeSvg(W: number, s: string, tone: SecTone = ''): string {
  const lines = noticeLines(W, s)
  const tileH = noticeHeight(W, s) - SEC_TOP - SEC_END
  const bar = tone === '' ? '' : `<rect class="${toneCls(tone)}" x="0" y="${SEC_TOP + 6}" width="3" height="${tileH - 12}" rx="1.5"/>`
  const parts = [`<rect class="tile" x="0" y="${SEC_TOP}" width="${n(W)}" height="${tileH}" rx="${RADIUS}"/>`, bar, ...lines.map((l, i) => text(GUTTER + 2, SEC_TOP + 12 + 13 + i * NOTICE_LINE, l, tone === '' ? 't' : toneCls(tone), 13))]
  return doc(W, noticeHeight(W, s), parts.join(''))
}

export const LINE_CARD_TILE = 30
export const lineCardHeight = (): number => SEC_TOP + LINE_CARD_TILE + SEC_END

export function lineCardSvg(W: number, s: string, cls = 's'): string {
  return doc(W, lineCardHeight(), `<rect class="tile" x="0" y="${SEC_TOP}" width="${n(W)}" height="${LINE_CARD_TILE}" rx="${RADIUS}"/>${text(GUTTER, SEC_TOP + 20, fitText(s, 13, W - GUTTER * 2), cls, 13)}`)
}

// ---------------------------------------------------------------------------
// COCKPIT-30: the Agents card. Its header is the family's (secHeadSvg, title "Agents"); its body is the Session's row, the subagents and the crew rows,
// each drawn on the card's own straight-sided tile (look.ts rowSvg with `inCard`), then this cap, which rounds the bottom and leaves the 4 px of air.

/** A one-line row inside the Agents card ("no agents running", "collapse the sleeping"): the card's tile with a hairline above and the text. */
export const CREW_LINE_H = 32
export function crewLineSvg(W: number, s: string, cls = 's'): string {
  return doc(W, CREW_LINE_H, `<rect class="tile" x="0" y="0" width="${n(W)}" height="${CREW_LINE_H}"/><line class="ln" x1="${GUTTER}" y1="0.5" x2="${n(W - GUTTER)}" y2="0.5"/>${text(GUTTER, 21, fitText(s, 13, W - GUTTER * 2), cls, 13)}`)
}

/** The card's bottom: the tile ends in rounded corners, then SEC_END of air. */
export const CREW_CAP_H = RADIUS + SEC_END
export function crewCapSvg(W: number): string {
  return doc(W, CREW_CAP_H, `<rect class="tile" x="0" y="${-RADIUS}" width="${n(W)}" height="${n(2 * RADIUS)}" rx="${RADIUS}"/>`)
}

export type CrewCount = { /** The awake lanes by specific state (activity.ts); when given it replaces the generic active count. */ states?: Readonly<Partial<Record<StateId, number>>>; working: number; idle: number; sleeping: number; blocked: number; errored: number; outages?: readonly { phrase: string; n: number }[] }
/** The Agents header's summary and tone: "2 editing, 1 idle, 3 sleeping" (zero counts left out), with the trouble first when there is any. */
export function crewSummary(c: CrewCount): { text: string; tone: SecTone } {
  const bits = [...(c.outages ?? []).map(o => o.n + ' ' + o.phrase), c.errored > 0 ? c.errored + ' errored' : '', c.blocked > 0 ? c.blocked + ' blocked' : '', c.working > 0 ? (c.states !== undefined && breakdownText(c.states) !== '' ? breakdownText(c.states) : c.working + ' active') : '', c.idle > 0 ? c.idle + ' idle' : '', c.sleeping > 0 ? c.sleeping + ' sleeping' : ''].filter(b => b !== '')
  return { text: bits.length === 0 ? 'no agents running' : bits.join(', '), tone: c.errored > 0 || (c.outages ?? []).length > 0 ? 'err' : c.blocked > 0 ? 'warn' : c.working > 0 ? 'ok' : '' }
}
