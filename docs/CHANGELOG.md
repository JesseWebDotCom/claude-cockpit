# Changelog

## 0.26.83

- The card and the plan page show the lane-health "unsent-message" problem (text typed into a lane but never submitted) in the problem lines. lane-health now submits such text itself (one Enter per minute per lane) and sends auto-dispatch messages through the same retrying send as the new lane-send helper.

## 0.26.82

- The card and the plan page show "Auto-dispatch: on" or "Auto-dispatch: off", read from the lane-health check's autoDispatch block.
- lane-health: the coordinator reads "waiting" only when an AskUserQuestion is open or its last reply's STATE line says waiting or its YOU: is not nothing; any other ended turn is idle, "finished its turn, nothing needed from Jesse".

## 0.26.81

- The card and the plan page show "Ready to assign: N" with the first ready step's title (from health.json "ready"), and show the checker's plan-idle and ready-unassigned problems as red lines under the health header.

## 0.26.80

- Lane health on the card and the plan page: each running step shows a dot (green working, amber idle or stale, red dead, finished or needs-input) and "active 40s ago", read from health.json (config key healthFile, default health.json in the data folder). The header shows "next check in 0:42", and a red "health check stopped" line appears when the check is more than two intervals late.
- A step counts as running only while its owner is alive per health.json; with no health file the plan state stands.
- Off-plan steps are tracked like planned ones (state, owner, note, health dot) and count in Running now, Needs you and Done with an "off plan" tag, in the card, the bottom bar, the top status, the band pills and the plan page. The Off plan header reads "n running, n blocked, d/t done" and takes the running or blocked colour. They stay out of the "X of N" plan progress.
- One Coordinator row heads Running now while the coordinator session is working, sits under Needs you while it waits on you, and is hidden while idle.
- The agents count in the status row comes from the checker's live subagents when health.json has it; the footer adds "next check 0:42" when the line has room.

## 0.26.79

- Removed the leftover demo switch that marked the first two open plan steps as running (a fake Luna and Reika row stuck at 4:00). The running list now shows only real work.
- The top-bar pill labels Codex lanes by number, matching the plan page.

## 0.26.78

- tools/sync-marketplace.sh now also installs the synced version (marketplace update, plugin update, cache copy), so a release is live after one run and a Claude restart.

## 0.26.77

- Plan page: a Codex owner shows its lane number (codex-w3 reads "Luna 3"), never the last letter of its name ("Luna X"); an owner with no number reads "Luna".

## 0.26.76

- Characters switch animation every 10 to 15 seconds (a random hold, was 2 to 6 seconds), main and idle alike.

## 0.26.75

- At 100% the Done tile is only lightly shaded green: no pulse and no animated border, on the pane and the plan page.

## 0.26.74

- The Done tile at 100% no longer pulses: it is shaded green with a green border that chases around it, like the Running tile. Characters play a little faster (65% of drawn speed, was 50%).

## 0.26.73

- When the plan is 100% done the Done tile is shaded green and pulses, on the pane and the plan page (still under reduced motion in the pane).

## 0.26.72

