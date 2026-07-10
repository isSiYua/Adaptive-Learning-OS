# Adaptive Learning OS - Current Status

Version: 2026-07-10 after Phase 2.1.2B finalization
Purpose: quick but detailed status file for new ChatGPT/Codex conversations.

---

# 1. Executive Summary

Adaptive Learning OS is currently an Obsidian plugin with a mature Ask / Inbox / Apply workflow, a local-first KnowledgeData foundation that syncs automatically during normal plugin usage, and a finalized Phase 2.1.2B inline draft staging baseline.

The project is no longer just a selected-text Ask demo.

Current state:

```text
Phase 1 Ask core: implemented
Phase 1.5 model routing: implemented
Phase 2.1 KnowledgeData foundation: implemented
Phase 2.1.1 Automatic KnowledgeData Sync: implemented
Phase 2.1.2B Natural Inline Draft Staging: finalized, default off, baseline frozen
Review Scheduler: not implemented
Note Check AI scan: not implemented
Learning Project Pipeline: not implemented
PDF/PPT ingestion: not implemented
Vector DB: not implemented
Web app/cloud sync: not implemented
```

The next development direction is not started. The only current candidate is:

```text
KnowledgeData Foundation / Knowledge hierarchy and context pack planning
```

It must receive its own brief before Codex starts coding.

---

# 2. Implemented User-Facing Plugin Capabilities

## 2.1 Ask From Selected Text

Users can:

- select text in an Obsidian Markdown note,
- right-click `Ask Learning OS about selection`,
- use the floating Ask button,
- open Ask Modal,
- enter a custom question,
- choose Auto / Flash / Pro model behavior,
- preview prompt content,
- submit a background Ask job.

## 2.2 Background Ask Jobs

Ask jobs support:

- queued,
- running,
- completed,
- failed,
- applied,
- archived,
- cancelled.

Jobs are stored as JSON:

```text
.learning-os/ask-jobs/<job_id>.json
```

Job status logs are JSONL:

```text
.learning-os/logs/ask-jobs-YYYY-MM.jsonl
```

## 2.3 Learning OS Inbox

Inbox supports:

- running jobs,
- ready jobs,
- failed jobs,
- history jobs,
- Markdown/LaTeX preview,
- proposal editing,
- Apply,
- Regenerate,
- Regenerate with Pro,
- Retry with Pro,
- Re-merge,
- Copy raw,
- Copy parsed,
- Copy proposal,
- Open source,
- Delete job record.

## 2.4 Clarification Blocks

Applied explanatory learning content is written as Obsidian callouts:

```markdown
> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-... -->
>
> <!-- learnos-item-id: item-... -->
> **Concept title** Explanation.
```

Each source paragraph should map to one clarification block.

Each block can contain multiple items.

## 2.5 Generated Content Blocks

Explicit generation requests use:

```markdown
> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-... -->
>
> <!-- learnos-item-id: item-... -->
> **Title** Generated content.
```

This keeps generated examples/stories/content separate from "my understanding".

## 2.6 Apply Safety

Apply is live-note-aware:

- re-read latest note,
- lock per note,
- parse live blocks,
- merge by item ID,
- preserve unrelated live items,
- verify expected markers after write,
- fail instead of fake-applying when markers are missing.

## 2.6.1 Experimental Inline Draft Staging

Phase 2.1.2B added a default-off setting:

```text
Experimental inline draft staging
```

When enabled, a completed Ask job can create a local draft callout in the note. The draft is meant for human editing before Apply.

Draft marker family:

