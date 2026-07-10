import {
  buildClarificationBlock,
  liveItemsToClarificationItems,
  normalizeClarificationItemExplanation,
  normalizeClarificationItemTitle,
  parseLiveClarificationItemsFromBlock,
} from "./ClarificationBlock";
import { detectAskIntent, generatedContentMissingWarning, isGeneratedContentIntent } from "./AskIntent";
import { answerLanguageInstruction } from "./ClarificationUpdatePromptBuilder";
import { extractFirstJsonObject } from "./JsonExtraction";
import { latexMathFormattingRule, structuredJsonOutputRule } from "./PromptRules";
import { createClarificationId, createGeneratedContentId, slugify } from "../utils/ids";
import { toLocalIsoString } from "../utils/dates";
import type {
  AskInteraction,
  AskJob,
  ClarificationItem,
  ClarificationMergeOperation,
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

${latexMathFormattingRule(params.answerLanguage)}

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

## User intent hint

${detectAskIntent(params.job.userQuestion)}

## AI answer to the new question

${params.rawAnswer}

## Parsed answer fields, if available

${JSON.stringify(params.job.parsedAnswer ?? {}, null, 2)}

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
12. The user's question is a primary instruction. Do not ignore user-requested content just because it is not directly part of the source paragraph.
13. If the AI answer contains user-requested generated content, examples, translations, formulas, stories, or test content, preserve it as a concise item or full item.
14. If you believe user-requested content is not suitable for the note, say that explicitly in the proposal reasoning and still include a user-reviewable item instead of silently dropping it.

用户的问题是主要指令之一。不要因为内容和原文段落不完全相关，就静默丢弃用户明确要求生成的内容。如果 AI 回答中包含用户明确要求的故事、例子、翻译、公式或测试内容，编辑建议必须保留它，至少保留为一个简洁 item。不能静默忽略。

${structuredJsonOutputRule(params.answerLanguage)}

## Required JSON

{
  "operations": [
    {
      "op": "update-item | add-item",
      "itemId": "existing item id or new item id",
      "targetText": "term or phrase explained",
      "itemTitle": "short title",
      "explanation": "final explanation text"
    }
  ],
    "action": "create-clarification | update-item | add-item | replace-item | append-item | generated-content",
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

${latexMathFormattingRule(params.answerLanguage)}

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

${structuredJsonOutputRule(params.answerLanguage)}

{
  "operations": [],
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
  const jsonText = extractFirstJsonObject(input);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const action = proposalAction(parsed.action);
    const operations = parseOperations(parsed.operations);
    const proposedItemsRaw = Array.isArray(parsed.proposed_items) ? parsed.proposed_items : [];
    const proposedItemsFromItems = proposedItemsRaw
      .map((item, index) => normalizeItem(item, index + 1))
      .filter((item): item is ClarificationItem => item !== null);
    const proposedItems = proposedItemsFromItems.length > 0 ? proposedItemsFromItems : operationsToItems(operations);

    if (!action || (proposedItems.length === 0 && operations.length === 0)) return null;

    return {
      schemaVersion: 1,
      action,
      clarificationId: stringField(parsed.clarification_id),
      generatedId: stringField(parsed.generated_id),
      targetItemId: stringField(parsed.target_item_id) ?? null,
      operations,
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
  const intent = detectAskIntent(params.job.userQuestion);
  const generatedWarning = generatedContentMissingWarning(params.job.userQuestion, params.explanation);
  const generated = isGeneratedContentIntent(intent);
  const generatedTitle = generated ? generatedContentTitle(params.job.userQuestion, params.job.selectedText) : null;
  const item: ClarificationItem = {
    id:
      params.job.proposedItemId ??
      (generated
        ? `gen-${slugify((generatedTitle ?? params.job.userQuestion) || params.job.selectedText, "content")}`
        : createItemId(params.job.userQuestion || params.job.selectedText, 1)),
    targetText: params.job.selectedText,
    itemTitle: generatedTitle ?? params.job.userQuestion ?? params.job.selectedText,
    question: params.job.userQuestion,
    explanation: params.explanation,
    created: nowIso,
    updated: nowIso,
    relatedInteractionIds: [interactionIdForJob(params.job.id)],
  };

  const proposal: ClarificationMergeProposal = {
    schemaVersion: 1,
    action: generated ? "generated-content" : params.existingRecord ? "add-item" : "create-clarification",
    generatedId: generated
      ? createGeneratedContentId(params.job.detectedConcept ?? params.job.selectedText ?? "content")
      : undefined,
    clarificationId: params.existingRecord?.id,
    targetItemId: null,
    proposedItems: generatedWarning && generated ? [] : params.existingRecord ? [...params.existingRecord.items, item] : [item],
    operations:
      generatedWarning && generated
        ? []
        : [
            {
              op: "add-item",
              itemId: item.id,
              targetText: item.targetText,
              itemTitle: item.itemTitle,
              explanation: item.explanation,
            },
          ],
    proposedVisibleMarkdown: generatedWarning && generated ? "" : "",
    reasoning: generatedWarning ?? "Fallback proposal created from the AI answer.",
    confidence: "low",
  };
  return {
    ...proposal,
    proposedVisibleMarkdown:
      !generatedWarning && generated ? buildGeneratedContentBlock(proposal, { uiLanguage: params.job.uiLanguage }) : proposal.proposedVisibleMarkdown,
  };
}

export function primaryProposalSourceText(job: AskJob): string {
  const intent = detectAskIntent(job.userQuestion);

  if (isGeneratedContentIntent(intent)) {
    return generatedContentTextForJob(job);
  }

  const rawAnswer = job.rawAnswer?.trim() ?? "";
  const parsedAnswer = job.parsedAnswer?.answer?.trim() ?? "";
  const keyAnswer = job.parsedAnswer?.key_answer?.trim() ?? "";
  const suggestedTakeaway = job.parsedAnswer?.suggested_takeaway?.trim() ?? "";
  return parsedAnswer || rawAnswer || suggestedTakeaway || keyAnswer;
}

export function normalizeProposalForAskIntent(params: {
  job: AskJob;
  existingRecord: ClarificationRecord | null;
  proposal: ClarificationMergeProposal;
  explanation: string;
}): ClarificationMergeProposal {
  const intent = detectAskIntent(params.job.userQuestion);
  if (!isGeneratedContentIntent(intent)) return params.proposal;
  return createFallbackMergeProposal({
    job: {
      ...params.job,
      proposedItemId: params.job.proposedItemId ?? undefined,
    },
    existingRecord: null,
    explanation: generatedContentTextForJob(params.job) || params.explanation,
  });
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
  if (params.proposal.action === "generated-content") {
    return buildGeneratedContentBlock(params.proposal, params.settings);
  }
  const record = recordFromMergeProposal(params);
  return buildClarificationBlock(record, params.settings);
}

export function buildGeneratedContentBlock(
  proposal: Pick<ClarificationMergeProposal, "generatedId" | "proposedItems">,
  settings?: Pick<LearningOsSettings, "uiLanguage">
): string {
  const validItems = proposal.proposedItems.filter(
    (item) =>
      (item.id || item.itemTitle || item.targetText) &&
      normalizeClarificationItemExplanation(item.explanation, item.itemTitle || item.targetText).trim().length > 0
  );
  if (validItems.length === 0) return "";
  const title = settings?.uiLanguage === "en" ? "AI generated content" : "AI 生成内容";
  const generatedId = proposal.generatedId ?? createGeneratedContentId("content");
  const lines = [`> [!note]- ✍️ ${title}`, `> <!-- learnos-generated-id: ${generatedId} -->`];
  for (const item of validItems) {
    const itemTitle = normalizeClarificationItemTitle(item.itemTitle || item.targetText || item.question || "Generated content");
    const explanation = normalizeClarificationItemExplanation(item.explanation, itemTitle);
    lines.push(">");
    lines.push(`> <!-- learnos-item-id: ${item.id} -->`);
    const explanationLines = explanation
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const firstExplanation = explanationLines.shift() ?? "";
    lines.push(`> ${`**${itemTitle}**${firstExplanation ? ` ${firstExplanation}` : ""}`.trim()}`);
    lines.push(...explanationLines.map((line) => `> ${line}`));
  }
  return `${lines.join("\n")}\n\n`;
}

export function proposalFromEditedMarkdown(params: {
  proposal: ClarificationMergeProposal;
  editedMarkdown: string;
}): ClarificationMergeProposal {
  const items = itemsFromVisibleMarkdown(params.editedMarkdown, params.proposal.proposedItems);
  return {
    ...params.proposal,
    proposedItems: items.length > 0 ? items : params.proposal.proposedItems,
    operations: items.length > 0 ? undefined : params.proposal.operations,
    proposedVisibleMarkdown: params.editedMarkdown,
  };
}

export function itemsFromVisibleMarkdown(markdown: string, fallback: ClarificationItem[]): ClarificationItem[] {
  return parseItemsFromVisibleMarkdown(markdown, fallback);
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
  const itemTitle = normalizeClarificationItemTitle(item.itemTitle || item.targetText || `Clarification ${index}`);
  return {
    ...item,
    id: item.id || createItemId(item.itemTitle || item.targetText, index),
    itemTitle,
    explanation: normalizeClarificationItemExplanation(item.explanation, itemTitle),
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
  const normalizedTitle = normalizeClarificationItemTitle(itemTitle);
  return {
    id: stringField(record.id) ?? createItemId(normalizedTitle, index),
    targetText: stringField(record.targetText) ?? "",
    itemTitle: normalizedTitle,
    question: stringField(record.question) ?? "",
    explanation: normalizeClarificationItemExplanation(explanation, normalizedTitle),
    created: stringField(record.created) ?? nowIso,
    updated: stringField(record.updated) ?? nowIso,
    relatedInteractionIds: Array.isArray(record.relatedInteractionIds)
      ? record.relatedInteractionIds.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function parseOperations(value: unknown): ClarificationMergeOperation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const op = record.op === "update-item" || record.op === "add-item" ? record.op : null;
      const itemId = stringField(record.itemId) ?? stringField(record.item_id);
      const itemTitle = stringField(record.itemTitle) ?? stringField(record.item_title);
      const explanation = stringField(record.explanation);
      if (!op || !itemId || !itemTitle || !explanation) return null;
      const normalizedTitle = normalizeClarificationItemTitle(itemTitle);
      return {
        op,
        itemId,
        targetText: stringField(record.targetText) ?? stringField(record.target_text) ?? normalizedTitle,
        itemTitle: normalizedTitle,
        explanation: normalizeClarificationItemExplanation(explanation, normalizedTitle),
      } satisfies ClarificationMergeOperation;
    })
    .filter((item): item is ClarificationMergeOperation => item !== null);
}

function operationsToItems(operations: ClarificationMergeOperation[]): ClarificationItem[] {
  const nowIso = toLocalIsoString();
  return operations.map((operation, index) => ({
    id: operation.itemId || createItemId(operation.itemTitle, index + 1),
    targetText: operation.targetText,
    itemTitle: normalizeClarificationItemTitle(operation.itemTitle || operation.targetText),
    question: "",
    explanation: normalizeClarificationItemExplanation(operation.explanation, operation.itemTitle || operation.targetText),
    created: nowIso,
    updated: nowIso,
    relatedInteractionIds: [],
  }));
}

function parseItemsFromVisibleMarkdown(markdown: string, fallback: ClarificationItem[]): ClarificationItem[] {
  const liveItems = liveItemsToClarificationItems(parseLiveClarificationItemsFromBlock(markdown, []));
  if (liveItems.length > 0) return liveItems;

  const text = markdown
    .split("\n")
    .map((line) => line.replace(/^\s*>\s?/, ""))
    .filter((line) => !line.trim().startsWith("[!tip]"))
    .filter((line) => !line.trim().startsWith("[!note]"))
    .filter((line) => !line.includes("learnos-clarification-id"))
    .filter((line) => !line.includes("learnos-generated-id"))
    .filter((line) => !line.includes("learnos-item-id"))
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
    itemTitle: normalizeClarificationItemTitle(match[1]),
    question: fallback[index]?.question ?? "",
    explanation: normalizeClarificationItemExplanation(match[2], match[1]),
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
    value === "append-item" ||
    value === "generated-content"
  ) {
    return value;
  }
  return null;
}

function confidenceValue(value: unknown): ClarificationMergeProposal["confidence"] | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
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

function generatedContentTextForJob(job: AskJob): string {
  const candidates = [
    job.parsedAnswer?.answer?.trim() ?? "",
    job.parsedAnswer?.suggested_takeaway?.trim() ?? "",
    job.parsedAnswer?.key_answer?.trim() ?? "",
    job.rawAnswer?.trim() ?? "",
  ].filter(Boolean);
  const satisfying = candidates.find((candidate) => generatedContentMissingWarning(job.userQuestion, candidate) === null);
  return satisfying ?? candidates[0] ?? "";
}

function generatedContentTitle(question: string, fallback: string): string {
  const cleaned = question
    .replace(/请|给我|生成一个|生成一段|生成|讲一个|讲个|讲一段|讲讲|给我讲|写一个|写一段|给我写|编一个|编一段|来一个|输出|关于|一下/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const base = cleaned || fallback || "生成内容";
  if (/niko/i.test(base) && /趣事|fun fact/i.test(base)) return "NiKo 小趣事";
  if (/巴别塔|通天塔|babel/i.test(base) && /故事|story/i.test(base)) return "巴别塔小故事";
  return normalizeClarificationItemTitle(base);
}
