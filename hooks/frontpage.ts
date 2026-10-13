// The pane's front page in the look of the plan page (the Artifact): a big title with the progress bar, four count tiles, then the System, Waiting on you and
// Off plan cards, each a separate bordered card. Pure: every function returns an svg string and its height. Colours come from the theme classes (tokens.ts).

import { doc, n, textWidth, wrapText } from './draw.ts'
import { GAP, GUTTER } from './tokens.ts'
import { ownerLabel } from './planbar.ts'
import { mono, text } from './plancard.ts'
import { systemHeight, systemInner } from './cards.ts'
import type { SystemCardIn } from './cards.ts'
import { glyphFragment } from './glyphs.ts'
import type { GlyphKind } from './glyphs.ts'

export type Drawing = { svg: string; height: number }

const R = 10
const card = (W: number, H: number, x = 0): string => `<rect class="tile" x="${n(x + 0.5)}" y="0.5" width="${n(W - 1)}" height="${n(H - 1)}" rx="${R}"/><rect class="ln" fill="none" stroke-width="1" x="${n(x + 0.5)}" y="0.5" width="${n(W - 1)}" height="${n(H - 1)}" rx="${R}"/>`

/** How a block sits in a stack: `rt`/`rb` are its top and bottom corner radii (0 where it joins its neighbour), `first` draws its top edge (a joined row leaves that to the one above). */
export type Shell = { rt: number; rb: number; first: boolean }
/** Right-hand room kept clear on cards that carry an overlaid button (the +/- or copy), set by the pane before it draws them. */
let reserve = 0
export const setReserve = (px: number): void => { reserve = px > 0 ? px + 10 : px }
export const ALONE: Shell = { rt: R, rb: R, first: true }
const shell = (W: number, H: number, s: Shell, tint = ''): string => {
  const x0 = 0.5
  const x1 = W - 0.5
  const y0 = s.first ? 0.5 : -1
  const y1 = H - 0.5
  const path = (x0: number, x1: number, y0: number, y1: number): string => `M${x0} ${y0 + s.rt} A${s.rt} ${s.rt} 0 0 1 ${x0 + s.rt} ${y0} L${n(x1 - s.rt)} ${y0} A${s.rt} ${s.rt} 0 0 1 ${n(x1)} ${y0 + s.rt} L${n(x1)} ${n(y1 - s.rb)} A${s.rb} ${s.rb} 0 0 1 ${n(x1 - s.rb)} ${n(y1)} L${x0 + s.rb} ${n(y1)} A${s.rb} ${s.rb} 0 0 1 ${x0} ${n(y1 - s.rb)} Z`
  const d = path(x0, x1, y0, y1)
  const dr = path(1, W - 1, 1, H - 1)
  const fillCls = tint === 'runf' ? 'runc' : tint === 'okf' ? 'okc' : tint === 'warnf' ? 'warnc' : tint
  return `<path class="tile" d="${d}"/>${tint !== '' ? `<path class="${fillCls}" fill-opacity=".14" d="${d}"/>` : ''}<path class="ln" fill="none" stroke-width="1" d="${d}"/>${tint === 'runc' ? `<path class="runs" fill="none" stroke-opacity=".4" stroke-width="2" d="${dr}"/><path class="runs chs" fill="none" stroke-width="2" pathLength="100" d="${dr}"/>` : tint === 'warnc' ? `<path class="warns bp" fill="none" stroke-width="2" d="${dr}"/>` : ''}`
}
const MONO_W = 6.6
/** A state pill: a tinted capsule with the state word in caps (todo is a plain grey one). */
const pill = (x: number, y: number, label: string, cls: string): { svg: string; w: number } => {
  const dot = cls === 'runc'
  const w = Math.ceil(label.length * MONO_W) + 14 + (dot ? 11 : 0)
  const grey = cls === 'm'
  return { w, svg: `<rect class="${grey ? 'k' : cls}" x="${x}" y="${y - 12}" width="${w}" height="16" rx="8"${grey ? '' : ' fill-opacity=".18"'}/>` + (dot ? `<circle class="runc pls" cx="${x + 10}" cy="${y - 4}" r="3"/>` : '') + mono(x + 7 + (dot ? 11 : 0), y, label.toUpperCase(), cls, 11, ' letter-spacing=".3"') }
}

