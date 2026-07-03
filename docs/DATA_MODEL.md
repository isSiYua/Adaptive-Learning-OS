# Learning OS Data Model

Adaptive Learning OS stores plugin data inside the vault folder configured by `dataFolder`, which defaults to `.learning-os/`.

## `.learning-os/ask-jobs/`

Async AI question tasks. One JSON file is one background Ask request shown in the Learning OS Inbox.

Job statuses:

- `queued`
- `running`
- `completed`
- `failed`
- `applied`
- `archived`
- `cancelled`

Deleting an ask job removes the task/history record from the Inbox. It does not remove the visible clarification from the note.

## `.learning-os/clarifications/`

Applied paragraph-level clarification records. One JSON file corresponds to one visible clarification block in a note.

The visible note block is linked to its backend record with a marker:

```markdown
%% learnos-clarification-id: clar-... %%
```

Deleting a clarification JSON record can leave a dangling marker in the note if the note still contains that marker.

Deleting the visible clarification block from the note can leave an orphan clarification JSON record.

## `.learning-os/ask-cards/`

Legacy data from the earlier Ask Card model. The paragraph-level clarification workflow should not create new ask-card records, but this folder is kept for backward compatibility and migration.

## `.learning-os/archive/`

Archived Learning OS records. Cleanup prefers archiving over permanent deletion when possible.

Common subfolders:

- `.learning-os/archive/ask-jobs/`
- `.learning-os/archive/clarifications/`

## `.learning-os/backups/`

Backups created before conversions, migrations, or potentially risky cleanup operations.

## `.learning-os/logs/`

Append-only JSONL audit logs for job and clarification changes. Cleanup does not delete logs by default.

## `.learning-os/config/`

Reserved for local Learning OS configuration or profile files.

## `.learning-os/generated/`

Reserved for generated prompts, patches, proposals, or other derived artifacts.

## Cleanup Terms

An orphan clarification record means a clarification JSON file exists, but no note contains its `learnos-clarification-id` marker.

A dangling note marker means a note contains a `learnos-clarification-id` marker, but the matching clarification JSON file is missing.

An orphan ask job means an ask job references a clarification that no longer exists or is no longer present in any note.

An archived ask job ready to purge means a job record has status `archived` and can be permanently removed from Inbox history if the user confirms.

An applied job missing marker means an ask job says it was applied, but the target clarification marker is no longer present in notes.

## Why Does a Deleted Note Block Still Appear in Inbox History?

Inbox history comes from `.learning-os/ask-jobs/`.

Visible note clarification blocks come from Markdown note content plus `.learning-os/clarifications/`.

That means manually deleting a visible `我的理解 / My Understanding` block from a note does not automatically delete the ask job history file. The note content is gone, but the old background Ask record can still exist in `.learning-os/ask-jobs/`.

Use `Clean unused records` to scan all Markdown files for live `learnos-clarification-id` markers and archive backend records that no longer correspond to visible note content. In particular, cleanup detects:

- orphan clarification records whose marker no longer exists in any note
- applied ask jobs whose target note marker is missing
- ask jobs referencing missing clarification JSON records
- dangling note markers whose backend JSON record is missing
- archived ask jobs that are eligible for purge

Use `Delete job record` when you only want to remove an Inbox history item. This does not delete note content.

A future `Remove clarification from note` action should be separate, explicit, and confirmed because it would edit the Markdown note itself.
