#!/bin/sh
# Copy the tracked checker source into the Home scratch runtime folder. State is never synced.
set -eu
SRC=$(CDPATH= cd -- "$(dirname -- "$0")/../lane-health" && pwd)
DST=${LANE_HEALTH_DATA_DIR:-"$HOME/Developer/github.com/getmaipai/home/data-scratch/lane-health"}
mkdir -p "$DST"
rsync -a --delete \
  --exclude state.json --exclude '*.jsonl' --exclude '*.json' \
  --exclude cleared --exclude logs --exclude '*.log' \
  --exclude __pycache__ "$SRC"/ "$DST"/
echo "synced lane-health source to $DST (runtime state excluded)"