/** The plan page's owner chip: a tinted capsule with a small glyph and the model word, and the subagent arrow in front of a Claude worker that is not this session. */
const chip = (x: number, y: number, owner: string): { svg: string; w: number } => {
  const o = owner.trim().toLowerCase()
  const { cls, label } = ownerLabel(owner)
  const sub = (cls === 'claude' || cls === 'opus') && o !== 'coordinator'
  const glyph = cls === 'you' ? 'p' : cls === 'codex' ? 'c' : cls === 'local' ? 'u' : cls === 'engine' ? 'g' : 's'
  const w = Math.ceil(label.length * MONO_W) + 26
  const fillCls = cls === 'claude' ? 'runc' : cls === 'you' ? 'stuckc' : 'cb-' + cls
  const inkCls = cls === 'claude' ? 'runc' : cls === 'you' ? 'stuckc' : 'cf-' + cls
  const inkStroke = cls === 'claude' ? 'runs' : cls === 'you' ? 'stucks' : 'cs-' + cls
  const gx = (sub ? 14 : 0) + x
  const cy = y - 4
  let g = ''
  const gl = gx + 7
  if (glyph === 'p') g = `<circle class="${inkCls}" cx="${gl + 2}" cy="${cy - 2}" r="1.8"/><path class="${inkCls}" d="M${gl - 1} ${cy + 4.5}c.3-2.6 1.7-3.4 3-3.4s2.700.8 3 3.400z"/>`
  else if (glyph === 'c') g = `<path class="${inkStroke}" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M${gl + 1} ${cy - 3}l-3 3 3 3M${gl + 5} ${cy - 3}l3 3-3 3"/>`
  else if (glyph === 'u') g = `<rect class="${inkStroke}" fill="none" stroke-width="1.2" x="${gl}" y="${cy - 3.5}" width="7" height="7" rx="1.2"/>`
  else if (glyph === 'g') g = `<circle class="${inkStroke}" fill="none" stroke-width="1.4" cx="${gl + 3.5}" cy="${cy}" r="2.4"/>`
  else g = `<path class="${inkCls}" d="M${gl + 3.5} ${cy - 5}l1.100 3.200 3.200 1.100-3.200 1.100-1.100 3.200-1.100-3.200-3.200-1.100 3.200-1.100z"/>`
  const arrow = sub ? `<path class="ms" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M${x + 1} ${cy - 5}v5a3 3 0 0 0 3 3h6M${x + 7} ${cy + 1}l3 2-3 2"/>` : ''
  const rect = `<rect class="${fillCls}"${cls === 'claude' || cls === 'you' ? ' fill-opacity=".18"' : ''} x="${gx}" y="${y - 12}" width="${w}" height="16" rx="6"/>`
  const word = mono(gx + 19, y, label, inkCls, 11)
  return { w: w + (sub ? 14 : 0), svg: arrow + rect + g + word }
}


/** The progress bar of the plan page: green done, blue running (flowing), amber needs you, over a grey track. Each layer runs from the left so the ends stay round. */
function segBar(x: number, y: number, w: number, h: number, planned: number, done: number, running: number, needs: number): string {
  const r = h / 2
  const px = (c: number): number => (planned > 0 ? Math.min(w, (w * Math.max(0, c)) / planned) : 0)
  const d = Math.min(done, planned)
  const ru = Math.min(running, planned - d)
  const ne = Math.min(needs, planned - d - ru)
  const parts = [`<rect class="k" x="${n(x)}" y="${y}" width="${n(w)}" height="${h}" rx="${r}"/>`]
  const layer = (cls: string, c: number): void => { if (c > 0) parts.push(`<rect class="${cls}" x="${n(x)}" y="${y}" width="${n(Math.max(h, px(c)))}" height="${h}" rx="${r}"/>`) }
  layer('warnc', d + ru + ne)
  layer('runc', d + ru)
  layer('okc', d)
  if (ru > 0) {
    const bx = x + px(d)
    const bw = Math.max(4, px(d + ru) - px(d))
    const id = 'fl' + Math.round(bx) + 'y' + Math.round(y) + 'w' + Math.round(bw)
    let stripes = ''
    for (let sx = -14; sx < bw + 14; sx += 14) stripes += `<path class="runc" fill-opacity=".55" d="M${n(bx + sx + 8)} ${y}h6l-4 ${h}h-6z"/>`
    parts.push(`<clipPath id="${id}"><rect x="${n(bx)}" y="${y}" width="${n(bw)}" height="${h}"/></clipPath><g clip-path="url(#${id})"><g class="flw">${stripes}</g></g>`)
  }
  return parts.join('')
}

