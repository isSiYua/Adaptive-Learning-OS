# Phase 2.1.2B Natural Inline Draft Staging Handoff

Date: 2026-07-10
Status: finalized and baseline frozen
Scope owner: Adaptive Learning OS Obsidian plugin

---

# 1. Purpose Of This Phase

Phase 2.1.2B adds the first natural inline draft staging workflow on top of the existing Ask / Inbox / Apply system.

Before this phase, the Ask workflow was:

```text
select text
-> Ask Modal
-> background AI job
-> Learning OS Inbox proposal
-> user edits proposal in Inbox
-> Apply writes final clarification/generated-content block
-> KnowledgeData auto-sync indexes final markers
```

After this phase, when the new experimental setting is enabled, the workflow can also be:

```text
select text or Learning OS item
-> Ask Modal
-> background AI job
-> completed job creates a visible inline draft callout in the note
-> user edits or deletes that draft in Obsidian
-> Apply reads the live draft from the note
-> Apply commits final markers into the appropriate final block
-> draft is removed
-> KnowledgeData auto-sync indexes only final committed markers
```

The goal is not to make AI automatically write committed note content. The goal is to make the proposal review surface feel natural inside Obsidian while keeping explicit Apply as the commit boundary.

---

# 2. Implemented Behavior

## 2.1 Default-Off Setting

Added setting:

```text
Experimental inline draft staging
```

Type:

```ts
enableExperimentalInlineDraftStaging: boolean
```

Default:

```ts
false
```

This is important. Existing Ask / Inbox / Apply behavior remains unchanged unless the user explicitly turns the setting on.

## 2.2 Draft Creation After Completed Ask

When the setting is enabled and an Ask job reaches `completed`, `src/main.ts` calls:

```ts
stageInlineDraftForReadyJob(job)
```

That method:

1. opens the target Markdown note,
2. calls the pure staging helper,
3. writes a draft block only if staging is safe,
4. records compact inline draft metadata back into the Ask job JSON,
5. refreshes Inbox views.

If staging fails, the job remains usable from Inbox. The status becomes `fallback-inbox-only`.

## 2.3 Normal Note Ask

If the Ask source mode is:

```text
normal-note
```

and no existing target final block is identified, staging inserts a draft near the source selection/source block.

The draft operation is:

```text
add-item
```

The draft kind is usually:

```text
clarification
```

unless the merge proposal action is `generated-content`, in which case it is:

```text
generated-content
```

## 2.4 Ask Inside Existing Clarification Block

If the selection is physically inside a final clarification callout:

```markdown
> [!tip]- ...
> <!-- learnos-clarification-id: clar-... -->
```

staging creates a draft directly below that block.

Draft metadata:

```text
learnos-draft-kind: clarification
learnos-draft-operation: add-sibling-item
learnos-draft-target-container-id: clar-...
learnos-draft-target-item-id: item-...
learnos-draft-target-item-hash: ...
```

Apply behavior:

```text
read live draft
append draft item(s) to the same clarification block
preserve existing live items
remove draft after verified Apply
```

This phase intentionally does not rewrite the selected existing item.

## 2.5 Ask Inside Existing Generated-Content Block

If the selection is physically inside a generated-content callout:

```markdown
> [!note]- ...
> <!-- learnos-generated-id: gen-... -->
```

staging creates a draft directly below that generated block.

Draft metadata:

```text
learnos-draft-kind: generated-content
learnos-draft-operation: add-sibling-item
learnos-draft-target-container-id: gen-...
learnos-draft-target-item-id: item-...
learnos-draft-target-item-hash: ...
```

Apply behavior:

```text
read live draft
append draft item(s) to the same generated-content block
preserve existing live generated items
remove draft after verified Apply
```

This fixed the unnatural behavior from the abandoned 2.1.2A polish direction, where Ask inside generated/tip content could fall back to Inbox-only and Apply could be confused by unrelated generated content marker preservation.

## 2.6 Existing Live Draft Wins

If a completed job already has a live draft in the note:

```text
learnos-draft-job-id: <job id>
```

the system does not overwrite it.

Status:

```text
existing-live-draft
```

Meaning:

```text
Apply will use the live draft currently in the note.
```

This protects user edits inside the draft.

## 2.7 Deleted Draft Means No-Op

If the job has inline draft metadata but the corresponding draft block no longer exists in the note, Apply treats the draft as deleted.

Behavior:

- no final block is written,
- job is archived after recording deleted-draft status,
- Inbox refreshes,
- user gets a clear message.

This is intentionally conservative. Deleting the draft is interpreted as discarding the pending inline proposal.

