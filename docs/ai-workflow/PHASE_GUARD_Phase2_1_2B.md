# Phase Guard - Phase 2.1.2B

Status: finalized and frozen  
Scope: Ask / Inbox / Inline Draft / Apply / Learning OS callout parser baseline

## Frozen Behaviors

Future changes must preserve these behaviors unless a new Bug Inventory, DEV brief, and explicit user approval say otherwise.

1. Normal note Ask can generate either a clarification draft or a generated-content draft according to user intent.
2. In a `clarification-item`, a clarification request updates/appends to the current tip container, while a generation request creates a generated-content block below the current tip.
3. In a `generated-content-item`, a generated request appends to the current generated block, while a clarification request creates a tip block below the current generated block.
4. Apply uses the live inline draft in the note when a live draft exists.
5. A deleted inline draft makes Apply a safe no-op for that draft job.
6. After successful Apply, no draft marker or draft body remains in the note.
7. Adjacent tip/note callouts are not parsed as one giant container.
8. Selection inside Learning OS content maps to the real `containerId` and `itemId`.
9. `siblingLearningOsItems` contains only items from the same container.
10. Complex callout draft/final insertion remains anchored around the real source block.
11. Duplicate-marker safety is preserved:
    - unrelated historical duplicates do not block safe Apply,
    - ambiguous current targets roll back safely and preserve the draft.
12. Normal-note new items must not use a fixed `item-1` ID.
13. Inbox source display uses the actual Ask source, not a stale or unrelated source.
14. Generated examples/stories are valid generated answers and must not be reduced to empty edit suggestions.
15. Unicode compatibility characters must not cause a bad rejection when the parsed content is otherwise usable.
16. Ask jobs record processing stage and timing diagnostics.
17. KnowledgeData ignores draft markers and indexes only final committed markers.

## Required Regression Gate

Any future change touching Ask, Inbox, Draft, Apply, Learning OS source mapping, or callout parsing must run:

- TypeScript check.
- Focused regression tests:
  - `tests/asyncInbox.test.mjs`
  - `tests/inlineDraftStaging.test.mjs`
  - `tests/paragraphClarification.test.mjs`
  - `tests/askWorkflowUx.test.mjs`
- Full test suite.
- Production build.
- Real Obsidian smoke test for at least one normal-note Ask, one tip Ask, one generated-content Ask, and one Inbox sticky Apply path.

## Phase Boundary

Phase 2.1.2B is finalized. The next stage has not started.

Candidate next work is KnowledgeData Foundation / Knowledge hierarchy and context pack planning, but it requires a separate brief before development begins.
