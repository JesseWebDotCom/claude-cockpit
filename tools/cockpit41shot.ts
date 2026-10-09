// Pictures for COCKPIT-41, from the real pure functions, no host needed:   bun tools/cockpit41shot.ts
// shots/bar41-{80,140}-{dark,light}.png: the bar's credit line as text (the host's Text simulated in a monospace page), flush left.
// The Main status card (same icons) comes from:   SHOT_PREFIX=main41 bun tools/mainshot.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { creditLine, serviceRows } from '../hooks/services.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'
import { codexPool, parseCreditsFile } from '../hooks/limits.ts'
import { parseCodexLimits } from '../hooks/core.ts'

const SHOTS = join(resolve(import.meta.dir, '..'), 'shots')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(SHOTS, { recursive: true })
const T = Date.parse('2026-10-09T15:00:00Z')
const win = claudeWindows([{ kind: 'five_hour', percentUsed: 1, resetsAt: '2026-10-09T20:00:00Z' }, { kind: 'seven_day', percentUsed: 88, resetsAt: '2026-10-12T17:00:00Z' }], emptyCache, T)
const log = `{"rate_limits":{"primary":{"used_percent":100,"window_minutes":300,"resets_at":${Math.floor(T / 1000) + 5400}},"secondary":{"used_percent":40,"window_minutes":10080,"resets_at":${Math.floor(T / 1000) + 400000}}}}\n`
const cr = parseCreditsFile('{"opencode":{"total":200,"left":105.08,"expires":"2026-11-01","source":"console 2026-10-09"},"cloud":{"expires":"2026-11-30"}}')
const rows = serviceRows({ nowMs: T, claude: { five: win.five, week: win.week }, codex: codexPool(parseCodexLimits(log), T, null), codexAtMs: T, credits: cr, creditsAtMs: T, apiSpendSince: { usd: 20, atMs: T }, rows: [], outages: [], localUp: true })
const HEX = { dark: { green: '#3FB950', yellow: '#D29922', red: '#F85149', gray: '#8B949E' }, light: { green: '#1A7F37', yellow: '#9A6700', red: '#CF222E', gray: '#6E7781' } }
const PAGE = { dark: ['#1b1b1b', '#ececec'], light: ['#ffffff', '#1f2328'] }
for (const theme of ['dark', 'light'] as const) {
  for (const cols of [80, 140]) {
    const l = creditLine(rows, cols - 2)
    const spans = l.segs.map(s => `<span style="color:${HEX[theme][s.color]};${s.dim ? 'opacity:.55' : ''}">${s.text}</span>`).join(l.sep.replace(/ /g, '&nbsp;'))
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:${PAGE[theme][0]};color:${PAGE[theme][1]};font:13px/20px Menlo,monospace"><div style="width:${cols * 7.8}px;padding:6px 8px;border:1px solid #888">milestone 3/6 ▰▰▰▱▱▱<br><div style="text-align:left;white-space:pre">${spans}</div>7 crew: 1 working &nbsp; Active ▤</div>`
    const name = `bar41-${cols}-${theme}`
    const f = join(SHOTS, name + '.html')
    writeFileSync(f, html)
    const p = Bun.spawnSync([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${Math.ceil(cols * 7.8) + 20},100`, `--screenshot=${join(SHOTS, name + '.png')}`, 'file://' + f], { stdout: 'ignore', stderr: 'ignore' })
    console.log(p.exitCode === 0 ? 'wrote shots/' + name + '.png' : 'chrome failed for ' + name)
    Bun.spawnSync(['rm', '-f', f])
  }
}
