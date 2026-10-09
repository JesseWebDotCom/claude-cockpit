// The System card is generic: this computer always, plus the hosts and services the user lists in the config file. No built-in machine or product name;
// nothing listed means nothing extra shown or probed.

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { graphOf, paneSvgTree, probesForTest, setReadingsForTest, useProject } from '../hooks/register.tsx'
import { emptyReading } from '../hooks/system.ts'
import { serviceFrom } from '../hooks/hosts.ts'
import { isWellFormed } from './helpers.ts'

const ROOT = resolve(import.meta.dir, '..')
const HOOKS = resolve(ROOT, 'hooks')

// ---------------------------------------------------------------- the shipped source names no machine and no product

// The banned words are assembled from pieces so this file does not itself name them.
const BANNED = [['Box', ' memory'], ["label: '", "Box'"], ['87', '87'], ['87', '70'], ['laptop', '-linux'], ['St', 'ack'], ['Hu', 'b and st', 'ack'], ['HEALTH_', 'HUB_URL'], ['hu', 'bDot'], ['sta', 'ckDot'], ['remote', 'Host']].map(p => p.join(''))

test('the shipped source (hooks/) names no machine, product, port or host alias', () => {
  const files = readdirSync(HOOKS).filter(f => /\.(ts|tsx)$/.test(f))
  expect(files.length).toBeGreaterThan(10)
  for (const f of files) {
    const text = readFileSync(resolve(HOOKS, f), 'utf8')
    for (const bad of BANNED) {
      if (text.includes(bad)) throw new Error(f + ' holds ' + JSON.stringify(bad))
    }
  }
})

// ---------------------------------------------------------------- the probes, with a fake engine

