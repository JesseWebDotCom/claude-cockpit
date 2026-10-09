// The hosts and services a user lists in the Cockpit config file (hooks/hosts.ts): parsing, the commands, the probes, and how config.ts carries them.

import { test, expect } from './pure.ts'
import { buildConfig } from '../hooks/config.ts'
import { MAX_HOSTS, MAX_SERVICES, hostCommand, isServiceUrl, isSshTarget, noExtras, parseExtras, parseProbe, serviceCommand, serviceFrom, serviceWord } from '../hooks/hosts.ts'

test('the shape: hosts with a name, an ssh alias and a gpu flag; services with a name and a url', () => {
  const w: string[] = []
  const x = parseExtras({ hosts: [{ name: 'gpu-server', ssh: 'gpu-alias', gpu: true }, { ssh: 'build.local' }], services: [{ name: 'Web app', url: 'http://localhost:3000/health' }, { url: 'https://example.org/up' }] }, w)
  expect(x.hosts).toEqual([{ name: 'gpu-server', ssh: 'gpu-alias', gpu: true }, { name: 'build.local', ssh: 'build.local', gpu: false }])
  expect(x.services).toEqual([{ name: 'Web app', url: 'http://localhost:3000/health', ssh: '' }, { name: 'example.org', url: 'https://example.org/up', ssh: '' }])
  expect(w).toEqual([])
})

test('nothing listed: nothing extra, in the parser and in the config', () => {
  expect(parseExtras({})).toEqual({ hosts: [], services: [] })
  expect(noExtras).toEqual({ hosts: [], services: [] })
  const c = buildConfig([], '/work/app', '/home/u')
  expect(c.hosts).toEqual([])
  expect(c.services).toEqual([])
})

test('the config carries the lists, later layers replace earlier ones, and a bad entry is a warning', () => {
  const a = JSON.stringify({ hosts: [{ name: 'one', ssh: 'one' }], services: [{ name: 'A', url: 'http://one' }] })
  const b = JSON.stringify({ hosts: [{ name: 'two', ssh: 'two', gpu: true }, { name: 'bad', ssh: '-oProxyCommand=x' }] })
  const c = buildConfig([{ label: 'user', text: a }, { label: 'project', text: b }], '/work/app', '/home/u')
  expect(c.hosts).toEqual([{ name: 'two', ssh: 'two', gpu: true }])
  expect(c.services.map(s => s.name)).toEqual(['A'])
  expect(c.warnings.filter(m => m.startsWith('hosts:'))).toHaveLength(1)
})

test('an unusable entry is skipped with a warning; an ssh target can never be read as an ssh option or a shell word', () => {
  const w: string[] = []
  const x = parseExtras(
    {
      hosts: [{ name: 'a', ssh: '-oProxyCommand=evil' }, { name: 'b', ssh: 'host; rm -rf /' }, { name: 'c', ssh: 'host name' }, { name: 'd' }, 'x', { name: 'ok', ssh: 'user@host-1.lan' }],
      services: [{ name: 'a', url: 'ftp://x' }, { name: 'b', url: 'http://a b' }, { name: 'c', url: '-o /etc/passwd' }, { name: 'q', url: "http://x/'; rm -rf /; '" }, { name: 'v', url: 'http://x', ssh: '-oProxyCommand=evil' }, { name: 'ok', url: 'http://127.0.0.1:8080', ssh: 'host-1' }],
    },
    w,
  )
  expect(x.hosts.map(h => h.name)).toEqual(['ok'])
  expect(x.services.map(s => s.name)).toEqual(['ok'])
  expect(x.services[0]?.ssh).toBe('host-1')
  expect(w.filter(m => m.startsWith('hosts:'))).toHaveLength(5)
  expect(w.filter(m => m.startsWith('services:'))).toHaveLength(5)
  expect(isSshTarget('-x')).toBe(false)
  expect(isSshTarget('a b')).toBe(false)
  expect(isSshTarget('')).toBe(false)
  expect(isSshTarget('box_1.example.com')).toBe(true)
  expect(isServiceUrl('http://localhost:3000/health')).toBe(true)
  expect(isServiceUrl('file:///etc/passwd')).toBe(false)
  expect(isServiceUrl("http://x/'y")).toBe(false)
})

