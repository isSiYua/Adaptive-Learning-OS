import {
  draftItemToClarificationItem,
  findInlineDraftByJobId,
  finalItemIdForDraftItemId,
  renderInlineDraftBlock,
  removeInlineDraftBlock,
  type InlineDraftBlock,
  type InlineDraftKind,
  type InlineDraftOperation,
} from "./InlineDraftBlock";
import { findAllClarificationAnnotations, normalizeClarificationItemExplanation, normalizeClarificationItemTitle } from "./ClarificationBlock";
import { stableHash } from "../utils/hash";
import type { AskJob, ClarificationItem, ClarificationMergeProposal, LearningOsSettings } from "../types";

export type InlineDraftStageStatus =
  | "created"
  | "existing-live-draft"
  | "unsupported-selection"
  | "empty-proposal"
  | "fallback-inbox-only";

export interface InlineDraftStageResult {
  markdown: string;
  changed: boolean;
  status: InlineDraftStageStatus;
  message: string;
  draftId?: string;
  kind?: Exclude<InlineDraftKind, "unknown">;
  operation?: Exclude<InlineDraftOperation, "unknown">;
  targetContainerId?: string;
  targetItemId?: string;
  targetItemHash?: string;
  sourceBlockHash?: string;
  itemIds?: string[];
  contentHash?: string;
}

export type InlineDraftApplyPreparation =
  | { kind: "none" }
  | { kind: "deleted"; message: string; job: AskJob }
  | { kind: "target-missing"; message: string; job: AskJob }
  | {
      kind: "ready";
      job: AskJob;
      editedVisibleMarkdown: string;
      draft: InlineDraftBlock;
      finalItemIds: string[];
      removeDraft(markdown: string): string;
    };

interface LearningOsGeneratedAnnotationMatch {
  generatedId: string;
  blockStart: number;
  blockEnd: number;
}

export function stageInlineDraftForJob(params: {
  markdown: string;
  job: AskJob;
  settings: Pick<LearningOsSettings, "enableExperimentalInlineDraftStaging">;
  nowIso: string;
}): InlineDraftStageResult {
  const { markdown, job, settings } = params;
  if (!settings.enableExperimentalInlineDraftStaging || job.status !== "completed" || !job.mergeProposal) {
    return {
      markdown,
      changed: false,
      status: "fallback-inbox-only",
      message: "Inline draft staging is off; using Inbox-only Apply.",
    };
  }

  const existingDraft = findInlineDraftByJobId(markdown, job.id);
  if (existingDraft) {
    return {
      markdown,
      changed: false,
      status: "existing-live-draft",
      message: "Existing live draft found; Apply will use the live draft.",
      draftId: existingDraft.draftId,
      kind: existingDraft.kind === "unknown" ? undefined : existingDraft.kind,
      operation: existingDraft.operation === "unknown" ? undefined : existingDraft.operation,
      targetContainerId: existingDraft.targetContainerId,
      targetItemId: existingDraft.targetItemId,
      targetItemHash: existingDraft.targetItemHash,
      sourceBlockHash: existingDraft.sourceBlockHash,
      itemIds: existingDraft.items.map((item) => finalItemIdForDraftItemId(item.draftItemId)),
      contentHash: existingDraft.draftContentHash,
    };
  }

  const draftItems = proposedDraftItems(job);
  if (draftItems.length === 0) {
    return {
      markdown,
      changed: false,
      status: "empty-proposal",
      message: "No usable proposal item was available for inline draft staging.",
    };
  }

  const target = resolveDraftTarget(markdown, job);
  if (!target) {
    return {
      markdown,
      changed: false,
      status: "unsupported-selection",
      message: "This selection is not safe for inline draft staging; using Inbox-only Apply.",
    };
  }

  const draftId = `draft-${job.id}`;
  const block = renderInlineDraftBlock({
    draftId,
    jobId: job.id,
    kind: target.kind,
    operation: target.operation,
    targetContainerId: target.targetContainerId,
    targetItemId: target.targetItemId,
    targetItemHash: target.targetItemHash,
    sourceBlockHash: job.sourceBlockHash,
    createdAt: params.nowIso,
    items: draftItems,
  });
  const next = insertBlockAfterRange(markdown, block, target.insertAfter);

  return {
    markdown: next,
    changed: true,
    status: "created",
    message: "Inline draft created in the note.",
    draftId,
    kind: target.kind,
    operation: target.operation,
    targetContainerId: target.targetContainerId,
    targetItemId: target.targetItemId,
    targetItemHash: target.targetItemHash,
    sourceBlockHash: job.sourceBlockHash,
    itemIds: draftItems.map((item) => item.id),
    contentHash: stableHash(block),
  };
}

