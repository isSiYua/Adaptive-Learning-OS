import type { AskJob } from "../types";

export type SourceAnchorKind = "item" | "clarification" | "source-offset" | "selected-text" | "none";

export interface SourceAnchor {
  kind: SourceAnchorKind;
  line: number;
  ch: number;
  id?: string;
}

export function findSourceAnchor(markdown: string, job: AskJob): SourceAnchor {
  for (const itemId of itemAnchorCandidates(job)) {
    const anchor = findLearnOsItemAnchor(markdown, itemId);
    if (anchor) return anchor;
  }

  for (const clarificationId of clarificationAnchorCandidates(job)) {
    const anchor = findLearnOsClarificationAnchor(markdown, clarificationId);
    if (anchor) return anchor;
  }

  if (
    typeof job.sourceStartOffset === "number" &&
    job.sourceStartOffset >= 0 &&
    job.sourceStartOffset <= markdown.length
  ) {
    return {
      kind: "source-offset",
      ...offsetToPosition(markdown, job.sourceStartOffset),
    };
  }

  if (job.selectedText.trim()) {
    const selectedIndex = markdown.indexOf(job.selectedText.trim());
    if (selectedIndex !== -1) {
      return {
        kind: "selected-text",
        ...offsetToPosition(markdown, selectedIndex),
      };
    }
  }

  return { kind: "none", line: 0, ch: 0 };
}

export function findLearnOsItemAnchor(markdown: string, itemId: string): SourceAnchor | null {
  const pattern = new RegExp(`<!--\\s*learnos-item-id:\\s*${escapeRegExp(itemId)}(?:\\s|;|-->)`, "i");
  const match = pattern.exec(markdown);
  if (!match) return null;
  return {
    kind: "item",
    id: itemId,
    ...offsetToPosition(markdown, match.index),
  };
}

export function findLearnOsClarificationAnchor(markdown: string, clarificationId: string): SourceAnchor | null {
  const escaped = escapeRegExp(clarificationId);
  const patterns = [
    new RegExp(`<!--\\s*learnos-clarification-id:\\s*${escaped}(?:\\s|-->)`, "i"),
    new RegExp(`%%\\s*learnos-clarification-id:\\s*${escaped}(?:\\s|%%)`, "i"),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(markdown);
    if (!match) continue;
    return {
      kind: "clarification",
      id: clarificationId,
      ...offsetToPosition(markdown, match.index),
    };
  }

  return null;
}

export function itemAnchorCandidates(job: AskJob): string[] {
  return uniqueIds([
    job.targetItemId,
    ...(job.appliedItemIds ?? []),
    ...(job.relatedItemIds ?? []),
    job.mergeProposal?.targetItemId ?? undefined,
    ...(job.mergeProposal?.operations?.map((operation) => operation.itemId) ?? []),
    ...(job.mergeProposal?.proposedItems?.map((item) => item.id) ?? []),
  ]);
}

export function clarificationAnchorCandidates(job: AskJob): string[] {
  return uniqueIds([
    job.appliedClarificationId,
    job.targetClarificationId,
    job.existingClarificationId,
    job.mergeProposal?.clarificationId,
  ]);
}

function offsetToPosition(markdown: string, offset: number): { line: number; ch: number } {
  const before = markdown.slice(0, offset);
  const lines = before.split(/\r?\n/);
  return { line: lines.length - 1, ch: lines[lines.length - 1].length };
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
