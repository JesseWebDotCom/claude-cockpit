// Pictures for COCKPIT-40, from the real pure functions, no host needed:   bun tools/cockpit40shot.ts
// shots/bar40-{80,140}.png: the bar's second row as text at that many columns (the host's Text is simulated in a monospace page).
// shots/crew40-420.png: the Captain and two running subagents drawn by look.ts rowSvg (the real drawing). Headless Chrome only.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { creditLine, serviceRows } from '../hooks/services.ts'
import { rowSvg } from '../hooks/look.ts'
import { sessionRowIn, subRowIn } from '../hooks/register.tsx'
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
const rows = serviceRows({ nowMs: T, claude: { five: win.five, week: win.week }, codex: codexPool(parseCodexLimits(log), T, null), codexAtMs: T, credits: cr, creditsAtMs: T, apiSpendSince: { usd: 20, atMs: T }, rows: [], outages: [], localUp: null })
const HEX = { green: '#3FB950', yellow: '#D29922', red: '#F85149', gray: '#8B949E' }
const shoot = (name: string, html: string, w: number, h: number): void => {
  const f = join(SHOTS, name + '.html')
  writeFileSync(f, html)
  const p = Bun.spawnSync([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, `--screenshot=${join(SHOTS, name + '.png')}`, 'file://' + f], { stdout: 'ignore', stderr: 'ignore' })
  console.log(p.exitCode === 0 ? 'wrote shots/' + name + '.png' : 'chrome failed for ' + name)
  Bun.spawnSync(['rm', '-f', f])
}
for (const cols of [80, 140]) {
  const l = creditLine(rows, cols - 2 - 7)
  const spans = l.segs.map(s => `<span style="color:${HEX[s.color]};${s.dim ? 'opacity:.55' : ''}">${s.text}</span>`).join(l.sep.replace(/ /g, '&nbsp;'))
  shoot(`bar40-${cols}`, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#1b1b1b;color:#ececec;font:13px/20px Menlo,monospace"><div style="width:${cols * 7.8}px;padding:6px 8px;border:1px solid #444">milestone 3/6 ▰▰▰▱▱▱<br><div style="text-align:right;white-space:pre">${spans}</div>7 crew: 1 working &nbsp; Active ▤</div>`, Math.ceil(cols * 7.8) + 20, 100)
}
const subs = [{ id: 'a', name: 'Explore', type: 'Explore', model: 'haiku', status: 'running', description: 'find the 2nd row code' }, { id: 'b', name: 'Plan', type: 'Plan', model: 'sonnet', status: 'running', description: 'draft the fix' }]
const svgs = [rowSvg(420, sessionRowIn(T)), ...subs.map((s, i) => rowSvg(420, subRowIn(s, T, i === subs.length - 1)))]
shoot('crew40-420', `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:8px;background:#1b1b1b">${svgs.join('<div style="height:6px"></div>')}</body>`, 440, 8 + 3 * 70)