export function prepareInlineDraftApply(params: {
  markdown: string;
  job: AskJob;
  settings: Pick<LearningOsSettings, "enableExperimentalInlineDraftStaging" | "answerLanguage" | "uiLanguage">;
  nowIso: string;
}): InlineDraftApplyPreparation {
  if (!params.settings.enableExperimentalInlineDraftStaging || !params.job.inlineDraft?.draftId || !params.job.mergeProposal) {
    return { kind: "none" };
  }

  const draft = findInlineDraftByJobId(params.markdown, params.job.id);
  if (!draft) {
    const job = withInlineDraftStatus(params.job, "deleted", "Inline draft was deleted; Apply is a no-op.");
    return { kind: "deleted", message: "Inline draft was deleted; nothing was applied.", job };
  }
  if (draft.items.length === 0) {
    const job = withInlineDraftStatus(params.job, "deleted", "Inline draft has no usable items; Apply is a no-op.");
    return { kind: "deleted", message: "Inline draft has no usable items; nothing was applied.", job };
  }

  const finalItems = draft.items
    .map((item, index) =>
      draftItemToClarificationItem(item, params.job.mergeProposal?.proposedItems[index] ?? {}, params.nowIso)
    )
    .filter((item) => item.explanation.trim().length > 0);
  if (finalItems.length === 0) {
    const job = withInlineDraftStatus(params.job, "deleted", "Inline draft has no usable items; Apply is a no-op.");
    return { kind: "deleted", message: "Inline draft has no usable items; nothing was applied.", job };
  }

  const targetContainerId = draft.targetContainerId;
  let editedVisibleMarkdown: string;
  let job = params.job;
  if (targetContainerId?.startsWith("clar-")) {
    const target = findAllClarificationAnnotations(params.markdown).find((match) => match.clarificationId === targetContainerId);
    if (!target) {
      job = withInlineDraftStatus(params.job, "target-missing", "Target Learning OS block is missing; draft was preserved.");
      return { kind: "target-missing", message: "Target Learning OS block is missing; draft was preserved.", job };
    }
    editedVisibleMarkdown = appendFinalItemsToCallout(params.markdown.slice(target.blockStart, target.blockEnd), finalItems);
    job = withDraftMergeProposal(params.job, {
      action: "add-item",
      clarificationId: targetContainerId,
      proposedItems: finalItems,
      proposedVisibleMarkdown: editedVisibleMarkdown,
    });
    job = {
      ...job,
      existingClarificationId: targetContainerId,
      targetClarificationId: targetContainerId,
      targetItemId: undefined,
    };
  } else if (targetContainerId?.startsWith("gen-")) {
    const target = findAllGeneratedAnnotations(params.markdown).find((match) => match.generatedId === targetContainerId);
    if (!target) {
      job = withInlineDraftStatus(params.job, "target-missing", "Target generated-content block is missing; draft was preserved.");
      return { kind: "target-missing", message: "Target generated-content block is missing; draft was preserved.", job };
    }
    editedVisibleMarkdown = appendFinalItemsToCallout(params.markdown.slice(target.blockStart, target.blockEnd), finalItems);
    job = withDraftMergeProposal(params.job, {
      action: "generated-content",
      generatedId: targetContainerId,
      proposedItems: finalItems,
      proposedVisibleMarkdown: editedVisibleMarkdown,
    });
  } else if (draft.kind === "generated-content") {
    editedVisibleMarkdown = buildGeneratedDraftVisible(finalItems);
    job = withDraftMergeProposal(params.job, {
      action: "generated-content",
      proposedItems: finalItems,
      proposedVisibleMarkdown: editedVisibleMarkdown,
    });
  } else {
    editedVisibleMarkdown = buildClarificationDraftVisible(finalItems);
    job = jobWithGeneratedBlockSourceAnchor(params.markdown, job);
    job = withDraftMergeProposal(job, {
      action: "create-clarification",
      proposedItems: finalItems,
      proposedVisibleMarkdown: editedVisibleMarkdown,
    });
  }

  return {
    kind: "ready",
    job: withInlineDraftStatus(job, "existing-live-draft", "Apply will use the live inline draft."),
    editedVisibleMarkdown,
    draft,
    finalItemIds: finalItems.map((item) => item.id),
    removeDraft: (markdown) => removeInlineDraftBlock(markdown, draft),
  };
}

