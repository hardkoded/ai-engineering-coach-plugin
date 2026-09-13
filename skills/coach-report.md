---
name: coach-report
description: Run the AI Engineer Coach CLI to get a summary of the user's own AI coding sessions.
when_to_use: User asks "how am I using AI", "review my coding sessions", "what are my
  anti-patterns", "am I using Claude Code well", or wants their practice scores, code output,
  or session activity without opening VS Code.
---

# Coach Report

Prints a summary of the user's local AI coding sessions to stdout. Everything is read from
disk on their machine; nothing is sent anywhere.

## Prerequisites

The CLI ships with this repo and has to be built once:

```bash
npm ci && npm run build
```

## Steps

Markdown, for reading:

```bash
node dist/cli.cjs report
```

JSON, for further processing:

```bash
node dist/cli.cjs report --json
```

Narrow the data with any combination of:

| Flag | Effect |
|---|---|
| `--since <n>d` | Only the last `n` days, e.g. `--since 30d` |
| `--harness <name>` | One harness only: `Claude`, `Codex`, `Local Agent`, `OpenCode`, `Xcode` |
| `--workspace <id>` | One workspace id |
| `--logs-dir <path>` | Scan an extra VS Code or Xcode log directory (repeatable). Claude, Codex and OpenCode logs are always found automatically. |

A Claude Code user's own last month:

```bash
node dist/cli.cjs report --since 30d --harness Claude
```

To browse the same data interactively instead, run `node dist/cli.cjs` and open the printed
URL.

## Output

stdout is the document and nothing else — parse diagnostics and progress go to stderr, so
`node dist/cli.cjs report --json | jq .` works. The report covers totals, activity and
streaks, flow scores, top languages by AI-generated lines, and the top anti-patterns.

## Troubleshooting

- **`Cannot find module .../parse-worker.js`** — the bundle is missing or stale. Run
  `npm run build`.
- **First run is slow** — external harnesses are re-parsed every run rather than cached. A
  multi-GB `~/.claude/projects` takes a couple of minutes.
- **A harness is missing from the output** — that harness wrote no logs the filter matched.
  Drop `--since` and `--harness` to see everything.

## Anti-patterns

- Don't parse `~/.claude/projects/*.jsonl` by hand to answer these questions. The CLI already
  normalizes every harness into one model, and hand-rolled counts will disagree with the
  dashboard.
- Don't pass `--harness "Claude Code"`. The harness value is `Claude`; display names are not
  accepted and match nothing.
- Don't redirect stderr into the report file — it is diagnostics, not content.
