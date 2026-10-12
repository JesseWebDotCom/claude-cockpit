// COCKPIT-TREE-01: a local preview of the real plan tree, no Claude session needed.
//   bun tools/plan-preview.ts [plan.json] [--port 4747] [--theme dark|light]
// Renders the tree from a plan.json (default tools/sample/plan.json, the new shape) with the same drawing code the host uses; the chevrons expand and
// collapse. Open the printed URL in a browser. Stop it with Ctrl-C, or from another terminal:  bun tools/plan-preview.ts --stop
// It listens on 127.0.0.1 only, writes nothing but a pid file in the temp folder, and opens no window by itself (headless-safe).
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PAGE_COLORS, pageCss, treeHtml } from './treepage.ts'
import type { Theme } from './treepage.ts'

const args = process.argv.slice(2)
const opt = (name: string, d: string): string => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1]! : d
}
const PID = join(tmpdir(), 'cockpit-plan-preview.pid')
if (args.includes('--stop')) {
  if (!existsSync(PID)) {
    console.log('No preview is running (no pid file at ' + PID + ').')
    process.exit(0)
  }
  const pid = Number(readFileSync(PID, 'utf8'))
  try {
    process.kill(pid)
    console.log('Stopped the plan preview (pid ' + pid + ').')
  } catch {
    console.log('The plan preview (pid ' + pid + ') was already gone.')
  }
  rmSync(PID, { force: true })
  process.exit(0)
}
const file = resolve(args.find(a => a.endsWith('.json')) ?? join(import.meta.dir, 'sample', 'plan.json'))
const port = Number(opt('--port', '4747'))
const defTheme: Theme = opt('--theme', 'dark') === 'light' ? 'light' : 'dark'
// The sample is drawn as if "now" were just after its `updated` stamp so it never looks stale; a real file uses the real clock.
const isSample = file.endsWith(join('sample', 'plan.json'))
const sampleNow = Date.parse('2026-10-12T12:00:00+00:00')

const render = (flags: Record<string, boolean>, theme: Theme, motion: boolean): string => {
  const now = isSample ? sampleNow + (Date.now() % 12_000) : Date.now()
  return treeHtml({ planText: readFileSync(file, 'utf8'), flags, theme, nowMs: now, motion, aliveNames: isSample ? ['codex-1', 'reika', 'sonnet-2', 'codex-2', 'sonnet-1', 'haiku-1', 'haiku-2', 'helper'] : [], youLines: [] })
}

const page = (theme: Theme, initial: Record<string, boolean>): string => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cockpit plan tree preview</title>
${pageCss(theme)}<style>.top{margin-bottom:12px;font:12px sans-serif;color:${PAGE_COLORS[theme].mute}}.top button{margin-right:6px}</style></head>
<body><div class="top">Cockpit plan tree preview of ${file.replace(/&/g, '&amp;').replace(/</g, '&lt;')}. Click a chevron to expand or collapse (or open it pre-expanded with a link ending in ?open=pm-polish,pc-needs).
<button id="t">Switch to ${theme === 'dark' ? 'light' : 'dark'}</button><button id="r">Reset</button><label><input type="checkbox" id="m" checked> motion</label></div>
<div id="tree">${render(initial, theme, true)}</div>
<script>
var flags = ${JSON.stringify(initial)}, theme = ${JSON.stringify(theme)}
function load() {
  var m = document.getElementById('m').checked ? 1 : 0
  fetch('/tree?theme=' + theme + '&motion=' + m + '&flags=' + encodeURIComponent(JSON.stringify(flags))).then(function (r) { return r.text() }).then(function (h) { document.getElementById('tree').innerHTML = h })
}
document.getElementById('tree').addEventListener('click', function (e) {
  var b = e.target.closest ? e.target.closest('button.chev') : null
  if (!b || !b.dataset.flag) return
  flags[b.dataset.flag] = b.dataset.open !== '1'
  load()
})
document.getElementById('t').onclick = function () { location.search = '?theme=' + (theme === 'dark' ? 'light' : 'dark') + '&open=' + Object.keys(flags).filter(function (k) { return flags[k] }).join(',') }
document.getElementById('r').onclick = function () { flags = {}; load() }
document.getElementById('m').onchange = load
</script></body></html>`

const server = Bun.serve({
  hostname: '127.0.0.1',
  port,
  fetch(req) {
    const u = new URL(req.url)
    if (u.pathname === '/tree') {
      let flags: Record<string, boolean> = {}
      try {
        const raw = JSON.parse(u.searchParams.get('flags') ?? '{}') as Record<string, unknown>
        for (const [k, v] of Object.entries(raw)) if (typeof v === 'boolean' && /^[A-Za-z0-9_.-]{1,80}$/.test(k)) flags[k] = v
      } catch {
        flags = {}
      }
      const theme: Theme = u.searchParams.get('theme') === 'light' ? 'light' : 'dark'
      return new Response(render(flags, theme, u.searchParams.get('motion') !== '0'), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
    if (u.pathname === '/') {
      const theme: Theme = u.searchParams.get('theme') === 'light' ? 'light' : u.searchParams.get('theme') === 'dark' ? 'dark' : defTheme
      const initial: Record<string, boolean> = {}
      for (const k of (u.searchParams.get('open') ?? '').split(',')) if (/^[A-Za-z0-9_.-]{1,80}$/.test(k)) initial[k] = true
      return new Response(page(theme, initial), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
    return new Response('Not found. Open the root page.', { status: 404 })
  },
})
writeFileSync(PID, String(process.pid))
const stop = (): never => {
  rmSync(PID, { force: true })
  server.stop(true)
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
console.log('Plan tree preview: http://127.0.0.1:' + server.port + '/')
console.log('Stop it with Ctrl-C, or run: bun ' + join(import.meta.dir, 'plan-preview.ts') + ' --stop')
