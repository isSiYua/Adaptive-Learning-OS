---
name: data-schema-migration
description: Use when creating or changing JSON/YAML schemas for concepts, Ask Cards, review items, logs, global index, settings, and future migrations.
---

# Data Schema and Migration Skill

This is a long-term learning system. User data must survive plugin upgrades.

## Rules

- Every stored JSON record should include `schemaVersion`.
- Do not silently discard unknown fields.
- Preserve old data during schema upgrades.
- Add migration functions when schemas change.
- Add fixtures/tests for migrations.
- Never delete user data automatically.
- Logs can be append-only JSONL.
- Current state files can be JSON.

## Records that need schema thinking

- Concept records
- Global index
- Ask Card logs
- Review items
- Review history
- Note check logs
- Provider presets
- Settings

## Versioning

Use simple numeric versions:

```json
{
  "schemaVersion": 1
}
```

If changing required fields, add a migration:

```ts
migrateConceptRecordV1ToV2(record)
```
