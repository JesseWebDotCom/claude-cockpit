// 0.24.12: the animated README picture, from the same plan-tree draw as planshot.ts:  bun tools/gifshot.ts
// Writes docs/img/plan-running-{dark,light}.gif: 12 frames of a 3 s loop (every worker animation divides 3 s), each frame a headless-Chrome shot with the
// animations paused at that time, joined by ffmpeg. Needs ffmpeg on the PATH.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pageCss, treeHtml } from './treepage.ts'
import type { Theme } from './treepage.ts'

const ROOT = resolve(import.meta.dir, '..')
const OUT = join(ROOT, 'docs', 'img')
const TMP = join(ROOT, 'demo-out', 'gif')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(TMP, { recursive: true })
const NOW = Date.parse('2026-10-12T12:00:00+00:00')
const plan = readFileSync(join(import.meta.dir, 'sample', 'plan.json'), 'utf8')
const alive = ['codex-1', 'reika', 'sonnet-2', 'codex-2', 'sonnet-1', 'haiku-1', 'haiku-2', 'helper']
const FRAMES = 12
const STEP_MS = 250

for (const theme of ['dark', 'light'] as Theme[]) {
  const body = treeHtml({ planText: plan, flags: { 'pm-polish': true, 'ps-T-8': true }, theme, nowMs: NOW, motion: true, aliveNames: alive })
  for (let i = 0; i < FRAMES; i++) {
    const t = (i * STEP_MS) / 1000
    const css = `*{animation-play-state:paused!important;animation-delay:calc(var(--wd,0s) - ${t}s)!important}`
    const f = join(TMP, `f${String(i).padStart(2, '0')}`)
    writeFileSync(f + '.html', `<!doctype html><meta charset="utf-8">${pageCss(theme)}<style>${css}</style><body>${body}</body>`)
    Bun.spawnSync([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=470,760', '--virtual-time-budget=500', `--screenshot=${f}.png`, 'file://' + f + '.html'], { stdout: 'ignore', stderr: 'ignore' })
  }
  const g = Bun.spawnSync(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', String(1000 / STEP_MS), '-i', join(TMP, 'f%02d.png'), '-vf', 'split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=none', '-loop', '0', join(OUT, `plan-running-${theme}.gif`)])
  console.log(g.exitCode === 0 ? 'wrote docs/img/plan-running-' + theme + '.gif' : 'ffmpeg failed for ' + theme)
}
rmSync(TMP, { recursive: true, force: true })
