---
name: cockpit-plan
description: Use whenever you coordinate work that Jesse watches on the Cockpit Status card. Keeps data-scratch/plan.json (the itemised checklist of the goal) in sync with what is dispatched, running, blocked and landed, so Jesse and the card always agree.
---

# Cockpit plan: keep the checklist true

The Cockpit's plan card, top bar and the line under the input box all show the plan file (`plan.json`; by default in the Cockpit data folder, or wherever `planFile` in `.cockpit/config.json` points, e.g. `data-scratch/plan.json`): the goal, every item to finish it, each item's state and who has it.
If this file is wrong, Jesse is working from a wrong picture. It is the coordinator's job to keep it right.

## File shape

`{milestone, updated, queue?, items:[{id, title, state, owner?, note?, planned?}], history?}`; state is `todo`, `running`, `blocked` or `done`.
`owner` is the lane or agent name (`reika-9b`, a Sonnet agent, `jesse`). Done and total are counted from the items, never typed.

## When to update (every time, before the reply)

1. A goal is set or changes: write the milestone and every item as `todo`. Items get real ids (backlog ids), one line titles.
2. You dispatch an item: `running` with its owner.
3. An agent or lane reports: verify it, then `done`, or `blocked` with the reason in the note.
4. Something lands on main: `done` (the card also flips an item whose landed commit subject starts with its id).
5. New work appears: add it, never leave it only in prose.
6. Something is waiting on Jesse: `blocked`, owner `jesse`, note says the exact ask.

## Say it in plain words

Every state change carries one sentence a non-engineer follows (`--say "..."`): the outcome, naming the item by its title, no ids alone,
no file paths, no log fragments. "Fixed the dark-mode picture so it matches the reference", not "COCKPIT-64: Dark picture vs reference".

## How

`plan-set [--file path] <id> <todo|running|blocked|done> [owner] [--note "..."] [--say "..."] [--add "title"] [--off-plan]`

- The file is `--file`, else `$COCKPIT_PLAN_FILE`, else `./.cockpit/plan.json`. Point it at the same file the Cockpit reads.
- An id not on the plan is refused (exit 1) until you pass `--add "title"`. A bad state or a missing value exits 2.
- It stamps `updated`, `startedAt` and `doneAt`, appends your `--say` sentence to the history (the card shows the latest), and writes atomically.
- A corrupt file is left untouched and reported (exit 1). A missing file is created.
- The card also derives state from evidence (a landed commit, a live claim, an awake lane, a BLOCKED report) and the file only wins when it is newer, so still keep it true.

Example: `plan-set COCKPIT-66 running codex-1 --say "Started drawing the plan card"`.

## Before ending a turn

Check plan.json against reality: every running item has a live owner, nothing landed is still `todo`, the newest landing is
older than `updated`. If a number in your reply disagrees with the card, fix the file, not the reply.
Never report a count you did not read from the file.
