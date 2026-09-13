# Skills

Agent Skills shipped by this plugin. Each is a directory containing a `SKILL.md`, following
the [Agent Skills specification](https://agentskills.io/specification), and they are
discovered through [`plugin.json`](../plugin.json) per the
[Agent Plugins standard](https://agent-plugins.org/).

## Available skills

| Skill | When to use |
|---|---|
| [ai-engineering-coach](ai-engineering-coach/SKILL.md) | Report on the user's own AI coding sessions |
| [package-extension](package-extension/SKILL.md) | Build the `.vsix` via `npm run package` |
| [update-docs](update-docs/SKILL.md) | Update or add a page under `docs/content/` |

## Layout

```
skills/
└── <skill-name>/
    ├── SKILL.md      # required: frontmatter + instructions
    ├── scripts/      # optional: things the agent runs
    └── references/   # optional: detail loaded on demand
```

This directory is the canonical source. Symlinks make the same skills discoverable by agents
that look in their own conventional locations:

| Agent | Path |
|---|---|
| Claude Code | [`.claude/skills/`](../.claude/skills/) |
| GitHub Copilot | [`.github/skills/`](../.github/skills/) |

When you add a skill, create both symlinks:

```bash
ln -s ../../skills/<skill> .claude/skills/<skill>
ln -s ../../skills/<skill> .github/skills/<skill>
```

## Authoring

Frontmatter is limited to the fields the Agent Skills spec defines — `name`, `description`,
and optionally `license`, `compatibility`, `metadata`, `allowed-tools`. Anything else is
rejected. `name` must match the directory name, use only lowercase letters, digits and single
hyphens, and not start or end with one.

```yaml
---
name: kebab-case-id
description: What the skill does, and the situations that should trigger it. Max 1024 chars.
---
```

Put the trigger phrases in `description` — there is no separate `when_to_use` field, and the
description is the only thing an agent sees before deciding to load the skill.

Body sections we use consistently:

- A short overview of what the skill produces or changes.
- Prerequisites, then the **Steps** as commands the agent can run.
- Troubleshooting for common failure modes.
- An **Anti-patterns** section describing what *not* to do — these prevent regressions when
  agents pattern-match from training data instead of from this repo.

`npm test` validates every skill and the plugin manifest against both specs
([`src/plugin/manifest.ts`](../src/plugin/manifest.ts)), so a malformed skill fails CI.

Keep skills self-contained. Generic engineering guidance belongs in
[`AGENTS.md`](../AGENTS.md), not here.
