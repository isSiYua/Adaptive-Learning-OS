# Codex QA Task — Phase 2.1.2B Manual Bug Reproduction Verification

Project: Adaptive Learning OS  
Repo path: `/Users/issiyua/Documents/Adaptive_Learning_OS`  
Vault path: `/Users/issiyua/Desktop/Learning/Study`  
Task type: QA / bug reproduction first  
Docs policy: compact report only; no broad docs/context maintenance

## 0. Role

This replaces the previous unexecuted QA task for now because the user manually found concrete bugs. Treat the user's manual observations as source of truth.

Do not implement broad fixes in this QA conversation unless explicitly asked.  
Do not update broad docs/context.  
Do not commit.

Your job:

```text
1. Reproduce/validate the user's manual bugs with deterministic tests where possible.
2. Explain which current automated tests missed these bugs.
3. Produce a compact QA report.
4. If you add tests, they may be expected to fail before the development fix.
```

---

## 1. Manual bugs to verify

### Bug A — Generated block + generated request: AI answer has content, parsed result has content, edit suggestion empty, Apply disabled

Source:

```text
Inside [!note]- ✍️ AI 生成内容 block/item.
Request: 讲一个这个的小故事 / 再编一个小故事
```

Observed:

```text
AI 回答 contains a valid story.
解析结果 contains key_answer / suggested_takeaway.
合并理由 contains text.
编辑建议 is (empty).
Sticky 应用建议 / Apply button is disabled.
```

Expected:

```text
If AI answer / parsed result contains usable generated content:
- edit suggestion must not be empty
- generated-content inline draft or proposal should be created
- Apply should be enabled
- Apply should write to [!note]- ✍️ AI 生成内容
```

### Bug B — Generated block + clarification question should remain applyable

Source:

```text
Inside [!note]- ✍️ AI 生成内容 block/item.
Question: 这是什么？
```

Observed by user: seems mostly okay, but must still be tested.

Expected:

```text
Valid clarification answer should be applyable.
It should create/append [!tip]- 💡 我的理解 or another explicit clarification target.
It must not be stuck disabled when there is valid content.
```

### Bug C — Tip block + clarification question duplicates/copies entire tip block instead of appending

Original fixture:

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

Observed bad output:

```text
Old tip remains.
New copied tip block is created.
Existing item id cloud-deployment-def appears twice.
New AWS item is added into copied block.
```

Expected:

```text
Existing tip remains once.
cloud-deployment-def remains once.
New clarification item is appended to existing live target tip if safe.
No copied second tip block.
No duplicate existing item ids.
```

### Bug D — Tip block + generated request: story answer exists but edit suggestion empty / Apply disabled

Source:

```text
Inside [!tip]- 💡 我的理解.
Request: 编一个小故事
```

Observed:

```text
AI answer contains story content.
编辑建议 is (empty).
Apply disabled.
No story inserted.
```

Expected:

```text
draft-kind / output kind = generated-content
edit suggestion non-empty
Apply enabled
story goes to [!note]- ✍️ AI 生成内容
original tip not duplicated
existing item id not duplicated
```

---



这个问题，我又测试了一次之后，发现了 bug。我对 tip 中的内容进行 ask 编一个小故事，然后成功生成了故事，也能够 apply。但是在 apply 的之后，我发现，得到的内容很奇怪：他不仅有有个 generate block 块，下面还对这个 block 的内容进行了重复。比如下面这样子：
所以你一定要对这个地方的内容进行详细而深度的测试，查阅这些 bug 发生的可能性。

✍️ AI 生成内容

**这个小故事** 好的，给你讲一个关于云部署的小故事。
 从前有一家叫“风味小吃”的餐厅，老板小明自己租了一个小厨房（本地服务器），每天起早贪黑买菜、备料、炒菜、洗碗，厨房里堆满了锅碗瓢盆。生意越来越好，小厨房越来越挤，夏天热得厨师直冒汗，冬天水管还结冰。最要命的是，遇到节假日排队的人一多，厨房就瘫痪了——菜做不出来，客人抱怨不断。
 有一天，小明听朋友说有个“云厨房”服务，就像租用一个大商场的共享后厨：里面有专业设备、恒温空调、专人打扫，而且你想用多大面积就租多大，按小时付费。于是小明把自己的菜谱、调料伙计全部搬进了云厨房。客户从网上下单，云厨房自动分配炉灶、自动调控火力，人多时就自动增加灶台，人少时就缩减，小明再也不用操心维修、清洁和容量不足的问题了。他只需要专心研发新菜品，营业额翻了好几倍。
 这个“云厨房”就是云平台（比如AWS、Azure、Google Cloud），而把菜谱、设备和人员搬进去的过程，就是 **Cloud Deployment（云部署）**。

