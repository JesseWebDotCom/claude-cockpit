// A contact sheet of every frame of every character animation, and two short GIFs:  bun tools/charsheet.ts
// Writes docs/img/characters-sheet-{dark,light}.png and docs/img/characters-{run,dance}.gif (headless Chrome and ffmpeg; no window opens).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const ROOT = resolve(import.meta.dir, '..')
const OUT = join(ROOT, 'docs/img')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const C = createRequire(import.meta.url)('../assets/characters.js')
const COLOUR: Record<string, string> = { asleep: 'todo', running: 'run', you: 'blk', todo: 'todo', done: 'done', dance: 'run' }
const THEMES = {
  dark: '--bg:#121816;--panel:#1a2220;--fg:#e6ece8;--mute:#93a09a;--run:#6aa8f5;--blk:#f0a066;--done:#5fc28a;--todo:#8f9a95;--cout:#050807',
  light: '--bg:#f6f7f5;--panel:#fff;--fg:#1c2421;--mute:#68736e;--run:#1a6fd4;--blk:#b4531a;--done:#2c7a4b;--todo:#8a938f;--cout:#161c1a',
}
const css = (theme: keyof typeof THEMES, px: number): string => `<style>:root{${THEMES[theme]}}body{margin:0;padding:10px;background:var(--bg);color:var(--fg);font:11px monospace}
.chr{display:inline-block;width:${px}px;height:${px}px;margin:2px;--cb:var(--c)}.chr svg{width:100%;height:100%;display:block}
.o{fill:var(--cout)}.b{fill:var(--cb)}.d{fill:color-mix(in srgb,var(--cb) 62%,#000)}.s{fill:#f3c38f}.e{fill:#1b1f22}.m{fill:#b4533f}.k{fill:#2c3036}.w{fill:#fff}.y{fill:#f2c230}.z{fill:var(--mute)}.x{fill:var(--mute);opacity:.6}
.row{display:flex;align-items:center;border-bottom:1px solid var(--mute);padding:3px 0}.row b{width:120px;flex:none}</style>`
const fig = (rows: string[], group: string, px = 60): string => `<span class="chr" style="--c:var(--${COLOUR[group]})"><svg viewBox="0 0 20 20" shape-rendering="crispEdges">${C.frameRects(rows)}</svg></span>`

const dir = mkdtempSync(join(tmpdir(), 'charsheet-'))
mkdirSync(OUT, { recursive: true })
const shot = (html: string, png: string, w: number, h: number): void => {
  const f = join(dir, 'p.html')
  writeFileSync(f, html)
  Bun.spawnSync([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${w},${h}`, '--virtual-time-budget=500', `--screenshot=${png}`, 'file://' + f], { stdout: 'ignore', stderr: 'ignore' })
}
for (const theme of ['dark', 'light'] as const) {
  const rows = Object.entries(C.CHAR_FR as Record<string, Record<string, { frames: string[][] }>>).flatMap(([g, set]) => Object.entries(set).map(([n, a]) => `<div class="row"><b>${n}<br>${a.frames.length} frames</b>${a.frames.map(f => fig(f, g)).join('')}</div>`))
  shot(`<!doctype html><meta charset=utf-8>${css(theme, 56)}${rows.join('')}`, join(OUT, `characters-sheet-${theme}.png`), 760, 40 + rows.length * 70)
}
// Two GIFs on the dark page: the run cycle and the disco dance, 3 loops of the drawn frames at their own frame rate, 6x.
const gif = (group: string, anim: string, name: string): void => {
  const a = C.CHAR_FR[group][anim]
  a.frames.forEach((f: string[], i: number) => shot(`<!doctype html><meta charset=utf-8>${css('dark', 160)}${fig(f, group)}`, join(dir, `${name}-${String(i).padStart(2, '0')}.png`), 190, 190))
  const g = Bun.spawnSync(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', String(a.fps), '-i', join(dir, `${name}-%02d.png`), '-vf', 'split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse=dither=none', '-loop', '0', join(OUT, `characters-${name}.gif`)])
  console.log(g.exitCode === 0 ? `wrote docs/img/characters-${name}.gif (${a.frames.length} frames)` : 'ffmpeg failed for ' + name)
}
gif('running', 'running-cycle', 'run')
gif('dance', 'dance-disco', 'dance')
rmSync(dir, { recursive: true, force: true })
