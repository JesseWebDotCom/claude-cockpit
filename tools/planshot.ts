// COCKPIT-TREE-01: screenshots of the plan tree (headless Chrome only):  bun tools/planshot.ts
// Writes shots/tree-{collapsed,milestone,waiting,workers}-{dark,light}.png from tools/sample/plan.json, drawn by the same code the host and
// tools/plan-preview.ts use. `workers` shows every kind once (a running step per kind, with motion off for a steady frame).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pageCss, treeHtml } from './treepage.ts'
import type { Theme } from './treepage.ts'
import { STEP_KINDS } from '../hooks/plan.ts'

const ROOT = resolve(import.meta.dir, '..')
const SHOTS = join(ROOT, 'shots')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(SHOTS, { recursive: true })
const NOW = Date.parse('2026-10-12T12:00:00+00:00')
const sample = readFileSync(join(import.meta.dir, 'sample', 'plan.json'), 'utf8')
const alive = ['codex-1', 'reika', 'sonnet-2', 'codex-2', 'sonnet-1', 'haiku-1', 'haiku-2', 'helper']

// One running step per kind, each owned by a live agent, in a single milestone.
const kindsPlan = JSON.stringify({
  plan: 'Every worker kind',
  updated: '2026-10-12T11:59:00+00:00',
  milestones: [{ id: 'kinds', title: 'Worker kinds', steps: STEP_KINDS.map((k, i) => ({ id: 'K-' + i, title: k + ' step', state: k === 'wait' ? 'blocked' : 'running', owner: k === 'wait' ? 'jesse' : alive[i % alive.length], kind: k, startedAt: '2026-10-12T11:55:00+00:00' })) }],
})

const SCENES: { name: string; plan: string; flags: Record<string, boolean>; h: number; motion: boolean }[] = [
  { name: 'collapsed', plan: sample, flags: {}, h: 420, motion: true },
  { name: 'milestone', plan: sample, flags: { 'pm-polish': true, 'ps-T-8': true }, h: 760, motion: true },
  { name: 'waiting', plan: sample, flags: { 'pc-needs': true, 'pc-off': true }, h: 520, motion: true },
  { name: 'workers', plan: kindsPlan, flags: { 'pm-kinds': true }, h: 640, motion: false },
]
for (const theme of ['dark', 'light'] as Theme[]) {
  for (const s of SCENES) {
    const body = treeHtml({ planText: s.plan, flags: s.flags, theme, nowMs: NOW, motion: s.motion, aliveNames: alive })
    const base = `tree-${s.name}-${theme}`
    const html = join(SHOTS, base + '.html')
    writeFileSync(html, `<!doctype html><meta charset="utf-8">${pageCss(theme)}<body>${body}</body>`)
    const p = Bun.spawnSync(['perl', '-e', 'alarm 40; exec @ARGV', CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=' + (s.name === 'workers' ? '2' : '1'), `--window-size=470,${s.h}`, '--timeout=1500', `--screenshot=${join(SHOTS, base + '.png')}`, 'file://' + html], { stdout: 'ignore', stderr: 'ignore' })
    console.log(p.exitCode === 0 ? 'wrote shots/' + base + '.png' : 'chrome failed for ' + base)
    rmSync(html, { force: true })
  }
}
