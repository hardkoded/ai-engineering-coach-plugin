---
title: "Getting Started"
weight: 10
---

AI Engineering Coach is an agent plugin that analyzes your AI-assisted coding sessions. It reads local log files from Claude Code, Codex, OpenCode, GitHub Copilot (VS Code, CLI and app), and GitHub Copilot for Xcode, then reports them as a summary you can read or an interactive local dashboard.

## Requirements

- **VS Code** 1.85 or later (or VS Code Insiders) — harness shown as "Local Agent"
- At least one supported AI coding tool with existing session logs

No API keys, accounts, or external services required. Everything runs locally.

## Quick Start

1. [Install the plugin]({{< ref "getting-started/installation" >}}) by cloning and building it
2. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
3. Run `node dist/cli.cjs` and open the printed URL, or ask your agent how you are using AI
4. The extension scans your local log directories and displays your analytics

The dashboard opens as a webview panel inside VS Code. Use the sidebar to navigate between views.
