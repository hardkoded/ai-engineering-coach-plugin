#!/usr/bin/env bash
# Runs the AI Engineer Coach CLI from anywhere, building it first if needed.
# Arguments are passed straight through, e.g.:
#   coach.sh report --since 30d --harness Claude
#   coach.sh --no-open --port 7777
set -euo pipefail

# `pwd -P` is required, not cosmetic: this skill is normally installed by symlinking it into
# an agent's skills directory, and the logical path would resolve the plugin root to that
# directory instead of the checkout.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd "$here/../../.." && pwd -P)"
cli="$root/dist/cli.cjs"

if [[ ! -f "$root/plugin.json" || ! -f "$root/package.json" ]]; then
  echo "coach.sh: expected the plugin root at $root, but it has no plugin.json." >&2
  echo "Move the script back under <plugin>/skills/<name>/scripts/, or symlink the skill directory rather than copying this file." >&2
  exit 1
fi

if [[ ! -f "$cli" ]]; then
  echo "Building the coach CLI (first run only)…" >&2
  if [[ ! -d "$root/node_modules" ]]; then
    npm --prefix "$root" ci >&2
  fi
  npm --prefix "$root" run build >&2
fi

exec node "$cli" "$@"
