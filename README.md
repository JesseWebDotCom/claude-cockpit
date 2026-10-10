# Claude Cockpit

A live status row, side pane and agent view for Claude Code. It shows what your sessions and agents are doing, and how much plan and credit you have left.

<p align="center"><b>The status row: progress, credits and the input box</b></p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/img/status-row-light.png">
    <img src="docs/img/status-row-dark.png" alt="The bottom of the screen: the Cockpit status row (progress bar, 3 of 6 done, credit meters, AWAY), the Claude Code input box and the line under it" width="840">
  </picture>
</p>

<p align="center"><b>The Agents section, live</b></p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/img/agents-running-light.gif">
    <img src="docs/img/agents-running-dark.gif" alt="The Agents section in motion: small animated characters for an agent that is editing, one waiting for you, one done and one blocked" width="420">
  </picture>
</p>

<p align="center"><b>The full side pane: every section open</b></p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/img/pane-all-light.png">
    <img src="docs/img/pane-all-dark.png" alt="The whole side pane with every section open: Main status, Agents, System, Events and System log" width="420">
  </picture>
</p>

## Why you want it

- **See every agent at a glance.** One pane shows who is editing, who is running tests, who is blocked and who is waiting on you. No more hopping between terminals.
- **Know how far along you are.** A progress bar and a done count (like 9/10) sit right above your input box.
- **Never get surprised by your limits.** Meters show what is left on your Claude plan, Claude cloud, API spend and Codex.
- **Leave it running.** Flip AWAY before you go. Your main session keeps working without stopping to ask, and writes down its choices for you to read when you are back.
- **Keep it private.** Nothing leaves your machine. Cockpit reads local session files and runs local commands, and that is all.

## Install

You need Claude Code. Add tmux if you want to watch Codex or local-model sessions too.

1. Add the marketplace:

   ```
   claude plugin marketplace add JesseWebDotCom/claude-cockpit
   ```

2. Install the plugin:

   ```
   claude plugin install cockpit@claude-cockpit
   ```

   It may print "7 userConfig options not yet set". That is fine: every option is optional and has a default, so you can ignore it.

3. Restart Claude Code and type `/cockpit`. The pane opens. Type it again to close it.

Want to try it first? Clone the repo and run `claude --plugin-dir ./claude-cockpit`. Nothing gets installed.

On a fresh project the pane is mostly empty. It tells you which small files to create. To see a full pane right away, look at `examples/project`.

## Make it yours

Cockpit works with no setup. When you want to change something, add `.cockpit/config.json` to your project. Every key is optional.

```json
{
  "owner": "alex",
  "lanes": [{ "name": "claude-docs", "kind": "tmux" }],
  "services": [{ "name": "Web app", "kind": "http", "target": "http://localhost:3000/health" }]
}
```

Run `/cockpit-status` to see which config files were read and if anything is wrong. Every setting is in [docs/CONFIG.md](docs/CONFIG.md).

## Learn more

- [Every feature and every part of the pane](docs/FEATURES.md)
- [The plain files your agents write](docs/PROTOCOL.md)
- [Changelog](docs/CHANGELOG.md)

## Credits and license

Cockpit is MIT licensed, see [LICENSE](LICENSE). It builds on two MIT projects, [claude-flightdeck](https://github.com/scasella/claude-flightdeck) and [savvy-progress](https://github.com/JohnnyVizz/claude-kit/tree/main/plugins/savvy-progress). Their notices are in [NOTICE](NOTICE).
