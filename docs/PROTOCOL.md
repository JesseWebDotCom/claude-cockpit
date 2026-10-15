# The Cockpit protocol

Cockpit shows what your agents write to a few plain files, plus what it can read from tmux. It does not run your agents and it does not
decide anything for them. If a file below does not exist, the card that needs it is empty or left out. With none of them the pane
shows one card, "Nothing to show yet", that says what to create.

Every path is under the project's `.cockpit` folder unless this page says otherwise. The folder and each name can be changed in
`.cockpit/config.json` (see [Configuration](CONFIG.md)). `examples/project` is a complete synthetic project written by
`bun tools/demo.ts`; the screenshots in the README are drawn from it.

The lane-health launchd job receives `--data-dir` for the configured data folder. Its `health.json` is written there beside `plan.json`,
never at the project root. Its tracked source and offline tests live in `lane-health/`; `tools/sync-lane-health.sh` copies source to the
runtime folder while excluding state. Event records contain only item id, lane, state and time. The stop hook compares the plan's `updated` value
with `plan-page.published` and sends at most one combined housekeeping instruction during each idle period.

Who writes what:

| Path | Written by | Read by Cockpit | Written by Cockpit |
|---|---|---|---|
| `status.json` | lane-health derives progress fields; the Captain writes `you` | yes | never |
| `claims/<ITEM>.claim` | the worker agent that takes an item | yes | never |
| `reports/<item>-report.md` | the worker agent that finishes | yes | never |
| `briefs/brief-<ITEM>.md` | you or the Captain | yes (heading only) | never |
| `deps.json`, `targets.json`, `progress/<lane>.json`, `locks/<lane>.lock` | your agents or scripts | yes | never |
| `inbox/bugs.md`, `inbox/ideas.md` | Cockpit (Add Bug, Add Idea) | no | yes, appends |
| `inbox.jsonl` | Cockpit, and your agent for status lines | yes | yes, appends |
| `inbox/captain.md` | Cockpit, only when the host refuses a message | no | yes, appends |
| `presence.json` | Cockpit (the AUTOPILOT button) | yes | yes |
| `health.json` | lane-health checker (`--data-dir` or `LH_DATA_DIR`) | yes | never |
| `lane-health/events.jsonl` | Codex notify hook or lane-health report detection | no | never |
| `plan-republish.request` | lane-health after a plan change | the UserPromptSubmit hook | the prompt context hook clears it when `plan-page.published` catches up |
| `lane-health/needs-name.json` | lane-health when it finds an unlisted worker | the UserPromptSubmit hook | never; entries stop appearing after their row is named |
| `plan-page.published` | Captain after publishing the plan Artifact | yes | never |
| `away-log.md` | the Captain while Autopilot is on | yes | only to clear it |
| `handoffs/HANDOFF-<date>.md` | Cockpit (`/handoff`) | no | yes |
| `state/`, `logs/` | Cockpit, for itself | yes | yes |

## status.json

One JSON object. Lane-health derives `done`, `total`, `now` and `next` from `plan.json` on every pass; the Captain owns `you`. Cockpit never writes it. Every field is optional; a missing field reads as empty and
text that is not a JSON object reads as no status.

```json
{
  "updated": "2026-10-09T15:04:05.000Z",
  "milestone": "Ship the sync client",
  "done": 3,
  "total": 6,
  "now": ["API-12 (codex-a): retry with backoff in the sync client"],
  "next": ["API-14: link checker for the auth keys"],
  "you": [{ "text": "approve the client pin bump to v1.4.2", "blocking": "API-14" }, "pick a name for the retry option"]
}
```

- `updated`: an ISO time. A file older than 30 minutes is "old". The Status card shows a "stale" chip only when the file is old and nothing
  live (a lane at work, a fresh claim) backs it.
- `milestone`, `done`, `total`: the card's title, its progress bar and its count ("3/6"). With no total there is no bar.
- `now`, `next`: a list of strings, or one string whose entries are separated by `;` or a line break (not inside parentheses).
- `you`: what waits on the person. An entry is a string, or an object with `text` and `blocking` (an item id, or `true`). An entry with
  `blocking` is drawn in red; the others in amber.

