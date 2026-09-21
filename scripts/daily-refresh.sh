#!/bin/bash
# Daily price refresh for סל חכם, run on Naor's Mac by launchd (ops/launchd/com.salhacham.prices.plist)
# or by hand:  scripts/daily-refresh.sh
#
#   caffeinate -i (whole run) → git pull → prices:fetch (retrying failed chains) → products:build →
#   npm test → commit + push data/products.json + data/catalogs if they changed →
#   then, after the publish and without affecting it: pipeline/run.mjs (every store of every chain -> DuckDB)
#   (no request ever goes to a chain's website: the catalog is built only from the published price files)
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
ping_hc() { # $1 = "" (success) | start | fail
  local kind="${1:-}"
  [ -n "${HEALTHCHECK_URL:-}" ] || return 0
  # DNS on this Mac occasionally stalls for tens of seconds, so allow generous retries.
  curl -fsS -m 20 --retry 5 --retry-delay 5 --retry-all-errors -o /dev/null "${HEALTHCHECK_URL}${kind:+/$kind}" 2>&1 | tee -a "$LOG" >/dev/null
  [ "${PIPESTATUS[0]}" = 0 ] || log "warn: healthcheck ping '${kind:-success}' failed"
}
START_TS=$(date +%s)
STATUS=1
finish() {
  local rc=$?
  if [ "$STATUS" = 0 ]; then rc=0; elif [ "$rc" = 0 ]; then rc=1; fi
  rmdir "$LOCK_DIR" 2>/dev/null
  if [ "$rc" = 0 ]; then log "=== done OK in $(( $(date +%s) - START_TS ))s ==="; ping_hc
  else log "=== FAILED (exit $rc) after $(( $(date +%s) - START_TS ))s - nothing published ==="; ping_hc fail; fi
  exit "$rc"
}
SOFT=0   # while 1, a failed step returns instead of ending the run (the publish stage)
fail() { log "ERROR: $*"; STATUS=1; [ "$SOFT" = 1 ] && return 1; exit 1; }
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

# --- publish the catalog -------------------------------------------------------------------------
# Everything here is soft: a portal that never answered, a data-quality test that went red or a push
# that failed stops the publish, but the every-store pipeline below still runs - its files rotate
# daily on the portals, so a blocked publish must not cost a day of store prices as well.
publish_catalog() {
  local attempt t0 FETCH_LOG FAILED AHEAD pushed i
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
    if [ "$attempt" -gt "$FETCH_RETRIES" ]; then
      rm -f "$FETCH_LOG"
      log "ERROR: prices:fetch: chains still failing after $FETCH_RETRIES retries: $FAILED"
      return 1
    fi
    log "prices:fetch: retry $attempt/$FETCH_RETRIES for: $FAILED (in ${FETCH_RETRY_WAIT}s)"
    sleep "$FETCH_RETRY_WAIT"
    : > "$FETCH_LOG"
    # shellcheck disable=SC2086
    node scripts/fetch-prices.mjs $FAILED 2>&1 | tee -a "$LOG" "$FETCH_LOG"
  done
  rm -f "$FETCH_LOG"
  log "--- prices:fetch finished in $(( $(date +%s) - t0 ))s (all chains OK)"

  run "products:build" npm run --silent products:build || return 1
  run "npm test" npm test --silent || return 1

  if [ -z "$(git status --porcelain -- "${DATA_PATHS[@]}")" ]; then
    log "no change in ${DATA_PATHS[*]} - nothing to commit"
  else
    git add -A -- "${DATA_PATHS[@]}"
    log "changed files:"; git diff --cached --stat | tail -20 | tee -a "$LOG"
    run "git commit" git -c user.name="${GIT_AUTHOR_NAME:-$(git config user.name)}" -c user.email="${GIT_AUTHOR_EMAIL:-$(git config user.email)}" \
        commit --quiet -m "data: daily price refresh $DATE" || return 1
  fi
  # Push whatever is ahead of origin - today's commit, or one a previous run committed but could not
  # push (network hiccup). A short retry covers DNS/Wi-Fi blips.
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
    if [ "$pushed" != 1 ]; then
      log "ERROR: git push failed 3 times - the commit stays local and the next run will push it"
      return 1
    fi
    log "pushed $(git rev-parse --short HEAD) to origin/$BRANCH"
  fi
  return 0
}

SOFT=1
if publish_catalog; then PUBLISH_OK=1; else PUBLISH_OK=0; log "warn: the catalog was not published - running the store pipeline anyway"; fi
SOFT=0

