// COCKPIT-66: screenshots of the plan card, the top bar and the footer line in four states, headless Chrome only:
//   bun tools/planshot.ts
// Writes shots/plan66-{running,blocked,done,stale}-{dark,light}.png. The card is the real svg from hooks/plancard.ts;
// the top bar and the footer line are drawn in HTML from the same planBand / planFooterLine strings the host shows.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { planCardSvg } from '../hooks/plancard.ts'
import { derivePlan, newTracker, parsePlan, planBand, planFooterLine, presentPlan } from '../hooks/plan.ts'
import type { PlanEvidence } from '../hooks/plan.ts'
import { setTheme } from '../hooks/tokens.ts'
import { WAITING_MIN_H, waitingRowSvg } from '../hooks/waiting.ts'
import { ACTION_GLYPH, buildCards, cardCapSvg, cardHeadSvg, cardLineSvg } from '../hooks/plancards.ts'

const ROOT = resolve(import.meta.dir, '..')
const SHOTS = join(ROOT, 'shots')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(SHOTS, { recursive: true })

const NOW = Date.parse('2026-10-10T21:00:00Z')
const MIN = 60_000
const W = 420

const item = (id: string, title: string, state: string, extra: object = {}) => ({ id, title, state, ...extra })
const items = (over: Record<string, object> = {}) => [
  item('PLAN-01', 'Parse plan.json and derive rows', 'done'),
  item('PLAN-02', 'tools/plan-set command', 'done'),
  item('PLAN-03', 'Plan card replaces the Main card', 'running', { owner: 'codex-1', startedAt: new Date(NOW - 7 * MIN - 12_000).toISOString() }),
  item('PLAN-04', 'Top bar progress and counts', 'running', { owner: 'reika', startedAt: new Date(NOW - 2 * MIN - 31_000).toISOString() }),
  item('PLAN-05', 'Pick the accent for the stale dot', 'blocked', { owner: 'jesse', note: 'Needs your call: red dot or red text?' }),
  item('PLAN-06', 'Footer line under the input', 'todo'),
  item('PLAN-07', 'Skill and changelog', 'todo'),
  item('PLAN-08', 'Screenshots', 'todo'),
  item('SIDE-01', 'Fix a typo the lane found', 'done', { planned: false }),
].map(i => ({ ...i, ...(over[i.id] ?? {}) }))

type Scene = { name: string; updated: number; items: object[]; ev?: Partial<PlanEvidence>; prior?: object[] }
const SCENES: Scene[] = [
  { name: 'running', updated: NOW - 2 * MIN, items: items({ 'PLAN-05': { state: 'todo', owner: '', note: '' } }), ev: { aliveNames: ['codex-1', 'reika'] } },
  { name: 'blocked', updated: NOW - 4 * MIN, items: items({ 'PLAN-03': { state: 'todo', owner: '' }, 'PLAN-04': { state: 'todo', owner: '' } }), ev: { aliveNames: [] } },
  { name: 'done', updated: NOW - 20_000, items: items({ 'PLAN-03': { state: 'done', doneAt: new Date(NOW - 1500).toISOString() } }), ev: { aliveNames: ['reika'] }, prior: items() },
  { name: 'stale', updated: NOW - 45 * MIN, items: items(), ev: { aliveNames: ['reika'], landed: [{ hash: 'abc1234', subject: 'OTHER-9: unplanned landing', atMs: NOW - 60_000 }], claims: [{ id: 'OTHER-10', mtimeMs: NOW - 2 * MIN, lane: 'reika' }] } },
]

const evidence = (over: Partial<PlanEvidence> = {}): PlanEvidence => ({ nowMs: NOW, members: [], claims: [], reports: [], blocked: [], landed: [], aliveNames: [], ...over })
const plan = (updated: number, its: object[]) => parsePlan(JSON.stringify({ milestone: 'Plan-focused Cockpit', updated: new Date(updated).toISOString(), queue: [{ milestone: 'KS-03 pass', items: ['a', 'b', 'c', 'd', 'e'] }], items: its }))!

