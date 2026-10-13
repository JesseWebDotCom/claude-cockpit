// 0.24.11: pictures of the card above the input box, from the same pure functions the host draw uses (headPlan, headCells, textBar, creditsSvg):  bun tools/bandshot.ts
// Writes shots/band-{835,360}-{dark,light}.png. The host's Text and Buttons are simulated with a monospace page (8 px a column, one 20 px row each).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { BAND_BAR_H, bandBarSvg, creditWidth, creditsSvg, headCells, presenceSvg, presenceW } from '../hooks/look.ts'
import { PILL_CSS, bandPills, limitsLine, pillsSvg } from '../hooks/planbar.ts'
import { derivePlan, footerLine, parsePlan } from '../hooks/plan.ts'
import { FONT, textWidth } from '../hooks/draw.ts'
import { readFileSync } from 'node:fs'
import { headPlan, HEAD_PANE_GLYPH, HEAD_ICON_PX } from '../hooks/headrow.ts'
import { serviceRows } from '../hooks/services.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'
import { codexPool, parseCreditsFile } from '../hooks/limits.ts'
import { parseCodexLimits } from '../hooks/core.ts'
import { setTheme } from '../hooks/tokens.ts'

const SHOTS = join(resolve(import.meta.dir, '..'), 'shots')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(SHOTS, { recursive: true })
const T = Date.parse('2026-10-12T15:00:00Z')
const win = claudeWindows([{ kind: 'five_hour', percentUsed: 4, resetsAt: '2026-10-12T20:00:00Z' }, { kind: 'seven_day', percentUsed: 14, resetsAt: '2026-10-15T17:00:00Z' }], emptyCache, T)
const log = `{"rate_limits":{"primary":{"used_percent":1,"window_minutes":300,"resets_at":${Math.floor(T / 1000) + 5400}},"secondary":{"used_percent":0,"window_minutes":10080,"resets_at":${Math.floor(T / 1000) + 400000}}}}\n`
const cr = parseCreditsFile('{"cloud":{"total":300,"left":210,"expires":"2026-11-30"},"opencode":{"limit":200}}')
const rows = serviceRows({ nowMs: T, claude: { five: win.five, week: win.week }, codex: codexPool(parseCodexLimits(log), T, null), codexAtMs: T, credits: cr, creditsAtMs: T, apiSpendSince: { usd: 0, atMs: T }, rows: [], outages: [], localUp: true })
const PAGE = { dark: ['#1b1b1b', '#ececec', '#3fb950', '#8b949e', '#d29922', '#2a2a2a'], light: ['#ffffff', '#1f2328', '#1a7f37', '#6e7781', '#9a6700', '#eaeef2'] }
const file = parsePlan(readFileSync(join(import.meta.dir, 'sample', 'plan.json'), 'utf8'), T)!
const view = derivePlan(file, { nowMs: T, members: [], claims: [], reports: [], blocked: [], landed: [], aliveNames: ['codex-1', 'reika', 'sonnet-2', 'codex-2', 'sonnet-1', 'haiku-1', 'haiku-2', 'helper'] })
const total = view.doneN + view.running.length + view.you + view.todo.length
const limits = limitsLine(4, 14)
const footer = footerLine(view, T, { commit: { subject: 'T-7 Write the manual', ms: T - 12 * 60000 }, sessions: '3 sessions' }, 140)
const doc = (w: number, h: number, body: string, css = ''): string => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${css}${body}</svg>`
const img = (svg: string): string => `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`
for (const theme of ['dark', 'light'] as const) {
  setTheme(theme)
  const [bg, fg, green, dim, , chip] = PAGE[theme]
  for (const W of [835, 520]) {
    const px = W - 16
    const away = theme === 'dark'
    const label = HEAD_PANE_GLYPH
    const pl = headPlan({ px, iconCount: 4, youN: 0, problemLabel: '! 0', hasProblems: false, paneLabel: label })
    const barW = px >= 480 ? 112 : 0
    const count = `${view.doneN}/${total}`
    const sp = headCells(pl.leftPx - 40 - (barW > 0 ? barW + 8 : 0), 'Ship the plan tree', count)
    const rows = serviceRows({ nowMs: T, claude: { five: win.five, week: win.week }, codex: codexPool(parseCodexLimits(log), T, null), codexAtMs: T, credits: cr, creditsAtMs: T, apiSpendSince: { usd: 0, atMs: T }, rows: [], outages: [], localUp: true })
    const tries = [pillsSvg(bandPills(view), limits, textWidth, FONT), pillsSvg(bandPills(view), '', textWidth, FONT), pillsSvg(bandPills(view).slice(0, 4), '', textWidth, FONT)]
    const pills = tries.find(t => px - (t.w + 8) >= 200) ?? null
    const creditMax = Math.max(120, px - (pills === null ? 0 : pills.w + 8))
    const dots = '<span style="display:inline-flex;gap:0">' + [0, 1, 2, 3].map(() => `<span style="display:inline-block;width:${HEAD_ICON_PX}px;text-align:center;color:${green}">&#9679;</span>`).join('') + '</span>'
    const html = `<!doctype html><meta charset="utf-8"><style>img{display:block}</style><body style="margin:0;background:${bg};color:${fg};font:13px/20px Menlo,monospace"><div style="width:${px}px;padding:8px;border-radius:12px;background:${chip}">
<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:nowrap"><div style="display:flex;align-items:center;gap:8px;min-width:0;white-space:pre">${barW > 0 ? img(bandBarSvg(barW, view.doneN, view.running.length, view.you, total)) : ''}<b>${sp.title}</b><b>${count}</b></div>
<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;white-space:pre">${dots}${img(presenceSvg(away))}<b style="border:1px solid ${dim};border-radius:6px;padding:0 6px">${label}</b></div></div>
<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;white-space:nowrap">${pills === null ? '' : img(doc(pills.w, pills.h, pills.body, PILL_CSS))}${img(creditsSvg(creditMax, rows, true))}</div></div>
<div style="width:${px}px;padding:6px 8px;color:${dim};white-space:pre;overflow:hidden">${footer}</div>`
    const name = `band-${W}-${theme}`
    const f = join(SHOTS, name + '.html')
    writeFileSync(f, html)
    const p = Bun.spawnSync([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--blink-settings=preferredColorScheme=${theme === 'dark' ? 0 : 1}`, `--window-size=${W},110`, `--screenshot=${join(SHOTS, name + '.png')}`, 'file://' + f], { stdout: 'ignore', stderr: 'ignore' })
    console.log(p.exitCode === 0 ? 'wrote shots/' + name + '.png' : 'chrome failed for ' + name)
    Bun.spawnSync(['rm', '-f', f])
  }
}
