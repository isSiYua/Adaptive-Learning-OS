# FIX Phase 2.1.2B — Runtime Artifact Reproduction + Empty Proposal / Wrong Source Mode Hardening

Project: Adaptive Learning OS  
Task type: focused development / blocker fix  
Project repo: `/Users/issiyua/Documents/Adaptive_Learning_OS`  
Obsidian test vault: `/Users/issiyua/Desktop/Learning/Study`  
Report output: `/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/REPORT_DEV_Phase2_1_2B_Runtime_Artifact_Hardening.md`

---

## 0. Why this task exists

The user has repeatedly reproduced real Obsidian failures, but deterministic QA did not reproduce them.

The latest QA report explicitly says:

```text
- no live Obsidian UI smoke was performed
- real AI response variance was not tested
- deterministic fixtures simulated valid story/clarification content
```

Therefore, passing deterministic fixtures is not enough. The real runtime artifacts must now be inspected and converted into regression fixtures.

Treat the user's manual observations as source of truth.

---

## 1. Role and token-saving rule

This is a focused blocker-fix task.

Do not implement unrelated features.  
Do not perform broad docs/context maintenance.  
Do not rewrite context packs, handoff docs, master plan docs, or broad architecture docs.  
Do not commit.

Use Codex quota on:

```text
1. inspecting actual failing runtime records
2. identifying why current tests model the wrong payload/state
3. adding exact regression fixtures
4. applying narrow fixes
5. running deterministic verification
```

At the end, output a compact implementation report and write it to:

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/REPORT_DEV_Phase2_1_2B_Runtime_Artifact_Hardening.md
```

Required report format:

```text
Phase / task:
Runtime artifacts inspected:
Root cause A:
Root cause C:
Root cause D:
Files changed:
Tests/fixtures added:
Verification:
- TypeScript:
- Focused tests:
- Full tests:
- Production build:
- git diff --check:
Manual smoke still required? yes/no:
Docs/context updated? no/deferred:
Ready for QA? yes/no:
Recommended next step:
```

---

## 2. Read these files first

Read:

```text
docs/ai-workflow/reports/REPORT_QA_Phase2_1_2B_Manual_Bug_Repro.md
```

Inspect relevant implementation:

```text
src/ask/InlineDraftStaging.ts
src/ask/InlineDraftBlock.ts
src/ask/ClarificationMergeProposal.ts
src/jobs/AskJobService.ts
src/jobs/ApplyAskJobProposal.ts
src/jobs/LiveClarificationState.ts
src/views/AskInboxState.ts
src/views/AskInboxView.ts
src/main.ts
tests/inlineDraftStaging.test.mjs
tests/asyncInbox.test.mjs
tests/paragraphClarification.test.mjs
```

Do not assume the existing tests represent the actual failing job shape.

---

# PART A — Inspect actual runtime artifacts before changing code

## 3. Find the real failing Ask job records

The failing cases occurred in the real vault:

```text
/Users/issiyua/Desktop/Learning/Study
```

Likely runtime locations include:

```text
/Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs/
/Users/issiyua/Desktop/Learning/Study/.learning-os/logs/
/Users/issiyua/Desktop/Learning/Study/.learning-os/clarifications/
```

Search for recent jobs using question text and note path:

```text
讲一个这个的小故事
讲一个这个的小故事哦
再编一个小故事
编一个小故事
这是什么
测试.md
```

Suggested read-only search:

```bash
rg -n '讲一个这个的小故事|再编一个小故事|编一个小故事|这是什么|测试\.md' \
  /Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs \
  /Users/issiyua/Desktop/Learning/Study/.learning-os/logs \
  /Users/issiyua/Desktop/Learning/Study/.learning-os/clarifications
```

Do not mutate or delete real vault runtime records.

## 3.1 Capture the actual field shape

For each matching failing job, inspect and compare:

```text
job id
question
note path
selected text
source mode
source block
source block hash
existing clarification id
existing generated id
target item id
target container id
Ask intent / output kind
AI answer
parsed answer
key_answer
suggested_takeaway
satisfaction/check result
merge proposal
proposal operation
proposal items
visible/editable markdown
inline draft metadata
inline draft staging result
applyDisabledReason
job status
timestamps
```

Do not copy full private content into docs. Use the minimum needed test fixture in the test source.

## 3.2 Build regression fixtures from actual runtime records

Create sanitized test fixtures that preserve the exact runtime shape responsible for failure.

The purpose is to answer:

```text
Why do idealized fixtures pass while the real job produces:
- AI answer non-empty
- parsed result non-empty
- merge reason non-empty
- edit suggestion empty
- Apply disabled
```

Do not replace the actual shape with a cleaner synthetic fixture.

---

# PART B — User-observed blockers

## 4. Bug A — Generated block story request produces empty edit suggestion

### Real behavior

Inside an existing:

```markdown
> [!note]- ✍️ AI 生成内容
```

the user asks:

```text
讲一个这个的小故事
再编一个小故事
```

The Inbox shows:

```text
AI 回答: contains a valid story
解析结果: contains key_answer / suggested_takeaway
合并理由: contains text
编辑建议: (empty)
应用建议: disabled
```

This is a blocker.

### Expected invariant

```text
If the final AI answer contains usable generated content,
the pipeline must either:

A. produce non-empty editable/generated-content markdown and allow Apply,

or

B. explicitly fail the job with a truthful reason.

It must never silently produce:
AI answer non-empty + edit suggestion empty + completed pending job.
```

### Required fix direction

Inspect the real payload and harden the proposal boundary.

Possible causes to verify, not assume:

```text
- generated satisfaction checker incorrectly rejects a valid story
- parser returns fields but proposal builder expects another schema
- fallback proposal has merge reason but no proposal item
- generated-content item formatter receives empty title/body
- source mode or target container is wrong
- job completes before inline draft staging updates persisted state
- UI reads stale persisted proposal before draft/proposal refresh
```

Use the actual job record to determine the cause.

---

## 5. Bug C — Tip clarification duplicates the whole tip block

### Real behavior

Original live tip:

```markdown
> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-20260705-212857-333-xls6lc-normal-note -->
>
> <!-- learnos-item-id: cloud-deployment-def -->
> **Cloud Deployment（云部署）** Cloud Deployment（云部署）是指将应用程序、服务或基础设施部署到云平台（如 AWS、Azure、Google Cloud）上的过程。本补充模块 E 将专门讲解云部署的相关概念、策略和实践方法。
```

After asking inside that tip:

```text
这是什么？
```

Apply produced:

```text
- original tip remained
- a second tip was created
- cloud-deployment-def was copied into the second tip
- the new AWS item was appended to the copied tip
```

### Strong clue that must be investigated

The generated clarification/container IDs shown by the user ended with:

```text
-normal-note
```

even though the user asked from inside an existing tip item.

This suggests a possible real source-classification failure:

```text
actual UI selection inside tip
→ recorded as normal-note
→ normal-note Apply creates a new clarification block
→ old live tip remains
→ backend/source content gets copied
```

Current tests may directly construct `clarification-item`, bypassing the real context collection/classification path.

### Required fix direction

Verify the actual failing job's:

```text
sourceMode
existingClarificationId
targetItemId
targetContainerId
selection/source offsets
```

Then inspect the real selection/context collection path used from Obsidian reading/editor view.

Correct invariant:

```text
Physical selection inside a live Learning OS tip item
must resolve to clarification-item
with the live clarification id and item id.

Apply must append the new item to that live tip.
It must not create a new copied tip.
```

Also add a final safety invariant:

```text
No Apply result may contain the same learnos-item-id more than once.
```

If a duplicate pre-existing item ID would be written, abort/rollback with a clear error instead of saving duplicated blocks.

---

## 6. Bug D — Tip generated request produces empty edit suggestion

### Real behavior

Inside:

```markdown
> [!tip]- 💡 我的理解
```

the user asks:

```text
编一个小故事
```

The AI answer contains a story, but:

```text
编辑建议 is empty
Apply disabled
```

### Expected

```text
source location = clarification item
output kind = generated-content

The valid story must produce:
- non-empty generated-content editable suggestion/draft
- enabled Apply
- final [!note]- ✍️ AI 生成内容
- original tip preserved once
- existing item IDs preserved once
```

This may share the proposal/fallback root cause with Bug A, but do not assume; inspect both actual jobs.

---

## 7. Bug B — Generated block clarification sanity case

The user says this appears mostly okay:

```text
Inside [!note] generated content → ask “这是什么？”
```

Keep it covered so the fixes for A/C/D do not break it.

Expected:

```text
non-empty clarification suggestion/draft
Apply enabled
final clarification in [!tip] or explicit intended clarification target
```

---

# PART C — Required implementation invariants

## 8. Proposal completeness invariant

Before a completed job is shown as pending:

```text
If AI answer is non-empty and the requested operation is applyable,
the job must have at least one of:

- non-empty editable proposal markdown
- valid live inline draft
- explicit non-applyable failure state with reason
```

Do not allow:

```text
completed + pending + non-empty answer + empty edit suggestion + no draft
```

## 9. Source-mode correctness invariant

Real selection/context extraction must correctly distinguish:

```text
normal-note
clarification-item
generated-content-item
```

Do not only test manually constructed job objects.

Add tests through the actual context/source classification helper using markdown offsets/ranges matching:

```text
selection inside clarification item
selection inside generated-content item
selection near adjacent callouts
```

## 10. Live target invariant

If a live target clarification/generated container exists:

```text
Apply must operate on that live container.
Do not rebuild a second block from backend/stale items.
Do not copy existing live items into a new container.
```

## 11. Unique marker invariant

After Apply, verify:

```text
each learnos-item-id appears at most once in the note
each target container id appears at most once
```

At minimum, enforce this for the IDs touched by the current Apply plus all pre-existing protected IDs.

On violation:

```text
rollback
do not mark applied
show clear preservation/duplicate-marker failure
```

## 12. UI state refresh invariant

After proposal/draft staging:

```text
Inbox applyability must be recomputed from latest persisted job + latest live draft.
```

Do not keep stale `applyDisabledReason` when a live draft or editable proposal now exists.

---

# PART D — Required tests

## 13. Test from exact real failing job payload

Add at least one sanitized fixture based on the actual stored failing job for:

```text
generated block + story request
```

Assert:

```text
AI answer non-empty
parsed result non-empty
editable suggestion non-empty after fix
Apply enabled
generated-content draft/proposal exists
```

## 14. Test real source classification inside tip

Use actual markdown and selection offsets/ranges through the context collector.

Assert:

```text
sourceMode = clarification-item
existing clarification id detected
target item id detected
not normal-note
```

Do the same for generated-content item:

```text
sourceMode = generated-content-item
generated container id detected
target item id detected
```

## 15. Test exact Cloud Deployment duplicate scenario end-to-end

Start with the user's exact live tip fixture.

Run the same classification → proposal/draft → Apply path used by production.

Assert:

```text
one tip block
cloud-deployment-def exactly once
new aws-def exactly once
no second clarification container
no duplicate item IDs
```

Do not directly inject a perfect `clarification-item` job if production classification is part of the bug.

## 16. Test story fallback for both source modes

Test:

```text
generated-content-item + generated story request
clarification-item + generated story request
```

Use payloads where:

```text
AI answer contains a story
parsed answer has partial/odd fields
structured merge proposal item is missing or malformed
```

Expected:

```text
safe non-empty generated-content fallback
Apply enabled
```

## 17. Test truly unusable answer

Keep safety:

```text
empty/refusal/unrelated answer
→ no fabricated item
→ Apply disabled or job failed with clear reason
```

Do not enable Apply unconditionally.

## 18. Test duplicate marker rollback

Attempt to apply output that would duplicate an existing item id.

Expected:

```text
write rejected or rolled back
job not marked applied
clear duplicate marker reason
```

---

# PART E — Minimal runtime diagnostics

## 19. Add compact diagnostics to existing logs

Because this bug depends on real AI/runtime variance, add compact metadata to the existing job log/reporting path.

Do not store another full answer copy.

Recommended fields:

```text
resolvedSourceMode
resolvedTargetContainerId
resolvedTargetItemId
resolvedOutputKind
proposalBuildOutcome
proposalFallbackUsed
proposalFallbackReason
editableMarkdownLength
inlineDraftStageOutcome
applyDisabledReason
applyabilitySource: proposal | live-draft | none
```

This is not a new product feature; it is narrow diagnostic hardening.

It should make future screenshots/job records explain why an edit suggestion became empty.

---

# PART F — Verification

## 20. Commands

Run:

```bash
cd /Users/issiyua/Documents/Adaptive_Learning_OS

node ./node_modules/typescript/bin/tsc -noEmit -skipLibCheck
node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
node --loader ./tests/ts-extension-loader.mjs --test \
  tests/inlineDraftStaging.test.mjs \
  tests/asyncInbox.test.mjs \
  tests/paragraphClarification.test.mjs
node esbuild.config.mjs production
git diff --check
```

If global Node is unavailable, use Codex bundled Node and report the path.

## 21. Optional live smoke

After deterministic tests, if possible, use the real vault only for a minimal smoke:

```text
1. generated block → 编一个小故事
2. tip block → 这是什么
3. tip block → 编一个小故事
```

Do not delete or rewrite unrelated vault content.

---

## 22. Non-goals

Do not implement:

```text
Review Scheduler
Note Check
Context Pack Builder
PDF/PPT ingestion
vector DB
web/cloud
whole-block rewrite
multi-item rewrite
prompt cache optimization
new KnowledgeData features
```

Do not broadly refactor the Ask pipeline unless the actual runtime root cause requires a small shared invariant.

Do not commit.

---

## 23. Expected end state

```text
- Real failing job artifacts inspected.
- Existing tests corrected to model real runtime payloads.
- Non-empty valid answer can no longer silently produce empty edit suggestion.
- Real selection inside tip/generated item resolves to correct source mode.
- Existing tip is appended to, not copied.
- Duplicate item IDs are rejected/rolled back.
- Compact runtime diagnostics explain future proposal/apply failures.
- Full tests/build pass.
- Ready for separate QA conversation.
```
