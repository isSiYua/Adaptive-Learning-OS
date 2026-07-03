import { buildClarificationBlock } from "./ClarificationBlock";
import { answerLanguageInstruction } from "./ClarificationUpdatePromptBuilder";
import { createClarificationId } from "../utils/ids";
import { toLocalIsoString } from "../utils/dates";
import type {
  AskInteraction,
  AskJob,
  ClarificationItem,
  ClarificationMergeProposal,
  ClarificationRecord,
  LearningOsSettings,
} from "../types";

export function buildClarificationMergePrompt(params: {
  job: AskJob;
  existingRecord: ClarificationRecord | null;
  rawAnswer: string;
  answerLanguage: LearningOsSettings["answerLanguage"];
}): string {
  return `# Learning OS Clarification Merge Proposal

You are helping update a paragraph-level "My understanding" clarification block in an Obsidian learning note.

The user asked a new question while reading.

Your job is to create a proposal, not directly apply it.

${answerLanguageInstruction(params.answerLanguage)}

## Source block

${params.job.sourceBlock}

## Existing clarification items

${JSON.stringify(params.existingRecord?.items ?? params.job.existingItemsSnapshot ?? [], null, 2)}

## Existing visible clarification markdown

${params.job.existingVisibleMarkdown ?? ""}

## Selected text

${params.job.selectedText}

## User question

${params.job.userQuestion}

## AI answer to the new question

${params.rawAnswer}

## Instructions

1. Decide whether the new answer should update an existing item or add a new item.
2. Preserve useful old content.
3. Add useful new content.
4. Remove duplicated explanations.
5. Keep the visible note concise and readable.
6. If the new question is about a term inside an existing item, update that item.
7. If the new question is about a different term in the same source paragraph, add a separate item.
8. Use Markdown suitable for an Obsidian callout.
9. Keep technical terms in English when natural.
10. Do not include backend metadata.
11. Return valid JSON only.

## Required JSON

{
  "action": "create-clarification | update-item | add-item | replace-item | append-item",
  "target_item_id": "item id or null",
  "proposed_items": [
    {
      "id": "existing or new item id",
      "targetText": "term or phrase explained",
      "itemTitle": "short bold title",
      "question": "original or refined question",
      "explanation": "concise explanation"
    }
  ],
  "proposed_visible_markdown": "> **Title** explanation\\n>\\n> **Another title** explanation",
  "reasoning": "briefly explain why this merge action was chosen",
  "confidence": "low | medium | high"
}
`;
}

export function buildClarificationRebasePrompt(params: {
  job: AskJob;
  latestRecord: ClarificationRecord;
  currentVisibleMarkdown: string;
  staleProposalMarkdown: string;
  rawAnswer: string;
  answerLanguage: LearningOsSettings["answerLanguage"];
}): string {
  return `# Learning OS Clarification Rebase

You are rebasing a stale proposal onto the current paragraph-level clarification block.

Your job is to preserve current content and merge the pending answer without overwriting useful explanations.

${answerLanguageInstruction(params.answerLanguage)}

## Source block

${params.job.sourceBlock}

## Current live visible clarification markdown

${params.currentVisibleMarkdown}

## Latest backend clarification items

${JSON.stringify(params.latestRecord.items, null, 2)}

## Pending user question

${params.job.userQuestion}

## Pending AI answer

${params.rawAnswer}

## Stale proposal markdown

${params.staleProposalMarkdown}

Return valid JSON only using the same schema as the merge proposal:

{
  "action": "update-item | add-item | replace-item | append-item",
  "target_item_id": "item id or null",
  "proposed_items": [],
  "proposed_visible_markdown": "> **A** ...\\n>\\n> **B** ...",
  "reasoning": "how current and pending content were merged",
  "confidence": "low | medium | high"
}
`;
}

export function parseClarificationMergeProposal(input: string): ClarificationMergeProposal | null {
  const jsonText = extractJsonObject(input);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const action = proposalAction(parsed.action);
    const proposedItemsRaw = Array.isArray(parsed.proposed_items) ? parsed.proposed_items : [];
    const proposedItems = proposedItemsRaw
      .map((item, index) => normalizeItem(item, index + 1))
      .filter((item): item is ClarificationItem => item !== null);

    if (!action || proposedItems.length === 0) return null;

    return {
      schemaVersion: 1,
      action,
      clarificationId: stringField(parsed.clarification_id),
      targetItemId: stringField(parsed.target_item_id) ?? null,
      proposedItems,
      proposedVisibleMarkdown: stringField(parsed.proposed_visible_markdown) ?? "",
      reasoning: stringField(parsed.reasoning),
      confidence: confidenceValue(parsed.confidence),
    };
  } catch {
    return null;
  }
}

