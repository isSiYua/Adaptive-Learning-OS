# Codex Implementation Report - Phase 2.1.1 Automatic KnowledgeData Sync

Date: 2026-07-05  
Repo: `/Users/issiyua/Documents/Adaptive_Learning_OS`  
Task: Implement Phase 2.1.1 Automatic KnowledgeData Sync, prioritizing auto sync and Show Summary. Add only safe Inline Draft parser/design/tests if full staging is too large.

---

# 1. Executive Summary

Implemented Phase 2.1.1 as a conservative additive layer on top of the existing Phase 2.1 KnowledgeData foundation.

The plugin now:

- auto-initializes KnowledgeData on load when enabled,
- syncs KnowledgeData after a successful verified Apply,
- records compact apply/ask/manual note evidence,
- tracks manual edits by content hash,
- detects missing item markers within the modified note,
- provides a user-facing `Learning OS: Show KnowledgeData Global Summary` command,
- exposes three KnowledgeData settings,
- keeps Initialize/Rebuild/Export/Backup commands,
- adds draft parser/test skeleton without enabling a draft workflow.

Ask prompt behavior, Inbox behavior, merge proposal semantics, model routing, and Apply safety rules were not changed.

---

# 2. Implementation Details

## 2.1 Knowledge Sync Core

Added:

```text
src/knowledge/KnowledgeSync.ts
```

Main exports:

```ts
syncKnowledgeDataForNote(db, input)
noteHasFinalLearningOsMarkers(markdown)
KnowledgeNoteSyncDebouncer
```

`syncKnowledgeDataForNote` is the shared core for:

- Apply sync,
- note modify sync.

It scans only final Learning OS markers:

- `learnos-clarification-id`,
- `learnos-generated-id`,
- `learnos-item-id`.

It does not scan draft markers as final knowledge.

It writes:

- concepts,
- items,
- source refs,
- evidence,
- meta `last_auto_sync_at`,
- meta `last_auto_sync_mode`,
- meta `last_auto_sync_note_path`.

Evidence added:

```text
apply / coverage
ask / confusion
manual_note / coverage
manual_edit / correction
delete / stability
```

## 2.2 Repository Support

Updated:

```text
src/knowledge/KnowledgeRepository.ts
```

Added:

```ts
markMissingItemsForNote(notePath, activeItemIds)
latestEvidence(limit)
```

Changed:

```text
counts().missingItems
```

It now counts:

```text
status in ('missing', 'deleted', 'orphan')
```

This better matches the Show Summary wording.

## 2.3 Plugin Integration

Updated:

```text
src/main.ts
```

Added:

- auto-init on plugin load,
- `vault.on("modify")` note sync listener,
- per-note debounced sync,
- serialized background KnowledgeData task queue,
- Apply hook after `applyAskJobProposal(...)` succeeds,
- command registration for Show Summary.

Important safety property:

```text
KnowledgeData sync happens after Apply verification.
KnowledgeData sync failure does not roll back or invalidate Apply.
```

## 2.4 Settings

Updated:

```text
src/types.ts
src/settings.ts
```

Added:

```ts
enableKnowledgeData: boolean;
autoSyncKnowledgeDataAfterApply: boolean;
trackKnowledgeDataManualEdits: boolean;
```

Defaults:

```text
true / true / true
```

The Settings tab shows toggles for all three.

## 2.5 Show Summary Command

Updated:

```text
src/knowledge/KnowledgeCommands.ts
```

Added command function:

```ts
showKnowledgeDataSummary(context)
```

Registered command:

```text
Learning OS: Show KnowledgeData Global Summary
```

Displays:

- concepts,
- total indexed items,
- active items,
- missing/deleted items,
- evidence,
- source refs,
- last rebuild,
- last auto sync,
- latest compact evidence records.

Scope:

```text
The command is a Global Summary for the whole vault/project, not the current note.
```

Definitions:

```text
Total indexed items = all rows in items.
Active items = status active.
Missing/deleted items = status missing/deleted/orphan.
```

Acceptance polish kept the existing command ID but clarified the displayed command name and notice title.

## 2.6 Inline Draft Parser Skeleton

Added:

```text
src/ask/InlineDraftBlock.ts
```

Implemented:

- draft block detection,
- draft metadata parsing,
- draft item parsing,
- draft content hash.

Supported markers:

```text
learnos-draft-id
learnos-draft-job-id
learnos-draft-kind
learnos-draft-target-container-id
learnos-draft-created-at
learnos-draft-item-id
```

Not connected to:

- Ask job lifecycle,
- Inbox UI,
- note insertion,
- Apply conversion,
- discard/cleanup.

Reason:

Full Inline Draft Item Staging is product-sensitive because it allows pending AI content to appear in notes before Apply. The user explicitly allowed parser/design/tests only if full scope was too large.

---

# 3. Tests Added

Added:

```text
tests/knowledgeAutoSync.test.mjs
```

New coverage:

