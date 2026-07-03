import type { Editor, MarkdownView } from "obsidian";
import { getCurrentHeading, getHeadingPath, getParentHeading } from "./HeadingContextExtractor";
import { slugify } from "../utils/ids";
import { stableHash } from "../utils/hash";
import type { LearningOsSettings, SelectionContext } from "../types";

export class SelectionContextCollector {
  constructor(private settings: LearningOsSettings) {}

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
    const headingPath = getHeadingPath(markdown, from.line);
    const frontmatter = parseFrontmatter(markdown);
    const detectedConceptIds = detectConceptIds(frontmatter, headingPath);
    const notePath = view.file?.path ?? "Untitled.md";
    const noteTitle = view.file?.basename ?? "Untitled";

    return {
      notePath,
      noteTitle,
      selectedText,
      headingPath,
      currentHeading: getCurrentHeading(headingPath),
      parentHeading: getParentHeading(headingPath),
      nearbyBefore: getNearbyBefore(editor, from.line, this.settings.maxContextBeforeChars),
      nearbyAfter: getNearbyAfter(editor, editor.getCursor("to").line, this.settings.maxContextAfterChars),
      frontmatter,
      detectedConceptIds,
      sourceBlock: selectedText,
      sourceBlockHash: stableHash(selectedText),
      sourceSentenceTruncated,
      originalSelectionLength,
    };
  }
}

function getNearbyBefore(editor: Editor, line: number, maxChars: number): string {
  const chunks: string[] = [];
  for (let current = line; current >= 0; current -= 1) {
    chunks.unshift(editor.getLine(current));
    const joined = chunks.join("\n");
    if (joined.length >= maxChars) {
      return joined.slice(Math.max(0, joined.length - maxChars));
    }
  }
  return chunks.join("\n");
}

function getNearbyAfter(editor: Editor, line: number, maxChars: number): string {
  const chunks: string[] = [];
  for (let current = line; current < editor.lineCount(); current += 1) {
    chunks.push(editor.getLine(current));
    const joined = chunks.join("\n");
    if (joined.length >= maxChars) {
      return joined.slice(0, maxChars);
    }
  }
  return chunks.join("\n");
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
