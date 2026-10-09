// System resources for the Crew pane: pure parsers for what macOS and a Linux host print, the traffic
// light rules, and the one-line summary. No mods API, no I/O; register.tsx runs the commands (read only,
// nothing is ever killed or changed). Unit tested in tests/system.test.ts.

import { fin } from './core.ts'
import type { GlyphKind } from './glyphs.ts'

export type Level = 'green' | 'amber' | 'red' | 'grey'

const MB_PER_GB = 1024

// ---------------------------------------------------------------------------
// Parsers

// `memory_pressure -Q`: "System-wide memory free percentage: 41%" -> 41.
export function parseMemoryPressure(out: string): number | null {
  const m = /System-wide memory free percentage:\s*(\d{1,3})\s*%/i.exec(out)
  return m ? Math.min(100, Number(m[1])) : null
}

const toMB = (value: number, unit: string): number => {
  const u = unit.toUpperCase()
  return u === 'G' ? value * MB_PER_GB : u === 'K' ? value / MB_PER_GB : u === 'T' ? value * MB_PER_GB * MB_PER_GB : value
}

// `sysctl -n vm.swapusage`: "total = 2048.00M  used = 1024.50M  free = 1023.50M  (encrypted)" -> the used
// swap in MB (a G or K unit is converted).
export function parseSwapUsedMB(out: string): number | null {
  const m = /used\s*=\s*([\d.]+)\s*([KMGT])/i.exec(out)
  if (!m) return null
  const v = toMB(Number(m[1]), m[2] ?? 'M')
  return Number.isFinite(v) ? v : null
}

// `sysctl -n vm.loadavg`: "{ 2.10 1.95 1.80 }" -> [2.1, 1.95, 1.8].
export function parseLoadAvg(out: string): number[] | null {
  const m = /\{?\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\}?/.exec(out)
  if (!m) return null
  const v = [Number(m[1]), Number(m[2]), Number(m[3])]
  return v.every(Number.isFinite) ? v : null
}

// `sysctl -n hw.ncpu`: "10" -> 10.
export function parseCores(out: string): number | null {
  const n = Number(out.trim())
  return Number.isInteger(n) && n > 0 ? n : null
}

export type Df = { totalKB: number; availKB: number; freePct: number }

// `df -k /`: the header line, then "/dev/disk3s1s1 494384795 15000000 200000000 7% ... /" ->
// the free share of the volume: available over the 1024-blocks column.
export function parseDf(out: string): Df | null {
  const line = out.split('\n').map(l => l.trim()).filter(l => l !== '')[1]
  if (line === undefined) return null
  const parts = line.split(/\s+/)
  const total = Number(parts[1])
  const avail = Number(parts[3])
  if (!Number.isFinite(total) || !Number.isFinite(avail) || total <= 0) return null
  return { totalKB: total, availKB: avail, freePct: Math.round(Math.max(0, Math.min(100, (avail / total) * 100)) * 10) / 10 }
}

export type TopProc = { name: string; mb: number }