## 2.8 Missing Target Block Preserves Draft

If a draft targets:

```text
clar-...
```

or:

```text
gen-...
```

but the final target block is missing at Apply time, Apply fails clearly.

Behavior:

- the draft remains in the note,
- final content is not created somewhere surprising,
- the job records `target-missing`,
- user can repair the note or use Inbox fallback intentionally later.

This matches the brief requirement:

```text
target container missing -> fail clearly and preserve draft
```

---

# 3. Draft Marker Model

Drafts use a separate marker namespace:

```text
learnos-draft-*
```

Implemented marker fields:

```markdown
> <!-- learnos-draft-id: draft-job-... -->
> <!-- learnos-draft-job-id: job-... -->
> <!-- learnos-draft-kind: clarification | generated-content -->
> <!-- learnos-draft-operation: add-item | add-sibling-item | update-item -->
> <!-- learnos-draft-target-container-id: clar-... | gen-... -->
> <!-- learnos-draft-target-item-id: item-... -->
> <!-- learnos-draft-target-item-hash: ... -->
> <!-- learnos-draft-source-block-hash: ... -->
> <!-- learnos-draft-created-at: ... -->
> <!-- learnos-draft-item-id: draft-item-... -->
```

Important invariant:

```text
Draft blocks do not contain final learnos-item-id markers.
```

Reason:

- KnowledgeData must ignore drafts.
- Cleanup must not treat drafts as committed items.
- A draft may be deleted or edited before Apply.
- The commit boundary remains verified Apply.

Final committed markers remain:

```text
learnos-clarification-id
learnos-generated-id
learnos-item-id
```

Marker type is determined by marker key, not by ID substring.

---

# 4. Important Code Changes

## 4.1 Types And Settings

Files:

```text
src/types.ts
src/settings.ts
```

Added:

```ts
enableExperimentalInlineDraftStaging: boolean
```

Added Ask job metadata:

```ts
askSourceMode?: AskSourceMode;
selectedLearningOsItem?: SelectionContext["selectedLearningOsItem"];
siblingLearningOsItems?: SelectionContext["siblingLearningOsItems"];
inlineDraft?: { ... };
```

Why this matters:

The source mode and selected Learning OS item context must survive from Ask Modal creation into background job completion so the onReady hook knows where the draft should be staged.

## 4.2 Draft Parsing And Rendering

File:

```text
src/ask/InlineDraftBlock.ts
```

Responsibilities:

- detect draft markers,
- parse all draft blocks,
- parse draft item chunks,
- render draft callouts,
- convert draft item IDs to final item IDs,
- remove a draft block after verified Apply.

Key exported helpers:

```ts
hasInlineDraftMarkers()
findAllInlineDraftBlocks()
findInlineDraftByJobId()
removeInlineDraftBlock()
renderInlineDraftBlock()
draftItemToClarificationItem()
```

## 4.3 Draft Staging And Apply Preparation

File:

```text
src/ask/InlineDraftStaging.ts
```

Responsibilities:

- choose whether staging is allowed,
- create normal-note draft blocks,
- create add-sibling drafts for clarification blocks,
- create add-sibling drafts for generated-content blocks,
- avoid overwriting existing live drafts,
- prepare live draft Apply,
- build edited visible Markdown from live target block plus live draft items,
- report compact Inbox status messages.

Key exported helpers:

```ts
stageInlineDraftForJob()
prepareInlineDraftApply()
inlineDraftStatusMessage()
withInlineDraftStatus()
findAllGeneratedAnnotations()
```

Design note:

`prepareInlineDraftApply()` does not directly mutate the note. It prepares a normal `editedVisibleMarkdown` payload and lets the existing `applyAskJobProposal()` path do the dangerous work: write, verify, rollback, and mark applied.

This keeps Phase 2.1.2B small and preserves the existing safety chain.

## 4.4 Main Plugin Wiring

File:

```text
src/main.ts
```

Changes:

- Ask job `onReady` now calls `stageInlineDraftForReadyJob(job)` after the existing Notice.
- `applyAskJob()` now checks whether a live inline draft should be used.
- If a live draft is ready, Apply uses that draft's live text.
- After successful verified Apply, the draft is removed.
- KnowledgeData sync runs after the final no-draft Markdown is available.

Important:

If inline draft staging is disabled or no draft exists, existing Apply behavior remains unchanged.

## 4.5 Ask Job Service

File:

```text
src/jobs/AskJobService.ts
```

Changes:

- persists `askSourceMode`,
- persists `selectedLearningOsItem`,
- persists `siblingLearningOsItems`,
- restores them into `contextFromJob()`.

