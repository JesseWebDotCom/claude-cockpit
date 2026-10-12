// 0.23.3: pictures of the card above the input box, from the same pure functions the host draw uses (headPlan, headCells, textBar, creditsSvg):  bun tools/bandshot.ts
// Writes shots/band-{835,360}-{dark,light}.png. The host's Text and Buttons are simulated with a monospace page (8 px a column, one 20 px row each).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { creditsSvg, headCells, textBar } from '../hooks/look.ts'
import { headPlan, headPaneLabel, HEAD_ICON_PX } from '../hooks/headrow.ts'
import { AUTOPILOT } from '../hooks/autopilot.ts'
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
const cr = parseCreditsFile('{"cloud":{"expires":"2026-11-30"}}')
const rows = serviceRows({ nowMs: T, claude: { five: win.five, week: win.week }, codex: codexPool(parseCodexLimits(log), T, null), codexAtMs: T, credits: cr, creditsAtMs: T, apiSpendSince: { usd: 0, atMs: T }, rows: [], outages: [], localUp: true })
const PAGE = { dark: ['#1b1b1b', '#ececec', '#3fb950', '#8b949e', '#d29922', '#2a2a2a'], light: ['#ffffff', '#1f2328', '#1a7f37', '#6e7781', '#9a6700', '#eaeef2'] }
const title = 'Design wave, then land the search assist and the answer images'
for (const theme of ['dark', 'light'] as const) {
  setTheme(theme)
  const [bg, fg, green, dim, amber, chip] = PAGE[theme]
  for (const W of [835, 360]) {
    const px = W - 16
    const label = headPaneLabel(px)
    const pl = headPlan({ px, iconCount: 0, youN: 0, problemLabel: '! 0', hasProblems: false, paneLabel: label })
    const count = '91/119'
    const sp = headCells(pl.leftPx, title, count)
    const bar = textBar(91 / 119, sp.cells)
    const off = '+6 off plan'
    const icons = 4
    const offPx = (off.length + 2) * 8
    const iconsPx = icons * HEAD_ICON_PX + 16
    const showIcons = px - offPx - iconsPx >= 320
    const creditW = Math.max(120, px - offPx - (showIcons ? iconsPx : 0))
    const dots = '<span style="display:inline-block;width:' + icons * HEAD_ICON_PX + 'px;text-align:center;color:' + green + '">&#9679;&#9679;&#9679;&#9679;</span>'
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:${bg};color:${fg};font:13px/20px Menlo,monospace"><div style="width:${px}px;padding:8px;border-radius:12px;background:${chip}">
<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:nowrap"><div style="display:flex;gap:8px;min-width:0;white-space:pre"><span style="color:${green}">${bar.filled}</span><span style="color:${dim}">${bar.empty}</span><b style="overflow:hidden">${sp.title}</b><b>${sp.count}</b></div>
<div style="display:flex;gap:16px;flex-shrink:0;white-space:pre"><b style="color:${pl.showAutopilot ? dim : bg}">${pl.showAutopilot ? AUTOPILOT : ''}</b><b style="border:1px solid ${dim};border-radius:6px;padding:0 6px">${label}</b></div></div>
<div style="display:flex;align-items:center;gap:8px;white-space:nowrap">${creditsSvg(creditW, rows)}<span style="color:${amber}">${off}</span>${showIcons ? dots : ''}</div></div>`
    const name = `band-${W}-${theme}`
    const f = join(SHOTS, name + '.html')
    writeFileSync(f, html)
    const p = Bun.spawnSync([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${W},80`, `--screenshot=${join(SHOTS, name + '.png')}`, 'file://' + f], { stdout: 'ignore', stderr: 'ignore' })
    console.log(p.exitCode === 0 ? 'wrote shots/' + name + '.png' : 'chrome failed for ' + name)
    Bun.spawnSync(['rm', '-f', f])
  }
}
