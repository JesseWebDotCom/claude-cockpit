import { expect, test } from './pure.ts'

import {
  cpuLevel,
  diskLevel,
  gaugesOf,
  memoryLevel,
  parseCores,
  parseDf,
  parseFreeM,
  parseLoadAvg,
  parseMemoryPressure,
  parseNvidia,
  parseSwapUsedMB,
  parseTopMemory,
  systemSummary,
  topLine,
  worst,
} from '../hooks/system.ts'
import type { SystemReading } from '../hooks/system.ts'

// The exact outputs of the commands (macOS 26 and an Ubuntu box).
const MEMORY_PRESSURE = 'System-wide memory free percentage: 41%\n'
const SWAPUSAGE = 'total = 2048.00M  used = 1024.50M  free = 1023.50M  (encrypted)\n'
const LOADAVG = '{ 2.10 1.95 1.80 }\n'
const DF = 'Filesystem    1024-blocks      Used Available Capacity iused      ifree %iused  Mounted on\n/dev/disk3s1s1   494384795  15000000 200000000     7%  355483 2000000000    0%   /\n'
const PS = ' 1258291 /Applications/Claude.app/Contents/MacOS/Claude\n  850000 /Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Helper (Renderer)\n  412345 /usr/local/bin/node\n   98765 /usr/sbin/mDNSResponder\n    1024 /sbin/launchd\n'
const FREE_M = '               total        used        free      shared  buff/cache   available\nMem:           31890       12000        5000        1000       14890       19000\nSwap:           8191         512        7679\n'
const NVIDIA = '5120 MiB, 24576 MiB, 37 %\n'

// ---------------------------------------------------------------------------
// Parsers

test('memory_pressure -Q: the free percentage', async () => {
  expect(parseMemoryPressure(MEMORY_PRESSURE)).toBe(41)
  expect(parseMemoryPressure('System-wide memory free percentage: 6%')).toBe(6)
  expect(parseMemoryPressure('System-wide memory free percentage: 100%')).toBe(100)
  expect(parseMemoryPressure('')).toBe(null)
  expect(parseMemoryPressure('The system has 17179869184 (1048576 pages)')).toBe(null)
})

test('vm.swapusage: used swap in MB, any unit', async () => {
  expect(parseSwapUsedMB(SWAPUSAGE)).toBe(1024.5)
  expect(parseSwapUsedMB('total = 8192.00M  used = 0.00M  free = 8192.00M  (encrypted)')).toBe(0)
  expect(parseSwapUsedMB('total = 10.00G  used = 7.25G  free = 2.75G  (encrypted)')).toBe(7424)
  expect(parseSwapUsedMB('total = 100.00K  used = 512.00K  free = 0K')).toBe(0.5)
  expect(parseSwapUsedMB('')).toBe(null)
  expect(parseSwapUsedMB('sysctl: unknown oid')).toBe(null)
})

test('vm.loadavg and hw.ncpu', async () => {
  expect(parseLoadAvg(LOADAVG)).toEqual([2.1, 1.95, 1.8])
  expect(parseLoadAvg('{ 12.00 8.50 4.25 }')).toEqual([12, 8.5, 4.25])
  expect(parseLoadAvg('')).toBe(null)
  expect(parseLoadAvg('{ x y z }')).toBe(null)
  expect(parseCores('10\n')).toBe(10)
  expect(parseCores('0')).toBe(null)
  expect(parseCores('ten')).toBe(null)
  expect(parseCores('')).toBe(null)
})

test('df -k /: the free share of the volume', async () => {
  const d = parseDf(DF)
  expect(d?.totalKB).toBe(494384795)
  expect(d?.availKB).toBe(200000000)
  expect(d?.freePct).toBe(40.5)
  expect(parseDf('Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda1 1000 900 100 90% /')?.freePct).toBe(10)
  expect(parseDf('')).toBe(null)
  expect(parseDf('Filesystem 1024-blocks\n')).toBe(null)
  expect(parseDf('header\n/dev/x 0 0 0 0% /')).toBe(null)
})

test('ps -Ao rss=,comm=: the top three by memory, names only', async () => {
  const top = parseTopMemory(PS)
  expect(top).toEqual([
    { name: 'Claude', mb: 1229 },
    { name: 'Google Chrome Helper (Renderer)', mb: 830 },
    { name: 'node', mb: 403 },
  ])
  // No path and no argument leaks into a name.
  for (const p of top) expect(p.name).not.toContain('/')
  expect(parseTopMemory(PS, 5).length).toBe(5)
  expect(parseTopMemory('')).toEqual([])
  expect(parseTopMemory('garbage\n\n  12 \n')).toEqual([])
  expect(topLine(top)).toBe('Top memory: Claude 1.2 GB, Google Chrome Helper (Renderer) 830 MB, node 403 MB')
  expect(topLine([])).toBe('Top memory: unknown')
})