- The characters play at half speed (every animation's frame rate halved), on the pane and the plan page.

## 0.26.71

- The pane's characters now load through a generated module (`hooks/charsdata.ts`, from `bun tools/charmod.ts`) instead of a dynamic import, which the pane engine could not run, so they showed nothing.

## 0.26.70

- Characters in the real Cockpit pane. The four count tiles (Running, Needs you, To go, Done) each show a character in the same colour as the tile, picked and animated from the same frames as the plan page (`assets/characters.js` and `characters-frames.js`, loaded by `hooks/chars.ts`; one definition, no copy). A tile at count 0 is dimmed with its character, which keeps its idle loop. When the plan is complete the four characters run out of the tiles, dance in the goal card and run back when it stops being complete. Under reduced motion the strips stop and the trip is skipped. If the shared script cannot load, the pane draws no characters and works as before.
- The goal-card dancers are right-aligned on the Artifact page and in the pane: at the right end of the goal header row, just above the progress bar. A long title can run behind them (the title is above them in z-order, and in the pane it re-wraps before it reaches them when it can).
- `tools/charpane.ts` takes pane pictures (`shots/pane-chars-*.png`); `shots/page-dance-*.png` show the page.

## 0.26.69

- Many more animations and props. Asleep, Running, Needs you, To do and Done each gain 6 prop animations (a nightcap and blanket, a teddy, a hammock, a snore bubble; a flag, a briefcase, coffee, a chasing bug, a skateboard, a jetpack; a sign, a bell, a megaphone, a siren, a phone; a clipboard, a book, a laptop, a coffee sip, fishing, juggling; a trophy, a confetti popper, a star, fireworks, a medal, balloons), and the dance has 11 routines (guitar, disco ball, pom-poms, boombox, glow sticks, hat tip added). New frames come from `tools/charprops.ts`, merged by `tools/charart.ts`.
- No character is ever still. Each state has 4 idle animations (`<state>-idle-<name>`: breathing, dreaming, twitching, rolling over; panting, tying a shoe, stretching, bouncing; looking around, foot tapping, fidgeting, shrugging; blinking, scratching, yawning, humming; proud stance, whistling, nodding, swaying), drawn in `tools/charidle.ts`. The picker interleaves them with the main animations (never two idles in a row, never the same animation twice), holding an idle 2 to 5 s and a main one 2.5 to 6 s. Only `prefers-reduced-motion` shows a still frame.
- The goal card has no character until the plan is complete. Then the four tile characters run out of their tiles to the goal area (1.2 s, run frames, a small hop), and dance there, each its own routine. They run back when the plan stops being complete (a trip reversed half way turns round from where it is). Tiles are empty while their characters are away. Under reduced motion the characters jump there and stand in a still dance pose. The trip rules are pure functions in `assets/characters.js` (`travelNext`, `travelProgress`, `travelLayout`) tested with a fake clock.
- A tile at count 0 is dimmed (lower opacity, less saturation and brightness) and so is the character in it, from one token (`--dim-o`, `--dim-f`) in both themes, fading when the count changes; the character keeps its slow idle animation. Characters travelling or in the goal area are never dimmed.
- `tools/pageshot.ts` adds `travel-1` and `travel-2` pictures (trip frozen at 30% and 70% with `window.CHR_P`). The contact sheet is now three columns wide.


## 0.26.68

- The tile and dancer characters are now real frame-by-frame animation of one custom 20x20 pixel character drawn in this repo, replacing the moved Kenney sprites (the Agents panel keeps its own). Frames live in `assets/characters-frames.js`, generated by `tools/charart.ts`, and a frame player steps them at 6 to 10 fps. Asleep 2 animations, each active tile 3, the done dance 5 routines of 8 frames.
- New `tools/charsheet.ts` renders a contact sheet of every frame and two sample GIFs. Tests check every animation exists for every state, has 2 or more same-size frames, never repeats the previous frame, and that the player advances on a fake clock.

## 0.26.67

- The plan page tiles each have a small animated character: asleep at 0, awake above 0 (Running runs, Needs you bounces and waves, To do paces, Done cheers). Every state has several animations picked at random (never the same twice in a row, held 2.5 to 6 seconds), still under reduced motion, repeatable with a seed.
- When the plan is done, three characters dance above the progress bar until a new step opens.
- The goal card stays fixed at the top of the plan page while everything else scrolls.
- New sample plans `tools/sample/plan-quiet.json` and `plan-done.json`; `bun tools/pageshot.ts` also draws the asleep and done pictures, with a fixed seed.

## 0.26.66

- Cards are back to their full width (0.26.65 narrowed them). Approve is now a plain checkmark button beside copy and +/- on each Needs-you row.

## 0.26.65

- Needs-you rows get a copy button, a +/- button that shows the ask, and an Approve button that sends "push" to the captain when the ask is about a push, else "approve <ID>".

## 0.26.64

- README: removed the System card picture, which showed an old look.

## 0.26.63

- Section card counts sit 10 px further from the +/- and copy buttons at the right edge.

## 0.26.62

- Off plan opens like Needs you and Running now, with copyable IDs.
- The status row above the prompt reads Needs you, Off plan, Running, Done, To go. Owner chips are gone, the title has more room, and the progress bar is wider. The count text after the title and the 5H/WEEK line are removed (the meters stay in the bottom right).
- Steps not started yet are labelled TO GO, not TODO.
- A blocked step is labelled WAITING. A step waiting on you reads `waiting: you` and drops the redundant "You" chip. A step waiting on something else reads `waiting: <ID>` when the plan item sets `waitingOn`.

## 0.26.6

- Session start always asks for the pane to open, even when the pane list already names it (a new session saw the earlier session's pane as open and never opened its own).

## 0.26.5

- Writes `.cockpit/hook-trace.log` lines when a session starts, when the pane is opened and when the pane is asked to draw, to find why a new session's pane stays empty.

## 0.26.4

- The Cockpit pane now opens itself at the start of a new session and after /clear, /resume and /branch. A pane is drawn only after the mod opens it, so a new or cleared session showed "Nothing to show yet" (or the engine placeholder) until you ran /cockpit.

## 0.26.3

- A pane the app restores open in a new session no longer sits on "Nothing to show yet": the mod asks for its first draw when the session starts and when the pane opens.

## 0.26.2

- The panel in a new or cleared session now shows the plan tree on its first draw. It used to draw before the first poll had read plan.json and fall back to the old Main status card; it now reads the plan itself when it has none.

## 0.26.1

- The band no longer counts a step whose note starts "Parked" as needing you, so it matches the plan page.
- The plan page's System card shows memory the way Activity Monitor does (app + wired + compressed), not top's figure that counts cached files.

## 0.26.0

- Confetti falls over the band and pane when a plan finishes (only when it finishes while you watch, never on first sight of a done plan).
- `plan-set --new-plan "name"` archives the finished plan and starts a clean one; the rules block tells Claude to do it from plain conversation.
- Rules block is about 210 tokens. README shows the panel: a milestone and step opened, the to-do view, the System card.

## 0.25.3

- README cut to one screen: a picture of where the plan pane and the band sit in Claude Code (`tools/overviewshot.ts`, labels the line under the input too), then install. The plan page and full pane pictures moved to docs/FEATURES.md.
- Removed unused screenshots (`band-*`, `pane-dark`, `pane-light`).

## 0.25.2

- The side pane's Main status card and header now show steps to go (`3/6 · 3 to go`), matching the band.
- Plan page: the milestone count is right-aligned on the counts line.

## 0.25.1: steps to go
- The band count reads `130/165 · 35 to go` and the plan page reads `130 of 165 steps done · 35 to go`. A finished plan shows no tail, and a narrow band drops the tail rather than squeeze the title.

## 0.25.0: the band is the official design; docs, rules and pictures rewritten
- **The band above the prompt** (0.24.2 to 0.24.11, now final). Row 1: a short drawn progress bar, the plan title, the count and a stale dot on the left; status icons, the AWAY or ACTIVE pill (styled like the pane's), the switch and the pane button on the right. Row 2: colored count pills (Running, Needs you, To do, Done, and Off plan only when something is off plan) and the plan limits, right-aligned, with the percentage left or used matching the pane. The pills degrade to fit a narrow row.
- **The line under the input** now says what the band does not: running count, the last landed item and its age, and the session count.
- **No startup flash.** The band waits for the first plan read before it draws.
- **Config paths are absolute.** A relative `planFile` no longer breaks when the host runs from another folder.
- **Plan page** (`tools/plan-page-build`): ask a question or tell the session, Copy ID, expand milestones and steps, dismiss system issues.
- **New [docs/RULES-FOR-CLAUDE.md](RULES-FOR-CLAUDE.md):** the CLAUDE.md block (about 210 tokens) and a measured account of what costs tokens.
- **Pictures** are regenerated by script: `tools/bandshot.ts`, `tools/shot.ts` and the new `tools/gifshot.ts` (the animated plan gif, dark and light). The old agents gif is gone.

## 0.24.1: a tall pane could not be scrolled, so open steps and the System card were out of reach
Found from the real host's own log (crew-pane.log) and saved file (crew-ui.json), not the fake kit: with the milestone open the plugin drew a 6853 px column (156 blocks) and the host's `ui.scroll` reported `contentRows=60` for it (about 1200 px, the closed pane's height). The plugin only took over scrolling when the host's count fit its window (`contentRows <= bodyRows`; 60 > 53), so it stayed in host mode, the host clipped the column to that height, and nothing below the first screen (the open steps, the System card at the bottom) could be reached or pressed. The saved file shows no step or System flag ever written after the milestone opened, so those presses never ran. The buttons themselves are fine: keys are unique, each runs the same `flip` as the working ones.
- **Who scrolls is decided on every scroll event** (`scrollOwner` in hooks/ui.ts): when the host counts clearly fewer rows than the plugin drew (under 87% of the drawn height), the plugin windows the column itself and moves it by wheel and keys; when the column fits, or the host's count matches, the host scrolls. It is no longer latched for the session by the first wheel tick.
- **Tests** (tests/cockpit47.test.ts) go through the registered `ui.render` and `ui.scroll` hooks the way the host does: draw with the host's `bodyRows`, find a Button by key in that draw, run its `onPress`, draw again (milestone, step and System card), plus unique keys and the 60-rows-for-6853-px case.

## 0.24.0: the 0.21.0 pane, cleaned up (no rebuild)
Jesse's direction after 0.23.x: keep the old pane's look, clean it up. Changes against the 0.21.0 look, nothing else redesigned.
- **Colour.** Running is blue (also when the owner is not seen alive, which no longer turns it amber or says "gone"). Amber is waiting on you, green is done, red is errors only.
- **Closed by default.** Every section (WAITING ON YOU, MILESTONES, RUNNING, BLOCKED, TODO, DONE, OFF PLAN, SYSTEM) starts closed. Plan > milestones > steps: the MILESTONES header holds each milestone, each milestone holds its steps.
- **Every card opens.** Each row (running, blocked, todo, done, off plan) and each step is one short line (title cut to fit); its own "+" shows the full title, id, owner and note. The toggles are plain buttons, not bordered boxes.
- **Nothing shown unless opened.** No "latest:" line under DONE (the newest three rows show when DONE is opened), no history, no notes on a closed row. The red "waiting for the first poll" note, the Session line, the Local model line and the away log are gone from the pane.
- **Kept.** The tiny pixel-art workers and the animations on running rows; the full SYSTEM card (Resources with CPU, memory, disk and GPU, Services, Plan limits, Context, Sessions), closed until opened.
- **Pane button.** One plain glyph button; the "Show plan" label and its drawn icon are removed. The press opens the pane, and a second press closes it only when the pane is open and drawn: an open pane that waits undrawn (`isPlaced` false) is opened again by the press, which the host places because a press is an asked open.
- `tests/cockpit36.test.ts` presses the real toggle handlers, including a row's own button.

## 0.23.4: the old pane's look is back, headers open and close, a real pane button
Four things Jesse reported against 0.23.3, and the 0.21.0 look restored as the base.
- **Look.** The pane is the 0.21.0 pane again: a green "Nothing is waiting on you" banner, one goal card (`done/planned`, "+N off plan", bar, synced), then WAITING ON YOU, MILESTONES, RUNNING, BLOCKED, TODO, DONE, OFF PLAN and SYSTEM, each with the old rows, "+N more (open the card to see them)" and the DONE "latest:" line. Added on top, nothing redesigned: the milestone tree (collapsed) and a tiny pixel-art worker under each running row.
- **Headers open and close.** Every header has a drawn triangle and a bordered "+" or "-" button beside it (a plain triangle glyph button rendered as a dot, and an Svg cannot take a press). The click test `tests/cockpit36.test.ts` presses each button and checks the flag, the label and the rows.
- **System card** is the full detailed card again (Resources, Services, Plan limits, Context and startup cost, Sessions) under the SYSTEM header, closed by default.
- **Pane button.** A drawn icon (window with a side panel, strokes only, no font) beside a bordered "Show plan" or "Plan" button.
- **Old Agents/Session section removed** (robot icon, animations). Left: a "Session: active, N running" or idle line, the "Local model" line and the "While you were away" log.
- **Owner gone** now draws amber (red is for errors only).
- **Load errors.** The marketplace entry is a symlink to the repo, which the loader rejects ("Path escapes plugin directory"). `tools/sync-marketplace.sh` replaces it with a real copy.
- `bun tools/panepage.ts` writes full-pane shots from the real pane tree: `shots/pane-{closed,open,quiet}-{dark,light}.png`.

## 0.23.3: the card's first row no longer wraps, and a visible Show plan button
- **Row 1** holds the bar, the title and the count (91/119) at the left and the mode chip (AWAY) and a **Show plan** button at the right (**Plan** on a narrow card). The button opens and focuses the plan tree pane; pressing it again closes it. The old bare pane glyph is gone.
- **Row 2** now also holds "+6 off plan" (single line, never wrapped) and the four system icons at its right; on a narrow card the icons drop first, then the credit drawing shortens.
- `bun tools/bandshot.ts` writes `shots/band-{835,360}-{dark,light}.png`.

## 0.23.2: real pixel-art workers, one header, activity on collapsed cards, System card as in 0.22.0
- **Real characters.** The stick figures are gone. Each job kind is a person from Kenney's Tiny Dungeon pack (CC0, public domain; recorded in `NOTICE`, files in `assets/workers/`): research reads a book, docs types on a laptop with speech dots, code hammers at an anvil, test ticks a checklist, bench watches a stopwatch, review holds a magnifier, wait raises a hand (amber), other stands and breathes. Props are drawn in the same palette by `tools/buildsprites.ts`, which writes `hooks/workersprites.ts`. 2 to 4 frames per kind, stepped in CSS (`step-end`, no timers), drawn as crisp pixel rectangles with a soft state-colour backing so they read on light and dark. Reduced motion shows the still first frame.
- **One header.** The plan header (title, count, off plan, you count, synced) is a single card in the pane and in the preview; the extra mock top bar is gone.
- **Collapsed activity.** A collapsed milestone, Waiting on you or Off plan with something active inside shows one small worker at the right edge of its header: blue running, amber waiting, never red.
- **System card.** Back to exactly the 0.22.0 card (position second, layout, colours, the stale marker is red again). `tests/systemcard.test.ts` compares its drawings byte for byte with a 0.22.0 snapshot.

## 0.23.0: the plan as a tree, tiny workers, blue for running
- **Plan, milestones, steps.** `plan.json` is now `{plan, milestones:[{id, title, steps:[...]}], offPlan?}`. An old flat file (`items`) still reads: its items become one default milestone ("Steps") and `planned: false` items go to Off plan. Counts are always computed from the steps: the header reads "Plan 7/10", each milestone "5/5", "2/5" or "0/5", and the top bar and the line under the input show the same 7/10.
- **Collapsed by default.** Milestones, Waiting on you and Off plan are closed, each with its count in its title. A step shows its mark, a short title and its agents; opening it shows one detail line (at most 100 characters), and a longer note sits behind a second expand.
- **plan-set** gains `--milestone <id>`, `--add-milestone "title"`, `--plan "name"`, `--kind` and `--agents a,b`. It warns on stderr (exit 0, nothing refused) for names over 5 words or 40 characters, bare ids, file paths, and notes or say lines over 100 characters. The limits are in the cockpit-plan skill.
- **Tiny workers.** One line under a running step, one small animated worker per agent: research reads papers, docs types, code hammers, test ticks a checklist, bench watches a stopwatch, review holds a magnifying glass, wait raises a hand (amber), other is a neutral figure. The kind comes from `--kind`, else the title, else "other". Reduced motion shows a still frame; the animation is pure CSS with no timers.
- **Colours.** Running is blue everywhere (the plan card, agent cards, the activity pills, the status row), waiting on you is amber, blocked is orange only when stuck on a fault, done is green, and red is for failures only (the stale plan marker in the top bar is now amber). The colours are tokens in `hooks/tokens.ts` (plan) and `ACTIVE_BLUE` in `hooks/crew.ts` (agent rows).
- **Preview without a session.** `bun tools/plan-preview.ts [plan.json]` serves the real tree on 127.0.0.1 with clickable expand and collapse; `--stop` stops it. `bun tools/planshot.ts` writes the screenshots.

## 0.22.0: the plan area as a stack of cards, question and retry buttons, calmer colours
- **A stack of cards.** The plan area is now separate collapsible cards in a fixed order: Title (goal, count, progress bar; always open), System (closed), Needs me (open), Pending (open), Blocked (closed), Off plan (open), Done (closed). Each header shows its name and a count. Each open or closed state is saved on its own (`pc-system`, `pc-needs`, `pc-pending`, `pc-blocked`, `pc-off`, `pc-done` in the UI file) and one card never changes another. Titles wrap in full with the id small and grey beneath.
- **Two new buttons** in one aligned two-by-two column at the right of each row in Needs me, Blocked and Off plan: check (done), X (remove, undoable), question mark (sends the main session a line asking it to explain the item in plain words, or to ask you with AskUserQuestion when a decision is needed; same path as Add Bug and Add Idea) and retry (sets the item back to todo and sends a one-line request to dispatch it again).
- **Colours.** Red now means only failed or errored. A running item whose owner is gone is a quiet grey "no live owner". Blocked is static amber. Needs me is blue, distinct from Blocked.
- **Blink means "needs you now".** Only a Needs me row blinks. Blocked is static. Running work no longer blinks anywhere: the running plan dot is steady green (ripple and pulse removed), the working dot on agent rows is steady, the background twinkle is still, the progress bar edge no longer pulses, and the API character's antenna wags instead of blinking. Movement (stripes, shimmer, sweep, scan line) stays. `tests/plancards.test.ts` lists what animates.

## 0.21.0: waiting on me, plain titles, running work, commands that always register
- **Waiting on me** sits above everything in the plan area: each item that needs you with its exact ask in full words, a check button (marks it done) and an X (removes it; undo for 8 seconds, inline, no dialog). Both write the plan file atomically like `tools/plan-set` and change no other item. Empty state: "Nothing is waiting on you".
- **Events and System cards removed**, with their flight log, black box and system card drawing. The panel is Main status and Agents. Old saved flags for the removed sections are ignored. `hosts` and `services` in the config are deprecated (nothing draws them now); `hooks/flightsvg.ts` and the black box and flight log readers are deprecated and no longer used by the panel.
- **Plain titles.** The title first, the id small and secondary, no ellipsis anywhere: titles and notes wrap. Opening an item shows the full title, note, owner and state history. A title that only repeats the id shows the latest say or the note.
- **Running work.** Running plan items (owner, note) are listed in the Agents card, off-plan running items also appear under OFF PLAN while they run, and a "Local model" line shows whether port 54800 answers `/health` and the model alias it serves (background probe, never blocks drawing).
- **Commands.** `/cockpit`, `/cockpit-status`, `/agents`, `/lanes` (and `/crew`, `/handoff`) are now registered first in `session.start` and again from the first panel event, not at the end of start-up, so a slow or failing start-up step, or a plugin loaded after the session began, can no longer leave them out of the slash menu. A test covers it. Run `/reload-plugins --force` (or restart Claude Code) to load it.

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