/** The goal card: small caps eyebrow, the big title, the bar, "133 of 147 steps done · 14 to go" and the milestone count. */
export function titleCardSvg(W: number, o: { title: string; done: number; planned: number; milestones: number; synced: string; running?: number; needs?: number; joined?: boolean }): Drawing {
  const inner = W - GUTTER * 2
  const lines = wrapText(o.title, 18, inner, 3)
  const bar = 8
  const H = GUTTER + 12 + 8 + lines.length * 24 + 8 + bar + 12 + 14 + GUTTER
  let y = GUTTER + 10
  const parts: string[] = [shell(W, H, { rt: R, rb: o.joined === true ? 0 : R, first: true })]
  parts.push(mono(GUTTER, y, 'GOAL', 's', 11, ' letter-spacing="1"'))
  if (o.synced !== '') parts.push(mono(W - GUTTER, y, o.synced, 'm', 11, ' text-anchor="end"'))
  y += 8
  lines.forEach((l, i) => parts.push(text(GUTTER, y + 18 + i * 24, l, 't', 18, ' font-weight="700"')))
  y += 8 + lines.length * 24
  parts.push(segBar(GUTTER, y, inner, bar, o.planned, o.done, o.running ?? 0, o.needs ?? 0))
  y += bar + 18
  parts.push(mono(GUTTER, y, o.done + ' of ' + o.planned + ' steps done · ' + (o.planned - o.done) + ' to go', 's', 11))
  parts.push(mono(W - GUTTER, y, o.milestones + ' milestones', 's', 11, ' text-anchor="end"'))
  return { svg: doc(W, H, parts.join('')), height: H }
}

const tileCard = (W: number, H: number, x: number, ty: number): string => `<rect class="tile" x="${n(x + 0.5)}" y="${ty + 0.5}" width="${n(W - 1)}" height="${n(H - 1 - ty)}" rx="${R}"/><rect class="ln" fill="none" stroke-width="1" x="${n(x + 0.5)}" y="${ty + 0.5}" width="${n(W - 1)}" height="${n(H - 1 - ty)}" rx="${R}"/>`

