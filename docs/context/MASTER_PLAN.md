# Adaptive Learning OS - Master Plan

Version: 2026-07-05 repo context v5
Status: updated after Phase 2.1.2B Natural Inline Draft Staging implementation
Purpose: this is the first file to give a new ChatGPT or Codex conversation when continuing Adaptive Learning OS.

---

# 0. How To Use This File

This file is the product and system-context file for Adaptive Learning OS.

It should answer:

- What Adaptive Learning OS is trying to become.
- Why the current Obsidian plugin is not just a small Ask-AI feature.
- What the Ask / Inbox / Apply core already does.
- Why KnowledgeData exists.
- Which architectural principles must not be broken.
- Which future subsystems belong outside the current slice.

This file should not be treated as an executable development brief by itself.

When giving context to Codex, use this rule:

```text
Master Plan = product/system background.
Current Phase Brief = executable scope.
Codex must implement only the current Phase Brief.
```

For example:

```text
Please read:
1. docs/context/MASTER_PLAN.md
2. docs/context/CODEX_BRIEFS/<current phase brief>.md

Use the first file only as product/system context.
Implement only the second file's scope.
Do not implement the whole roadmap from the master plan.
```

When giving context to a new ChatGPT planning conversation, use:

```text
1. docs/context/MASTER_PLAN.md
2. docs/context/CURRENT_STATUS.md
3. docs/context/DECISIONS.md
4. docs/context/PHASE_HANDOFFS/<latest phase handoff>.md
5. The current or next phase brief, if one exists.
```

---

# 1. One-Sentence System Definition

Adaptive Learning OS is a local-first Obsidian-centered learning system that turns reading, asking, editing, reviewing, and source-processing into durable personal KnowledgeData so future explanations, reviews, and generated tutorials can adapt to what the learner has seen, misunderstood, corrected, and mastered.

It is not merely:

```text
select text -> ask AI -> paste answer
```

It is intended to become:

```text
learning sources
-> transformed learning materials
-> Obsidian reading and note editing
-> inline Ask for confusion
-> reviewed clarification / generated content
-> compact learning evidence
-> long-term KnowledgeData
-> adaptive review and tutorial generation
```

Current implementation note after Phase 2.1.2B:

```text
KnowledgeData now initializes and syncs automatically after verified Apply and conservative local note edits.
Manual rebuild/export/backup commands remain maintenance tools.
Experimental inline draft staging is implemented and default off.
Inline drafts let users edit pending Ask output in the note before Apply commits final markers.
Review scheduling, Note Check, source ingestion, tutorial pipeline, vector DB, web app, and cloud sync remain unimplemented.
```

---

# 2. The Original User Problem

The user is often learning from thick textbooks, lecture PDFs, PPTs, long tutorials, papers, technical documentation, or course notes.

The raw material is usually difficult because:

- It is too long.
- It is fragmented.
- It contains too much filler.
- It assumes background knowledge.
- It has important but under-explained concepts.
- It has formulas or technical details that are hard to internalize.
- It is hard to know what has been truly learned versus only skimmed.

The desired system should help with the whole learning process:

```text
raw source material
-> processed tutorial-style material
-> Obsidian reading workspace
-> ask questions at the exact point of confusion
-> review AI answers before they enter notes
-> preserve user-owned edits
-> record what was asked, corrected, reviewed, or mastered
-> build a long-term knowledge state
-> use that state to decide review priority and future explanation detail
```

The center of gravity is Obsidian. The user wants Obsidian to remain the main workspace, not a web app in v0.1 or v0.2.

---

# 3. Core Product Principles

## 3.1 Local-First

Core data should live locally, preferably inside the Obsidian vault in `.learning-os/`.

The plugin must not require:

- a cloud service,
- a web app,
- Anki,
- a vector database,
- a server process,
- background AI scans,
- automatic external upload of notes.

AI providers may be used only when the user explicitly asks or confirms a workflow that sends content.

## 3.2 Obsidian Is The Workspace

The Obsidian vault is the user's learning workspace and source of truth.

The plugin should use Obsidian APIs for:

- vault reads and writes,
- commands,
- modals,
- views,
- settings,
- context menus,
- note navigation.

The system should not move the main experience into a web app in early phases.

## 3.3 User Control Over AI Writes

AI is a proposal generator. It does not own the notes.

The system must not:

- auto-apply AI edits,
- silently overwrite note content,
- silently upgrade to expensive models,
- silently send large note contents to an AI provider,
- treat AI output as ground truth.

