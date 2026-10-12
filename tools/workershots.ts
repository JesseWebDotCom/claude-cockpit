// COCKPIT-TREE-01 round 2: contact sheets of the eight workers, every frame side by side, plus the live line drawing (frame 0), at 1x and 2x, light and dark.
//   bun tools/workershots.ts   writes shots/workers-{1x,2x}-{light,dark}.png (headless Chrome only)
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PAGE_COLORS, pageCss } from './treepage.ts'
import type { Theme } from './treepage.ts'
import { STEP_KINDS } from '../hooks/plan.ts'
import { SPRITE_FRAMES, SPRITE_H, SPRITE_W } from '../hooks/workersprites.ts'
import { WORKER_CSS, workersLine } from '../hooks/workers.ts'
import { doc } from '../hooks/draw.ts'
import { setTheme } from '../hooks/tokens.ts'

const ROOT = resolve(import.meta.dir, '..')
const SHOTS = join(ROOT, 'shots')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(SHOTS, { recursive: true })
const NOW = Date.parse('2026-10-12T12:00:00+00:00')

for (const theme of ['light', 'dark'] as Theme[]) {
  setTheme(theme)
  const c = PAGE_COLORS[theme]
  for (const scale of (process.env.SCALES ?? "1,2").split(",").map(Number)) {
    const rows = STEP_KINDS.map(k => {
      const tone = k === 'wait' ? 'warn' : 'run'
      const frames = (SPRITE_FRAMES[k] ?? []).map(fr => `<svg width="${SPRITE_W * scale}" height="${SPRITE_H * scale}" viewBox="0 0 ${SPRITE_W} ${SPRITE_H}" shape-rendering="crispEdges" style="margin-right:${6 * scale}px"><rect width="${SPRITE_W}" height="${SPRITE_H}" rx="3" fill="${theme === 'dark' ? (tone === 'warn' ? '#F0A500' : '#58A6FF') : tone === 'warn' ? '#8a5d00' : '#0969da'}" fill-opacity=".22"/>${fr}</svg>`).join('')
      const live = workersLine(k, ['codex-1'], tone, 0, 0, 200, { motion: false, nowMs: NOW })
      const line = doc(240, SPRITE_H * scale + 4, `<g transform="scale(${scale})">${live.svg}</g>`, WORKER_CSS)
      return `<div class="rw"><b>${k}</b><span>${frames}</span><span class="tile">${line}</span></div>`
    }).join('')
    const html = join(SHOTS, `workers-${scale}x-${theme}.html`)
    writeFileSync(html, `<!doctype html><meta charset="utf-8">${pageCss(theme)}<style>.rw{display:flex;align-items:center;gap:14px;margin:8px 0}.rw b{width:70px;font:600 13px sans-serif}.tile{background:${c.tile};padding:2px 6px;border-radius:6px}svg{display:block}.rw span{display:flex}</style><body>${rows}</body>`)
    const out = join(SHOTS, `workers-${scale}x-${theme}.png`)
    const h = 40 + STEP_KINDS.length * (SPRITE_H * scale + 22)
    const p = Bun.spawnSync(['perl', '-e', 'alarm 40; exec @ARGV', CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', `--window-size=${scale === 1 ? 560 : scale === 2 ? 900 : 1500},${h}`, '--timeout=1500', `--screenshot=${out}`, 'file://' + html], { stdout: 'ignore', stderr: 'ignore' })
    console.log(p.exitCode === 0 ? 'wrote ' + out : 'chrome failed for ' + out)
    rmSync(html, { force: true })
  }
}
