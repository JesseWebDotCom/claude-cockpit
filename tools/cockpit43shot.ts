// Pictures for COCKPIT-43, from the real pure functions, no host needed:   bun tools/cockpit43shot.ts
// shots/bar43-{80,140}-{dark,light}.png: row 1 (short description + bar), row 2 (icons, Codex right-aligned), the status row
// (text, then the AUTOPILOT word, the switch and the pane button packed to the left, no dots; the host's Text/Buttons simulated).
// The Main status card (same icons) comes from:   SHOT_PREFIX=main43 bun tools/mainshot.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { bandPx, creditsSvg, progressSvg } from '../hooks/look.ts'
import { serviceRows } from '../hooks/services.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'
import { codexPool, parseCreditsFile } from '../hooks/limits.ts'
import { parseCodexLimits } from '../hooks/core.ts'
import { setTheme } from '../hooks/tokens.ts'

const SHOTS = join(resolve(import.meta.dir, '..'), 'shots')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(SHOTS, { recursive: true })
const T = Date.parse('2026-10-09T15:00:00Z')
const win = claudeWindows([{ kind: 'five_hour', percentUsed: 1, resetsAt: '2026-10-09T20:00:00Z' }, { kind: 'seven_day', percentUsed: 88, resetsAt: '2026-10-12T17:00:00Z' }], emptyCache, T)
const log = `{"rate_limits":{"primary":{"used_percent":100,"window_minutes":300,"resets_at":${Math.floor(T / 1000) + 5400}},"secondary":{"used_percent":40,"window_minutes":10080,"resets_at":${Math.floor(T / 1000) + 400000}}}}\n`
const cr = parseCreditsFile('{"opencode":{"total":200,"left":105.08,"expires":"2026-11-01","source":"console 2026-10-09"},"cloud":{"expires":"2026-11-30"}}')
const rows = serviceRows({ nowMs: T, claude: { five: win.five, week: win.week }, codex: codexPool(parseCodexLimits(log), T, null), codexAtMs: T, credits: cr, creditsAtMs: T, apiSpendSince: { usd: 20, atMs: T }, rows: [], outages: [], localUp: true })
const PAGE = { dark: ['#1b1b1b', '#ececec'], light: ['#ffffff', '#1f2328'] }
for (const theme of ['dark', 'light'] as const) {
  setTheme(theme)
  for (const cols of [80, 140, 36]) {
    const W = bandPx(cols)
    const r1 = progressSvg(W, { title: 'Remote Stack pairing', ratio: 0.9, count: '9/10', now: '', isWorking: false, grewFrom: null })
    const r2 = creditsSvg(W, rows)
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:${PAGE[theme][0]};color:${PAGE[theme][1]};font:13px/20px Menlo,monospace"><div style="width:${W}px;padding:6px 8px;border:1px solid #888">${r1}<br>${r2}<br><div style="white-space:pre">7 crew: 1 working  <b style="color:#8B949E">AUTOPILOT</b> ▾ ▤</div></div>`
    const name = `bar43-${cols}-${theme}`
    const f = join(SHOTS, name + '.html')
    writeFileSync(f, html)
    const p = Bun.spawnSync([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${W + 40},150`, `--screenshot=${join(SHOTS, name + '.png')}`, 'file://' + f], { stdout: 'ignore', stderr: 'ignore' })
    console.log(p.exitCode === 0 ? 'wrote shots/' + name + '.png' : 'chrome failed for ' + name)
    Bun.spawnSync(['rm', '-f', f])
  }
}
