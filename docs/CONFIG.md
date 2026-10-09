# Configuration

`.cockpit/config.json` for the project, and `~/.config/cockpit/config.json` for every project (the project's file wins key by key). Every key
is optional, and a missing or broken file falls back to the defaults. `/cockpit-status` prints which files were read and any warning.

```json
{
  "root": ".",
  "dataDir": ".cockpit",
  "claimsDir": "claims",
  "statusFile": "status.json",
  "reportsDir": "reports",
  "briefsDir": "briefs",
  "inboxDir": "inbox",
  "awayLog": "away-log.md",
  "presenceFile": "presence.json",
  "locksDir": "locks",
  "progressDir": "progress",
  "creditsFile": "credits.json",
  "uiFile": "state/ui.json",
  "usageCacheFile": "state/usage-cache.json",
  "usageDebugLog": "logs/usage-debug.log",
  "targetsFile": "targets.json",
  "depsFile": "deps.json",
  "inboxFile": "inbox.jsonl",
  "actionsLog": "logs/actions.log",
  "deckFile": "state/deck.json",
  "handoffsDir": "handoffs",
  "backlogFile": "backlog.md",
  "owner": "you",
  "gateLockScript": "bin/gate-lock.sh",
  "notesHours": 6,
  "repos": ["."],
  "lanes": [{ "name": "claude-docs", "kind": "tmux" }],
  "discoverLanes": true,
  "markers": { "local": { "working": ["tokens/s"], "idle": ["^>\\s*$"] } },
  "gateCommand": "(?:check|verify|ci)\\.sh",
  "hosts": [{ "name": "host-a", "ssh": "gpu-alias", "gpu": true }],
  "services": [{ "name": "Web app", "kind": "http", "target": "http://localhost:3000/health", "timeoutMs": 2000 }]
}
```

- Paths inside `dataDir` are relative to it. A path may be absolute or start with `~/`. The keys from `creditsFile` to `backlogFile` are the
  files Cockpit keeps for itself; each can be renamed or moved. `backlogFile` is an optional markdown backlog the Main status card reads.
- `owner`: the one word that names you in a "Blocked on" line and as the author of an inbox note. Default `you`.
- `gateLockScript`: a script (absolute, or relative to the project root) that prints who holds your shared gate lock when run with `status`.
  Default: none, and no lane is shown as waiting on a gate lock.
- `notesHours`: after this many hours the hand-written Next and You lines get a dim "notes from 2d ago". Default 6.
- `repos`: the git repositories (a relative path is taken from the project root) whose unsaved work the status line sums ("all saved", or "unsaved: N uncommitted files, M unpushed commits").
- `lanes[].kind`: `tmux`, `codex`, `opencode` or `local`.
- `markers`: regular expressions per kind, `working` and `idle`, as described above.
- `gateCommand`: a regular expression for the command that runs your gate (tests, type-check and lint in one script). A pane line that
  names it counts as a gate run, and a report line that names it with `exit N` gives the gate's exit code.
- `hosts`: other computers the System card shows next to this one, each as its own group of gauges under its own `name` ("host-a
  memory 63% used"). `ssh` is the host alias or name ssh knows (never starting with a dash); `gpu: true` also reads the GPU with
  `nvidia-smi`. One read-only ssh per host (BatchMode, 3 second timeout), at most every 60 seconds. At most 8.
- `services`: what the System card checks, one read-only probe each, named by `name`. `kind` is `http` (a GET of `target`; up on a 2xx or 3xx
  answer, with its time), `tcp` (`target` is `host:port`; up when the port accepts a connection) or `ssh-tunnel` (the same check made on the host
  named by `ssh`, for a service that listens only there). `timeoutMs` (500 to 30000, default 2000) bounds one probe. The older shape
  `{ "name", "url", "ssh" }` still reads. Default: none, and a service that is not listed is not probed or shown. At most 12.
- Nothing listed in `hosts` and `services` (the default) means this computer only: Cockpit makes no ssh call and no HTTP call. An entry
  that is not usable is skipped and `/cockpit-status` says why.

The plugin option `root` (set when you install it) overrides the file's `root`.
