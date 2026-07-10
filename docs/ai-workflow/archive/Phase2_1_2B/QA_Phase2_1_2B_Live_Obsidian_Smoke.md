# QA Phase 2.1.2B — Live Obsidian Smoke Verification

Project repo:
`/Users/issiyua/Documents/Adaptive_Learning_OS`

Obsidian vault:
`/Users/issiyua/Desktop/Learning/Study`

Task type:
Live runtime/UI smoke verification after Runtime Artifact Hardening

Report output:
`/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/REPORT_QA_Phase2_1_2B_Live_Obsidian_Smoke.md`

---

## 0. Purpose

Deterministic tests already passed, but earlier bugs only appeared in the real Obsidian runtime with real Ask-job state and real AI output.

This task must test the actual plugin UI and actual persisted runtime state.

Do not replace these checks with synthetic fixtures only.

Do not commit.

Do not update broad `docs/context`.

---

## 1. Vault safety

Allowed test notes:

- `测试.md`
- `未命名.md`
- `不明白.md`
- other notes in the vault except the excluded file below

Hard exclusion:

- Never modify, rename, delete, or use as a test target:
  `/Users/issiyua/Desktop/Learning/Study/How to Use AI.md`

Preferred approach:

- Create a temporary QA note:
  `/Users/issiyua/Desktop/Learning/Study/QA/Phase2_1_2B/Runtime_Smoke.md`
- Or use `测试.md` if an exact old runtime path must be reproduced.
- Do not mass-edit the vault.
- Preserve unrelated note content and Learning OS markers.

Before testing, confirm the plugin path is a symlink to the repo and run the latest production build.

---

## 2. Required live smoke cases

### Case A — Generated block → generated story request

Start from an existing:

```markdown
> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: ... -->
>
> <!-- learnos-item-id: ... -->
> **Existing generated item** ...
```

Ask:

```text
再编一个小故事
```

Pass criteria:

- AI answer may vary, but it contains usable story content.
- `编辑建议` is not empty.
- Inline draft appears when staging is enabled.
- Sticky `应用建议` is enabled.
- Apply writes generated content into the same or a safe generated-content block.
- Original generated item remains once.
- Draft disappears after Apply.
- No duplicate `learnos-item-id`.

Fail evidence to capture:

- screenshot of AI answer / parsed result / merge reason / empty edit suggestion
- job id
- note path
- relevant final markdown
- `applyDisabledReason` if visible in runtime record

### Case B — Generated block → clarification request

Inside the same generated-content item, ask:

```text
这是什么？
```

Pass criteria:

- Non-empty clarification draft/edit suggestion.
- Apply enabled.
- Apply creates/appends a valid `[!tip]- 💡 我的理解`.
- Generated block is not duplicated.
- Draft disappears.

### Case C — Tip block → clarification request

Start from:

```markdown
> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-smoke -->
>
> <!-- learnos-item-id: item-smoke-base -->
> **Cloud Deployment（云部署）** ...
```

Ask inside the item:

```text
这是什么？
```

Pass criteria:

- Source resolves as clarification item, not normal note.
- Apply appends the new clarification item to the existing live tip.
- The original tip remains exactly once.
- `item-smoke-base` appears exactly once.
- No copied second tip.
- No duplicate item IDs.

### Case D — Tip block → generated story request

Inside the same tip item, ask:

```text
编一个小故事
```

Pass criteria:

- `编辑建议` is not empty.
- Output kind is generated-content.
- Apply enabled.
- Story is written to `[!note]- ✍️ AI 生成内容`.
- Original tip remains once.
- Existing tip item ID remains once.
- No copied tip.
- Draft disappears.

### Case E — Inbox UI regression check

With one or more pending jobs:

- Click Refresh.
- Switch `待处理 → 处理中 → 待处理`.
- Select previous/next pending items.
- Scroll a long selected job detail.

Pass criteria:

- One pending list/header.
- One selected detail panel.
- No duplicated pending UI.
- Exactly one sticky `应用建议` button.
- Sticky Apply remains visible while scrolling.
- Sticky Apply updates for the selected job.
- No duplicate non-sticky primary Apply button.

---

## 3. Evidence collection

For every failed case, record:

- case name
- note path
- job id
- question
- source mode
- target container id
- target item id
- output kind
- whether inline draft exists
- editable markdown length
- Apply enabled/disabled
- `applyDisabledReason`
- before markdown excerpt
- after markdown excerpt
- screenshot path if available

Do not write long prose. Preserve exact facts.

---

## 4. Automated verification to rerun

Run:

```bash
cd /Users/issiyua/Documents/Adaptive_Learning_OS

node ./node_modules/typescript/bin/tsc -noEmit -skipLibCheck
node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
node esbuild.config.mjs production
git diff --check
```

Use Codex bundled Node if global Node is unavailable.

---

## 5. Compact report format

Write:

```text
QA target:
Plugin runtime path:
Build used:

Automated verification:
- TypeScript:
- Full tests:
- Production build:
- git diff --check:

Live smoke:
- Case A generated → story:
- Case B generated → clarification:
- Case C tip → clarification:
- Case D tip → story:
- Case E Inbox UI:

Failures:
- case:
- job id:
- exact symptom:
- sourceMode:
- outputKind:
- editableMarkdownLength:
- applyDisabledReason:
- markdown result:

Blockers:
Non-blocking gaps:
Docs/context updated? no/deferred:
Ready to commit? yes/no:
Recommended next step:
```

Do not commit.
