import { createClarificationItemId } from "../utils/ids";
import { sanitizeMathInMarkdown } from "./MarkdownSanitizer";
import type { ClarificationItem, ClarificationRecord, LearningOsSettings, UiLanguage } from "../types";

export const LEARNOS_CLARIFICATION_ID_PATTERN =
  /%%\s*learnos-clarification-id:\s*(clar-[^%\s]+)\s*%%/g;
const LEARNOS_CLARIFICATION_HTML_ID_PATTERN =
  /<!--\s*learnos-clarification-id:\s*(clar-[^>\s]+)\s*-->/g;
const LEARNOS_ITEM_ID_PATTERN = /<!--\s*learnos-item-id:\s*([^>;\s]+)(?:;\s*ask-ids:\s*([^>]+?))?\s*-->/g;

export interface ClarificationAnnotationMatch {
  clarificationId: string;
  markerStart: number;
  markerEnd: number;
  blockStart: number;
  blockEnd: number;
}

export interface LiveClarificationItem {
  item: ClarificationItem;
  rawMarkdown: string;
}

export function buildClarificationBlock(
  record: Pick<ClarificationRecord, "id" | "items" | "uiLanguage">,
  settings?: Pick<LearningOsSettings, "uiLanguage">
): string {
  const uiLanguage = settings?.uiLanguage ?? record.uiLanguage;
  const title = uiLanguage === "en" ? "My understanding" : "我的理解";
  const lines = [`> [!tip]- 💡 ${title}`, `> <!-- learnos-clarification-id: ${record.id} -->`];

  for (const item of record.items) {
    lines.push(">");
    lines.push(...itemToCalloutLines(item));
  }

  if (record.items.length === 0) {
    lines.push("> ");
  }

  return ensureBlockSpacing(lines.join("\n"));
}

export function findClarificationNearSelection(
  markdown: string,
  selectionStart: number,
  selectionEnd: number
): ClarificationAnnotationMatch | null {
  const matches = findAllClarificationAnnotations(markdown);
  const selectionParagraph = paragraphRangeAt(markdown, selectionStart, selectionEnd);

  for (const match of matches) {
    if (rangesOverlap(selectionStart, selectionEnd, match.blockStart, match.blockEnd)) {
      return match;
    }
    if (
      rangesTouchOrShareWhitespace(
        selectionParagraph.start,
        selectionParagraph.end,
        match.blockStart,
        match.blockEnd,
        markdown
      )
    ) {
      return match;
    }
  }

  return null;
}

export function findClarificationForSourceBlock(
  markdown: string,
  sourceStart: number,
  sourceEnd: number
): ClarificationAnnotationMatch | null {
  for (const match of findAllClarificationAnnotations(markdown)) {
    const between =
      sourceEnd <= match.blockStart ? markdown.slice(sourceEnd, match.blockStart) : "";
    if (between && /^[\s\n]*$/.test(between)) {
      return match;
    }
  }
  return null;
}

export function replaceClarificationBlock(
  markdown: string,
  match: ClarificationAnnotationMatch,
  replacement: string
): string {
  return `${markdown.slice(0, match.blockStart)}${ensureBlockSpacing(replacement)}${markdown
    .slice(match.blockEnd)
    .replace(/^\n+/, "")}`;
}

export function findAllClarificationAnnotations(markdown: string): ClarificationAnnotationMatch[] {
  const matches: ClarificationAnnotationMatch[] = [];

  for (const pattern of [LEARNOS_CLARIFICATION_ID_PATTERN, LEARNOS_CLARIFICATION_HTML_ID_PATTERN]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(markdown)) !== null) {
      const markerStart = match.index;
      const markerEnd = markerStart + match[0].length;
      matches.push({
        clarificationId: match[1],
        markerStart,
        markerEnd,
        blockStart: findBlockStart(markdown, markerStart),
        blockEnd: findBlockEnd(markdown, markerEnd),
      });
    }
  }

  return matches.sort((a, b) => a.markerStart - b.markerStart);
}

