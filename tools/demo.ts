// Writes the synthetic demo project the README screenshots are made from:   bun tools/demo.ts [folder]
//
// The folder (default examples/project) gets the files Cockpit reads (docs/PROTOCOL.md): .cockpit/status.json, claims, briefs, reports,
// the inbox, the away log, a config; and panes/<session>.txt, the canned text of each tmux session's screen (the screenshot script serves
// these instead of a real tmux). Everything is invented: an example app, a user called alex, example.com. File times are set relative to
// "now", so ages read the same whenever it is run.

import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const MIN = 60_000
const HOUR = 60 * MIN

export const DEMO_LANES = ['codex-a', 'codex-b', 'codex-c', 'codex-d', 'opencode-a', 'local-llama', 'claude-docs'] as const

type F = { path: string; text: string; ageMs: number }

const WORKING_A = `› Read and execute .cockpit/briefs/brief-API-12.md
  └ 3a9f10c2 chore: bump client pin to v1.4.2
    + 5 lines (ctrl+t to expand)
• Edited src/client/retry.ts (+42 -6)
• Ran bun test tests/retry.test.ts
  └ 14 pass
    0 fail
• Editing src/client/backoff.ts so the wait doubles each time and stops after 2 s
• Working (3m 12s • esc to interrupt)

› Ask Codex to do anything
  GPT-6-Luna low · ~/projects/example-app · Read and execute .cockpit/briefs/brief-API-12.md
  ? for shortcuts
`
const WORKING_B = `› Read and execute .cockpit/briefs/brief-WEB-07.md
• Ran bash scripts/check.sh --pre
  └ typecheck ok
    lint ok
• Running the forecast tests against the stub server
• Working (41s • esc to interrupt)

› Ask Codex to do anything
  GPT-6-Luna low · ~/projects/example-app-b · Read and execute .cockpit/briefs/brief-WEB-07.md
  ? for shortcuts
`
const IDLE_C = `• Completed and pushed API-09 to main. Retries are in 7c41de90; the full gate passed.
  The report is at .cockpit/reports/API-09-report.md.
  STATE: done · API-09: pushed
  PROGRESS: Full gate passed; report written
  YOU: nothing
  Worked for 22m 4s • 8:39 PM

› Ask Codex to do anything
  GPT-6-Luna low · ~/projects/example-app-c · Read and execute .cockpit/briefs/brief-API-09.md
  ? for shortcuts
`
const BLOCKED_D = `› Read and execute .cockpit/briefs/brief-WEB-09.md
• The map selector needs the client pin from API-12 first. Waiting for codex-a to land it.

› Ask Codex to do anything
  GPT-6-Luna low · ~/projects/example-app-d · Read and execute .cockpit/briefs/brief-WEB-09.md
  ? for shortcuts
`
const OPENCODE_A = `> build · claude-sonnet-5-5

→ Read .cockpit/briefs/brief-UI-21.md
→ Read src/ui/SettingsRow.tsx
← Edit src/ui/SettingsRow.tsx

Adding the owner and admin rows to the settings screen, then the tests.

  esc interrupt                                                      ctrl+p commands
`
const LOCAL_LLAMA = `Loaded model llama-9b-q4.

> Summarize the changelog in three lines.
Generating... 41 tokens
`

const CLAUDE_DOCS = `● Read(docs/install.md)
● Update(README.md)
  └ Added the install steps and a short note on the claim files.

✻ Checking the links in the README… (12s · esc to interrupt)

╭──────────────────────────────────────────╮
│ >                                        │
╰──────────────────────────────────────────╯
`

