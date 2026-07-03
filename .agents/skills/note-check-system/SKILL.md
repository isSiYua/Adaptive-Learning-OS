---
name: note-check-system
description: Use when implementing note quality check, AI check prompts, suggested patches, concept note validation, lesson note validation, and Ask Card compression into personal clarification.
---

# Note Check System Skill

The note check has two layers:

1. Rule-based check.
2. AI-assisted check prompt or provider call.

## Rule-based check

For concept notes, check:

- frontmatter exists
- `concept_id` exists
- Core idea section
- Intuition section when useful
- Formula section if mathematical
- Example section
- Common mistakes section
- Personal clarification section if concept has weak points or Ask Cards
- Related notes section
- Active recall section
- Sources section
- No excessive raw Ask Cards in final concept note
- No empty placeholder sections

For lesson notes, check:

- source metadata
- clear learning objective
- explanation is more than a summary
- examples for difficult parts
- Ask Cards are parsable
- concepts are detected
- potential review cards exist

## AI check

Generate an AI check prompt containing:

- user profile
- note type
- current note
- concept record
- compact Ask Card summaries
- relevant context pack
- check criteria

AI should check:

- conceptual correctness
- formula correctness
- verbosity/repetition
- missing important details
- Ask Card compression quality
- personal clarification accuracy
- active recall quality
- suggested mastery update
- suggested review adjustment

## Patch policy

- Never auto-apply AI patches.
- Always create suggested patches or preview them.
- Keep original note safe.
