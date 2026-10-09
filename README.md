# Claude Cockpit

Claude Cockpit is a Claude Code plugin. It puts one pane beside your session that shows what the rest of your agents are doing: the
Codex, OpenCode, local model and extra Claude sessions you run in tmux. You see who is working, who is waiting for you, who is blocked,
and what finished or failed, without switching windows or scrolling back through terminals.

It does not run your agents and it does not decide anything for them. It reads tmux and a few plain files your agents write, and shows
them. The files are described in [docs/PROTOCOL.md](docs/PROTOCOL.md).

<p align="center">
  <img src="docs/img/pane-dark.png" alt="The Cockpit pane in a dark theme" width="420">
  <img src="docs/img/pane-light.png" alt="The Cockpit pane in a light theme" width="420">
</p>

The pictures are drawn from the synthetic project in `examples/project` (an invented app, a user called alex, example.com) with
`tools/shot.ts`. The buttons and the plain text around the cards are simulated in the picture; the cards are drawn by the plugin's own
code.

## What the pane shows

The pane is one scrolling page. Top to bottom:

1. **Status card.** The milestone, a progress bar and count, then NOW, NEXT and YOU in one line each. The arrow opens all three in full.
   YOU is what waits on you; it turns red when something is blocked on it.
2. **Buttons.** Add Bug and Add Idea (one line of text, saved to a file and sent to your coordinating session), and an Autopilot switch: the word AUTOPILOT in grey when off and green when on (colour is the only state; there is no "off" or "on" text).
3. **Crew.** A collapsible line ("Crew", with a summary such as "2 working, 1 idle"; open by default, and the choice is remembered) over one row per agent session, with an animated character, a status word, the item it owns, what powers it (GPT-6, Sonnet 5.5,
   local) and how long it has been in that state. The Captain (the session Cockpit runs in) is first. An active row has a moving green
   border, a blocked or waiting row is amber, a failed one is red, a sleeping one is grey. Open a row for what it is doing, its task,
   its last report and its limits. A crew member whose account refused it shows a red label on its row (OUT OF CREDIT, RATE LIMITED or AUTH FAILED) with the matching output line on its card, a red count in the Crew summary, and a red chip on the status card and the status bar; it clears when newer output no longer shows the error.
4. **System card.** Collapsed to one line ("System: healthy"). Open it for this computer's memory, CPU and disk gauges (each row starts with
   its icon in the gauge's health colour), the plan limits,
   and, if you list them under `hosts` and `services` in the config, other computers (memory, GPU) and services (up or down).
   Nothing listed means nothing else is checked. While the System card is closed, its line, the Flight log and the Black box stay pinned at the bottom of the pane, and an open card scrolls above them.
5. **Flight log.** What finished and what did not, newest first: DONE, ERRORED, BLOCKED or UNKNOWN, two rows each (the status and the title, then the details: what happened, who did it and when, cut to one line), judged from the
   agents' report files.
6. **Black box.** The last events of this session: your prompts, subagents, edits, errors, denied tool calls, and lanes changing between
   working and idle. Open it for the last 40.

When you press Autopilot, Cockpit tells the Captain you are away and to log its decisions. A "While you were away" card then collects
them for when you return.

![An open Status card and an open crew row](docs/img/pane-open.png)

## Features

- **tmux lanes.** Any tmux session named `codex-*`, `opencode-*` or `local-*` is a crew row. Name others under `lanes` in the config.
  Working or idle comes from what the last lines of the pane show, and you can set your own markers.
- **Codex.** Reads the model line of the Codex screen, and shows the 5 hour and weekly usage in an open row, from Codex's own session
  logs.