/** Four count tiles in a row: a big number over a caps label. */
export function tilesSvg(W: number, tiles: readonly { n: number; label: string; cls: string; shade?: boolean }[], joined = false): Drawing {
  const H = 62
  const gap = GAP
  const ty = joined ? -R : 0
  if (joined) {
    // One card with the goal above it: the four tiles are cells of one row, split by 1px dividers; only the outer bottom corners are round.
    const cellPath = (x0: number, x1: number, y0: number, y1: number, bl: number, br: number): string => `M${n(x0)} ${y0} L${n(x1)} ${y0} L${n(x1)} ${n(y1 - br)} A${br} ${br} 0 0 1 ${n(x1 - br)} ${n(y1)} L${n(x0 + bl)} ${n(y1)} A${bl} ${bl} 0 0 1 ${n(x0)} ${n(y1 - bl)} Z`
    const cw = W / tiles.length
    const cells = tiles.map((t, i) => {
      const x0 = i === 0 ? 0.5 : i * cw + 0.5
      const x1 = i === tiles.length - 1 ? W - 0.5 : (i + 1) * cw + 0.5
      const bl = i === 0 ? R : 0
      const br = i === tiles.length - 1 ? R : 0
      const d = cellPath(x0, x1, 0, H - 0.5, bl, br)
      const di = cellPath(x0 + 1, x1 - 1, 1, H - 1.5, Math.max(0, bl - 1), Math.max(0, br - 1))
      const tinted = t.shade === true && t.n > 0
      const tint = tinted ? `<path class="${t.cls}" fill-opacity=".14" d="${d}"/>${t.cls === 'warnc' ? `<path class="warns bp" fill="none" stroke-width="2" d="${di}"/>` : `<path class="runs" fill="none" stroke-opacity=".4" stroke-width="2" d="${di}"/><path class="runs chs" fill="none" stroke-width="2" pathLength="100" d="${di}"/>`}` : ''
      return `<g><path class="tile" d="${d}"/>${tint}<path class="ln" fill="none" stroke-width="1" d="${d}"/>${text(i * cw + 12, 31, String(t.n), t.cls, 18, ' font-weight="600"')}${mono(i * cw + 12, 51, t.label.toUpperCase(), 'm', 11, ' letter-spacing=".8"')}</g>`
    })
    return { svg: doc(W, H, cells.join('')), height: H }
  }
  const tw = (W - gap * (tiles.length - 1)) / tiles.length
  const parts = tiles.map((t, i) => {
    const x = i * (tw + gap)
    return `<g>${tileCard(tw, H, x, ty)}${t.shade === true && t.n > 0 ? `<rect class="${t.cls}" fill-opacity=".14" x="${n(x + 0.5)}" y="${ty + 0.5}" width="${n(tw - 1)}" height="${H - 1 - ty}" rx="${R}"/>${t.cls === 'warnc' ? `<rect class="warns bp" fill="none" stroke-width="2" x="${n(x + 1)}" y="${ty + 1}" width="${n(tw - 2)}" height="${H - 2 - ty}" rx="${R}"/>` : `<rect class="runs" fill="none" stroke-opacity=".4" stroke-width="2" x="${n(x + 1)}" y="${ty + 1}" width="${n(tw - 2)}" height="${H - 2 - ty}" rx="${R}"/><rect class="runs chs" fill="none" stroke-width="2" pathLength="100" x="${n(x + 1)}" y="${ty + 1}" width="${n(tw - 2)}" height="${H - 2 - ty}" rx="${R}"/>`}` : ''}${text(x + 12, 31, String(t.n), t.cls, 18, ' font-weight="600"')}${mono(x + 12, 51, t.label.toUpperCase(), 'm', 11, ' letter-spacing=".8"')}</g>`
  })
  return { svg: doc(W, H, parts.join('')), height: H }
}

/** A titled card with wrapped lines: System, "Waiting on you · 0", "Off plan · 2/2 done". `lead` is a coloured dot class, `right` a small right-aligned note. */
export function noteCardSvg(W: number, o: { title: string; right?: string; lines: readonly { s: string; cls?: string; dot?: string }[]; dim?: boolean; warn?: boolean; pulse?: boolean }): Drawing {
  const inner = W - GUTTER * 2
  const wrapped = o.lines.flatMap(l => wrapText(l.s, 11, inner - (l.dot !== undefined ? 14 : 0), 6).map((t, i) => ({ t, cls: l.cls ?? 's', dot: i === 0 ? l.dot : undefined, indent: l.dot !== undefined })))
  const H = GUTTER + 14 + 8 + wrapped.length * 16 + GUTTER - 2
  const parts: string[] = [card(W, H)]
  if (o.warn === true) parts.push(`<rect class="warnc" x="0" y="0" width="${n(W)}" height="${H}" rx="${R}" fill-opacity=".12"/><rect class="warns${o.pulse === true ? ' bp' : ''}" fill="none" stroke-width="2" x="1" y="1" width="${n(W - 2)}" height="${H - 2}" rx="${R}"/>`)
  parts.push(text(GUTTER, GUTTER + 12, o.title, o.dim === true ? 's' : 't', 13, ' font-weight="600"'))
  if (o.right !== undefined) parts.push(mono(W - GUTTER, GUTTER + 12, o.right, 'm', 11, ' text-anchor="end"'))
  wrapped.forEach((l, i) => {
    const y = GUTTER + 14 + 8 + 12 + i * 16
    if (l.dot !== undefined) parts.push(`<circle class="${l.dot}" cx="${GUTTER + 4}" cy="${n(y - 4)}" r="3.5"/>`)
    parts.push(text(GUTTER + (l.indent ? 14 : 0), y, l.t, l.cls, 11))
  })
  return { svg: doc(W, H, parts.join('')), height: H }
}