The user should review proposals before they affect notes.

## 3.4 Live Note Source Of Truth

The current Obsidian note content is more authoritative than old backend JSON snapshots.

If a user edits a visible clarification block, that edit matters.

If old job JSON disagrees with the live note, the live note wins unless the user explicitly chooses otherwise.

This principle exists because previous bugs showed that stale snapshots can overwrite newer user edits if Apply uses old state.

## 3.5 Stable IDs Over Text Matching

Visible text changes constantly.

Stable hidden IDs identify durable entities:

- `learnos-clarification-id`
- `learnos-generated-id`
- `learnos-item-id`
- Ask job IDs
- Knowledge concept IDs
- source reference IDs

Text matching can be used as a fallback, but identity should be ID-first.

## 3.6 Context Packs, Not Whole Databases

KnowledgeData should not become a giant prompt.

Future AI workflows should receive compact, relevant context packs:

```text
hot concept state
+ small number of relevant warm evidence summaries
+ current source context
```

They should not receive:

```text
entire ask history
entire KnowledgeData database
entire vault
all raw PDFs
all previous prompts and answers
```

## 3.7 Ask Plugin Is One Subsystem, Not The Whole OS

The current Obsidian plugin began as the Ask / Clarification workflow. That workflow is important, but it is only one subsystem.

Do not force every future feature into the Ask core.

Separate subsystems should exist for:

- KnowledgeData,
- Review,
- Learning Project Pipeline,
- Note Check / audit tools,
- context pack generation.

---

# 4. Major Subsystems

## 4.1 Subsystem A - Obsidian Ask Plugin / Interactive Learning Layer

Status: implemented and stable enough for real use.

Main purpose:

```text
When I am reading in Obsidian and do not understand something, I can ask at that exact place, review the answer, and save my understanding beside the source.
```

Responsibilities:

- selected-text Ask,
- Ask Modal,
- prompt preview,
- background Ask jobs,
- Learning OS Inbox,
- AI answer parsing,
- AI merge proposal,
- manual review before apply,
- clarification block insertion,
- generated content block insertion,
- experimental inline draft staging,
- follow-up questions on existing Learning OS items,
- source navigation,
- cleanup of orphan data,
- model routing.

This subsystem should continue to store raw Ask/job/history records in JSON and JSONL for readability and auditability.

It should not be migrated wholesale to SQLite in Phase 2.1.

Current inline draft note:

```text
Phase 2.1.2B added default-off natural inline draft staging.
Drafts use learnos-draft-* markers and never final learnos-item-id markers.
Apply reads live draft text, converts it into final clarification/generated-content items, verifies final markers, removes the draft, and then lets KnowledgeData sync from verified final content.
```

## 4.2 Subsystem B - KnowledgeData / Long-Term Knowledge State Layer

Status: Phase 2.1 foundation implemented.

Main purpose:

```text
What has the learner seen?
What concepts exist?
Which note-side items refer to those concepts?
What compact evidence supports coverage, confusion, correction, or mastery?
Which sources or Ask jobs are linked to that evidence?
```

Responsibilities:

- maintain concept records,
- distinguish abstraction level from mastery,
- maintain item index,
- maintain evidence records,
- maintain source references,
- support concept graph edges,
- provide export and backup,
- eventually generate context packs.

Phase 2.1 creates the local-first SQLite foundation but does not implement deep mastery intelligence.

## 4.3 Subsystem C - Review System / Dynamic Review Layer

Status: not implemented.

Future purpose:

```text
What should I review today, and how should my KnowledgeData change after review?
```

Future responsibilities:

- review queue generation,
- active recall prompts,
- self-explanation,
- AI or rule-based evaluation,
- review outcome logging,
- mastery updates,
- forgetting/stale state detection.

Important boundary:

Phase 2.1 intentionally does not implement Review Scheduler or spaced repetition.

## 4.4 Subsystem D - Learning Project Pipeline / Source Processing Layer

Status: not implemented.

Future purpose:

```text
Turn raw learning materials into usable learning tutorials and extracted knowledge structures.
```

Possible future layout:

```text
learning-project/
├── raw/
│   ├── textbook.pdf
│   ├── lecture.pptx
│   └── transcript.md
├── transform/
│   ├── textbook.markitdown.md
│   └── lecture.md
├── extract/
│   ├── concepts.json
│   ├── prerequisites.md
│   └── formulas.md
└── tutorial/
    └── ch03_tutorial.md
```