```markdown
> <!-- learnos-draft-id: draft-... -->
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

Important rules:

- drafts do not contain final `learnos-item-id` markers,
- KnowledgeData ignores draft-only markers,
- Apply reads the live draft from the note if it exists,
- user edits inside the draft are preserved and committed on Apply,
- deleting a draft means Apply becomes a no-op for that draft job,
- missing target final blocks fail clearly and preserve the draft,
- normal-note Ask can stage near the selected source,
- Ask inside a `tip` clarification block stages under that block and Apply merges back into that same block,
- Ask inside a generated-content `note` block stages under that block and Apply merges back into that same generated block.

Phase 2.1.2B intentionally implements add-item/add-sibling staging only. It does not implement whole-block rewrite, multi-item rewrite, existing-item update inline drafts, Review, Note Check, or Context Pack Builder.

## 2.7 Cleanup

Cleanup detects:

- orphan clarification records,
- dangling markers,
- orphan jobs,
- archived jobs eligible for purge,
- applied jobs missing live markers,
- deleted item markers versus edited item text.

Cleanup is explicit and preview-based.

## 2.8 Model Routing

Implemented:

- OpenAI-compatible provider,
- Anthropic-compatible provider,
- DeepSeek preset,
- default Ask model,
- deep model,
- model routing mode,
- Auto / Flash / Pro selection,
- no silent expensive upgrade.

---

# 3. Implemented KnowledgeData Foundation

Phase 2.1 added:

```text
.learning-os/knowledge/
├── knowledge.sqlite
├── exports/
└── backups/
```

## 3.1 Dependency

Added:

```json
"sql.js": "^1.14.1"
```

Dev type package:

```json
"@types/sql.js": "^1.4.11"
```

Rationale:

- SQLite requested for long-term structured KnowledgeData.
- Native SQLite packages are risky in Obsidian plugin runtime.
- `sql.js` provides SQLite without native module bundling.
- ASM build avoids separate `.wasm` deployment complexity.

## 3.2 Knowledge Commands

Commands added:

```text
Learning OS: Initialize KnowledgeData
Learning OS: Rebuild KnowledgeData Index
Learning OS: Export KnowledgeData Summary
Learning OS: Backup KnowledgeData
Learning OS: Show KnowledgeData Global Summary
```

They are registered in `src/main.ts`.

## 3.2.1 KnowledgeData Automatic Sync

Phase 2.1.1 added automatic KnowledgeData sync while keeping manual commands as maintenance tools.

Settings:

```text
Enable KnowledgeData
Auto sync KnowledgeData after Apply
Track manual edits/deletions in Learning OS items
```

Default behavior:

- KnowledgeData auto-initializes on plugin load when enabled.
- After Apply succeeds and markers are verified, KnowledgeData syncs from the verified live Markdown returned by Apply.
- Apply sync creates/updates item and concept rows and records compact `apply/coverage` and related `ask/confusion` evidence.
- Vault modify events trigger debounced per-note sync only for Markdown notes that contain final Learning OS markers.
- Note sync detects content hash changes as `manual_edit/correction` evidence.
- Note sync marks missing item markers only within the modified note, not globally.
- Notes without final Learning OS markers are skipped.

The automatic sync does not:

- change Ask prompt behavior,
- change Inbox behavior,
- change Apply safety rules,
- call AI,
- full-scan the vault in the background,
- index staged draft markers.

## 3.3 Knowledge Schema

Implemented v1 tables:

- `meta`,
- `concepts`,
- `concept_edges`,
- `items`,
- `evidence`,
- `source_refs`,
- `reviews`.

`reviews` exists only as future-ready storage. No scheduler logic exists.

## 3.4 Rebuild Index Behavior

The indexer scans Markdown notes only when the user runs the rebuild command.

It currently indexes:

- live clarification items,
- live generated-content items,
- item IDs,
- container IDs,
- note paths,
- item titles,
- item content hashes,
- concept candidates from item titles,
- conservative coverage evidence,
- linked Ask job evidence when job IDs can connect to item IDs,
- missing items,
- manual edit hash changes.

It does not:

- scan arbitrary note text with AI,
- infer a complete concept hierarchy,
- compute mastery,
- run review scheduling,
- ingest PDFs/PPTs,
- duplicate full prompts or answers into evidence.

Automatic note-level sync now reuses the same conservative marker-based indexing model for individual notes.

## 3.4.1 Manual Obsidian QA After Phase 2.1.1

The user manually tested KnowledgeData auto-sync inside Obsidian after Phase 2.1.1.

Confirmed:

- Global Summary command works and reports whole-vault/project KnowledgeData counts.
- Ask -> Apply records both `ask/confusion` and `apply/coverage` evidence.
- Manual visible item edits with final markers preserved record `manual_edit/correction` evidence.
- Deleting a final item marker marks the item `missing` and records `delete/stability` evidence.
- Deleting one item inside a multi-item clarification block marks only that item missing; sibling items remain live if their markers remain.
- Draft-only `learnos-draft-*` blocks do not create KnowledgeData concepts/items/evidence/source refs.
- Editing an independent Markdown note with no final Learning OS markers does not change KnowledgeData counts.
- Duplicate passive evidence loops were not observed for `manual_note`, `apply`, `manual_edit`, or `delete` evidence.

Acceptance polish clarified the Summary command wording:

```text
KnowledgeData Global Summary
Scope: whole vault/project
Total indexed items
Active items
Missing/deleted items
Latest evidence: latest compact records
```

Current-note KnowledgeData summary is deferred as a future enhancement.

## 3.5 Exports

Exports written by command:

```text
.learning-os/knowledge/exports/concepts.json
.learning-os/knowledge/exports/knowledge_summary.json
.learning-os/knowledge/exports/mastery_summary.md
```

## 3.6 Backups

Backup command writes:

```text
.learning-os/knowledge/backups/knowledge-YYYYMMDD-HHMMSS.sqlite
```

---

# 4. Important Current Files

## 4.1 Ask Core

```text
src/main.ts
src/ask/
src/editor/
src/jobs/
src/storage/
src/views/
```

Important files:

- `src/main.ts`
- `src/ask/AskModal.ts`
- `src/ask/AskPromptBuilder.ts`
- `src/ask/AiResponseParser.ts`
- `src/ask/ClarificationBlock.ts`
- `src/ask/ClarificationMergeProposal.ts`
- `src/ask/InlineDraftBlock.ts`
- `src/ask/InlineDraftStaging.ts`
- `src/jobs/AskJobService.ts`
- `src/jobs/ApplyAskJobProposal.ts`
- `src/jobs/LiveAwareMerge.ts`
- `src/jobs/LiveClarificationState.ts`
- `src/views/AskInboxView.ts`

## 4.2 KnowledgeData

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

## 4.3 Tests

```text
tests/knowledgeData.test.mjs
tests/*.test.mjs
```

Current full test run:

```text
196 tests passing
```

## 4.4 Docs

```text
docs/DATA_MODEL.md
docs/KNOWLEDGE_DATA_FOUNDATION.md
docs/ADAPTIVE_LEARNING_OS_PLUGIN_DETAILS.md
docs/context/
```

---

# 5. Verification Status

The latest successful direct verification used the bundled Node runtime:

```text
node ./node_modules/typescript/bin/tsc -noEmit -skipLibCheck
node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
node esbuild.config.mjs production
```

Results:

```text
TypeScript: passed
Focused tests: 178 passed
Full tests: 196 passed
Production build: passed
Build hash: 62d69a8f367a36481c97bc3888f9ff73211157f7662d660852b163345af93b4a
```

Note:

`pnpm build` may trigger this environment's dependency status/install wrapper and fail if sandboxed registry access is blocked before the script runs. The underlying production build command passed.

---

# 6. Current Known Limitations

KnowledgeData limitations:

- Concept extraction is title-based and conservative.
- Concept hierarchy/edges are schema-ready but not inferred.
- Mastery remains mostly zero/placeholder because no review evidence exists yet.
- Direct arbitrary manual note indexing is not implemented.
- Context pack generation is not implemented.
- No DB UI view exists.

Ask limitations:

- Provider quality depends on configured external model.
- Inline draft staging is experimental and default off, but the Phase 2.1.2B Ask / Inbox / Draft / Apply baseline is finalized and frozen.
- Inline draft staging supports natural add-item/add-sibling flows, not existing item rewrite or multi-item rewrite.
- Manual Obsidian QA should still be done after major releases.
- Full import/export migration UX is not yet mature.

Project limitations:

- No Review Scheduler.
- No Learning Project Pipeline.
- No PDF/PPT ingestion.
- No vector search.
- No cloud sync.
- No web app.

---

# 7. Recommended Next Phase

A good next candidate could be:

```text
KnowledgeData Foundation / Knowledge hierarchy and context pack planning
```

Possible goals:

- improve concept normalization,
- support manual concept assignment/edit command,
- generate first context pack from selected note/item,
- export `context_pack_*.md`,
- maybe add a small KnowledgeData summary modal/view,
- keep all work explicit-command driven.

Do not begin that phase without a separate brief.