function itemToCalloutLines(item: ClarificationItem): string[] {
  const title = normalizeClarificationItemTitle(item.itemTitle || item.targetText || item.question);
  const explanation = normalizeClarificationItemExplanation(item.explanation, title);
  const marker = `<!-- learnos-item-id: ${item.id} -->`;
  const explanationLines = explanation
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstExplanation = explanationLines.shift() ?? "";
  const firstLine = `**${title}**${firstExplanation ? ` ${firstExplanation}` : ""}`.trim();
  return [`> ${marker}`, `> ${firstLine}`, ...explanationLines.map((line) => `> ${line}`)];
}

export function parseLiveClarificationItemsFromBlock(
  blockMarkdown: string,
  fallback: ClarificationItem[] = []
): LiveClarificationItem[] {
  const contentLines = blockMarkdown
    .split("\n")
    .filter((line) => line.trim().startsWith(">"))
    .map((line) => line.replace(/^\s*>\s?/, ""))
    .filter((line) => !line.trim().startsWith("[!tip]"))
    .filter((line) => !line.trim().startsWith("[!note]"))
    .filter((line) => !line.includes("learnos-clarification-id"))
    .filter((line) => !line.includes("learnos-generated-id"));

  const parsed = splitItemChunks(contentLines)
    .map((chunk, index) => parseLiveItemChunk(chunk.join("\n").trim(), fallback[index], index + 1))
    .filter((item): item is LiveClarificationItem => item !== null);

  if (parsed.length > 0) return parsed;

  return fallback.map((item) => ({
    item,
    rawMarkdown: `**${item.itemTitle}** ${item.explanation}`.trim(),
  }));
}

export function liveItemsToClarificationItems(items: LiveClarificationItem[]): ClarificationItem[] {
  return items.map((item) => item.item);
}

