// Screenshots of the plan page (headless Chrome only):  bun tools/pageshot.ts
// Builds the page from tools/sample/plan.json, then writes docs/img/page-{home,steps}-{dark,light}.png.
// "steps" opens the first milestone, expands a step and shows its question box with text typed in.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const dir = mkdtempSync(join(tmpdir(), 'pageshot-'))
const built = join(dir, 'page.html')
const b = Bun.spawnSync(['python3', join(ROOT, 'tools/plan-page-build'), join(ROOT, 'tools/sample/plan.json'), built])
if (b.exitCode !== 0) throw new Error('plan-page-build failed: ' + b.stderr.toString())
const page = readFileSync(built, 'utf8')
const steps = `<script>setTimeout(()=>{const m=document.querySelector('.mcard');if(m)m.click();setTimeout(()=>{const d=[...document.querySelectorAll('details')].filter(x=>x.querySelector('[data-ask]'))[1];if(d){d.open=true;d.querySelector('[data-ask]').click();d.querySelector('.act input').value='Why is this waiting on the pin bump?'}},400)},500)</script>`
const scenes = [{ name: 'home', extra: '', h: 800 }, { name: 'steps', extra: steps, h: 920 }]
mkdirSync(join(ROOT, 'docs/img'), { recursive: true })
for (const s of scenes) {
  const f = join(dir, s.name + '.html')
  writeFileSync(f, page + s.extra)
  for (const [theme, scheme] of [['dark', 0], ['light', 1]] as const) {
    const out = join(ROOT, 'docs/img', `page-${s.name}-${theme}.png`)
    const p = Bun.spawnSync([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--blink-settings=preferredColorScheme=${scheme}`, '--force-device-scale-factor=1', `--window-size=480,${s.h}`, '--virtual-time-budget=5000', `--screenshot=${out}`, 'file://' + f], { stdout: 'ignore', stderr: 'ignore' })
    console.log(p.exitCode === 0 ? 'wrote ' + out : 'chrome failed for ' + out)
  }
}
rmSync(dir, { recursive: true, force: true })
