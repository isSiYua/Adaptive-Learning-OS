---
name: feature-slice-development
description: Use when implementing a new feature. It forces a small vertical slice: UI entry point, data model, storage, visible result, and verification before expanding.
---

# Feature Slice Development Skill

Do not build large disconnected architecture before a working slice exists.

## Preferred workflow

For each feature, implement the smallest vertical slice:

1. User entry point.
2. Minimal data model.
3. Storage or state update.
4. User-visible result.
5. Test or manual verification.
6. Documentation note.

## Slice examples

### Ask Card slice

- Select text.
- Right-click `Ask Learning OS about selection`.
- Open modal.
- Build prompt.
- Insert one `>>> ASK_CARD ... <<<` block.
- Log the Ask Card.

### Review slice

- Load one due card.
- Show front.
- Reveal answer.
- Rate Again/Hard/Good/Easy.
- Update next due date.
- Append review log.

## Avoid

- Do not implement all planned modules before one user flow works.
- Do not create unused abstractions.
- Do not add vector database, Anki sync, or complex AI pipelines in v0.1.
