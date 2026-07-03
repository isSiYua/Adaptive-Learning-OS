# AGENTS.md

## Project

This repository is the Obsidian plugin project for Adaptive Learning OS.

The plugin should turn an Obsidian vault into a local-first adaptive learning system with:

- inline AI questions about selected text,
- single Ask Card annotations,
- note checking,
- AI check prompts,
- concept mastery tracking,
- dynamic review scheduling,
- context pack generation.

## Use project-local skills

Codex should use the project-local skills in `.agents/skills/` whenever relevant.

Most important skills:

- `obsidian-plugin-dev`
- `feature-slice-development`
- `ask-card-workflow`
- `ai-provider-abstraction`
- `note-check-system`
- `review-scheduler-tdd`
- `data-schema-migration`
- `ux-friction-reduction`
- `verification-release`

## User's core preference

The user wants Obsidian to be the main workspace.

The user wants one integrated Ask Card block:

```markdown
>>> ASK_CARD
...
<<<
```

Do not split questions, user understanding, and AI answers into separate `QUESTION`, `MY_UNDERSTANDING`, and `AI_ANSWER` blocks.

## Development rules

- Use TypeScript.
- Keep the plugin local-first.
- Store plugin data inside `.learning-os/` in the user's vault.
- Do not build a web app in v0.1.
- Do not require Anki in v0.1.
- Do not auto-send user notes to any AI provider.
- Do not auto-apply AI changes.
- Use Obsidian APIs for vault access.
- Keep generated data human-readable.
- Keep dependencies minimal.
- Ask before adding production dependencies.
- Add tests for parser, scheduler, note checker, and context pack builder.

## MVP priority order

1. Plugin scaffold.
2. Right-click selected text and ask AI/manual prompt.
3. Ask Modal / card popup.
4. Single Ask Card insertion.
5. Ask Card parser and log.
6. Rule-based note check.
7. AI check prompt generator.
8. Concept mastery store.
9. Dynamic review dashboard.
10. Context pack builder.