# --- every-store pipeline (DuckDB): informational, runs after the catalog is published ------------
# The result is verified against DuckDB instead of trusted: a chain with no rows for today (portal
# timeout, or the stage being killed half way) is retried, so a partial load never silently stays
# partial. pipeline/run.mjs is idempotent per (chain, date) - files already downloaded are skipped.
if command -v duckdb >/dev/null 2>&1; then
  PIPELINE_RETRIES="${PIPELINE_RETRIES:-2}"
  PIPELINE_RETRY_WAIT="${PIPELINE_RETRY_WAIT:-60}"
  DB="data/pipeline/prices.duckdb"
  TODAY="$(date +%Y-%m-%d)"
  all_chains() { node -e "import('./pipeline/retailers.mjs').then((m) => console.log(Object.keys(m.RETAILERS).join(' ')))" 2>/dev/null; }
  loaded_chains() { [ -f "$DB" ] || return 0; duckdb "$DB" -noheader -list -c "select distinct chain_id from prices_current where run_date = date '$TODAY'" 2>/dev/null; }
  # A chain counts as incomplete when it has no rows for today, or when today's load covers less
  # than 90% of the stores that chain is known to have (a portal that dropped half its files).
  incomplete_chains() { [ -f "$DB" ] || return 0; duckdb "$DB" -noheader -list -c "select chain_id from prices_current group by 1 having count(distinct store_id) filter (where run_date = date '$TODAY') < 0.9 * count(distinct store_id)" 2>/dev/null; }
  missing_chains() {
    local loaded chain out=""
    loaded=" $(loaded_chains | tr '\n' ' ') "
    for chain in $(all_chains); do case "$loaded" in *" $chain "*) ;; *) out="$out $chain" ;; esac; done
    for chain in $(incomplete_chains); do case " $out " in *" $chain "*) ;; *) out="$out $chain" ;; esac; done
    echo "${out# }"
  }
  coverage() { [ -f "$DB" ] || return 0; duckdb "$DB" -noheader -list -c "select chain_id || ' ' || count(distinct store_id) filter (where run_date = date '$TODAY') || '/' || count(distinct store_id) from prices_current group by chain_id order by chain_id" 2>/dev/null | tr '\n' ' '; }
  # A portal that stops answering (Shufersal did on 20.9) would otherwise keep the pipeline waiting
  # for hours: every invocation is bounded, and whatever did not load is picked up by the loop below.
  PIPELINE_TIMEOUT="${PIPELINE_TIMEOUT:-3600}"
  watchdog() { # $1 = pidfile of the node process, killed after PIPELINE_TIMEOUT
    ( sleep "$PIPELINE_TIMEOUT"
      local pid; pid="$(cat "$1" 2>/dev/null)"
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        log "pipeline: still running after ${PIPELINE_TIMEOUT}s - stopping it (a portal is not answering)"
        kill -TERM "$pid" 2>/dev/null
      fi ) &
  }
  bounded_pipeline() { # run pipeline/run.mjs with a time limit, logging as it goes
    local pidfile rc
    pidfile="$(mktemp -t salhacham-pipe)"
    { node pipeline/run.mjs "$@" & echo $! > "$pidfile"; wait $!; } 2>&1 | tee -a "$LOG" &
    local job=$!
    watchdog "$pidfile"
    local watcher=$!
    wait "$job"; rc=$?
    kill "$watcher" 2>/dev/null
    rm -f "$pidfile"
    return "$rc"
  }
  log "--- pipeline: node pipeline/run.mjs (all stores -> $DB, limit ${PIPELINE_TIMEOUT}s)"
  bounded_pipeline
  attempt=0
  CHAIN_COUNT="$(all_chains | wc -w | tr -d ' ')"
  while :; do
    MISSING="$(missing_chains | sed 's/ *$//')"
    [ -n "$MISSING" ] || { log "--- pipeline finished. stores loaded today/known: $(coverage)"; break; }
    # On a Shabbat or a holiday the chains publish nothing: the portals still serve Friday's files,
    # the pipeline skips them as already downloaded, and every chain looks "missing". That is one
    # fact about the day, not eleven broken chains - no retry rounds, no per-chain warning.
    if [ "$(echo "$MISSING" | wc -w | tr -d ' ')" -ge "$CHAIN_COUNT" ]; then
      log "--- אין פרסום היום: no chain published a new price file (Shabbat or holiday) - the catalogs keep their last source date"
      break
    fi
    attempt=$((attempt + 1))
    if [ "$attempt" -gt "$PIPELINE_RETRIES" ]; then
      log "warn: pipeline incomplete for $TODAY after $PIPELINE_RETRIES retries - $MISSING (catalog publish unaffected). stores loaded today/known: $(coverage)"
      break
    fi
    log "pipeline: retry $attempt/$PIPELINE_RETRIES for chains with no rows for $TODAY: $MISSING (in ${PIPELINE_RETRY_WAIT}s)"
    sleep "$PIPELINE_RETRY_WAIT"
    # shellcheck disable=SC2086
    bounded_pipeline --chains "$(echo $MISSING | tr ' ' ',')"
  done
else
  log "pipeline skipped: duckdb CLI not installed (brew install duckdb)"
fi

[ "${PUBLISH_OK:-0}" = 1 ] && STATUS=0 || STATUS=1
