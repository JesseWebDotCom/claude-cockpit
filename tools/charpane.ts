// 0.26.70: screenshots of the characters in the REAL pane tree (paneSvgTree), headless Chrome only:  bun tools/charpane.ts
// Writes shots/pane-chars-{home,out1,out2,away,long}-{dark,light}.png. Animations are paused so the pose is the one the clock gives (a negative animation delay carries the time).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { graphOf, paneSvgTree, setCardSourcesForTest } from '../hooks/register.tsx'
import { parsePlan } from '../hooks/plan.ts'
import { setTheme } from '../hooks/tokens.ts'
import { loadChars, resetTripForTest, setSeedForTest } from '../hooks/chars.ts'

const ROOT = resolve(import.meta.dir, '..')
const SHOTS = join(ROOT, 'shots')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(SHOTS, { recursive: true })
if (!(await loadChars())) throw new Error('assets/characters.js did not load')
setSeedForTest(1234)
const T0 = Date.parse('2026-10-12T12:00:00+00:00')
const W = 420
const mk = (title: string, done: boolean) => JSON.stringify({
  plan: title.length > 30 ? title : 'Ship the plan tree',
  updated: '2026-10-12T11:58:00+00:00',
  milestones: [
    { id: 'build', title, steps: [
      { id: 'T-1', title: 'Read the old plan', state: 'done', kind: 'research' },
      { id: 'T-2', title: 'Write the guide', state: 'done', kind: 'docs' },
      { id: 'T-3', title: 'Draw the workers', state: done ? 'done' : 'running', kind: 'code', owner: 'codex-1', startedAt: '2026-10-12T11:40:00+00:00' },
      { id: 'T-4', title: 'Check the colours', state: done ? 'done' : 'todo' },
    ] },
  ],
})
const html = (n: any): string => {
  if (n === null || n === undefined || n === false) return ''
  if (typeof n === 'string') return n.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  if (Array.isArray(n)) return n.map(c => html(c)).join('')
  const p = n.props ?? {}
  const kids = html(n.children)
  if (n.type === 'Svg') return `<div class="svg">${p.source}</div>`
  if (n.type === 'Button') return `<button class="b ${p.plain ? 'plain' : ''}">${html(p.label ?? n.children)}</button>`
  if (n.type === 'Text') return `<span class="t">${kids}</span>`
  return `<div class="box" style="display:flex;flex-direction:${p.flexDirection ?? 'column'};align-items:${p.alignItems ?? 'stretch'};gap:${(p.columnGap ?? 0) * 8}px">${kids}</div>`
}
const el = (type: string) => (p: any) => ({ type, props: p, children: p.children ?? [] })
const kit: any = { Box: el('Box'), Text: el('Text'), Button: el('Button'), Svg: el('Svg'), Input: el('Input') }
const $: any = { ui: { invalidate: () => undefined, toast: () => undefined }, fs: { write: async () => undefined } }
/** Draws the pane at each time in turn (the trip state carries over, as it does in the host) and returns the last tree. */
const drawAt = (planText: string, times: number[]): any => {
  resetTripForTest()
  let tree: any = null
  for (const t of times) { setCardSourcesForTest({ plan: parsePlan(planText, t) }); tree = paneSvgTree($, kit, Math.ceil((W + 8) / 8), undefined, t, graphOf()) }
  return tree
}
// The first draw is the plan not yet complete (so the trip starts at the second); the later ones are the complete plan.
const scenes: [string, string, number[], string][] = [
  ['home', mk('Build the tree', false), [T0], ''],
  ['out1', mk('Build the tree', true), [T0, T0 + 1000, T0 + 1300], ''],
  ['out2', mk('Build the tree', true), [T0, T0 + 1000, T0 + 1850], ''],
  ['away', mk('Build the tree', true), [T0, T0 + 1000, T0 + 5000], ''],
  ['long', mk('Build the whole plan tree with workers, cards, a trip and the dark and light themes', true), [T0, T0 + 1000, T0 + 5000], ''],
]
for (const theme of ['dark', 'light'] as const) {
  setTheme(theme)
  const bg = theme === 'dark' ? '#1b1b1b' : '#ffffff'
  const fg = theme === 'dark' ? '#e6e6e6' : '#1f2328'
  for (const [name, planText, times] of scenes) {
    // out1/out2 render the incomplete plan first: replay with the not-complete plan at times[0].
    let tree: any
    if (name.startsWith('out') || name === 'away' || name === 'long') {
      resetTripForTest()
      const before = planText.replace(/"state":"done"/g, '"state":"done"').replace('"state":"done","kind":"code"', '"state":"running","kind":"code"').replace('"id":"T-4","title":"Check the colours","state":"done"', '"id":"T-4","title":"Check the colours","state":"todo"')
      setCardSourcesForTest({ plan: parsePlan(before, times[0]) }); paneSvgTree($, kit, Math.ceil((W + 8) / 8), undefined, times[0], graphOf())
      for (const t of times.slice(1)) { setCardSourcesForTest({ plan: parsePlan(planText, t) }); tree = paneSvgTree($, kit, Math.ceil((W + 8) / 8), undefined, t, graphOf()) }
    } else tree = drawAt(planText, times)
    const page = `<!doctype html><meta charset=utf-8><style>*{animation-play-state:paused!important}body{margin:0;padding:12px;background:${bg};color:${fg};font:13px -apple-system,Helvetica,sans-serif;width:${W + 76}px}.svg{line-height:0}.svg svg{display:block}.b{font:13px monospace;margin:2px;padding:2px 8px;border:1px solid #888;background:transparent;color:${fg};border-radius:4px}.b.plain{border:0}.box{width:100%}</style>${html(tree)}`
    const f = join(SHOTS, `pane-chars-${name}-${theme}.html`)
    writeFileSync(f, page)
    spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', `--window-size=${W + 64},300`, `--screenshot=${join(SHOTS, `pane-chars-${name}-${theme}.png`)}`, 'file://' + f], { stdio: 'ignore' })
    rmSync(f)
  }
}
console.log('wrote shots/pane-chars-*.png')
