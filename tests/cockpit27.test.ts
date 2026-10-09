// COCKPIT-27 (cockpit 0.7.0): the System card is generic: this computer always, plus the hosts and services the user lists in the config file. No built-in
// built-in machine or product name; nothing listed means nothing extra shown or probed.

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect } from './pure.ts'
import { graphOf, paneSvgTree, probesForTest, refreshUnsaved, resetExtrasForTest, resetUnsaved, setReadingsForTest, setRootForTest } from '../hooks/register.tsx'
const TEST_ROOT = '/home/alex/projects/example-app'
setRootForTest(TEST_ROOT)
import { emptyReading } from '../hooks/system.ts'
import { serviceFrom } from '../hooks/hosts.ts'
import { isWellFormed } from './helpers.ts'

const ROOT = resolve(import.meta.dir, '..')
const HOOKS = resolve(ROOT, 'hooks')

// ---------------------------------------------------------------- the shipped source names no product

// The banned words are assembled from pieces so this file does not itself name them.
const BANNED = [['Box', ' memory'], ['87', '87'], ['laptop', '-linux'], ['St', 'ack'], ['Hu', 'b and st', 'ack'], ['HEALTH_', 'HUB_URL'], ['87', '70']].map(p => p.join(''))

test('the shipped source (hooks/) names no built-in machine, product or port', () => {
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
function fake(files: Record<string, string>, answers: { ssh?: string; sshExit?: number; curl?: string } = {}): Fake {
  const calls: string[][] = []
  const $: any = {
    env: { get: async (k: string) => (k === 'HOME' ? '/Users/test' : undefined) },
    fs: {
      exists: async (p: string) => p in files,
      read: async (p: string) => files[p] ?? '',
    },
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
const CONFIG = TEST_ROOT + '/.cockpit/config.json'
const FREE = '               total        used        free      shared  buff/cache   available\nMem:           31890       12000        5000        1000       14890       19000\nSwap:           8191         512        7679\n5120 MiB, 24576 MiB, 37 %\n'

test('no hosts and no services configured: no ssh call and no HTTP call, and no extra gauge', async () => {
  resetExtrasForTest()
  const f = fake({})
  const sys = await probesForTest.readSystem(f.$, 1_000_000)
  const health = await probesForTest.readHealth(f.$, 1_000_000)
  expect(f.calls.some(c => c[0] === 'ssh')).toBe(false)
  expect(f.calls.some(c => c[0] === 'curl')).toBe(false)
  expect(sys.hosts).toEqual([])
  expect(health.services).toEqual([])
  expect(sys.reading.memFree).toBe(41)
})

test('an empty config file is the same: nothing is probed', async () => {
  resetExtrasForTest()
  const f = fake({ [CONFIG]: '{}' })
  await probesForTest.readSystem(f.$, 2_000_000)
  await probesForTest.readHealth(f.$, 2_000_000)
  expect(f.calls.filter(c => c[0] === 'ssh' || c[0] === 'curl')).toEqual([])
})

test('a configured host is read with one ssh and keeps its own name; a service is read with one GET', async () => {
  resetExtrasForTest()
  const f = fake({ [CONFIG]: JSON.stringify({ hosts: [{ name: 'host-a', ssh: 'gpu-alias', gpu: true }], services: [{ name: 'Web app', url: 'http://localhost:3000/health' }] }) }, { ssh: FREE })
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
})

test('a host without the gpu flag is never asked for its GPU; an ssh that fails is "did not answer"', async () => {
  resetExtrasForTest()
  const f = fake({ [CONFIG]: JSON.stringify({ hosts: [{ name: 'nas', ssh: 'nas-alias' }] }) }, { sshExit: 255 })
  const sys = await probesForTest.readSystem(f.$, 4_000_000)
  expect(f.calls.find(c => c[0] === 'ssh')?.[6]).toBe('free -m; true')
  expect(sys.hosts).toEqual([{ name: 'nas', answered: false, mem: null, gpu: null }])
})

test('taking the host out of the config stops the ssh and drops its gauges', async () => {
  resetExtrasForTest()
  const files: Record<string, string> = { [CONFIG]: JSON.stringify({ hosts: [{ name: 'host-a', ssh: 'gpu-alias' }] }) }
  const f = fake(files, { ssh: FREE })
  const first = await probesForTest.readSystem(f.$, 5_000_000)
  expect(first.hosts).toHaveLength(1)
  setReadingsForTest(first, { at: 1, services: [], credits: null })
  files[CONFIG] = '{}'
  const n = f.calls.filter(c => c[0] === 'ssh').length
  const next = await probesForTest.readSystem(f.$, 5_020_000 + 15_000)
  expect(next.hosts).toEqual([])
  expect(f.calls.filter(c => c[0] === 'ssh')).toHaveLength(n)
})

test('the unsaved-work status line reads the repos from the config; none listed means no git call and no line', async () => {
  const status: (string | undefined)[] = []
  const mk = (files: Record<string, string>): Fake => {
    const f = fake(files)
    f.$.clock = { now: async () => 1 }
    f.$.ui = { status: (s: string | undefined) => status.push(s), invalidate: () => undefined, toast: () => undefined }
    return f
  }
  resetExtrasForTest()
  resetUnsaved()
  const none = mk({})
  await refreshUnsaved(none.$, 6_000_000)
  expect(none.calls.some(c => c[0] === 'git')).toBe(false)
  expect(status).toEqual([undefined])
  resetExtrasForTest()
  resetUnsaved()
  const some = mk({ [CONFIG]: JSON.stringify({ repos: ['/work/one', '/work/two'] }) })
  await refreshUnsaved(some.$, 7_000_000)
  expect(some.calls.filter(c => c[0] === 'git' && c[3] === 'status').map(c => c[2])).toEqual(['/work/one', '/work/two'])
  resetExtrasForTest()
  resetUnsaved()
  // The shipped unsaved.ts names no repository and no folder.
  const text = readFileSync(resolve(HOOKS, 'unsaved.ts'), 'utf8')
  expect(text).not.toMatch(/example-app|alex|'home'|'bot'|'commons'/)
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
const tree = (): any => paneSvgTree($card, kit, 100, undefined, 1_000_000, graphOf())
const byKey = (t: any, k: string): any => walk(t).find(n => n.props?.key === k)
const keysOf = (t: any): string[] => walk(t).map(n => n.props?.key).filter((k): k is string => typeof k === 'string')

const sysWith = (hosts: any[]) => ({ at: 1, reading: { ...emptyReading, memFree: 38, swapMB: 512, load1: 3.1, cores: 10, diskFree: 52 }, hosts, hostsAt: 1 })

test('the System card with no hosts and no services: this computer only, no host gauge, no services sub-section', () => {
  setReadingsForTest(sysWith([]), { at: 1, services: [], credits: null })
  byKey(tree(), 'cs-system').props.onPress()
  const t = tree()
  const res = String(byKey(t, 'svg-sys-res').props.source)
  expect(res).toContain('Memory 62% used')
  expect(res).toContain('CPU load 3.1')
  expect(res).toContain('Disk 48% used')
  const words = [...res.matchAll(/>([^<]*)<\/text>/g)].map(m => m[1] ?? '').join(' | ')
  expect(words).not.toMatch(/Box|GPU|ssh/)
  expect(keysOf(t)).not.toContain('svg-sys-services')
  expect(JSON.stringify(t)).not.toMatch(new RegExp(BANNED.filter(b => b !== 'Hub and stack').join('|')))
  byKey(t, 'cs-system').props.onPress()
})

test('the System card with a host and services: the host under its own name, the services up and down', () => {
  const hosts = [{ name: 'host-a', answered: true, mem: { totalMB: 31890, availMB: 11000, freePct: 37, swapUsedMB: 0 }, gpu: { usedMB: 5120, totalMB: 24576, util: 37 } }]
  const services = [serviceFrom({ name: 'Web app', kind: 'http', target: 'http://localhost:3000/health', timeoutMs: 2000, ssh: '' }, '200 0.0421'), serviceFrom({ name: 'Queue', kind: 'http', target: 'http://localhost:4000', timeoutMs: 2000, ssh: '' }, '000 0')]
  setReadingsForTest(sysWith(hosts), { at: 1, services, credits: null })
  byKey(tree(), 'cs-system').props.onPress()
  const t = tree()
  const res = String(byKey(t, 'svg-sys-res').props.source)
  expect(res).toContain('host-a memory 63% used')
  expect(res).toContain('host-a GPU memory 21% used')
  const svc = String(byKey(t, 'svg-sys-services').props.source)
  expect(svc).toContain('Services')
  expect(svc).toContain('Web app')
  expect(svc).toContain('up, 42 ms')
  expect(svc).toContain('Queue')
  expect(svc).toContain('down')
  expect(isWellFormed(svc)).toBe(true)
  expect(isWellFormed(res)).toBe(true)
  // Order: resources, services, plan limits.
  const keys = (t.children as any[]).map(c => String(c.props?.key ?? ''))
  expect(keys.indexOf('svg-sys-res')).toBeLessThan(keys.indexOf('svg-sys-services'))
  expect(keys.indexOf('svg-sys-services')).toBeLessThan(keys.indexOf('svg-sys-plans'))
  byKey(t, 'cs-system').props.onPress()
  setReadingsForTest({ at: 0, reading: emptyReading, hosts: [], hostsAt: -Infinity }, { at: 0, services: [], credits: null })
})
