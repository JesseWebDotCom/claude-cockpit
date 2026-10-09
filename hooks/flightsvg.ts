// The drawings of the Flight log card and the Black box card (cockpit 0.5.0): one svg each, in the look of the
// other cards (tile, 11 px muted title, 12 px rows, colours from the theme classes). Pure string builders; tests/cockpit17.test.ts.

import { BLACK_BOX_EMPTY } from './blackbox.ts'
import type { BoxRow } from './blackbox.ts'
import { FONT, doc, fitText, n, textWidth, xml } from './draw.ts'
import { STATUS_HEX, STATUS_WORD, flightDetails } from './flightlog.ts'
import type { FlightEntry } from './flightlog.ts'
import { chip } from './look.ts'

const P = 10
/** COCKPIT-29: two fixed rows for each entry (status and title; then all the details). */
const FLIGHT_PITCH = 46
const BOX_PITCH = 18
const toneClass = (hex: string): string => (hex === '#F85149' ? 'errc' : hex === '#F0A500' ? 'warnc' : hex === '#3FB950' ? 'okc' : 'm')

export const flightHeight = (rows: number): number => 28 + Math.max(1, rows) * FLIGHT_PITCH + 4
export { FLIGHT_PITCH }
export const blackBoxHeight = (rows: number): number => 28 + Math.max(1, rows) * BOX_PITCH + 4

/** The Flight log: two rows per entry. Row 1: a status chip (DONE green, ERRORED red, BLOCKED amber, UNKNOWN grey) and the title. Row 2: all the details, cut with an ellipsis to one line. */
export function flightSvg(W: number, entries: readonly FlightEntry[], summary: string, nowMs: number = Date.now()): string {
  const H = flightHeight(entries.length)
  const rows =
    entries.length === 0
      ? `<text class="m" x="${P}" y="46" font-family="${FONT}" font-size="12">no reports yet</text>`
      : entries
          .map((e, i) => {
            const y = 28 + i * FLIGHT_PITCH
            const c = chip(P, y + 1, STATUS_WORD[e.status], STATUS_HEX[e.status])
            const x = P + 76
            const name = fitText(e.name, 13, W - P - x)
            const detailText = flightDetails(e, nowMs)
            const detail = detailText === '' ? '' : fitText(detailText, 13, W - P * 2)
            return `${c.svg}<text class="t" x="${n(x)}" y="${y + 15}" font-family="${FONT}" font-size="13" font-weight="600">${xml(name)}</text>${detail === '' ? '' : `<text class="s" x="${P}" y="${y + 35}" font-family="${FONT}" font-size="13">${xml(detail)}</text>`}`
          })
          .join('')
  const head = `<text class="s" x="${P}" y="17" font-family="${FONT}" font-size="11" font-weight="600">Flight log</text>${summary === '' ? '' : `<text class="m" x="${n(W - P)}" y="17" text-anchor="end" font-family="${FONT}" font-size="11">${xml(fitText(summary, 11, W - 100))}</text>`}`
  return doc(W, H, `<rect class="tile" x="0" y="0" width="${n(W)}" height="${n(H)}" rx="8"/>${head}${rows}`)
}

/** The Black box: a time, a short label (coloured; red for a problem), who, and the event, newest first. */
export function blackBoxSvg(W: number, rows: readonly BoxRow[], summary: string): string {
  const H = blackBoxHeight(rows.length)
  const body =
    rows.length === 0
      ? `<text class="m" x="${P}" y="46" font-family="${FONT}" font-size="12">${xml(BLACK_BOX_EMPTY)}</text>`
      : rows
          .map((r, i) => {
            const y = 30 + i * BOX_PITCH
            const cls = r.isProblem ? 'errc' : r.kind === 'consult' ? 'warnc' : r.kind === 'edit' || r.kind === 'done' ? 'okc' : r.kind === 'prompt' ? 't' : 'infoc'
            const timeW = 62
            const labelX = P + timeW
            const whoX = labelX + 62
            const who = fitText(r.who, 12, 84)
            const textX = whoX + Math.ceil(textWidth(who, 12)) + 8
            return `<text class="m" x="${P}" y="${y}" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${xml(r.time)}</text><text class="${cls}" x="${labelX}" y="${y}" font-family="${FONT}" font-size="11" font-weight="600">${xml(r.label)}</text><text class="s" x="${whoX}" y="${y}" font-family="${FONT}" font-size="12">${xml(who)}</text><text class="${r.isProblem ? 'errc' : 't'}" x="${n(textX)}" y="${y}" font-family="${FONT}" font-size="12">${xml(fitText(r.text, 12, W - P - textX))}</text>`
          })
          .join('')
  const head = `<text class="s" x="${P}" y="17" font-family="${FONT}" font-size="11" font-weight="600">Black box</text>${summary === '' ? '' : `<text class="m" x="${n(W - P)}" y="17" text-anchor="end" font-family="${FONT}" font-size="11">${xml(summary)}</text>`}`
  return doc(W, H, `<rect class="tile" x="0" y="0" width="${n(W)}" height="${n(H)}" rx="8"/>${head}${body}`)
}

export { toneClass }
