import type { AskCardRecord, ClarificationInsertionStyle, LearningOsSettings } from "../types";

export const LEARNOS_ASK_ID_PATTERN = /%%\s*learnos-ask-id:\s*(ask-[^%\s]+)\s*%%/g;

export interface AnnotationMatch {
  askId: string;
  markerStart: number;
  markerEnd: number;
  blockStart: number;
  blockEnd: number;
}

export function buildVisibleClarification(
  record: Pick<AskCardRecord, "id" | "question" | "myTakeaway">,
  settings: Pick<
    LearningOsSettings,
    "clarificationInsertionStyle" | "showQuestionInVisibleClarification"
  >
): string {
  const marker = `%% learnos-ask-id: ${record.id} %%`;
  const takeaway = sanitizeVisibleText(record.myTakeaway);
  const question = sanitizeVisibleText(record.question);

  if (settings.clarificationInsertionStyle === "hidden-only") {
    return ensureBlockSpacing(marker);
  }

  if (settings.clarificationInsertionStyle === "inline") {
    const line = takeaway ? `💡 我的理解：${takeaway}` : "💡 我的理解：";
    return ensureBlockSpacing(`${line}\n\n${marker}`);
  }

  const lines = ["> [!tip]- 💡 我的理解"];
  if (settings.showQuestionInVisibleClarification && question) {
    lines.push(`> **问题**：${question}`, ">");
  }
  lines.push(...toCalloutLines(takeaway));
  return ensureBlockSpacing(`${lines.join("\n")}\n\n${marker}`);
}

export function findAnnotationNearSelection(
  markdown: string,
  selectionStart: number,
  selectionEnd: number
): AnnotationMatch | null {
  const matches = findAllAnnotations(markdown);
  const selectionParagraph = paragraphRangeAt(markdown, selectionStart, selectionEnd);

  for (const match of matches) {
    if (rangesOverlap(selectionStart, selectionEnd, match.blockStart, match.blockEnd)) {
      return match;
    }
    if (rangesTouchOrShareWhitespace(selectionParagraph.start, selectionParagraph.end, match.blockStart, match.blockEnd, markdown)) {
      return match;
    }
  }

  return null;
}

export function replaceAnnotationBlock(markdown: string, match: AnnotationMatch, replacement: string): string {
  return `${markdown.slice(0, match.blockStart)}${ensureBlockSpacing(replacement)}${markdown.slice(
    match.blockEnd
  ).replace(/^\n+/, "")}`;
}

export function findAllAnnotations(markdown: string): AnnotationMatch[] {
  const matches: AnnotationMatch[] = [];
  LEARNOS_ASK_ID_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = LEARNOS_ASK_ID_PATTERN.exec(markdown)) !== null) {
    const markerStart = match.index;
    const markerEnd = markerStart + match[0].length;
    matches.push({
      askId: match[1],
      markerStart,
      markerEnd,
      blockStart: findBlockStart(markdown, markerStart),
      blockEnd: findBlockEnd(markdown, markerEnd),
    });
  }

  return matches;
}

export function stripVisibleMetadataForTest(markdown: string): boolean {
  return !/(schemaVersion|rawAnswer|key_answer|mastery_signal|review_needed|>>> ASK_CARD|<<<)/.test(
    markdown
  );
}

function sanitizeVisibleText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function toCalloutLines(value: string): string[] {
  if (!value) return ["> "];
  return value.split("\n").map((line) => `> ${line}`);
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
        const beforeBlankStart = beforeBlankEnd > 0 ? markdown.lastIndexOf("\n", beforeBlankEnd - 1) + 1 : 0;
        const beforeBlankLine = markdown.slice(beforeBlankStart, beforeBlankEnd);
        if (isClarificationVisibleLine(beforeBlankLine)) {
          skippedMarkerGap = true;
          cursor = previousLineStart;
          continue;
        }
      }
      break;
    }
    if (!isClarificationVisibleLine(line)) break;
    cursor = previousLineStart;
  }

  return cursor;
}

function findBlockEnd(markdown: string, markerEnd: number): number {
  let cursor = markerEnd;
  while (cursor < markdown.length && markdown[cursor] === "\n") {
    cursor += 1;
  }
  return cursor;
}

function ensureBlockSpacing(block: string): string {
  return `${block.trim()}\n\n`;
}

function isClarificationVisibleLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith(">") || trimmed.startsWith("💡 我的理解");
}

function paragraphRangeAt(markdown: string, selectionStart: number, selectionEnd: number): {
  start: number;
  end: number;
} {
  let start = selectionStart;
  while (start > 0 && !isBlankLineBefore(markdown, start)) {
    start -= 1;
  }

  let end = selectionEnd;
  while (end < markdown.length && !isBlankLineAfter(markdown, end)) {
    end += 1;
  }

  return { start, end };
}

function isBlankLineBefore(markdown: string, index: number): boolean {
  return markdown.slice(Math.max(0, index - 2), index) === "\n\n";
}

function isBlankLineAfter(markdown: string, index: number): boolean {
  return markdown.slice(index, index + 2) === "\n\n";
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