export function createFallbackMergeProposal(params: {
  job: AskJob;
  existingRecord: ClarificationRecord | null;
  explanation: string;
  nowIso?: string;
}): ClarificationMergeProposal {
  const nowIso = params.nowIso ?? toLocalIsoString();
  const item: ClarificationItem = {
    id: createItemId(params.job.userQuestion || params.job.selectedText, 1),
    targetText: params.job.selectedText,
    itemTitle: params.job.userQuestion || params.job.selectedText,
    question: params.job.userQuestion,
    explanation: params.explanation,
    created: nowIso,
    updated: nowIso,
    relatedInteractionIds: [interactionIdForJob(params.job.id)],
  };

  return {
    schemaVersion: 1,
    action: params.existingRecord ? "add-item" : "create-clarification",
    clarificationId: params.existingRecord?.id,
    targetItemId: null,
    proposedItems: params.existingRecord ? [...params.existingRecord.items, item] : [item],
    proposedVisibleMarkdown: "",
    reasoning: "Fallback proposal created from the AI answer.",
    confidence: "low",
  };
}

export function recordFromMergeProposal(params: {
  job: AskJob;
  proposal: ClarificationMergeProposal;
  existingRecord: ClarificationRecord | null;
  settings: Pick<LearningOsSettings, "uiLanguage" | "answerLanguage">;
  nowIso?: string;
}): ClarificationRecord {
  const nowIso = params.nowIso ?? toLocalIsoString();
  const existing = params.existingRecord;
  const id =
    existing?.id ??
    params.proposal.clarificationId ??
    createClarificationId(params.job.detectedConcept ?? "paragraph");
  const interaction = interactionFromJob(params.job, nowIso);
  const items = normalizeProposalItems({
    proposal: params.proposal,
    existingItems: existing?.items ?? [],
    interactionId: interaction.id,
    nowIso,
  });

  return {
    schemaVersion: 1,
    id,
    notePath: params.job.notePath,
    sourceBlock: existing?.sourceBlock ?? params.job.sourceBlock,
    sourceBlockHash: existing?.sourceBlockHash ?? params.job.sourceBlockHash,
    sourceStartOffset: existing?.sourceStartOffset ?? params.job.sourceStartOffset,
    sourceEndOffset: existing?.sourceEndOffset ?? params.job.sourceEndOffset,
    headingPath: existing?.headingPath ?? params.job.headingPath,
    detectedConcept: existing?.detectedConcept ?? params.job.detectedConcept,
    language: params.settings.answerLanguage,
    uiLanguage: params.settings.uiLanguage,
    created: existing?.created ?? params.job.created,
    updated: nowIso,
    items,
    interactions: [...(existing?.interactions ?? []), interaction],
  };
}

export function proposalPreviewMarkdown(params: {
  job: AskJob;
  proposal: ClarificationMergeProposal;
  existingRecord: ClarificationRecord | null;
  settings: Pick<LearningOsSettings, "uiLanguage" | "answerLanguage">;
}): string {
  const record = recordFromMergeProposal(params);
  return buildClarificationBlock(record, params.settings);
}

export function proposalFromEditedMarkdown(params: {
  proposal: ClarificationMergeProposal;
  editedMarkdown: string;
}): ClarificationMergeProposal {
  const items = parseItemsFromVisibleMarkdown(params.editedMarkdown, params.proposal.proposedItems);
  return {
    ...params.proposal,
    proposedItems: items.length > 0 ? items : params.proposal.proposedItems,
    proposedVisibleMarkdown: params.editedMarkdown,
  };
}

function normalizeProposalItems(params: {
  proposal: ClarificationMergeProposal;
  existingItems: ClarificationItem[];
  interactionId: string;
  nowIso: string;
}): ClarificationItem[] {
  const proposed = params.proposal.proposedItems.map((item, index) =>
    completeItem(item, index + 1, params.interactionId, params.nowIso)
  );

  if (params.existingItems.length === 0) {
    return proposed;
  }

  const next = [...params.existingItems];
  const targetIndex = params.proposal.targetItemId
    ? next.findIndex((item) => item.id === params.proposal.targetItemId)
    : -1;
  const first = proposed[0];

  if (targetIndex >= 0 && ["update-item", "replace-item", "append-item"].includes(params.proposal.action)) {
    const current = next[targetIndex];
    next[targetIndex] = {
      ...current,
      ...first,
      id: current.id,
      created: current.created,
      updated: params.nowIso,
      relatedInteractionIds: Array.from(
        new Set([...current.relatedInteractionIds, params.interactionId])
      ),
      explanation:
        params.proposal.action === "append-item"
          ? `${current.explanation}\n\n${first.explanation}`.trim()
          : first.explanation,
    };
    return next;
  }

  if (params.proposal.action === "create-clarification" || params.proposal.action === "add-item") {
    return appendNewItems(next, proposed, params.interactionId);
  }

  return first ? appendNewItems(next, [first], params.interactionId) : next;
}

