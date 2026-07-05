# Adaptive Learning OS Context Docs

This folder is the long-term memory package for future ChatGPT and Codex conversations.

Use these files instead of relying on old chat history.

---

# 1. New ChatGPT Conversation

For planning, discussion, or design:

```text
1. docs/context/MASTER_PLAN.md
2. docs/context/CURRENT_STATUS.md
3. docs/context/DECISIONS.md
4. docs/context/Adaptive_Learning_OS_Context_Pack_After_Phase2_1_1.md
```

Suggested prompt:

```text
I am continuing Adaptive Learning OS.

Please read these files first:
1. docs/context/MASTER_PLAN.md
2. docs/context/CURRENT_STATUS.md
3. docs/context/DECISIONS.md
4. docs/context/Adaptive_Learning_OS_Context_Pack_After_Phase2_1_1.md

Do not write code yet.
First explain in Chinese:
1. your understanding of the system goal;
2. what Ask core already does;
3. what Phase 2.1/2.1.1 KnowledgeData added;
4. the biggest risks for the next phase;
5. what the next phase should focus on.
```

---

# 2. New Codex Conversation

For implementation:

```text
1. docs/context/MASTER_PLAN.md
2. docs/context/CURRENT_STATUS.md
3. docs/context/DECISIONS.md
4. docs/context/PHASE_HANDOFFS/<latest phase handoff>.md
5. docs/context/CODEX_BRIEFS/<current phase brief>.md
```

Suggested prompt:

```text
Please read these files:
1. docs/context/MASTER_PLAN.md
2. docs/context/CURRENT_STATUS.md
3. docs/context/DECISIONS.md
4. docs/context/PHASE_HANDOFFS/Phase2_1_1_Auto_KnowledgeData_Sync_Handoff.md
5. <new phase brief>

Use the first four files as product/system context.
Implement only the new phase brief.
Do not implement unrelated roadmap items.
```

---

# 3. File Roles

## `MASTER_PLAN.md`

The world model.

Explains:

- what Adaptive Learning OS is,
- why it is not just an Ask plugin,
- major subsystems,
- durable principles,
- roadmap boundaries.

## `CURRENT_STATUS.md`

The current implementation snapshot.

Explains:

- what works now,
- what files/modules matter,
- what was just completed,
- what is not done.

## `DECISIONS.md`

The durable decision log.

Explains:

- product decisions,
- storage decisions,
- Ask workflow decisions,
- KnowledgeData decisions,
- scope boundaries.

## `PHASE_HANDOFFS/`

Phase-level handoffs for future conversations.

Use when continuing after a completed phase.

## `CODEX_BRIEFS/`

Executable task briefs for Codex.

These should define what Codex may implement.

## `CODEX_REPORTS/`

Implementation reports after Codex work.

These record:

- files changed,
- behavior added,
- verification,
- known limitations.

## `TEMPLATES/`

Reusable templates for future phases.

Use these when creating:

- a new Codex phase brief,
- a new Codex implementation report,
- a new phase handoff,
- a new context pack.

## `Adaptive_Learning_OS_Context_Pack_After_Phase2_1_1.md`

The latest compact context pack after Phase 2.1.1.

Use it when a new chat needs the freshest state quickly.

---

# 4. Maintenance Rule

At the end of every future phase, update or create:

```text
docs/context/CURRENT_STATUS.md
docs/context/DECISIONS.md
docs/context/PHASE_HANDOFFS/<phase>.md
docs/context/CODEX_REPORTS/<phase>.md
docs/context/Adaptive_Learning_OS_Context_Pack_After_<phase>.md
```

Update `MASTER_PLAN.md` when the long-term system direction changes.

Use the templates in `docs/context/TEMPLATES/` to keep future phase docs consistent.
