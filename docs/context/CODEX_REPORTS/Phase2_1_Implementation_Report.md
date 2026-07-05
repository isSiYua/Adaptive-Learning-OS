# Codex Report - Phase 2.1 KnowledgeData Foundation

Date: 2026-07-04  
Scope: KnowledgeData Foundation  
Status: implemented, tested, production-built  

---

# 1. Request Summary

The user requested:

- Read the Master Plan as product/system context.
- Read the Phase 2.1 KnowledgeData brief as executable scope.
- Add the first local-first KnowledgeData foundation.
- Keep current Ask / Inbox / Apply unchanged.
- Add `.learning-os/knowledge/` storage.
- Use SQLite-backed KnowledgeData if compatible with Obsidian plugin build/runtime.
- Add schema/bootstrap/migrations for:
  - concepts,
  - items,
  - evidence,
  - source_refs,
  - concept_edges,
  - meta.
- Add rebuild/index command from current Learning OS data.
- Add export and backup commands.
- Keep the slice lightweight, explicit-command driven, non-destructive.
- Do not implement review scheduler, note check AI scan, raw pipeline, ingestion, vector DB, web app, cloud sync, or large automatic AI extraction.
- Run tests, TypeScript, production build, and report.

---

# 2. Implementation Summary

Implemented a new `src/knowledge/` layer with:

- SQLite DB wrapper,
- schema bootstrap,
- migration entrypoint,
- repository functions,
- markdown item scanner,
- conservative concept normalization,
- rebuild indexer,
- export writer,
- backup command,
- Obsidian command handlers.

Added storage support in `FileStore`:

- `ensureKnowledgeFolders`,
- `readBinary`,
- `writeBinary`,
- `copyFile`.

Registered four commands in the plugin:

```text
Learning OS: Initialize KnowledgeData
Learning OS: Rebuild KnowledgeData Index
Learning OS: Export KnowledgeData Summary
Learning OS: Backup KnowledgeData
```

---

# 3. SQLite Compatibility Decision

The project previously had no production dependencies.

The brief requested SQLite-backed KnowledgeData if compatible with Obsidian plugin runtime.

Native packages like `better-sqlite3` were avoided because:

- they require native builds,
- Obsidian plugin distribution can break with native modules,
- bundling/runtime compatibility is risky.

Implemented:

```text
sql.js
```

Specifically:

```text
sql.js/dist/sql-asm.js
```

Reason:

- no native module,
- no separate WASM file deployment,
- creates/export SQLite database bytes,
- works inside the bundled plugin after build config adjustment.

Build config change:

```text
externalize node:-prefixed builtins
```

because the SQL.js ASM bundle references `node:fs` and `node:crypto`.

---

# 4. Storage Layout Implemented

The plugin now supports:

```text
.learning-os/knowledge/
├── knowledge.sqlite
├── exports/
│   ├── concepts.json
│   ├── knowledge_summary.json
│   └── mastery_summary.md
└── backups/
    └── knowledge-YYYYMMDD-HHMMSS.sqlite
```

Existing Ask storage remains unchanged:

```text
.learning-os/ask-jobs/
.learning-os/clarifications/
.learning-os/logs/
.learning-os/archive/
.learning-os/backups/
.learning-os/generated/
```

---

# 5. Schema Implemented

Schema version:

```text
1
```

Tables:

## 5.1 `meta`

Fields:

- `key`
- `value`

Required keys:

- `schema_version`
- `created_at`
- `updated_at`

Additional metadata:

- `last_rebuild_at`

## 5.2 `concepts`

Fields:

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

## 5.3 `concept_edges`

Fields:

- `parent_id`
- `child_id`
- `relation_type`
- `weight`
- `created_at`

Primary key:

```text
(parent_id, child_id, relation_type)
```

## 5.4 `items`

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

## 5.5 `evidence`

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

## 5.6 `source_refs`

Fields:

- `id`
- `concept_id`
- `source_type`
- `path`
- `source_hash`
- `title`
- `status`
- `last_seen_at`

## 5.7 `reviews`

Future-ready table only.

No scheduler logic implemented.

---

