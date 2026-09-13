---
name: ai-engineering-coach
description: The agent-plugin edition of Microsoft's AI-Engineering-Coach. Analyze the user's own local AI coding sessions and report how they work with AI agents - practice scores, anti-patterns, generated code volume, context health, and activity. Reads logs that Claude Code, Codex, OpenCode, GitHub Copilot, and Copilot CLI already write on this machine. Use when the user asks how they are using AI, to review their coding sessions, what their anti-patterns are, whether they use Claude Code well, or wants their AI usage stats, practice scores, or a coaching report.
license: MIT
compatibility: Requires Node.js 20+. Reads local session logs only; makes no network requests.
metadata:
  homepage: https://github.com/hardkoded/ai-engineering-coach-plugin
---

# AI Engineering Coach

The agent-plugin edition of [Microsoft's AI-Engineering-Coach](https://github.com/microsoft/AI-Engineering-Coach).
Reports on how the user actually works with AI coding agents, from the session logs already
on their machine. Nothing is uploaded; every number is computed locally.

## Run it

`scripts/coach.sh` builds the CLI on first use, then passes arguments through.

A report the user can read:

```bash
scripts/coach.sh report
```

Structured output, when you need to compute on the numbers rather than quote them:

```bash
scripts/coach.sh report --json
```

The interactive dashboard, when the user wants to explore rather than read a summary:

```bash
scripts/coach.sh
```

That prints a `http://127.0.0.1:<port>` URL and opens a browser. It keeps running until
interrupted, so start it in the background and give the user the URL.

## Narrowing the data

| Flag | Effect |
|---|---|
| `--since <n>d` | Only the last `n` days, e.g. `--since 30d` |
| `--harness <name>` | One tool only — see the harness names below |
| `--workspace <id>` | A single workspace id |
| `--logs-dir <path>` | An extra VS Code or Xcode log directory (repeatable) |

Harness names are exact: `Claude`, `Codex`, `OpenCode`, `Local Agent`,
`Local Agent (Insiders)`, `Xcode`, `GitHub Copilot CLI`, `GitHub Copilot App`.

A Claude Code user's own last month:

```bash
scripts/coach.sh report --since 30d --harness Claude
```

## Reading the output

The report covers totals and AI-generated lines of code, activity and streaks, flow scores,
top languages, and the anti-patterns that fired.

Anti-patterns are ranked by occurrence count, which tracks how much the user does something,
not how much it costs them. Read severity alongside the count before telling the user what to
fix first. Some rules only apply to IDE sessions — they are scored against the user's VS Code
and Xcode sessions only, because terminal agents never record slash commands, attached
instruction files, or tool confirmations.

## Troubleshooting

- **First run is slow.** Terminal-agent logs are re-parsed every run rather than cached. A
  multi-gigabyte `~/.claude/projects` takes a couple of minutes. Say so rather than letting
  the user think it hung.
- **A harness is missing.** That tool wrote no logs matching the filter. Drop `--since` and
  `--harness` before concluding it is unsupported.
- **`Port N is already in use`.** Another dashboard is running. Omit `--port` to pick a free one.

## Anti-patterns

- Don't parse `~/.claude/projects/*.jsonl` by hand to answer these questions. The CLI already
  normalizes every tool into one model, and hand-rolled counts will disagree with it.
- Don't pass a display name to `--harness`. The value is `Claude`, not `Claude Code`; a wrong
  name matches nothing and silently returns an empty report.
- Don't redirect stderr into the report file. stdout is the document; stderr is progress and
  parse diagnostics.
- Don't present anti-pattern counts as defects to fix without checking severity and totals
  first. A rule firing 13,000 times across two years is a habit, not an emergency.
