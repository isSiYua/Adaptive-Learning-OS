import type { Editor, MarkdownView } from "obsidian";
import { getCurrentHeading, getHeadingPath, getParentHeading } from "./HeadingContextExtractor";
import { positionToOffset } from "./MarkdownOffsets";
import {
  getNextNonEmptyBlockAfterOffset,
  getPreviousNonEmptyBlockBeforeOffset,
  resolveOriginalProseContext,
} from "./SourceBlock";
import { slugify } from "../utils/ids";
import type { LearningOsSettings, SelectionContext } from "../types";

export class SelectionContextCollector {
  private settings: LearningOsSettings;

  constructor(settings: LearningOsSettings) {
    this.settings = settings;
  }

  collect(editor: Editor, view: MarkdownView): SelectionContext {
    const originalSelectedText = editor.getSelection().trim();
    const originalSelectionLength = originalSelectedText.length;
    let selectedText = originalSelectedText;
    let sourceSentenceTruncated = false;

    if (originalSelectionLength > this.settings.maxSelectedTextChars) {
      const useFullSelection = confirm(
        `Your selection is ${originalSelectionLength} characters. Use the full selection in Learning OS storage and prompt? Choose Cancel to truncate to ${this.settings.maxSelectedTextChars} characters.`
      );
      if (!useFullSelection) {
        selectedText = originalSelectedText.slice(0, this.settings.maxSelectedTextChars);
        sourceSentenceTruncated = true;
      }
    }

    const markdown = editor.getValue();
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    const selectionStart = positionToOffset(markdown, from);
    const selectionEnd = positionToOffset(markdown, to);
    const originalContext = resolveOriginalProseContext({
      markdown,
      selectionStart,
      selectionEnd,
      selectedText,
    });
    const sourceBlock = originalContext.sourceBlock ?? {
      start: selectionStart,
      end: selectionEnd,
      text: selectedText,
      hash: "",
    };
    const notePath = view.file?.path ?? "Untitled.md";
    const noteTitle = view.file?.basename ?? "Untitled";
    const headingPath = buildExpandedHeadingPath(notePath, noteTitle, getHeadingPath(markdown, from.line));
    const frontmatter = parseFrontmatter(markdown);
    const detectedConceptIds = detectConceptIds(frontmatter, headingPath);

    return {
      notePath,
      noteTitle,
      selectedText,
      headingPath,
      currentHeading: getCurrentHeading(headingPath),
      parentHeading: getParentHeading(headingPath),
      nearbyBefore: truncateFromStart(originalContext.nearbyBefore, this.settings.maxContextBeforeChars),
      nearbyAfter: truncateFromEnd(originalContext.nearbyAfter, this.settings.maxContextAfterChars),
      frontmatter,
      detectedConceptIds,
      sourceBlock: sourceBlock.text,
      sourceBlockHash: sourceBlock.hash,
      sourceStartOffset: sourceBlock.start,
      sourceEndOffset: sourceBlock.end,
      sourceSentenceTruncated,
      originalSelectionLength,
    };
  }
}

export function buildExpandedHeadingPath(notePath: string, noteTitle: string, noteHeadingPath: string[]): string[] {
  const pathWithoutExtension = notePath.replace(/\.md$/i, "");
  const parts = pathWithoutExtension
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0 && noteTitle.trim()) parts.push(noteTitle.trim());
  return [...parts, ...noteHeadingPath];
}

export function getAdjacentParagraphBefore(markdown: string, line: number, maxChars: number): string {
  const lines = markdown.split(/\r?\n/);
  let current = line - 1;
  while (current >= 0 && !lines[current].trim()) current -= 1;
  if (current < 0) return "";

  const end = current;
  while (current >= 0 && lines[current].trim()) {
    current -= 1;
  }
  return truncateFromStart(lines.slice(current + 1, end + 1).join("\n").trim(), maxChars);
}

export function getAdjacentParagraphAfter(markdown: string, line: number, maxChars: number): string {
  const lines = markdown.split(/\r?\n/);
  let current = line + 1;
  while (current < lines.length && !lines[current].trim()) current += 1;
  if (current >= lines.length) return "";

  const start = current;
  while (current < lines.length && lines[current].trim()) {
    current += 1;
  }
  return truncateFromEnd(lines.slice(start, current).join("\n").trim(), maxChars);
}

export function getAdjacentParagraphBeforeOffset(markdown: string, sourceStart: number, maxChars: number): string {
  return truncateFromStart(getPreviousNonEmptyBlockBeforeOffset(markdown, sourceStart)?.text ?? "", maxChars);
}

export function getAdjacentParagraphAfterOffset(markdown: string, sourceEnd: number, maxChars: number): string {
  return truncateFromEnd(getNextNonEmptyBlockAfterOffset(markdown, sourceEnd)?.text ?? "", maxChars);
}

export function getAdjacentLineBeforeOffset(markdown: string, sourceStart: number, maxChars: number): string {
  return truncateFromStart(
    resolveOriginalProseContext({ markdown, sourceStartOffset: sourceStart, sourceEndOffset: sourceStart }).nearbyBefore,
    maxChars
  );
}

export function getAdjacentLineAfterOffset(markdown: string, sourceEnd: number, maxChars: number): string {
  return truncateFromEnd(
    resolveOriginalProseContext({ markdown, sourceStartOffset: sourceEnd, sourceEndOffset: sourceEnd }).nearbyAfter,
    maxChars
  );
}

function truncateFromStart(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `...[truncated]\n${value.slice(Math.max(0, value.length - maxChars))}`;
}

function truncateFromEnd(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

function parseFrontmatter(markdown: string): Record<string, unknown> {
  if (!markdown.startsWith("---")) return {};
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return {};

  const frontmatter: Record<string, unknown> = {};
  const body = markdown.slice(3, end).trim();
  for (const line of body.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    frontmatter[match[1]] = match[2].trim();
  }

  return frontmatter;
}

function detectConceptIds(frontmatter: Record<string, unknown>, headingPath: string[]): string[] {
  const concepts = new Set<string>();
  const conceptId = frontmatter.concept_id;
  const frontmatterConcepts = frontmatter.concepts;

  if (typeof conceptId === "string" && conceptId.trim()) {
    concepts.add(conceptId.trim());
  }

  if (typeof frontmatterConcepts === "string" && frontmatterConcepts.trim()) {
    for (const concept of frontmatterConcepts.split(",")) {
      concepts.add(slugify(concept));
    }
  }

  if (concepts.size === 0 && headingPath.length > 0) {
    concepts.add(slugify(headingPath[headingPath.length - 1]));
  }

  return Array.from(concepts);
}
