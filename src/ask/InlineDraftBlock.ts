import { stableHash } from "../utils/hash";
import { normalizeClarificationItemExplanation, normalizeClarificationItemTitle } from "./ClarificationBlock";
import type { ClarificationItem } from "../types";

export type InlineDraftKind = "clarification" | "generated-content" | "unknown";
export type InlineDraftOperation = "add-item" | "add-sibling-item" | "update-item" | "unknown";

export interface InlineDraftItem {
  draftItemId: string;
  title: string;
  content: string;
  rawMarkdown: string;
}

export interface InlineDraftBlock {
  draftId: string;
  jobId?: string;
  kind: InlineDraftKind;
  operation: InlineDraftOperation;
  targetContainerId?: string;
  targetItemId?: string;
  targetItemHash?: string;
  sourceBlockHash?: string;
  createdAt?: string;
  draftContentHash: string;
  blockStart: number;
  blockEnd: number;
  rawMarkdown: string;
  items: InlineDraftItem[];
}

export function hasInlineDraftMarkers(markdown: string): boolean {
  return /<!--\s*learnos-draft-id:\s*[^>]+-->/i.test(markdown);
}

export function findAllInlineDraftBlocks(markdown: string): InlineDraftBlock[] {
  const blocks: InlineDraftBlock[] = [];
  const pattern = /<!--\s*learnos-draft-id:\s*([^>\s]+)\s*-->/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const blockStart = findLearningOsCalloutStart(markdown, match.index);
    const blockEnd = findLearningOsCalloutEnd(markdown, match.index + match[0].length);
    const rawMarkdown = markdown.slice(blockStart, blockEnd);
    blocks.push({
      draftId: match[1],
      jobId: readDraftField(rawMarkdown, "job-id"),
      kind: draftKind(readDraftField(rawMarkdown, "kind")),
      operation: draftOperation(readDraftField(rawMarkdown, "operation")),
      targetContainerId: readDraftField(rawMarkdown, "target-container-id"),
      targetItemId: readDraftField(rawMarkdown, "target-item-id"),
      targetItemHash: readDraftField(rawMarkdown, "target-item-hash"),
      sourceBlockHash: readDraftField(rawMarkdown, "source-block-hash"),
      createdAt: readDraftField(rawMarkdown, "created-at"),
      draftContentHash: stableHash(rawMarkdown),
      blockStart,
      blockEnd,
      rawMarkdown,
      items: parseInlineDraftItems(rawMarkdown),
    });
  }
  return dedupeDrafts(blocks);
}

export function findInlineDraftByJobId(markdown: string, jobId: string): InlineDraftBlock | null {
  return findAllInlineDraftBlocks(markdown).find((block) => block.jobId === jobId) ?? null;
}

export function removeInlineDraftBlock(
  markdown: string,
  draft: Pick<InlineDraftBlock, "blockStart" | "blockEnd"> & Partial<Pick<InlineDraftBlock, "draftId" | "jobId">>
): string {
  const liveDraft =
    draft.draftId || draft.jobId
      ? findAllInlineDraftBlocks(markdown).find(
          (block) => (draft.draftId && block.draftId === draft.draftId) || (draft.jobId && block.jobId === draft.jobId)
        )
      : null;
  if (liveDraft) {
    return removeRange(markdown, liveDraft.blockStart, liveDraft.blockEnd);
  }
  if (draft.draftId || draft.jobId) {
    return markdown;
  }
  return removeRange(markdown, draft.blockStart, draft.blockEnd);
}

