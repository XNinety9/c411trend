#!/bin/bash
# Screenshots with fictitious data (account "seeder42", Firefox, docs/demo/fake-history.py).
#
#   docs/demo/photo-session.sh OUTPUT_DIR
#
# For the duration of the session it swaps in the fake history and a stub
# bin/c411trend-fetch (never contacts c411.org, never writes history), sets
# demo widget settings, and restarts the shell. On exit - success, error or
# Ctrl-C - the real history, fetch script and shell.json are put back
# byte for byte and the shell restarts again.
#
# Takes OUTPUT_DIR/en.png (English, "ratio 5"), fr.png (French, "20 To") and
# bar.png (bar only). Crop them to the panel's border afterwards.
set -u
OUT=$(realpath "${1:?output directory}"); mkdir -p "$OUT"
P=$(cd "$(dirname "$0")/../.." && pwd)
STATE=${XDG_STATE_HOME:-$HOME/.local/state}/c411trend
SHELL_JSON=$HOME/.config/omarchy/shell.json
B=$(mktemp -d); chmod 700 "$B"
# If this script is ever SIGKILLed, the stub stays in bin/: the originals are here.
echo "originals saved in $B (restored automatically on exit)"

cp -p "$STATE/history.jsonl" "$B/history.jsonl"
cp -p "$STATE/source" "$B/source" 2>/dev/null
cp -p "$SHELL_JSON" "$B/shell.json"
cp -p "$P/bin/c411trend-fetch" "$B/c411trend-fetch"
before=$(sha256sum "$STATE/history.jsonl" "$P/bin/c411trend-fetch" "$SHELL_JSON" | awk '{print $1}')

restore() {
  cp -p "$B/c411trend-fetch" "$P/bin/c411trend-fetch"
  cp -p "$B/history.jsonl" "$STATE/history.jsonl"
  [ -f "$B/source" ] && cp -p "$B/source" "$STATE/source"
  cp -p "$B/shell.json" "$SHELL_JSON"
  omarchy restart shell >/dev/null 2>&1
  after=$(sha256sum "$STATE/history.jsonl" "$P/bin/c411trend-fetch" "$SHELL_JSON" | awk '{print $1}')
  if [ "$before" = "$after" ]; then echo "restored: history, fetch script and shell.json identical to before"; rm -rf "$B"
  else echo "RESTORE MISMATCH: originals kept in $B" >&2; fi
}
trap restore EXIT

cat > "$P/bin/c411trend-fetch" <<'STUB'
#!/usr/bin/python3
import json, os
h = os.path.join(os.environ.get("XDG_STATE_HOME") or os.path.expanduser("~/.local/state"), "c411trend", "history.jsonl")
last = json.loads(open(h).read().strip().splitlines()[-1])
print(json.dumps({"ok": True, "sample": last, "user": {"username": "seeder42", "canDownload": True, "minRatioForDownload": None},
                  "source": {"browser": "firefox", "label": "Firefox", "profile": "Default"}}))
STUB
chmod +x "$P/bin/c411trend-fetch"
"$P/docs/demo/fake-history.py" "$STATE/history.jsonl"

set_() { omarchy bar set x99.c411trend "$1" "$2" >/dev/null 2>&1; }
shot() { omarchy-shell shell summon x99.c411trend >/dev/null 2>&1; sleep 2.5; grim "$1"; omarchy-shell x99.c411trend close; }

set_ barFormat '↑{up} · {ratio}'; set_ language English; set_ simQuery 'ratio 5'
omarchy restart shell >/dev/null 2>&1
for _ in $(seq 1 30); do omarchy-shell x99.c411trend version >/dev/null 2>&1 && break; sleep 1; done
sleep "${DELAY:-3}"
echo "demo data: $(omarchy-shell x99.c411trend status | head -1)"

shot "$OUT/en.png"
set_ language 'Français'; set_ simQuery '20 To'; sleep 2
shot "$OUT/fr.png"
set_ language English; sleep 2; grim "$OUT/bar.png"
echo "shots: $OUT/en.png $OUT/fr.png $OUT/bar.png"
