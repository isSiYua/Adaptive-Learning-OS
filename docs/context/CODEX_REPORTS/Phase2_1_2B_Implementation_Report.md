# Phase 2.1.2B Implementation Report

Date: 2026-07-05  
Branch/worktree status at start: clean  
Requested scope: Natural Inline Draft Staging  
Result: implemented, tested, built

---

# 1. User Request Summary

The user asked Codex to implement the new Phase 2.1.2B brief and specifically noted:

```text
请先安全 stash/revert 上一次失败改动，再按这份 brief 重新做。
不要做 whole-block rewrite、multi-item rewrite、Review、Note Check 或 Context Pack Builder。
```

Initial repo check showed:

```text
git status --short
```

was clean. There were no uncommitted failed Phase 2.1.2A polish changes to stash or revert. The implementation proceeded from the existing Phase 2.1.1 baseline.

---

# 2. Acceptance Summary

## 2.1 Implemented

Implemented:

- default-off inline draft staging setting,
- draft block parser/rendering with `learnos-draft-*` markers,
- background Ask completion hook that stages drafts when enabled,
- normal-note draft staging,
- Ask inside existing clarification block -> draft below that block,
- Ask inside existing generated-content block -> draft below that block,
- Apply reads live draft content,
- Apply merges draft back into the corresponding final block,
- Apply removes draft after verified final write,
- deleted draft becomes explicit no-op,
- missing target final block fails clearly and preserves draft,
- compact Inbox status messages,
- Ask job persistence of source mode and selected Learning OS item context,
- parser boundary fixes for adjacent final/draft callouts,
- tests and docs.

## 2.2 Preserved

Preserved:

- current Ask prompt behavior,
- Ask Modal behavior,
- Inbox behavior when setting is off,
- existing proposal editing in Inbox,
- existing Apply marker verification,
- existing Apply marker preservation,
- existing rollback behavior,
- KnowledgeData auto-sync after verified Apply,
- KnowledgeData ignoring draft markers,
- manual KnowledgeData Initialize/Rebuild/Export/Backup commands.

## 2.3 Not Implemented

Intentionally not implemented:

- whole-block rewrite,
- multi-item rewrite,
- existing item inline draft update,
- Review Scheduler,
- Note Check,
- Context Pack Builder,
- raw->transform->extract->tutorial pipeline,
- PDF/PPT ingestion,
- vector DB,
- web app,
- cloud sync,
- new production dependency.

---

# 3. Files Changed

## 3.1 Source Files

```text
src/types.ts
src/settings.ts
src/main.ts
src/jobs/AskJobService.ts
src/jobs/ApplyAskJobProposal.ts
src/jobs/LiveClarificationState.ts
src/views/AskInboxView.ts
src/ask/ClarificationBlock.ts
src/ask/InlineDraftBlock.ts
src/ask/InlineDraftStaging.ts
```

## 3.2 Test Files

```text
tests/inlineDraftStaging.test.mjs
tests/paragraphClarification.test.mjs
tests/asyncInbox.test.mjs
```

## 3.3 Documentation Files

```text
docs/context/CURRENT_STATUS.md
docs/context/DECISIONS.md
docs/context/MASTER_PLAN.md
docs/context/PHASE_HANDOFFS/Phase2_1_2B_Natural_Inline_Draft_Staging_Handoff.md
docs/context/CODEX_REPORTS/Phase2_1_2B_Implementation_Report.md
docs/context/Adaptive_Learning_OS_Context_Pack_After_Phase2_1_2B.md
docs/DATA_MODEL.md
docs/KNOWLEDGE_DATA_FOUNDATION.md
```

---

# 4. Implementation Details

## 4.1 Settings

Added:

```ts
enableExperimentalInlineDraftStaging: false
```

This keeps Phase 2.1.2B additive and non-disruptive.

## 4.2 Ask Job Data

Ask jobs now persist source context needed after background completion:

```ts
askSourceMode?: AskSourceMode;
selectedLearningOsItem?: SelectionContext["selectedLearningOsItem"];
siblingLearningOsItems?: SelectionContext["siblingLearningOsItems"];
inlineDraft?: { ... };
```

This matters because the onReady hook happens after the Ask Modal is gone. The job must know whether it came from:

```text
normal-note
clarification-item
generated-content-item
```

and, for item modes, which container/item was selected.

## 4.3 Draft Markers

Drafts use:

```text
learnos-draft-id
learnos-draft-job-id
learnos-draft-kind
learnos-draft-operation
learnos-draft-target-container-id
learnos-draft-target-item-id
learnos-draft-target-item-hash
learnos-draft-source-block-hash
learnos-draft-created-at
learnos-draft-item-id
```

Drafts do not use:

```text
learnos-item-id
```

until Apply commits the content.

## 4.4 Draft Creation

Implemented in:

```text
src/ask/InlineDraftStaging.ts
```

Primary function:

```ts
stageInlineDraftForJob()
```

Behavior:

- if setting off -> `fallback-inbox-only`,
- if no merge proposal -> `fallback-inbox-only`,
- if existing live draft -> `existing-live-draft`,
- if no usable proposal item -> `empty-proposal`,
- if unsafe selection/target -> `unsupported-selection`,
- otherwise insert a draft and return `created`.

## 4.5 Live Draft Apply

Implemented in:

```text
src/ask/InlineDraftStaging.ts
src/main.ts
```

Primary function:

```ts
prepareInlineDraftApply()
```

Behavior:

- if no inline draft metadata -> existing Apply path,
- if draft missing -> deleted/no-op path,
- if target missing -> fail and preserve draft,
- if draft exists -> create `editedVisibleMarkdown` from live target block plus live draft items,
- pass that payload into existing `applyAskJobProposal()`.

This design reuses:

