// PLANPAGE-BAR-01: the band's look follows the plan page (assets/plan-page.tpl.html): small uppercase labels, status counts
// "RUNNING n  NEEDS YOU n  TO DO n  DONE n" (running blue, needs you orange, to do grey, done green), owner chips (Claude, Codex, Local, You)
// and a one-line "5H n% · WEEK n%" summary of the plan limits. Pure: no mods API, no I/O. Same data sources as before (the plan view, the
// usage windows); only the presentation is new. Unit tested in tests/planbar.test.ts.

import type { PlanView } from './plan.ts'

/** The colour names the band's Text accepts (the page's blue, orange, green, grey). */
export type BandColor = 'blue' | 'yellow' | 'green' | 'gray' | 'magenta' | 'cyan' | 'red'

export type Seg = { key: string; text: string; color: BandColor }

/** The four counts, in the page's order and words. */
export function statusSegs(v: PlanView): Seg[] {
  return [
    { key: 'run', text: 'RUNNING ' + v.running.length, color: 'blue' },
    { key: 'you', text: 'NEEDS YOU ' + v.you, color: 'yellow' },
    { key: 'todo', text: 'TO DO ' + v.todo.length, color: 'gray' },
    { key: 'done', text: 'DONE ' + v.doneN, color: 'green' },
  ]
}

/** Width in terminal columns of the counts when drawn with two spaces between them. */
export const segsCols = (segs: readonly Seg[]): number => segs.reduce((a, s) => a + s.text.length, 0) + Math.max(0, segs.length - 1) * 2

export type OwnerKind = 'you' | 'codex' | 'local' | 'engine' | 'opus' | 'claude'

/** The page's owner mapping (kind() in the template): jesse is You, codex* Codex, reika or pi-* Local, engine, opus or fable, any other Claude agent. */
export function ownerKind(owner: string): OwnerKind {
  const o = owner.trim().toLowerCase()
  if (o === 'jesse' || o === 'you' || o === 'owner') return 'you'
  if (/^codex/.test(o)) return 'codex'
  if (/reika|pi-/.test(o)) return 'local'
  if (o === 'engine') return 'engine'
  if (/opus|fable/.test(o)) return 'opus'
  return 'claude'
}

const CHIP: Record<OwnerKind, { label: string; color: BandColor }> = {
  claude: { label: 'CLAUDE', color: 'blue' },
  codex: { label: 'CODEX', color: 'magenta' },
  local: { label: 'LOCAL', color: 'cyan' },
  engine: { label: 'ENGINE', color: 'yellow' },
  opus: { label: 'OPUS', color: 'magenta' },
  you: { label: 'YOU', color: 'yellow' },
}
const CHIP_ORDER: OwnerKind[] = ['claude', 'opus', 'codex', 'local', 'engine', 'you']

/** One chip per owner kind that has running work, with how many: `CLAUDE 2`. Empty when nothing runs. */
export function ownerChips(v: PlanView): Seg[] {
  const n = new Map<OwnerKind, number>()
  for (const r of v.running) {
    const k = ownerKind(r.owner)
    n.set(k, (n.get(k) ?? 0) + 1)
  }
  return CHIP_ORDER.filter(k => n.has(k)).map(k => ({ key: 'chip-' + k, text: CHIP[k].label + ' ' + n.get(k), color: CHIP[k].color }))
}

/** `5H 0% · WEEK 20%` from the used percentages (null = not readable, drawn n/a). */
export function limitsLine(fiveUsed: number | null, weekUsed: number | null): string {
  const p = (u: number | null): string => (u === null || !Number.isFinite(u) ? 'n/a' : Math.round(u) + '%')
  return '5H ' + p(fiveUsed) + ' · WEEK ' + p(weekUsed)
}

/** ACTIVE or AWAY, the page's pill word. */
export const presenceWord = (away: boolean): string => (away ? 'AWAY' : 'ACTIVE')

// ---- Drawn pills (the same look as the plan page's chips) ----------------------------------------------------------------

