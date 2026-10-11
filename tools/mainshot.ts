// Screenshots of the self-filling Main status card (COCKPIT-38), drawn straight from hooks/look.ts, no host needed:
//   bun tools/mainshot.ts
// Writes shots/main39-{live,bare}-{dark,light}-420.png with headless Chrome (never a visible window).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { statusSvg } from '../hooks/look.ts'
import type { LookStatus } from '../hooks/look.ts'
import { serviceRows } from '../hooks/services.ts'
import { claudeWindows, emptyCache } from '../hooks/usage.ts'
import { codexPool } from '../hooks/limits.ts'
import { parseCodexLimits } from '../hooks/core.ts'
import { parseCreditsFile } from '../hooks/limits.ts'
import { setTheme } from '../hooks/tokens.ts'

const ROOT = resolve(import.meta.dir, '..')
const SHOTS = join(ROOT, 'shots')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(SHOTS, { recursive: true })

const NOW = ['COCKPIT-39: the Main status card shows every service', 'SETTINGS-SAVE-01: settings save button']
const BASE: LookStatus = {
  title: 'Main status', ratio: 0.9, count: 'Remote Stack pairing · 9/10', note: '', now: NOW.join(' · '),
  next: 'smoke-test a real chat turn, redo b20c, publish the mod', you: 'say whether to remove Hub and Stack from the Services section',
  youHex: '#F0A500', isAway: false, presenceText: 'Active', stale: '', phase: 0, nowItems: NOW,
  nextItems: ['smoke-test a real chat turn', 'redo b20c', 'publish the mod'], youItems: ['say whether to remove Hub and Stack from the Services section'],
}
const T = Date.parse('2026-10-09T15:00:00Z')
const win = claudeWindows([{ kind: 'five_hour', percentUsed: 1, resetsAt: '2026-10-09T20:00:00Z' }, { kind: 'seven_day', percentUsed: 88, resetsAt: '2026-10-12T17:00:00Z' }], emptyCache, T)
const log = `{"rate_limits":{"primary":{"used_percent":100,"window_minutes":300,"resets_at":${Math.floor(T / 1000) + 5400}},"secondary":{"used_percent":40,"window_minutes":10080,"resets_at":${Math.floor(T / 1000) + 400000}}}}\n`
const cr = parseCreditsFile('{"opencode":{"total":200,"left":105.08,"expires":"2026-11-01","source":"console 2026-10-09"},"cloud":{"expires":"2026-11-30"}}')
const FULL = serviceRows({ nowMs: T, claude: { five: win.five, week: win.week }, codex: codexPool(parseCodexLimits(log), T, null), codexAtMs: T, credits: cr, creditsAtMs: T - 30 * 3_600_000, apiSpendSince: { usd: 20, atMs: T }, rows: [], outages: [], localUp: true })
const NONE = serviceRows({ nowMs: T, claude: null, codex: codexPool(null, T, null), codexAtMs: null, credits: null, creditsAtMs: null, apiSpendSince: null, rows: [], outages: [], localUp: null })
const CARDS: Record<string, LookStatus> = {
  live: { ...BASE, services: FULL, main: { running: '3 lanes awake · 1 agent running', landed: 'DOCTOR-HOPS-02: doctor hop 10 probes role chat · 12m ago', report: 'cockpit37-report · 4m ago', notes: 'notes from 2d ago' } },
  long: { ...BASE, ratio: 0.5, count: 'Remote Stack pairing and the household hub handover for the whole family \u00b7 3/6', services: FULL, main: { running: '3 lanes awake', landed: 'DOCTOR-HOPS-02 · 12m ago', report: '', notes: '' } },
  bare: { ...BASE, services: NONE, now: '', nowItems: [], main: { running: '', landed: '', report: '', notes: '' } },
}
const THEMES = { dark: '#1b1b1b', light: '#ffffff' }
for (const [theme, bg] of Object.entries(THEMES)) {
  setTheme(theme as 'dark' | 'light')
  for (const [name, card] of Object.entries(CARDS)) {
    const svg = statusSvg(420, card)
    const h = Number(/height="(\d+(?:\.\d+)?)"/.exec(svg)?.[1] ?? 200)
    const base = `${process.env.SHOT_PREFIX ?? 'main39'}-${name}-${theme}-420`
    const html = join(SHOTS, base + '.html')
    writeFileSync(html, `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:16px;background:${bg}">${svg}</body>`)
    const proc = Bun.spawnSync([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=452,${Math.ceil(h) + 32}`, `--screenshot=${join(SHOTS, base + '.png')}`, 'file://' + html], { stdout: 'ignore', stderr: 'ignore' })
    console.log(proc.exitCode === 0 ? 'wrote shots/' + base + '.png' : 'chrome failed for ' + base)
    Bun.spawnSync(['rm', '-f', html])
  }
}
