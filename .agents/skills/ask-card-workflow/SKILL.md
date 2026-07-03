---
name: ask-card-workflow
description: Use for all work involving selected-text questions, Ask Modal, Ask Cards, Ask Card parsing, Ask Card insertion, and compression of user confusion.
---

# Ask Card Workflow Skill

The user's core interaction is inline selected-text questioning inside Obsidian.

## Core requirement

Use one integrated block only:

```markdown
>>> ASK_CARD
id: ask-...
concept: ridge-regression
status: resolved
source_sentence: "..."
question: "..."
key_answer: "..."
my_takeaway: "..."
mastery_signal: weak
review_needed: true
created: 2026-07-03T14:30:12+02:00
<<<
```

Do not split the interaction into separate `QUESTION`, `MY_UNDERSTANDING`, and `AI_ANSWER` blocks.

## User flow

1. User selects a confusing sentence.
2. User right-clicks.
3. Menu item: `Ask Learning OS about selection`.
4. Plugin collects selected text, heading path, compact nearby context, detected concept, related weak points.
5. Ask Modal opens.
6. User types question.
7. AI or manual provider answers.
8. User edits `key_answer` and `my_takeaway`.
9. Plugin inserts a concise Ask Card near the selected sentence.
10. Full AI answer is stored in JSONL log by default, not in the note.

## Note bloat prevention

- Do not store the full AI answer in the note unless user enabled that setting.
- Ask Card should preserve the confusion signal and final takeaway, not the whole conversation.
- Later concept notes should compress Ask Cards into a `Personal clarification` section.

## Parser requirements

- Parse all fields between `>>> ASK_CARD` and `<<<`.
- Be tolerant of missing optional fields.
- Preserve unknown fields where possible.
- Log parse errors without destroying content.