test('free -m on the box: available memory over the total, and swap used', async () => {
  const m = parseFreeM(FREE_M)
  expect(m).toEqual({ totalMB: 31890, availMB: 19000, freePct: 59.6, swapUsedMB: 512 })
  // Old output with no "available" column: free plus buffers and cache.
  const old = parseFreeM('             total       used       free     shared    buffers     cached\nMem:          8000       6000       1000        100        500        500\nSwap:         2048          0       2048\n')
  expect(old?.freePct).toBe(25)
  expect(parseFreeM('')).toBe(null)
  expect(parseFreeM('free: command not found')).toBe(null)
  expect(parseFreeM('total used\nMem: 0 0 0')).toBe(null)
})

test('nvidia-smi csv: the first GPU, or none when the tool is missing', async () => {
  expect(parseNvidia(NVIDIA)).toEqual({ usedMB: 5120, totalMB: 24576, util: 37 })
  expect(parseNvidia(FREE_M + NVIDIA)).toEqual({ usedMB: 5120, totalMB: 24576, util: 37 })
  expect(parseNvidia('')).toBe(null)
  expect(parseNvidia('bash: nvidia-smi: command not found')).toBe(null)
  expect(parseNvidia('NVIDIA-SMI has failed because it could not communicate')).toBe(null)
})

// ---------------------------------------------------------------------------
// Levels

test('memory: green at 25% free or more and under 2 GB swap; amber 10 to 25% or 2 to 6 GB; red under 10% or over 6 GB', async () => {
  expect(memoryLevel(41, 1024)).toBe('green')
  expect(memoryLevel(25, 0)).toBe('green')
  expect(memoryLevel(24.9, 0)).toBe('amber')
  expect(memoryLevel(10, 0)).toBe('amber')
  expect(memoryLevel(9.9, 0)).toBe('red')
  expect(memoryLevel(0, 0)).toBe('red')
  expect(memoryLevel(50, 2047)).toBe('green')
  expect(memoryLevel(50, 2048)).toBe('amber')
  expect(memoryLevel(50, 6144)).toBe('amber')
  expect(memoryLevel(50, 6145)).toBe('red')
  // Either one alone sets the level: the worse wins.
  expect(memoryLevel(60, 7000)).toBe('red')
  expect(memoryLevel(5, 0)).toBe('red')
  expect(memoryLevel(15, 3000)).toBe('amber')
  // Unknown readings are left out; all unknown is grey.
  expect(memoryLevel(null, 100)).toBe('green')
  expect(memoryLevel(30, null)).toBe('green')
  expect(memoryLevel(null, null)).toBe('grey')
  expect(memoryLevel(Number.NaN, null)).toBe('grey')
})

test('cpu: amber at 1x the cores, red at 2x', async () => {
  expect(cpuLevel(9.9, 10)).toBe('green')
  expect(cpuLevel(10, 10)).toBe('amber')
  expect(cpuLevel(19.9, 10)).toBe('amber')
  expect(cpuLevel(20, 10)).toBe('red')
  expect(cpuLevel(0.1, 1)).toBe('green')
  expect(cpuLevel(null, 10)).toBe('grey')
  expect(cpuLevel(5, null)).toBe('grey')
  expect(cpuLevel(5, 0)).toBe('grey')
})

test('disk: amber under 15% free, red under 8%', async () => {
  expect(diskLevel(40)).toBe('green')
  expect(diskLevel(15)).toBe('green')
  expect(diskLevel(14.9)).toBe('amber')
  expect(diskLevel(8)).toBe('amber')
  expect(diskLevel(7.9)).toBe('red')
  expect(diskLevel(null)).toBe('grey')
  expect(diskLevel(Number.NaN)).toBe('grey')
})

test('worst of some levels; grey only when nothing is known', async () => {
  expect(worst(['green', 'amber', 'green'])).toBe('amber')
  expect(worst(['green', 'red', 'amber'])).toBe('red')
  expect(worst(['grey', 'green'])).toBe('green')
  expect(worst(['grey', 'grey'])).toBe('grey')
  expect(worst([])).toBe('grey')
})

// ---------------------------------------------------------------------------
// The summary and the gauges

const OK: SystemReading = { memFree: 41, swapMB: 1024.5, load1: 2.1, cores: 10, diskFree: 40.5, top: [] }

test('summary: "System: healthy" green', async () => {
  const s = systemSummary(OK, null, false)
  expect(s).toEqual({ level: 'green', text: 'System: healthy', reasons: [], gateHint: false })
})

test('summary: amber says what is tight', async () => {
  expect(systemSummary({ ...OK, memFree: 18 }, null, false)).toMatchObject({ level: 'amber', text: 'System: memory tight' })
  expect(systemSummary({ ...OK, swapMB: 3000 }, null, false).text).toBe('System: memory tight')
  expect(systemSummary({ ...OK, load1: 12 }, null, false).text).toBe('System: cpu busy')
  expect(systemSummary({ ...OK, diskFree: 12 }, null, false).text).toBe('System: disk low')
  // Two amber reasons: the first (memory) leads, both are listed.
  const two = systemSummary({ ...OK, memFree: 18, diskFree: 12 }, null, false)
  expect(two.text).toBe('System: memory tight')
  expect(two.reasons).toEqual(['memory tight', 'disk low'])
})