test('hosts and services that are not lists are ignored with a warning; the lists are capped', () => {
  const w: string[] = []
  expect(parseExtras({ hosts: 'gpu-alias', services: { a: 1 } }, w)).toEqual(noExtras)
  expect(w).toHaveLength(2)
  const many = parseExtras({ hosts: Array.from({ length: 20 }, (_, i) => ({ ssh: 'h' + i })), services: Array.from({ length: 30 }, (_, i) => ({ url: 'http://h' + i })) })
  expect(many.hosts).toHaveLength(MAX_HOSTS)
  expect(many.services).toHaveLength(MAX_SERVICES)
})

test('a name is one clean short line', () => {
  const x = parseExtras({ hosts: [{ name: '  gpu\n\tserver  ' + 'x'.repeat(100), ssh: 'a' }] })
  expect(x.hosts[0]?.name.startsWith('gpu server x')).toBe(true)
  expect(x.hosts[0]?.name.length).toBeLessThanOrEqual(40)
})

test('the commands are read only: one ssh per host (BatchMode, 3 s), one GET per service', () => {
  expect(hostCommand({ name: 'g', ssh: 'gpu-alias', gpu: true })).toEqual([
    'ssh',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=3',
    'gpu-alias',
    'free -m; nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader 2>/dev/null; true',
  ])
  // No gpu flag: the GPU is never asked.
  expect(hostCommand({ name: 'g', ssh: 'gpu-alias', gpu: false })[6]).toBe('free -m; true')
  expect(serviceCommand({ name: 'W', url: 'http://localhost:3000/health', ssh: '' })).toEqual(['curl', '-s', '-m', '2', '-o', '/dev/null', '-w', '%{http_code} %{time_total}', 'http://localhost:3000/health'])
  // A service that listens only on a listed machine: the same GET, run there.
  expect(serviceCommand({ name: 'W', url: 'http://127.0.0.1:9000/health', ssh: 'gpu-alias' })).toEqual([
    'ssh',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=3',
    'gpu-alias',
    "curl -s -m 2 -o /dev/null -w '%{http_code} %{time_total}' 'http://127.0.0.1:9000/health'",
  ])
})

test('a probe: the code and the time; up on 2xx or 3xx; "000" is no answer', () => {
  expect(parseProbe('200 0.0123')).toEqual({ code: 200, ms: 12 })
  expect(parseProbe('301 1.5')).toEqual({ code: 301, ms: 1500 })
  expect(parseProbe('000 0.000')).toEqual({ code: null, ms: null })
  expect(parseProbe('200')).toEqual({ code: 200, ms: null })
  expect(parseProbe('garbage')).toEqual({ code: null, ms: null })
  const s = { name: 'Web app', url: 'http://x', ssh: '' }
  expect(serviceWord(serviceFrom(s, '200 0.0421'))).toBe('up, 42 ms')
  expect(serviceWord(serviceFrom(s, '200'))).toBe('up')
  expect(serviceWord(serviceFrom(s, '500 0.1'))).toBe('down')
  expect(serviceWord(serviceFrom(s, ''))).toBe('down')
  // Through ssh: ssh failing is "unknown", not "down"; ssh answering with a bad code is "down".
  const via = { ...s, ssh: 'gpu-alias' }
  expect(serviceWord(serviceFrom(via, '', 255))).toBe('unknown')
  expect(serviceWord(serviceFrom(via, '', null))).toBe('unknown')
  expect(serviceWord(serviceFrom(via, '503 0.1', 0))).toBe('down')
  expect(serviceWord(serviceFrom(via, '000 0', 0))).toBe('down')
  expect(serviceWord(serviceFrom(via, '200 0.02', 0))).toBe('up, 20 ms')
  expect(serviceWord({ name: 'a', url: 'b', dot: 'grey', ms: null, unreachable: false })).toBe('checking')
})
