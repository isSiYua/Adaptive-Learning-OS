# Phase 2.1.1 Handoff - Automatic KnowledgeData Sync

Status: implemented  
Date: 2026-07-05  
Scope source: `Codex_Phase2_1_1_Auto_KnowledgeData_and_Inline_Draft_Workflow_Brief.md`

---

# 1. Purpose Of This Phase

Phase 2.1 created the first local-first KnowledgeData foundation, but it required explicit commands to initialize, rebuild, export, and back up the database.

Phase 2.1.1 makes KnowledgeData update during normal plugin usage without changing the mature Ask / Inbox / Apply workflow.

The central UX goal:

```text
User uses Ask / Inbox / Apply normally.
KnowledgeData updates automatically after verified Apply and later local note edits.
Manual rebuild remains available for repair.
```

The central safety rule:

```text
Obsidian live note remains source of truth.
KnowledgeData is an index/evidence layer, not the owner of note truth.
```

---

# 2. Implemented

## 2.1 Auto Initialize

Implemented in:

```text
src/main.ts
src/knowledge/KnowledgeDb.ts
```

Behavior:

- On plugin load, if `enableKnowledgeData` is true, the plugin opens or creates KnowledgeData.
- Schema bootstrap/migrations run through existing `KnowledgeDb.fromFileStore`.
- The DB is saved back to `.learning-os/knowledge/knowledge.sqlite`.
- No vault scan happens on startup.
- Failures are logged and do not block plugin load.

## 2.2 Auto Sync After Apply

Implemented in:

```text
src/main.ts
src/knowledge/KnowledgeSync.ts
```

Hook point:

```text
AdaptiveLearningOsPlugin.applyAskJob(...)
```

Behavior:

- Existing `applyAskJobProposal(...)` runs first.
- Existing Apply safety remains unchanged:
  - live note re-read,
  - per-note apply lock,
  - stale/live merge handling,
  - marker verification,
  - marker preservation,
  - rollback on verification/preservation failure.
- Only after Apply returns successfully does KnowledgeData sync run.
- Sync uses the verified live Markdown returned by Apply.
- Sync passes `result.verification.appliedItemIds` as the authoritative applied item list.
- The Ask job object passed to sync is augmented with those applied item IDs so job/item evidence can link correctly even if the original in-memory job object is stale.

Created/updated data:

- concepts from applied/live item titles using conservative normalization,
- items from final `learnos-item-id` markers,
- source refs for:
  - note,
  - clarification/generated item container,
  - Ask job,
- `apply/coverage` evidence,
- `ask/confusion` evidence where a job links to the item,
- conservative `manual_note/coverage` evidence for live final items.

Failure behavior:

- Apply remains successful if KnowledgeData sync fails.
- The failure is logged.
- A Notice tells the user manual rebuild is available.

## 2.3 Debounced Note-Level Sync

Implemented in:

```text
src/main.ts
src/knowledge/KnowledgeSync.ts
```

Behavior:

- Registers an Obsidian `vault.on("modify")` listener.
- Only handles `TFile` Markdown files.
- Only runs when:
  - `enableKnowledgeData` is true,
  - `trackKnowledgeDataManualEdits` is true,
  - note content contains final Learning OS markers.
- Debounces by note path.
- Uses a serial Promise queue for background KnowledgeData writes.
- Does not full-scan the vault.
- Does not call AI.
- Does not modify Markdown notes.

Signals:

- content hash changed for an already-known final item:
  - records `manual_edit/correction` evidence.
- previously active item in the same note no longer appears in scanned final markers:
  - marks item `missing`,
  - records `delete/stability` evidence.

Important implementation detail:

```text
Note-level sync uses markMissingItemsForNote(notePath, seenItemIds).
It does not use the full rebuild markMissingItems(seenItemIds).
```

This prevents a single modified note from marking items in all other notes as missing.

## 2.4 Show KnowledgeData Summary Command

Implemented in:

```text
src/knowledge/KnowledgeCommands.ts
src/main.ts
```

Command:

```text
Learning OS: Show KnowledgeData Global Summary
```

Shows:

- concepts count,
- total indexed items count,
- active items count,
- evidence count,
- source refs count,
- missing/deleted/orphan item count,
- last rebuild timestamp,
- last auto sync timestamp,
- latest compact evidence source/signal/item/summary records.

Scope:

```text
This is a whole-vault/project KnowledgeData summary, not a current-note summary.
```

Purpose:

- quick confirmation that automatic sync worked,
- manual QA without SQLite CLI,
- user-facing visibility into KnowledgeData growth.

## 2.5 Settings

Implemented in:

```text
src/types.ts
src/settings.ts
```

Settings:

```text
enableKnowledgeData: boolean
autoSyncKnowledgeDataAfterApply: boolean
trackKnowledgeDataManualEdits: boolean
```

Defaults:

```text
enableKnowledgeData = true
autoSyncKnowledgeDataAfterApply = true
trackKnowledgeDataManualEdits = true
```

Rationale:

- KnowledgeData sync after Apply is low risk because it runs after verified Apply.
- Manual edit/deletion tracking is local, deterministic, and marker/hash based.
- The user should not need to run rebuild after every normal action.