const THEMES = { dark: { bg: '#1b1b1b', fg: '#e6e6e6', mute: '#8b949e', tile: '#2a2a2a' }, light: { bg: '#ffffff', fg: '#1f2328', mute: '#59636e', tile: '#eef0f2' } }
for (const [theme, c] of Object.entries(THEMES)) {
  setTheme(theme as 'dark' | 'light')
  for (const s of SCENES) {
    const tr = newTracker()
    if (s.prior) presentPlan(tr, derivePlan(plan(s.updated, s.prior), evidence({ ...s.ev, nowMs: NOW - 5000 })), NOW - 5000)
    else presentPlan(tr, derivePlan(plan(s.updated, s.items), evidence(s.ev)), NOW - 5000)
    const view = derivePlan(plan(s.updated, s.items), evidence(s.ev))
    const shown = presentPlan(tr, view, NOW)
    const { svg } = planCardSvg(W, shown, { open: true, motion: true, nowMs: NOW })
    const band = planBand(shown)
    const footer = planFooterLine(view, NOW, true, 56)
    const pill = (t: string, col: string) => `<span style="color:${col};margin-left:10px">${t}</span>`
    const bar = `<div style="width:${W}px;margin-bottom:8px;font:600 15px -apple-system,sans-serif">${band.title}<div style="margin:6px 0 4px;height:6px;border-radius:3px;background:${c.tile}"><div style="width:${Math.round(band.ratio * 100)}%;height:6px;border-radius:3px;background:#3FB950"></div></div><div style="font:12px ui-monospace,monospace;color:${c.mute}">${band.count}${band.offTag ? pill(band.offTag, '#F0A500') : ''}${band.you > 0 ? pill('you: ' + band.you, '#F0A500') : ''}${band.staleDot ? pill('● stale', '#F85149') : ''}</div></div>`
    const foot = `<div style="width:${W}px;margin-top:8px;font:12px ui-monospace,monospace;color:${c.mute};border-top:1px solid ${c.tile};padding-top:6px">${footer}</div>`
    const base = `plan66-${s.name}-${theme}`
    const html = join(SHOTS, base + '.html')
    writeFileSync(html, `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:16px;background:${c.bg};color:${c.fg}">${bar}${svg}${foot}</body>`)
    const h = Number(/height="(\d+(?:\.\d+)?)"/.exec(svg)?.[1] ?? 400) + 150
    const proc = Bun.spawnSync([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-dark-mode=0', `--window-size=452,${Math.ceil(h)}`, `--screenshot=${join(SHOTS, base + '.png')}`, 'file://' + html], { stdout: 'ignore', stderr: 'ignore' })
    console.log(proc.exitCode === 0 ? 'wrote shots/' + base + '.png' : 'chrome failed for ' + base)
    Bun.spawnSync(['rm', '-f', html])
  }
}

// 0.22.0: the stack of cards at a narrow width, as the host lays it out: each card a header with its count, each row with its 2x2 button column drawn beside
// it (here as boxes), Blocked and Done closed by default (a second shot opens everything).
{
  const NW = 340
  const its = [
    item('PLAN-03', 'Plan card replaces the Main card and wraps every long title onto more lines instead of cutting it', 'running', { owner: 'codex-1', note: 'Rewriting the row layout so no title or note is ever cut with an ellipsis', startedAt: new Date(NOW - 7 * MIN).toISOString() }),
    item('PLAN-05', 'Pick the accent for the stale dot', 'blocked', { owner: 'jesse', note: 'Needs your call: should the stale marker be a red dot or red text on the top bar? Either is fine to build.' }),
    item('KS-02F', 'KS-02F', 'blocked', { owner: 'jesse', note: 'Approve the new prefix wording before the bench runs tonight' }),
    item('PLAN-06', 'Footer line under the input', 'todo'),
    item('PLAN-01', 'Parse plan.json and derive rows', 'done'),
    item('LOCALCODER-TRIAL-01', 'LOCALCODER-TRIAL-01', 'running', { owner: 'reika', planned: false, note: 'Trial of the local coder on three small items', startedAt: new Date(NOW - 3 * MIN).toISOString() }),
  ]
  for (const [theme, c] of Object.entries(THEMES)) {
    setTheme(theme as 'dark' | 'light')
    for (const all of [false, true]) {
      const view = derivePlan(plan(NOW - 2 * MIN, its), evidence({ aliveNames: ['reika'] }))
      const shown = presentPlan(newTracker(), view, NOW)
      const flags = all ? { 'pc-system': true, 'pc-blocked': true, 'pc-done': true } : {}
      const cards = buildCards(shown, flags, { youLines: ['Plug the camera back in'], systemText: 'Mac 41% CPU, 12 GB free \u00b7 box up' })
      const box = (g: string) => `<span style="border:1px solid ${c.mute};width:18px;text-align:center;font:12px sans-serif">${g}</span>`
      const col = `<div style="display:grid;grid-template-columns:20px 20px;gap:2px;margin-left:6px">${(['done', 'remove', 'explain', 'retry'] as const).map(a => box(ACTION_GLYPH[a])).join('')}</div>`
      const out: string[] = [planCardSvg(NW, shown, { open: false, motion: false, nowMs: NOW }, { head: true }).svg]
      for (const cd of cards) {
        if (cd.def.id === 'title') continue
        out.push(cardHeadSvg(NW - 56, cd.def, cd.count, cd.open && cd.entries.length > 0).svg)
        if (cd.def.id === 'system' && cd.open) out.push(cardLineSvg(NW - 56, cd.text).svg)
        for (const e of cd.entries) {
          const d = e.kind === 'need' ? waitingRowSvg(NW - 56, e.item) : planCardSvg(NW - 56, shown, { open: false, motion: false, nowMs: NOW }, { row: e.row, minH: e.actions.length > 0 ? WAITING_MIN_H : 1 })
          out.push(`<div style="display:flex;align-items:center">${d.svg}${e.actions.length > 0 ? col : ''}</div>`)
        }
        if (cd.entries.length > 0) out.push(cardCapSvg(NW - 56).svg)
      }
      const base = `plan22-stack${all ? '-open' : ''}-${theme}`
      const html = join(SHOTS, base + '.html')
      writeFileSync(html, `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:16px;background:${c.bg};color:${c.fg};width:${NW}px">${out.join('<div style="height:4px"></div>')}</body>`)
      const proc = Bun.spawnSync([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${NW + 32},${all ? 1500 : 1000}`, `--screenshot=${join(SHOTS, base + '.png')}`, 'file://' + html])
      console.log(proc.exitCode === 0 ? 'wrote shots/' + base + '.png' : 'chrome failed for ' + base)
      Bun.spawnSync(['rm', '-f', html])
    }
  }
}