function splitItemChunks(lines: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (isStandaloneItemMarkerLine(line) && current.length > 0) {
      chunks.push(current);
      current = [];
    }
    if (!line.trim()) {
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

function isStandaloneItemMarkerLine(line: string): boolean {
  return /^<!--\s*learnos-item-id:\s*[^>]*-->\s*$/.test(line.trim());
}

function parseLiveItemChunk(
  rawMarkdown: string,
  fallback: ClarificationItem | undefined,
  index: number
): LiveClarificationItem | null {
  if (!rawMarkdown.trim()) return null;
  const markerMatch = /<!--\s*learnos-item-id:\s*([^>;\s]+)(?:;\s*ask-ids:\s*([^>]+?))?\s*-->/.exec(rawMarkdown);
  const withoutMarker = rawMarkdown.replace(LEARNOS_ITEM_ID_PATTERN, "").trim();
  LEARNOS_ITEM_ID_PATTERN.lastIndex = 0;
  const titleMatch = /^\*\*(.*?)\*\*\s*([\s\S]*)$/.exec(withoutMarker);
  const title = normalizeClarificationItemTitle(
    titleMatch?.[1] ?? fallback?.itemTitle ?? fallback?.targetText ?? `Clarification ${index}`
  );
  const explanation = normalizeClarificationItemExplanation(titleMatch?.[2] ?? withoutMarker, title);
  const now = new Date().toISOString();
  const item: ClarificationItem = {
    id: markerMatch?.[1] ?? fallback?.id ?? createClarificationItemId(title),
    targetText: fallback?.targetText ?? title,
    itemTitle: title,
    question: fallback?.question ?? "",
    explanation,
    created: fallback?.created ?? now,
    updated: fallback?.updated ?? now,
    relatedInteractionIds: parseAskIds(markerMatch?.[2]) ?? fallback?.relatedInteractionIds ?? [],
  };
  return { item, rawMarkdown };
}

function parseAskIds(value: string | undefined): string[] | null {
  if (!value) return null;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeClarificationItemTitle(value: string): string {
  let title = value.trim();
  title = title.replace(/^\*+/, "").trim();
  title = title.replace(/\*+(\s*[:：!?！？.,，。;；])$/, "$1").trim();
  title = title.replace(/\*+$/, "").trim();
  title = title.replace(/\s+/g, " ");
  if (!title) return "Clarification";
  return title;
}

export function normalizeClarificationItemExplanation(value: string, itemTitle?: string): string {
  const text = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*>\s?/, "").trimEnd())
    .join("\n")
    .replace(/<!--\s*learnos-item-id:\s*[^>]*-->/g, "")
    .replace(/<!--\s*learnos-clarification-id:\s*[^>]*-->/g, "")
    .replace(/%%\s*learnos-clarification-id:\s*[^%]*%%/g, "")
    .trim();
  const withoutDuplicateTitle = itemTitle ? stripLeadingDuplicateTitle(text, itemTitle) : text;
  return sanitizeMathInMarkdown(withoutDuplicateTitle);
}

function stripLeadingDuplicateTitle(value: string, itemTitle: string): string {
  const title = normalizeClarificationItemTitle(itemTitle);
  if (!title) return value.trim();
  const escapedTitle = escapeRegExp(title);
  let text = value.trim();

  for (let index = 0; index < 8; index += 1) {
    const before = text;
    text = text
      .replace(new RegExp(`^\\*\\*${escapedTitle}\\*\\*\\s*[:：]?\\s*(?:\\n|$)`, "i"), "")
      .trimStart();
    text = text.replace(new RegExp(`^\\*\\*${escapedTitle}\\*\\*\\s+`, "i"), "").trimStart();
    if (text === before) break;
  }

  return text.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findBlockStart(markdown: string, markerStart: number): number {
  const markerLineStart = markdown.lastIndexOf("\n", markerStart - 1) + 1;
  let cursor = markerLineStart;
  let skippedMarkerGap = false;

  while (cursor > 0) {
    const previousLineEnd = cursor - 1;
    const previousLineStart = markdown.lastIndexOf("\n", previousLineEnd - 1) + 1;
    const line = markdown.slice(previousLineStart, previousLineEnd);
    if (line.trim() === "") {
      if (!skippedMarkerGap) {
        const beforeBlankEnd = previousLineStart - 1;
        const beforeBlankStart =
          beforeBlankEnd > 0 ? markdown.lastIndexOf("\n", beforeBlankEnd - 1) + 1 : 0;
        const beforeBlankLine = markdown.slice(beforeBlankStart, beforeBlankEnd);
        if (isClarificationLine(beforeBlankLine)) {
          skippedMarkerGap = true;
          cursor = previousLineStart;
          continue;
        }
      }
      break;
    }
    if (!isClarificationLine(line)) break;
    cursor = previousLineStart;
  }

  return cursor;
}

function findBlockEnd(markdown: string, markerEnd: number): number {
  const markerLineStart = markdown.lastIndexOf("\n", markerEnd - 1) + 1;
  const markerLineEnd = nextLineEnd(markdown, markerEnd);
  const markerLine = markdown.slice(markerLineStart, markerLineEnd);
  if (isClarificationLine(markerLine)) {
    let cursor = markerLineEnd;
    if (markdown[cursor] === "\n") cursor += 1;
    while (cursor < markdown.length) {
      const lineEnd = nextLineEnd(markdown, cursor);
      const line = markdown.slice(cursor, lineEnd);
      if (!isClarificationLine(line)) break;
      cursor = lineEnd;
      if (markdown[cursor] === "\n") cursor += 1;
    }
    return cursor;
  }

  let cursor = markerEnd;
  while (cursor < markdown.length && markdown[cursor] === "\n") {
    cursor += 1;
  }
  return cursor;
}

function nextLineEnd(markdown: string, from: number): number {
  const nextNewline = markdown.indexOf("\n", from);
  return nextNewline === -1 ? markdown.length : nextNewline;
}

function isClarificationLine(line: string): boolean {
  return line.trim().startsWith(">");
}

function paragraphRangeAt(markdown: string, selectionStart: number, selectionEnd: number): {
  start: number;
  end: number;
} {
  let start = selectionStart;
  while (start > 0 && markdown.slice(start - 2, start) !== "\n\n") {
    start -= 1;
  }

  let end = selectionEnd;
  while (end < markdown.length && markdown.slice(end, end + 2) !== "\n\n") {
    end += 1;
  }

  return { start, end };
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function rangesTouchOrShareWhitespace(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
  markdown: string
): boolean {
  const between =
    aEnd <= bStart ? markdown.slice(aEnd, bStart) : bEnd <= aStart ? markdown.slice(bEnd, aStart) : "";
  return between.length > 0 && /^[\s\n]*$/.test(between);
}

function ensureBlockSpacing(block: string): string {
  return `${block.trim()}\n\n`;
}
