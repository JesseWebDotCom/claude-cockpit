// Screenshots of the self-filling Main status card (COCKPIT-38), drawn straight from hooks/look.ts, no host needed:
//   bun tools/mainshot.ts
// Writes shots/main38-{live,bare}-{dark,light}-420.png with headless Chrome (never a visible window).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { statusSvg } from '../hooks/look.ts'
import type { LookStatus } from '../hooks/look.ts'
import { setTheme } from '../hooks/tokens.ts'

const ROOT = resolve(import.meta.dir, '..')
const SHOTS = join(ROOT, 'shots')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(SHOTS, { recursive: true })

const NOW = ['COCKPIT-38: the Main status card fills itself', 'SETTINGS-SAVE-01: settings save button']
const BASE: LookStatus = {
  title: 'Main status', ratio: 0.9, count: 'Remote Stack pairing · 9/10', note: '', now: NOW.join(' · '),
  next: 'smoke-test a real chat turn, redo b20c, publish the mod', you: 'say whether to remove Hub and Stack from the Services section',
  youHex: '#F0A500', isAway: false, presenceText: 'Active', stale: '', phase: 0, nowItems: NOW,
  nextItems: ['smoke-test a real chat turn', 'redo b20c', 'publish the mod'], youItems: ['say whether to remove Hub and Stack from the Services section'],
}
const CARDS: Record<string, LookStatus> = {
  live: { ...BASE, main: { running: '3 lanes awake · 1 agent running', landed: 'DOCTOR-HOPS-02: doctor hop 10 probes role chat · 12m ago', report: 'cockpit37-report · 4m ago', notes: 'notes from 2d ago' } },
  bare: { ...BASE, now: '', nowItems: [], main: { running: '', landed: '', report: '', notes: '' } },
}
const THEMES = { dark: '#1b1b1b', light: '#ffffff' }
for (const [theme, bg] of Object.entries(THEMES)) {
  setTheme(theme as 'dark' | 'light')
  for (const [name, card] of Object.entries(CARDS)) {
    const svg = statusSvg(420, card)
    const h = Number(/height="(\d+(?:\.\d+)?)"/.exec(svg)?.[1] ?? 200)
    const base = `main38-${name}-${theme}-420`
    const html = join(SHOTS, base + '.html')
    writeFileSync(html, `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:16px;background:${bg}">${svg}</body>`)
    const proc = Bun.spawnSync([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=452,${Math.ceil(h) + 32}`, `--screenshot=${join(SHOTS, base + '.png')}`, 'file://' + html], { stdout: 'ignore', stderr: 'ignore' })
    console.log(proc.exitCode === 0 ? 'wrote shots/' + base + '.png' : 'chrome failed for ' + base)
    Bun.spawnSync(['rm', '-f', html])
  }
}
