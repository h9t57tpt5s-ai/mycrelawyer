#!/bin/bash
# Run the Case Value Calculator's Edge Function on this Mac for testing
# (2026-10-17). No Supabase: citations come from the git-ignored local file
# and contributed settlements are skipped. Each analysis still calls the
# Anthropic API with YOUR key (about $0.21 per case), so ANTHROPIC_API_KEY
# must be set in ~/.zshrc. Listens on http://localhost:8000.
#
#   scripts/run_local_calculator.sh            # in one terminal
#   python3 scripts/backtest_case_valuation.py case_valuation_project/backtest/cases.json \
#     --local --confirm --limit 3 --version v4.5-local --variant v4.5   # in another
set -euo pipefail
cd "$(dirname "$0")/.."
source ~/.zshrc >/dev/null 2>&1 || true
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "ANTHROPIC_API_KEY is not set. Add 'export ANTHROPIC_API_KEY=...' to ~/.zshrc first." >&2
  exit 1
fi
export LOCAL_CITATIONS_FILE="$PWD/case_valuation_project/data/claim_citations_v2.json"
export LOCAL_CASE_DATA_FILE="$PWD/js/case-valuation-data.js"
export AUTOMATION_SECRET="local-test"
export SUPABASE_URL="http://127.0.0.1:9"        # never contacted in local mode
export SUPABASE_SERVICE_ROLE_KEY="local-unused"
exec deno run --allow-net --allow-env --allow-read supabase/functions/case-valuation-analyze/index.ts
