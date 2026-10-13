#!/bin/sh
# 0.23.4: the local marketplace entry for cockpit is a symlink to this repo, and the loader reports it as
# "Path escapes plugin directory" (skills and hooks), which is the "2 errors during load". This replaces the symlink
# with a real copy of the repo (no .git, no shots, no node_modules). Run it again after each release.
# Usage: sh /Users/jessetorres/Developer/github.com/JesseWebDotCom/claude-cockpit/tools/sync-marketplace.sh
set -e
SRC=/Users/jessetorres/Developer/github.com/JesseWebDotCom/claude-cockpit
DST=/Users/jessetorres/Developer/github.com/getmaipai/home/data-scratch/mods/maipai-local-marketplace/plugins/cockpit
if [ -L "$DST" ]; then rm "$DST"; fi
mkdir -p "$DST"
rsync -a --delete --exclude .git --exclude shots --exclude node_modules --exclude demo-out "$SRC"/ "$DST"/
echo "synced $DST"
# 0.26.78: syncing the copy is not installing it. Without this the running Claude keeps the old cached version
# (0.26.76 and 0.26.77 sat unused until this step was added). Restart Claude afterwards to load it.
CL="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
V=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['version'])" "$DST/.claude-plugin/plugin.json")
"$CL" plugin marketplace update maipai-local
"$CL" plugin update cockpit@maipai-local
mkdir -p "$HOME/.claude/plugins/cache/maipai-local/cockpit/$V"
rsync -a --exclude tests --exclude node_modules --exclude shots --exclude docs --exclude .git "$DST"/ "$HOME/.claude/plugins/cache/maipai-local/cockpit/$V"/
echo "installed cockpit $V: restart Claude to load it"
