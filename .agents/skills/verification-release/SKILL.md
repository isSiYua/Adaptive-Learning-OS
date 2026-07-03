---
name: verification-release
description: Use after implementing a feature, before declaring completion, before commits/releases, and when debugging build/test/manual verification failures.
---

# Verification and Release Skill

Do not claim done until verified.

## Standard verification

After meaningful code changes:

1. Run formatter/linter if configured.
2. Run TypeScript build.
3. Run tests.
4. Manually verify the relevant Obsidian command flow.
5. Check generated `.learning-os/` files.
6. Check no destructive write happened.
7. Update README/docs if behavior changed.

## Minimum manual checks for MVP

- Plugin loads.
- Commands appear.
- Right-click selected text menu appears.
- Ask Modal opens.
- Ask Card inserts correctly.
- Ask Card parser reads inserted block.
- JSONL log appends.
- Note check reports missing sections.
- Review card can be rated.
- Context pack can be generated.

## Reporting

When reporting completion, include:

- Files changed
- Commands run
- Tests passed/failed
- Manual checks done
- Known limitations
