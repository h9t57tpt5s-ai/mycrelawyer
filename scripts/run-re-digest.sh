#!/bin/bash
# Runs the re-legal-news-digest task via Claude Code, headless.
# Intended to be triggered by launchd (see com.jeffnovel.re-legal-digest.plist)
# at 10:00 and 16:00 local time, but safe to run by hand at any time.

set -euo pipefail

# launchd runs jobs with a minimal PATH — make sure `claude` and `git` resolve.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

REPO_DIR="/Users/jeffnovel/RELAW"
PROMPT_FILE="$REPO_DIR/scripts/re-legal-news-digest-prompt.md"
LOG_DIR="$REPO_DIR/scripts/logs"
mkdir -p "$LOG_DIR"

cd "$REPO_DIR"

RUN_DATE="$(date +%Y-%m-%d)"
RUN_HOUR="$(date +%H)"
if [ "$RUN_HOUR" -lt 12 ]; then
  RUN_LABEL="AM"
else
  RUN_LABEL="PM"
fi

PROMPT="$(cat "$PROMPT_FILE")

---
Runtime info for this invocation: today's date is $RUN_DATE, local time is $(date +%H:%M).
This is the $RUN_LABEL run — use that suffix in the digest filename as instructed above."

LOG_FILE="$LOG_DIR/run-$RUN_DATE-$RUN_LABEL.json"

echo "[$(date)] Starting re-legal-news-digest ($RUN_LABEL run)" >> "$LOG_DIR/history.log"

if claude -p "$PROMPT" \
  --dangerously-skip-permissions \
  --output-format json \
  > "$LOG_FILE" 2>&1; then
  echo "[$(date)] Completed successfully — log: $LOG_FILE" >> "$LOG_DIR/history.log"
else
  echo "[$(date)] FAILED — see $LOG_FILE" >> "$LOG_DIR/history.log"
fi
