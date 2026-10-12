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
