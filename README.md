# Adaptive Learning OS

Adaptive Learning OS is an Obsidian plugin for local-first learning workflows.

This initial vertical slice supports:

- selecting text in a note,
- right-clicking `Ask Learning OS about selection`,
- opening a quick Ask modal with selected text and heading context,
- submitting one or more questions as background Ask jobs,
- reviewing completed answers in the Learning OS Inbox opened from the left ribbon icon,
- editing and applying AI merge proposals only after review,
- inserting or updating one paragraph-level clarification block per source paragraph,
- storing Ask jobs in `.learning-os/ask-jobs/{{job_id}}.json`,
- appending Ask job status entries to `.learning-os/logs/ask-jobs-YYYY-MM.jsonl`,
- storing the full Clarification record in `.learning-os/clarifications/{{clarification_id}}.json`,
- appending summary entries to `.learning-os/logs/clarifications-YYYY-MM.jsonl`,
- updating the same clarification when selecting inside it or another term from the same source paragraph,
- letting AI decide whether to update an existing clarification item or add a new item,
- safely merging stale Inbox proposals into the latest clarification record instead of overwriting existing items,
- detecting manual visible-block edits before apply so they are not silently overwritten,
- cleaning orphan `.learning-os` records after visible clarification blocks are deleted,
- converting legacy `>>> ASK_CARD ... <<<` blocks into clean clarifications with external JSON.

It does not auto-send note content to an AI provider and does not auto-apply AI edits.

## Build

```bash
pnpm install
pnpm run build
```

For npm:

```bash
npm install
npm run build
```

## Test In Obsidian

1. Build the plugin.
2. Copy or symlink this repository into an Obsidian vault at `.obsidian/plugins/adaptive-learning-os`.
3. Enable community plugins, then enable `Adaptive Learning OS`.
4. Run `Learning OS: Initialize vault folders`.
5. Select text in a Markdown note.
6. Right-click and choose `Ask Learning OS about selection`.
7. Type a question and click `后台提问 / Ask in background`.
8. Continue reading or ask more questions.
9. Click the left ribbon Inbox icon, or run `Learning OS: Open Ask Inbox`.
10. Open a completed job under `待处理 / Ready to review`.
11. Review or edit the proposal textarea.
12. Click `应用建议 / Apply proposal`.
13. Confirm the note contains a clean paragraph-level block plus `%% learnos-clarification-id: clar-... %%`.
14. Confirm `.learning-os/ask-jobs/`, `.learning-os/clarifications/`, and `.learning-os/logs/` were written.
15. Ask another question from the same source paragraph; applying it should update the same block with another item or an AI-merged item.
16. To clean unused backend records after deleting visible clarification blocks, run `Learning OS: Clean unused Learning OS data / 清理未使用的 Learning OS 数据`.
