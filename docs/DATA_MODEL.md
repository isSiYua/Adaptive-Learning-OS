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
> <!-- learnos-clarification-id: clar-... -->
```

Legacy notes may still use the older marker after the callout:

```markdown
%% learnos-clarification-id: clar-... %%
```

Deleting a clarification JSON record can leave a dangling marker in the note if the note still contains that marker.

Deleting the visible clarification block from the note can leave an orphan clarification JSON record.

The stable identity is the `learnos-clarification-id`, not the visible wording. You can edit the visible explanation text, item titles, spacing, or phrasing in Obsidian. As long as the marker remains, Learning OS should locate the block by marker and treat edited visible text as the latest user-owned content.

Each clarification item also has a hidden item marker:

```markdown
> <!-- learnos-item-id: item-...; ask-ids: ask-... -->
> **synthesis** explanation text
```

The item marker lets Learning OS distinguish three different situations:

- the whole clarification block was deleted: the clarification id marker is missing
- one item was deleted: the block marker remains, but that item id marker is missing
- text was edited: markers remain, so cleanup should not delete anything

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

## `.learning-os/knowledge/`

SQLite-backed long-term KnowledgeData storage added in Phase 2.1.

Expected layout:

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

KnowledgeData is separate from Ask job history.

Ask job JSON answers:

```text
What happened in a specific Ask interaction?
```

KnowledgeData answers:

```text
What concepts/items/evidence/source references currently describe the learner's knowledge state?
```

The SQLite database currently contains:

- `meta`
- `concepts`
- `concept_edges`
- `items`
- `evidence`
- `source_refs`
- `reviews`

The `reviews` table is future-ready only. The Review Scheduler is not implemented.

KnowledgeData commands:

- `Learning OS: Initialize KnowledgeData`
- `Learning OS: Rebuild KnowledgeData Index`
- `Learning OS: Export KnowledgeData Summary`
- `Learning OS: Show KnowledgeData Global Summary`
- `Learning OS: Backup KnowledgeData`

The rebuild command is explicit and non-destructive. It scans live Markdown notes for Learning OS item markers, indexes compact item/concept/evidence/source-ref records, and writes to `knowledge.sqlite`. It does not modify note content, call AI, or scan arbitrary vault prose semantically.

Phase 2.1.1 added automatic KnowledgeData sync:

- auto-initialize on plugin load when KnowledgeData is enabled,
- auto sync after successful verified Apply,
- debounced note-level sync for modified Markdown notes that contain final Learning OS markers,
- content hash changes recorded as `manual_edit` evidence,
- missing known markers in the same note recorded as missing/deletion evidence.

Automatic sync is still local and marker-based. It does not run AI, scan the full vault in the background, or index draft-only `learnos-draft-*` markers.

The global summary command reports whole-vault/project KnowledgeData, not only the current note. Its item counts are split as:

- total indexed items: all `items` rows,
- active items: `status = 'active'`,
- missing/deleted items: `status in ('missing', 'deleted', 'orphan')`.

A current-note KnowledgeData summary command is a future enhancement, not part of Phase 2.1.1.

## Cleanup Terms

An orphan clarification record means a clarification JSON file exists, but no note contains its `learnos-clarification-id` marker.

A dangling note marker means a note contains a `learnos-clarification-id` marker, but the matching clarification JSON file is missing.

An orphan ask job means an ask job references a clarification that no longer exists or is no longer present in any note.

An archived ask job ready to purge means a job record has status `archived` and can be permanently removed from Inbox history if the user confirms.

An applied job missing marker means an ask job says it was applied, but the target clarification marker is no longer present in notes.

Cleanup uses stable IDs, not visible Markdown text. It scans all Markdown notes for live `learnos-clarification-id` markers, compares them with `.learning-os/clarifications/`, and then checks `.learning-os/ask-jobs/` for history records that reference deleted or missing clarification IDs.

Cleanup also scans live `learnos-item-id` markers. Text changes alone are never cleanup evidence. A backend item is considered deleted only when its item marker is missing from a live clarification block.

Ask job records can also store source/item identity fields such as `sourceAnchorKey`, `proposedItemId`, `targetItemId`, `appliedClarificationId`, and `appliedItemIds`. These fields let old completed jobs rebase against the current live note and let multiple jobs from the same source paragraph merge into one clarification block.

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

## Inline Draft Staging Markers

Phase 2.1.2B adds experimental default-off inline draft staging.

Drafts are visible Markdown callouts in the note, but they are not committed Learning OS knowledge until Apply succeeds.

Example:

```markdown
> [!todo]- 💡 Learning OS draft
> <!-- learnos-draft-id: draft-job-... -->
> <!-- learnos-draft-job-id: job-... -->
> <!-- learnos-draft-kind: clarification -->
> <!-- learnos-draft-operation: add-sibling-item -->
> <!-- learnos-draft-target-container-id: clar-... -->
> <!-- learnos-draft-target-item-id: item-... -->
> <!-- learnos-draft-target-item-hash: ... -->
> <!-- learnos-draft-source-block-hash: ... -->
> <!-- learnos-draft-created-at: ... -->
>
> <!-- learnos-draft-item-id: draft-item-... -->
> **Draft title** Draft explanation that the user may edit before Apply.
```

Draft markers intentionally use the `learnos-draft-*` namespace.

They must not be confused with committed markers:

- committed clarification block: `learnos-clarification-id`,
- committed generated-content block: `learnos-generated-id`,
- committed item: `learnos-item-id`,
- draft identity and draft item identity: `learnos-draft-*`.

KnowledgeData ignores drafts because drafts are proposals. A draft becomes KnowledgeData-indexable only after explicit Apply writes verified final markers.

Current supported draft operations:

- `add-item` for normal-note Ask staging,
- `add-sibling-item` for Ask inside existing clarification/generated-content blocks.

Not implemented in Phase 2.1.2B:

- existing item inline draft rewrite,
- whole-block rewrite,
- multi-item rewrite,
- Review Scheduler,
- Note Check,
- Context Pack Builder.
