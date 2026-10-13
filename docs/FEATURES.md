# Features and the pane, in full

The short version is in the [README](../README.md).

## What the pane shows

The pane is one scrolling page. Top to bottom:

1. **Status card.** The milestone, a progress bar and count, then NOW, NEXT and YOU in one line each. The arrow opens all three in full.
   YOU is what waits on you; it turns red when something is blocked on it.
2. **Buttons.** Add Bug and Add Idea (one line of text, saved to a file and sent to your coordinating session), and an AWAY switch: the word AWAY in grey when off and green when on (colour is the only state; there is no "off" or "on" text).
3. **Agents.** A collapsible line ("Agents", with a summary such as "2 editing, 1 running tests, 1 idle"; open by default, and the choice is remembered) over one row per agent session, with an animated character, a status word, the item it owns, what powers it (GPT-6, Sonnet 5.5,
   local) and how long it has been in that state. The main session (the one Cockpit runs in) is first. An active row has a moving green
   border, a blocked or waiting row is amber, a failed one is red, a sleeping one is grey. Open a row for what it is doing, its task,
   its last report and its limits. An agent whose account refused it shows a red label on its row (OUT OF CREDIT, RATE LIMITED or AUTH FAILED) with the matching output line on its card, a red count in the Agents summary, and a red chip on the status card and the status bar; it clears when newer output no longer shows the error.

   <picture><source media="(prefers-color-scheme: light)" srcset="img/plan-running-light.gif"><img src="img/plan-running-dark.gif" alt="The plan tree with a small animated worker under each running step." width="420"></picture>
4. **Waiting on me.** The first thing in the plan area: every item that needs you (blocked with you as owner, plus new asks from the status file), each with the exact ask in full words, wrapped, never cut. Each plan row has a check (mark it done: state done, a done time and a history line) and an X (remove it from the plan; an inline notice with an undo arrow stays for 8 seconds). Both write the plan file atomically and touch no other item. Empty: "Nothing is waiting on you".
5. **Running work.** In the Agents card, under the sessions: one row per plan item that is running (its plain title, id, owner and note), including running items that are not on the plan (also listed under OFF PLAN while they run), and a "Local model" line: whether the local model server answers on port 54800 (`/health`) and which model alias it serves (`/v1/models`), probed in the background every 15 seconds with a 2 second limit. "no agents running" shows only when nothing runs.
   The plan area is a stack of collapsible cards in a fixed order (Title, System, Needs me, Pending, Blocked, Off plan, Done), each with a count and its own saved open flag; Blocked, Done and System start closed. Rows in Needs me, Blocked and Off plan have a column of four buttons: done, remove, a question mark (asks the main session to explain or to ask you with AskUserQuestion) and retry (back to todo and re-dispatch). Red means only failed; an owner that is gone reads "no live owner" in grey; only Needs me blinks. The panel has the plan cards and Agents, each with its own open or closed flag. Titles and notes wrap onto more lines and are never cut; the title comes first and the id is small under it, and a title that only repeats the id shows the latest `--say` or the note instead.

When you press AWAY, Cockpit tells the main session you are away and to log its decisions. A "While you were away" card then collects
them for when you return.

![An open Status card and an open agent row](img/pane-open.png)

## The plan page

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="img/page-home-light.png">
    <img src="img/page-home-dark.png" alt="The plan page home: goal, progress bar, counts, a System card with dismissable issues, and the milestones" width="300">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="img/page-steps-light.png">
    <img src="img/page-steps-dark.png" alt="A milestone open: each step has a copy-ID button and a question mark; one step is expanded with its question box and the send button" width="300">
  </picture>
</p>

Run `plan-page-build` and publish the result as an Artifact, and the pane shows the plan as a page. Each milestone and step opens in place. On every step:

- **Ask a question.** Type a question or instruction and press send. With the Artifact runtime it goes to your session as a message (`API-12: why is this blocked?`). Without it, the text is copied for you to paste.
- **Copy ID.** One click copies the step id, so you can name it in any prompt.
- **Expand items.** Open a milestone to see its steps, and a step to see its owner, start time and notes.
- **Dismiss system issues.** Usage at 70% or more, cloud credits near expiry, a host that is offline or a service that is down show as attention items. Dismiss one and it stays hidden on that browser until the issue clears and comes back.

The in-terminal pane has the same actions on each row: a check (mark done), an X (remove, with an 8 second undo), a question mark (asks the session to explain, or to ask you), retry, and keys 1 to 9 to open an agent card.

### Characters and the fixed goal card

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="img/page-asleep-light.png">
    <img src="img/page-asleep-dark.png" alt="The plan page with nothing running: the Running and Needs you characters are asleep" width="300">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="img/page-done-light.png">
    <img src="img/page-done-dark.png" alt="A finished plan: the four characters dance above the progress bar" width="300">
  </picture>
</p>

