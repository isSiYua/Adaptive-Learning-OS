# Adaptive Learning OS Context Pack After Phase 2.1.2B

Date: 2026-07-05  
Use case: give this file to a new ChatGPT or Codex conversation together with `docs/context/MASTER_PLAN.md`, `docs/context/CURRENT_STATUS.md`, and the next phase brief.

---

# 1. Current System Goal

Adaptive Learning OS is a local-first Obsidian-centered learning system.

The long-term product vision is:

```text
raw learning sources
-> transformed learning material
-> Obsidian reading and note editing
-> inline Ask at the exact point of confusion
-> reviewed clarification/generated content
-> compact KnowledgeData evidence
-> adaptive review and future tutorial/context generation
```

The current product is not a web app and not a cloud service. Obsidian is the main workspace. The vault remains the source of truth for note content.

AI is used only through explicit user workflows. AI output remains a proposal until the user commits it with Apply.

---

# 2. Completed Phases

## 2.1 Phase 1 Ask Core

Implemented:

- select text in Obsidian,
- open Ask Modal,
- ask AI or prepare prompt,
- parse AI response,
- store background Ask jobs,
- show jobs in Learning OS Inbox,
- edit merge proposal,
- Apply final content into the note,
- source navigation,
- cleanup/orphan detection,
- model routing with Auto / Flash / Pro.

Final visible explanatory content uses:

```markdown
> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-... -->
>
> <!-- learnos-item-id: item-... -->
> **Title** Explanation.
```

Explicit generated content uses:

```markdown
> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-... -->
>
> <!-- learnos-item-id: item-... -->
> **Title** Generated content.
```

## 2.2 Phase 2.1 KnowledgeData Foundation

Implemented:

- `.learning-os/knowledge/` storage,
- SQLite via `sql.js`,
- schema/bootstrap/migrations,
- `concepts`,
- `items`,
- `evidence`,
- `source_refs`,
- `concept_edges`,
- `meta`,
- future-ready `reviews` table,
- initialize/rebuild/export/backup/show summary commands.

Important:

KnowledgeData is separate from Ask job JSON. It is a compact long-term learning-state index, not a full prompt/answer log.

## 2.3 Phase 2.1.1 Automatic KnowledgeData Sync

Implemented:

- auto-initialize KnowledgeData on plugin load when enabled,
- sync after verified Apply,
- index live final markers,
- create conservative concept candidates from item titles,
- create compact apply/coverage and ask/confusion evidence,
- source_refs for note/item/job links,
- debounced note-level sync for Markdown notes with final Learning OS markers,
- manual edit hash detection,
- missing marker detection inside modified notes,
- settings for KnowledgeData enablement and auto-sync.

Not implemented:

- AI concept extraction,
- full-vault background scan,
- Review Scheduler,
- Note Check,
- vector DB,
- source ingestion,
- cloud sync.

## 2.4 Phase 2.1.2B Natural Inline Draft Staging

Implemented:

- experimental default-off inline draft staging setting,
- draft markers under `learnos-draft-*`,
- draft creation after completed Ask when enabled,
- normal-note draft insertion near source,
- Ask inside clarification block creates a draft below the same block,
- Ask inside generated-content block creates a draft below the same block,
- Apply reads live draft content,
- Apply merges draft back into target final block,
- Apply removes draft after successful verified write,
- deleted draft means no-op,
- missing target final block fails clearly and preserves draft,
- compact Inbox status messages,
- tests and docs.

Not implemented:

- existing item inline draft update,
- whole-block rewrite,
- multi-item rewrite,
- Review Scheduler,
- Note Check,
- Context Pack Builder.

---

# 3. Current Key Files

## 3.1 Ask Core

```text
src/main.ts
src/ask/AskModal.ts
src/ask/AskPromptBuilder.ts
src/ask/AiResponseParser.ts
src/ask/AskIntent.ts
src/ask/ClarificationBlock.ts
src/ask/ClarificationMergeProposal.ts
src/editor/SelectionContextCollector.ts
src/editor/SourceBlock.ts
src/jobs/AskJobService.ts
src/jobs/ApplyAskJobProposal.ts
src/jobs/LiveAwareMerge.ts
src/jobs/LiveClarificationState.ts
src/views/AskInboxView.ts
src/views/AskInboxState.ts
```

## 3.2 Inline Draft Staging

```text
src/ask/InlineDraftBlock.ts
src/ask/InlineDraftStaging.ts
```

Responsibilities:

- draft marker parsing/rendering,
- staging decisions,
- live draft Apply preparation,
- draft status messages,
- generated block target lookup.

## 3.3 KnowledgeData

```text
src/knowledge/KnowledgeTypes.ts
src/knowledge/KnowledgeDb.ts
src/knowledge/KnowledgeSchema.ts
src/knowledge/KnowledgeMigrations.ts
src/knowledge/KnowledgeRepository.ts
src/knowledge/KnowledgeMarkdownScanner.ts
src/knowledge/KnowledgeIndexer.ts
src/knowledge/KnowledgeSync.ts
src/knowledge/KnowledgeExport.ts
src/knowledge/KnowledgeBackup.ts
src/knowledge/KnowledgeCommands.ts
src/knowledge/ConceptNormalize.ts
```