## 2.6 Inline Draft Parser Skeleton

Implemented in:

```text
src/ask/InlineDraftBlock.ts
tests/knowledgeAutoSync.test.mjs
```

Supported draft markers:

```text
learnos-draft-id
learnos-draft-job-id
learnos-draft-kind
learnos-draft-target-container-id
learnos-draft-created-at
learnos-draft-item-id
```

Behavior:

- Parses staged draft blocks.
- Parses draft items.
- Computes draft content hash.
- Uses separate draft marker family.
- KnowledgeData final marker detection ignores draft-only notes.
- KnowledgeData scanner ignores draft-only blocks.

Not implemented:

- no automatic draft insertion,
- no Inbox draft UI,
- no Apply-live-draft flow,
- no discard/replace draft flow,
- no job draft state persistence,
- no draft settings exposed in UI.

Reason:

The user asked to prioritize auto KnowledgeData sync and Show Summary. Full Inline Draft Item Staging changes the core "AI does not touch notes before Apply" behavior, so this handoff leaves it as a safe parser/design/test skeleton only.

---

# 3. Files Changed Or Added

## 3.1 Added

```text
src/knowledge/KnowledgeSync.ts
src/ask/InlineDraftBlock.ts
tests/knowledgeAutoSync.test.mjs
docs/context/PHASE_HANDOFFS/Phase2_1_1_Auto_KnowledgeData_Sync_Handoff.md
docs/context/CODEX_REPORTS/Phase2_1_1_Implementation_Report.md
```

## 3.2 Updated

```text
src/main.ts
src/settings.ts
src/types.ts
src/knowledge/KnowledgeCommands.ts
src/knowledge/KnowledgeRepository.ts
docs/KNOWLEDGE_DATA_FOUNDATION.md
docs/context/CURRENT_STATUS.md
docs/context/DECISIONS.md
```

---

# 4. Explicitly Not Implemented

Not implemented in Phase 2.1.1:

- Review Scheduler,
- Note Check AI scan,
- raw -> transform -> extract -> tutorial pipeline,
- PDF/PPT ingestion,
- vector DB,
- web app,
- cloud sync,
- automatic AI concept extraction,
- full-vault background scanning,
- automatic AI note mutation before Apply,
- full user-facing Inline Draft Item Staging workflow.

---

# 5. Manual QA Suggested

## 5.1 Apply Sync

1. Open an Obsidian note.
2. Ask about selected text.
3. Wait until Inbox job is Ready.
4. Apply proposal.
5. Run:

```text
Learning OS: Show KnowledgeData Global Summary
```

Expected:

- items count is nonzero or updated,
- evidence count increased,
- latest evidence references apply/ask/manual_note signals,
- no manual rebuild needed.

## 5.2 Manual Edit Sync

1. Edit visible text of an existing final `learnos-item-id` item.
2. Leave the hidden item marker intact.
3. Wait for debounce.
4. Run Show Summary or Export.

Expected:

- item content hash changes,
- `manual_edit/correction` evidence exists,
- item remains active.

## 5.3 Missing Marker Sync

1. Delete one final item marker from a note that still has at least one final Learning OS marker.
2. Wait for debounce.
3. Run Show Summary or Export.

Expected:

- deleted-marker item becomes `missing`,
- `delete/stability` evidence exists,
- items in other notes remain active.

## 5.4 Draft Safety

1. Insert a draft-only block using `learnos-draft-*` markers.
2. Run manual rebuild or trigger note sync.

Expected:

- draft is not indexed as KnowledgeData item,
- no final item is created,
- no committed KnowledgeData evidence is created from draft-only markers.

---

# 6. Verification Snapshot

After implementation:

```text
TypeScript: passed
Tests: 141 passed after acceptance polish
Production build: passed
```

The previous Phase 2.1 test count was 133. Phase 2.1.1 core added 7 tests; acceptance polish added 1 summary-format test.

Manual Obsidian QA after Phase 2.1.1 confirmed:

- Show Summary works as a global summary.
- Ask -> Apply records `ask/confusion` and `apply/coverage`.
- Manual edits record `manual_edit/correction`.
- Missing final item markers record item `missing` status and `delete/stability`.
- Deleting one item from a multi-item clarification block only marks that item missing.
- Draft markers remain ignored.
- No-marker notes remain ignored.
- No problematic repeated passive evidence loop was observed for `manual_note`, `apply`, `manual_edit`, or `delete`.

---

# 7. Next Phase Advice

If continuing Inline Draft Item Staging, use a dedicated brief.

Do not just turn the parser into auto insertion.

Required next design decisions:

- exact job draft state fields,
- whether draft insertion is manual or automatic,
- how Inbox displays "live draft exists",
- whether Apply reads the live draft instead of the textarea,
- how to discard drafts,
- how to preserve existing final items when draft targets a source with an existing clarification block,
- how cleanup should treat orphan draft blocks,
- how to handle source paragraph deletion while draft exists.

If continuing KnowledgeData instead, likely Phase 2.2 topics:

- concept hierarchy/context pack,
- better but still non-AI local concept grouping,
- richer export/debug views,
- note/project-level KnowledgeData summaries,
- eventual review scheduler inputs.
