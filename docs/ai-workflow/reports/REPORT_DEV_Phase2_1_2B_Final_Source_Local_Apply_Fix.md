# REPORT_DEV_Phase2_1_2B_Final_Source_Local_Apply_Fix

Date: 2026-07-10

Repo:

```text
/Users/issiyua/Documents/Adaptive_Learning_OS
```

Vault:

```text
/Users/issiyua/Desktop/Learning/Study
```

Runtime plugin path:

```text
/Users/issiyua/Desktop/Learning/Study/.obsidian/plugins/adaptive-learning-os -> /Users/issiyua/Documents/Adaptive_Learning_OS
```

## Scope Completed

Implemented the requested narrow fix set for Phase 2.1.2B Final Source-Local Apply:

1. Tip -> Generated Apply no longer applies final content while the inline draft is still present.
2. Item-source Apply now uses the actual selected Learning OS container as the local placement anchor instead of walking a whole contiguous callout cluster.
3. Normal-note new-item proposals no longer trust generic AI item IDs such as `item-1`; they use the job's generated unique proposed item ID.
4. Normal-note duplicate-marker verification no longer treats stale nearby `targetItemId` values as real target item markers.
5. Generated-content-item -> clarification no longer treats an adjacent tip after the generated block as the live target clarification.
6. Inbox detail "原文 / Source block" now displays the current selected Learning OS item text for tip/generated secondary asks, with legacy fallback to `job.sourceBlock`.

No Review Scheduler, Note Check, Context Pack Builder, whole-block rewrite, or multi-item rewrite work was added.

## Real Artifacts Read

Read the task brief:

```text
docs/ai-workflow/incoming/DEV_Phase2_1_2B_Final_Source_Local_Apply_Fix.md
```

Read the available manual QA file:

```text
docs/ai-workflow/incoming/MANUAL_QA_Phase2_1_2B_Post_Fix_Targeted_Chinese.md
```

The brief referenced this file, but it was not present:

```text
docs/ai-workflow/incoming/MANUAL_QA_Phase2_1_2B_Final_Post_Fix_Chinese(1).md
```

Read real notes:

```text
/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/FINAL_QA_Phase2_1_2B.md
/Users/issiyua/Desktop/Learning/Study/测试.md
```

Read/searched real Ask jobs and logs:

```text
/Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs/
/Users/issiyua/Desktop/Learning/Study/.learning-os/logs/
```

Key real evidence:

- `FINAL_QA_Phase2_1_2B.md` Q1 showed a correct final generated block followed by duplicated residual story body, proving stale inline draft body remained after Apply.
- `测试.md` showed a live draft for the normal-note source `竞赛算法、高级动态规划、线段树、树状数组、高级图论。` with `learnos-draft-item-id: draft-item-1`.
- Real job `job-20260710-185006-kdzcas.json` matched the normal-note shape for `这是啥` against the same source block and had `proposedItemId: item-20260710-185006-这是啥`.
- Real job `job-20260710-184858-ucvmqo.json` showed a normal-note job polluted with nearby `targetItemId: item-1`, confirming stale target fields could leak into diagnostics even when the source was not a Learning OS item.

## Root Causes

### 1. Draft Residue / Duplicate Body

The main Apply path previously did this:

```text
prepare live draft
apply final proposal into the still-draft-containing note
read modified note
remove draft in a second write
```

That made final placement and draft removal operate on different text states. When the draft was a blockquote with multi-paragraph content, final insertion could succeed but the second-stage draft removal could leave body residue.

Fix:

- For ready inline draft Apply, remove the live draft from the note before calling the formal Apply function.
- If formal Apply fails, restore the original draft-containing note.
- Keep the post-Apply draft cleanup as a final safety pass.

### 2. Final Block Inserted at Wrong Cluster End

Normal-note placement can use a source-local output cluster. But clarification-item and generated-content-item asks must be anchored to the selected Learning OS block itself.

Fix:

- Added item-source container range resolution from `askSourceMode`, `selectedLearningOsItem.containerId`, and inline draft target metadata.
- `clarification-item + generated-content` inserts immediately after the source tip.
- `generated-content-item + generated-content` appends to the source generated block.
- `generated-content-item + clarification` inserts immediately after the source generated block.
- Normal-note still uses source-local output cluster behavior.

### 3. `item-1` Duplicate-Marker Rollback

AI merge operations can contain generic list-like item IDs such as `item-1`. For normal-note new items, these IDs are not safe to trust because they can collide with historical visible markers.

Fix:

- Inline draft staging replaces generic normal-note add-item operation IDs (`item-1`, `item-2`, etc.) with `job.proposedItemId`.
- Apply operation conversion does the same for normal-note add-item operations.
- Normal-note duplicate-target verification no longer treats stale `job.targetItemId` as an actual target item.
- Duplicate-marker guard remains active and still rejects true worsened duplicates or ambiguous actual targets.

### 4. Generated -> Clarification Appended to Adjacent Tip

