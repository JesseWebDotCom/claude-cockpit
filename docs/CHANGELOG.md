# Changelog

## 0.20.0: the plan-focused Cockpit
The Main status card is now a plan card when a plan file exists (`plan.json` in the data folder; set `planFile` in `.cockpit/config.json` to point elsewhere). It lists the goal, a progress bar counted from the rows, then RUNNING, BLOCKED, TODO, DONE and OFF PLAN, with a "synced Nm ago" chip that turns amber at 10 minutes and red at 30 behind the evidence. The top bar shows the plan's title, bar and n/m, `+k off plan`, `you: N` and a stale dot, and the line under the input box reads `plan 8/12 · running A, B · 1 blocked (you 1) · synced 2m`. All three come from one derive function (`hooks/plan.ts`), so they cannot disagree: a landed commit makes a row done, a live claim or awake lane makes it running with its owner, a BLOCKED report makes it blocked, and the file only wins when it is newer. A running row has a pulsing dot with a ripple, a tint, a scan line and a live timer; a finished row pops, holds three seconds, then slides into DONE while the bar fills; a blocked row pulses amber; an owner that is gone turns the row red. Everything animates through CSS and switches off under reduced motion or `/cockpit motion off`. New `tools/plan-set <id> <state> [owner] [--note] [--say] [--add TITLE]` edits the file atomically, and `skills/cockpit-plan` tells a coordinator when to run it. Without a plan file nothing changes. Run `/reload-plugins --force` to load it.

## 0.19.3: taller status head
The status card head is a title row, a goal and count row and a full-width bar row, so a long goal wraps instead of clipping.

## 0.19.2: the module loads again
0.19.1 passed a value to a helper defined inside the module, and the host refused the whole module (no status row, no pane, no /cockpit). The scroll hook now holds its own code, and a test checks that every helper taking the host handle is declared at the top of the file.

## 0.19.1: hooks never fail an event
Bookkeeping in the prompt, turn, tool, spawn, scroll, open/close and command hooks can no longer throw into the event it observes: a failing clock or redraw is swallowed and the prompt, tool call or spawn goes on; a failing /cockpit or /handoff answers with text saying to run /reload-plugins. `claude plugin validate` no longer warns about gating hooks without a catch.

## 0.19.0: one codebase
This repository is now the only Cockpit codebase. The hooks, tests and tools that used to live in a private copy are these, made generic through `hooks/config.ts`. Values that belong to one person (folder names, lane names, host aliases) are read from `~/.config/cockpit/config.json` and `.cockpit/config.json`, never from the repository. The demo pictures in `docs/img` were redrawn from `examples/project`, and `tools/shot.ts` now labels the switch AWAY and no longer fails on an empty host list.

## Text bar, AWAY (0.18.11)
The status row above the input box is bar, title, count, then the right group. The bar is block-cell text instead of a picture (the live host dropped the picture), the title and count are plain bold text, and AUTOPILOT is now AWAY (the saved state file and the old `/cockpit autopilot` command are unchanged). The line under the input box shows only the session and agent count.

## Plain names, declared states, count on the bar (0.18.0)
The old team vocabulary is gone: the sections are Main status, Agents, System, Events and System log, and the status text reads "1 session, 5 agents (2 editing, 1 running tests)". One definition of the counts (`hooks/activity.ts`) feeds the pane, the bar, the footer and the Main status card, so they cannot disagree. Old saved open and closed flags are read under the new section names. The done count ("1/7") sits right beside the progress bar and is the last thing to give way on a narrow bar. Row 1's right group reads, left to right: the system icons, AUTOPILOT, the pane button; narrow widths drop the icons before AUTOPILOT and never the pane button. The System header, collapsed, shows a plain colored summary ("CPU 12% · MEM 61% · DISK 40%"), each figure colored by its health level. The subscription detail (Claude plan, Claude cloud, API, Codex with reset and expiry) is shown once, in the System section's Plan limits, and no longer in Main status. In Main status the LANDED line shows one line per landed item when the card is expanded (capped, with its own "N more"). The footer under the input holds only the agent count.

## One credit row (0.17.0)
Claude, Cloud, API and Codex sit on one row of the bar, packed left to right with an even gap. When the bar is narrow the names go first, then the figures shorten, then the bars; no service is ever dropped. The reset and expiry details live in the System section's Plan limits.

## Status row regrouped (0.16.0)
Row 1 of the bar is the short description, a shorter progress bar, and at the right edge the AWAY button (named AUTOPILOT until 0.18.11) and the pane button; the third row is gone, so the bar is two rows (row 2 is the credit line). AWAY is a plain button (dim when off) with nothing between it and the pane button. On narrow widths the progress bar shrinks first, then the title truncates, then the right group gives up the "!" badge, the error count and "you"; it never wraps. The system icons moved to the status line under the input box as text (`CPU ●  MEM ●  DISK ◐  GPU ●`, from the same health levels as the System card), replacing the unsaved-work text: the host draws that line as plain text only.

## Names on the credit row (0.15.0)
Each service on the bar's second row now prints its name after its icon: Claude, Cloud, API, Codex, in the dim label colour. The names come from the one service list in `hooks/services.ts` (`short`; the Main status card keeps the longer `name` from the same entries). When the line is too narrow the bars shrink first, then the names drop to the icon alone from the right-most non-Codex service (API, cloud, Claude), Codex last; a service is never dropped and nothing wraps.

## Short description, Codex at the right edge, icons from the card (0.14.0)
Row 1 of the bar is the short description of the current work followed by the progress bar alone: no count or description text after it. Row 2 is a drawing: Claude plan, cloud and API sit flush left, Codex is right-aligned to the bar's right edge, and on narrow widths the bars shrink first (a service is never dropped and nothing wraps). Each service's icon is the exact drawing the Main status card uses (one definition in `hooks/glyphs.ts`). Claude cloud shows a dim "?" with no days or expiry. The status row has no state dots, and its buttons sit next to the count text.

## Credit line with icons and bars (0.12.0)
The bar's credit line drops the local model, sits flush left and shows icon, bar and figure for Claude plan, cloud, API and Codex; the Main status card rows use the same icons.

## Credits row and subagent tree (0.11.0)
The bar's second row always shows all five services (Claude plan, cloud, API, Codex, local model) as one compact line that shortens to the width and shows a dim `?` when a figure is unknown. Subagents in the Agents list sit at the same left edge as every other agent, with a dim tree connector before the title.