type Fake = { calls: string[][]; $: any }
function fake(answers: { ssh?: string; sshExit?: number; curl?: string } = {}): Fake {
  const calls: string[][] = []
  const $: any = {
    fs: { exists: async () => false, read: async () => '' },
    process: {
      run: async (argv: string[]) => {
        calls.push(argv)
        const bin = argv[0]
        if (bin === 'ssh') return { exitCode: answers.sshExit ?? 0, stdout: answers.sshExit ? '' : answers.ssh ?? '', stderr: '' }
        if (bin === 'curl') return { exitCode: 0, stdout: answers.curl ?? '200 0.0421', stderr: '' }
        if (bin === 'memory_pressure') return { exitCode: 0, stdout: 'System-wide memory free percentage: 41%\n', stderr: '' }
        if (bin === 'sysctl') return { exitCode: 0, stdout: argv[2] === 'hw.ncpu' ? '10\n' : argv[2] === 'vm.loadavg' ? '{ 2.10 1.95 1.80 }\n' : 'total = 2048.00M  used = 1024.50M  free = 1023.50M\n', stderr: '' }
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    },
  }
  return { calls, $ }
}
const FREE = '               total        used        free      shared  buff/cache   available\nMem:           31890       12000        5000        1000       14890       19000\nSwap:           8191         512        7679\n5120 MiB, 24576 MiB, 37 %\n'

test('no hosts and no services configured: no ssh call and no HTTP call, and no extra gauge', async () => {
  useProject('/work/app')
  const f = fake()
  const sys = await probesForTest.readSystem(f.$, 1_000_000)
  const health = await probesForTest.readHealth(f.$, 1_000_000)
  expect(f.calls.some(c => c[0] === 'ssh')).toBe(false)
  expect(f.calls.some(c => c[0] === 'curl')).toBe(false)
  expect(sys.hosts).toEqual([])
  expect(health.services).toEqual([])
  expect(sys.reading.memFree).toBe(41)
})

test('a configured host is read with one ssh and keeps its own name; a service is read with one GET', async () => {
  useProject('/work/app', '/home/alex', [], { hosts: [{ name: 'host-a', ssh: 'gpu-alias', gpu: true }], services: [{ name: 'Web app', url: 'http://localhost:3000/health' }] })
  const f = fake({ ssh: FREE })
  const sys = await probesForTest.readSystem(f.$, 3_000_000)
  const health = await probesForTest.readHealth(f.$, 3_000_000)
  const ssh = f.calls.filter(c => c[0] === 'ssh')
  expect(ssh).toHaveLength(1)
  expect(ssh[0]?.[5]).toBe('gpu-alias')
  expect(sys.hosts).toHaveLength(1)
  expect(sys.hosts[0]).toMatchObject({ name: 'host-a', answered: true })
  expect(sys.hosts[0]?.mem?.freePct).toBe(59.6)
  expect(sys.hosts[0]?.gpu?.usedMB).toBe(5120)
  expect(f.calls.filter(c => c[0] === 'curl')).toHaveLength(1)
  expect(health.services).toEqual([{ name: 'Web app', target: 'http://localhost:3000/health', dot: 'green', ms: 42, unreachable: false }])
  // Within 60 s the host is not asked again.
  setReadingsForTest(sys, health)
  const again = await probesForTest.readSystem(f.$, 3_020_000)
  expect(f.calls.filter(c => c[0] === 'ssh')).toHaveLength(1)
  expect(again.hosts).toHaveLength(1)
  useProject('/work/app')
})

test('a host without the gpu flag is never asked for its GPU; an ssh that fails is "did not answer"', async () => {
  useProject('/work/app', '/home/alex', [], { hosts: [{ name: 'nas', ssh: 'nas-alias' }] })
  const f = fake({ sshExit: 255 })
  const sys = await probesForTest.readSystem(f.$, 4_000_000)
  expect(f.calls.find(c => c[0] === 'ssh')?.[6]).toBe('free -m; true')
  expect(sys.hosts).toEqual([{ name: 'nas', answered: false, mem: null, gpu: null }])
  useProject('/work/app')
})

// ---------------------------------------------------------------- the card

const el = (type: string) => (p: any) => ({ type, props: p, children: p.children ?? [] })
const kit: any = { Box: el('Box'), Text: el('Text'), Button: el('Button'), Svg: el('Svg'), Input: el('Input') }
const $card: any = { ui: { invalidate: () => undefined, toast: () => undefined }, fs: { write: async () => undefined } }
const walk = (n: any, out: any[] = []): any[] => {
  if (n && typeof n === 'object') {
    out.push(n)
    if (Array.isArray(n.children)) for (const c of n.children) walk(c, out)
  }
  return out
}
const tree = (): any => paneSvgTree($card, kit, 100, undefined, 1_000_000, graphOf(), [], [])
const byKey = (t: any, k: string): any => walk(t).find(n => n.props?.key === k)

const sysWith = (hosts: any[]) => ({ at: 1, reading: { ...emptyReading, memFree: 38, swapMB: 512, load1: 3.1, cores: 10, diskFree: 52 }, hosts, hostsAt: 1 })

test('the System card with no hosts and no services: this computer only, no host gauge', () => {
  useProject('/work/app')
  setReadingsForTest(sysWith([]), { at: 1, services: [], credits: null })
  byKey(tree(), 'cs-system').props.onPress()
  const t = tree()
  const sys = String(byKey(t, 'svg-system').props.source)
  expect(sys).toContain('Memory 62% used')
  expect(sys).toContain('CPU load 3.1')
  expect(sys).toContain('Disk 48% used')
  const words = [...sys.matchAll(/>([^<]*)<\/text>/g)].map(m => m[1] ?? '').join(' | ')
  expect(words).not.toMatch(/Box|GPU|ssh/)
  expect(String(byKey(t, 'svg-health').props.source)).not.toMatch(new RegExp(['Hu' + 'b', 'St' + 'ack', 'Web app'].join('|')))
  expect(JSON.stringify(t)).not.toMatch(new RegExp(BANNED.filter((_, i) => i !== 1 && i !== 6).join('|')))
  byKey(t, 'cs-system').props.onPress()
})

test('the System card with a host and services: the host under its own name, the services up and down', () => {
  const hosts = [{ name: 'host-a', answered: true, mem: { totalMB: 31890, availMB: 11000, freePct: 37, swapUsedMB: 0 }, gpu: { usedMB: 5120, totalMB: 24576, util: 37 } }]
  const services = [serviceFrom({ name: 'Web app', kind: 'http', target: 'http://localhost:3000/health', timeoutMs: 2000, ssh: '' }, '200 0.0421'), serviceFrom({ name: 'Queue', kind: 'http', target: 'http://localhost:4000', timeoutMs: 2000, ssh: '' }, '000 0')]
  setReadingsForTest(sysWith(hosts), { at: 1, services, credits: null })
  byKey(tree(), 'cs-system').props.onPress()
  const t = tree()
  const sys = String(byKey(t, 'svg-system').props.source)
  expect(sys).toContain('host-a memory 63% used')
  expect(sys).toContain('host-a GPU memory 21% used')
  const health = String(byKey(t, 'svg-health').props.source)
  expect(health).toContain('Web app')
  expect(health).toContain('up, 42 ms')
  expect(health).toContain('Queue')
  expect(health).toContain('down')
  expect(isWellFormed(health)).toBe(true)
  expect(isWellFormed(sys)).toBe(true)
  byKey(t, 'cs-system').props.onPress()
  setReadingsForTest({ at: 0, reading: emptyReading, hosts: [], hostsAt: -Infinity }, { at: 0, services: [], credits: null })
})
