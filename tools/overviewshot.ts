// Where Cockpit lands in Claude Code (headless Chrome only):  bun tools/overviewshot.ts
// Composes docs/img/overview-{dark,light}.png from the existing shots: the plan page in the right pane,
// the band above the prompt. Run pageshot.ts and shot.ts first so the parts are current.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const dir = mkdtempSync(join(tmpdir(), 'overview-'))
const img = (n: string) => 'file://' + join(ROOT, 'docs/img', n)
for (const [theme, scheme] of [['dark', 0], ['light', 1]] as const) {
  const t = scheme === 0
    ? { bg: '#14161a', win: '#1b1e23', line: '#2d3138', fg: '#d8dbe0', dim: '#7d8490', chip: '#3b82f6', chipFg: '#fff' }
    : { bg: '#e9ebef', win: '#fbfbfc', line: '#d3d7de', fg: '#22262d', dim: '#7a818c', chip: '#2563eb', chipFg: '#fff' }
  const html = `<!doctype html><meta charset=utf8><style>
  *{box-sizing:border-box}body{margin:0;background:${t.bg};font:14px ui-monospace,Menlo,monospace;color:${t.fg}}
  .win{position:relative;margin:24px;height:752px;background:${t.win};border:1px solid ${t.line};border-radius:12px;overflow:hidden;display:flex}
  .main{flex:1;min-width:0;padding:18px 20px;display:flex;flex-direction:column;justify-content:flex-end;gap:10px;position:relative}
  .main p{margin:0;color:${t.dim}}.main p b{color:${t.fg};font-weight:600}
  .band{width:100%;border-radius:8px;display:block}
  .side{width:482px;border-left:1px solid ${t.line};overflow:hidden;position:relative}
  .side img{display:block;width:480px}
  .chip{position:absolute;background:${t.chip};color:${t.chipFg};font:600 13px system-ui,sans-serif;padding:6px 11px;border-radius:999px;box-shadow:0 2px 8px #0005}
  </style><div class=win>
  <div class=main>
    <p><b>You</b> &nbsp;finish the sync client and check the settings screen</p>
    <p><b>Claude</b> &nbsp;Dispatching API-12 and WEB-07. Tests are running.</p>
    <p style="height:44px"></p>
    <img class=band src="${img(`status-row-${theme}.png`)}">
    <span class=chip style="left:20px;bottom:196px">Band above the prompt \u2193</span>
  <span class=chip style="left:330px;bottom:14px">\u2191 Line under the input: running now, last landed, sessions</span>
  <span class=chip style="right:16px;top:16px">Plan pane, on the right \u2192</span>
  </div>
  <div class=side><img src="${img(`page-home-${theme}.png`)}"></div>
  </div>`
  const f = join(dir, theme + '.html')
  writeFileSync(f, html)
  const out = join(ROOT, 'docs/img', `overview-${theme}.png`)
  const p = Bun.spawnSync([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--blink-settings=preferredColorScheme=${scheme}`, '--force-device-scale-factor=1', '--window-size=1400,800', '--virtual-time-budget=3000', `--screenshot=${out}`, 'file://' + f], { stdout: 'ignore', stderr: 'ignore' })
  console.log(p.exitCode === 0 ? 'wrote ' + out : 'chrome failed for ' + out)
}
rmSync(dir, { recursive: true, force: true })