The card tracks itself, so a late file does not look idle. NOW is the file's own while the file is newer than the live evidence (a claim
or a lane's recent change) or under 30 minutes old; otherwise it is built from the live claims (shown as `ITEM: title (lane)`) and the lanes that are awake. NEXT loses the items that have
landed. `done` goes up by one for each commit made today whose subject starts with an item id still listed in NOW or NEXT.

## claims/&lt;ITEM&gt;.claim

The lane-health assignment helper writes a claim and its matching lane lock together when a worker takes an item. Both use key/value lines; the file name remains the claim's item id. The checker accepts older bare-id claims and tab-separated locks, then migrates them when a matching item lock supplies the lane.

```
owner: lane-health auto-dispatch
lane: codex-a
item: API-12
started: 2026-10-09T15:04:05Z
```

A lock uses the same item, lane and start time, plus its coordinator and an optional preserved note:

```
coordinator: lane-health auto-dispatch
lane: codex-a
item: API-12
started: 2026-10-09T15:04:05Z
note: usage limit; send nothing until reset
```

| Line | Meaning |
|---|---|
| `item` | the item id (the filename wins if they differ) |
| `lane` | the tmux session that took the item |
| `started` | the ISO time the assignment began |
| `owner` | the process or coordinator that recorded the assignment |
| optional `title` and `now` | display text supplied by the worker |

A title or `now:` text must read as plain words: no brackets, braces, angle brackets, operators, quotes (except an apostrophe inside a
word), slashes, pipes, semicolons, backticks or dollar signs, and no code. Text that fails is skipped whole, never cut or repaired. A
title is cut to 60 characters, a `now:` sentence to 120.

Which item a row shows is decided from live evidence, and a row shows nothing rather than a stale item. A claim is ignored when:

- a commit made today starts with the item id;
- a report for the item is newer than the claim;
- it is older than 12 hours (24 hours for a lane that is working);
- the lane is sleeping and the claim is older than the lane's last change.

A claim that names another lane never shows on this lane. An older claim with no `lane:` line is matched to a lane by what its pane
shows (the item id, or the path of a brief for that item). An idle lane whose own claim is over 6 hours old shows "stale claim: ITEM" in
amber; after 7 days it is not shown at all.

## Landed work and cleared assignments

Each check reads local `main` commit subjects from repository roots listed in `.cockpit/config.json`. A subject beginning with an item id and a colon or space marks that plan row done and records `landed <short-sha>` in its history. When a matching claim points to an existing dirty worktree, the checker waits. A completed item moves its matching claim and lock into `lane-health/cleared/`; no evidence file is deleted. Other stale claims and locks are moved there with a `cleared` evidence line when the lock names another item, an old claim has no running plan row, a stable prompt plus a report persists for two checks, or an idle lane has a report for a done or blocked row.

## Unlisted workers

A live subagent without a plan id, a busy lane whose claim or lock names an unknown item, or a busy lane with no item evidence is added to `plan.json` as one running Off plan row. Its temporary title starts with `Untitled:` and is built from a scrubbed description or the unknown item id. The checker queues `{id, owner, since, hint, asked}` in `lane-health/needs-name.json`; it never records the worker prompt. On each coordinator prompt, the UserPromptSubmit hook adds one naming line for every still-untitled row, with the worker type and elapsed time. Use `plan-set <id> running <owner> --add "Short name"` to name the row, or `plan-set <id> running <owner> --milestone <milestone-id>` to attach it. The prompt context also asks for a plan page republish once per plan change when the published stamp is behind; it clears the request when the stamp catches up. A running step whose owner has no live worker for two checker passes gets a no-worker note.

## reports/&lt;item&gt;-report.md

A worker writes one when it stops. The file name without `-report.md` is the item id. Cockpit reads the 30 newest and shows 8 in the
Flight log (20 when expanded).

```
# API-09 report: retries in the sync client

Status: pushed to main, gate green (exit 0)

The client now retries with backoff. Commit 7c41de90.
```

