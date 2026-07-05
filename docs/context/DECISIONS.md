# Adaptive Learning OS - Decisions Log

Version: 2026-07-05 after Phase 2.1.1  
Purpose: record durable architectural/product decisions so future conversations do not re-litigate them accidentally.

---

# 1. Product Direction Decisions

## D001 - Obsidian Is The Main Workspace

Decision:

Adaptive Learning OS should keep Obsidian as the main workspace in early phases.

Implications:

- Build as an Obsidian plugin.
- Store core data in the vault.
- Use Obsidian APIs for file access and UI.
- Do not build a web app in v0.1 or Phase 2.1.
- Do not move primary learning flows out of Obsidian.

## D002 - Local-First By Default

Decision:

All core learning records should be local-first.

Implications:

- Default storage lives under `.learning-os/`.
- No cloud sync requirement.
- No server requirement.
- No automatic remote upload.
- AI calls happen only through explicit user workflows.

## D003 - AI Is Proposal Generator, Not Note Owner

Decision:

AI can propose answers, clarifications, merges, and future checks, but the user owns the note.

Implications:

- No automatic note mutation after AI response.
- Inbox review remains mandatory before Apply.
- AI-generated merge proposal is editable.
- Apply must preserve user changes.

## D004 - Do Not Auto-Send Notes To AI

Decision:

The plugin must not silently send notes or vault content to AI providers.

Implications:

- Ask sends explicit selected/context content.
- Prompt preview remains important.
- Future Note Check or Knowledge extraction must be explicit and user-triggered.
- No background AI full-vault scan.

---

# 2. Ask Workflow Decisions

## D101 - One Source Paragraph Maps To One Clarification Block

Decision:

A source paragraph should have one evolving clarification block.

Implications:

- Multiple questions about the same paragraph create/update items in the same block.
- Avoid scattering many separate blocks under one paragraph.
- Cleanup and KnowledgeData can use stable markers.

## D102 - Use One Integrated Block, Not Split QUESTION/MY_UNDERSTANDING/AI_ANSWER Blocks

Decision:

The user wants one integrated block.

Rejected pattern:

```markdown
>>> QUESTION
...
<<<

>>> MY_UNDERSTANDING
...
<<<

>>> AI_ANSWER
...
<<<
```

Preferred direction:

```markdown
>>> ASK_CARD
...
<<<
```

Current rendered form:

```markdown
> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-... -->
>
> <!-- learnos-item-id: item-... -->
> **Title** Explanation.
```

## D103 - User Question Is The Task

Decision:

Selected text is context. User question is the actual task.

Implications:

- If the user asks for generated content, generate content.
- Do not force every Ask to explain selected text.
- Prompt builder should preserve user intent.

## D104 - Generated Content Is Not "My Understanding"

Decision:

Generated stories/examples/tutorial snippets/translations/etc. should not be stored as clarification/my-understanding content.

Implications:

- Use generated-content block with `learnos-generated-id`.
- Keep generated content separate from learner understanding.

## D105 - Live Note Wins Over Backend Snapshot

Decision:

When applying, live note content is the source of truth.

Implications:

- Re-read note before Apply.
- Detect manual visible-block edits.
- Preserve unrelated live items.
- Do not overwrite live edits with stale JSON.

## D106 - Stable IDs Beat Text Matching

Decision:

Learning OS identities should use hidden stable IDs.

Implications:

- `learnos-clarification-id`,
- `learnos-generated-id`,
- `learnos-item-id`,
- Ask job IDs,
- Knowledge concept IDs,
- source refs.

Visible text is mutable and should not be the primary identity.

## D107 - Draft Items Are Not Committed Knowledge

Decision:

Inline staged drafts, when implemented, must use separate draft markers and must not be indexed into KnowledgeData.

Implications:

- Draft marker family is `learnos-draft-*`.
- Drafts must not use final `learnos-item-id` before Apply.
- KnowledgeData scans final markers only.
- Apply/Commit is the boundary where a proposal becomes KnowledgeData-indexable.
- Phase 2.1.1 includes only draft parser/design/test skeleton, not the user-facing staged draft workflow.

Reason:

The user wants easier in-note editing of pending proposals, but the system principle remains: AI output is a proposal until explicit Apply.

---

# 3. Storage Decisions

## D201 - Ask Jobs Stay JSON/JSONL

Decision:

Ask workflow raw/history storage remains JSON/JSONL.

Reasons:

- Ask jobs are event-like.
- JSON is human-readable.
- JSON is easy to debug.
- Existing workflow is stable.
- Migrating all Ask jobs to SQLite would be risky and unnecessary in Phase 2.1.

Implications:

```text
.learning-os/ask-jobs/*.json
.learning-os/logs/*.jsonl
.learning-os/clarifications/*.json
```

remain primary storage for Ask workflow.

## D202 - KnowledgeData Uses SQLite

Decision:

Long-term KnowledgeData should use SQLite.

Reasons:

- structured relations,
- indexes,
- local single-file DB,
- concept/item/evidence/source relations,
- future graph/review queries.

Implications:

```text
.learning-os/knowledge/knowledge.sqlite
```

is primary KnowledgeData storage.

## D203 - SQLite Implementation Uses `sql.js`

Decision:

Use `sql.js` rather than native Node SQLite packages.

Reasons:

- Obsidian plugin bundling/runtime is not friendly to native modules.
- `better-sqlite3` and similar packages may break install/runtime.
- `sql.js` avoids native compilation.

Implementation detail:

- Use `sql.js/dist/sql-asm.js` to avoid separate `.wasm` file handling.

## D204 - SQLite Must Have Human-Readable Exports

Decision:

SQLite should not become an opaque black box.

