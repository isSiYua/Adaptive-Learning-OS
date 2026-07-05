# Codex Phase 2.1 - KnowledgeData Foundation Brief

Status: executed and retained as historical/current-scope record  
Original external brief: `Codex_Phase2_1_KnowledgeData_Foundation_Brief_v2.md`  
Repo-maintained version: 2026-07-04 after implementation

---

# 0. Purpose

This brief defines Phase 2.1 of Adaptive Learning OS.

The goal was:

```text
Add the first local-first KnowledgeData foundation without disrupting Ask / Inbox / Apply.
```

This repo-maintained version is kept so future conversations understand what Phase 2.1 was supposed to do and what it intentionally did not do.

---

# 1. Product Context

Adaptive Learning OS already had a mature Ask core:

- selected text Ask,
- Ask Modal,
- background Ask jobs,
- Learning OS Inbox,
- review before Apply,
- AI answer parse/check,
- AI merge proposal,
- clarification blocks,
- generated content blocks,
- stable hidden IDs,
- live-note-aware apply,
- marker verification,
- cleanup,
- DeepSeek Flash / Pro routing.

Phase 2.1 should not refactor that workflow.

Phase 2.1 should add a new KnowledgeData foundation layer.

---

# 2. Primary Goal

Create durable local structured storage for:

- concepts,
- knowledge hierarchy,
- Obsidian item links,
- evidence,
- source references,
- future review/mastery/tutorial adaptation.

This phase is a foundation, not full mastery intelligence.

---

# 3. Must Implement

Phase 2.1 requirements:

1. `.learning-os/knowledge/` storage area.
2. SQLite-backed KnowledgeData database if compatible with Obsidian plugin build/runtime.
3. Schema bootstrap and migration versioning.
4. Minimal `concepts`, `items`, `evidence`, `source_refs`, `concept_edges`, `meta` storage.
5. Initial rebuild/index command.
6. Basic export command.
7. Backup command.
8. Tests.
9. Docs update.

---

# 4. Must Not Implement

Phase 2.1 must not implement:

- Review Scheduler,
- spaced repetition algorithm,
- AI Note Check,
- PDF/PPT parsing,
- raw -> transform -> extract -> tutorial pipeline,
- vector DB,
- web app,
- cloud sync,
- automatic AI concept extraction over the entire vault,
- heavy background scanning,
- per-keystroke edit tracking,
- migration of existing Ask job storage to SQLite,
- breaking changes to Ask / Inbox / Apply.

---

# 5. Storage Decision

Recommended model:

```text
Ask workflow raw history:
  JSON / JSONL

Long-term KnowledgeData:
  SQLite

Human-readable exports:
  JSON / Markdown
```

Do not convert all existing Ask jobs into database records as their primary storage.

KnowledgeData may index/import summaries from existing Ask and clarification data.

---

# 6. SQLite Constraints

Obsidian plugin compatibility matters.

Avoid native modules unless clearly supported.

Preferred:

- pure JS,
- WASM,
- `sql.js` or equivalent.

If SQLite is infeasible, create an abstraction and clearly document the decision. Do not silently replace SQLite with giant JSON.

Implemented decision:

```text
Use sql.js ASM build for SQLite-compatible storage without native modules and without separate WASM deployment.
```

---

# 7. Expected Storage Layout

Target layout:

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
    │   ├── mastery_summary.md
    │   └── knowledge_summary.json
    └── backups/
