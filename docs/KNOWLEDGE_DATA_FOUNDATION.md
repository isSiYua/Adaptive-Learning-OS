# KnowledgeData Foundation

Status: implemented in Phase 2.1, with automatic sync added in Phase 2.1.1 and draft-ignore behavior preserved through Phase 2.1.2B
Audience: developers and future ChatGPT/Codex conversations  
Related context docs:

- `docs/context/MASTER_PLAN.md`
- `docs/context/CURRENT_STATUS.md`
- `docs/context/DECISIONS.md`
- `docs/context/PHASE_HANDOFFS/Phase2_1_KnowledgeData_Handoff.md`
- `docs/context/PHASE_HANDOFFS/Phase2_1_1_Auto_KnowledgeData_Sync_Handoff.md`
- `docs/context/PHASE_HANDOFFS/Phase2_1_2B_Natural_Inline_Draft_Staging_Handoff.md`
- `docs/context/CODEX_REPORTS/Phase2_1_Implementation_Report.md`
- `docs/context/CODEX_REPORTS/Phase2_1_1_Implementation_Report.md`
- `docs/context/CODEX_REPORTS/Phase2_1_2B_Implementation_Report.md`

---

# 1. What KnowledgeData Is

KnowledgeData is the local-first structured learning-state layer of Adaptive Learning OS.

It is not the same thing as Ask job history.

Ask job history answers:

```text
What happened during a particular AI Ask interaction?
```

KnowledgeData answers:

```text
What concepts does the learner have records for?
Which Obsidian items refer to those concepts?
What compact evidence says the learner saw, asked about, corrected, or eventually mastered something?
Which notes, jobs, and source refs support that state?
```

The long-term goal is that future review and tutorial-generation systems can adapt to:

- what the user has seen,
- what the user asked about,
- what the user corrected manually,
- what the user has reviewed,
- what is stale,
- what is weak,
- what evidence supports each conclusion.

Phase 2.1 implements only the foundation.

Phase 2.1.1 makes that foundation useful during normal Ask / Inbox / Apply usage by adding safe automatic sync hooks. The live Obsidian note remains the source of truth. KnowledgeData indexes only verified final Learning OS markers and conservative local signals.

Phase 2.1.2B adds experimental inline draft staging to the Ask workflow. KnowledgeData behavior does not change: draft-only `learnos-draft-*` blocks are ignored. Only final `learnos-clarification-id`, `learnos-generated-id`, and `learnos-item-id` markers written by successful Apply enter KnowledgeData.

---

# 2. Why KnowledgeData Uses SQLite

The existing Ask workflow remains JSON/JSONL because Ask jobs are event-like, readable, and easy to audit.

KnowledgeData is different. It is long-term structured state with relationships:

```text
concepts
items
evidence
source_refs
concept_edges
future reviews
```

SQLite is better suited for:

- querying concepts,
- linking evidence to concepts/items/jobs,
- indexing note paths and statuses,
- future graph/hierarchy lookups,
- durable local-first storage in one file.

## 2.1 Why `sql.js`

Native SQLite packages such as `better-sqlite3` can be risky in Obsidian plugins because they require native module builds and compatible runtime packaging.

Phase 2.1 uses:

```text
sql.js
sql.js/dist/sql-asm.js
```

Reasons:

- no native module,
- SQLite-compatible database bytes,
- works in plugin bundle,
- ASM build avoids shipping a separate `.wasm` asset.

Build compatibility note:

`sql.js/dist/sql-asm.js` references `node:fs` and `node:crypto`. The esbuild config externalizes `node:`-prefixed builtins so production bundling succeeds.

---

# 3. Storage Layout

KnowledgeData lives in the configured Learning OS data folder, defaulting to:

```text
.learning-os/knowledge/
```

Expected layout:

```text
.learning-os/
├── ask-jobs/
├── clarifications/
├── logs/
├── archive/
├── backups/
├── generated/
└── knowledge/
    ├── knowledge.sqlite
    ├── exports/
    │   ├── concepts.json
    │   ├── knowledge_summary.json
    │   └── mastery_summary.md
    └── backups/
        └── knowledge-YYYYMMDD-HHMMSS.sqlite
```

Important:

- Ask jobs are not migrated to SQLite.
- Clarification JSON records are not migrated to SQLite.
- KnowledgeData indexes compact summaries and links.
- Full current note text remains in Obsidian notes.
- Full raw Ask history remains in existing JSON/JSONL files.

---

# 4. Commands

## 4.1 Initialize KnowledgeData

Command:

```text
Learning OS: Initialize KnowledgeData
```

Behavior:

- creates `.learning-os/knowledge/`,
- creates `.learning-os/knowledge/exports/`,
- creates `.learning-os/knowledge/backups/`,
- creates or opens `.learning-os/knowledge/knowledge.sqlite`,
- runs schema bootstrap/migrations,
- writes schema metadata.

This command does not scan notes and does not modify note content.

## 4.2 Rebuild KnowledgeData Index

Command:

```text
Learning OS: Rebuild KnowledgeData Index
```

Behavior:

- opens/initializes the DB,
- scans current Markdown notes through Obsidian APIs,
- detects Learning OS clarification/generated-content blocks,
- parses `learnos-item-id` items,
- creates or updates concept records from item titles,
- creates or updates item records,
- creates source references,
- creates compact evidence,
- links existing Ask jobs where item IDs match,
- detects manual edits through content hash changes,
- marks previously active items as missing if live markers disappear,
- updates `meta.last_rebuild_at`,
- writes the DB back to `knowledge.sqlite`.

This command is explicit and user-triggered.

It does not:

- call AI,
- scan arbitrary notes semantically,
- parse PDFs/PPTs,
- infer a full ontology,
- modify Markdown notes,
- update mastery as if coverage were mastery.

## 4.3 Export KnowledgeData Summary

Command:

```text
Learning OS: Export KnowledgeData Summary
```

Writes:

```text
.learning-os/knowledge/exports/concepts.json
.learning-os/knowledge/exports/knowledge_summary.json
.learning-os/knowledge/exports/mastery_summary.md
```

Purpose:

- make DB contents inspectable,
- support debugging,
- support future migration,
- give humans a readable summary.

## 4.4 Backup KnowledgeData

Command:

```text
Learning OS: Backup KnowledgeData
```

Writes:

```text
.learning-os/knowledge/backups/knowledge-YYYYMMDD-HHMMSS.sqlite
```

If the DB does not exist yet, the command initializes it first.

## 4.5 Show KnowledgeData Summary

Command:

```text
Learning OS: Show KnowledgeData Global Summary
```

Behavior:

- opens or initializes KnowledgeData,
- reports whole-vault/project KnowledgeData counts,
- counts concepts, evidence, and source refs,
- splits item counts into total indexed items, active items, and missing/deleted/orphan items,
- reads `meta.last_rebuild_at`,
- reads `meta.last_auto_sync_at`,
- shows the latest compact evidence records in an Obsidian Notice.

The command ID remains `show-knowledge-data-summary`, but the user-facing command label and notice title make the scope explicit.

Definitions:

```text
Total indexed items = all rows in the items table.
Active items = items with status active.
Missing/deleted items = items with status missing, deleted, or orphan.
```

---

# 4.6 Inline Draft Staging And KnowledgeData

Phase 2.1.2B intentionally keeps inline draft staging separate from KnowledgeData.

Drafts use markers such as:

```markdown
> <!-- learnos-draft-id: draft-job-... -->
> <!-- learnos-draft-kind: clarification -->
> <!-- learnos-draft-operation: add-sibling-item -->
> <!-- learnos-draft-target-container-id: clar-... -->
> <!-- learnos-draft-item-id: draft-item-... -->
```

