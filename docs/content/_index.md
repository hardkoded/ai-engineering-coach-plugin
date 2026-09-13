---
title: "Home"
---

## Privacy First

AI Engineer Coach is entirely **read-only** and ships with **zero telemetry**. It parses log files that already exist on your machine and never sends data anywhere. Your usage data stays local.

## Multi-Harness Support

AI Engineer Coach reads logs from multiple AI coding tools:

| Harness | Source |
|---|---|
| **Local Agent / Local Agent (Insiders)** | GitHub Copilot chat panel logs written by VS Code / VS Code Insiders |
| **Local Agent (Server) / Local Agent (Server Insiders)** | Remote host chat panel logs under `~/.vscode-server/data/User/workspaceStorage/` or `~/.vscode-server-insiders/data/User/workspaceStorage/` |
| **GitHub Copilot for Xcode** | Copilot Chat conversations from Apple's Xcode IDE |
| **Claude** | Session files from Anthropic's CLI-based coding assistant |
| **Codex** | Session history from OpenAI's terminal agent |
| **OpenCode** | Session logs from the open-source terminal coding tool |
| **GitHub Copilot CLI** | Session state and history from the Copilot CLI terminal agent |

## How It Works

AI Engineering Coach runs as an agent plugin and a local CLI. It scans your log directories for supported tools, parses every session into structured data, and renders either a stdout summary or an interactive dashboard served on localhost, with charts and actionable findings. The analysis pipeline is organized around three areas: **Observe**, **Measure**, and **Improve**, plus a **Level Up** section that turns your data into a progression system.

## Editable Rule Engine

Anti-pattern detection is driven by an editable rule engine. Each detector is a markdown file with YAML frontmatter and a small DSL that you can inspect, tune, and extend. The [Rule Editor](/improve/rule-editor/) lets you live-test changes against your own data, and an AI builder can scaffold new rules from a natural-language description. The [Rule Playground](/improve/rule-playground/) is an interactive REPL for the DSL, and the [Data Explorer](/improve/data-explorer/) shows every field and distribution the rules can key off.
