# Codex Development Brief — Phase 2.1.2B Manual Bug Fix: Empty Edit Suggestion + Tip Duplication

Project: Adaptive Learning OS  
Repo path: `/Users/issiyua/Documents/Adaptive_Learning_OS`  
Task type: focused development / blocker fix  
Docs policy: compact report only; no broad docs/context maintenance

## 0. Role

This is a development/fix task based on user manual testing.

Do not implement unrelated features.  
Do not perform broad QA hardening beyond focused tests for these bugs.  
Do not update context packs, handoff docs, master plan docs, or broad architecture docs.  
Do not commit.

At the end, output compact implementation report and write it to:

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/REPORT_DEV_Phase2_1_2B_Manual_Bug_Fix.md
```

---

## 1. Bugs to fix

### Bug A — Generated block + generated request has AI answer but edit suggestion empty / Apply disabled

Inside `[!note]- ✍️ AI 生成内容`, user asks:

```text
讲一个这个的小故事
再编一个小故事
```

Observed:

```text
AI 回答 has a story.
解析结果 has key_answer / suggested_takeaway.
合并理由 has content.
编辑建议 shows (empty).
Sticky 应用建议 is disabled.
```

Expected:

```text
If AI answer / parsed result contains usable generated content:
- edit suggestion must not be empty
- inline draft should be created when staging is enabled
- Apply should be enabled
- Apply should write generated content to [!note]- ✍️ AI 生成内容
```

### Bug B — Generated block + clarification question should remain applyable

Inside `[!note]- ✍️ AI 生成内容`, user asks:

```text
这是什么？
```

Expected:

```text
Valid clarification answer should be applyable.
It should create/append [!tip]- 💡 我的理解 or another explicit clarification target.
It must not be stuck disabled when there is valid content.
```

### Bug C — Tip clarification duplicates entire tip block and existing item

Original:

```markdown
> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-20260705-212857-333-xls6lc-normal-note -->
>
> <!-- learnos-item-id: cloud-deployment-def -->
> **Cloud Deployment（云部署）** Cloud Deployment（云部署）是指将应用程序、服务或基础设施部署到云平台（如 AWS、Azure、Google Cloud）上的过程。本补充模块 E 将专门讲解云部署的相关概念、策略和实践方法。
```

Ask inside tip:

```text
这是什么？
```

Bad output:

```text
old tip remains
new copied tip appears
cloud-deployment-def appears twice
new AWS item is added to copied block
```

Expected:

```text
append new clarification item into existing live target tip
do not create copied second tip
do not duplicate cloud-deployment-def
existing live tip is source of truth
```

### Bug D — Tip generated request has story content but edit suggestion empty / Apply disabled

Inside `[!tip]- 💡 我的理解`, user asks:

```text
编一个小故事
```

Observed:

```text
AI answer contains story.
编辑建议 is empty.
Apply disabled.
No story inserted.
```

Expected:

```text
output kind generated-content
edit suggestion non-empty
Apply enabled
story goes to [!note]- ✍️ AI 生成内容
original tip not duplicated
existing item id not duplicated
```

---

## 2. Product principle

```text
source location ≠ output kind
```

Examples:

```text
Ask inside [!note] generated block + generated request
→ generated-content

Ask inside [!note] generated block + clarification request
→ clarification

Ask inside [!tip] clarification block + clarification request
→ clarification, append to same live tip

Ask inside [!tip] clarification block + generated request
→ generated-content
```

Do not infer output kind only from source container.

---

## 3. Implementation guidance

Likely files:

```text
src/ask/InlineDraftStaging.ts
src/ask/InlineDraftBlock.ts
src/jobs/ApplyAskJobProposal.ts
src/jobs/LiveClarificationState.ts
src/views/AskInboxState.ts
src/views/AskInboxView.ts
tests/inlineDraftStaging.test.mjs
tests/asyncInbox.test.mjs
```

Likely root causes:

```text
AI answer fallback path produces parse/merge text but no proposal item.
Proposal extraction requires strict item format and discards usable freeform content.
Apply enabled state depends on proposal.items, ignoring usable AI answer / parsed key_answer / live draft.
Inline draft staging creates no draft when fallback proposal lacks item despite usable AI answer.
Existing tip target is not used; fallback creates new clarification block from backend/stale items.
Live target parsing falls back to backend items and restores/duplicates old items.
```

Fix requirements:

```text
1. If generated-content intent has usable AI answer but no structured item, create safe generated-content fallback item/draft from AI answer.
2. If clarification intent has usable AI answer/key_answer but no structured item, create safe clarification fallback item/draft.
3. Do not create fallback item from truly empty/irrelevant answer.
4. Apply enabled state must consider live inline draft and non-empty editable suggestion.
5. Existing live target block must be preferred over creating copied block.
6. Do not duplicate existing learnos-item-id values.
7. Do not restore deleted/old siblings from backend fallback.
8. Preserve marker verification and rollback.
```

Do not fix by making Apply always enabled.  
Do not bypass marker verification.  
Do not relax preservation checks.

---

## 4. Required focused tests

### Test A — Generated block story fallback is not empty

Simulate source inside generated-content block, generated-story question, AI answer contains valid story, but structured item extraction fails.

Expected:

```text
edit suggestion non-empty
draft-kind = generated-content
Apply enabled
Apply writes generated-content
```

### Test B — Generated block clarification is applyable

Expected:

```text
draft-kind = clarification or explicit clarification output
Apply enabled
final output valid
```

### Test C — Tip clarification appends to existing live tip

Use Cloud Deployment fixture.

Expected:

```text
cloud-deployment-def appears exactly once
new AWS item appears once
no second copied tip block
existing clarification id preserved
```

### Test D — Tip generated story fallback is not empty

Expected:

```text
edit suggestion non-empty
draft-kind = generated-content
Apply enabled
story written to [!note]- ✍️ AI 生成内容
tip not duplicated
existing item id not duplicated
```

### Test E — Empty/no usable answer remains disabled

Expected:

```text
empty AI answer / no draft / no valid suggestion
→ Apply disabled
→ clear reason
→ no write
```

---

## 5. Preserve existing fixes

Do not regress:

```text
Inbox pending/detail not duplicated.
Sticky Apply exists and updates selected job.
Generated-from-tip previous fix.
Generated target deleted safe failure.
Sibling deletion not restored.
Multiple drafts same target safe.
Adjacent callout preservation.
KnowledgeData ignores drafts before Apply.
```

---

## 6. Verification commands

Run:

```bash
cd /Users/issiyua/Documents/Adaptive_Learning_OS

node ./node_modules/typescript/bin/tsc -noEmit -skipLibCheck
node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
node --loader ./tests/ts-extension-loader.mjs --test tests/inlineDraftStaging.test.mjs tests/asyncInbox.test.mjs
node esbuild.config.mjs production
git diff --check
```

---

## 7. Compact report

Write report to:

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/REPORT_DEV_Phase2_1_2B_Manual_Bug_Fix.md
```

Format:

```text
Phase / task:
Files changed:
Bug A fixed? yes/no:
Bug B fixed? yes/no:
Bug C fixed? yes/no:
Bug D fixed? yes/no:
Tests added/updated:
Verification:
- TypeScript:
- Focused tests:
- Full tests:
- Production build:
- git diff --check:
Docs/context updated? no/deferred:
Ready for QA? yes/no:
Recommended next step:
```

Do not commit.
