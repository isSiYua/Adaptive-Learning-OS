import { answerLanguageInstruction } from "./ClarificationUpdatePromptBuilder";
import type { AskRequest } from "../types";

export function buildAskPrompt(request: AskRequest): string {
  const context = request.context;

  return `# Learning OS Inline Question

You are helping the user understand a selected sentence from an Obsidian learning note.

${answerLanguageInstruction(request.context.answerLanguage ?? "auto")}

## User question

${request.userQuestion}

## Selected sentence

${request.selectedText}

## Source block

${request.context.sourceBlock || request.selectedText}

## Heading path

${context.headingPath.join(" > ") || "(none)"}

## Nearby context before

${context.nearbyBefore}

## Nearby context after

${context.nearbyAfter}

## Relevant concept

${context.detectedConceptIds[0] ?? "(none)"}

## Instructions

1. Explain the selected sentence in context.
2. Do not summarize the whole note.
3. Focus on what the user is likely confused about.
4. If the concept is simple, answer briefly.
5. If the concept is foundational or the user's mastery is weak, explain carefully.
6. Use intuition first, then formula only if needed.
7. If the user's question reveals a misconception, correct it clearly.
8. Produce a concise first-person takeaway suitable for inserting into the note.
9. Do not invent sources.
10. Return valid JSON only.

## Required JSON format

{
  "answer": "Detailed explanation.",
  "key_answer": "One concise answer.",
  "suggested_takeaway": "Concise clarification item explanation suitable for the note.",
  "mastery_signal": "neutral",
  "review_needed": false
}

mastery_signal must be one of: neutral, weak, resolved.
`;
}
