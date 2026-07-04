import { extractFirstJsonObject } from "./JsonExtraction";
import { latexMathFormattingRule, structuredJsonOutputRule } from "./PromptRules";
import type { AskCardRecord, SelectionContext } from "../types";

export interface FollowUpMergeRequest {
  existingRecord: AskCardRecord;
  context: SelectionContext;
  newQuestion: string;
  newRawAnswer: string;
  newKeyAnswer: string;
  newTakeaway: string;
}

export interface ParsedFollowUpMerge {
  mergedTakeaway: string;
  reason: string;
  masterySignal: "neutral" | "weak" | "resolved";
  reviewNeeded: boolean;
}

export function buildFollowUpMergePrompt(request: FollowUpMergeRequest): string {
  return `# Learning OS Follow-up Merge

You are updating a concise learning clarification in an Obsidian note.

Answer in Chinese.

${latexMathFormattingRule("zh")}

The user asked a follow-up question about an existing clarification.

Your task is to merge the old takeaway and the new answer into one improved concise takeaway.

## Original source sentence

${request.existingRecord.sourceSentence}

## Existing visible takeaway

${request.existingRecord.myTakeaway}

## New selected text

${request.context.selectedText}

## New follow-up question

${request.newQuestion}

## New AI answer

${request.newTakeaway || request.newKeyAnswer || request.newRawAnswer}

## Instructions

1. Preserve important information from the existing takeaway.
2. Add important new information from the follow-up answer.
3. Remove duplicated or redundant wording.
4. Keep it concise and suitable for insertion into an Obsidian note.
5. Do not include raw Q&A.
6. Do not include metadata.
7. Use first-person style if natural, e.g. “我可以理解为...” or “我记住...”.
8. If the old takeaway contains a useful comparison, keep it.
9. Return valid JSON only.

${structuredJsonOutputRule("zh")}

## Required JSON format

{
  "merged_takeaway": "The updated concise takeaway.",
  "reason": "Brief explanation of what changed.",
  "mastery_signal": "neutral",
  "review_needed": false
}
`;
}

export function parseFollowUpMergeResponse(input: string): ParsedFollowUpMerge | null {
  const jsonText = extractFirstJsonObject(input);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const mergedTakeaway = stringField(parsed.merged_takeaway) ?? stringField(parsed.mergedTakeaway);
    if (!mergedTakeaway) return null;

    return {
      mergedTakeaway,
      reason: stringField(parsed.reason) ?? "",
      masterySignal: masterySignalField(parsed.mastery_signal) ?? "neutral",
      reviewNeeded: booleanField(parsed.review_needed) ?? false,
    };
  } catch {
    return null;
  }
}

export function appendTakeaways(existingTakeaway: string, newTakeaway: string): string {
  const existing = existingTakeaway.trim();
  const next = newTakeaway.trim();
  if (!existing) return next;
  if (!next || existing.includes(next)) return existing;
  if (next.includes(existing)) return next;
  return `${existing}\n\n补充：${next}`;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function booleanField(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function masterySignalField(value: unknown): "neutral" | "weak" | "resolved" | undefined {
  return value === "neutral" || value === "weak" || value === "resolved" ? value : undefined;
}
