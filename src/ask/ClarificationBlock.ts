import type { ClarificationItem, ClarificationRecord, LearningOsSettings, UiLanguage } from "../types";

export const LEARNOS_CLARIFICATION_ID_PATTERN =
  /%%\s*learnos-clarification-id:\s*(clar-[^%\s]+)\s*%%/g;

export interface ClarificationAnnotationMatch {
  clarificationId: string;
  markerStart: number;
  markerEnd: number;
  blockStart: number;
  blockEnd: number;
}

export function buildClarificationBlock(
  record: Pick<ClarificationRecord, "id" | "items" | "uiLanguage">,
  settings?: Pick<LearningOsSettings, "uiLanguage">
): string {
  const uiLanguage = settings?.uiLanguage ?? record.uiLanguage;
  const title = uiLanguage === "en" ? "My understanding" : "我的理解";
  const lines = [`> [!tip]- 💡 ${title}`];

  for (const [index, item] of record.items.entries()) {
    if (index > 0) lines.push(">");
    lines.push(...itemToCalloutLines(item));
  }

  if (record.items.length === 0) {
    lines.push("> ");
  }

  return ensureBlockSpacing(`${lines.join("\n")}\n\n%% learnos-clarification-id: ${record.id} %%`);
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
  LEARNOS_CLARIFICATION_ID_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = LEARNOS_CLARIFICATION_ID_PATTERN.exec(markdown)) !== null) {
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

  return matches;
}

function itemToCalloutLines(item: ClarificationItem): string[] {
  const content = `**${item.itemTitle}** ${item.explanation}`.trim();
  return content.split("\n").map((line) => `> ${line}`);
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
  let cursor = markerEnd;
  while (cursor < markdown.length && markdown[cursor] === "\n") {
    cursor += 1;
  }
  return cursor;
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