/** A section header as a card: the name in bold, the count at the right in the section's colour. */
export function headCardSvg(W: number, o: { label: string; count: number | string; cls: string; shell: Shell; plain?: boolean; icons?: readonly { kind: GlyphKind; hex: string }[]; iconsRight?: boolean; figures?: readonly { kind: GlyphKind; hex: string; pct: string }[] }): Drawing {
  const H = 34
  const cls = o.count === 0 || o.count === '0' ? 'm' : o.cls
  const parts = [shell(W, H, o.shell, o.plain !== true && (o.cls === 'runc' || o.cls === 'warnc') && cls === o.cls ? o.cls : ''), text(GUTTER, 22, o.label, 't', 13, ' font-weight="600"')]
  if (o.figures !== undefined && o.figures.length > 0) {
    let x = W - GUTTER - reserve
    for (let i = o.figures.length - 1; i >= 0; i--) {
      const f = o.figures[i]
      parts.push(mono(x, 22, f.pct, '', 11, ` text-anchor="end" font-weight="600" fill="${f.hex}"`))
      x -= f.pct.length * MONO_W + 4 + 16
      parts.push(glyphFragment(f.kind, f.hex, x, 9, 16))
      x -= 12
    }
    return { svg: doc(W, H, parts.join('')), height: H }
  }
  const labelEnd = GUTTER + Math.ceil(textWidth(o.label, 13)) + 12
  const iw = o.icons === undefined ? 0 : o.icons.length * 20
  if (o.iconsRight === true && o.icons !== undefined) {
    const left = W - GUTTER - reserve - iw + 4
    const cw = String(o.count).length * MONO_W
    if (labelEnd + cw + 12 <= left) parts.push(mono(left - 8, 22, String(o.count), cls, 11, ' text-anchor="end" font-weight="600"'))
    o.icons.forEach((ic, i) => parts.push(glyphFragment(ic.kind, ic.hex, left + i * 20, 9, 16)))
    return { svg: doc(W, H, parts.join('')), height: H }
  }
  const iconsEnd = o.icons === undefined ? 0 : labelEnd + iw
  if (iconsEnd === 0 || iconsEnd + String(o.count).length * MONO_W + 12 <= W - GUTTER - reserve) parts.push(mono(W - GUTTER - reserve, 22, String(o.count), cls, 11, ' text-anchor="end" font-weight="600"'))
  if (o.icons !== undefined) o.icons.forEach((ic, i) => parts.push(glyphFragment(ic.kind, ic.hex, labelEnd + i * 20, 9, 16)))
  return { svg: doc(W, H, parts.join('')), height: H }
}

/** A small-caps section label with no card (the page's "MILESTONES"). */
export function eyebrowSvg(W: number, label: string, right = ''): Drawing {
  const H = 22
  const parts = [mono(2, 15, label.toUpperCase(), 's', 11, ' letter-spacing="1" font-weight="600"')]
  if (right !== '') parts.push(mono(W - 2, 15, right, 'm', 11, ' text-anchor="end"'))
  return { svg: doc(W, H, parts.join('')), height: H }
}

