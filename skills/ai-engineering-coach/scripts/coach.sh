#!/usr/bin/env bash
# Runs the AI Engineer Coach CLI from anywhere, building it first if needed.
# Arguments are passed straight through, e.g.:
#   coach.sh report --since 30d --harness Claude
#   coach.sh --no-open --port 7777
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
cli="$root/dist/cli.cjs"

if [[ ! -f "$cli" ]]; then
  echo "Building the coach CLI (first run only)…" >&2
  if [[ ! -d "$root/node_modules" ]]; then
    npm --prefix "$root" ci >&2
  fi
  npm --prefix "$root" run build >&2
fi

exec node "$cli" "$@"