export function inlineDraftStatusMessage(job: AskJob, uiLanguage: "zh" | "en"): string | undefined {
  const status = job.inlineDraft?.status;
  if (!status) return undefined;
  const en: Record<string, string> = {
    "created": "Inline draft created in the note.",
    "existing-live-draft": "Existing live draft found. Apply will use the live draft.",
    "deleted": "Inline draft was deleted. Apply will be a no-op.",
    "unsupported-selection": "Inline draft not created for this selection; using Inbox-only Apply.",
    "empty-proposal": "Inline draft not created because the proposal has no usable item.",
    "fallback-inbox-only": "Using Inbox-only Apply.",
    "applied": "Inline draft was applied and removed.",
    "target-missing": "Target Learning OS block is missing; draft is preserved.",
  };
  const zh: Record<string, string> = {
    "created": "已在笔记中生成 inline draft。",
    "existing-live-draft": "发现已有 live draft；Apply 会使用笔记里的 draft。",
    "deleted": "inline draft 已被删除；Apply 将不会写入内容。",
    "unsupported-selection": "当前选择不适合生成 inline draft；使用 Inbox-only Apply。",
    "empty-proposal": "建议中没有可用 item，未生成 inline draft。",
    "fallback-inbox-only": "使用 Inbox-only Apply。",
    "applied": "inline draft 已应用并移除。",
    "target-missing": "目标 Learning OS block 缺失；draft 已保留。",
  };
  return (uiLanguage === "en" ? en : zh)[status] ?? job.inlineDraft?.message;
}

function proposedDraftItems(job: AskJob): ClarificationItem[] {
  const proposal = job.mergeProposal;
  if (!proposal) return [];
  const byProposedId = proposal.proposedItems.find((item) => item.id === job.proposedItemId);
  const operations = proposal.operations
    ?.filter((operation) => operation.op === "add-item")
    .map((operation, index) => ({
      id: stableNewItemIdForDraft(job, operation.itemId, index),
      targetText: operation.targetText,
      itemTitle: operation.itemTitle,
      question: job.userQuestion,
      explanation: operation.explanation,
      created: job.created,
      updated: job.updated,
      relatedInteractionIds: [job.id],
    }));
  const selected =
    byProposedId ??
    (operations && operations.length > 0 ? undefined : proposal.proposedItems[proposal.proposedItems.length - 1]);
  const items = operations && operations.length > 0 ? operations : selected ? [{ ...selected, id: job.proposedItemId ?? selected.id }] : [];
  return items.filter((item) => normalizeClarificationItemExplanation(item.explanation, item.itemTitle).trim().length > 0);
}

function stableNewItemIdForDraft(job: AskJob, candidate: string | undefined, index: number): string {
  if (job.askSourceMode !== "normal-note") {
    return candidate || itemIdWithIndex(job.proposedItemId, index) || `item-${index + 1}`;
  }
  if (!candidate || isGenericAiItemId(candidate)) {
    return itemIdWithIndex(job.proposedItemId, index) || candidate || `item-${index + 1}`;
  }
  return candidate;
}

function itemIdWithIndex(itemId: string | undefined, index: number): string | undefined {
  if (!itemId) return undefined;
  return index === 0 ? itemId : `${itemId}-${index + 1}`;
}

function isGenericAiItemId(itemId: string): boolean {
  return /^item-\d+$/i.test(itemId.trim());
}