export function renderInlineDraftBlock(params: {
  draftId: string;
  jobId: string;
  kind: Exclude<InlineDraftKind, "unknown">;
  operation: Exclude<InlineDraftOperation, "unknown">;
  targetContainerId?: string;
  targetItemId?: string;
  targetItemHash?: string;
  sourceBlockHash?: string;
  createdAt: string;
  items: Array<Pick<ClarificationItem, "id" | "itemTitle" | "targetText" | "question" | "explanation">>;
}): string {
  const title = params.kind === "generated-content" ? "✍️ Learning OS draft" : "💡 Learning OS draft";
  const lines = [
    `> [!todo]- ${title}`,
    `> <!-- learnos-draft-id: ${params.draftId} -->`,
    `> <!-- learnos-draft-job-id: ${params.jobId} -->`,
    `> <!-- learnos-draft-kind: ${params.kind} -->`,
    `> <!-- learnos-draft-operation: ${params.operation} -->`,
  ];
  if (params.targetContainerId) lines.push(`> <!-- learnos-draft-target-container-id: ${params.targetContainerId} -->`);
  if (params.targetItemId) lines.push(`> <!-- learnos-draft-target-item-id: ${params.targetItemId} -->`);
  if (params.targetItemHash) lines.push(`> <!-- learnos-draft-target-item-hash: ${params.targetItemHash} -->`);
  if (params.sourceBlockHash) lines.push(`> <!-- learnos-draft-source-block-hash: ${params.sourceBlockHash} -->`);
  lines.push(`> <!-- learnos-draft-created-at: ${params.createdAt} -->`);

  for (const item of params.items) {
    const titleText = normalizeClarificationItemTitle(item.itemTitle || item.targetText || item.question || "Draft item");
    const explanation = normalizeClarificationItemExplanation(item.explanation, titleText);
    if (!explanation.trim()) continue;
    lines.push(">");
    lines.push(`> <!-- learnos-draft-item-id: ${draftItemIdForFinalItemId(item.id)} -->`);
    const explanationLines = explanation
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const first = explanationLines.shift() ?? "";
    lines.push(`> ${`**${titleText}**${first ? ` ${first}` : ""}`.trim()}`);
    lines.push(...explanationLines.map((line) => `> ${line}`));
  }

  return `${lines.join("\n")}\n\n`;
}

export function draftItemToClarificationItem(
  item: InlineDraftItem,
  fallback: Partial<ClarificationItem>,
  nowIso: string
): ClarificationItem {
  const title = normalizeClarificationItemTitle(item.title || fallback.itemTitle || fallback.targetText || "Draft item");
  return {
    id: finalItemIdForDraftItemId(item.draftItemId),
    targetText: fallback.targetText || title,
    itemTitle: title,
    question: fallback.question || title,
    explanation: normalizeClarificationItemExplanation(item.content, title),
    created: fallback.created || nowIso,
    updated: nowIso,
    relatedInteractionIds: fallback.relatedInteractionIds ?? [],
  };
}

export function draftItemIdForFinalItemId(itemId: string | undefined): string {
  const id = itemId?.trim() || "item-draft";
  return id.startsWith("draft-item-") ? id : `draft-${id}`;
}

export function finalItemIdForDraftItemId(draftItemId: string): string {
  const clean = draftItemId.trim();
  return clean.startsWith("draft-") ? clean.slice("draft-".length) : clean;
}

export function parseInlineDraftItems(blockMarkdown: string): InlineDraftItem[] {
  const matches = Array.from(blockMarkdown.matchAll(/<!--\s*learnos-draft-item-id:\s*([^>\s]+)\s*-->/g));
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? blockMarkdown.length : blockMarkdown.length;
    const rawMarkdown = blockMarkdown.slice(start, end).trim();
    const plain = stripQuotePrefixes(rawMarkdown)
      .replace(/<!--\s*learnos-draft-item-id:\s*[^>]+\s*-->/, "")
      .trim();
    const titleMatch = plain.match(/^\*\*([^*]+)\*\*\s*(.*)$/s);
    return {
      draftItemId: match[1],
      title: titleMatch?.[1]?.trim() || "Untitled draft item",
      content: (titleMatch?.[2] ?? plain).trim(),
      rawMarkdown,
    };
  });
}

function readDraftField(markdown: string, field: string): string | undefined {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`<!--\\s*learnos-draft-${escaped}:\\s*([^>]+?)\\s*-->`, "i"));
  return match?.[1]?.trim();
}

function draftKind(value: string | undefined): InlineDraftKind {
  if (value === "clarification" || value === "generated-content") return value;
  return "unknown";
}

function draftOperation(value: string | undefined): InlineDraftOperation {
  if (value === "add-item" || value === "add-sibling-item" || value === "update-item") return value;
  return "unknown";
}

function stripQuotePrefixes(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => line.replace(/^\s*>\s?/, ""))
    .join("\n")
    .trim();
}

function removeRange(markdown: string, start: number, end: number): string {
  return `${markdown.slice(0, start)}${markdown.slice(end).replace(/^\n+/, "")}`;
}

function findLearningOsCalloutStart(markdown: string, markerStart: number): number {
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

function findLearningOsCalloutEnd(markdown: string, markerEnd: number): number {
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

function dedupeDrafts(blocks: InlineDraftBlock[]): InlineDraftBlock[] {
  const seen = new Set<string>();
  return blocks.filter((block) => {
    if (seen.has(block.draftId)) return false;
    seen.add(block.draftId);
    return true;
  });
}