export function demoFiles(now: number): F[] {
  const iso = (ageMs: number): string => new Date(now - ageMs).toISOString()
  const files: F[] = [
    { path: '.cockpit/config.json', text: JSON.stringify({ lanes: [{ name: 'claude-docs', kind: 'tmux' }] }, null, 2) + '\n', ageMs: 5 * HOUR },
    {
      path: '.cockpit/status.json',
      text:
        JSON.stringify(
          {
            updated: iso(2 * MIN),
            milestone: 'Ship the sync client',
            done: 3,
            total: 6,
            now: ['API-12 (codex-a): retry with backoff in the sync client', 'WEB-07 (codex-b): forecast tests against the stub server', 'UI-21 (opencode-a): owner and admin rows in the settings screen', 'DOC-02 (claude-docs): README pass', 'DOC-03 (local-llama): release notes draft'],
            next: ['API-14: link checker for the auth keys', 'WEB-09: map selector (waits for API-12)', 'DOC-04: changelog check'],
            you: [{ text: 'approve the client pin bump to v1.4.2', blocking: 'API-14' }, 'pick a name for the retry option'],
          },
          null,
          2,
        ) + '\n',
      ageMs: 2 * MIN,
    },
    // line 1 the item id, line 2 "lane: <session>", line 3 a plain title, an optional "now: <sentence>"
    { path: '.cockpit/claims/API-12.claim', text: 'API-12\nlane: codex-a\nRetry with backoff in the sync client\nnow: making the wait double each time\n', ageMs: 52 * MIN },
    { path: '.cockpit/claims/WEB-07.claim', text: 'WEB-07\nlane: codex-b\nForecast tests against the stub server\n', ageMs: 14 * MIN },
    { path: '.cockpit/claims/UI-21.claim', text: 'UI-21\nlane: opencode-a\nOwner and admin rows in the settings screen\nnow: adding the admin row\n', ageMs: 9 * MIN },
    { path: '.cockpit/claims/WEB-09.claim', text: 'WEB-09\nlane: codex-d\nMap selector\n', ageMs: 30 * MIN },
    { path: '.cockpit/claims/DOC-02.claim', text: 'DOC-02\nlane: claude-docs\nREADME pass\nnow: checking the links in the README\n', ageMs: 6 * MIN },
    { path: '.cockpit/claims/DOC-03.claim', text: 'DOC-03\nlane: local-llama\nRelease notes draft\n', ageMs: 3 * MIN },
    { path: '.cockpit/briefs/brief-API-12.md', text: '# API-12: retry with backoff in the sync client\n\nRetry three times, wait 200 ms and double each time, give up after 2 s.\n', ageMs: 70 * MIN },
    { path: '.cockpit/briefs/brief-WEB-07.md', text: '# WEB-07: forecast tests against the stub server\n', ageMs: 40 * MIN },
    { path: '.cockpit/briefs/brief-UI-21.md', text: '# UI-21: owner and admin rows in the settings screen\n', ageMs: 30 * MIN },
    { path: '.cockpit/briefs/brief-WEB-09.md', text: '# WEB-09: map selector\n', ageMs: 50 * MIN },
    {
      path: '.cockpit/reports/API-09-report.md',
      text: '# API-09 report: retries in the sync client\n\nStatus: pushed to main, gate green (exit 0)\n\nThe client now retries with backoff. Commit 7c41de90.\n',
      ageMs: 25 * MIN,
    },
    {
      path: '.cockpit/reports/WEB-04-report.md',
      text: '# WEB-04 report: forecast card\n\nStatus: not pushed, the full gate is red\n\nThe forecast.test.ts assertion fails when run with the rest of the suite.\nGate exit code 1.\n',
      ageMs: 55 * MIN,
    },
    { path: '.cockpit/reports/UI-18-report.md', text: '# UI-18 report: settings icons\n\nStatus: landed on main\n\nGate exit code 0.\n', ageMs: 2 * HOUR },
    { path: '.cockpit/reports/DOC-01-report.md', text: '# DOC-01 report: install notes\n\nWrote a first draft of the install notes. Nothing was run.\n', ageMs: 3 * HOUR },
    { path: '.cockpit/deps.json', text: JSON.stringify({ waits: [{ member: 'codex-d', on: 'codex-a', why: 'needs the client pin from API-12' }] }) + '\n', ageMs: 20 * MIN },
    { path: '.cockpit/targets.json', text: JSON.stringify({ 'API-12': 'Sync client', 'WEB-07': 'Forecast', 'UI-21': 'Settings', 'WEB-09': 'Map selector' }) + '\n', ageMs: 5 * HOUR },
    { path: '.cockpit/inbox/bugs.md', text: '- ' + iso(3 * HOUR) + ' the forecast card is blank on phones\n', ageMs: 3 * HOUR },
    { path: '.cockpit/inbox/ideas.md', text: '- ' + iso(4 * HOUR) + ' show the retry count on the sync card\n', ageMs: 4 * HOUR },
    { path: '.cockpit/inbox/captain.md', text: '', ageMs: 4 * HOUR },
    { path: '.cockpit/away-log.md', text: '# Away log\n\n- Decision: used 3 retries, not 5, because the stub server times out at 2 s.\n- BLOCKED: API-14 needs the pin bump approved.\n', ageMs: 6 * HOUR },
    { path: 'panes/codex-a.txt', text: WORKING_A, ageMs: 0 },
    { path: 'panes/codex-b.txt', text: WORKING_B, ageMs: 0 },
    { path: 'panes/codex-c.txt', text: IDLE_C, ageMs: 0 },
    { path: 'panes/codex-d.txt', text: BLOCKED_D, ageMs: 0 },
    { path: 'panes/opencode-a.txt', text: OPENCODE_A, ageMs: 0 },
    { path: 'panes/local-llama.txt', text: LOCAL_LLAMA, ageMs: 0 },
    { path: 'panes/claude-docs.txt', text: CLAUDE_DOCS, ageMs: 0 },
  ]
  return files
}

/** Writes the demo project into `dir` (the folder is emptied first) and returns the file list. */
export function writeDemo(dir: string, now = Date.now()): string[] {
  rmSync(dir, { recursive: true, force: true })
  const out: string[] = []
  for (const f of demoFiles(now)) {
    const p = join(dir, f.path)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, f.text)
    const t = new Date(now - f.ageMs)
    utimesSync(p, t, t)
    out.push(f.path)
  }
  return out
}

if (import.meta.main) {
  const dir = resolve(process.argv[2] ?? join(import.meta.dir, '..', 'examples', 'project'))
  console.log(writeDemo(dir).join('\n'))
}