function resolveDraftTarget(
  markdown: string,
  job: AskJob
): {
  kind: Exclude<InlineDraftKind, "unknown">;
  operation: Exclude<InlineDraftOperation, "unknown">;
  targetContainerId?: string;
  targetItemId?: string;
  targetItemHash?: string;
  insertAfter: number;
} | null {
  const selectedContainerId = job.selectedLearningOsItem?.containerId;
  const outputKind = draftOutputKind(job);
  if (job.askSourceMode === "clarification-item") {
    const targetContainerId = selectedContainerId?.startsWith("clar-")
      ? selectedContainerId
      : job.targetClarificationId ?? job.existingClarificationId;
    if (!targetContainerId) return null;
    const target = findAllClarificationAnnotations(markdown).find((match) => match.clarificationId === targetContainerId);
    if (!target) return null;
    if (outputKind === "generated-content") {
      return {
        kind: "generated-content",
        operation: "add-item",
        insertAfter: target.blockEnd,
      };
    }
    return {
      kind: "clarification",
      operation: "add-sibling-item",
      targetContainerId,
      targetItemId: job.selectedLearningOsItem?.itemId ?? job.targetItemId,
      targetItemHash: job.selectedLearningOsItem?.itemContent ? stableHash(job.selectedLearningOsItem.itemContent) : undefined,
      insertAfter: target.blockEnd,
    };
  }
  if (job.askSourceMode === "generated-content-item") {
    const targetContainerId = selectedContainerId?.startsWith("gen-") ? selectedContainerId : job.mergeProposal?.generatedId;
    if (!targetContainerId) return null;
    const target = findAllGeneratedAnnotations(markdown).find((match) => match.generatedId === targetContainerId);
    if (!target) return null;
    if (outputKind === "clarification") {
      return {
        kind: "clarification",
        operation: "add-item",
        insertAfter: target.blockEnd,
      };
    }
    return {
      kind: "generated-content",
      operation: "add-sibling-item",
      targetContainerId,
      targetItemId: job.selectedLearningOsItem?.itemId ?? job.targetItemId,
      targetItemHash: job.selectedLearningOsItem?.itemContent ? stableHash(job.selectedLearningOsItem.itemContent) : undefined,
      insertAfter: target.blockEnd,
    };
  }

  const existingClarificationId = job.targetClarificationId ?? job.existingClarificationId;
  if (existingClarificationId && outputKind === "clarification") {
    const target = findAllClarificationAnnotations(markdown).find((match) => match.clarificationId === existingClarificationId);
    if (target) {
      return {
        kind: "clarification",
        operation: "add-sibling-item",
        targetContainerId: existingClarificationId,
        insertAfter: target.blockEnd,
      };
    }
  }

  const source = sourceRange(markdown, job);
  if (!source) return null;
  return {
    kind: outputKind,
    operation: "add-item",
    insertAfter: source.end,
  };
}

function draftOutputKind(job: AskJob): Exclude<InlineDraftKind, "unknown"> {
  return job.mergeProposal?.action === "generated-content" ? "generated-content" : "clarification";
}

function sourceRange(markdown: string, job: AskJob): { start: number; end: number } | null {
  if (
    typeof job.sourceStartOffset === "number" &&
    typeof job.sourceEndOffset === "number" &&
    job.sourceStartOffset >= 0 &&
    job.sourceEndOffset > job.sourceStartOffset &&
    job.sourceEndOffset <= markdown.length &&
    markdown.slice(job.sourceStartOffset, job.sourceEndOffset).trim() === job.sourceBlock.trim()
  ) {
    return { start: job.sourceStartOffset, end: job.sourceEndOffset };
  }
  if (job.sourceBlock.trim()) {
    const index = markdown.indexOf(job.sourceBlock.trim());
    if (index >= 0) return { start: index, end: index + job.sourceBlock.trim().length };
  }
  return null;
}

function insertBlockAfterRange(markdown: string, block: string, offset: number): string {
  return `${markdown.slice(0, offset).replace(/\s*$/, "")}\n\n${block}${markdown.slice(offset).replace(/^\n+/, "")}`;
}

function appendFinalItemsToCallout(blockMarkdown: string, items: ClarificationItem[]): string {
  const lines = blockMarkdown.trimEnd().split("\n");
  for (const item of items) {
    lines.push(">");
    lines.push(...finalItemLines(item));
  }
  return `${lines.join("\n")}\n\n`;
}

function buildClarificationDraftVisible(items: ClarificationItem[]): string {
  const lines = [`> [!tip]- 💡 我的理解`];
  for (const item of items) {
    lines.push(">");
    lines.push(...finalItemLines(item));
  }
  return `${lines.join("\n")}\n\n`;
}

function buildGeneratedDraftVisible(items: ClarificationItem[]): string {
  const lines = [`> [!note]- ✍️ AI 生成内容`];
  for (const item of items) {
    lines.push(">");
    lines.push(...finalItemLines(item));
  }
  return `${lines.join("\n")}\n\n`;
}