Implications:

Commands export:

```text
concepts.json
knowledge_summary.json
mastery_summary.md
```

Future context packs should also be file-based and readable.

## D205 - KnowledgeData Auto Sync Is Additive And Non-Blocking

Decision:

KnowledgeData should update automatically during normal plugin usage, but it must not become the owner of Apply semantics.

Implications:

- KnowledgeData can auto-initialize on plugin load.
- KnowledgeData can sync after successful Apply.
- KnowledgeData can sync debounced note-level marker changes.
- KnowledgeData sync failure after Apply must not make the already-applied note change invalid.
- Manual Initialize/Rebuild/Export/Backup commands remain available.
- Rebuild remains the repair path when the index is stale.

Reason:

The user should not need to manually rebuild after every Ask/Apply/edit, but the mature Ask/Inbox/Apply workflow must remain the safety boundary.

## D206 - Automatic KnowledgeData Sync Is Marker-Based, Not Semantic Extraction

Decision:

Automatic KnowledgeData sync uses only local deterministic signals.

Allowed signals:

- final `learnos-clarification-id`,
- final `learnos-generated-id`,
- final `learnos-item-id`,
- item title normalization,
- content hash changes,
- missing final item markers,
- existing Ask job/item links.

Rejected in Phase 2.1.1:

- AI concept extraction,
- AI note checking,
- full-vault background scanning,
- vector embeddings,
- PDF/PPT ingestion,
- tutorial pipeline,
- cloud sync.

Implications:

KnowledgeData evidence created in Phase 2.1.1 is conservative. `coverage`, `confusion`, `correction`, and `stability` evidence do not claim mastery.

## D207 - KnowledgeData Summary Defaults To Global Scope

Decision:

The existing Show Summary command is a global whole-vault/project KnowledgeData summary.

Implications:

- User-facing command label is `Learning OS: Show KnowledgeData Global Summary`.
- Notice title is `KnowledgeData Global Summary`.
- Counts represent the whole KnowledgeData database, not only the active note.
- Item counts should distinguish total indexed items, active items, and missing/deleted items.
- A current-note scoped KnowledgeData summary can be added later as a separate command.

Reason:

KnowledgeData is not a per-file cache. Concepts, evidence, items, and source refs can connect across many notes in the same local learning project.

---

# 4. KnowledgeData Modeling Decisions

## D301 - KnowledgeData Is Not A Giant Ask Log

Decision:

Do not store every full question/answer/prompt as the hot KnowledgeData state.

Implications:

- Full raw history can remain cold JSON/JSONL.
- Evidence should be compact.
- Concept state should be compressed.
- AI should consume context packs, not whole history.

## D302 - Distinguish `abstraction_level` From `mastery`

Decision:

Knowledge hierarchy position and learner mastery are separate fields.

Implications:

```text
abstraction_level = hierarchy/detail level
mastery = user knowledge strength
```

Do not collapse them into one `level`.

## D303 - Evidence Is The Basis For Knowledge State

Decision:

Coverage/mastery/confidence should be traceable to evidence.

Evidence sources may include:

- `ask`,
- `apply`,
- `manual_note`,
- `manual_edit`,
- `delete`,
- `review`,
- `self_explanation`,
- `ai_check`,
- `tutorial_generation`,
- `import`,
- `rebuild`.

Signals may include:

- `coverage`,
- `confusion`,
- `correction`,
- `mastery`,
- `forgetting`,
- `misconception_candidate`,
- `stability`.

## D304 - Seeing Or Writing A Concept Is Coverage, Not Mastery

Decision:

A note item proves the concept was seen/covered. It does not prove mastery.

Implications:

- Phase 2.1 gives small positive coverage.
- Mastery remains low/zero unless future review/self-explanation evidence supports it.

## D305 - Manual Edits Are Important Evidence

Decision:

When a user changes a Learning OS item, that should be tracked as learning evidence.

Phase 2.1 implementation:

- content hash changes create conservative `manual_edit` / `correction` evidence.
- no AI diff analysis yet.

## D306 - Missing Source Does Not Delete Knowledge

Decision:

If a source note, raw file, tutorial, or item disappears, concept/evidence should remain.

Implications:

- mark item/source ref missing/deleted/archived,
- do not automatically delete learning history.

---

# 5. Scope Boundary Decisions

## D401 - Phase 2.1 Does Not Implement Review Scheduler

Decision:

No spaced repetition or review queue in Phase 2.1.

## D402 - Phase 2.1 Does Not Implement Note Check AI Scan

Decision:

No AI note audit or scan in Phase 2.1.

## D403 - Phase 2.1 Does Not Implement Raw Pipeline

Decision:

No PDF/PPT ingestion, raw->transform->extract->tutorial pipeline, OCR, or document parsing in Phase 2.1.

## D404 - Phase 2.1 Does Not Implement Vector DB

Decision:

No vector DB in Phase 2.1.

## D405 - Phase 2.1 Does Not Implement Cloud Sync

Decision:

No cloud sync in Phase 2.1.

## D406 - Phase 2.1 Does Not AI-Extract Concepts From The Whole Vault

Decision:

No automatic AI full-vault concept extraction in Phase 2.1.

Implementation:

- explicit rebuild command,
- marker-based scan,
- conservative title heuristics.

---

# 6. Verification Decisions

## D501 - Meaningful Code Changes Need TypeScript, Tests, Build

Decision:

Before declaring implementation complete, run:

```text
TypeScript
tests
production build
```

Known environment note:

The repo's `pnpm build` may trigger dependency status/install behavior in this Codex environment. If that wrapper fails before running the script due to sandboxed registry access, verify direct underlying commands and report the limitation.
