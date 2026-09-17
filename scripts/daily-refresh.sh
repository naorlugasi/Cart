#!/bin/bash
# Daily price refresh for סל חכם, run on Naor's Mac by launchd (ops/launchd/com.salhacham.prices.plist)
# or by hand:  scripts/daily-refresh.sh
#
#   caffeinate -i (whole run) → git pull → prices:fetch (retrying failed chains) → prices:online →
#   products:build → npm test → commit + push data/products.json + data/catalogs if they changed →
#   ping healthchecks.io (HEALTHCHECK_URL in ~/.config/salhacham/pipeline.env).
#
# Any failed step: no commit, the error goes to the log, exit code != 0 (and a /fail ping).
# Log: ~/Library/Logs/salhacham/<YYYY-MM-DD>.log (both daily runs append to the same file).
# See docs/RUNNER-MAC.md.
set -uo pipefail

# --- re-exec under caffeinate so the Mac does not idle-sleep while we run ---------------------------
if [ -z "${SALHACHAM_CAFFEINATED:-}" ] && command -v caffeinate >/dev/null 2>&1; then
  SALHACHAM_CAFFEINATED=1 exec caffeinate -i "$0" "$@"
fi

# --- environment (launchd starts us with a nearly empty PATH) ------------------------------------
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export LANG="${LANG:-en_US.UTF-8}"
export HOME="${HOME:-/Users/$(id -un)}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${SALHACHAM_BRANCH:-claude/cart-transfer-redirect-mvp-wyxm2l}"
LOG_DIR="$HOME/Library/Logs/salhacham"
ENV_FILE="$HOME/.config/salhacham/pipeline.env"
LOCK_DIR="$LOG_DIR/.run.lock"
DATA_PATHS=(data/products.json data/catalogs)
FETCH_RETRIES="${FETCH_RETRIES:-3}"
FETCH_RETRY_WAIT="${FETCH_RETRY_WAIT:-60}"
mkdir -p "$LOG_DIR"
DATE="$(date +%Y-%m-%d)"
LOG="$LOG_DIR/$DATE.log"
# shellcheck disable=SC1090
[ -r "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a

# --- logging / healthcheck helpers ---------------------------------------------------------------
ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '%s %s\n' "$(ts)" "$*" | tee -a "$LOG"; }
ping_hc() { # $1 = "" | start | fail
  [ -n "${HEALTHCHECK_URL:-}" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "${HEALTHCHECK_URL}${1:+/$1}" || log "warn: healthcheck ping '$1' failed"
}
START_TS=$(date +%s)
STATUS=1
finish() {
  local rc=$? ; [ "$STATUS" = 0 ] && rc=0
  rmdir "$LOCK_DIR" 2>/dev/null
  if [ "$rc" = 0 ]; then log "=== done OK in $(( $(date +%s) - START_TS ))s ==="; ping_hc
  else log "=== FAILED (exit $rc) after $(( $(date +%s) - START_TS ))s - nothing published ==="; ping_hc fail; fi
  exit "$rc"
}
fail() { log "ERROR: $*"; STATUS=1; exit 1; }
# run <name> <cmd...>: run a step, tee its output to the log, fail the run if it exits != 0
run() {
  local name="$1"; shift
  log "--- $name: $*"
  local t0=$(date +%s)
  "$@" 2>&1 | tee -a "$LOG"
  local rc=${PIPESTATUS[0]}
  log "--- $name finished in $(( $(date +%s) - t0 ))s (exit $rc)"
  [ "$rc" = 0 ] || fail "$name failed with exit $rc"
}

# --- start ---------------------------------------------------------------------------------------
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "another run holds $LOCK_DIR (started $(stat -f %Sm "$LOCK_DIR" 2>/dev/null)) - exiting"; exit 75
fi
trap finish EXIT
log "=== daily price refresh $DATE starting (pid $$, repo $REPO, node $(node --version 2>/dev/null || echo missing)) ==="
ping_hc start
cd "$REPO" || fail "cannot cd to $REPO"
command -v node >/dev/null || fail "node not found on PATH ($PATH)"
# playwright is deliberately not in package.json (Vercel would install it on every deploy): keep a
# local, unsaved copy and (re)install it when a manual `npm install` has pruned it.
if [ ! -d node_modules/playwright ]; then
  log "playwright missing from $REPO/node_modules - installing (not saved to package.json)"
  run "npm install playwright" npm install --no-save --no-package-lock --no-audit --no-fund playwright@1.59
  run "playwright install chromium" npx playwright install chromium
fi

# --- git: must be on the production branch with a clean tree; generated data may be left over -----
CUR="$(git rev-parse --abbrev-ref HEAD)"
[ "$CUR" = "$BRANCH" ] || fail "repo is on branch '$CUR', expected '$BRANCH' - refusing to run"
if [ -n "$(git status --porcelain -- "${DATA_PATHS[@]}")" ]; then
  log "discarding uncommitted generated data left over from a previous run"
  git checkout -- "${DATA_PATHS[@]}" 2>&1 | tee -a "$LOG"
  git clean -fdq -- "${DATA_PATHS[@]}" 2>&1 | tee -a "$LOG"
fi
DIRTY="$(git status --porcelain --untracked-files=no)"
[ -z "$DIRTY" ] && log "working tree clean" || log "warn: uncommitted changes outside the generated data (only the data paths get committed):"$'\n'"$DIRTY"
run "git pull" git pull --ff-only --quiet origin "$BRANCH"

# --- pipeline ------------------------------------------------------------------------------------
# prices:fetch prints "<chain> FAILED: ..." and exits 1 if any chain failed; portal hiccups are
# common, so retry only the failed chains before giving up.
FETCH_LOG="$(mktemp -t salhacham-fetch)"
log "--- prices:fetch"
t0=$(date +%s)
npm run --silent prices:fetch 2>&1 | tee -a "$LOG" "$FETCH_LOG"
attempt=0
while :; do
  FAILED="$(awk '/ FAILED: /{print $1}' "$FETCH_LOG" | tr '\n' ' ' | sed 's/ $//')"
  [ -n "$FAILED" ] || break
  attempt=$((attempt + 1))
  [ "$attempt" -le "$FETCH_RETRIES" ] || fail "prices:fetch: chains still failing after $FETCH_RETRIES retries: $FAILED"
  log "prices:fetch: retry $attempt/$FETCH_RETRIES for: $FAILED (in ${FETCH_RETRY_WAIT}s)"
  sleep "$FETCH_RETRY_WAIT"
  : > "$FETCH_LOG"
  # shellcheck disable=SC2086
  node scripts/fetch-prices.mjs $FAILED 2>&1 | tee -a "$LOG" "$FETCH_LOG"
done
rm -f "$FETCH_LOG"
log "--- prices:fetch finished in $(( $(date +%s) - t0 ))s (all chains OK)"

run "prices:online" npm run --silent prices:online
run "products:build" npm run --silent products:build
run "npm test" npm test --silent

# --- publish -------------------------------------------------------------------------------------
if [ -z "$(git status --porcelain -- "${DATA_PATHS[@]}")" ]; then
  log "no change in ${DATA_PATHS[*]} - nothing to commit"
else
  git add -A -- "${DATA_PATHS[@]}"
  log "changed files:"; git diff --cached --stat | tail -20 | tee -a "$LOG"
  run "git commit" git -c user.name="${GIT_AUTHOR_NAME:-$(git config user.name)}" -c user.email="${GIT_AUTHOR_EMAIL:-$(git config user.email)}" \
      commit --quiet -m "data: daily price refresh $DATE"
fi
# Push whatever is ahead of origin - today's commit, or one a previous run committed but could not push
# (network hiccup). A short retry covers DNS/Wi-Fi blips.
AHEAD="$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 0)"
if [ "$AHEAD" = 0 ]; then
  log "nothing to push"
else
  log "pushing $AHEAD commit(s) to origin/$BRANCH"
  pushed=0
  for i in 1 2 3; do
    if git push --quiet origin "HEAD:$BRANCH" 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" = 0 ]; then pushed=1; break; fi
    log "git push attempt $i/3 failed"; [ "$i" = 3 ] || sleep 30
  done
  [ "$pushed" = 1 ] || fail "git push failed 3 times - the commit stays local and the next run will push it"
  log "pushed $(git rev-parse --short HEAD) to origin/$BRANCH"
fi
STATUS=0
