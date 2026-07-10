# REPORT QA Phase 2.1.2B Live Obsidian Smoke

QA target: Phase 2.1.2B live Obsidian smoke verification

Repo path: `/Users/issiyua/Documents/Adaptive_Learning_OS`

Vault path: `/Users/issiyua/Desktop/Learning/Study`

Excluded note: `/Users/issiyua/Desktop/Learning/Study/How to Use AI.md` was not opened or modified by this QA run.

Plugin runtime path: `/Users/issiyua/Desktop/Learning/Study/.obsidian/plugins/adaptive-learning-os -> /Users/issiyua/Documents/Adaptive_Learning_OS`

Build used: production build from the symlinked repo.

Node used: `/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`

## Automated verification

- TypeScript: pass
- Full tests: pass, 175/175
- Production build: pass
- `git diff --check`: pass

Commands run:

```bash
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc -noEmit -skipLibCheck
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node esbuild.config.mjs production
git diff --check
```

## Live smoke

- Case A generated -> story: blocked, not executed in UI.
- Case B generated -> clarification: blocked, not executed in UI.
- Case C tip -> clarification: blocked, not executed in UI.
- Case D tip -> story: blocked, not executed in UI.
- Case E Inbox UI: blocked, not executed in UI.

Blocking reason:

- The session did not expose a Computer Use click/screenshot tool after tool discovery.
- Fallback macOS UI automation via `osascript` failed with: `System Events ... osascript is not allowed assistive access (-1728)`.
- Obsidian was opened successfully, but the QA run could not inspect/click/type in the UI.

Vault writes:

- No QA note was created.
- No vault note content was modified by this QA run.

## Failures

- case: Live UI smoke A-E
- job id: not available
- exact symptom: UI automation unavailable, so Ask/apply flows could not be executed
- sourceMode: not available
- outputKind: not available
- editableMarkdownLength: not available
- applyDisabledReason: not available
- markdown result: not available

## Blockers

- Live Obsidian smoke remains blocked until Computer Use is available or macOS Accessibility permission is granted for the automation runner.

## Non-blocking gaps

- Deterministic tests pass and cover the generated/tip inline draft paths, but this run did not validate real Obsidian rendering, sticky Apply behavior, real Ask job persistence, or real AI/provider output.
- Worktree already contains broad staged/unstaged Phase 2.1.2B changes from prior work. This QA run did not commit.

## Docs/context updated?

- No broad `docs/context` maintenance performed.
- Only this requested QA report was added under `docs/ai-workflow/reports/`.

## Ready to commit?

- Automated verification is green.
- Not ready to claim live-smoke complete until UI access is available.

## Recommended next step

- Grant Accessibility permission for the automation runner / enable Computer Use tools, then rerun only the five live smoke cases against `QA/Phase2_1_2B/Runtime_Smoke.md`.
