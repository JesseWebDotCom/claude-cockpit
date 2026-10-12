// COCKPIT-TREE-01: the plan tree as an HTML fragment, built from the SAME functions the host uses (derivePlan, presentPlan, buildCards and the
// plancard/plancards/workers drawings). Used by tools/plan-preview.ts (a local page Jesse can click) and tools/planshot.ts (screenshots).
// Nothing here is a second implementation of the tree: only the layout glue (rows, chevrons) that the host does with Kit boxes is done with divs.
import { WAITING_MIN_H, WAITING_EMPTY, waitingRowSvg } from '../hooks/waiting.ts'
import { ACTION_GLYPH, buildCards, cardCapSvg, cardHeadSvg, cardLineSvg, moreFlag, stepFlag } from '../hooks/plancards.ts'
import { planCardSvg } from '../hooks/plancard.ts'
import { derivePlan, newTracker, parsePlan, planFooterLine, presentPlan } from '../hooks/plan.ts'
import { setTheme } from '../hooks/tokens.ts'

export type Theme = 'dark' | 'light'
export const PAGE_COLORS = {
  dark: { bg: '#1b1b1b', fg: '#e6e6e6', mute: '#8b949e', tile: '#2a2a2a' },
  light: { bg: '#ffffff', fg: '#1f2328', mute: '#59636e', tile: '#eef0f2' },
}
export type TreeOpts = { planText: string; flags: Record<string, boolean>; theme: Theme; nowMs: number; motion: boolean; width?: number; aliveNames?: string[]; youLines?: string[] }

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The page chrome: the top bar, the tree, and the line under the input. Returns the fragment and its pixel height estimate. */
export function treeHtml(o: TreeOpts): string {
  setTheme(o.theme)
  const W = o.width ?? 420
  const col = PAGE_COLORS[o.theme]
  const file = parsePlan(o.planText, o.nowMs)
  if (file === null) return '<p>plan.json could not be read</p>'
  const view = derivePlan(file, { nowMs: o.nowMs, members: [], claims: [], reports: [], blocked: [], landed: [], aliveNames: o.aliveNames ?? [] })
  const shown = presentPlan(newTracker(), view, o.nowMs)
  const footer = planFooterLine(view, o.nowMs, true, 56)
  const cards = buildCards(shown, o.flags, { youLines: o.youLines ?? [], systemText: 'Mac 41% CPU, 12 GB free · box up' })
  const wS = W - 40
  const popts = { open: false, motion: o.motion, nowMs: o.nowMs }
  const chev = (flag: string, open: boolean, glyph: string): string => `<button class="chev" data-flag="${esc(flag)}" data-open="${open ? '1' : '0'}" title="${open ? 'Collapse' : 'Expand'}">${glyph}</button>`
  const none = '<span class="chev"></span>'
  const rows: string[] = []
  const row = (svg: string, side: string): void => void rows.push(`<div class="r">${svg}${side}</div>`)
  const grid = (acts: readonly string[]): string => `<div class="grid">${acts.map(a => `<span title="${esc(a)} (host only)">${ACTION_GLYPH[a as keyof typeof ACTION_GLYPH]}</span>`).join('')}</div>`
  row(planCardSvg(W - 40, shown, popts, { head: true }).svg, none)
  for (const c of cards) {
    if (c.def.id === 'title') continue
    const joined = c.open && (c.entries.length > 0 || c.def.id === 'system' || c.count === 0)
    row(cardHeadSvg(wS, c.def, c.count, joined, { title: c.title, countText: c.countText, active: c.active, open: c.open, motion: o.motion, nowMs: o.nowMs }).svg, chev(c.def.flag, c.open, c.open ? '▾' : '▸'))
    if (!c.open) continue
    if (c.def.id === 'system') row(cardLineSvg(wS, c.text, 's').svg, none)
    else if (c.entries.length === 0) row(cardLineSvg(wS, c.def.id === 'needs' ? WAITING_EMPTY : c.def.id === 'milestone' ? 'No steps yet' : 'Nothing here', 'm').svg, none)
    for (const e of c.entries) {
      if (e.kind === 'need') {
        row(waitingRowSvg(wS - 44, e.item).svg, grid(e.actions))
        continue
      }
      const id = e.row.id
      if (!e.expanded) {
        row(planCardSvg(wS, shown, popts, { row: e.row }).svg, chev(stepFlag(id), false, '▸'))
        continue
      }
      const sized = planCardSvg(wS - 44, shown, { ...popts, open: true, more: e.more }, { row: e.row, minH: WAITING_MIN_H })
      const side = `<div class="col">${chev(stepFlag(id), true, '▾')}${e.hasMore ? chev(moreFlag(id), e.more, e.more ? '−' : '…') : ''}</div>${grid(e.actions)}`
      row(sized.svg, side)
    }
    row(cardCapSvg(wS).svg, none)
  }
  return `<div class="tree" style="width:${W}px">${rows.join('')}<div class="foot">${esc(footer)}</div></div>`
}

export const pageCss = (theme: Theme): string => {
  const c = PAGE_COLORS[theme]
  const run = theme === 'dark' ? '#58A6FF' : '#0969da'
  const warn = theme === 'dark' ? '#F0A500' : '#9a6700'
  return `<style>
:root{--warn:${warn};--run:${run}}
body{margin:0;padding:16px;background:${c.bg};color:${c.fg};font:13px -apple-system,sans-serif}
.r{display:flex;align-items:center}
.r svg{display:block;flex:none}
.chev{width:40px;flex:none;background:none;border:0;color:${c.mute};font:14px sans-serif;cursor:pointer;padding:0}
.col{display:flex;flex-direction:column;align-items:center;width:40px;flex:none}
.grid{display:grid;grid-template-columns:20px 20px;gap:2px;margin-left:2px;color:${c.mute};text-align:center;font:12px sans-serif}
.grid span{border:1px solid ${c.mute};opacity:.6}
.foot{margin-top:8px;font:12px ui-monospace,monospace;color:${c.mute};border-top:1px solid ${c.tile};padding-top:6px}
</style>`
}