The generic live clarification resolver treated a tip adjacent to a generated block as the target clarification for a generated-content-item ask.

Fix:

- `generated-content-item` clarification Apply bypasses normal-note-style adjacent clarification resolution.
- It then uses the selected generated block container as the placement anchor.

### 5. Inbox Source Display

Inbox detail used `job.sourceBlock` for all jobs. For tip/generated secondary asks this displayed the original/background source instead of the current selected item.

Fix:

- Added `displaySourceTextForJob`.
- Normal-note displays `sourceBlock`.
- Clarification/generated item asks display selected item title + selected item content.
- Legacy/missing item metadata falls back to `sourceBlock`.

## Files Changed In This Slice

Core:

```text
src/main.ts
src/jobs/ApplyAskJobProposal.ts
src/ask/InlineDraftStaging.ts
src/views/AskInboxState.ts
src/views/AskInboxView.ts
```

Tests:

```text
tests/inlineDraftStaging.test.mjs
tests/asyncInbox.test.mjs
```

Build artifact:

```text
main.js
```

## Regression Tests Added / Hardened

Added deterministic coverage for:

- normal-note `竞赛算法 / 这是啥` shape where an AI operation tries to use `item-1`;
- existing unrelated `item-1` marker remains exactly once while new final item uses `item-20260710-185006-这是啥`;
- complex continuous callout matrix:
  - tip A -> generated,
  - note B -> generated,
  - tip C -> generated,
  - note D -> clarification,
  - tip F -> generated;
- generated -> clarification inserts below the source generated block instead of appending into the next tip;
- Inbox source display:
  - normal-note,
  - clarification-item,
  - generated-content-item,
  - legacy missing selected item fallback.

Existing focused tests also continue to cover:

- D1 unrelated historical duplicate marker does not block safe Apply;
- D2 ambiguous target marker rolls back and preserves draft;
- generated satisfaction does not regress;
- draft lazy continuation removal;
- generated block secondary Ask/Apply behavior.

## Verification

TypeScript:

```text
PATH=/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/.bin/tsc -noEmit -skipLibCheck
PASS
```

Focused tests:

```text
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/inlineDraftStaging.test.mjs
PASS: 37/37

/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/asyncInbox.test.mjs
PASS: 72/72

/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/paragraphClarification.test.mjs
PASS: 17/17

/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/askWorkflowUx.test.mjs
PASS: 47/47
```

Full tests:

```text
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
PASS: 191/191
```

Production build:

```text
PATH=/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node esbuild.config.mjs production
PASS
```

Diff check:

```text
git diff --check
PASS
```

## Build Artifact

`main.js` after production build:

```text
mtime: 2026-07-10 20:23:10 CEST
size: 1526690 bytes
sha256: 58dd0fc5c40f44ac105c2978de9ed42401c473e65f2fda4725b3c91760ca0cde
```

## Obsidian Reload / Live Smoke

Reload method:

```text
osascript quit Obsidian
open obsidian://open?vault=Study
```

Reload/open time:

```text
2026-07-10 20:24:03 CEST
```

Runtime process check after reload:

```text
82638 /Applications/Obsidian.app/Contents/MacOS/Obsidian
82676 /Applications/Obsidian.app/Contents/Frameworks/Obsidian Helper (GPU).app/Contents/MacOS/Obsidian Helper (GPU)
82677 /Applications/Obsidian.app/Contents/Frameworks/Obsidian Helper.app/Contents/MacOS/Obsidian Helper
82678 /Applications/Obsidian.app/Contents/Frameworks/Obsidian Helper (Renderer).app/Contents/MacOS/Obsidian Helper (Renderer)
```

Additional non-destructive smoke attempted:

```text
open obsidian://open?vault=Study&file=Phase2_1_2B/FINAL_QA_Phase2_1_2B
osascript command-palette attempt for "Learning OS"
```

Limitation:

The Obsidian process restarted and the vault/note open URI calls returned successfully, but screenshot verification still showed the desktop background rather than an Obsidian window. Therefore I cannot honestly claim a full visual UI Ask/Apply live smoke pass in this report. I did not create or modify a live smoke note and did not run a destructive UI Apply flow. The functional behavior is covered by deterministic tests built from the real artifact shapes above.

## Known Residual Risk

- Full manual Obsidian Ask/Apply QA is still recommended because the desktop automation channel could not reliably bring the Obsidian window into the visible screenshot context.
- Existing dirty worktree contains many prior phase changes and docs files; this task did not commit, tag, push, or revert unrelated work.

## Compact Outcome

Code/tests/build are green.

The core runtime risks from this brief are addressed:

- final Apply is no longer performed while the target inline draft is still live;
- source-local placement no longer treats unrelated continuous callouts as one cluster for item-source asks;
- generic `item-1` new-item IDs are sanitized for normal-note Apply;
- generated-content secondary Ask no longer appends clarification to an adjacent unrelated tip;
- Inbox source display now reflects the actual selected tip/generated item.