This is necessary for background jobs, retries, and later staging logic.

## 4.6 Inbox Status

File:

```text
src/views/AskInboxView.ts
```

Change:

Ready detail warnings now include `inlineDraftStatusMessage()`.

Current compact statuses:

```text
draft created
existing live draft
draft deleted
unsupported selection
empty/no usable proposal
fallback Inbox-only
target missing
applied
```

## 4.7 Callout Boundary Fixes

Files:

```text
src/ask/ClarificationBlock.ts
src/jobs/ApplyAskJobProposal.ts
src/jobs/LiveClarificationState.ts
src/ask/InlineDraftBlock.ts
```

Problem:

Adjacent Obsidian callouts can be mistaken for one large block if the parser keeps walking through every quoted line.

This matters because Phase 2.1.2B intentionally creates a draft callout directly below a final clarification/generated-content callout.

Fix:

Top-level callout headers such as:

```markdown
> [!tip]-
> [!note]-
> [!todo]-
```

now stop block range expansion in the correct direction.

Result:

The final block and draft block are separate ranges.

---

# 5. Tests Added Or Updated

## 5.1 New Test File

```text
tests/inlineDraftStaging.test.mjs
```

Covers:

- normal-note Ask creates draft,
- draft contains no final `learnos-item-id`,
- draft parser reads metadata,
- Ask inside existing tip creates `add-sibling-item`,
- Apply preparation uses live edited draft content,
- Ask inside generated-content block creates generated add-sibling draft,
- deleted draft becomes no-op,
- missing target preserves draft,
- setting off leaves Inbox-only Apply unchanged.

## 5.2 Updated Paragraph Clarification Tests

File:

```text
tests/paragraphClarification.test.mjs
```

Added:

- clarification lookup does not swallow adjacent inline draft callout.

## 5.3 Updated Async Inbox Tests

File:

```text
tests/asyncInbox.test.mjs
```

Added:

- AskJobService persists Learning OS source mode and selected item context for later inline draft staging.

## 5.4 Existing KnowledgeData Tests Still Pass

Important existing coverage:

- draft-only `learnos-draft-*` blocks are ignored by KnowledgeData,
- note sync skips notes without final Learning OS markers,
- manual edits/deletions remain marker-based,
- Apply sync indexes final markers only.

---

# 6. Verification

Commands run with bundled Node runtime:

```text
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc -noEmit -skipLibCheck
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node esbuild.config.mjs production
```

Results:

```text
TypeScript: passed
Tests: 148 passed
Production build: passed
```

Environment note:

The shell did not have global `npm` or `node` in PATH. The bundled Codex desktop runtime was used. A direct `pnpm exec` attempt tried to perform dependency status/install cleanup and failed before executing because it wanted TTY confirmation. This was not a project code failure. Direct project-local `tsc`, tests, and production build passed.

---

# 7. Explicit Non-Goals Preserved

Not implemented:

- Phase 2.1.2B does not implement existing item inline draft rewrite.
- Phase 2.1.2B does not implement whole-block rewrite.
- Phase 2.1.2B does not implement multi-item rewrite.
- Phase 2.1.2B does not implement Review Scheduler.
- Phase 2.1.2B does not implement Note Check.
- Phase 2.1.2B does not implement Context Pack Builder.
- Phase 2.1.2B does not implement vector DB.
- Phase 2.1.2B does not implement PDF/PPT ingestion.
- Phase 2.1.2B does not implement web app/cloud sync.
- Phase 2.1.2B does not add new production dependencies.

---

# 8. Known Limitations

## 8.1 Inline Draft Staging Is Experimental

It is default off. Final targeted QA and live Obsidian smoke passed for the Phase 2.1.2B baseline.

The frozen behavior guard is:

```text
docs/ai-workflow/PHASE_GUARD_Phase2_1_2B.md
```

## 8.2 Only Add-Item/Add-Sibling Is Supported

Existing item update inline drafts are not implemented. Ask inside an existing item creates a sibling draft rather than rewriting the item.

## 8.3 Draft Status Is Compact

Inbox status messages are intentionally compact. A richer draft management UI is future work.

## 8.4 Generated Block Record Is Still Apply-Path Compatible

Generated-content Apply uses the existing Apply pipeline. This keeps verification and preservation behavior, but the long-term generated-content data model may need future polish if generated blocks become more complex than append-only item sets.

---

# 9. Recommended Next Step

The next phase has not started and should not begin without a separate brief.

Current candidate:

```text
KnowledgeData Foundation / Knowledge hierarchy and context pack planning
```

Do not broaden into scheduler, note checking, source ingestion, or context pack generation without a new brief.