/** A milestone card: title and done/total, then a progress bar (green done, blue running). */
export function mileCardSvg(W: number, o: { title: string; done: number; total: number; running: number; needs?: number; shell: Shell }): Drawing {
  const inner = W - GUTTER * 2
  const count = o.done + '/' + o.total
  const lines = wrapText(o.title, 13, inner - reserve - count.length * MONO_W - 12, 3)
  const H = 12 + lines.length * 17 + 8 + 6 + 12
  const parts = [shell(W, H, o.shell, o.done === o.total && o.total > 0 ? 'okf' : '')]
  lines.forEach((l, i) => parts.push(text(GUTTER, 12 + 13 + i * 17 - 2, l, 't', 13, ' font-weight="600"')))
  parts.push(mono(W - GUTTER - reserve, 12 + 11, count, o.done === o.total && o.total > 0 ? 'okc' : 's', 11, ' text-anchor="end"'))
  const y = 12 + lines.length * 17 + 6
  parts.push(segBar(GUTTER, y, inner, 6, o.total, o.done, o.running, o.needs ?? 0))
  return { svg: doc(W, H, parts.join('')), height: H }
}

/** One step row: the title (wrapped), then a line with the state pill, the id and the timer; opened, the note under it. */
export function stepRowSvg(W: number, o: { title: string; id: string; note: string; label: string; cls: string; time: string; open: boolean; dim: boolean; shell: Shell; owner?: string }): Drawing {
  const inner = W - GUTTER * 2
  const lines = wrapText(o.title, 13, inner - reserve, o.open ? 40 : 2)
  const notes = o.open && o.note !== '' ? wrapText(o.note, 11, inner, 40) : []
  const H = 9 + lines.length * 17 + 6 + 18 + (notes.length > 0 ? 4 + notes.length * 15 : 0) + 8
  const parts = [shell(W, H, o.shell, o.cls === 'runc' ? 'runf' : o.cls === 'okc' ? 'okf' : o.cls === 'warnc' ? 'warnf' : '')]
  lines.forEach((l, i) => parts.push(text(GUTTER, 9 + 13 + i * 17 - 2, l, o.dim ? 's' : 't', 13)))
  const y = 9 + lines.length * 17 + 6 + 13
  const p = pill(GUTTER, y, o.label, o.cls)
  parts.push(p.svg)
  let cx = GUTTER + p.w + 8
  // The pill already says "you" for a step on Jesse, so a second "You" chip would only repeat it.
  const onYouPill = /^(you|needs you|waiting: you)$/i.test(o.label) && /^(jesse|you|owner)$/i.test(o.owner ?? '')
  if (o.owner !== undefined && o.owner !== '' && !onYouPill) {
    const c = chip(cx, y, o.owner)
    if (cx + c.w <= W - GUTTER) { parts.push(c.svg); cx += c.w + 8 }
  }
  const idRoom = inner - (cx - GUTTER) - (o.time !== '' ? o.time.length * MONO_W + 8 : 0)
  if (o.id !== '' && idRoom >= MONO_W * 5) parts.push(mono(cx, y, o.id.length * MONO_W > idRoom ? o.id.slice(0, Math.max(4, Math.floor(idRoom / MONO_W) - 1)) + '\u2026' : o.id, 'm', 11))
  if (o.time !== '') parts.push(mono(W - GUTTER, y, o.time, 's', 11, ' text-anchor="end"'))
  notes.forEach((l, i) => parts.push(text(GUTTER, y + 8 + 14 + i * 15 - 4, l, 's', 11)))
  return { svg: doc(W, H, parts.join('')), height: H }
}

/** A short joined line at the foot of a list ("+5 more", "showing all 9"). */
export function moreRowSvg(W: number, s: string, sh: Shell): Drawing {
  const H = 28
  return { svg: doc(W, H, shell(W, H, sh) + text(GUTTER, 18, s, 's', 11)), height: H }
}

/** The System card's open body: the old mod's gauges (label, bar, note), the top memory processes and the gate hint, joined under the header. */
export function systemBodySvg(W: number, c: SystemCardIn, sh: Shell): Drawing {
  const H = systemHeight(c)
  return { svg: doc(W, H, shell(W, H, sh) + systemInner(W, c)), height: H }
}