- **OpenCode.** Reads the model of a running `opencode run` and ties the run to the lane whose pane shows its brief.
- **Local models.** A `local-*` session is a row. Give it markers for your server ("Generating", "tokens/s").
- **Claude Code sessions in tmux.** Listed under `lanes` with kind `tmux`; "esc to interrupt" means working.
- **Plain-word rows.** A row shows an item id and a short title written by a person (the claim file's third line), never a scraped
  fragment of code or log text. Text that does not read as plain words is dropped.
- **Nine status words, and no others.** working, idle, sleeping, waiting, blocked, stuck, errored, gate failed, done.
- **Gate and gate-lock aware.** A lane that waits for a shared gate lock is blocked on it. A failing test or gate shows "gate failed".
- **The Deck.** A second pane (`/cockpit deck`) for this session's own events: context, permission checks, subagents, a turn receipt and a
  log.
- **Other computers and services.** List `hosts` (read through ssh) and `services` (a GET each) in the config and the System card shows
  them under the names you gave. None by default.
- **Status line.** "all saved" or "unsaved: 3 uncommitted files, 1 unpushed commit", summed over the repositories you name.
- **Health icons in the status bar.** The bottom row of the bar above the prompt (the crew line) ends with four small icons: a chip (CPU), a
  memory stick, a drive (disk) and a graphics card (GPU, only when a listed host reports one), each coloured by the same level the System
  card draws, with the figure as its tooltip. Nothing in the bar is an expand control, and there is no "System" label.
- **Credit icons in the status bar.** The middle row ends with two more icons: a cloud (the cloud sessions' credit) and a
  coin (the API credit). Green is fine, amber is low, red is out (a crew pane showing a credit error turns the matching icon red), and a
  grey icon with the tooltip "unknown" means Cockpit cannot read it; it is never hidden and no balance is invented.

![The three rows of the status bar at 420 px, dark and light](docs/img/band-dark.png)
![The three rows of the status bar at 420 px, light](docs/img/band-light.png)

- **Light and dark themes**, and motion that stops when you turn it off.

## Why use it

- You see one screen instead of five terminals. The question "who is waiting for me?" has one answer.
- It shows evidence, not claims. A row says working because the pane shows work, and a report says DONE because its status line and gate
  exit code say so. A report nobody can read is UNKNOWN, never DONE.
- It stays out of the way. It writes only when you ask: Autopilot, Add Bug and Add Idea, `/handoff`, and lane start, restart or clear
  after a y to confirm.
- It works with any agent that can write a text file. The protocol is a few plain files, so you can feed it from a shell script.
- It needs nothing to start. With no files at all it shows a card that says what to create.

## Install

You need Claude Code with plugin support, and tmux for lanes. Cockpit loads as a hooks module (`hooks/hooks.json`).

1. Get the code:

   ```
   git clone <repository url> claude-cockpit
   ```

2. Add the folder as a marketplace and install the plugin (in your shell):

   ```
   claude plugin marketplace add ./claude-cockpit
   claude plugin install cockpit@claude-cockpit
   ```

   Inside a session the same steps are `/plugin marketplace add ./claude-cockpit` and `/plugin install cockpit@claude-cockpit`. To try it
   without installing, start Claude Code with `claude --plugin-dir ./claude-cockpit`.

3. Start (or restart) Claude Code in your project, then run `/cockpit` to open the pane. Run it again to close it.

4. Tell your agents what to write. Paste the block at the end of [docs/PROTOCOL.md](docs/PROTOCOL.md) into your project's `CLAUDE.md`
   or `AGENTS.md`. To see a full pane right away, look at `examples/project`: `bun tools/demo.ts` rewrites it, and its files show every
   format.

5. Optional: add `.cockpit/config.json` for your own lane names, markers and folders (see
   [Configuration](docs/PROTOCOL.md#configuration)). `/cockpit-status` prints which config files were read and what is wrong with them.

When Cockpit has nothing to show, the pane says so and names the files it looks for. That is the first thing you will see in a new
project.

### Commands

| Command | What it does |
|---|---|
| `/cockpit` | Show or hide the pane |
| `/cockpit autopilot on` or `off` | Switch Autopilot (a bare `autopilot` toggles) |
| `/cockpit bug <text>`, `/cockpit idea <text>` | Save a line to `inbox/bugs.md` or `inbox/ideas.md` |
| `/cockpit start`, `restart`, `clear <lane>` | Start, restart or clear a lane; each asks for a y first |
| `/cockpit layout`, `deck`, `motion`, `panels` | Options for the Deck and the pane |
| `/cockpit-status` | Poll once and print the pane as text (works where no pane can draw) |
| `/handoff` | Write `.cockpit/handoffs/HANDOFF-<date>.md` from the status, the locks and what landed |

`/crew` and `/lanes` are aliases of `/cockpit`.

## The protocol

Cockpit reads files under your project's `.cockpit` folder. The three that matter most:

- `status.json`, written by your coordinating agent: milestone, done and total, now, next, you.
- `claims/<ITEM>.claim`, written by a worker that takes an item: line 1 the item id, line 2 `lane: <session>`, line 3 a plain title,
  and an optional `now: <sentence>`.
- `reports/<item>-report.md`, written by a worker that stops: a heading and a `Status:` line.

[docs/PROTOCOL.md](docs/PROTOCOL.md) has every file, every rule for how a row or a report is judged, and the closed list of status words.

## Develop

```
bun test                      # 544 tests in 32 files, no Claude Code needed
bun tools/demo.ts             # rewrite examples/project
bun tools/shot.ts             # redraw docs/img from examples/project (needs Chrome; set CHROME if it is not the macOS default)
```

Type-check with `tsc --noEmit -p tsconfig.json`. It needs the host's type files in `.claude-plugin/types`, a generated cache that git
ignores, so a fresh clone does not have them and the type-check cannot run there. `hooks/` holds the code: nearly all of it is
pure functions with no host calls, and only `hooks/register.tsx` talks to Claude Code.

## Credits and licence

Cockpit is MIT licensed (see [LICENSE](LICENSE)). It builds on the ideas of two MIT licensed projects, and a small part of its code is
adapted from them:

- [claude-flightdeck](https://github.com/scasella/claude-flightdeck) by Stephen Casella: the Deck, the Black box, layout and option
  names, and the credential masking.
- [savvy-progress](https://github.com/JohnnyVizz/claude-kit/tree/main/plugins/savvy-progress) in claude-kit by johnnyvizz: the progress
  band idea and the animated character per row. The character art in Cockpit is original.

Their notices are in [NOTICE](NOTICE).