- KnowledgeData auto init creates and reopens SQLite store.
- Sync after Apply upserts live item, concept, source refs, apply evidence, and ask evidence.
- Debounced note-level sync coalesces repeated note modify events.
- Manual edit hash changes produce `manual_edit` evidence.
- Missing known marker detection is note-scoped and does not mark other notes missing.
- Notes without final Learning OS markers are skipped.
- Inline draft parser reads draft blocks and KnowledgeData ignores draft-only blocks.

Total test count after this phase:

```text
141 passed after acceptance polish
```

Previous Phase 2.1 count:

```text
133 passed
```

Acceptance polish added coverage for:

- global summary wording,
- total/active/missing item count labels,
- latest evidence list formatting.

---

# 4. Verification Commands Run

TypeScript:

```bash
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc -noEmit -skipLibCheck
```

Result:

```text
passed
```

Tests:

```bash
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
```

Result:

```text
141 passed
0 failed
```

Production build:

```bash
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node esbuild.config.mjs production
```

Result:

```text
passed
```

---

# 5. Explicit Non-Goals Confirmed

Not implemented:

- Review Scheduler,
- Note Check,
- AI note scan,
- AI concept extraction,
- raw/transform/extract/tutorial pipeline,
- PDF/PPT ingestion,
- vector DB,
- web app,
- cloud sync,
- full-vault automatic background scan,
- automatic draft insertion into notes,
- automatic AI note mutation before Apply.

---

# 6. Risk Notes

## 6.1 Apply Remains Source Of Commit

KnowledgeData sync now runs automatically after Apply, but it must remain downstream.

Future contributors should not move KnowledgeData writes before marker verification.

## 6.2 Note Modify Sync Is Marker-Gated

The modify listener reads Markdown content first and skips notes without final Learning OS markers.

This avoids indexing arbitrary note text.

## 6.3 All-Marker Deletion Edge Case

The current note-level sync skips a note if it contains no final Learning OS markers at all.

This means:

- deleting one item marker while another final marker remains can be detected,
- deleting all final Learning OS markers from a note may require manual rebuild or cleanup to detect globally.

This is an intentional conservative tradeoff in Phase 2.1.1 because the brief also required no sync for notes without Learning OS markers and no full-vault background scan.

## 6.4 Evidence Is Conservative

Coverage/confusion/correction/stability evidence is not mastery.

Future review scheduler work must not interpret Phase 2.1.1 evidence as proof of long-term retention.

## 6.5 Manual Obsidian QA Results

The user manually tested Phase 2.1.1 in Obsidian after the implementation pass.

Confirmed:

- Show Summary works.
- Ask -> Apply records `ask/confusion` and `apply/coverage` evidence.
- Manual item edits record `manual_edit/correction`.
- Deleting final item markers marks items `missing` and records `delete/stability`.
- Deleting one item inside a multi-item clarification block marks only that item missing.
- Draft markers are ignored by KnowledgeData.
- Editing a no-marker Markdown note does not change KnowledgeData counts.
- No problematic repeated passive sync evidence was observed for `manual_note`, `apply`, `manual_edit`, or `delete`.

Not manually stress-tested:

- KnowledgeData sync failure isolation by corrupting/locking the DB. This remains code/test-level confidence and should not be tested destructively in the user's vault.

## 6.6 Acceptance Polish Result

Acceptance polish changed:

- Summary wording from generic `KnowledgeData` to `KnowledgeData Global Summary`.
- Command label from `Learning OS: Show KnowledgeData Summary` to `Learning OS: Show KnowledgeData Global Summary`.
- Item counts from ambiguous `Items` to:
  - `Total indexed items`,
  - `Active items`,
  - `Missing/deleted items`.
- Latest evidence from one latest row to the latest compact evidence list.

Deferred:

- `Learning OS: Show Current Note KnowledgeData Summary`.

Reason:

The current command represents vault/project-level KnowledgeData. A current-note scoped view is useful but should be a separate small UX enhancement rather than hidden inside this polish task.

---

# 7. Suggested Next Steps

## Option A - Complete Inline Draft Item Staging

Needs a dedicated brief.

Must define:

- AskJob draft fields,
- draft insertion policy,
- live draft source-of-truth behavior,
- Inbox UX for draft exists / apply draft / discard draft / replace draft,
- cleanup behavior,
- Apply conversion from draft markers to final markers,
- KnowledgeData sync after draft Apply only.

## Option B - KnowledgeData Phase 2.2

Possible scope:

- richer summary/debug export,
- concept hierarchy candidate views,
- context pack generation,
- note/project-level KnowledgeData summaries,
- stronger source_ref browsing,
- preparation for Review Scheduler.

## Option C - Manual Obsidian QA

Before larger features:

- run plugin in Obsidian,
- Apply a real Ask job,
- use Show Summary,
- edit a final item,
- delete one item marker,
- export summary,
- inspect `.learning-os/knowledge/knowledge.sqlite`.