function appendNewItems(
  currentItems: ClarificationItem[],
  proposedItems: ClarificationItem[],
  interactionId: string
): ClarificationItem[] {
  const next = [...currentItems];
  for (const item of proposedItems) {
    const existingIndex = next.findIndex(
      (current) => current.id === item.id || normalizedTitle(current.itemTitle) === normalizedTitle(item.itemTitle)
    );
    if (existingIndex >= 0) {
      const current = next[existingIndex];
      next[existingIndex] = {
        ...current,
        explanation:
          current.explanation.includes(item.explanation) || item.explanation.includes(current.explanation)
            ? longerText(current.explanation, item.explanation)
            : `${current.explanation}\n\n${item.explanation}`.trim(),
        updated: item.updated,
        relatedInteractionIds: Array.from(new Set([...current.relatedInteractionIds, interactionId])),
      };
    } else {
      next.push(item);
    }
  }
  return next;
}

function normalizedTitle(value: string): string {
  return value.trim().toLowerCase();
}

function longerText(a: string, b: string): string {
  return b.length > a.length ? b : a;
}

function completeItem(
  item: ClarificationItem,
  index: number,
  interactionId: string,
  nowIso: string
): ClarificationItem {
  return {
    ...item,
    id: item.id || createItemId(item.itemTitle || item.targetText, index),
    created: item.created || nowIso,
    updated: nowIso,
    relatedInteractionIds: Array.from(new Set([...(item.relatedInteractionIds ?? []), interactionId])),
  };
}

function interactionFromJob(job: AskJob, nowIso: string): AskInteraction {
  return {
    id: interactionIdForJob(job.id),
    type: job.existingClarificationId ? "merge" : "new-item",
    selectedText: job.selectedText,
    question: job.userQuestion,
    rawAnswer: job.rawAnswer ?? "",
    keyAnswer: job.parsedAnswer?.key_answer ?? "",
    suggestedExplanation: job.parsedAnswer?.suggested_takeaway ?? job.rawAnswer ?? "",
    provider: job.providerMode,
    model: job.model,
    created: nowIso,
  };
}

function normalizeItem(value: unknown, index: number): ClarificationItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const itemTitle = stringField(record.itemTitle);
  const explanation = stringField(record.explanation);
  if (!itemTitle || !explanation) return null;
  const nowIso = toLocalIsoString();
  return {
    id: stringField(record.id) ?? createItemId(itemTitle, index),
    targetText: stringField(record.targetText) ?? "",
    itemTitle,
    question: stringField(record.question) ?? "",
    explanation,
    created: stringField(record.created) ?? nowIso,
    updated: stringField(record.updated) ?? nowIso,
    relatedInteractionIds: Array.isArray(record.relatedInteractionIds)
      ? record.relatedInteractionIds.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function parseItemsFromVisibleMarkdown(markdown: string, fallback: ClarificationItem[]): ClarificationItem[] {
  const text = markdown
    .split("\n")
    .filter((line) => line.trim().startsWith(">"))
    .map((line) => line.replace(/^\s*>\s?/, ""))
    .filter((line) => !line.startsWith("[!tip]"))
    .join("\n")
    .trim();
  if (!text) return [];

  const matches = Array.from(text.matchAll(/\*\*(.*?)\*\*\s*([\s\S]*?)(?=\n\s*\*\*|$)/g));
  if (matches.length === 0) {
    const first = fallback[0];
    return first ? [{ ...first, explanation: text }] : [];
  }

  return matches.map((match, index) => ({
    ...(fallback[index] ?? fallback[0]),
    id: fallback[index]?.id ?? createItemId(match[1], index + 1),
    targetText: fallback[index]?.targetText ?? match[1],
    itemTitle: match[1].trim(),
    question: fallback[index]?.question ?? "",
    explanation: match[2].trim(),
    created: fallback[index]?.created ?? toLocalIsoString(),
    updated: toLocalIsoString(),
    relatedInteractionIds: fallback[index]?.relatedInteractionIds ?? [],
  }));
}

function proposalAction(value: unknown): ClarificationMergeProposal["action"] | null {
  if (
    value === "create-clarification" ||
    value === "update-item" ||
    value === "add-item" ||
    value === "replace-item" ||
    value === "append-item"
  ) {
    return value;
  }
  return null;
}

function confidenceValue(value: unknown): ClarificationMergeProposal["confidence"] | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function extractJsonObject(input: string): string | null {
  const trimmed = input.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const source = fenced ? fenced[1].trim() : trimmed;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return source.slice(start, end + 1);
}

function createItemId(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `item-${slug || index}`;
}

function interactionIdForJob(jobId: string): string {
  return `ask-${jobId.replace(/^job-/, "")}`;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
