# REPORT DEV Phase 2.1.2B — Callout Boundary, Source Mapping, Timing Diagnostics

Date: 2026-07-10  
Repo: `/Users/issiyua/Documents/Adaptive_Learning_OS`  
Vault: `/Users/issiyua/Desktop/Learning/Study`  
Task brief: `docs/ai-workflow/incoming/DEV_Phase2_1_2B_Callout_Boundary_Source_Mapping_Timing.md`

## Scope

Implemented the requested narrow fix for Phase 2.1.2B:

- Adjacent Learning OS tip/note callouts are no longer merged into one oversized container.
- Ask source mapping for Learning OS callout items is now selection-offset based, not nearest-callout based.
- `selectedLearningOsItem`, `siblingLearningOsItems`, source block, source hash, and offsets now come from the exact selected item.
- Ask job creation rejects inconsistent Learning OS source/item mappings before calling the model.
- Ask jobs now record lightweight processing stage/timing diagnostics.
- Inbox running status can show the current processing stage and a slow-processing hint.

Did not implement Review, Note Check, Context Pack Builder, new KnowledgeData behavior, whole-block rewrite, or new AI extraction.

## Real Evidence Read

Read the required real note:

- `/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/FINAL_QA_Source_Local_Apply.md`

Read real Ask jobs and logs:

- `/Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs/job-20260710-205415-bh7d4d.json`
- `/Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs/job-20260710-204650-2jn03k.json`
- `/Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs/job-20260710-210210-aws4bf.json`
- `/Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs/job-20260710-210530-gufarz.json`
- `/Users/issiyua/Desktop/Learning/Study/.learning-os/logs/ask-jobs-2026-07.jsonl`

The brief referenced:

- `docs/ai-workflow/incoming/MANUAL_QA_Phase2_1_2B_Final_Source_Local_Apply(1).md`

That file was not present in `docs/ai-workflow/incoming` during this run. I used the task brief, the real note, real job JSON files, and real logs as the factual source.

## Confirmed Failure Shapes

### Observability mapped to Deployment

Real job: `job-20260710-205415-bh7d4d`

- User selected: `解系统内`
- Real source block: `> **Observability** 用于理解系统内部运行状态。`
- Incorrect stored item before this fix:
  - `askSourceMode: clarification-item`
  - `selectedLearningOsItem.containerId: clar-20260710-204944-470-d0jyoc-b-复杂-callout-集合-检查本地插入位置`
  - `selectedLearningOsItem.itemId: deployment-1`
  - `selectedLearningOsItem.itemTitle: Deployment`

### Monitoring mapped to Caching generated block

Real job: `job-20260710-210210-aws4bf`

- User selected: `**Monitoring**`
- Incorrect stored container before this fix:
  - `selectedLearningOsItem.containerId: gen-final-b2`
  - `selectedLearningOsItem.itemId: item-final-b5`
  - `sourceBlock`: Caching generated block
  - `siblingLearningOsItems`: 9 items from other callouts

### Deployment mapped to Caching generated block

Real job: `job-20260710-210530-gufarz`

- User selected: `是把应用发布到目标环境`
- Incorrect stored container before this fix:
  - `selectedLearningOsItem.containerId: gen-final-b2`
  - `selectedLearningOsItem.itemId: item-final-b4`
  - `sourceBlock`: Caching generated block
  - `siblingLearningOsItems`: 11 items from other callouts

## Implementation

### New exact Learning OS source mapper

Added `src/ask/LearningOsSourceMapping.ts`.

Key behavior:

- Finds clarification and generated-content containers by real marker ranges.
- Stops a Learning OS callout when another top-level callout header begins.
- Keeps Obsidian lazy continuation support for one continuation paragraph.
- Parses item marker ranges inside the selected container.
- Selects the item only when the selection offset falls inside that item range and selected text belongs to that item.
- Builds siblings only from the same parsed container.

### Ask modal source locking

Updated `src/main.ts`.

Key behavior:

- `openAskModal` first asks the exact Learning OS mapper whether the selection is inside a Learning OS container.
- For tip/generated item asks, the stored source block/hash/offsets are replaced with the selected item markdown, not the whole nearby callout.
- If the selected item cannot be precisely located, the plugin shows a notice and aborts job creation.
- Existing target item id prefers the exact selected item id over the older text-search fallback.

This avoids using "nearest callout" guessing for the affected source mode.

### Pre-model consistency guard

Updated `src/jobs/AskJobService.ts`.

Before creating a background job, Learning OS item source is validated:

- `clarification-item` must point at a `clar-` container.
- `generated-content-item` must point at a `gen-` container.
- Selected text must belong to the selected item title/content.
- Siblings must not include the selected item id.

This would reject the real Observability→Deployment mismatch before any AI call.

### Timing diagnostics

Updated `src/types.ts`, `src/jobs/AskJobService.ts`, `src/main.ts`, `src/views/AskInboxState.ts`, and `src/views/AskInboxView.ts`.

New Ask job fields:

- `processingStage`
- `timingDiagnostics.queuedAt`
- `providerRequestStartedAt`
- `providerResponseReceivedAt`
- `parseCompletedAt`
- `proposalBuildStartedAt`
- `proposalBuildCompletedAt`
- `draftStageStartedAt`
- `draftStageCompletedAt`
- `jobCompletedAt`
- duration fields for queue/provider/parse/proposal/draft/total
- retry metadata

Inbox running text now reports the stage and adds a slow-processing hint after 60 seconds.

### Proposal diagnostics

Ask jobs now persist compact proposal diagnostics where applicable:

- resolved source mode
- resolved target container/item
- output kind
- non-empty/empty outcome
- fallback usage
- editable markdown length
- inline draft stage outcome
- applyability source

## Tests Added

Updated `tests/askWorkflowUx.test.mjs`:

- Adjacent tip/note/tip/note/note/tip/note source mapping matrix.
- Lazy continuation is preserved but next callout is not swallowed.
- Real Observability / Monitoring / Deployment regression shapes resolve to their own containers/items.

Updated `tests/asyncInbox.test.mjs`:

- Mismatched Learning OS source is rejected before model call.
- Ask job timing diagnostics are populated with non-negative durations.
- Inbox slow-running status text shows a long-processing hint.

Existing focused and regression tests for generated apply, duplicate marker safety, adjacent placement, inline draft apply, and Inbox rendering still pass.

## Verification

Because this environment has Node but no `npm` executable, I used equivalent local commands directly.

Passed:

```text
PATH=/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/.bin/tsc --noEmit --skipLibCheck
```

Passed:

```text
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/askWorkflowUx.test.mjs tests/asyncInbox.test.mjs
```

Result:

```text
124 tests passed
```

Passed full test suite:

```text
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
```

Result:

```text
196 tests passed
```

Passed production build:

```text
PATH=/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH /Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node esbuild.config.mjs production
```

## Production Artifact And Reload

Plugin install path in the real vault is a symlink:

```text
/Users/issiyua/Desktop/Learning/Study/.obsidian/plugins/adaptive-learning-os
-> /Users/issiyua/Documents/Adaptive_Learning_OS
```

Built artifact:

```text
main.js mtime: Jul 10 21:30:04 2026
main.js size: 1532537
main.js sha256: 62d69a8f367a36481c97bc3888f9ff73211157f7662d660852b163345af93b4a
```

Reload method:

```text
Quit Obsidian via osascript, then reopened Study vault via obsidian://open?vault=Study.
```

Reload time recorded:

```text
2026-07-10 21:30:51 CEST
```

Verified Obsidian process after reload:

```text
/Applications/Obsidian.app/Contents/MacOS/Obsidian
```

Opened real QA note by URI after reload:

```text
obsidian://open?vault=Study&file=Phase2_1_2B%2FFINAL_QA_Source_Local_Apply.md
```

Computer Use UI automation could not run because its native pipe startup failed. I therefore treated live UI smoke as limited: app reload, process presence, symlink artifact hash, and opening the real QA note URI were verified, but I did not perform a destructive or AI-backed live Ask/Apply action in the user vault.

## Git / Repo Notes

No commit, tag, or push was performed.

The worktree already contained many prior Phase 2.1.2B changes and docs/context changes before/during this task. I did not revert them. This report focuses on the files relevant to this fix:

- `src/ask/LearningOsSourceMapping.ts`
- `src/main.ts`
- `src/jobs/AskJobService.ts`
- `src/types.ts`
- `src/views/AskInboxState.ts`
- `src/views/AskInboxView.ts`
- `tests/askWorkflowUx.test.mjs`
- `tests/asyncInbox.test.mjs`
- `main.js`

## Residual Risk

- The new source mapper intentionally supports one lazy continuation paragraph. If users write long unquoted prose directly after a callout with no boundary, only the first continuation paragraph is treated as part of that callout.
- Full visual UI Ask/Apply smoke was not completed because Computer Use was unavailable. Deterministic tests and production reload were completed.
- Historical jobs remain wrong as historical records; the fix applies to newly created Ask jobs.