/** The page's owner label (kind() in the template), without the lane effort the band cannot know. */
export function ownerLabel(owner: string): { cls: string; label: string } {
  const o = owner.trim().toLowerCase()
  if (o === 'jesse' || o === 'you' || o === 'owner') return { cls: 'you', label: 'You' }
  if (/^codex/.test(o)) return { cls: 'codex', label: 'Luna ' + (o.slice(-1) || '').toUpperCase() }
  if (/reika|pi-/.test(o)) return { cls: 'local', label: /^pi-/.test(o) ? 'Pi Reika 9B' : 'Reika 9B' }
  if (o === 'engine') return { cls: 'engine', label: 'Engine' }
  if (/^opus/.test(o)) return { cls: 'opus', label: 'Opus 5.5' }
  if (/^fable/.test(o)) return { cls: 'opus', label: 'Fable 5.1' }
  if (/^haiku/.test(o)) return { cls: 'claude', label: 'Haiku 4.5' }
  if (o === 'architect') return { cls: 'claude', label: 'Architect' }
  if (o === 'coordinator') return { cls: 'claude', label: 'This session' }
  return { cls: 'claude', label: 'Sonnet 5.5' }
}

export type Pill = { cls: string; text: string }

/** Status counts first (Running, Needs you, To do, Done), then one chip per owner label with running work: `Opus 5.5 ×2`. */
export function bandPills(v: PlanView): Pill[] {
  const out: Pill[] = [
    { cls: 'run', text: 'Running ' + v.running.length },
    { cls: 'you', text: 'Needs you ' + v.you },
    { cls: 'todo', text: 'To do ' + v.todo.length },
    { cls: 'done', text: 'Done ' + v.doneN },
  ]
  const n = new Map<string, Pill & { n: number }>()
  for (const r of v.running) {
    const k = ownerLabel(r.owner)
    const key = k.cls + '|' + k.label
    const cur = n.get(key)
    if (cur) cur.n++
    else n.set(key, { cls: k.cls, text: k.label, n: 1 })
  }
  for (const p of n.values()) out.push({ cls: p.cls, text: p.text + (p.n > 1 ? ' ×' + p.n : '') })
  const off = v.off.filter(r => r.state !== 'done').length
  if (off > 0) out.splice(4, 0, { cls: 'off', text: '+' + off + ' off plan' })
  return out
}

export const PILL_CSS = (() => {
  const set = (d: boolean): string => {
    const t: Record<string, [string, string]> = d
      ? { run: ['#14274a', '#79b0ff'], you: ['#3a2610', '#f0a85a'], todo: ['#2a2d33', '#a0a7b1'], done: ['#123222', '#56d364'], claude: ['#14274a', '#79b0ff'], codex: ['#272047', '#b3a4f5'], local: ['#000000', '#e6e6ea'], engine: ['#3a2a10', '#f0b862'], opus: ['#3b1a2d', '#f08cc0'], off: ['#3a3417', '#e3c65a'] }
      : { run: ['#e3eeff', '#1f5fd0'], you: ['#fdebd8', '#b45309'], todo: ['#eceef1', '#5b6470'], done: ['#dcf3e1', '#1a7f37'], claude: ['#e3eeff', '#1f5fd0'], codex: ['#e8e4fa', '#5a43c4'], local: ['#1c1c1e', '#f2f2f4'], engine: ['#fbe9d0', '#9a5a07'], opus: ['#f9e3ef', '#b02a73'], off: ['#fbf0c4', '#8a6d00'] }
    return Object.entries(t).map(([k, [bg, fg]]) => `.pb-${k}{fill:${bg}}.pt-${k}{fill:${fg}}`).join('') + (d ? '.pb-local{stroke:#3a3a3e;stroke-width:1}' : '')
  }
  return `<style>${set(false)}@media (prefers-color-scheme: dark){${set(true)}}</style>`
})()

/** One SVG row of pills, `measure` giving a text's width at the given size. Width is what was drawn, so the caller can budget it. */
export function pillsSvg(pills: readonly Pill[], limits: string, measure: (s: string, size: number) => number, font: string): { body: string; w: number; h: number } {
  const H = 20
  const SIZE = 11
  let x = 0
  const parts: string[] = []
  for (const p of pills) {
    const w = Math.ceil(measure(p.text, SIZE) + 18)
    parts.push(`<rect class="pb-${p.cls}" x="${x}" y="0" width="${w}" height="${H}" rx="10"/><text class="pt-${p.cls}" x="${x + w / 2}" y="14.2" text-anchor="middle" font-family="${font}" font-size="${SIZE}" font-weight="600">${p.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`)
    x += w + 6
  }
  const lw = Math.ceil(measure(limits, SIZE))
  parts.push(`<text class="m" x="${x + 2}" y="14.2" font-family="${font}" font-size="${SIZE}">${limits.replace(/&/g, '&amp;')}</text>`)
  const w = x + 2 + lw
  return { body: parts.join(''), w, h: H }
}