// `ps -Ao rss=,comm=` (rss in KB, comm the command path): the biggest `n` by memory. Names only: the path
// is cut to its last part and nothing after the command (no args) is ever read.
export function parseTopMemory(out: string, n = 3): TopProc[] {
  const procs: TopProc[] = []
  for (const raw of out.split('\n')) {
    const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(raw)
    if (!m) continue
    const name = (m[2] ?? '').replace(/^.*\//, '').trim()
    if (name === '') continue
    procs.push({ name, mb: Math.round(Number(m[1]) / 1024) })
  }
  return procs.sort((a, b) => b.mb - a.mb).slice(0, n)
}

export type HostMem = { totalMB: number; availMB: number; freePct: number; swapUsedMB: number }

// `free -m` on a host. "available" is the free memory that counts; older output without it falls back
// to free plus buffers and cache.
export function parseFreeM(out: string): HostMem | null {
  const lines = out.split('\n')
  const header = lines.find(l => /\btotal\b/.test(l) && /\bused\b/.test(l))
  const mem = lines.find(l => /^\s*Mem:/.test(l))
  if (!header || !mem) return null
  const cols = header.trim().split(/\s+/)
  const vals = mem.trim().split(/\s+/).slice(1).map(Number)
  const at = (name: string): number | null => {
    const i = cols.indexOf(name)
    const v = i >= 0 ? vals[i] : undefined
    return v !== undefined && Number.isFinite(v) ? v : null
  }
  const total = at('total')
  if (total === null || total <= 0) return null
  const avail = at('available') ?? (at('free') ?? 0) + (at('buff/cache') ?? 0) + (at('buffers') ?? 0) + (at('cached') ?? 0)
  const swap = lines.find(l => /^\s*Swap:/.test(l))
  const swapUsed = swap ? Number(swap.trim().split(/\s+/)[2]) : 0
  return {
    totalMB: total,
    availMB: avail,
    freePct: Math.round(Math.max(0, Math.min(100, (avail / total) * 100)) * 10) / 10,
    swapUsedMB: Number.isFinite(swapUsed) ? swapUsed : 0,
  }
}

export type Gpu = { usedMB: number; totalMB: number; util: number }

// `nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader`:
// "5120 MiB, 24576 MiB, 37 %" -> the first GPU. Anything else (the tool is missing) is no GPU.
export function parseNvidia(out: string): Gpu | null {
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s*MiB\s*,\s*(\d+)\s*MiB\s*,\s*(\d+)\s*%?\s*$/.exec(line)
    if (m) return { usedMB: Number(m[1]), totalMB: Number(m[2]), util: Number(m[3]) }
  }
  return null
}

// ---------------------------------------------------------------------------
// Traffic lights

// Healthy: 25% or more free and under 2 GB swap. Amber: 10 to 25% free, or 2 to 6 GB swap. Red: under 10%
// free, or over 6 GB swap. Either reading alone can set the level; an unknown one is left out.
export function memoryLevel(freePct: number | null, swapMB: number | null): Level {
  const levels: Level[] = []
  if (freePct !== null && fin(freePct)) levels.push(freePct < 10 ? 'red' : freePct < 25 ? 'amber' : 'green')
  if (swapMB !== null && fin(swapMB)) levels.push(swapMB > 6 * MB_PER_GB ? 'red' : swapMB >= 2 * MB_PER_GB ? 'amber' : 'green')
  return worst(levels)
}

// The load average against the core count: amber at 1x, red at 2x.
export function cpuLevel(load: number | null, cores: number | null): Level {
  if (load === null || cores === null || !fin(load) || !fin(cores) || cores <= 0) return 'grey'
  return load >= 2 * cores ? 'red' : load >= cores ? 'amber' : 'green'
}

// Free disk: amber under 15%, red under 8%.
export function diskLevel(freePct: number | null): Level {
  if (freePct === null || !fin(freePct)) return 'grey'
  return freePct < 8 ? 'red' : freePct < 15 ? 'amber' : 'green'
}

const RANK: Record<Level, number> = { grey: 0, green: 1, amber: 2, red: 3 }

// The worst of some levels; grey (unknown) counts only when nothing is known.
export function worst(levels: readonly Level[]): Level {
  const known = levels.filter(l => l !== 'grey')
  if (known.length === 0) return 'grey'
  return known.reduce((a, b) => (RANK[b] > RANK[a] ? b : a))
}

// ---------------------------------------------------------------------------
// The reading and the one-line summary

export type SystemReading = {
  memFree: number | null
  swapMB: number | null
  load1: number | null
  cores: number | null
  diskFree: number | null
  top: TopProc[]
}

/**
 * One configured host as last read (config `hosts`): its own name, whether ssh answered, and what it printed. A host that has not been read yet is not
 * in the list at all.
 */
export type HostReading = { name: string; answered: boolean; mem: HostMem | null; gpu: Gpu | null }

export const emptyReading: SystemReading = { memFree: null, swapMB: null, load1: null, cores: null, diskFree: null, top: [] }

const gb = (mb: number): string => (Math.round((mb / MB_PER_GB) * 10) / 10).toString()

