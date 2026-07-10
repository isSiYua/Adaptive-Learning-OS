# Adaptive Learning OS — Semi-Automated AI Workflow Guide

Project repo:

```text
/Users/issiyua/Documents/Adaptive_Learning_OS
```

Recommended workflow folder inside the repo:

```text
docs/ai-workflow/
  incoming/
  reports/
  archive/
```

---

## 1. Folder roles

### `docs/ai-workflow/incoming/`

Put ChatGPT-generated task files here.

Examples:

```text
DEV_Phase2_1_2B_Generated_Block_Ask_Apply_Fix.md
QA_Phase2_1_2B_Generated_Block_Ask_Apply_Post_Fix.md
FIX_Phase2_1_2B_Inbox_UI_Regression.md
FINALIZE_Phase2_1_2B_Context_Update.md
```

Codex should read task files from this folder.

### `docs/ai-workflow/reports/`

Codex should write compact reports here.

Examples:

```text
REPORT_DEV_Phase2_1_2B_Generated_Block_Ask_Apply_Fix.md
REPORT_QA_Phase2_1_2B_Generated_Block_Ask_Apply_Post_Fix.md
REPORT_FIX_Phase2_1_2B_Inbox_UI_Regression.md
```

The user copies these reports back to ChatGPT for planning.

### `docs/ai-workflow/archive/`

Archive completed task files and reports after a phase is stable.

Recommended structure:

```text
docs/ai-workflow/archive/
  Phase2_1_2B/
    incoming/
    reports/
    final/
```

Use archive only after QA passes and the task/report pair is no longer active. Do not spend Codex quota over-organizing archive during normal development. Archive can be done during phase-finalization.

---

## 2. Naming convention

Use prefixes:

```text
DEV_       development task
QA_        verification task
FIX_       bug-fix task
REPORT_    Codex compact report
FINALIZE_  phase-finalization task
```

Recommended naming format:

```text
<type>_<phase>_<short_task>.md
```

Avoid generic names like `brief.md`, `task.md`, `qa.md`, or `report.md`.

---

## 3. ChatGPT output rule

When the user asks ChatGPT to generate a development or QA task, ChatGPT should provide:

```text
1. A downloadable .md task file
2. The intended destination path under docs/ai-workflow/incoming/
3. A short Codex prompt that tells Codex exactly which file to read
```

Example:

```text
File:
DEV_PhaseX_Task.md

Suggested destination:
每次都清楚告诉用户放到：
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/incoming/DEV_PhaseX_Task.md

Prompt for Codex:
请读取并执行：
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/incoming/DEV_PhaseX_Task.md

项目 repo：
/Users/issiyua/Documents/Adaptive_Learning_OS

不要更新大 docs/context，不要 commit。执行完成后把 compact report 写到：
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/REPORT_DEV_PhaseX_Task.md
```

---

## 4. Codex development prompt template

```text
请读取并执行这个开发任务文件：

/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/incoming/<DEV_OR_FIX_FILE>.md

项目 repo：
/Users/issiyua/Documents/Adaptive_Learning_OS

如果任务涉及 Obsidian UI smoke test，测试 vault 是：
/Users/issiyua/Desktop/Learning/Study

请严格遵守任务文件里的 scope、non-goals 和 token-saving rule。
不要更新大 docs/context，除非任务文件明确要求。
不要 commit。
完成后请输出 compact implementation report，并同时写入：

/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/<REPORT_FILE>.md
```

---

## 5. Codex QA prompt template

```text
请读取并执行这个 QA 任务文件：

/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/incoming/<QA_FILE>.md

项目 repo：
/Users/issiyua/Documents/Adaptive_Learning_OS

Obsidian 测试 vault：
/Users/issiyua/Desktop/Learning/Study

请优先执行 deterministic tests。Computer Use / Obsidian smoke test 只做任务文件要求的最小范围。
不要做新功能开发。
不要更新大 docs/context。
不要 commit。
完成后请输出 compact QA report，并同时写入：

/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/<REPORT_FILE>.md
```

---

## 6. Compact implementation report format

```text
Phase / task:
Task type: development / fix

Files changed:
- ...

Behavior implemented:
- ...

Tests added/updated:
- ...

Verification:
- TypeScript:
- Focused tests:
- Full tests:
- Production build:
- git diff --check:

Bugs found:
- ...

Bugs fixed:
- ...

Known limitations:
- ...

Docs/context updated?
- no/deferred / yes

Ready for QA?
- yes/no

Ready to commit?
- yes/no

Recommended next step:
- ...
```

---

## 7. Compact QA report format

```text
QA target:

Commands:
- TypeScript:
- Focused tests:
- Full tests:
- Production build:
- git diff --check:

Coverage:
- feature A:
- feature B:
- regression C:
- UI smoke:

Blocker bugs:
- ...

Non-blocking gaps:
- ...

Worktree:
- broad docs/context changes present? yes/no:
- main.js rebuilt? yes/no:

Ready to commit?
- yes/no

Recommended next step:
- ...
```

---

## 8. Token-saving policy

Brief/task files should be detailed enough to prevent Codex misunderstanding.

Do not save tokens by under-specifying development tasks.

Save Codex quota by:

```text
keeping Codex reports compact
deferring broad docs/context updates
avoiding unrelated file reads
avoiding broad refactors
separating development and QA conversations
```

Default policy:

```text
Small development / fix / QA:
  no broad docs/context updates

Phase stable / commit/tag/finalization:
  update docs/context in one batch
```

---

## 9. Recommended phase-finalization

When a phase is stable and ready for commit/tag, run a separate finalization task.

Finalization can:

```text
update CURRENT_STATUS.md
update DECISIONS.md if needed
update a context pack
archive incoming/report files
suggest commit/tag message
```

Do not do finalization during every small bug-fix task.

---

## 10. Phase 2.1.2B Finalized Baseline

Status:

```text
Phase 2.1.2B Natural Inline Draft Staging: Completed / Finalized
Final real QA: Pass
Automated verification: TypeScript pass; focused tests 178/178 pass; full tests 196/196 pass; production build pass
Build hash: 62d69a8f367a36481c97bc3888f9ff73211157f7662d660852b163345af93b4a
Final report: docs/ai-workflow/reports/REPORT_FINALIZE_Phase2_1_2B.md
Phase guard: docs/ai-workflow/PHASE_GUARD_Phase2_1_2B.md
Next candidate: KnowledgeData Foundation / Knowledge hierarchy and context pack planning
```

The next candidate is not started. It needs a separate DEV brief before Codex changes runtime code.