> 从前有一家叫“风味小吃”的餐厅，老板小明自己租了一个小厨房（本地服务器），每天起早贪黑买菜、备料、炒菜、洗碗，厨房里堆满了锅碗瓢盆。生意越来越好，小厨房越来越挤，夏天热得厨师直冒汗，冬天水管还结冰。最要命的是，遇到节假日排队的人一多，厨房就瘫痪了——菜做不出来，客人抱怨不断。
>  有一天，小明听朋友说有个“云厨房”服务，就像租用一个大商场的共享后厨：里面有专业设备、恒温空调、专人打扫，而且你想用多大面积就租多大，按小时付费。于是小明把自己的菜谱、调料伙计全部搬进了云厨房。客户从网上下单，云厨房自动分配炉灶、自动调控火力，人多时就自动增加灶台，人少时就缩减，小明再也不用操心维修、清洁和容量不足的问题了。他只需要专心研发新菜品，营业额翻了好几倍。
>  这个“云厨房”就是云平台（比如AWS、Azure、Google Cloud），而把菜谱、设备和人员搬进去的过程，就是 **Cloud Deployment（云部署）**。

## 2. Required deterministic tests

Prefer:

```text
tests/inlineDraftStaging.test.mjs
tests/asyncInbox.test.mjs
```

Use deterministic fixtures; do not rely on real AI calls.

### Test A1 — Generated block story fallback must not be empty

Simulate completed Ask job where:

```text
source is inside generated-content block
question = 讲一个这个的小故事
AI answer contains a valid story
parsed result has key_answer / suggested_takeaway
structured proposal item extraction fails or fallback path is used
```

Expected:

```text
edit suggestion non-empty
draft/proposal content generated
Apply/applyable state enabled
```

### Test A2 — Generated block + generated request applies generated-content

Fixture:

```markdown
> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-cloud-story -->
>
> <!-- learnos-item-id: item-cloud-story -->
> **claude 的小故事** Claude 发现自己有一个奇怪的能力。
```

Ask inside generated item:

```text
再编一个小故事
```

Expected:

```text
draft-kind = generated-content
edit suggestion non-empty
Apply enabled
Apply appends final item to generated-content block or safe generated block
original generated item remains once
draft removed after Apply
```

### Test B1 — Generated block + clarification question remains applyable

Expected:

```text
draft/proposal applyable when valid
clarification output written to valid [!tip]- 💡 我的理解 or explicit target
not stuck disabled
```

### Test C1 — Tip clarification appends without duplicating existing tip/item

Use Cloud Deployment fixture.

Expected:

```text
one target tip, not copied
learnos-item-id: cloud-deployment-def appears exactly once
new item aws-def appears once
no second copied tip containing cloud-deployment-def
```

### Test C2 — Existing live target tip preferred over copied block

Expected:

```text
Apply merges into live target block when target clarification id exists.
No new clarification block copied from backend/stale items.
```

### Test D1 — Tip generated request must not produce empty edit suggestion

Source: inside [!tip].

Ask:

```text
编一个小故事
```

Expected:

```text
edit suggestion non-empty
draft-kind = generated-content
Apply enabled
not forced into clarification
```

### Test D2 — Tip generated request applies generated-content

Expected:

```text
story goes to [!note]- ✍️ AI 生成内容
original tip remains once
existing item id remains once
no copied tip
draft removed after Apply
```

---

## 3. Also verify older fixes

Verify current tests still cover:

```text
Inbox pending/detail not duplicated.
Sticky Apply exists and updates selected job.
Live draft overrides stale disabled state.
Empty proposal with no draft remains disabled.
Sibling deletion is not restored.
Multiple drafts same target remain safe.
Adjacent callout boundaries preserved.
```

---

## 4. Commands

Run:

```bash
cd /Users/issiyua/Documents/Adaptive_Learning_OS

node ./node_modules/typescript/bin/tsc -noEmit -skipLibCheck
node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
node --loader ./tests/ts-extension-loader.mjs --test tests/inlineDraftStaging.test.mjs tests/asyncInbox.test.mjs
node esbuild.config.mjs production
git diff --check
```

If global node unavailable, use Codex bundled Node and report path.

---

## 5. Optional UI smoke

If cheap, reproduce in `/Users/issiyua/Desktop/Learning/Study`:

```text
1. [!note] generated block → ask “讲一个这个的小故事”
   Expected: edit suggestion non-empty, Apply enabled, story applied to [!note].

2. [!note] generated block → ask “这是什么？”
   Expected: Apply enabled, valid clarification output.

3. [!tip] → ask “这是什么？”
   Expected: append to existing tip, no copied tip, no duplicate existing item id.

4. [!tip] → ask “编一个小故事”
   Expected: edit suggestion non-empty, Apply enabled, story goes to [!note], no copied tip.
```

---

## 6. Compact report

Write report to:

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/REPORT_QA_Phase2_1_2B_Manual_Bug_Repro.md
```

Format:

```text
QA target:
Files/tests inspected:
Commands:
- TypeScript:
- Full tests:
- Focused tests:
- Production build:
- git diff --check:

Manual bug verification:
- Bug A generated block story edit suggestion empty:
- Bug B generated block clarification:
- Bug C tip clarification duplicates tip:
- Bug D tip generated story edit suggestion empty:

New tests added:
Expected failures:
Confirmed blockers:
Non-blocking gaps:
Docs/context updated? no/deferred:
Ready for fix brief? yes/no:
Recommended next step:
```

Do not commit.