# 6. Rebuild / Index Behavior

Command:

```text
Learning OS: Rebuild KnowledgeData Index
```

Behavior:

1. Opens or initializes KnowledgeData DB.
2. Reads current Markdown files through Obsidian vault API.
3. Scans for Learning OS clarification/generated blocks.
4. Extracts live `learnos-item-id` items.
5. Creates conservative concept from item title.
6. Upserts concept.
7. Upserts item.
8. Upserts source ref.
9. Inserts compact coverage evidence.
10. Detects hash changes as manual edits.
11. Marks previously active but now missing items.
12. Links relevant Ask job evidence where item IDs connect.
13. Updates `meta.last_rebuild_at`.
14. Saves DB bytes back to `.learning-os/knowledge/knowledge.sqlite`.

Evidence mapping:

```text
live Learning OS item -> manual_note / coverage
Ask job linked to item -> ask / confusion
item content hash changed -> manual_edit / correction
previously active item missing -> delete / stability
```

---

# 7. Export Behavior

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

The export is intentionally compact and human-readable.

---

# 8. Backup Behavior

Command:

```text
Learning OS: Backup KnowledgeData
```

Writes:

```text
.learning-os/knowledge/backups/knowledge-YYYYMMDD-HHMMSS.sqlite
```

If DB does not exist, initializes it first.

---

# 9. Tests Added

File:

```text
tests/knowledgeData.test.mjs
```

Coverage:

- DB init,
- meta/schema version,
- required tables,
- idempotent reopen,
- concept upsert,
- alias JSON handling,
- item upsert,
- content hash update detection,
- evidence insertion,
- concept normalization,
- rebuild indexing,
- Ask-job-linked evidence,
- manual edit hash detection,
- missing item detection,
- export artifacts,
- backup artifacts.

---

# 10. Verification Results

Successful commands:

```text
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc -noEmit -skipLibCheck
```

Result:

```text
passed
```

```text
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
```

Result:

```text
133 tests passed
0 failed
```

```text
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc -noEmit -skipLibCheck
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node esbuild.config.mjs production
```

Result:

```text
production build passed
```

Environment note:

`CI=true pnpm build` was attempted, but in this Codex environment it triggered pnpm dependency-status/install behavior before running the build script. That failed under restricted network with registry fetch errors. The underlying TypeScript and esbuild production build passed directly.

---

# 11. Files Changed

Added:

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
tests/knowledgeData.test.mjs
docs/KNOWLEDGE_DATA_FOUNDATION.md
docs/context/
```

Modified:

```text
src/main.ts
src/storage/FileStore.ts
esbuild.config.mjs
package.json
pnpm-lock.yaml
main.js
```

---

# 12. User-Visible Changes

New commands:

- `Learning OS: Initialize KnowledgeData`
- `Learning OS: Rebuild KnowledgeData Index`
- `Learning OS: Export KnowledgeData Summary`
- `Learning OS: Backup KnowledgeData`

New files after user runs commands:

- `.learning-os/knowledge/knowledge.sqlite`,
- `.learning-os/knowledge/exports/concepts.json`,
- `.learning-os/knowledge/exports/knowledge_summary.json`,
- `.learning-os/knowledge/exports/mastery_summary.md`,
- `.learning-os/knowledge/backups/knowledge-*.sqlite`.

No automatic note modifications are performed by KnowledgeData commands.

---

# 13. Known Limitations

- Concept extraction is simple title-based.
- No concept hierarchy inference.
- No user-facing KnowledgeData dashboard.
- No context pack generation.
- No mastery computation beyond placeholder/conservative defaults.
- No review scheduler.
- No AI concept extraction.
- No direct arbitrary manual note indexing.
- No manual concept editing UI.

---

# 14. Next Suggested Work

Recommended next phase:

```text
Phase 2.2 - Knowledge hierarchy and context pack generation
```

Possible implementation areas:

- command to generate context pack for selected item/current note,
- read hot concept state,
- include recent compact evidence,
- export `context_pack_*.md`,
- allow manual concept rename/assignment,
- add summary modal or minimal view,
- keep all operations explicit.

Do not start this without a new phase brief.

