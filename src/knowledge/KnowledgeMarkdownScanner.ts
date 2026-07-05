import { findAllClarificationAnnotations, parseLiveClarificationItemsFromBlock } from "../ask/ClarificationBlock";
import { stableHash } from "../utils/hash";
import type { KnowledgeItemContainerType } from "./KnowledgeTypes";

export interface KnowledgeMarkdownFile {
  path: string;
  content: string;
}

export interface ScannedLearningOsItem {
  itemId: string;
  containerId: string;
  containerType: KnowledgeItemContainerType;
  notePath: string;
  title: string;
  content: string;
  rawMarkdown: string;
  contentHash: string;
}

export function scanLearningOsItems(markdownFiles: KnowledgeMarkdownFile[]): ScannedLearningOsItem[] {
  return markdownFiles.flatMap((file) => scanLearningOsItemsInNote(file.path, file.content));
}

export function scanLearningOsItemsInNote(notePath: string, markdown: string): ScannedLearningOsItem[] {
  const items: ScannedLearningOsItem[] = [];

  for (const match of findAllClarificationAnnotations(markdown)) {
    const block = markdown.slice(match.blockStart, match.blockEnd);
    items.push(...itemsFromBlock(notePath, block, match.clarificationId, "clarification"));
  }

  for (const match of findAllGeneratedAnnotations(markdown)) {
    const block = markdown.slice(match.blockStart, match.blockEnd);
    items.push(...itemsFromBlock(notePath, block, match.generatedId, "generated-content"));
  }

  return dedupeItems(items);
}

function itemsFromBlock(
  notePath: string,
  block: string,
  containerId: string,
  containerType: KnowledgeItemContainerType
): ScannedLearningOsItem[] {
  return parseLiveClarificationItemsFromBlock(block, []).map((liveItem) => ({
    itemId: liveItem.item.id,
    containerId,
    containerType,
    notePath,
    title: liveItem.item.itemTitle,
    content: liveItem.item.explanation,
    rawMarkdown: liveItem.rawMarkdown,
    contentHash: stableHash(liveItem.rawMarkdown),
  }));
}

interface GeneratedAnnotationMatch {
  generatedId: string;
  blockStart: number;
  blockEnd: number;
}

function findAllGeneratedAnnotations(markdown: string): GeneratedAnnotationMatch[] {
  const matches: GeneratedAnnotationMatch[] = [];
  const pattern = /<!--\s*learnos-generated-id:\s*(gen-[^>\s]+)\s*-->/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    matches.push({
      generatedId: match[1],
      blockStart: findLearningOsCalloutStart(markdown, match.index),
      blockEnd: findLearningOsCalloutEnd(markdown, match.index + match[0].length),
    });
  }
  return matches;
}

function findLearningOsCalloutStart(markdown: string, markerStart: number): number {
  let start = markdown.lastIndexOf("\n", markerStart - 1) + 1;
  while (start > 0) {
    const previousEnd = start - 1;
    const previousStart = markdown.lastIndexOf("\n", previousEnd - 1) + 1;
    const line = markdown.slice(previousStart, previousEnd);
    if (!line.trim().startsWith(">") && line.trim() !== "") break;
    start = previousStart;
  }
  return start;
}

function findLearningOsCalloutEnd(markdown: string, markerEnd: number): number {
  let cursor = markerEnd;
  while (cursor < markdown.length) {
    const nextBreak = markdown.indexOf("\n", cursor);
    if (nextBreak === -1) return markdown.length;
    const nextLineStart = nextBreak + 1;
    const nextLineEnd = markdown.indexOf("\n", nextLineStart);
    const line = markdown.slice(nextLineStart, nextLineEnd === -1 ? markdown.length : nextLineEnd);
    if (!line.trim().startsWith(">") && line.trim() !== "") return nextBreak + 1;
    cursor = nextLineEnd === -1 ? markdown.length : nextLineEnd;
  }
  return markdown.length;
}

function dedupeItems(items: ScannedLearningOsItem[]): ScannedLearningOsItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.itemId)) return false;
    seen.add(item.itemId);
    return true;
  });
}