- existing note lock,
- existing marker verification,
- existing marker preservation,
- existing rollback,
- existing job applied marking,
- existing KnowledgeData auto-sync.

## 4.6 Draft Removal

After successful verified Apply:

```text
draft is removed from the note
final result markdown is updated
KnowledgeData sync receives the no-draft final markdown
```

This prevents KnowledgeData from seeing draft-only content, even though KnowledgeData already ignores `learnos-draft-*` markers.

## 4.7 Adjacent Callout Boundary Fix

Why needed:

Phase 2.1.2B frequently produces:

```markdown
> [!tip]- ...
> <!-- learnos-clarification-id: clar-... -->
...

> [!todo]- Learning OS draft
> <!-- learnos-draft-id: draft-... -->
...
```

If parsers treat all adjacent quoted lines as one block, the final block and draft block can contaminate each other.

Fixed in:

```text
src/ask/ClarificationBlock.ts
src/jobs/ApplyAskJobProposal.ts
src/jobs/LiveClarificationState.ts
src/ask/InlineDraftBlock.ts
```

Top-level callout headers now stop block expansion appropriately.

---

# 5. Acceptance Criteria Mapping

## 5.1 "Tip/generated block Ask should generate inline draft"

Implemented.

Clarification item source mode:

```text
askSourceMode: clarification-item
```

creates:

```text
learnos-draft-kind: clarification
learnos-draft-operation: add-sibling-item
learnos-draft-target-container-id: clar-...
```

Generated-content item source mode:

```text
askSourceMode: generated-content-item
```

creates:

```text
learnos-draft-kind: generated-content
learnos-draft-operation: add-sibling-item
learnos-draft-target-container-id: gen-...
```

## 5.2 "Apply should merge back to corresponding block"

Implemented.

Apply preparation finds the target final block by:

```text
learnos-draft-target-container-id
```

and appends live draft item content to that block before sending it through the existing Apply pipeline.

## 5.3 "Do not overwrite live draft"

Implemented.

If a live draft already exists for a job, staging records:

```text
existing-live-draft
```

and does not write a replacement draft.

## 5.4 "Delete draft -> discard/no-op"

Implemented.

If the draft is gone at Apply time, Apply does not create committed content from stale job JSON.

## 5.5 "Edit draft -> Apply edited content"

Implemented and tested.

The test replaces draft text with:

```text
用户编辑后的 live draft 内容。
```

and verifies `prepareInlineDraftApply()` uses that live text.

## 5.6 "Target missing -> fail clearly and preserve draft"

Implemented and tested.

Apply returns `target-missing` preparation. `main.ts` records the status and throws a clear error without removing the draft.

## 5.7 "No final learnos-item-id inside drafts"

Implemented and tested.

Draft items use:

```text
learnos-draft-item-id
```

not:

```text
learnos-item-id
```

## 5.8 "KnowledgeData ignores drafts"

Preserved.

Existing KnowledgeData tests still pass:

```text
inline draft parser reads draft blocks and KnowledgeData ignores them
```

## 5.9 "No whole-block rewrite or multi-item rewrite"

Preserved.

This phase appends sibling items only for existing blocks. It does not rewrite arbitrary block content.

---

# 6. Tests

New/updated coverage:

```text
tests/inlineDraftStaging.test.mjs
tests/paragraphClarification.test.mjs
tests/asyncInbox.test.mjs
```

Total suite result:

```text
148 tests passed
0 failed
```

Important test cases:

- normal note Ask stages inline draft,
- draft has no final item markers,
- Ask inside existing tip creates add-sibling draft,
- Apply uses live edited draft content,
- Ask inside generated-content block creates add-sibling draft,
- deleted draft is no-op,
- target missing preserves draft,
- setting off leaves Inbox-only Apply unchanged,
- adjacent final block and draft callout do not merge into one parsed block,
- AskJobService persists source mode and selected item context.

---

# 7. Verification Commands And Results

The regular shell did not expose global `npm` or `node`, so verification used the bundled Codex desktop runtime.

TypeScript:

```text
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc -noEmit -skipLibCheck
```

Result:

```text
passed
```

Tests:

```text
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
```

Result:

```text
148 tests passed
```

Production build:

```text
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node esbuild.config.mjs production
```

Result:

```text
passed
```

Note:

An attempted direct bundled `pnpm exec tsc` invocation failed before running TypeScript because pnpm wanted to purge/reinstall `node_modules` and needed TTY confirmation:

```text
ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY
```

This was not treated as a code failure because project-local TypeScript, tests, and production build all passed.

---

# 8. Manual QA Recommendation

Manual Obsidian QA should still be done because inline draft staging is a UX workflow.

Suggested manual QA:

1. Enable `Experimental inline draft staging`.
2. Ask from normal paragraph text.
3. Confirm draft appears near source.
4. Edit draft text manually.
5. Apply from Inbox.
6. Confirm final clarification block contains edited text and draft is removed.
7. Ask from inside an existing `> [!tip]` item.
8. Confirm draft appears below tip and Apply appends back into same tip.
9. Ask from inside an existing generated `> [!note]` item.
10. Confirm draft appears below generated block and Apply appends back into same generated block.
11. Delete a draft and click Apply.
12. Confirm no final item is committed.
13. Delete target final block but keep draft and click Apply.
14. Confirm clear failure and draft remains.
15. Confirm KnowledgeData summary changes only after final Apply, not draft creation.

---

# 9. Next-Phase Notes

Do not assume Phase 2.1.2B means the whole inline draft system is complete.

Possible future phases:

```text
Phase 2.1.2B polish after manual QA
Phase 2.1.2C existing item inline draft update
Phase 2.2 Knowledge hierarchy and context pack generation
```

Only start one with a separate brief.
