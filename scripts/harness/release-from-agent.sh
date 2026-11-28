#!/bin/sh
# Runs `pnpm release` from an agent shell, where there is no terminal: npm's
# 2FA web login fails with EOTP without a TTY, and gives up at once when
# stdin is closed. This runs the release under a pseudo-terminal with stdin
# held open, opens npm's authentication URL in the browser as soon as it is
# printed, and leaves the approval to Joel. npm waits about five minutes.
#
# Usage: scripts/harness/release-from-agent.sh [log file]
set -eu
cd "$(git rev-parse --show-toplevel)"
log="${1:-.tmp/release-from-agent.log}"
mkdir -p "$(dirname "$log")"
: >"$log"

(
  opened=""
  while :; do
    url=$(grep -aoE 'https://www\.npmjs\.com/auth/cli/[0-9a-f-]{36}' "$log" 2>/dev/null | tail -1 || true)
    if [ -n "$url" ] && [ "$url" != "$opened" ]; then
      open "$url"
      opened="$url"
      echo "release-from-agent: approve npm 2FA in the browser: $url"
    fi
    sleep 2
  done
) &
watcher=$!
fifo="$(mktemp -u "${TMPDIR:-/tmp}/maskera-release-stdin.XXXXXX")"
mkfifo "$fifo"
# Hold stdin open via a FIFO instead of a pipeline so `sleep 3600` does not
# keep the script alive for an hour after `pnpm release` exits.
sleep 3600 >"$fifo" &
keeper=$!
trap 'kill "$watcher" "$keeper" 2>/dev/null || true; rm -f "$fifo"' EXIT

status=0
script -q "$log" pnpm release <"$fifo" >/dev/null 2>&1 || status=$?
kill "$keeper" 2>/dev/null || true
tr -d '\r' <"$log" | grep -E 'release: done|release FAILED' | tail -1
exit "$status"
