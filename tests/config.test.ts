// The Cockpit config file (hooks/config.ts): defaults, layers, lanes, markers, the gate command, the owner name, repos and the empty-state text.

import { test, expect } from './pure.ts'
import { DEFAULT_GATE_COMMAND, DEFAULT_MARKERS, buildConfig, configPathsOf, emptyStateLines, isEmptyWorld, markersSay, setMarkers } from '../hooks/config.ts'

const cfgOf = (o: object, root = '/work/app', home = '/home/u') => buildConfig([{ label: 't', text: JSON.stringify(o) }], root, home)

test('no file: every path is inside the data folder under the project root, nothing is listed', () => {
  const c = buildConfig([], '/work/app', '/home/u')
  expect(c.root).toBe('/work/app')
  expect(c.dataDir).toBe('/work/app/.cockpit')
  expect(c.claimsDir).toBe('/work/app/.cockpit/claims')
  expect(c.subagentsDir).toBe('/work/app/.cockpit/lane-health/subagents')
  expect(c.reportsDir).toBe('/work/app/.cockpit/reports')
  expect(c.statusFile).toBe('/work/app/.cockpit/status.json')
  expect(c.creditsFile).toBe('/work/app/.cockpit/credits.json')
  expect(c.uiFile).toBe('/work/app/.cockpit/state/ui.json')
  expect(c.handoffsDir).toBe('/work/app/.cockpit/handoffs')
  expect(c.owner).toBe('you')
  expect(c.gateLockScript).toBe('')
  expect(c.gateCommand).toBe(DEFAULT_GATE_COMMAND)
  expect(c.repos).toEqual([])
  expect(c.lanes).toEqual([])
  expect(c.discoverLanes).toBe(true)
  expect(c.warnings).toEqual([])
})

test('the config files are read from the home folder, then the project', () => {
  expect(configPathsOf('/work/app/', '/home/u/').map(p => p.path)).toEqual(['/home/u/.config/cockpit/config.json', '/work/app/.cockpit/config.json'])
})

test('a later layer replaces an earlier one key by key', () => {
  const a = JSON.stringify({ owner: 'sam', dataDir: 'agents' })
  const b = JSON.stringify({ owner: 'alex' })
  const c = buildConfig([{ label: 'user', text: a }, { label: 'project', text: b }], '/work/app', '/home/u')
  expect(c.owner).toBe('alex')
  expect(c.dataDir).toBe('/work/app/agents')
  expect(c.sources).toEqual(['user', 'project'])
})

test('every file key can be renamed, relative to the data folder, or moved to an absolute path', () => {
  const c = cfgOf({ dataDir: '.agents', statusFile: 'now.json', claimsDir: 'work/claims', subagentsDir: 'health/agents', backlogFile: '/docs/BACKLOG.md', inboxFile: 'in.jsonl' })
  expect(c.statusFile).toBe('/work/app/.agents/now.json')
  expect(c.claimsDir).toBe('/work/app/.agents/work/claims')
  expect(c.subagentsDir).toBe('/work/app/.agents/health/agents')
  expect(c.backlogFile).toBe('/docs/BACKLOG.md')
  expect(c.inboxFile).toBe('/work/app/.agents/in.jsonl')
})

test('a bad file is ignored with a warning, not an error', () => {
  const c = buildConfig([{ label: 'user', text: '{nope' }, { label: 'project', text: '[1]' }], '/work/app', '/home/u')
  expect(c.warnings).toHaveLength(2)
  expect(c.owner).toBe('you')
})

test('lanes: a name alone is a tmux lane, a bad kind is taken as tmux with a warning, a bad name is skipped', () => {
  const c = cfgOf({ lanes: ['plain', { name: 'builder', kind: 'codex' }, { name: 'x', kind: 'robot' }, { name: 'bad name' }, { kind: 'local' }] })
  expect(c.lanes).toEqual([{ name: 'plain', kind: 'tmux' }, { name: 'builder', kind: 'codex' }, { name: 'x', kind: 'tmux' }])
  expect(c.warnings).toHaveLength(3)
  expect(cfgOf({ lanes: 'x' }).warnings).toHaveLength(1)
  expect(cfgOf({ discoverLanes: false }).discoverLanes).toBe(false)
})

