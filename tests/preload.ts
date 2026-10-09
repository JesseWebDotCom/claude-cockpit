// The tests' fake world keeps its files in the older layout (lane-locks, agents/queue, crew-*.json) and calls the person "sam". The mod's
// own defaults are neutral, so the tests put a config layer under whatever the world's config file says (hooks/config.ts `setTestLayer`).
import { setTestLayer } from '../hooks/config.ts'
import { setNames } from '../hooks/names.ts'

setTestLayer({
  owner: 'sam',
  locksDir: 'lane-locks',
  briefsDir: 'agents/queue',
  reportsDir: 'agents/queue/reports',
  uiFile: 'crew-ui.json',
  usageCacheFile: 'usage-cache.json',
  usageDebugLog: 'usage-debug.log',
  targetsFile: 'crew-targets.json',
  depsFile: 'crew-deps.json',
  actionsLog: 'crew-actions.log',
  handoffsDir: 'agents',
  deckFile: 'crew-deck.json',
  backlogFile: '../docs/BACKLOG.md',
  gateCommand: 'check\\.sh',
  gateLockScript: '../.github/standards/bin/gate-lock.sh',
})
setNames({ owner: 'sam', dataDir: '.cockpit' })