- **Tile characters.** Each of the four tiles (Running, Needs you, To do, Done) has one small custom pixel character, drawn by us on a 20x20 grid (no outside art). A count of 0 puts it to sleep (curled up, a drifting z) and dims the tile and the character the same way (one `--dim-o` / `--dim-f` token, fading on change); a count above 0 wakes it at full brightness. The pose comes from the same count the tile shows. Each tile recolors the same figure through a CSS variable: blue, orange, grey, green.
- **Real frame-by-frame animation.** Every animation is a list of 20x20 string-art frames in `assets/characters-frames.js` (generated by `bun tools/charart.ts`), drawn as crisp SVG rects, played by a frame player at about 4 to 7 fps (65% of the drawn speed). Each state has 6 to 9 main animations with props (asleep: curl, nod, nightcap and blanket, teddy, hammock, snore bubble; running: run, sprint, jog, flag, briefcase, coffee, chasing bug, skateboard, jetpack; needs you: wave, jump, point, sign, bell, megaphone, siren, phone; to do: shuffle, look, watch, clipboard, book, laptop, coffee, fishing, juggling; done: pump, thumbs, spin, trophy, popper, star, fireworks, medal, balloons) and 4 idle animations. `bun tools/charsheet.ts` draws a contact sheet of every frame (`docs/img/characters-sheet-*.png`) and two sample GIFs.
- **Never still.** Every state has 4 idle animations (breathing, blinking, a foot tap, a shrug and so on, 6 frames each) that the picker interleaves with the main ones, so a character waiting for its next pick is always moving. Only `prefers-reduced-motion` shows a still frame.
- **Never one loop.** A small timer in the page swaps to another animation at random, never the same twice in a row, after a hold of 2.5 to 6 seconds. With `prefers-reduced-motion` the characters stay on one still frame. A fixed seed (`window.CHR_SEED`) makes the sequence repeatable; the screenshot scripts use one.
- **Dancing when done.** The goal card has no character until every step is done, and the Done tile is then lightly shaded green (no animation). Then the four tile characters run out of their tiles to the goal area above the progress bar (1.2 s) and dance there, each its own routine of 11. When a new step opens they run back to their tiles. Under reduced motion they jump there and stand still.
- **The trip, frozen.** `docs/img/page-travel-1-*.png` and `page-travel-2-*.png` show the run to the goal area at 30% and 70%.
- **Right-aligned dancers.** The dancers stand at the right end of the goal header row, just above the progress bar, on the page and in the pane. A long title runs behind them (the title is drawn above them) and, in the pane, wraps before it reaches them when it can.
- **Characters in the pane.** The real Cockpit pane draws the same four tile characters, dimmed at 0, with the same trip to the goal card and the same dance, from the same shared script (`hooks/chars.ts` loads `assets/characters.js`). Reduced motion stops them. `bun tools/charpane.ts` takes the pictures (`shots/pane-chars-*.png`).
- **Fixed goal card.** The goal card (title, bar, count) stays at the top of the page while everything else scrolls under it.

## The full side pane

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="img/pane-all-light.png">
    <img src="img/pane-all-dark.png" alt="The whole side pane with every section open: Main status, Agents, System, Events and System log" width="420">
  </picture>
</p>

## Features

- **tmux lanes.** Any tmux session named `codex-*`, `opencode-*`, `local-*` or `cloud-*` is an agent row. Name others under `lanes` in the config.
  What it is doing comes from what the last lines of the pane show, and you can set your own markers.
- **Codex.** Reads the model line of the Codex screen, and shows the 5 hour and weekly usage in an open row, from Codex's own session
  logs.
