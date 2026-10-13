// Screenshots of the plan page (headless Chrome only):  bun tools/pageshot.ts
// Builds the page from tools/sample/plan.json, then writes docs/img/page-{home,steps,asleep,done}-{dark,light}.png.
// "travel-1" and "travel-2" freeze the trip to the goal area at 30% and 70% (window.CHR_P). "steps" opens the first milestone, expands a step and shows its question box with text typed in.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const dir = mkdtempSync(join(tmpdir(), 'pageshot-'))
const built = join(dir, 'page.html')
// The characters pick animations at random; a fixed seed (window.CHR_SEED, read at load) keeps every picture the same.
const SEED = '<script>window.CHR_SEED=7</script>'
const build = (plan: string): string => {
  const b = Bun.spawnSync(['python3', join(ROOT, 'tools/plan-page-build'), join(ROOT, 'tools/sample', plan), built])
  if (b.exitCode !== 0) throw new Error('plan-page-build failed: ' + b.stderr.toString())
  return SEED + readFileSync(built, 'utf8')
}
const page = build('plan.json')
const steps = `<script>setTimeout(()=>{const m=document.querySelector('.mcard');if(m)m.click();setTimeout(()=>{const d=[...document.querySelectorAll('details')].filter(x=>x.querySelector('[data-ask]'))[1];if(d){d.open=true;d.querySelector('[data-ask]').click();d.querySelector('.act input').value='Why is this waiting on the pin bump?'}},400)},500)</script>`
const scenes = [{ name: 'home', extra: '', h: 800, page }, { name: 'steps', extra: steps, h: 920, page }, { name: 'asleep', extra: '', h: 800, page: build('plan-quiet.json') }, { name: 'done', extra: '', h: 800, page: build('plan-done.json') }, { name: 'travel-1', extra: '<script>window.CHR_P=0.3</script>', h: 800, page: build('plan-done.json') }, { name: 'travel-2', extra: '<script>window.CHR_P=0.7</script>', h: 800, page: build('plan-done.json') }]
mkdirSync(join(ROOT, 'docs/img'), { recursive: true })
for (const s of scenes) {
  const f = join(dir, s.name + '.html')
  writeFileSync(f, s.page + s.extra)
  for (const [theme, scheme] of [['dark', 0], ['light', 1]] as const) {
    const out = join(ROOT, 'docs/img', `page-${s.name}-${theme}.png`)
    const p = Bun.spawnSync([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--blink-settings=preferredColorScheme=${scheme}`, '--force-device-scale-factor=1', `--window-size=480,${s.h}`, '--virtual-time-budget=5000', `--screenshot=${out}`, 'file://' + f], { stdout: 'ignore', stderr: 'ignore' })
    console.log(p.exitCode === 0 ? 'wrote ' + out : 'chrome failed for ' + out)
  }
}
rmSync(dir, { recursive: true, force: true })