Each entry is two rows: the status and the name on the first, the details on the second. The name in the Flight log is the first heading with the word "report" taken out. The details are the first `Status:` or `Gate:` line, else
the gate evidence, else the first sentence under the heading, followed by who did the work (a `Lane:` or `Model:` line, when the report has one) and how long ago. The second row is cut with an ellipsis, never wrapped. A report is judged in this order, most reliable first:

1. The heading plus the first `Status:` or `Gate:` line. A negative reads ERRORED: not pushed, not landed, not committed, no push, no
   commit, gate red, failed, failing, aborted, errored, did not land, not done. Else "blocked" without a positive reads BLOCKED. Else a
   positive reads DONE: done, landed, pushed, fixed, built, complete, installed, passed, green, committed.
2. Else the last gate exit code in the text: a line that names the gate (or your gate command) with `exit N` or `exit code N`. 0 is DONE,
   anything else is ERRORED. A green run after a red one is DONE; a red run after a green one is not.
3. Else the first lines for a plain statement ("landed on main", "not pushed").
4. Else UNKNOWN. A report that cannot be read is never shown as DONE.

The Flight log's four words (DONE, ERRORED, BLOCKED, UNKNOWN) are its own. They are not the row status words below. A crew member that is
errored or blocked also gets an entry, stamped with when the trouble began.

## Row status words

A crew row shows one word from a closed list. Whatever Cockpit detects, the word is one of these nine:

| Word | When |
|---|---|
| working | the lane is at work: its pane matches a working marker. What it is doing is on the task line, not in the word. |
| idle | the Captain, when it is not working. No other row says it. |
| sleeping | the lane's pane is idle |
| waiting | the pane asks something of you (a y/n prompt, "Would you like to", "waiting for your input", approval) |
| blocked | the lane is not working and waits on another lane (see `deps.json`), or on a machine-wide gate lock (its pane says "waiting for the gate lock") |
| stuck | the lane is working but its pane has not changed for 45 minutes |
| errored | its session is gone while its lock file is live, or it sits at a bare shell prompt with a live lock, or, while not working, its pane shows an auth, rate limit or API error, or its process exited |
| gate failed | the pane shows a failing test or a failed gate (the lane's own latest gate result, not text it quotes) |
| done | a subagent of the Captain that finished (its row stays under the Captain). Lane rows do not say it: a landed item shows as a short celebration on the row and in the Flight log |

A pane that shows a usage or credit refusal ("usage limit", "out of credits") is not errored: the row is dimmed as out of credits.
Rows are ordered active first, then attention (waiting, blocked, stuck, errored, gate failed), then out of credits, then sleeping. Two or
more sleeping rows fold into one strip.

## How a lane is found and read

Cockpit runs `tmux list-sessions` and `tmux capture-pane`. A session is a lane when:

- its name starts with `codex-`, `opencode-`, `local-` or `cloud-` (its kind comes from the name: `cloud-` is a plain tmux session), or
- it is listed under `lanes` in the config (its kind is given), or
- it has a file in `locks/`, named after the session (kind `tmux`).

Turn the first rule off with `"discoverLanes": false`. A lane is working when the last lines of its pane match a `working` marker for its
kind, unless an `idle` marker matches the last non-empty line. A pane that ends at a shell prompt is idle. The defaults:

| Kind | working markers |
|---|---|
| `tmux` (a Claude Code session) | `Working`, `esc to interrupt` |
| `codex` | `Working`, `esc to interrupt` |
| `opencode` | `esc interrupt` |
| `local` | `Working`, `esc to interrupt` |

A running `opencode run` process (found with `ps`) marks working the OpenCode lane whose pane shows its brief. When there is no OpenCode
lane at all, the run appears as a row called `opencode`.

## Optional files

- `briefs/brief-<ITEM>.md`: only its first heading is read. It is the row's title when the claim has none. A brief path that a lane's pane
  names ties that lane to the item.
- `deps.json`: `{"waits": [{"member": "codex-d", "on": "codex-a", "why": "needs the client pin from API-12"}]}`. The row of `member` shows
  blocked and the reason. The edge fades when the other lane's report appears or its lock clears.
- `targets.json`: `{"API-12": "Sync client"}`. A short name for an item, shown beside the lane's state.
- `progress/<lane>.json`: `{"pct": 40, "label": "tests written"}`, or `{"done": 2, "total": 5}`. `note` works for `label`, `item` names the
  item.
- `lane-locks/<lane>.lock`: key/value lines for coordinator, lane, item and started time, with an optional `note`. The lane-health assignment helper writes this alongside the claim. The reader also accepts the old one-line tab-separated form while migrating it.
- `presence.json`: `{"mode": "away", "since": "2026-10-09T15:04:05.000Z"}`. `mode` is `away` (Autopilot on) or `active` (Autopilot off).
  A missing or broken file reads as off.
- `credits.json`: read only, for the limits rows. Not needed.

## Inbox

Add Bug and Add Idea open a one-line field under the button row. After Enter, the text is appended as one line to `inbox/bugs.md` or
`inbox/ideas.md` (the folder and file are made when missing), then sent to the Captain as `Bug: <text>` or `Idea: <text>`. Where the
pane has no field, the buttons fill the prompt box with `/cockpit bug ` or `/cockpit idea ` instead; the command saves the line the same
way but does not message the Captain.

```
- 2026-10-09T15:04:05.000Z the forecast card is blank on phones
```

Control characters are removed and the text is one line of at most 2000 characters. Empty text is refused.

`inbox.jsonl` holds the same item as one JSON line each, for an agent to read and answer:

```
{"id":"3fa","kind":"bug","text":"the forecast card is blank on phones","at":"2026-10-09T15:04:05.000Z","by":"you","status":"new"}
{"id":"3fa","status":"filed","ref":"WEB-12"}
```

`kind` is `bug` or `feature`. A later line with the same `id` and a `status` (and an optional `ref`) updates the item. A line that is not
JSON, or has no `id`, is skipped.

When the host refuses a message (a dialog is up, or there is no composer), Cockpit appends `- <ISO time> <text>` to `inbox/captain.md`,
puts the text in the prompt box and says so in a toast.

## Autopilot and the away log

The AUTOPILOT button writes `presence.json` and sends the Captain one of two messages:

- on: `Autopilot ON: I am away. Keep working, never ask me anything, log decisions to .cockpit/away-log.md.`
- off: `Autopilot OFF: I am back. Summarize what happened while I was away, then ask your pending questions.`

The Captain is expected to follow them. `away-log.md` is plain Markdown: each bullet or plain line is an entry; headings and blank lines
are not. An entry with `BLOCKED` in it is drawn with a red pill, one with a decision word (decision, decided, chose, picked, approved) with
a blue pill. The "While you were away" card shows while Autopilot is off and the file has entries, with a "clear log" button that empties
the file.

## Flight log and Black box

Neither has a file of its own.

- The Flight log is built from `reports/` (above) and from crew members that are errored or blocked, newest first.
- The Black box is this session's own events, kept in memory (the last 200): your prompts, subagents spawned and finished, edits, errors,
  denied tool calls, consults, and a line when a lane changes between working and idle. The first poll after a load only sets the
  baseline, so a reload does not log every lane. Credential-like text is masked before it is stored.

## Configuration

Moved to [CONFIG.md](CONFIG.md).

## A block for your agents

Paste this into the `CLAUDE.md` (or `AGENTS.md`) of the project, so the Captain and the workers write what Cockpit reads:

```
## Cockpit

Keep .cockpit/status.json current each turn: updated (ISO time), milestone, done, total, now, next, you.
When you take an item, write .cockpit/claims/<ITEM>.claim: line 1 the item id, line 2 "lane: <your tmux session>",
line 3 a short plain title, and optionally "now: <one plain sentence>".
When you stop, write .cockpit/reports/<item>-report.md: a heading, then a "Status:" line that says done, not pushed, or blocked,
and the gate's exit code.
While Autopilot is on, never ask the user anything: log decisions and blocked items to .cockpit/away-log.md.
```
