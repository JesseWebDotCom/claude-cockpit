# Rules for Claude

Cockpit only shows what your sessions write down. Paste this block into the `CLAUDE.md` (or `AGENTS.md`) of any project that uses it. It is about 170 tokens, paid once per session.

```
## Cockpit
Keep the plan true: run `plan-set <id> <state> [owner] [--say "one plain line"]` when an item starts, blocks, finishes or is added. Say a line only for a change Jesse would care about.
Once per turn, after the last plan-set, rebuild and republish the plan page (`plan-page-build`, then publish the file to the same Artifact URL).
Write .cockpit/claims/<ITEM>.claim when you take an item (line 1 id, line 2 "lane: <session>", line 3 a short title).
Write .cockpit/reports/<item>-report.md when you stop: a "Status:" line (done, not pushed, or blocked) and the gate's exit code.
A message that starts with an item id ("API-12: why is this blocked?") is a question from the plan page or the pane. Answer in two plain sentences. If it needs a decision, ask with AskUserQuestion.
While Autopilot (AWAY) is on, never ask: log decisions and blocked items to .cockpit/away-log.md.
```

Replace "Jesse" with your name. Everything else works as written.

## What each rule feeds

| Rule | Cockpit shows |
| --- | --- |
| `plan-set` | the plan tree, the progress bar, the count (7/16), the pills |
| republish the plan page | the page in the right-hand pane, with the Ask, Copy ID, expand and dismiss controls |
| claims | which agent owns which step |
| reports | the Events list, and DONE or BLOCKED on a step |
| id-first messages | the question box on the plan page, and the question-mark button in the pane |
| away-log | the "While you were away" card |

## Token cost

Measured, not guessed.

- **The band, pane and pills cost nothing.** They are drawn by the plugin from files on disk. No model reads them.
- **`plan-set` prints about 10 bytes.** The plan file and the 90 KB page are files, never read back into the conversation.
- **You pay for four things:** the rules block above (once per session), the `cockpit-plan` skill when a session loads it (about 1,000 tokens, only when it runs), each `--say` sentence, and one publish call per turn that changes the plan.
- **Ask and "tell the session" cost tokens only when you press them.**

To spend less: leave `--say` off for routine state changes, skip the republish on turns that did not touch the plan, and keep the plan to the steps you want to watch rather than every small task.