test('summary: red says "problem" and the worst reason', async () => {
  expect(systemSummary({ ...OK, memFree: 6 }, null, false)).toMatchObject({ level: 'red', text: 'System: problem (memory 6% free)' })
  expect(systemSummary({ ...OK, swapMB: 7424 }, null, false).text).toBe('System: problem (swap 7.3 GB used)')
  expect(systemSummary({ ...OK, load1: 25 }, null, false).text).toBe('System: problem (load 25 on 10 cores)')
  expect(systemSummary({ ...OK, diskFree: 5 }, null, false).text).toBe('System: problem (disk 5% free)')
  // Red beats amber.
  expect(systemSummary({ ...OK, memFree: 18, diskFree: 5 }, null, false).text).toBe('System: problem (disk 5% free)')
})

test('summary: the box counts when ssh answered; a grey box is left out', async () => {
  const mem = (freePct: number) => ({ mem: { totalMB: 1000, availMB: freePct * 10, freePct, swapUsedMB: 0 }, gpu: null })
  expect(systemSummary(OK, mem(60), false).level).toBe('green')
  expect(systemSummary(OK, mem(15), false).text).toBe('System: box memory tight')
  expect(systemSummary(OK, mem(4), false).text).toBe('System: problem (box memory 4% free)')
  expect(systemSummary(OK, { mem: null, gpu: null }, false).level).toBe('green')
  expect(systemSummary(OK, null, false).level).toBe('green')
})

test('summary: unknown readings are "System: unknown", never NaN', async () => {
  const s = systemSummary({ memFree: null, swapMB: null, load1: null, cores: null, diskFree: null, top: [] }, null, false)
  expect(s.text).toBe('System: unknown')
  expect(s.level).toBe('grey')
  expect(s.text).not.toMatch(/NaN|undefined/)
})

test('summary: "gate blocked by memory?" only when a gate lane waits and the Mac\'s memory is red', async () => {
  const red = { ...OK, memFree: 6 }
  expect(systemSummary(red, null, true)).toMatchObject({ gateHint: true, text: 'System: problem (memory 6% free) \u00b7 gate blocked by memory?' })
  expect(systemSummary(red, null, false).gateHint).toBe(false)
  expect(systemSummary({ ...OK, memFree: 18 }, null, true).gateHint).toBe(false)
  expect(systemSummary(OK, null, true)).toMatchObject({ gateHint: false, text: 'System: healthy' })
  // Disk red with a waiting gate is not a memory hint.
  expect(systemSummary({ ...OK, diskFree: 5 }, null, true).gateHint).toBe(false)
})

test('gauges: memory, cpu, disk; the cpu bar is full at twice the cores; the box when asked', async () => {
  const g = gaugesOf({ ...OK, load1: 20 }, null, false)
  expect(g.map(x => x.label)).toEqual(['Memory 59% used', 'CPU load 20', 'Disk 60% used'])
  expect(g[0]).toMatchObject({ level: 'green', note: '41% free, swap 1 GB' })
  expect(g[1]).toMatchObject({ ratio: 1, level: 'red', note: '10 cores' })
  expect(Math.round((g[2]?.ratio ?? 0) * 1000)).toBe(595)
  // With the box: memory and GPU gauges; with ssh not answering: a grey line.
  const box = gaugesOf(OK, { mem: { totalMB: 31890, availMB: 19000, freePct: 59.6, swapUsedMB: 0 }, gpu: { usedMB: 5120, totalMB: 24576, util: 37 } }, true)
  expect(box.map(x => x.label)).toEqual(['Memory 59% used', 'CPU load 2.1', 'Disk 60% used', 'Box memory 40% used', 'GPU memory 21% used'])
  expect(box[4]).toMatchObject({ level: 'green', note: '5 of 24 GB, util 37%' })
  expect(gaugesOf(OK, null, true)[3]).toEqual({ label: 'Box', ratio: null, level: 'grey', note: 'ssh did not answer' })
  expect(gaugesOf(OK, { mem: null, gpu: null }, true)[3]?.level).toBe('grey')
  // Unknown readings give empty bars, not NaN.
  const unknown = gaugesOf({ memFree: null, swapMB: null, load1: null, cores: null, diskFree: null, top: [] }, null, false)
  expect(unknown.every(x => x.ratio === null && x.level !== 'red')).toBe(true)
  expect(JSON.stringify(unknown)).not.toMatch(/NaN|undefined/)
  // A box with memory but no GPU draws only the memory gauge.
  expect(gaugesOf(OK, { mem: { totalMB: 1000, availMB: 500, freePct: 50, swapUsedMB: 0 }, gpu: null }, true).length).toBe(4)
})