Possible future tools:

- markitdown,
- MinerU,
- docling,
- pandoc,
- pymupdf,
- OCR fallback,
- Codex / CLI scripts.

Important boundary:

Do not put PDF/PPT ingestion into the Ask plugin core in early phases.

## 4.5 Subsystem E - Note Check / Clean Note / Audit Tools

Status: not implemented as full system.

Future purpose:

```text
Check whether an item, clarification block, note, or tutorial is correct, concise, and review-ready.
```

Responsibilities may include:

- checking a single item,
- checking a clarification block,
- checking a tutorial before review,
- checking notes before an exam/project,
- generating `ai_check` evidence.

Important boundary:

Note Check should be a user-triggered low-frequency tool, not an automatic scan after every Ask.

---

# 5. Current Ask Core Capabilities

The Ask core has already solved many details that are easy to underestimate.

## 5.1 Plugin Foundation

Implemented:

- Obsidian plugin scaffold,
- TypeScript build,
- production bundle,
- settings,
- commands,
- ribbon icon,
- local `.learning-os/` data folder,
- OpenAI-compatible provider,
- Anthropic-compatible provider,
- DeepSeek preset,
- manual clipboard provider,
- UI language and answer language settings.

## 5.2 Selected Text Ask

Implemented:

- right-click selected text,
- floating Ask button,
- Ask Modal,
- user question input,
- prompt preview,
- per-Ask model choice,
- source context collection.

The prompt logic is user-intent-first:

```text
userQuestion = task
selectedText/sourceBlock/nearbyContext = context
```

This prevents the system from over-focusing on selected text when the user is actually asking for generation or a broader transformation.

## 5.3 Context Collection

The Ask system collects:

- selected text,
- note path,
- note title,
- heading path,
- source block,
- source block hash,
- source offsets as weak hints,
- nearby context before,
- nearby context after,
- existing clarification ID when relevant,
- target item ID when relevant,
- source mode.

Source modes:

```text
normal-note
clarification-item
generated-content-item
```

Important rule:

```text
Source mode is determined by the physical selection position, not merely by nearby metadata.
```

## 5.4 Background Ask Jobs

Implemented:

- queued / running / completed / failed / applied / archived status,
- JSON files in `.learning-os/ask-jobs/`,
- JSONL status logs,
- retry,
- regenerate,
- regenerate with Pro,
- re-merge,
- delete job record,
- open source.

Ask job storage remains JSON/JSONL because it is event-like, readable, and audit-friendly.

## 5.5 AI Answer Pipeline

Implemented:

1. AI answers the user question.
2. Parser extracts structured JSON when possible.
3. Markdown-in-JSON tolerance handles complicated markdown and LaTeX.
4. Raw-answer fallback prevents data loss.
5. Generated-content satisfaction checks catch answers that fail to generate requested content.
6. Warning strings surface issues in Inbox.
7. Markdown/LaTeX sanitizer cleans obvious formatting problems.
8. Parsed fields feed Inbox and merge proposal generation.

## 5.6 AI Merge Proposal

Implemented:

- create clarification,
- update item,
- add item,
- replace/append behavior where applicable,
- generated-content proposals,
- safe fallback proposal,
- visible markdown preview,
- merge reasoning,
- confidence.

Key distinction:

```text
AI answer = answer the user.
AI merge proposal = propose how to write reviewed learning content into the note.
```

## 5.7 Learning OS Inbox

Implemented:

- Running,
- Ready,
- Failed,
- History,
- job detail,
- Markdown/LaTeX preview,
- proposal textarea,
- previous/next navigation,
- apply,
- regenerate,
- regenerate with Pro,
- retry with Pro,
- re-merge,
- copy raw,
- copy parsed,
- copy proposal,
- open source,
- delete job record.

## 5.8 Clarification Blocks

Current visible format:

```markdown
> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-... -->
>
> <!-- learnos-item-id: item-... -->
> **Concept title** Explanation text.
```

Core rule:

```text
One source paragraph maps to one clarification block.
Multiple questions about the same paragraph become multiple items in the same block.
```

The user prefers one integrated Ask Card / clarification-style block, not separated `QUESTION`, `MY_UNDERSTANDING`, and `AI_ANSWER` blocks.

## 5.9 Generated Content Blocks

Current visible format:

```markdown
> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-... -->
>
> <!-- learnos-item-id: item-... -->
> **Title** Generated content.
```

Core rule:

```text
Generated content must not be disguised as "my understanding".
```

## 5.10 Apply Safety

Implemented:

- per-note apply lock,
- re-read current live note before apply,
- live-note-aware merge,
- item-level operations,
- preserve unrelated items,
- marker verification after write,
- rollback/failure behavior when expected markers are missing,
- source-deleted policy,
- no fake `applied` status when marker does not exist.

This is one of the most important safety achievements of Phase 1.

## 5.11 Cleanup

Implemented:

- cleanup orphan data,
- distinguish text edit from item deletion,
- item marker missing means item deleted,
- clarification marker missing means block deleted,
- deleting a job record does not delete note content,
- preview before destructive cleanup.

## 5.12 Model Routing

Implemented:

- default Ask model,
- deep model,
- model routing mode,
- Ask Modal Auto / Flash / Pro,
- normal Auto uses Flash by default,
- complex tasks may suggest Pro without silent upgrade,
- Inbox regenerate/retry with Pro,
- AskJob metadata for routing.

---

# 6. Phase 2.1 KnowledgeData Foundation - Implemented State

Phase 2.1 has added the first local-first KnowledgeData layer.

The implementation is additive. It does not change Ask / Inbox / Apply semantics.

## 6.1 Storage Layout

KnowledgeData storage lives under:

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

Existing Ask workflow storage remains:

```text
.learning-os/ask-jobs/
.learning-os/clarifications/
.learning-os/logs/
.learning-os/archive/
.learning-os/backups/
.learning-os/generated/
```

## 6.2 SQLite Decision

KnowledgeData uses SQLite via `sql.js`.

Why:

- Native modules such as `better-sqlite3` are risky in Obsidian plugin bundling/runtime.
- `sql.js` provides SQLite semantics without a native Node module.
- The implementation uses the ASM build to avoid shipping and locating a separate `.wasm` file.
- The DB remains a SQLite-format file at `.learning-os/knowledge/knowledge.sqlite`.

Build adjustment:

- esbuild now treats `node:`-prefixed builtin modules as external, because `sql.js` ASM references builtins such as `node:fs` and `node:crypto`.

## 6.3 Database Tables

Schema version: `1`

Implemented tables:

- `meta`
- `concepts`
- `concept_edges`
- `items`
- `evidence`
- `source_refs`
- `reviews` as future-ready table only

Implemented indexes:

- evidence by concept,
- evidence by item,
- evidence by created_at,
- items by note path,
- items by status,
- source refs by path,
- concept edges by parent and child.

## 6.4 Commands

Implemented Obsidian commands:

```text
Learning OS: Initialize KnowledgeData
Learning OS: Rebuild KnowledgeData Index
Learning OS: Export KnowledgeData Summary
Learning OS: Backup KnowledgeData
```

All commands are explicit. No startup scan, no hidden background scan, no per-keystroke tracking.

## 6.5 Rebuild Behavior

The rebuild command:

- initializes the DB if needed,
- scans current Markdown notes,
- indexes only Learning OS clarification/generated item markers,
- creates conservative concept candidates from item titles,
- upserts items,
- records source refs,
- creates compact evidence,
- links applicable Ask jobs to indexed items,
- detects content-hash changes as manual edits,
- marks previously active items as missing when live markers disappear,
- updates `meta.last_rebuild_at`.

It does not:

- AI-scan arbitrary notes,
- ingest PDFs or PPTs,
- perform review scheduling,
- infer a full ontology,
- duplicate full prompts or raw answers into evidence.

## 6.6 Exports

Implemented export files:

```text
.learning-os/knowledge/exports/concepts.json
.learning-os/knowledge/exports/knowledge_summary.json
.learning-os/knowledge/exports/mastery_summary.md
```

The exports keep SQLite from becoming an unreadable black box.

## 6.7 Backups

Implemented backup file:

```text
.learning-os/knowledge/backups/knowledge-YYYYMMDD-HHMMSS.sqlite
```

The backup command initializes the DB first if needed.

---

# 7. Important Bugfix Lessons That Shape Future Work

## 7.1 Apply Order Bugs

Previous issue:

```text
Multiple jobs on one note could apply out of order and overwrite each other.
```

Lesson:

- always re-read live note,
- use per-note locks,
- preserve existing markers,
- verify after write.

## 7.2 Fake Applied Status

