# Adaptive Learning OS - Context Pack After Phase 2.1.1

Generated: 2026-07-05  
Use case: give this file to a new ChatGPT/Codex conversation after Phase 2.1.1 so it understands the latest state without reading every historical chat.

---

# 1. Current System Goal

Adaptive Learning OS is a local-first Obsidian-centered adaptive learning system.

Long-term flow:

```text
learning sources
-> processed learning materials
-> Obsidian reading and note-taking
-> inline Ask at points of confusion
-> user-reviewed clarification/generated content
-> durable KnowledgeData
-> adaptive review
-> future tutorial generation adjusted to the user's knowledge state
```

The project is not a generic AI chat sidebar.

It is a learning memory system that connects:

- selected source text,
- the user's question,
- AI-generated proposals,
- user-reviewed Apply,
- stable note markers,
- local KnowledgeData,
- future review scheduling,
- future context pack generation,
- future tutorial generation.

Core principle:

```text
The live Obsidian note is source of truth.
AI proposes.
User applies.
KnowledgeData indexes committed/local signals.
```

---

# 2. Completed Capabilities

## 2.1 Ask Core

Implemented:

- selected-text Ask,
- Ask Modal,
- floating Ask button,
- context collection,
- source block detection,
- background Ask jobs,
- Inbox review,
- Markdown/LaTeX proposal preview,
- editable proposal text,
- AI answer parsing,
- merge proposal parsing,
- Apply after user review,
- clarification blocks,
- generated content blocks,
- source navigation,
- cleanup,
- live-note-aware Apply,
- marker verification,
- marker preservation,
- stable hidden IDs.

## 2.2 Model Routing

Implemented:

- provider presets,
- OpenAI-compatible provider,
- Anthropic-compatible provider,
- DeepSeek preset,
- default Ask model,
- deep/pro model,
- Auto / Flash / Pro choice,
- Pro suggestion without silent upgrade,
- regenerate/retry with Pro.

## 2.3 KnowledgeData Foundation - Phase 2.1

Implemented:

- SQLite-backed KnowledgeData using `sql.js`,
- `.learning-os/knowledge/` storage,
- schema/bootstrap/migrations,
- tables for `meta`, `concepts`, `concept_edges`, `items`, `evidence`, `source_refs`, future-ready `reviews`,
- manual initialize/rebuild/export/backup commands,
- conservative rebuild from live Learning OS final markers,
- concept candidates from item titles,
- compact evidence,
- source refs,
- missing item detection during explicit rebuild,
- docs and tests.

## 2.4 Automatic KnowledgeData Sync - Phase 2.1.1

Implemented:

- auto-initialize KnowledgeData on plugin load when enabled,
- auto sync after successful verified Apply,
- debounced note-level sync on Markdown modify,
- manual edit hash detection,
- missing marker detection within the modified note,
- `Learning OS: Show KnowledgeData Global Summary`,
- settings for enabling KnowledgeData, Apply sync, and manual edit/deletion tracking,
- Inline Draft parser/design/test skeleton only.

---

# 3. Current User-Facing Commands

Ask/Inbox:

```text
Learning OS: Open Ask Inbox
Ask AI about selected text
Extract Ask Cards from current note
Convert legacy ASK_CARD blocks in current note
Learning OS: Clean unused Learning OS data / 清理未使用的 Learning OS 数据
```

KnowledgeData:

```text
Learning OS: Initialize KnowledgeData
Learning OS: Rebuild KnowledgeData Index
Learning OS: Export KnowledgeData Summary
Learning OS: Show KnowledgeData Global Summary
Learning OS: Backup KnowledgeData
```

Manual KnowledgeData commands remain maintenance/inspection tools. Daily sync now happens automatically when enabled.

---

# 4. Current KnowledgeData Behavior

Storage:

```text
.learning-os/knowledge/knowledge.sqlite
.learning-os/knowledge/exports/
.learning-os/knowledge/backups/
```

Automatic sync settings:

```text
enableKnowledgeData = true
autoSyncKnowledgeDataAfterApply = true
trackKnowledgeDataManualEdits = true
```

Apply sync:

- runs after Apply succeeds,
- uses verified live Markdown,
- indexes final markers only,
- creates/updates concepts and items,
- creates note/item/job source refs,
- records `apply/coverage`,
- records related `ask/confusion`,
- records conservative `manual_note/coverage`.

Note modify sync:

- listens to Markdown file modify events,
- skips notes without final Learning OS markers,
- debounces per note path,
- serializes background DB writes,
- detects content hash changes as `manual_edit/correction`,
- marks missing item markers only inside the modified note,
- does not full-scan the vault.

Show Summary:

- is a global whole-vault/project summary,
- displays concept/evidence/source-ref counts,
- splits items into total indexed items, active items, and missing/deleted items,
- displays last rebuild,
- displays last auto sync,
- displays the latest compact evidence records.

Manual Obsidian QA after Phase 2.1.1 confirmed:

- Ask -> Apply records `ask/confusion` and `apply/coverage`.
- Manual visible item edits record `manual_edit/correction`.
- Deleted final item markers become `missing` and record `delete/stability`.
- Deleting one item in a multi-item clarification block only marks that item missing.
- Draft-only `learnos-draft-*` blocks are ignored by KnowledgeData.
- Editing an independent no-marker Markdown note does not change KnowledgeData counts.
- No problematic repeated passive sync evidence loops were observed for `manual_note`, `apply`, `manual_edit`, or `delete`.

