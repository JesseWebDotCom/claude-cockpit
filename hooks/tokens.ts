// The design tokens, defined once (cockpit v6). Every drawing takes its colours, sizes and spacing from here:
// never a default fill, never white. Dark first; the light set is used only when the person's theme is light.
// The theme comes from the engine's own `theme` setting (settings.ts reads it); with no answer ("auto") the
// svg follows the system through a media query, with the same two sets.

export type ThemeMode = 'dark' | 'light' | 'auto'

// Type scale: caption 11, body 13, title 15; line height 1.4.
export const SIZE = { caption: 11, body: 13, title: 15 } as const
export const LINE = 1.4
// Spacing: row padding 8 vertical, gaps 8, section gaps 12, page gutter 12, radius 8.
export const GAP = 8
export const SECTION_GAP = 12
export const GUTTER = 12
export const RADIUS = 8
export const ROW_PAD = 8
// A member row is 36 px (8 + 20 + 8) with 13 px text; the character is 24 px.
export const ROW_HEIGHT = 36
export const CHAR_PX = 24

export type Palette = {
  // The page behind the pane (only the render tool paints it; the host draws the real one).
  bg: string
  // A card or an expanded row.
  surface: string
  // A chip, a track, a hover.
  raised: string
  line: string
  text: string
  muted: string
  dim: string
  ok: string
  err: string
  warn: string
  info: string
  // The one place the plan's state colours live: running is a calm blue (never red), stuck is orange for a step truly stuck on a fault.
  run: string
  stuck: string
}

export const DARK: Palette = {
  bg: '#1b1b1b',
  surface: '#242424',
  raised: '#333333',
  line: '#3a3a3a',
  text: '#ececec',
  muted: '#a6a6a6',
  dim: '#8c8c8c',
  ok: '#3FB950',
  err: '#F85149',
  warn: '#F0A500',
  info: '#58A6FF',
  run: '#58A6FF',
  stuck: '#E8743B',
}

export const LIGHT: Palette = {
  bg: '#ffffff',
  surface: '#f5f5f4',
  raised: '#e4e4e1',
  line: '#d8d8d4',
  text: '#1f1f1f',
  muted: '#595959',
  dim: '#6b6b6b',
  ok: '#1a7f37',
  err: '#cf222e',
  warn: '#8a5d00',
  info: '#0969da',
  run: '#0969da',
  stuck: '#b34700',
}

let theme: ThemeMode = 'auto'

export const getTheme = (): ThemeMode => theme
export const setTheme = (t: ThemeMode): void => {
  theme = t
}

// The engine's `theme` setting value ("dark", "light", "dark-daltonized", "auto", ...) to a mode.
export const themeFromSetting = (value: unknown): ThemeMode => {
  const v = typeof value === 'string' ? value.toLowerCase() : ''
  return v.includes('dark') ? 'dark' : v.includes('light') ? 'light' : 'auto'
}

export const paletteOf = (mode: ThemeMode = theme): Palette => (mode === 'light' ? LIGHT : DARK)

// ---------------------------------------------------------------------------
// Contrast (WCAG): relative luminance and the ratio of two colours.

const rgb = (c: string): [number, number, number] => {
  const v = parseInt(c.replace('#', '').slice(0, 6), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

const lin = (v: number): number => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export const luminance = (c: string): number => {
  const [r, g, b] = rgb(c)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export const contrast = (a: string, b: string): number => {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const toHex = (r: number, g: number, b: number): string => '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1)

const mixTo = (c: string, to: string, t: number): string => {
  const a = rgb(c)
  const b = rgb(to)
  return toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)
}

const INK_DARK = '#0d1117'
const INK_LIGHT = '#ffffff'

// A chip: `fill` with text on it. The ink is whichever of near-black and white reads better; when even that is
// under 4.5:1 the fill is moved toward the opposite end until it is not. Always at least 4.5:1.
export function pillTone(fill: string): { fill: string; ink: string } {
  const dark = contrast(fill, INK_DARK)
  const light = contrast(fill, INK_LIGHT)
  const ink = dark >= light ? INK_DARK : INK_LIGHT
  let f = fill
  for (let t = 0; contrast(f, ink) < 4.5 && t < 20; t++) f = mixTo(f, ink === INK_DARK ? '#ffffff' : '#000000', 0.08)
  return { fill: f, ink }
}

// Text that sits directly on the page or a card: `color` itself when it reads at 4.5:1 on `on`, else moved
// toward the text colour until it does.
export function legible(color: string, on: string, toward: string): string {
  let c = color
  for (let t = 0; contrast(c, on) < 4.5 && t < 20; t++) c = mixTo(c, toward, 0.1)
  return c
}

// The CSS classes every svg uses, for the current theme. "auto" emits both sets behind a media query.
export function themeCss(mode: ThemeMode = theme): string {
  const set = (p: Palette): string => `.okcs{stroke:${p.ok}}.t{fill:${p.text}}.s{fill:${p.muted}}.m{fill:${p.dim}}.k{fill:${p.raised}}.ln{stroke:${p.line}}.tile{fill:${p.surface}}.raised{fill:${p.raised}}.okc{fill:${p.ok}}.errc{fill:${p.err}}.warnc{fill:${p.warn}}.infoc{fill:${p.info}}.runc{fill:${p.run}}.runs{stroke:${p.run}}.warns{stroke:${p.warn}}.stuckc{fill:${p.stuck}}.stucks{stroke:${p.stuck}}.ts{stroke:${p.text}}.ms{stroke:${p.dim}}`
  if (mode === 'dark') return set(DARK)
  if (mode === 'light') return set(LIGHT)
  return `${set(LIGHT)}@media (prefers-color-scheme: dark){${set(DARK)}}`
}