Previous issue:

```text
Job said applied, but marker did not exist in note.
```

Lesson:

```text
Do not mark applied merely because code intended to write.
Mark applied only after marker verification.
```

## 7.3 Offset Drift

Previous issue:

```text
Inserted callouts changed offsets and source resolution drifted.
```

Lesson:

- offsets are weak hints,
- verify content,
- fallback to exact text, hash, and semantic block resolution.

## 7.4 Selected Text Overrode User Intent

Previous issue:

```text
User selected a word but asked for generated content; AI still explained the word.
```

Lesson:

```text
User question is the task.
Selected text is context.
```

## 7.5 Generated Content Entered "My Understanding"

Lesson:

```text
generation intent -> generated-content block
explanation intent -> clarification block
```

## 7.6 Learning OS Callout Pollution

Lesson:

```text
Context extraction for normal notes must skip Learning OS callouts atomically.
```

## 7.7 Source Mode Misclassification

Lesson:

```text
Source mode is physical-selection-based, not metadata-proximity-based.
```

---

# 8. KnowledgeData Modeling Principles

## 8.1 KnowledgeData Is Not A Giant Question Log

Do not create:

```text
question_log.md with every Ask and every answer forever
```

That will explode context and make future AI workflows unusable.

## 8.2 KnowledgeData Has Layers

Recommended model:

```text
Cold raw history
  full ask jobs, raw answers, old logs, archived refs

Warm evidence
  compact learning events: ask, apply, manual_edit, review, self_explanation

Hot concept state
  current concept summaries: coverage, mastery, confidence, weak points
```

AI should usually read:

```text
hot state + relevant warm evidence summaries
```

not:

```text
all cold raw history
```

## 8.3 Abstraction Level Is Not Mastery

These are different:

```text
abstraction_level = where the concept lives in the knowledge hierarchy
mastery = how well the learner knows it
```

Example:

```json
{
  "id": "object-detection",
  "abstractionLevel": 2,
  "mastery": 0.25
}
```

```json
{
  "id": "nms",
  "abstractionLevel": 4,
  "mastery": 0.7
}
```

Do not collapse these into one `level` field.

## 8.4 Evidence Is Required

Knowledge state must be evidence-backed.

Examples:

- Ask question -> mild confusion/learning evidence.
- Live note item -> coverage evidence.
- Manual edit -> correction evidence.
- Review success -> future mastery evidence.
- AI check -> future audit evidence.

Do not invent high mastery from merely seeing a concept.

## 8.5 Direct Manual Notes Matter

The user may learn by writing notes directly, without Ask.

Direct note content should eventually contribute `manual_note` evidence.

Phase 2.1 only indexes Learning OS item markers, but future phases may add explicit "index current note" commands.

## 8.6 Manual Edits Are Strong Signals

When the user edits a Learning OS item, it can signal correction, refinement, or changed understanding.

Phase 2.1 detects hash changes and records conservative `manual_edit` evidence.

It does not AI-diff the edit.

---

# 9. What Must Not Be Implemented Accidentally

Unless a future phase brief explicitly says so, do not implement:

- Review Scheduler,
- spaced repetition algorithm,
- AI Note Check scan,
- PDF/PPT parsing,
- raw -> transform -> extract -> tutorial pipeline,
- vector DB,
- web app,
- cloud sync,
- automatic AI concept extraction over the vault,
- background full-vault scanning,
- per-keystroke edit tracking,
- migration of Ask jobs to SQLite as primary storage,
- automatic AI edits to notes,
- automatic expensive model upgrades.

---

# 10. Recommended Context File Structure

The repo now keeps long-term context in:

```text
docs/context/
├── MASTER_PLAN.md
├── CURRENT_STATUS.md
├── DECISIONS.md
├── Adaptive_Learning_OS_Context_Pack_After_Phase2_1.md
├── PHASE_HANDOFFS/
│   └── Phase2_1_KnowledgeData_Handoff.md
├── CODEX_BRIEFS/
│   └── Codex_Phase2_1_KnowledgeData_Foundation_Brief.md
└── CODEX_REPORTS/
    └── Phase2_1_Implementation_Report.md
```

Future phases should follow the same pattern.

Every phase should end by updating:

- `MASTER_PLAN.md` if the overall system direction changed,
- `CURRENT_STATUS.md`,
- `DECISIONS.md`,
- a phase handoff,
- a Codex report,
- optionally a new context pack.
