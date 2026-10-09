// COCKPIT-27: the hosts and services a user lists in the Cockpit config file (hooks/hosts.ts): parsing, the commands, the layers.

import { test, expect } from './pure.ts'
import { MAX_HOSTS, MAX_REPOS, MAX_SERVICES, extrasFromLayers, hostCommand, isRepoPath, isServiceUrl, isSshTarget, noExtras, parseExtras, parseProbe, serviceCommand, serviceFrom, serviceWord } from '../hooks/hosts.ts'
import { configPathsOf } from '../hooks/config.ts'

test('the shape: hosts with a name, an ssh alias and a gpu flag; services with a name and a url', () => {
  const w: string[] = []
  const x = parseExtras({ hosts: [{ name: 'host-a', ssh: 'gpu-alias', gpu: true }, { ssh: 'build.local' }], services: [{ name: 'Web app', url: 'http://localhost:3000/health' }, { url: 'https://example.org/up' }] }, w)
  expect(x.hosts).toEqual([{ name: 'host-a', ssh: 'gpu-alias', gpu: true }, { name: 'build.local', ssh: 'build.local', gpu: false }])
  expect(x.services).toEqual([{ name: 'Web app', kind: 'http', target: 'http://localhost:3000/health', timeoutMs: 2000, ssh: '' }, { name: 'example.org', kind: 'http', target: 'https://example.org/up', timeoutMs: 2000, ssh: '' }])
  expect(w).toEqual([])
})

test('nothing listed: nothing extra', () => {
  expect(parseExtras({})).toEqual({ hosts: [], services: [], repos: [] })
  expect(noExtras).toEqual({ hosts: [], services: [], repos: [] })
  expect(extrasFromLayers([])).toEqual(noExtras)
  expect(extrasFromLayers([null, null])).toEqual(noExtras)
  expect(extrasFromLayers(['{"lanes":[]}'])).toEqual(noExtras)
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

test('repos: absolute folder paths for the unsaved-work status line; anything else is skipped with a warning; none by default', () => {
  const w: string[] = []
  const x = parseExtras({ repos: ['/work/one', ' /work/two/ ', '/work/one', 'relative/path', '/work/../etc', '', 7, '/a\nb'] }, w)
  expect(x.repos).toEqual(['/work/one', '/work/two'])
  expect(w).toHaveLength(5)
  expect(parseExtras({ repos: '/work/one' }, w).repos).toEqual([])
  expect(parseExtras({}).repos).toEqual([])
  expect(parseExtras({ repos: Array.from({ length: 30 }, (_, i) => '/r/' + i) }).repos).toHaveLength(MAX_REPOS)
  expect(isRepoPath('/')).toBe(false)
  expect(isRepoPath('/work/x')).toBe(true)
})

test('a name is one clean short line', () => {
  const x = parseExtras({ hosts: [{ name: '  gpu\n\tserver  ' + 'x'.repeat(100), ssh: 'a' }] })
  expect(x.hosts[0]?.name.startsWith('gpu server x')).toBe(true)
  expect(x.hosts[0]?.name.length).toBeLessThanOrEqual(40)
})

test('layers: the user file, then the one in the data folder; a layer that has the key replaces the earlier; a broken layer is skipped', () => {
  const w: string[] = []
  const a = JSON.stringify({ hosts: [{ ssh: 'one' }], services: [{ url: 'http://one' }] })
  const b = JSON.stringify({ hosts: [{ ssh: 'two' }] })
  const x = extrasFromLayers([a, b], w)
  expect(x.hosts.map(h => h.ssh)).toEqual(['two'])
  expect(x.services.map(s => s.target)).toEqual(['http://one'])
  expect(extrasFromLayers([a, '{nope'], w).hosts.map(h => h.ssh)).toEqual(['one'])
  expect(w).toHaveLength(1)
  expect(extrasFromLayers(['[]'], w)).toEqual(noExtras)
  expect(configPathsOf('/proj/', '/home/u/')).toEqual([
    { label: '~/.config/cockpit/config.json', path: '/home/u/.config/cockpit/config.json' },
    { label: '.cockpit/config.json', path: '/proj/.cockpit/config.json' },
  ])
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
  expect(serviceCommand({ name: 'W', kind: 'http', target: 'http://localhost:3000/health', timeoutMs: 2000, ssh: '' })).toEqual(['curl', '-s', '-m', '2', '-o', '/dev/null', '-w', '%{http_code} %{time_total}', 'http://localhost:3000/health'])
  // A service that listens only on a listed machine: the same GET, run there.
  expect(serviceCommand({ name: 'W', kind: 'ssh-tunnel', target: 'http://127.0.0.1:9000/health', timeoutMs: 2000, ssh: 'gpu-alias' })).toEqual([
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
  const s = { name: 'Web app', kind: 'http' as const, target: 'http://x', timeoutMs: 2000, ssh: '' }
  expect(serviceWord(serviceFrom(s, '200 0.0421'))).toBe('up, 42 ms')
  expect(serviceWord(serviceFrom(s, '200'))).toBe('up')
  expect(serviceWord(serviceFrom(s, '500 0.1'))).toBe('down')
  expect(serviceWord(serviceFrom(s, ''))).toBe('down')
  // Through ssh: ssh failing is "unknown", not "down"; ssh answering with a bad code is "down".
  const via = { ...s, kind: 'ssh-tunnel' as const, ssh: 'gpu-alias' }
  expect(serviceWord(serviceFrom(via, '', 255))).toBe('unknown')
  expect(serviceWord(serviceFrom(via, '', null))).toBe('unknown')
  expect(serviceWord(serviceFrom(via, '503 0.1', 0))).toBe('down')
  expect(serviceWord(serviceFrom(via, '000 0', 0))).toBe('down')
  expect(serviceWord(serviceFrom(via, '200 0.02', 0))).toBe('up, 20 ms')
  expect(serviceWord({ name: 'a', target: 'b', dot: 'grey', ms: null, unreachable: false })).toBe('checking')
})