Current-note KnowledgeData summary is not implemented yet. It is a future optional command, separate from the global summary.

---

# 5. Current Module Map

Ask / Inbox / Apply:

```text
src/main.ts
src/ask/
src/editor/
src/jobs/
src/views/
src/storage/
```

KnowledgeData:

```text
src/knowledge/ConceptNormalize.ts
src/knowledge/KnowledgeBackup.ts
src/knowledge/KnowledgeCommands.ts
src/knowledge/KnowledgeDb.ts
src/knowledge/KnowledgeExport.ts
src/knowledge/KnowledgeIndexer.ts
src/knowledge/KnowledgeMarkdownScanner.ts
src/knowledge/KnowledgeMigrations.ts
src/knowledge/KnowledgeRepository.ts
src/knowledge/KnowledgeSchema.ts
src/knowledge/KnowledgeSummaryFormat.ts
src/knowledge/KnowledgeSync.ts
src/knowledge/KnowledgeTypes.ts
```

Inline draft skeleton:

```text
src/ask/InlineDraftBlock.ts
```

Docs:

```text
docs/DATA_MODEL.md
docs/KNOWLEDGE_DATA_FOUNDATION.md
docs/ADAPTIVE_LEARNING_OS_PLUGIN_DETAILS.md
docs/context/
```

Tests:

```text
tests/knowledgeData.test.mjs
tests/knowledgeAutoSync.test.mjs
```

---

# 6. Latest Design Decisions

## 6.1 Ask Stays JSON/JSONL

Ask jobs, clarification records, and logs remain JSON/JSONL.

Reason:

- event-like,
- readable,
- already stable,
- easier to debug.

## 6.2 KnowledgeData Uses SQLite

KnowledgeData uses SQLite through `sql.js/dist/sql-asm.js`.

Reason:

- structured relational state,
- local-first single file,
- no native module build risk,
- future-ready for concept/item/evidence/source queries.

## 6.3 Auto Sync Is Additive

KnowledgeData automatic sync is downstream of Apply and local note edits.

It must not:

- decide Apply success,
- alter merge semantics,
- overwrite note content,
- call AI,
- block normal Ask usage.

## 6.4 Evidence Is Conservative

Phase 2.1.1 evidence is not mastery.

Signals mean:

- `coverage`: concept appears in committed item,
- `confusion`: user asked about linked item,
- `correction`: user edited committed item text,
- `stability`: item marker disappeared.

Review/mastery should be built later.

## 6.5 Drafts Are Not Committed Knowledge

Inline draft markers use `learnos-draft-*`.

They are separate from final markers and ignored by KnowledgeData.

Full staged draft workflow is not implemented yet.

---

# 7. Verification Snapshot

Latest direct verification:

```text
TypeScript: passed
Tests: 141 passed
Production build: passed
```

Commands run:

```bash
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc -noEmit -skipLibCheck

/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs

/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node esbuild.config.mjs production
```

Known environment note:

Use the bundled Codex Node path above in this workspace. `pnpm build` may try dependency checks/install behavior depending on sandbox state; the direct TypeScript and esbuild commands passed.

---

# 8. What Is Still Not Done

Not implemented:

- Review Scheduler,
- Note Check AI scan,
- Learning Project raw -> transform -> extract -> tutorial pipeline,
- PDF/PPT ingestion,
- vector DB,
- web app,
- cloud sync,
- AI concept extraction,
- full-vault automatic background scan,
- automatic inline draft insertion,
- Inbox UI for live drafts,
- Apply-from-live-draft conversion,
- draft discard/replace workflow.

---

# 9. Known Tradeoffs / Edge Cases

## 9.1 All Markers Deleted From A Note

Note-level sync skips notes without final Learning OS markers.

Therefore:

- deleting one item while another final marker remains is detected,
- deleting every final marker from a note may need manual rebuild/cleanup to detect.

This is intentional for Phase 2.1.1 because the brief required both:

- no sync for notes without Learning OS markers,
- no full-vault background scan.

## 9.2 Sync Failure After Apply

If KnowledgeData sync fails after Apply:

- Apply remains valid,
- note changes remain,
- user can run manual rebuild.

This preserves Apply as the committed note operation and KnowledgeData as downstream index.

## 9.3 Draft Parser Is Not A Product Workflow

`InlineDraftBlock.ts` is only a parser/design skeleton.

Do not assume inline drafts are enabled in the product.

---

# 10. Recommended Next Phase Choices

## Option A - Phase 2.1.2 Full Inline Draft Item Staging

Use if the user wants to edit pending AI proposals directly in Obsidian notes.

Needs a dedicated brief covering:

- draft insertion trigger,
- job draft state,
- Inbox draft UI,
- Apply live draft,
- discard draft,
- replace draft,
- cleanup of orphan drafts,
- source deletion/move behavior.

## Option B - Phase 2.2 Knowledge Hierarchy / Context Pack

Use if the user wants KnowledgeData to become useful for future adaptive behavior.

Possible scope:

- richer source refs,
- concept grouping,
- context pack generation,
- note/project-level summaries,
- non-AI hierarchy candidates,
- debug exports.

## Option C - Manual Obsidian QA

Before larger work:

- run the plugin in Obsidian,
- perform a real Ask -> Apply,
- run Show Summary,
- edit a committed item,
- delete one item marker,
- export KnowledgeData,
- inspect whether `.learning-os/knowledge/knowledge.sqlite` behaves as expected.
