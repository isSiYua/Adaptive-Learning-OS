# Phase 2.1 Handoff - KnowledgeData Foundation

Date: 2026-07-04  
Phase: 2.1  
Status: implemented and verified  
Audience: next ChatGPT/Codex conversation continuing Adaptive Learning OS

---

# 1. What Phase 2.1 Was About

Phase 2.1 was the first step after Ask core stabilization.

The system had already built a mature Obsidian Ask workflow:

```text
select text
-> Ask Modal
-> background Ask job
-> AI answer
-> parse/check
-> AI merge proposal
-> Inbox review
-> Apply to note
-> clarification/generated content block
```

But that workflow primarily handled local interaction and history.

Phase 2.1 added the first durable KnowledgeData foundation:

```text
concepts
items
evidence
source refs
concept graph table
schema metadata
exports
backups
explicit rebuild/index command
```

This turns the project from only an Ask plugin toward a long-term adaptive learning system.

---

# 2. What Was Implemented

## 2.1 SQLite-backed KnowledgeData

Added `sql.js`:

```text
sql.js
@types/sql.js
```

Used:

```text
sql.js/dist/sql-asm.js
```

Reason:

- avoids native modules,
- avoids separate WASM asset deployment,
- remains SQLite-compatible,
- works with Obsidian plugin bundling after externalizing `node:` builtins.

The DB file is:

```text
.learning-os/knowledge/knowledge.sqlite
```

## 2.2 KnowledgeData Storage Layout

The plugin now ensures:

```text
.learning-os/knowledge/
.learning-os/knowledge/exports/
.learning-os/knowledge/backups/
```

This is handled in `FileStore.ensureKnowledgeFolders()`.

## 2.3 Schema Bootstrap and Migrations

Schema modules:

```text
src/knowledge/KnowledgeSchema.ts
src/knowledge/KnowledgeMigrations.ts
```

Tables:

- `meta`,
- `concepts`,
- `concept_edges`,
- `items`,
- `evidence`,
- `source_refs`,
- `reviews`.

Migration behavior:

- fresh DB creates schema v1,
- existing DB reads `meta.schema_version`,
- newer-than-supported schema throws clear error,
- current migration entrypoint exists for future versions.

## 2.4 Knowledge Repository

Repository module:

```text
src/knowledge/KnowledgeRepository.ts
```

Provides:

- concept upsert,
- item upsert,
- evidence insert,
- source ref upsert,
- active item listing,
- missing item marking,
- counts,
- concept listing.

## 2.5 Markdown Scanner

Scanner module:

```text
src/knowledge/KnowledgeMarkdownScanner.ts
```

It scans live Markdown for:

- clarification blocks,
- generated-content blocks,
- `learnos-item-id` markers,
- item titles and explanation text.

It reuses existing `ClarificationBlock` parsing logic where possible.

It does not parse arbitrary Markdown paragraphs as concepts.

## 2.6 Concept Normalization

Module:

```text
src/knowledge/ConceptNormalize.ts
```

Behavior:

- derives concept name from item title,
- strips common question suffixes,
- uses ASCII slug + hash where possible,
- uses `concept-<hash>` fallback for local/unicode names.

Important:

It does not pretend to translate Chinese/local terms into English.

## 2.7 Rebuild Indexer

Module:

```text
src/knowledge/KnowledgeIndexer.ts
```

The rebuild function:

- accepts Markdown files and Ask jobs,
- scans supported Learning OS items,
- creates/upserts concepts,
- creates/upserts items,
- creates/upserts source refs,
- records compact coverage evidence,
- detects item hash changes as manual edits,
- marks previously active but now-missing items,
- creates Ask-linked evidence where item IDs connect.

Evidence is conservative:

- live item -> `manual_note` / `coverage`,
- Ask job -> `ask` / `confusion`,
- hash change -> `manual_edit` / `correction`,
- missing item -> `delete` / `stability`.

## 2.8 Export

Module:

```text
src/knowledge/KnowledgeExport.ts
```

Command writes:

```text
.learning-os/knowledge/exports/concepts.json
.learning-os/knowledge/exports/knowledge_summary.json
.learning-os/knowledge/exports/mastery_summary.md
```

Purpose:

- keep KnowledgeData readable,
- support future migration/debugging,
- avoid SQLite becoming a black box.

## 2.9 Backup

Module:

```text
src/knowledge/KnowledgeBackup.ts
```

Command writes:

```text
.learning-os/knowledge/backups/knowledge-YYYYMMDD-HHMMSS.sqlite
```