export type Summary = { level: Level; text: string; reasons: string[]; gateHint: boolean }

// "System: healthy" (green), "System: memory tight" (amber), "System: problem (memory 6% free)" (red, the
// worst reason). A listed host counts by its own name when ssh answered; grey (ssh failed) is left out. "gate blocked by
// memory?" is added when a gate lane is waiting and this computer's memory is red.
export function systemSummary(r: SystemReading, hosts: readonly HostReading[], gateWaiting: boolean): Summary {
  type Item = { level: Level; amber: string; red: string }
  const items: Item[] = []
  const mem = memoryLevel(r.memFree, r.swapMB)
  const swapRed = r.swapMB !== null && r.swapMB > 6 * MB_PER_GB
  items.push({
    level: mem,
    amber: 'memory tight',
    red: swapRed && !(r.memFree !== null && r.memFree < 10) ? 'swap ' + gb(r.swapMB ?? 0) + ' GB used' : 'memory ' + (r.memFree ?? 0) + '% free',
  })
  items.push({ level: cpuLevel(r.load1, r.cores), amber: 'cpu busy', red: 'load ' + (r.load1 ?? 0) + ' on ' + (r.cores ?? 0) + ' cores' })
  items.push({ level: diskLevel(r.diskFree), amber: 'disk low', red: 'disk ' + (r.diskFree ?? 0) + '% free' })
  for (const h of hosts) {
    if (h.mem) items.push({ level: memoryLevel(h.mem.freePct, h.mem.swapUsedMB), amber: h.name + ' memory tight', red: h.name + ' memory ' + h.mem.freePct + '% free' })
  }
  const level = worst(items.map(i => i.level))
  const gateHint = gateWaiting && mem === 'red'
  const hint = gateHint ? ' \u00b7 gate blocked by memory?' : ''
  if (level === 'grey') return { level, text: 'System: unknown', reasons: [], gateHint }
  const reasons = items.filter(i => i.level === level).map(i => (level === 'red' ? i.red : i.amber))
  if (level === 'green') return { level, text: 'System: healthy' + hint, reasons: [], gateHint }
  if (level === 'amber') return { level, text: 'System: ' + (reasons[0] ?? 'tight') + hint, reasons, gateHint }
  return { level, text: 'System: problem (' + (reasons[0] ?? 'see details') + ')' + hint, reasons, gateHint }
}

/**
 * `host` is the name of the listed host a gauge belongs to (absent for this computer's own); `isGpu` marks a host's GPU gauge. `kind` is the glyph the card
 * and the status bar draw for it (hooks/glyphs.ts) and `figure` the short text beside that glyph ("62% used", "load 3.1", "host-a 21% used"); a gauge
 * with no reading to show (a host that did not answer) has neither and keeps its plain label.
 */
export type Gauge = { label: string; ratio: number | null; level: Level; note: string; host?: string; isGpu?: boolean; kind?: GlyphKind; figure?: string }

/** GPU memory share used (0 to 1) -> level: amber over 85%, red over 95%, grey when the card reports no size. */
export const gpuLevel = (used: number | null): Level => (used === null || !fin(used) ? 'grey' : used > 0.95 ? 'red' : used > 0.85 ? 'amber' : 'green')

