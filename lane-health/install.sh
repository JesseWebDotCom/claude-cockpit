#!/bin/sh
# Installs the lane-health launchd job. NOT run by the build agent; the coordinator runs it after review.
set -e
D=${LANE_HEALTH_DATA_DIR:-"$HOME/Developer/github.com/getmaipai/home/data-scratch/lane-health"}
DATA=$(dirname "$D")
P="$HOME/Library/LaunchAgents/com.maipai.lane-health.plist"
sed -e "s|@LANE_HEALTH_DIR@|$D|g" -e "s|@DATA_DIR@|$DATA|g" "$D/com.maipai.lane-health.plist" > "$P"
launchctl unload "$P" 2>/dev/null || true
launchctl load "$P"
echo "loaded $P (every 60 s). Stop with: launchctl unload $P"
