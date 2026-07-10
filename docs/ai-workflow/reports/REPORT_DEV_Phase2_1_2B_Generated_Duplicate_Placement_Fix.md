# REPORT_DEV_Phase2_1_2B_Generated_Duplicate_Placement_Fix

Date: 2026-07-10
Repo: `/Users/issiyua/Documents/Adaptive_Learning_OS`
Vault: `/Users/issiyua/Desktop/Learning/Study`

## Scope Executed

Implemented the narrow Phase 2.1.2B generated duplicate placement hardening requested in:

`docs/ai-workflow/incoming/DEV_Phase2_1_2B_Generated_Duplicate_Placement_Fix.md`

No Review Scheduler, Note Check, Context Pack Builder, whole-block rewrite, multi-item rewrite, commit, tag, push, or large docs/context update was performed.

## Real Manual QA Inputs Read

Read the incoming brief, previous runtime hardening report, live smoke report, and bug inventory. The requested bug inventory path without suffix did not exist; the actual file read was:

`docs/ai-workflow/reports/BUG_INVENTORY_Phase2_1_2B_Full_Manual_QA (1).md`

Also inspected the real vault note:

`/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/Phase2_1_2B_Master_TestPhase2_1_2B_Master_TestA1_Normal_Clarification未命名 2.md`

Relevant real ask-job artifact shape observed in `.learning-os/ask-jobs/` included generated-content jobs such as:

- `job-20260710-030857-65iksv.json`: `askSourceMode: generated-content-item`, question `再编一个完全不同的故事`, non-empty parsed answer, generated-content fallback proposal, inline draft applied.
- `job-20260710-032901-tbgvy3.json`, `job-20260710-033012-mad2kg.json`, `job-20260710-033555-exyuvg.json`, `job-20260710-034017-y2nlyu.json`, `job-20260710-034034-j28f5x.json`: normal-note generated story requests with generated-content proposals.
- `job-20260710-034656-qmdene.json` / `job-20260710-035206-ijv6oo.json`: generated-content-item jobs with live draft/applyability fields.

The fix treats the manual QA bugs as factual even when old deterministic tests did not reproduce them.

## Implementation Summary

Changed `src/ask/AskIntent.ts`:

- Made generated-content satisfaction checking accept real prompt modifiers such as `测试一下`, `帮助我理解`, `简短`, `完全不同`, `再补充`, `再`.
- Kept protection against empty, refusal, placeholder, and hard-keyword unrelated answers.
- Did not disable satisfaction checking.

Changed `src/jobs/ApplyAskJobProposal.ts`:

- Added duplicate-marker regression checking based on before/after delta.
- Historical unrelated duplicate markers no longer block a safe Apply if this Apply does not worsen them.
- New or worsened duplicate markers still rollback.
- Ambiguous target markers still rollback, with a clearer message:
  `Apply failed: the target Learning OS marker appears multiple times...`
- Failed job errors now record `ambiguousTargetClarificationIds`, `ambiguousTargetItemIds`, and `ambiguousTargetGeneratedIds`.
- Generated/clarification insertion now advances past the contiguous Learning OS output cluster below the selected source, keeping repeated normal-note generated outputs in Apply order and before the next heading.

Changed `src/types.ts`:

- Added ambiguous target duplicate fields to Ask job error metadata.

Changed tests:

- Added generated prompt matrix from real manual QA wording.
- Added negative checks for empty/refusal/unrelated generated answers.
- Added duplicate regression fixtures:
  - unrelated historical duplicate unchanged succeeds;
  - historical duplicate worsened rolls back;
  - duplicated target generated/item marker rolls back and preserves inline draft.
- Added normal-note generated placement/order regression test.

## Verification

TypeScript:

- `PATH=/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH /Users/issiyua/Documents/Adaptive_Learning_OS/node_modules/.bin/tsc -noEmit -skipLibCheck`
- Result: pass.

Focused tests:

- `node --loader ./tests/ts-extension-loader.mjs --test tests/inlineDraftStaging.test.mjs`
- Result: 29/29 pass.

- `node --loader ./tests/ts-extension-loader.mjs --test tests/asyncInbox.test.mjs`
- Result: 70/70 pass.

Full tests:

- `node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs`
- Result: 181/181 pass.

Production build:

- `node esbuild.config.mjs production`
- Result: pass.

Note: the local shell did not have `npm` on PATH. Verification used the Codex bundled Node runtime and the repo-local `node_modules`.

## Build Artifact

`main.js` after production build:

- mtime: `Jul 10 14:49:08 2026`
- epoch mtime: `1783687748`
- SHA-256: `75bbc3758bbc8ec5537d35951fb45690af4444ec4b1cbf8f8949a55a39c5e291`

The vault plugin path is a symlink:

`/Users/issiyua/Desktop/Learning/Study/.obsidian/plugins/adaptive-learning-os -> /Users/issiyua/Documents/Adaptive_Learning_OS`

## Vault Backup And Dev Copy

Created backup:

`/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/backups/Phase2_1_2B_Master_TestA1_Normal_Clarification.backup-20260710-145000.md`

Created dev smoke copy:

`/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/DEV_SMOKE_Phase2_1_2B_Generated_Duplicate_Placement_Fix.md`

Did not modify `How to Use AI.md`.

## Obsidian Reload And Live Smoke

Reload method:

- Fully quit Obsidian.
- Reopened vault `/Users/issiyua/Desktop/Learning/Study`.
- Opened the dev smoke copy through Obsidian URL.

Reload/open time:

- `2026-07-10T12:49:57Z`

Observed active Obsidian window after reload:

`DEV_SMOKE_Phase2_1_2B_Generated_Duplicate_Placement_Fix - Study - Obsidian 1.12.7`

Attempted UI command-palette smoke for:

- `Learning OS: Open Ask Inbox`
- `Learning OS: Show KnowledgeData Global Summary`

The app accepted macOS UI automation and stayed on the dev smoke note. However, the available automation channel could only read the window title and basic window controls; it could not reliably inspect plugin pane/modal contents or perform a trustworthy full Ask/Apply click-through. Therefore this report claims reload/open/command-palette smoke only, not a full manual UI Ask/Apply regression pass. The generated/duplicate/placement behavior is covered by deterministic tests using real failure shapes and prompt wording.

## Git / Release State

No commit, tag, or push was performed.

Large `docs/context` files were not updated in this round.

