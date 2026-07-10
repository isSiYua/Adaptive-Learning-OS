import { findAllClarificationAnnotations, parseLiveClarificationItemsFromBlock } from "./ClarificationBlock";
import { stableHash } from "../utils/hash";
import type { ClarificationItem, SelectionContext } from "../types";

export type LearningOsContainerType = "clarification-item" | "generated-content-item";

export interface LearningOsContainerMatch {
  type: LearningOsContainerType;
  containerId: string;
  blockStart: number;
  blockEnd: number;
}

export interface LearningOsItemContext {
  selected: NonNullable<SelectionContext["selectedLearningOsItem"]>;
  siblings: NonNullable<SelectionContext["siblingLearningOsItems"]>;
  sourceBlock: {
    text: string;
    hash: string;
    start: number;
    end: number;
  };
}

interface ParsedLearningOsItem {
  item: ClarificationItem;
  rawMarkdown: string;
  start: number;
  end: number;
}

export function findLearningOsContainerAtSelection(
  markdown: string,
  selectionStart: number,
  selectionEnd: number
): LearningOsContainerMatch | null {
  const candidates = [
    ...findAllClarificationAnnotations(markdown).map((match) => ({
      type: "clarification-item" as const,
      containerId: match.clarificationId,
      blockStart: match.blockStart,
      blockEnd: findLearningOsCalloutEnd(markdown, match.markerEnd),
    })),
    ...findAllGeneratedAnnotations(markdown),
  ].sort((a, b) => a.blockStart - b.blockStart || a.blockEnd - b.blockEnd);

  return candidates.find((match) => selectionStart < match.blockEnd && match.blockStart < selectionEnd) ?? null;
}

export function findAllGeneratedAnnotations(markdown: string): LearningOsContainerMatch[] {
  const pattern = /<!--\s*learnos-generated-id:\s*(gen-[^>\s]+)\s*-->/g;
  const matches: LearningOsContainerMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    matches.push({
      type: "generated-content-item",
      containerId: match[1],
      blockStart: findLearningOsCalloutStart(markdown, match.index),
      blockEnd: findLearningOsCalloutEnd(markdown, match.index + match[0].length),
    });
  }
  return matches;
}

export function learningOsItemContextFromBlock(params: {
  blockMarkdown: string;
  containerId: string;
  selectedText: string;
  selectionStartInBlock: number;
  fallbackItems: ClarificationItem[];
}): LearningOsItemContext | null {
  const items = parseLearningOsItemsWithRanges(params.blockMarkdown, params.fallbackItems);
  if (items.length === 0) return null;

  const needle = params.selectedText.trim();
  const selected =
    items.find(
      (item) =>
        params.selectionStartInBlock >= item.start &&
        params.selectionStartInBlock < item.end &&
        selectedTextBelongsToItem(needle, item)
    ) ?? null;
  if (!selected) return null;

  const sourceText = selected.rawMarkdown.trim();
  return {
    selected: {
      containerId: params.containerId,
      itemId: selected.item.id,
      itemTitle: selected.item.itemTitle,
      itemContent: selected.item.explanation,
    },
    siblings: items
      .filter((item) => item.item.id !== selected.item.id)
      .map((item) => ({
        itemId: item.item.id,
        itemTitle: item.item.itemTitle,
        itemContent: item.item.explanation,
      })),
    sourceBlock: {
      text: sourceText,
      hash: stableHash(sourceText),
      start: selected.start,
      end: selected.end,
    },
  };
}

export function findLearningOsCalloutStart(markdown: string, markerStart: number): number {
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

export function findLearningOsCalloutEnd(markdown: string, markerEnd: number): number {
  let cursor = markerEnd;
  let lazyContinuationStarted = false;
  let afterBlank = false;
  while (cursor < markdown.length) {
    const nextBreak = markdown.indexOf("\n", cursor);
    if (nextBreak === -1) return markdown.length;
    const nextLineStart = nextBreak + 1;
    const nextLineEnd = markdown.indexOf("\n", nextLineStart);
    const line = markdown.slice(nextLineStart, nextLineEnd === -1 ? markdown.length : nextLineEnd);
    const trimmed = line.trim();

    if (isTopLevelCalloutHeader(line) || isMarkdownBoundary(trimmed)) return nextBreak + 1;

    if (trimmed === "") {
      afterBlank = true;
    } else if (trimmed.startsWith(">")) {
      afterBlank = false;
    } else if (!lazyContinuationStarted || !afterBlank) {
      lazyContinuationStarted = true;
      afterBlank = false;
    } else {
      return nextBreak + 1;
    }
    cursor = nextLineEnd === -1 ? markdown.length : nextLineEnd;
  }
  return markdown.length;
}

function parseLearningOsItemsWithRanges(blockMarkdown: string, fallbackItems: ClarificationItem[]): ParsedLearningOsItem[] {
  const markerPattern = /<!--\s*learnos-item-id:\s*([^>;\s]+)(?:;\s*ask-ids:\s*[^>]+)?\s*-->/g;
  const markers: Array<{ id: string; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = markerPattern.exec(blockMarkdown)) !== null) {
    markers.push({ id: match[1], index: match.index });
  }

  if (markers.length === 0) {
    return parseLiveClarificationItemsFromBlock(blockMarkdown, fallbackItems).map((entry, index) => ({
      item: entry.item,
      rawMarkdown: entry.rawMarkdown,
      start: 0,
      end: blockMarkdown.length || index + 1,
    }));
  }

  return markers
    .map((marker, index) => {
      const start = lineStartAt(blockMarkdown, marker.index);
      const end = index + 1 < markers.length ? lineStartAt(blockMarkdown, markers[index + 1].index) : blockMarkdown.length;
      const rawMarkdown = blockMarkdown.slice(start, end).trimEnd();
      const fallback = fallbackItems.find((item) => item.id === marker.id) ?? fallbackItems[index];
      const parsed = parseLiveClarificationItemsFromBlock(rawMarkdown, fallback ? [fallback] : [])[0];
      if (!parsed) return null;
      return {
        item: parsed.item,
        rawMarkdown,
        start,
        end,
      };
    })
    .filter((item): item is ParsedLearningOsItem => item !== null);
}

function selectedTextBelongsToItem(needle: string, item: ParsedLearningOsItem): boolean {
  if (!needle) return true;
  return (
    item.rawMarkdown.includes(needle) ||
    item.item.itemTitle.includes(needle) ||
    item.item.explanation.includes(needle) ||
    item.item.targetText.includes(needle)
  );
}

function lineStartAt(markdown: string, offset: number): number {
  return markdown.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
}

function isTopLevelCalloutHeader(line: string): boolean {
  return /^>\s*\[![^\]]+\]/.test(line.trim());
}

function isMarkdownBoundary(trimmedLine: string): boolean {
  return /^#{1,6}\s+/.test(trimmedLine) || /^-{3,}\s*$/.test(trimmedLine);
}