- **OpenCode.** Reads the model of a running `opencode run` and ties the run to the lane whose pane shows its brief.
- **Local models.** A `local-*` session is a row. Give it markers for your server ("Generating", "tokens/s").
- **Claude Code sessions in tmux.** Listed under `lanes` with kind `tmux`; "esc to interrupt" means busy.
- **Plain-word rows.** A row shows an item id and a short title written by a person (the claim file's third line), never a scraped
  fragment of code or log text. Text that does not read as plain words is dropped.
- **Declared state words, and no others.** Editing, Running tests, Reading, Searching, Browsing, Reviewing, Planning, Active (when the activity cannot be told), Needs you, Blocked (with its reason), Done (with how long ago) and Idle. One list in `hooks/activity.ts` feeds every row, chip and count. The count line reads "1 session, 5 agents (2 editing, 1 running tests, 1 needs you)": a session is a conversation (this one plus each awake tmux lane), an agent is a subagent a session started, and zero counts are left out.
- **Gate and gate-lock aware.** A lane that waits for a shared gate lock is blocked on it. A failing test or gate shows "Blocked: gate failed".
- **The Deck.** A second pane (`/cockpit deck`) for this session's own events: context, permission checks, subagents, a turn receipt and a
  log.
- **Other computers and services.** List `hosts` (read through ssh) and `services` (a GET each) in the config and (deprecated in 0.21.0: the System card that showed them was removed).
  None by default.
- **The status row above the input box.** Row 1 of the bar reads, left to right: a progress bar, the milestone title once, and the done count
  right after it ("9/10"). The bar, the title and the count are plain coloured text (block cells, green for done and dim for left), not a
  picture, so the host always draws them. The bar is 12 to 30 cells and shrinks to 12 before the title truncates with an ellipsis; the
  count is never dropped. At the right edge: "you: N" when something waits on you, a "!" badge when an agent errored, four small system
  icons, the AWAY switch and the pane button. Nothing in the bar is an expand control.
- **The line under the input box.** It shows the session and agent count and nothing else, for example "1 session, 5 agents" (the
  breakdown in brackets is dropped when the line would run past 56 characters). If you list repositories under `repos` in the config, the
  same line also gets "all saved" or "unsaved: 3 uncommitted files, 1 unpushed commit" every 30 seconds, and whichever was written last is
  the one you see. That line holds text only: no colour, no icons.
- **System icons.** A chip (CPU), a memory stick, a drive (disk) and a graphics card (GPU, only when a listed host reports one), each
  coloured by the same level the System card draws, with the figure as its tooltip. They sit at the right end of row 1, left of AWAY.
- **Credit row.** Row 2 of the bar is one packed line, flush left, in a fixed order: Claude plan, Claude cloud, API, Codex. Each
  service is a small icon, a bar of what is left (block characters, because the host's bar row draws text) and a short figure. Green is fine,
  amber is low, red is out; a grey icon with an empty bar and `?` means Cockpit cannot read it, and no balance is invented. The local model is
  not on this line (it stays in the Main status card and the System card). A narrow row shortens the bars first, then the figure, and never drops a
  service. The icons are simple generic marks drawn by Cockpit (an asterisk, a cloud, a coin, a terminal prompt), distinct in shape so colour is
  never the only cue; the same marks lead the rows of the Main status card. No vendor logo is used.


![The status row, the input box and the line under it, 140 columns, dark](img/status-row-dark.png)
![The same in a light theme](img/status-row-light.png)

The pictures are drawn from the plugin's own row functions in a headless browser. A browser draws the block cells with hairline seams that a terminal does not.

- **Light and dark themes**, and motion that stops when you turn it off.

## Commands

| Command | What it does |
|---|---|
| `/cockpit` | Show or hide the pane |
| `/cockpit away on` or `off` | Switch AWAY (a bare `away` toggles; `autopilot` still works as an old alias) |
| `/cockpit bug <text>`, `/cockpit idea <text>` | Save a line to `inbox/bugs.md` or `inbox/ideas.md` |
| `/cockpit start`, `restart`, `clear <lane>` | Start, restart or clear a lane; each asks for a y first |
| `/cockpit layout`, `deck`, `motion`, `panels` | Options for the Deck and the pane |
| `/cockpit-status` | Poll once and print the pane as text (works where no pane can draw) |
| `/handoff` | Write `.cockpit/handoffs/HANDOFF-<date>.md` from the status, the locks and what landed |

`/agents` and `/lanes` are aliases of `/cockpit`.

## The files Cockpit reads

Cockpit reads files under your project's `.cockpit` folder. The three that matter most:

- `status.json`, written by your coordinating agent: milestone, done and total, next, you. Everything else on the Main status card fills itself:
  NOW is the active claims, RUNNING counts awake lanes and running agents, LANDED is the newest commit in your `repos`, REPORT is the newest report.
  When the file is older than `notesHours` (default 6) the Next and You lines get a small dim "notes from 2d ago"; the card never says stale.
  `tools/status-set <key> <value...>` patches one key (milestone, done, total, next, you) and stamps `updated`.
  Under the lines the card always shows five service rows (Claude plan, Claude cloud, API, Codex, local model): a bar of what is left, the reset or expiry, and a small
  "auto" or "manual" marker with the age of the reading. Claude plan, Codex, API and the local model are read automatically (the usage cache, Codex's session files,
  the spend database since the baseline date in `credits.json`, a health probe); Claude cloud is manual (days to its expiry date). A manual figure older than 24 hours
  shows "check"; an unknown figure shows "unknown", never a blank.
- `claims/<ITEM>.claim`, written by a worker that takes an item: line 1 the item id, line 2 `lane: <session>`, line 3 a plain title,
  and an optional `now: <sentence>`.
- `reports/<item>-report.md`, written by a worker that stops: a heading and a `Status:` line.

[PROTOCOL.md](PROTOCOL.md) has every file, every rule for how a row or a report is judged, and the closed list of status words.

## Develop

```
bun test                      # about 720 tests in 34 files, no Claude Code needed
bun tools/demo.ts             # rewrite examples/project
bun tools/shot.ts             # redraw docs/img from examples/project (needs Chrome; set CHROME if it is not the macOS default)
```

Type-check with `tsc --noEmit -p tsconfig.json`. It needs the host's type files in `.claude-plugin/types`, a generated cache that git
ignores, so a fresh clone does not have them and the type-check cannot run there. `hooks/` holds the code: nearly all of it is
pure functions with no host calls, and only `hooks/register.tsx` talks to Claude Code.