## 2.10 Commands

Module:

```text
src/knowledge/KnowledgeCommands.ts
```

Registered in:

```text
src/main.ts
```

Commands:

```text
Learning OS: Initialize KnowledgeData
Learning OS: Rebuild KnowledgeData Index
Learning OS: Export KnowledgeData Summary
Learning OS: Backup KnowledgeData
```

## 2.11 Build Compatibility

Changed:

```text
esbuild.config.mjs
```

Added:

```js
...builtins.map((moduleName) => `node:${moduleName}`)
```

Reason:

`sql.js/dist/sql-asm.js` references `node:fs` and `node:crypto`. The existing esbuild config externalized bare builtins but not `node:`-prefixed builtin specifiers.

---

# 3. What Was Not Implemented

The following are still not implemented:

- Review Scheduler,
- spaced repetition,
- review dashboard,
- AI Note Check,
- automatic note scanning,
- PDF ingestion,
- PPT ingestion,
- raw -> transform -> extract -> tutorial pipeline,
- vector DB,
- cloud sync,
- web app,
- automatic AI concept extraction,
- background full-vault scanning,
- per-keystroke tracking,
- migration of Ask jobs into SQLite primary storage.

This is intentional.

---

# 4. Files Added

KnowledgeData modules:

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
src/knowledge/KnowledgeTypes.ts
src/knowledge/sql-js-asm.d.ts
```

Tests:

```text
tests/knowledgeData.test.mjs
```

Docs:

```text
docs/KNOWLEDGE_DATA_FOUNDATION.md
docs/context/
```

---

# 5. Files Modified

Modified:

```text
src/main.ts
src/storage/FileStore.ts
esbuild.config.mjs
package.json
pnpm-lock.yaml
main.js
```

Details:

- `src/main.ts`: registers KnowledgeData commands.
- `src/storage/FileStore.ts`: adds knowledge folders and binary read/write/copy helpers.
- `esbuild.config.mjs`: externalizes `node:` builtins.
- `package.json`: adds `sql.js`, `@types/sql.js`.
- `pnpm-lock.yaml`: locks new dependency.
- `main.js`: production bundle regenerated.

---

# 6. Verification

Successful direct verification:

```text
node ./node_modules/typescript/bin/tsc -noEmit -skipLibCheck
node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
node ./node_modules/typescript/bin/tsc -noEmit -skipLibCheck
node esbuild.config.mjs production
```

Results:

```text
TypeScript: passed
Tests: 133 passed
Production build: passed
```

Environment note:

`CI=true pnpm build` attempted to run dependency status/install behavior before the build script and failed under sandboxed registry access. The underlying TypeScript and esbuild production build passed directly.

---

# 7. Manual QA Still Recommended

Manual Obsidian QA should check:

1. Plugin loads.
2. Commands appear in command palette.
3. `Learning OS: Initialize KnowledgeData` creates `.learning-os/knowledge/knowledge.sqlite`.
4. `Learning OS: Rebuild KnowledgeData Index` scans existing Learning OS items without modifying notes.
5. `Learning OS: Export KnowledgeData Summary` writes export files.
6. `Learning OS: Backup KnowledgeData` creates timestamped DB backup.
7. Ask / Inbox / Apply still works.
8. Cleanup still works.

---

# 8. Important Risks For Next Phase

## 8.1 Do Not Overstate Mastery

Current evidence can show coverage/confusion/correction, not true mastery.

Only future review/self-explanation/test outcomes should strongly affect mastery.

## 8.2 Do Not AI-Scan The Vault By Default

The KnowledgeData indexer is intentionally explicit-command driven.

Future concept extraction should remain opt-in and previewable.

## 8.3 Do Not Make Context Packs Too Large

The next natural step is context pack generation, but context packs must be compact.

Do not dump the entire DB or entire evidence history into prompts.

## 8.4 Preserve Ask Core Stability

KnowledgeData should consume/index Ask workflow outputs; it should not destabilize Ask / Inbox / Apply.

---

# 9. Suggested Next Phase

Recommended next phase:

```text
Phase 2.2 - Knowledge hierarchy and context pack generation
```

Possible scope:

- add command to generate a context pack for current note/selection/item,
- include hot concept state and recent compact evidence,
- export `context_pack_*.md`,
- optionally let user manually assign/rename concepts,
- maybe show lightweight KnowledgeData summary modal.

Hard boundaries should remain:

- no review scheduler yet unless specifically briefed,
- no AI vault scan,
- no raw file ingestion,
- no vector DB,
- no web app/cloud sync.

