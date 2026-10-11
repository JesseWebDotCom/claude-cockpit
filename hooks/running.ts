// COCKPIT-68: running work in the Agents card. "Running commands" are the plan items whose state is running (owner and note shown, wrapped, never
// cut), whether or not they are on the plan; and the "Local model" line: is the local model server up on its port, and which model alias it serves.
// Pure parsing and drawing; the probe itself (a curl with a short timeout, never awaited by the render) is in register.tsx.

import { FONT, doc, n, wrapText, xml } from './draw.ts'
import { plainNote, plainTitle } from './plan.ts'
import type { PlanRow } from './plan.ts'
import { GUTTER } from './tokens.ts'

export const LOCAL_MODEL_PORT = 54800
export const LOCAL_MODEL_EVERY_MS = 15000
export const LOCAL_MODEL_TIMEOUT_S = 2

export type LocalModel = { checked: boolean; up: boolean; alias: string }
export const LOCAL_MODEL_UNKNOWN: LocalModel = { checked: false, up: false, alias: '' }

/** Reads /health (any 2xx body counts as up; the caller passes ok) and /v1/models (the first model id is the alias). */
export function parseLocalModel(healthOk: boolean, modelsBody: string): LocalModel {
  if (!healthOk) return { checked: true, up: false, alias: '' }
  let alias = ''
  try {
    const j = JSON.parse(modelsBody) as { data?: { id?: unknown }[]; models?: { id?: unknown; name?: unknown }[] }
    const first = (j.data ?? j.models ?? [])[0] as { id?: unknown; name?: unknown } | undefined
    const v = first?.id ?? first?.name
    if (typeof v === 'string') alias = v
  } catch {
    alias = ''
  }
  return { checked: true, up: true, alias }
}

export function localModelLine(m: LocalModel): { text: string; tone: 'ok' | 'err' | 'dim' } {
  if (!m.checked) return { text: 'Local model: checking', tone: 'dim' }
  if (!m.up) return { text: 'Local model: down (port ' + LOCAL_MODEL_PORT + ' does not answer; start the local model server)', tone: 'err' }
  return { text: 'Local model: up on port ' + LOCAL_MODEL_PORT + (m.alias !== '' ? ', serving ' + m.alias : ', model not named'), tone: 'ok' }
}

export type RunningItem = { id: string; title: string; owner: string; note: string; offPlan: boolean }

/** Every running item (planned first, then the off-plan ones), with who runs it and the note in full. */
export function runningItems(running: readonly PlanRow[], off: readonly PlanRow[]): RunningItem[] {
  const seen = new Set<string>()
  const out: RunningItem[] = []
  for (const r of [...running, ...off.filter(o => o.state === 'running')]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push({ id: r.id, title: plainTitle(r), owner: r.owner, note: plainNote(r), offPlan: !r.planned })
  }
  return out
}

const text = (x: number, y: number, s: string, cls: string, size: number, extra = ''): string =>
  `<text class="${cls}" x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${size}"${extra}>${xml(s)}</text>`

const LINE_CAP = 30

/** One running command: the plain title, then "id, owner" small, then the note wrapped. Drawn on the card's tile with a hairline above. */
export function runningRowSvg(W: number, r: RunningItem): { svg: string; height: number } {
  const room = W - GUTTER * 2
  const t = wrapText(r.title, 13, room, LINE_CAP)
  const meta = r.id + (r.owner !== '' ? ', run by ' + r.owner : '') + (r.offPlan ? ', not on the plan' : '')
  const note = r.note !== '' ? wrapText(r.note, 12, room, LINE_CAP) : []
  let y = 21
  let body = ''
  for (const l of t) { body += text(GUTTER, y, l, 't', 13, ' font-weight="600"'); y += 17 }
  body += text(GUTTER, y - 2, meta, 'm', 11); y += 14
  for (const l of note) { body += text(GUTTER, y - 2, l, 'm', 12); y += 15 }
  const H = y + 6 - 2
  return { svg: doc(W, H, `<rect class="tile" x="0" y="0" width="${n(W)}" height="${H}"/><line class="ln" x1="${GUTTER}" y1="0.5" x2="${n(W - GUTTER)}" y2="0.5"/>${body}`), height: H }
}

/** The Local model line, one wrapped line on the card's tile. */
export function localModelSvg(W: number, m: LocalModel): { svg: string; height: number } {
  const l = localModelLine(m)
  const lines = wrapText(l.text, 12, W - GUTTER * 2, LINE_CAP)
  const H = 12 + lines.length * 16 + 6
  const cls = l.tone === 'ok' ? 'okc' : l.tone === 'err' ? 'errc' : 'm'
  const body = lines.map((s, i) => text(GUTTER, 21 + i * 16, s, cls, 12)).join('')
  return { svg: doc(W, H, `<rect class="tile" x="0" y="0" width="${n(W)}" height="${H}"/><line class="ln" x1="${GUTTER}" y1="0.5" x2="${n(W - GUTTER)}" y2="0.5"/>${body}`), height: H }
}