// The small disk-style gauges of the expanded card. Each ratio is the share used (0 to 1); the CPU one is
// load over twice the core count, so a full bar is the red line. This computer's three come first, then each listed host's, labelled with the
// host's own name ("host-a memory 63% used"); no hosts listed means no more gauges. The status bar's icons are made from THESE gauges
// (`healthIcons`), so the bar and the card can never disagree on a level.
export function gaugesOf(r: SystemReading, hosts: readonly HostReading[]): Gauge[] {
  const out: Gauge[] = []
  out.push({
    label: r.memFree === null ? 'Memory' : 'Memory ' + Math.round(100 - r.memFree) + '% used',
    ratio: r.memFree === null ? null : (100 - r.memFree) / 100,
    level: memoryLevel(r.memFree, r.swapMB),
    note: [r.memFree === null ? '' : r.memFree + '% free', r.swapMB === null ? '' : 'swap ' + gb(r.swapMB) + ' GB'].filter(Boolean).join(', '),
    kind: 'memory',
    figure: r.memFree === null ? 'unknown' : Math.round(100 - r.memFree) + '% used',
  })
  out.push({
    label: r.load1 === null ? 'CPU' : 'CPU load ' + r.load1,
    ratio: r.load1 === null || r.cores === null ? null : Math.min(1, r.load1 / (2 * r.cores)),
    level: cpuLevel(r.load1, r.cores),
    note: r.cores === null ? '' : r.cores + ' cores',
    kind: 'cpu',
    figure: r.load1 === null ? 'unknown' : 'load ' + r.load1,
  })
  out.push({
    label: r.diskFree === null ? 'Disk' : 'Disk ' + Math.round(100 - r.diskFree) + '% used',
    ratio: r.diskFree === null ? null : (100 - r.diskFree) / 100,
    level: diskLevel(r.diskFree),
    note: r.diskFree === null ? '' : r.diskFree + '% free',
    kind: 'disk',
    figure: r.diskFree === null ? 'unknown' : Math.round(100 - r.diskFree) + '% used',
  })
  for (const h of hosts) {
    if (h.mem === null && h.gpu === null) {
      out.push({ label: h.name, ratio: null, level: 'grey', note: h.answered ? 'no memory reading' : 'ssh did not answer', host: h.name })
      continue
    }
    if (h.mem) {
      out.push({
        label: h.name + ' memory ' + Math.round(100 - h.mem.freePct) + '% used',
        ratio: (100 - h.mem.freePct) / 100,
        level: memoryLevel(h.mem.freePct, h.mem.swapUsedMB),
        note: h.mem.freePct + '% free',
        host: h.name,
        kind: 'memory',
        figure: h.name + ' ' + Math.round(100 - h.mem.freePct) + '% used',
      })
    }
    if (h.gpu) {
      const used = h.gpu.totalMB > 0 ? h.gpu.usedMB / h.gpu.totalMB : null
      out.push({
        label: h.name + ' GPU memory' + (used === null ? '' : ' ' + Math.round(used * 100) + '% used'),
        ratio: used === null ? null : Math.min(1, used),
        level: gpuLevel(used),
        note: gb(h.gpu.usedMB) + ' of ' + gb(h.gpu.totalMB) + ' GB, util ' + h.gpu.util + '%',
        host: h.name,
        isGpu: true,
        kind: 'gpu',
        figure: h.name + (used === null ? '' : ' ' + Math.round(used * 100) + '% used'),
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// The four health icons (COCKPIT-28): the status bar, the System card header and the open card's gauge rows draw these.

/** One icon: its glyph, its health level (from the gauge it stands for), the accessible label and tooltip ("CPU load 3.1, healthy"). */
export type HealthIcon = { kind: GlyphKind; level: Level; hex: string; label: string; tip: string }

export const LEVEL_WORD: Record<Level, string> = { green: 'healthy', amber: 'watch it', red: 'problem', grey: 'unknown' }

/**
 * The icons of the System card: CPU, memory, disk, then GPU only when a listed host reported a GPU reading. Each level is the level of its gauge in
 * `gaugesOf` (memory: this computer's own; GPU: the worst of the hosts' GPU gauges), so a bar and a card built from one reading always agree. `hasReading`
 * false (nothing read yet) draws the three grey.
 */
export function healthIcons(r: SystemReading, hosts: readonly HostReading[], hasReading = true): HealthIcon[] {
  const gauges = gaugesOf(hasReading ? r : emptyReading, hasReading ? hosts : [])
  const word = (l: Level): string => LEVEL_WORD[l]
  const make = (kind: GlyphKind, level: Level, label: string): HealthIcon => ({ kind, level, hex: LEVEL_COLOR[level], label, tip: label + ', ' + word(level) })
  const own = (kind: GlyphKind): Gauge => gauges.find(g => g.kind === kind && g.host === undefined) as Gauge
  const cpu = own('cpu')
  const mem = own('memory')
  const disk = own('disk')
  const out = [make('cpu', cpu.level, cpu.label), make('memory', mem.level, mem.label), make('disk', disk.level, disk.label)]
  const gpus = gauges.filter(g => g.isGpu === true)
  if (gpus.length > 0) {
    const level = worst(gpus.map(g => g.level))
    const pick = gpus.find(g => g.level === level) ?? (gpus[0] as Gauge)
    out.push(make('gpu', level, pick.label))
  }
  return out
}

/** The worst level of the icons: what the System card's header colour shows (grey only when none is known). */
export const iconsLevel = (icons: readonly HealthIcon[]): Level => worst(icons.map(i => i.level))

// "Top memory: Claude 1.2 GB, Google Chrome Helper 830 MB, node 410 MB": names only.
export function topLine(top: readonly TopProc[]): string {
  if (top.length === 0) return 'Top memory: unknown'
  return 'Top memory: ' + top.map(p => p.name + ' ' + (p.mb >= 1024 ? gb(p.mb) + ' GB' : p.mb + ' MB')).join(', ')
}

export const LEVEL_COLOR: Record<Level, string> = { green: '#3FB950', amber: '#F0A500', red: '#F85149', grey: '#8B949E' }

/**
 * The System card's one-line summary (COCKPIT-26): "memory 62% · cpu 31% · disk 48%". Memory and disk are the share USED, cpu is the one-minute
 * load over the core count; a figure the reading cannot give is left out; none at all says "checking".
 */
export function systemFigures(r: SystemReading, hosts: readonly HostReading[] = []): string {
  const parts: string[] = []
  if (r.load1 !== null && r.cores !== null && fin(r.load1) && fin(r.cores) && r.cores > 0) parts.push('CPU ' + Math.round((r.load1 / r.cores) * 100) + '%')
  if (r.memFree !== null && fin(r.memFree)) parts.push('MEM ' + Math.round(100 - r.memFree) + '%')
  if (r.diskFree !== null && fin(r.diskFree)) parts.push('DISK ' + Math.round(100 - r.diskFree) + '%')
  const gpu = hosts.map(h => h.gpu).find(g => g !== null && g !== undefined && g.totalMB > 0)
  if (gpu) parts.push('GPU ' + Math.round((gpu.usedMB / gpu.totalMB) * 100) + '%')
  return parts.length === 0 ? 'checking' : parts.join(' \u00b7 ')
}

/** COCKPIT-46: one resource of the System summary: its text ("CPU 12%") and its health level (the level of the icon of the same kind). */
export type FigurePart = { kind: GlyphKind; text: string; level: Level }

/** The tone word the header summary colours by (the same classes the Events and System log summaries use); one mapping from the one level definition. */
export const LEVEL_TONE: Record<Level, 'ok' | 'warn' | 'err' | ''> = { green: 'ok', amber: 'warn', red: 'err', grey: '' }

/**
 * COCKPIT-46: the System summary as coloured parts: the same figures as `systemFigures`, each with the level the matching `healthIcons` icon has
 * (green, amber, red by the one set of thresholds). A figure with no icon level (none known) is grey. Empty when nothing is read yet.
 */
export function systemFigureParts(r: SystemReading, hosts: readonly HostReading[] = []): FigurePart[] {
  const icons = healthIcons(r, hosts)
  const levelOf = (k: GlyphKind): Level => icons.find(i => i.kind === k)?.level ?? 'grey'
  const label: Partial<Record<GlyphKind, string>> = { cpu: 'CPU', memory: 'MEM', disk: 'DISK', gpu: 'GPU' }
  const words = systemFigures(r, hosts)
  if (words === 'checking') return []
  const kinds: GlyphKind[] = ['cpu', 'memory', 'disk', 'gpu']
  return words.split(' \u00b7 ').map(t => {
    const kind = kinds.find(k => t.startsWith((label[k] ?? '') + ' ')) ?? 'cpu'
    return { kind, text: t, level: levelOf(kind) }
  })
}