test('owner: one word, anything else falls back to "you" with a warning', () => {
  expect(cfgOf({ owner: 'sam' }).owner).toBe('sam')
  const c = cfgOf({ owner: 'two words' })
  expect(c.owner).toBe('you')
  expect(c.warnings).toHaveLength(1)
})

test('gateCommand: a regular expression; an invalid one is ignored with a warning', () => {
  expect(cfgOf({ gateCommand: 'make\\s+verify' }).gateCommand).toBe('make\\s+verify')
  const c = cfgOf({ gateCommand: '(' })
  expect(c.gateCommand).toBe(DEFAULT_GATE_COMMAND)
  expect(c.warnings).toHaveLength(1)
  expect(new RegExp(DEFAULT_GATE_COMMAND).test('bash scripts/ci.sh --fast')).toBe(true)
})

test('gateLockScript: relative to the project root, or absolute; none by default', () => {
  expect(cfgOf({ gateLockScript: 'bin/lock.sh' }).gateLockScript).toBe('/work/app/bin/lock.sh')
  expect(cfgOf({ gateLockScript: '/opt/lock.sh' }).gateLockScript).toBe('/opt/lock.sh')
})

test('repos: a relative path is taken from the project root', () => {
  const c = cfgOf({ repos: ['.', '../api'] })
  expect(c.repos).toEqual(['/work/app', '/work/api'])
})

test('markers: the defaults, replaced per kind and field, a bad pattern skipped with a warning', () => {
  const d = buildConfig([], '/work/app', '/home/u')
  expect(d.markers.codex.working).toEqual(DEFAULT_MARKERS.codex.working)
  expect(d.markers.opencode.working).toEqual(['esc interrupt'])
  const c = cfgOf({ markers: { codex: { working: ['Thinking', '('], idle: ['^done$'] }, local: 'x' } })
  expect(c.markers.codex.working).toEqual(['Thinking'])
  expect(c.markers.codex.idle).toEqual(['^done$'])
  expect(c.markers.tmux.working).toEqual(DEFAULT_MARKERS.tmux.working)
  expect(c.warnings).toHaveLength(2)
})

test('markers decide working or idle from the last lines of a pane, per kind', () => {
  setMarkers(buildConfig([], '/w', '/h').markers)
  expect(markersSay('codex', ['• Working (3s • esc to interrupt)', ''])).toBe('working')
  expect(markersSay('codex', ['all done', '> '])).toBe('idle')
  expect(markersSay('opencode', ['esc interrupt'])).toBe('working')
  setMarkers(cfgOf({ markers: { codex: { working: ['Thinking'], idle: ['^ready$'] } } }).markers)
  expect(markersSay('codex', ['Thinking...'])).toBe('working')
  expect(markersSay('codex', ['Thinking...', 'ready'])).toBe('idle')
  expect(markersSay('codex', ['Working'])).toBe('idle')
  setMarkers(buildConfig([], '/w', '/h').markers)
})

test('the empty state names the files to create, relative to the project root', () => {
  const lines = emptyStateLines(buildConfig([], '/work/app', '/home/u'))
  const text = lines.join('\n')
  expect(text).toContain('.cockpit/status.json')
  expect(text).toContain('.cockpit/claims/<ITEM>.claim')
  expect(text).toContain('.cockpit/config.json')
  expect(text).not.toContain('/work/app')
  expect(isEmptyWorld({ crew: 0, hasStatus: false, claims: 0, reports: 0, inbox: 0 })).toBe(true)
  expect(isEmptyWorld({ crew: 0, hasStatus: true, claims: 0, reports: 0, inbox: 0 })).toBe(false)
})