## 3.4 Storage

```text
src/storage/FileStore.ts
src/storage/AskJobStore.ts
src/storage/ClarificationStore.ts
```

## 3.5 Tests

```text
tests/askCardParser.test.mjs
tests/askWorkflowUx.test.mjs
tests/asyncInbox.test.mjs
tests/inlineDraftStaging.test.mjs
tests/knowledgeAutoSync.test.mjs
tests/knowledgeData.test.mjs
tests/paragraphClarification.test.mjs
```

---

# 4. Current Settings

Important settings include:

```ts
enableKnowledgeData: true
autoSyncKnowledgeDataAfterApply: true
trackKnowledgeDataManualEdits: true
enableExperimentalInlineDraftStaging: false
```

The inline draft setting is default off.

---

# 5. Important Design Principles

## 5.1 Live Note Wins

The current Obsidian Markdown note is more authoritative than old JSON snapshots.

Apply must re-read the note before writing.

## 5.2 AI Is Proposal, Apply Is Commit

AI can propose content.

The user commits content with Apply.

Draft staging does not change this principle. Drafts are proposals until Apply writes final markers.

## 5.3 Draft Markers Are Separate From Final Markers

Draft markers:

```text
learnos-draft-*
```

Final markers:

```text
learnos-clarification-id
learnos-generated-id
learnos-item-id
```

KnowledgeData indexes final markers only.

## 5.4 Ask Source Mode Is Physical

Ask source mode should be based on where the user physically selected text:

```text
normal-note
clarification-item
generated-content-item
```

This prevents nearby metadata from incorrectly changing user intent.

## 5.5 Stable IDs Beat Text Matching

Use stable IDs as primary identity.

Visible text can be edited freely.

---

# 6. What Phase 2.1.2B Changed In Practice

Before Phase 2.1.2B:

```text
Ask inside an existing tip/generated block completed into Inbox only.
Apply used stored proposal/Inbox edited proposal.
No visible draft appeared in the note.
```

After Phase 2.1.2B, when enabled:

```text
Ask inside tip -> draft below tip -> Apply appends to same tip.
Ask inside generated block -> draft below generated block -> Apply appends to same generated block.
Normal note Ask -> draft near source -> Apply creates/updates final block.
```

Draft delete behavior:

```text
delete draft -> Apply no-op
```

Target missing behavior:

```text
target block missing -> Apply fails clearly, draft remains
```

---

# 7. Verification Snapshot

Latest verification used bundled Codex desktop Node:

```text
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc -noEmit -skipLibCheck
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node esbuild.config.mjs production
```

Results:

```text
TypeScript: passed
Tests: 148 passed
Production build: passed
```

Environment note:

The shell did not expose global `node`/`npm`. Bundled Node was used. A direct bundled `pnpm exec` attempt tried to do dependency maintenance and failed for lack of TTY confirmation before running TypeScript; this was not a project code failure.

---

# 8. Current Known Limitations

Inline draft limitations:

- default off,
- manual Obsidian QA still recommended,
- no existing item rewrite,
- no whole-block rewrite,
- no multi-item rewrite,
- compact status only, no dedicated draft manager UI.

KnowledgeData limitations:

- concept candidates are title-based,
- no AI extraction,
- no concept hierarchy inference,
- no context pack builder yet,
- mastery remains mostly placeholder without review evidence.

Product limitations:

- no Review Scheduler,
- no Note Check system,
- no raw source ingestion,
- no PDF/PPT pipeline,
- no vector DB,
- no web app,
- no cloud sync.

---

# 9. Recommended Context For Next Chat

For a new ChatGPT planning conversation:

```text
1. docs/context/MASTER_PLAN.md
2. docs/context/CURRENT_STATUS.md
3. docs/context/DECISIONS.md
4. docs/context/Adaptive_Learning_OS_Context_Pack_After_Phase2_1_2B.md
5. next phase brief
```

For a new Codex implementation conversation:

```text
1. docs/context/MASTER_PLAN.md as product/system context
2. docs/context/Adaptive_Learning_OS_Context_Pack_After_Phase2_1_2B.md as current repo context
3. next Codex brief as the only executable scope
```

Important instruction for Codex:

```text
Do not implement the whole roadmap from MASTER_PLAN.
Implement only the current phase brief.
```

---

# 10. Suggested Next Phase Options

Do not start these without a new brief.

## Option A - Phase 2.1.2B Manual QA Polish

Focus:

- manual Obsidian test results,
- status wording,
- draft target movement edge cases,
- generated-content block edge cases,
- accidental draft deletion recovery.

Do not add existing item rewrite unless explicitly requested.

## Option B - Phase 2.1.2C Existing Item Inline Draft Update

Focus:

- Ask inside item can stage an update draft,
- preserve original item hash,
- detect changed target item,
- fail or rebase safely,
- no whole-block rewrite unless explicitly confirmed.

## Option C - Phase 2.2 Knowledge Hierarchy / Context Packs

Focus:

- concept assignment/editing,
- lightweight hierarchy edges,
- first explicit context pack export command,
- no automatic AI full-vault extraction.

## Option D - Phase 3 Review Scheduler

Focus:

- only if the user gives a scheduler brief,
- use KnowledgeData evidence,
- keep review local-first and explicit.
