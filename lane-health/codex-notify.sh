#!/bin/sh
# Codex notify hook. Append only a bounded lane identity and outcome, never notification text.
set +e
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd)
data_dir=${LH_DATA_DIR:-$(dirname -- "$script_dir")}
payload=$(cat 2>/dev/null)
event=$(printf '%s' "$payload" | /usr/bin/python3 -c 'import json,sys; d=json.load(sys.stdin); print(str(d.get("event", "done")).lower())' 2>/dev/null)
case "$event" in
  blocked) state=blocked ;;
  idle) state=idle ;;
  *) state=done ;;
esac
item=${LH_ITEM:-${CODEX_ITEM:-}}
lane=${LH_LANE:-${CODEX_LANE:-}}
if [ -z "$item" ] || [ -z "$lane" ]; then
  exit 0
fi
case "$item:$lane" in *[!A-Za-z0-9_.:-]*) exit 0 ;; esac
mkdir -p "$data_dir/lane-health" 2>/dev/null
/usr/bin/python3 -c 'import datetime,json,sys; print(json.dumps({"item":sys.argv[1],"lane":sys.argv[2],"state":sys.argv[3],"time":datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")},separators=(",",":")))' "$item" "$lane" "$state" >> "$data_dir/lane-health/events.jsonl" 2>/dev/null
exit 0