These markers are proposals, not committed knowledge.

KnowledgeData scanners and sync hooks must continue to ignore them because:

- the user may delete the draft,
- the user may edit the draft before Apply,
- a draft may target a missing final block,
- a draft does not prove coverage or mastery,
- a draft does not have final `learnos-item-id` identity yet.

After Apply succeeds, the final note contains committed markers:

```markdown
> <!-- learnos-clarification-id: clar-... -->
> <!-- learnos-generated-id: gen-... -->
> <!-- learnos-item-id: item-... -->
```

At that point the existing Phase 2.1.1 KnowledgeData auto-sync indexes from the verified live Markdown returned by Apply.

Scope:

```text
This is a global KnowledgeData summary for the whole local vault/project.
It is not scoped to the currently open note.
```

Purpose:

- quick user-facing confirmation that Apply/manual-edit/deletion sync changed KnowledgeData,
- lightweight QA without requiring SQLite CLI access,
- daily inspection command while KnowledgeData is still early.

This command does not scan notes and does not modify notes.

Future optional command:

```text
Learning OS: Show Current Note KnowledgeData Summary
```

This is intentionally not implemented in Phase 2.1.1 Acceptance Polish.

---

# 4.6 Automatic Sync In Phase 2.1.1

Phase 2.1.1 adds lightweight event-driven sync.

Settings:

```text
Enable KnowledgeData: true
Auto sync KnowledgeData after Apply: true
Track manual edits/deletions in Learning OS items: true
```

## 4.6.1 Auto Initialize

On plugin load, if KnowledgeData is enabled, the plugin opens/creates:

```text
.learning-os/knowledge/knowledge.sqlite
```

and saves the bootstrapped schema.

This is intentionally silent unless initialization fails.

It does not scan the vault.

## 4.6.2 Sync After Apply

After existing Apply logic succeeds, including marker verification and preservation checks, the plugin calls the KnowledgeData note sync hook with the verified live Markdown returned by Apply.

It indexes:

- final `learnos-clarification-id` blocks,
- final `learnos-generated-id` blocks,
- final `learnos-item-id` items,
- concept candidates from item titles,
- item content hashes,
- note/source/item/job references,
- `apply/coverage` evidence for applied item IDs,
- `ask/confusion` evidence when the applied job links to the item.

It does not:

- alter the Apply decision,
- retry Apply,
- mark Apply failed if KnowledgeData sync fails,
- call AI,
- write new note content,
- index staged drafts.

If KnowledgeData sync fails after Apply, the note/apply result still remains valid. The plugin logs the sync failure and shows a notice that manual rebuild is available.

## 4.6.3 Debounced Note-Level Sync

The plugin listens for Obsidian vault modify events.

It syncs only when all are true:

- KnowledgeData is enabled,
- manual edit/deletion tracking is enabled,
- the modified file is Markdown,
- the file content contains final Learning OS markers.

It does not scan the full vault in the background.

It debounces per note path. Rapid repeated edits to the same note collapse into one sync task.

The note-level sync:

- indexes current final live items in the note,
- compares content hashes against previous KnowledgeData item hashes,
- records `manual_edit/correction` evidence when a known item changed,
- marks previously active items in the same note as `missing` if their marker disappeared,
- records conservative `delete/stability` evidence for missing markers.

Important scope rule:

```text
Single-note sync only marks items missing within that same note.
It does not mark items from other notes missing.
```

This avoids the Phase 2.1 rebuild-only behavior from accidentally treating a single edited note as a full-vault scan.

## 4.6.4 Source Of Truth

Obsidian live Markdown remains primary.

KnowledgeData is an index and evidence layer.

If live note content changes, later sync updates KnowledgeData. If KnowledgeData is stale, manual rebuild is available.

## 4.6.5 Manual Obsidian QA Results

Manual Obsidian QA after Phase 2.1.1 confirmed:

- Global Summary command displays KnowledgeData counts.
- Ask -> Apply creates `ask/confusion` and `apply/coverage` evidence.
- Editing visible text while keeping final item markers creates `manual_edit/correction` evidence.
- Deleting a final item marker marks that item `missing` and creates `delete/stability` evidence.
- Deleting one item inside a multi-item clarification block marks only that item missing; sibling items with markers remain active.
- Draft-only `learnos-draft-*` blocks are ignored by KnowledgeData.
- Editing a Markdown note with no final Learning OS markers does not change KnowledgeData counts.
- Duplicate passive sync loops were not observed for `manual_note`, `apply`, `manual_edit`, or `delete` evidence.

Sync failure isolation by intentionally corrupting or locking the DB was not manually tested, because that would be destructive/risky in a real vault. It remains covered by code structure and the manual rebuild repair path.

---

# 5. Schema

Schema version:

```text
1
```

Tables:

- `meta`
- `concepts`
- `concept_edges`
- `items`
- `evidence`
- `source_refs`
- `reviews`

The `reviews` table is future-ready only. No scheduler exists in Phase 2.1.

## 5.1 `meta`

Purpose:

- schema version,
- created/updated timestamps,
- rebuild bookkeeping.

Fields:

```sql
key TEXT PRIMARY KEY
value TEXT NOT NULL
```

Known keys:

- `schema_version`
- `created_at`
- `updated_at`
- `last_rebuild_at`

## 5.2 `concepts`

Purpose:

- represent knowledge nodes.

Important fields:

- `id`
- `name`
- `aliases_json`
- `abstraction_level`
- `coverage`
- `mastery`
- `confidence`
- `status`
- `summary`
- `strong_points_json`
- `weak_points_json`
- `unknown_points_json`
- `created_at`
- `updated_at`
- `last_touched_at`

Semantic rule:

```text
abstraction_level = where the concept lives in a hierarchy
mastery = how well the learner knows it
```

Do not collapse these into one field.

## 5.3 `concept_edges`

Purpose:

- graph/hierarchy relations.

Fields:

- `parent_id`
- `child_id`
- `relation_type`
- `weight`
- `created_at`

Potential relation types:

- `parent_child`
- `part_of`
- `prerequisite`
- `related`
- `variant_of`
- `contrasts_with`

Phase 2.1 creates the table but does not infer edges.

## 5.4 `items`

Purpose:

- index live or known Obsidian-side Learning OS items.

Fields:

- `item_id`
- `container_id`
- `container_type`
- `note_path`
- `title`
- `content_hash`
- `content_summary`
- `concept_ids_json`
- `status`
- `created_at`
- `updated_at`
- `last_seen_at`

Container types:

- `clarification`
- `generated-content`
- `manual-note`
- `unknown`

Statuses:

- `active`
- `missing`
- `deleted`
- `archived`
- `orphan`

Important:

The table stores identity, location, hash, title, and short summary. It should not duplicate full note content.

## 5.5 `evidence`

Purpose:

- compact learning signals.

Fields:

- `id`
- `concept_id`
- `source_type`
- `signal_type`
- `strength`
- `confidence`
- `summary`
- `note_path`
- `item_id`
- `job_id`
- `review_id`
- `source_ref_id`
- `created_at`

Source types include:

- `ask`
- `apply`
- `manual_note`
- `manual_edit`
- `delete`
- `review`
- `self_explanation`
- `ai_check`
- `tutorial_generation`
- `import`
- `rebuild`

Signal types include:

- `coverage`
- `confusion`
- `correction`
- `mastery`
- `forgetting`
- `misconception_candidate`
- `stability`

Important:

Evidence should be compact. Do not store full prompts, full AI answers, or full notes here.

## 5.6 `source_refs`

Purpose:

- keep references to notes, Ask jobs, raw/tutorial files, or future external sources without requiring those sources to exist forever.

Fields:

- `id`
- `concept_id`
- `source_type`
- `path`
- `source_hash`
- `title`
- `status`
- `last_seen_at`

If a source disappears, KnowledgeData should mark source/item state missing/deleted but preserve concepts and evidence.

## 5.7 `reviews`

Purpose:

- future review system storage.

Phase 2.1 only creates the table.

---

# 6. Indexing Semantics In Phase 2.1

## 6.1 Concept Creation

The current indexer creates concept candidates from item titles.

Examples:

```text
"NMS" -> "NMS"
"YOLOv3 输出层" -> "YOLOv3 输出层"
"梯度是啥？" -> "梯度"
```

This is intentionally conservative.

The system does not use AI to extract concepts from arbitrary notes in Phase 2.1.

## 6.2 Concept IDs

Current strategy:

- ASCII-ish concepts get slug + short hash.
- Local/unicode concepts get `concept-<hash>` fallback.

This avoids pretending to translate terms that the system cannot reliably translate.

## 6.3 Evidence Generated By Rebuild

Current mappings:

```text
live Learning OS item
-> sourceType = manual_note
-> signalType = coverage
```

```text
Ask job linked to indexed item
-> sourceType = ask
-> signalType = confusion
```

```text
content hash changed since last index
-> sourceType = manual_edit
-> signalType = correction
```

```text
previously active item no longer found
-> sourceType = delete
-> signalType = stability
```

These are low-confidence/conservative signals. They should not imply strong mastery.

---

# 7. What This Phase Does Not Do

Phase 2.1 does not implement:

- review scheduling,
- spaced repetition,
- mastery algorithm,
- AI Note Check,
- PDF/PPT parsing,
- raw -> transform -> extract -> tutorial pipeline,
- vector database,
- web app,
- cloud sync,
- Anki integration,
- automatic full-vault AI extraction,
- background full-vault indexing on startup,
- per-keystroke edit tracking,
- migration of Ask jobs to SQLite primary storage.

---

# 8. Developer Module Map

KnowledgeData code:

```text
src/knowledge/KnowledgeTypes.ts
src/knowledge/KnowledgeDb.ts
src/knowledge/KnowledgeSchema.ts
src/knowledge/KnowledgeMigrations.ts
src/knowledge/KnowledgeRepository.ts
src/knowledge/KnowledgeMarkdownScanner.ts
src/knowledge/KnowledgeIndexer.ts
src/knowledge/KnowledgeExport.ts
src/knowledge/KnowledgeBackup.ts
src/knowledge/KnowledgeCommands.ts
src/knowledge/ConceptNormalize.ts
src/knowledge/sql-js-asm.d.ts
```

Command registration:

```text
src/main.ts
```

Storage helpers:

```text
src/storage/FileStore.ts
```

Tests:

```text
tests/knowledgeData.test.mjs
```

---

# 9. Verification

Latest successful verification:

```text
TypeScript: passed
Tests: 133 passed
Production build: passed
```

Direct commands used in the Codex environment:

```text
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc -noEmit -skipLibCheck
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node esbuild.config.mjs production
```

Environment note:

`pnpm build` may attempt dependency status/install behavior before running the build script in this Codex sandbox. If registry access is blocked, use the direct underlying commands and report the limitation.

---

# 10. Suggested Manual QA

In Obsidian:

1. Enable plugin.
2. Run `Learning OS: Initialize KnowledgeData`.
3. Confirm `.learning-os/knowledge/knowledge.sqlite`.
4. Create or use a note with a Learning OS clarification item.
5. Run `Learning OS: Rebuild KnowledgeData Index`.
6. Confirm note content did not change.
7. Run `Learning OS: Export KnowledgeData Summary`.
8. Inspect exported JSON/Markdown.
9. Run `Learning OS: Backup KnowledgeData`.
10. Confirm timestamped backup exists.
11. Verify Ask / Inbox / Apply still works normally.
