---
title: "Installation"
weight: 10
description: "Install the plugin and run the coach"
---

# Installation

This project ships as an [Agent Plugin](https://agent-plugins.org/): a `plugin.json` at the
repository root and Agent Skills under `skills/`. You install it by cloning and building it.

## Build from source

```bash
git clone https://github.com/hardkoded/ai-engineering-coach-plugin.git
cd ai-engineering-coach-plugin
npm ci
npm run build
```

That produces `dist/cli.cjs`, which is everything the coach needs.

## Install the skill

Link the skill into your agent's skills directory so it works from any project. For Claude Code:

```bash
ln -s "$PWD/skills/ai-engineering-coach" ~/.claude/skills/ai-engineering-coach
```

Any client that implements the Agent Plugins standard can instead load the repository as a
plugin and discover the same skills through `plugin.json`.

Link the skill directory, not the files inside it. The launcher resolves the plugin root from
its own physical location, so a symlinked directory works while a copied script does not.

## Use it

Ask your agent how you are using AI, and it runs the coach for you. To run it yourself:

```bash
# a summary you can read
node dist/cli.cjs report

# just your Claude Code sessions, last 30 days
node dist/cli.cjs report --since 30d --harness Claude

# structured output
node dist/cli.cjs report --json
```

## Open the dashboard

For exploring rather than reading:

```bash
node dist/cli.cjs
```

It prints a `http://127.0.0.1:<port>` URL and opens your browser. Use `--no-open` to skip
opening a browser, and `--port <n>` to pin the port.

The first run takes a couple of minutes: logs from terminal agents are re-parsed on every run
rather than cached. Parsing happens in a separate process with its own heap, so a
multi-gigabyte `~/.claude/projects` will not exhaust memory.

## AI-powered features

Skill Finder, the Learning Center and the AI review on Context Health call the `claude` binary
you are already signed in to. There is no API key to configure. Without `claude` on your
`PATH` those features hide themselves; everything computed from your logs still works.

## Development

`npm run watch` rebuilds on change.
