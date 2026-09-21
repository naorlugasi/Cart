#!/bin/bash
# Publish as soon as the portals have something new - for catching up after a missed or blocked run,
# without waiting for the next scheduled one.
#
#   ops/publish-when-ready.sh [chain ...]      # default: the portals that publish late
#
# It waits for "a price file newer than the one our catalog was built from" (ops/newer-than-ours.mjs),
# never for "a file stamped today": on a Shabbat or a holiday no chain publishes, the portals keep
# serving Friday's files, and a run that waits for today's file waits for something that never comes.
#
#   something newer, every chain lists files  -> run scripts/daily-refresh.sh
#   nothing newer anywhere                    -> no publication day, stop (nothing to publish)
#   newer, but a chain still lists nothing    -> keep waiting (a late portal)
#   MAX_WAIT_MIN reached                      -> stop; the scheduled 05:55 run covers the day
set -uo pipefail
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
CHAINS=("$@"); [ ${#CHAINS[@]} -gt 0 ] || CHAINS=(carrefour victory mck osherad)
POLL_MIN="${POLL_MIN:-5}"
MAX_WAIT_MIN="${MAX_WAIT_MIN:-240}"
say() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
cd "$REPO" || exit 1

while pgrep -f "daily-refresh.sh" >/dev/null; do sleep 30; done
say "waiting for a price file newer than ours (${CHAINS[*]}), polling every ${POLL_MIN}m, at most ${MAX_WAIT_MIN}m"

deadline=$(( $(date +%s) + MAX_WAIT_MIN * 60 ))
while :; do
  out="$(node ops/newer-than-ours.mjs "${CHAINS[@]}" 2>&1)"; rc=$?
  say "check: $(printf '%s' "$out" | tail -2 | tr '\n' ' | ')"
  case "$rc" in
    0)  say "something new and every portal is answering - running the refresh"
        ./scripts/daily-refresh.sh; say "refresh exit $?"; exit 0 ;;
    10) say "אין פרסום היום: no chain published anything newer than what we already have - stopping"; exit 0 ;;
  esac
  if [ "$(date +%s)" -ge "$deadline" ]; then
    say "gave up after ${MAX_WAIT_MIN}m - the scheduled run will pick this up"; exit 0
  fi
  sleep $(( POLL_MIN * 60 ))
done