```

---

# 8. Schema v1

Required tables:

- `meta`,
- `concepts`,
- `concept_edges`,
- `items`,
- `evidence`,
- `source_refs`.

Optional future table:

- `reviews`.

Implemented: all required tables plus future-ready `reviews`.

## 8.1 `meta`

Purpose:

- schema version,
- created_at,
- updated_at,
- last rebuild metadata.

## 8.2 `concepts`

Purpose:

- knowledge nodes.

Important fields:

- `id`,
- `name`,
- `aliases_json`,
- `abstraction_level`,
- `coverage`,
- `mastery`,
- `confidence`,
- `status`,
- `summary`,
- `strong_points_json`,
- `weak_points_json`,
- `unknown_points_json`,
- timestamps.

Semantic rule:

```text
abstraction_level != mastery
```

## 8.3 `concept_edges`

Purpose:

- hierarchy/graph relations.

Relations may include:

- `parent_child`,
- `part_of`,
- `prerequisite`,
- `related`,
- `variant_of`,
- `contrasts_with`.

Phase 2.1 creates storage but does not infer graph edges.

## 8.4 `items`

Purpose:

- index live or known note-side knowledge items.

Important fields:

- `item_id`,
- `container_id`,
- `container_type`,
- `note_path`,
- `title`,
- `content_hash`,
- `content_summary`,
- `concept_ids_json`,
- `status`,
- timestamps.

Do not store huge full note content here.

## 8.5 `evidence`

Purpose:

- compact learning signals.

Important fields:

- `id`,
- `concept_id`,
- `source_type`,
- `signal_type`,
- `strength`,
- `confidence`,
- `summary`,
- `note_path`,
- `item_id`,
- `job_id`,
- `review_id`,
- `source_ref_id`,
- `created_at`.

Do not duplicate full prompts or raw AI answers here.

## 8.6 `source_refs`

Purpose:

- keep KnowledgeData meaningful even if raw/tutorial/note files later move or disappear.

Important fields:

- `id`,
- `concept_id`,
- `source_type`,
- `path`,
- `source_hash`,
- `title`,
- `status`,
- `last_seen_at`.

## 8.7 `reviews`

Purpose:

- future review system storage.

Phase 2.1 may create the table, but must not implement scheduler logic.

---

# 9. Indexing Requirements

Phase 2.1 should use conservative heuristics.

## 9.1 Concept Candidate From Item Title

Examples:

```text
"梯度是啥？" -> "梯度"
"NMS" -> "NMS"
"YOLOv3 输出层" -> "YOLOv3 输出层"
```

Do not implement heavy AI extraction.

## 9.2 Concept IDs

Use safe stable IDs.

Implemented:

- ASCII slug + short hash for ASCII-ish names,
- `concept-<hash>` fallback for local/unicode names.

## 9.3 Evidence

On rebuild:

- live Learning OS item -> coverage evidence,
- linked Ask job -> mild confusion evidence,
- content hash changed -> manual edit/correction evidence,
- previously active item missing -> missing/delete/stability evidence.

Do not overstate mastery.

---

# 10. Required Commands

Implemented:

## 10.1 Initialize KnowledgeData

```text
Learning OS: Initialize KnowledgeData
```

Behavior:

- ensure knowledge folder,
- initialize DB,
- run migrations,
- create export/backup dirs.

## 10.2 Rebuild KnowledgeData Index

```text
Learning OS: Rebuild KnowledgeData Index
```

Behavior:

- initialize DB if needed,
- scan supported current data,
- update items/concepts/evidence/source_refs,
- mark missing items where appropriate,
- update meta.

## 10.3 Export KnowledgeData Summary

```text
Learning OS: Export KnowledgeData Summary
```

Behavior:

- write `concepts.json`,
- write `knowledge_summary.json`,
- write `mastery_summary.md`.

## 10.4 Backup KnowledgeData

```text
Learning OS: Backup KnowledgeData
```

Behavior:

- copy `knowledge.sqlite` to timestamped backup path.

---

# 11. Tests Required

Phase 2.1 should test:

- DB init,
- schema tables,
- concept upsert,
- item upsert,
- evidence insertion,
- rebuild/index basic,
- manual edit hash detection,
- missing item detection,
- export,
- backup.

Implemented test file:

```text
tests/knowledgeData.test.mjs
```

---

# 12. Manual QA Checklist

After build, user should be able to:

1. Open Obsidian vault with plugin.
2. Run `Learning OS: Initialize KnowledgeData`.
3. Confirm `.learning-os/knowledge/knowledge.sqlite` exists.
4. Run `Learning OS: Rebuild KnowledgeData Index`.
5. Confirm no note content changed.
6. Run `Learning OS: Export KnowledgeData Summary`.
7. Inspect:
   - `.learning-os/knowledge/exports/concepts.json`
   - `.learning-os/knowledge/exports/knowledge_summary.json`
   - `.learning-os/knowledge/exports/mastery_summary.md`
8. Run `Learning OS: Backup KnowledgeData`.
9. Confirm backup DB file exists.
10. Ask / Inbox / Apply still works normally.

---

# 13. Documentation Requirement

Phase 2.1 should document:

- what KnowledgeData is,
- where it is stored,
- why Ask jobs still use JSON,
- why KnowledgeData uses SQLite,
- commands,
- what this phase does not do,
- deletion/source missing behavior,
- export/backup.

Implemented:

```text
docs/KNOWLEDGE_DATA_FOUNDATION.md
docs/context/
```

