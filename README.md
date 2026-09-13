<h1 align="center">AI Engineering Coach</h1>

<p align="center">
<strong>better agentic engineering.</strong><br>
An agent plugin that analyzes how you actually work with AI coding agents — any tool, one report.
</p>

<p align="center">
<a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
<a href="https://agent-plugins.org/"><img alt="Agent Plugins 1.1.0" src="https://img.shields.io/badge/Agent%20Plugins-1.1.0-6e40c9"></a>
<a href="https://agentskills.io/specification"><img alt="Agent Skills" src="https://img.shields.io/badge/Agent%20Skills-compatible-10b981"></a>
</p>

---

## What this is

Your AI coding tools already write a detailed log of every session to your disk. This plugin
reads those logs and tells you how you are actually working: where your prompts are weak,
which habits cost you time, how much code the agent writes versus you, and whether your
repos are set up for agents at all.

Ask your agent *"how am I using AI?"* and it answers from your own data. Nothing is uploaded.

It reads **Claude Code**, **Codex**, **OpenCode**, **GitHub Copilot** (VS Code, CLI, and the
desktop app), and **Copilot for Xcode**.

> This is a fork of [microsoft/AI-Engineering-Coach](https://github.com/microsoft/AI-Engineering-Coach),
> repackaged as a portable agent plugin and given a standalone CLI so it runs without VS Code.
> See [Relationship to upstream](#relationship-to-upstream).

---

## Install

The repo *is* the plugin: [`plugin.json`](plugin.json) at the root, skills under
[`skills/`](skills/), per the [Agent Plugins](https://agent-plugins.org/) standard.

```bash
git clone https://github.com/hardkoded/ai-engineering-coach-plugin.git
cd ai-engineering-coach-plugin
npm ci && npm run build
```

Then point your agent at it. For **Claude Code**, link the skills into your personal skills
directory so they work from any project:

```bash
ln -s "$PWD/skills/ai-engineering-coach" ~/.claude/skills/ai-engineering-coach
```

Any client that implements the Agent Plugins standard can instead load the directory as a
plugin and discover the same skills through `plugin.json`. Clients that read skills from a
checkout will also find them in [`.claude/skills/`](.claude/skills/) and
[`.github/skills/`](.github/skills/), which symlink to the same files.

---

## Use it

Ask in plain language — the skill description covers these triggers:

> how am I using AI?
> review my last month of Claude Code sessions
> what are my worst anti-patterns?
> is this repo set up properly for agents?

Your agent runs the CLI and reads the result. You can also run it yourself:

```bash
# a summary you can read
node dist/cli.cjs report

# just your Claude Code sessions, last 30 days
node dist/cli.cjs report --since 30d --harness Claude

# structured output
node dist/cli.cjs report --json | jq .
```

| Flag | Effect |
|---|---|
| `--since <n>d` | Only the last `n` days |
| `--harness <name>` | One tool: `Claude`, `Codex`, `OpenCode`, `Local Agent`, `Xcode`, `GitHub Copilot CLI`, `GitHub Copilot App` |
| `--workspace <id>` | A single workspace |
| `--logs-dir <path>` | An extra VS Code or Xcode log directory (repeatable) |

stdout is the document and nothing else — progress and parse diagnostics go to stderr, so
piping into `jq` works.

---

## The dashboard

For exploring rather than reading, the same data renders as a local web app:

```bash
node dist/cli.cjs
```

It prints a `http://127.0.0.1:<port>` URL and opens your browser. `--no-open` skips that,
`--port <n>` pins the port.

<details>
<summary><strong>Screenshots</strong></summary>
<br>
<p align="center"><img src="assets/screen-timeline.png" alt="Timeline" width="820"></p>
<p align="center"><img src="assets/screen-output.png" alt="Code Output" width="820"></p>
<p align="center"><img src="assets/screen-patterns-projects.png" alt="Activity Patterns" width="820"></p>
<p align="center"><img src="assets/screen-antipatterns.png" alt="Anti-Patterns" width="820"></p>
<p align="center"><img src="assets/screen-context-quality.png" alt="Context Quality" width="820"></p>
<p align="center"><img src="assets/screen-learning.png" alt="Learning Center" width="820"></p>
</details>

Session parsing runs in a forked process with its own heap, so a multi-gigabyte
`~/.claude/projects` will not exhaust memory. The first run takes a couple of minutes; logs
from terminal agents are re-parsed each time rather than cached.

---

## Skills

| Skill | What it does |
|---|---|
| [`ai-engineering-coach`](skills/ai-engineering-coach/SKILL.md) | Reports on your sessions — scores, anti-patterns, code output, activity |
| [`package-extension`](skills/package-extension/SKILL.md) | Builds the VS Code extension into an installable `.vsix` |
| [`update-docs`](skills/update-docs/SKILL.md) | Adds or edits a page in the Hugo docs site |

`npm test` validates `plugin.json` and every `SKILL.md` against both specs
([`src/plugin/manifest.ts`](src/plugin/manifest.ts)), so a malformed skill fails CI rather
than failing silently in someone's agent.

---

## Also runs as a VS Code extension

The original packaging still works, and it is the only way to get the AI-assisted features
(Skill Finder, Learning Center, and the AI context review), which need the VS Code language
model API.

```bash
npm ci && npm run package
code --install-extension ai-engineer-coach-*.vsix
```

Then run **AI Engineer Coach: Open Dashboard** from the command palette. On Windows, use
`code --install-extension (Get-ChildItem . -Filter 'ai-engineer-coach-*.vsix' | Select-Object -First 1).FullName`,
or install from the palette with **Install from VSIX**.

The dashboard also runs as a canvas inside the GitHub Copilot app — open this repo as a
project there and pick the **AI Engineer Coach** canvas. Both hosts share the webview bundle
and the analysis code with the CLI.

---
## Pages

### Observe

| Page               | Description                                                                           |
| ------------------ | ------------------------------------------------------------------------------------- |
| **Dashboard**      | Practice scores with week-over-week trends, daily activity chart, top workspace stats |
| **Timeline**       | Gantt-style session timeline with per-day drill-down and overlap detection            |
| **Coding Moments** | Screenshot gallery from AI coding sessions with story reels and workspace filtering   |

### Measure

| Page         | Description                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------- |
| **Output**   | Generated code volume by language, model usage table _(token breakdown temporarily hidden)_ |
| **Burndown** | Monthly AI token budget progress with projections _(temporarily disabled)_                  |
| **Patterns** | 7×24 activity heatmap and work-life balance signals                                         |

### GitHub App

This section appears only when the local GitHub Copilot app is installed.

| Page              | Description                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Productivity**  | Project sessions with and without issues, pull request and merge conversion, and a seven-day PR merge-ratio trend |
| **Issue credits** | Rough relative AI spend per GitHub issue across linked workspace, alias, creator, and coordinating sessions       |

Issue credit percentages are rough relative estimates, not accurate AI Credit or billing figures.
They normalize the locally recorded `total_nano_aiu` usage across linked issues to show approximately
where AI usage was spent. The percentages depend on issue links inferred from local workspace and
issue-reference data and must not be used for billing reconciliation. Explicit GitHub issue URLs
pasted in either of the first two session turns also establish the issue link; URLs pasted later are
excluded to avoid treating research links as the session's source issue. All reconciliation and
aggregation is local and read-only. The small organization avatars on this page are loaded directly
from GitHub using the repository owner name; no session content or usage data is included in these
image requests.

### Improve

| Page                | Description                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Anti-Patterns**   | Five practice score cards with severity ratings, concrete actions, and example prompts. 45 editable markdown rules plus a coverage heatmap |
| **Rule Editor**     | Create, edit, and tune detection rules visually or as raw markdown. Live-test against your data                                            |
| **Rule Playground** | Interactive REPL for the rule DSL with field browser, function catalog, and metric list                                                    |
| **Data Explorer**   | Browse session fields, view distributions, run ad-hoc filters                                                                              |
| **Skill Finder**    | Discover repeated prompt patterns and matching community skills from the open-source catalog                                               |
| **Context Health**  | Overall context score, agentic readiness checklist, workspace context map, AI-powered instruction-file review                              |

### Level Up

| Page                | Description                                                                      |
| ------------------- | -------------------------------------------------------------------------------- |
| **Learning Center** | Personalized quizzes and code-comparison rounds generated from your actual usage |
| **Achievements**    | XP-based progression with Bronze → Silver → Gold → Diamond tiers                 |
| **Agentic SDLC**    | How you use AI across the full software-development lifecycle                    |
| **Share**           | Generate a shareable stat card and export Markdown/JSON summaries               |

**Skill Finder**, **Learning Center**, and the AI review on **Context Health** need the VS Code
language model and are hidden in the CLI and the Copilot canvas. **Rule Playground** and
**Data Explorer** have no sidebar entry yet — reach them from the Anti-Patterns page.

---

## Privacy

- **Read-only** — never modifies your session files
- **Local analysis** — all parsing and analytics run on your machine
- **No telemetry** — nothing phones home, and the core analysis paths make no network calls
- **Optional AI features** — Skill Finder, Learning Center and the context review call the
  VS Code language model, and only when you explicitly invoke them. They are unavailable in
  the CLI, where the dashboard reads your logs and nothing else.

---

## Relationship to upstream

Forked from [microsoft/AI-Engineering-Coach](https://github.com/microsoft/AI-Engineering-Coach),
an open-source community effort by Microsoft employees. The analysis engine, rules, and
dashboard are theirs. This fork adds:

- A standalone CLI, so the dashboard and a stdout report run without VS Code or the Copilot app.
- Agent Plugins and Agent Skills packaging, so any compatible agent can use it.
- Fixes for analyzing terminal agents: Claude Code workspaces were dropped from Context Health
  entirely, and eleven IDE-only rules scored terminal sessions against fields those tools
  never record.

Upstream is the place for issues about the analysis itself. MIT licensed, like the original.

---

## Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft
trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.

## License

[MIT](LICENSE)

## Disclaimer

This is an independent fork, maintained by [@kblok](https://github.com/kblok) under the
[hardkoded](https://github.com/hardkoded) organization, and not affiliated with or endorsed by
Microsoft. The upstream project it derives from is an open-source community
effort by Microsoft employees, itself **not** an official Microsoft product and not part of any
Microsoft service or support offering. Neither this fork nor the original carries any warranty
or guarantee; both are provided as-is.
