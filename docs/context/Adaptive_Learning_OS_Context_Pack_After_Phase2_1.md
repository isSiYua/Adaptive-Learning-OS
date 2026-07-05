# Adaptive Learning OS - Context Pack After Phase 2.1

Generated: 2026-07-04  
Use case: give this file to a new ChatGPT conversation after Phase 2.1 so it understands the latest project state without reading every historical discussion.

---

# 1. Current System Goal

Adaptive Learning OS is a local-first Obsidian-centered adaptive learning system.

Its long-term goal is:

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

The project is intentionally not a generic AI chat sidebar.

It is about building a learning memory system where:

- user questions,
- user edits,
- note-side items,
- evidence,
- concept state,
- future review outcomes,
- and future generated tutorials

all connect to a long-term local knowledge model.

---

# 2. Completed Phases

## 2.1 Ask Core

Completed:

- selected-text Ask,
- Ask Modal,
- context collection,
- background jobs,
- Inbox review,
- AI answer parsing,
- AI merge proposal,
- Apply after user review,
- clarification blocks,
- generated content blocks,
- source navigation,
- cleanup,
- live-note-aware apply,
- stable hidden IDs.

## 2.2 Model Routing

Completed:

- default model,
- deep model,
- Auto / Flash / Pro selection,
- Pro suggestion without silent upgrade,
- regenerate/retry with Pro.

## 2.3 KnowledgeData Foundation

Completed in Phase 2.1:

- SQLite-backed KnowledgeData,
- `.learning-os/knowledge/`,
- schema v1,
- migrations entrypoint,
- rebuild/index command,
- export command,
- backup command,
- tests,
- docs.

---

# 3. Latest Development Result

Phase 2.1 produced:

```text
.learning-os/knowledge/knowledge.sqlite
```

and new explicit commands:

```text
Learning OS: Initialize KnowledgeData
Learning OS: Rebuild KnowledgeData Index
Learning OS: Export KnowledgeData Summary
Learning OS: Backup KnowledgeData
```

The KnowledgeData DB currently supports:

- concepts,
- items,
- evidence,
- source refs,
- concept edges,
- meta,
- future-ready reviews table.

The indexer currently scans only Learning OS markers/items from Markdown notes.

It does not AI-scan arbitrary vault text.

---

# 4. Latest Design Decisions

## 4.1 Ask Stays JSON/JSONL

Ask jobs, clarification records, and logs remain JSON/JSONL because:

- they are event-like,
- human-readable,
- already stable,
- useful for debugging.

## 4.2 KnowledgeData Uses SQLite

KnowledgeData uses SQLite because:

- it is structured,
- relation-friendly,
- indexable,
- local-first,
- suited for concepts/items/evidence/source_refs.

Implementation uses `sql.js` ASM build.

## 4.3 Evidence Is Compact

Evidence should not store full prompts or raw AI answers.

Evidence should summarize:

- source type,
- signal type,
- strength/confidence,
- item/job/source links,
- short human-readable summary.

## 4.4 Coverage Is Not Mastery

Seeing a concept or writing a note about it gives coverage.

It does not prove mastery.

Mastery should eventually come from:

- review success,
- self-explanation,
- tests/quizzes,
- repeated correct recall,
- maybe AI-evaluated explanations.

## 4.5 Everything Heavy Is Explicit

No background full-vault scan.

No AI extraction unless user explicitly triggers it.

No per-keystroke edit tracking.

---

# 5. Current Module Map

## 5.1 Ask / Inbox / Apply

```text
src/main.ts
src/ask/
src/editor/
src/jobs/
src/views/
src/storage/
```

## 5.2 KnowledgeData

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
```

## 5.3 Docs

```text
docs/ADAPTIVE_LEARNING_OS_PLUGIN_DETAILS.md
docs/DATA_MODEL.md
docs/KNOWLEDGE_DATA_FOUNDATION.md
docs/context/
```

---

# 6. Verification Snapshot

Latest direct verification:

```text
TypeScript: passed
Tests: 133 passed
Production build: passed
```

Known environment note:

`pnpm build` may fail in Codex sandbox before running the build script because pnpm tries to reinstall/check dependencies against the registry. The underlying TypeScript + esbuild production commands passed.

---

# 7. What Is Still Not Done

Not implemented:

- Review Scheduler,
- dynamic review queue,
- review dashboard,
- AI Note Check,
- note quality checker,
- context pack generation,
- concept hierarchy inference,
- manual concept editing UI,
- direct arbitrary note indexing,
- PDF/PPT ingestion,
- raw -> transform -> extract -> tutorial pipeline,
- vector DB,
- web app,
- cloud sync,
- Anki integration.

---

# 8. Main Risks For Future Work

## 8.1 Scope Creep

The Master Plan mentions many future subsystems. Future Codex tasks must implement only the current phase brief.

## 8.2 Over-Automation

The user wants control. Avoid hidden scans, hidden AI calls, hidden note writes.

## 8.3 Context Explosion

KnowledgeData exists partly to avoid giant question logs.

Future AI calls should consume context packs, not the whole DB.

## 8.4 Incorrect Mastery

Do not treat coverage as mastery.

Mastery needs stronger evidence.

## 8.5 Breaking Ask Core

KnowledgeData should index outputs from Ask; it should not destabilize Ask / Inbox / Apply.

---

# 9. Recommended Next Conversation Prompt

For a new ChatGPT planning chat:

```text
I am continuing Adaptive Learning OS.

Please read:
1. docs/context/MASTER_PLAN.md
2. docs/context/CURRENT_STATUS.md
3. docs/context/DECISIONS.md
4. docs/context/Adaptive_Learning_OS_Context_Pack_After_Phase2_1.md

Do not write code yet.
First explain in Chinese:
1. your understanding of the system goal;
2. what Ask core already does;
3. what Phase 2.1 KnowledgeData added;
4. the biggest risks for the next phase;
5. what Phase 2.2 should probably focus on.
```

For a new Codex implementation chat:

```text
Please read:
1. docs/context/MASTER_PLAN.md
2. docs/context/CURRENT_STATUS.md
3. docs/context/DECISIONS.md
4. docs/context/PHASE_HANDOFFS/Phase2_1_KnowledgeData_Handoff.md
5. <new phase brief>

Use the context docs as background.
Implement only the new phase brief.
Do not implement unrelated roadmap items.
```

