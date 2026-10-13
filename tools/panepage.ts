// 0.23.4: full-pane screenshots from the REAL pane tree (paneSvgTree), not a second layout:  bun tools/panepage.ts
// A fake kit turns the host's Box, Svg, Button and Text into HTML; the Svg sources are the exact strings the host draws. Writes shots/pane-{closed,open}-{dark,light}.png.
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { graphOf, paneSvgTree, setCardSourcesForTest } from '../hooks/register.tsx'
import { parsePlan } from '../hooks/plan.ts'
import { setTheme } from '../hooks/tokens.ts'

const ROOT = resolve(import.meta.dir, '..')
const SHOTS = join(ROOT, 'shots')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(SHOTS, { recursive: true })
const NOW = Date.parse('2026-10-12T12:00:00+00:00')
const W = 420
const planObj = {
  plan: 'Ship the plan tree',
  updated: '2026-10-12T11:58:00+00:00',
  milestones: [
    { id: 'build', title: 'Build the tree', steps: [
      { id: 'T-1', title: 'Read the old plan', state: 'done', kind: 'research' },
      { id: 'T-2', title: 'Write the guide', state: 'done', kind: 'docs' },
      { id: 'T-3', title: 'Draw the workers', state: 'running', kind: 'code', owner: 'codex-1', startedAt: '2026-10-12T11:40:00+00:00', note: 'sprites for every kind' },
      { id: 'T-4', title: 'Check the colours on the dark card', state: 'running', kind: 'review', owner: 'ghost', startedAt: '2026-10-12T10:40:00+00:00' },
    ] },
    { id: 'polish', title: 'Polish and ship', steps: [
      { id: 'T-5', title: 'Pick the colour of the rail', state: 'blocked', owner: 'jesse', note: 'blue or green' },
      { id: 'T-12', title: 'Run the colour bench', state: 'blocked', owner: 'engine', waitingOn: 'T-5', note: 'needs the final name first' },
      ...[6, 7, 8, 9, 10, 11].map(i => ({ id: 'T-' + i, title: 'Todo step number ' + i, state: 'todo' })),
    ] },
  ],
}
const plan = JSON.stringify(planObj)
const planQuiet = JSON.stringify({ ...planObj, milestones: planObj.milestones.map(m => ({ ...m, steps: m.steps.map(st => (st.state === 'blocked' ? { ...st, state: 'todo' } : st)) })) })
let planNow = plan
const html = (n: any, kit: boolean): string => {
  if (n === null || n === undefined || n === false) return ''
  if (typeof n === 'string') return n.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  if (Array.isArray(n)) return n.map(c => html(c, kit)).join('')
  const p = n.props ?? {}
  const kids = html(n.children, kit)
  if (n.type === 'Svg') return `<div class="svg">${p.source}</div>`
  if (n.type === 'Button') return `<button class="b ${p.variant ?? ''} ${p.plain ? 'plain' : ''}">${html(p.label ?? n.children, kit)}</button>`
  if (n.type === 'Text') return `<span class="t">${kids}</span>`
  return `<div class="box" style="display:flex;flex-direction:${p.flexDirection ?? 'column'};align-items:${p.alignItems ?? 'stretch'};gap:${(p.columnGap ?? 0) * 8}px">${kids}</div>`
}
const el = (type: string) => (p: any) => ({ type, props: p, children: p.children ?? [] })
const kit: any = { Box: el('Box'), Text: el('Text'), Button: el('Button'), Svg: el('Svg'), Input: el('Input') }
const $: any = { ui: { invalidate: () => undefined, toast: () => undefined }, fs: { write: async () => undefined } }
const walk = (n: any, out: any[] = []): any[] => { if (n && typeof n === 'object') { out.push(n); if (Array.isArray(n.children)) for (const c of n.children) walk(c, out) } return out }
const draw = (): any => (setCardSourcesForTest({ plan: parsePlan(planNow, NOW) }), paneSvgTree($, kit, Math.ceil((W + 8) / 8), undefined, NOW, graphOf()))
const secKey = (id: string): string => (id === 'needs' ? 'sec-wait-card' : id === 'system' ? 'sec-sys-card' : 'sec-h-' + id)
const press = (id: string): void => walk(draw()).find(n => n.props?.key === secKey(id))?.props.onPress()
const IDS = ['needs', 'tree', 'running', 'blocked', 'todo', 'done', 'off', 'system']
const isOpen = (id: string): boolean => walk(draw()).find(n => n.props?.key === secKey(id))?.props.label === '-'
const set = (open: string[]): void => { for (const id of IDS) if (isOpen(id) !== open.includes(id)) press(id) }

for (const theme of ['dark', 'light'] as const) {
  setTheme(theme)
  const bg = theme === 'dark' ? '#1b1b1b' : '#ffffff'
  const fg = theme === 'dark' ? '#e6e6e6' : '#1f2328'
  const scenes: [string, string[]][] = [['closed', ['needs', 'running', 'blocked', 'todo', 'done', 'off']], ['open', IDS], ['quiet', ['running', 'todo', 'done']], ['needs', ['needs']], ['system', ['system']]]
  for (const [name, open] of scenes) {
    planNow = name === 'quiet' ? planQuiet : plan
    set(open)
    const page = `<!doctype html><meta charset=utf-8><style>body{margin:0;padding:12px;background:${bg};color:${fg};font:13px -apple-system,Helvetica,sans-serif;width:${W + 40}px}.svg{line-height:0}.svg svg{display:block}.b{font:13px monospace;margin:2px;padding:2px 8px;border:1px solid #888;background:transparent;color:${fg};border-radius:4px}.b.plain{border:0}.box{width:100%}</style>${html(draw(), true)}`
    const f = join(SHOTS, `pane-${name}-${theme}.html`)
    writeFileSync(f, page)
    spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${W + 64},1900`, `--screenshot=${join(SHOTS, `pane-${name}-${theme}.png`)}`, 'file://' + f], { stdio: 'ignore' })
    rmSync(f)
  }
}
console.log('wrote shots/pane-*.png')