function finalItemLines(item: ClarificationItem): string[] {
  const title = normalizeClarificationItemTitle(item.itemTitle || item.targetText || item.question || "Draft item");
  const explanation = normalizeClarificationItemExplanation(item.explanation, title);
  const explanationLines = explanation
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const first = explanationLines.shift() ?? "";
  return [
    `> <!-- learnos-item-id: ${item.id} -->`,
    `> ${`**${title}**${first ? ` ${first}` : ""}`.trim()}`,
    ...explanationLines.map((line) => `> ${line}`),
  ];
}

function withDraftMergeProposal(
  job: AskJob,
  patch: {
    action: ClarificationMergeProposal["action"];
    clarificationId?: string;
    generatedId?: string;
    proposedItems: ClarificationItem[];
    proposedVisibleMarkdown: string;
  }
): AskJob {
  const current = job.mergeProposal;
  if (!current) return job;
  return {
    ...job,
    mergeProposal: {
      ...current,
      action: patch.action,
      clarificationId: patch.clarificationId,
      generatedId: patch.generatedId ?? current.generatedId,
      targetItemId: null,
      operations: undefined,
      proposedItems: patch.proposedItems,
      proposedVisibleMarkdown: patch.proposedVisibleMarkdown,
    },
  };
}

function jobWithGeneratedBlockSourceAnchor(markdown: string, job: AskJob): AskJob {
  const containerId = job.selectedLearningOsItem?.containerId;
  if (job.askSourceMode !== "generated-content-item" || !containerId?.startsWith("gen-")) return job;
  const target = findAllGeneratedAnnotations(markdown).find((match) => match.generatedId === containerId);
  if (!target) return job;
  const sourceBlock = markdown.slice(target.blockStart, target.blockEnd).trimEnd();
  return {
    ...job,
    sourceBlock,
    sourceStartOffset: target.blockStart,
    sourceEndOffset: target.blockStart + sourceBlock.length,
    selectedText: job.selectedText || sourceBlock,
  };
}

export function withInlineDraftStatus(
  job: AskJob,
  status: NonNullable<AskJob["inlineDraft"]>["status"],
  message: string
): AskJob {
  return {
    ...job,
    inlineDraft: {
      ...(job.inlineDraft ?? { draftId: `draft-${job.id}` }),
      status,
      message,
    },
  };
}

export function findAllGeneratedAnnotations(markdown: string): LearningOsGeneratedAnnotationMatch[] {
  const pattern = /<!--\s*learnos-generated-id:\s*(gen-[^>\s]+)\s*-->/g;
  const matches: LearningOsGeneratedAnnotationMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    matches.push({
      generatedId: match[1],
      blockStart: findCalloutBlockStart(markdown, match.index),
      blockEnd: findCalloutBlockEnd(markdown, match.index + match[0].length),
    });
  }
  return matches;
}

function findCalloutBlockStart(markdown: string, markerStart: number): number {
  let start = markdown.lastIndexOf("\n", markerStart - 1) + 1;
  while (start > 0) {
    const previousEnd = start - 1;
    const previousStart = markdown.lastIndexOf("\n", previousEnd - 1) + 1;
    const line = markdown.slice(previousStart, previousEnd);
    if (!line.trim().startsWith(">") && line.trim() !== "") break;
    if (isTopLevelCalloutHeader(line)) {
      start = previousStart;
      break;
    }
    start = previousStart;
  }
  return start;
}

function findCalloutBlockEnd(markdown: string, markerEnd: number): number {
  let cursor = markerEnd;
  let previousWasQuoted = true;
  let afterBlank = false;
  while (cursor < markdown.length) {
    const nextBreak = markdown.indexOf("\n", cursor);
    if (nextBreak === -1) return markdown.length;
    const nextLineStart = nextBreak + 1;
    const nextLineEnd = markdown.indexOf("\n", nextLineStart);
    const line = markdown.slice(nextLineStart, nextLineEnd === -1 ? markdown.length : nextLineEnd);
    const trimmed = line.trim();
    if (!trimmed.startsWith(">") && trimmed !== "" && (!previousWasQuoted || afterBlank)) return nextBreak + 1;
    if (isTopLevelCalloutHeader(line)) return nextBreak + 1;
    if (trimmed === "") {
      afterBlank = true;
    } else {
      previousWasQuoted = trimmed.startsWith(">");
      afterBlank = false;
    }
    cursor = nextLineEnd === -1 ? markdown.length : nextLineEnd;
  }
  return markdown.length;
}

function isTopLevelCalloutHeader(line: string): boolean {
  return /^>\s*\[![^\]]+\]/.test(line.trim());
}
