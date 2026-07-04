import { stableHash } from "../utils/hash";

export interface SourceBlockRange {
  start: number;
  end: number;
  text: string;
  hash: string;
}

export type SemanticBlockType =
  | "heading"
  | "normal"
  | "learning-os-clarification"
  | "learning-os-generated"
  | "code"
  | "other";

export interface SemanticBlock extends SourceBlockRange {
  type: SemanticBlockType;
  clarificationId?: string;
  generatedId?: string;
}

export type DetectedAskSourceMode = "normal-note" | "clarification-item" | "generated-content-item";

export interface OriginalProseContext {
  sourceBlock: SourceBlockRange | null;
  nearbyBefore: string;
  nearbyAfter: string;
  method: "selection" | "exact-source" | "hash" | "selected-text" | "missing";
}

interface MarkdownLine {
  start: number;
  end: number;
  nextStart: number;
  text: string;
}

export function getSourceBlockAtSelection(
  markdown: string,
  selectionStart: number,
  selectionEnd: number
): SourceBlockRange {
  const lines = getMarkdownLines(markdown);
  const startLine = findFirstNonBlankLineInRange(lines, selectionStart, selectionEnd);
  const endLine = findLastNonBlankLineInRange(lines, selectionStart, selectionEnd);
  if (startLine === -1 || endLine === -1) return emptyRange(selectionStart);

  return rangeFromLineSpan(markdown, lines, blockStartLine(lines, startLine), blockEndLine(lines, endLine));
}

export function getLineBlockAtSelection(
  markdown: string,
  selectionStart: number,
  selectionEnd: number
): SourceBlockRange {
  const lines = getMarkdownLines(markdown);
  const startLine = findFirstNonBlankLineInRange(lines, selectionStart, selectionEnd);
  const endLine = findLastNonBlankLineInRange(lines, selectionStart, selectionEnd);
  if (startLine === -1 || endLine === -1) return emptyRange(selectionStart);

  return rangeFromLineSpan(markdown, lines, startLine, endLine);
}

export function getSemanticSourceBlockAtSelection(
  markdown: string,
  selectionStart: number,
  selectionEnd: number
): SourceBlockRange {
  const block = findSemanticBlockAtSelection(markdown, selectionStart, selectionEnd);
  if (block?.type === "normal") return getLineBlockAtSelection(markdown, selectionStart, selectionEnd);
  return getLineBlockAtSelection(markdown, selectionStart, selectionEnd);
}

export function detectAskSourceMode(
  markdown: string,
  selectionStart: number,
  selectionEnd: number
): DetectedAskSourceMode {
  const block = findSemanticBlockAtSelection(markdown, selectionStart, selectionEnd);
  if (block?.type === "learning-os-generated") return "generated-content-item";
  if (block?.type === "learning-os-clarification") return "clarification-item";
  return "normal-note";
}

export function resolveOriginalProseContext(params: {
  markdown: string;
  selectionStart?: number;
  selectionEnd?: number;
  selectedText?: string;
  sourceBlock?: string;
  sourceBlockHash?: string;
  sourceStartOffset?: number;
  sourceEndOffset?: number;
}): OriginalProseContext {
  const blocks = parseSemanticBlocks(params.markdown);
  const normalBlocks = blocks.filter((block) => block.type === "normal");
  const source = resolveOriginalProseSourceBlock(params, normalBlocks);
  if (!source) {
    return { sourceBlock: null, nearbyBefore: "", nearbyAfter: "", method: "missing" };
  }
  const sourceIndex = findSemanticSourceIndex(blocks, source);
  return {
    sourceBlock: source,
    nearbyBefore: sourceIndex >= 0 ? previousNormalBlockText(blocks, sourceIndex) : "",
    nearbyAfter: sourceIndex >= 0 ? nextNormalBlockText(blocks, sourceIndex) : "",
    method: source.method,
  };
}

export function getPreviousOriginalProseBlockBeforeOffset(
  markdown: string,
  offset: number
): SourceBlockRange | null {
  const blocks = parseSemanticBlocks(markdown);
  const currentIndex = blockIndexNearOffset(blocks, offset);
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    if (blocks[index].type === "heading") break;
    if (blocks[index].type === "normal") return sourceRangeFromSemanticBlock(blocks[index]);
  }
  return null;
}

export function getNextOriginalProseBlockAfterOffset(markdown: string, offset: number): SourceBlockRange | null {
  const blocks = parseSemanticBlocks(markdown);
  const currentIndex = blockIndexNearOffset(blocks, offset);
  for (let index = currentIndex + 1; index < blocks.length; index += 1) {
    if (blocks[index].type === "heading") break;
    if (blocks[index].type === "normal") return sourceRangeFromSemanticBlock(blocks[index]);
  }
  return null;
}

export function parseSemanticBlocks(markdown: string): SemanticBlock[] {
  const lines = getMarkdownLines(markdown);
  const blocks: SemanticBlock[] = [];
  let index = 0;
  let inCode = false;

  while (index < lines.length) {
    if (isBlankLine(lines[index])) {
      index += 1;
      continue;
    }

    const startLine = index;
    if (/^\s*```/.test(lines[index].text)) {
      inCode = !inCode;
      index += 1;
      while (index < lines.length) {
        const isFence = /^\s*```/.test(lines[index].text);
        index += 1;
        if (isFence) break;
      }
      blocks.push(semanticBlockFromLineSpan(markdown, lines, startLine, index - 1, "code"));
      continue;
    }

    if (!inCode && /^#{1,6}\s+/.test(lines[index].text.trim())) {
      blocks.push(semanticBlockFromLineSpan(markdown, lines, index, index, "heading"));
      index += 1;
      continue;
    }

    if (!inCode && lines[index].text.trim().startsWith(">")) {
      while (index < lines.length && lines[index].text.trim().startsWith(">")) {
        index += 1;
      }
      blocks.push(classifyQuoteBlock(semanticBlockFromLineSpan(markdown, lines, startLine, index - 1, "other")));
      continue;
    }

    blocks.push(semanticBlockFromLineSpan(markdown, lines, startLine, startLine, "normal"));
    index += 1;
  }

  return blocks;
}

export function getSourceBlockBeforeOffset(markdown: string, offset: number): SourceBlockRange {
  return getPreviousNonEmptyBlockBeforeOffset(markdown, offset) ?? emptyRange(offset);
}

export function getPreviousNonEmptyBlockBeforeOffset(markdown: string, offset: number): SourceBlockRange | null {
  const lines = getMarkdownLines(markdown);
  let line = lines.length - 1;
  while (line >= 0 && lines[line].end >= offset) line -= 1;
  while (line >= 0 && isBlankLine(lines[line])) line -= 1;
  if (line < 0) return null;

  return rangeFromLineSpan(markdown, lines, blockStartLine(lines, line), line);
}

export function getNextNonEmptyBlockAfterOffset(markdown: string, offset: number): SourceBlockRange | null {
  const lines = getMarkdownLines(markdown);
  let line = 0;
  while (line < lines.length && lines[line].start < offset) line += 1;
  while (line < lines.length && isBlankLine(lines[line])) line += 1;
  if (line >= lines.length) return null;

  return rangeFromLineSpan(markdown, lines, line, blockEndLine(lines, line));
}

export function getPreviousNonEmptyLineBeforeOffset(markdown: string, offset: number): SourceBlockRange | null {
  const lines = getMarkdownLines(markdown);
  let line = lineIndexBeforeOffset(lines, offset);
  while (line >= 0 && isBlankLine(lines[line])) line -= 1;
  if (line < 0) return null;

  return rangeFromLineSpan(markdown, lines, line, line);
}

export function getNextNonEmptyLineAfterOffset(markdown: string, offset: number): SourceBlockRange | null {
  const lines = getMarkdownLines(markdown);
  let line = lineIndexAfterOffset(lines, offset);
  while (line < lines.length && isBlankLine(lines[line])) line += 1;
  if (line >= lines.length) return null;

  return rangeFromLineSpan(markdown, lines, line, line);
}

function getMarkdownLines(markdown: string): MarkdownLine[] {
  if (markdown.length === 0) {
    return [{ start: 0, end: 0, nextStart: 0, text: "" }];
  }

  const lines: MarkdownLine[] = [];
  let start = 0;
  while (start <= markdown.length) {
    const newline = markdown.indexOf("\n", start);
    const rawEnd = newline === -1 ? markdown.length : newline;
    const end = rawEnd > start && markdown[rawEnd - 1] === "\r" ? rawEnd - 1 : rawEnd;
    lines.push({
      start,
      end,
      nextStart: newline === -1 ? markdown.length : newline + 1,
      text: markdown.slice(start, end),
    });
    if (newline === -1) break;
    start = newline + 1;
  }

  return lines;
}

function findFirstNonBlankLineInRange(lines: MarkdownLine[], selectionStart: number, selectionEnd: number): number {
  const start = Math.max(0, selectionStart);
  const end = Math.max(start + 1, selectionEnd);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].nextStart <= start) continue;
    if (lines[index].start >= end) break;
    if (!isBlankLine(lines[index])) return index;
  }
  return -1;
}

function findLastNonBlankLineInRange(lines: MarkdownLine[], selectionStart: number, selectionEnd: number): number {
  const start = Math.max(0, selectionStart);
  const end = Math.max(start + 1, selectionEnd);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].start >= end) continue;
    if (lines[index].nextStart <= start) break;
    if (!isBlankLine(lines[index])) return index;
  }
  return -1;
}

function lineIndexBeforeOffset(lines: MarkdownLine[], offset: number): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].end <= offset && lines[index].start < offset) return index;
  }
  return -1;
}

function lineIndexAfterOffset(lines: MarkdownLine[], offset: number): number {
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].start >= offset) return index;
  }
  return lines.length;
}

function blockStartLine(lines: MarkdownLine[], line: number): number {
  let current = line;
  while (current > 0 && !isBlankLine(lines[current - 1])) current -= 1;
  return current;
}

function blockEndLine(lines: MarkdownLine[], line: number): number {
  let current = line;
  while (current < lines.length - 1 && !isBlankLine(lines[current + 1])) current += 1;
  return current;
}

function rangeFromLineSpan(markdown: string, lines: MarkdownLine[], startLine: number, endLine: number): SourceBlockRange {
  const start = lines[startLine].start;
  const end = lines[endLine].end;
  const text = markdown.slice(start, end).trim();
  return { start, end, text, hash: stableHash(text) };
}

function semanticBlockFromLineSpan(
  markdown: string,
  lines: MarkdownLine[],
  startLine: number,
  endLine: number,
  type: SemanticBlockType
): SemanticBlock {
  const range = rangeFromLineSpan(markdown, lines, startLine, endLine);
  return { ...range, type };
}

function classifyQuoteBlock(block: SemanticBlock): SemanticBlock {
  const clarificationId = /learnos-clarification-id:\s*([^>\s%]+)/.exec(block.text)?.[1];
  if (clarificationId) {
    return { ...block, type: "learning-os-clarification", clarificationId };
  }
  const generatedId = /learnos-generated-id:\s*([^>\s]+)/.exec(block.text)?.[1];
  if (generatedId) {
    return { ...block, type: "learning-os-generated", generatedId };
  }
  return block;
}

function resolveOriginalProseSourceBlock(
  params: {
    markdown: string;
    selectionStart?: number;
    selectionEnd?: number;
    selectedText?: string;
    sourceBlock?: string;
    sourceBlockHash?: string;
    sourceStartOffset?: number;
    sourceEndOffset?: number;
  },
  normalBlocks: SemanticBlock[]
): (SourceBlockRange & { method: OriginalProseContext["method"] }) | null {
  const selectedText = params.selectedText?.trim() ?? "";
  if (typeof params.selectionStart === "number" && typeof params.selectionEnd === "number") {
    const selectedBlock = findSemanticBlockAtSelection(params.markdown, params.selectionStart, params.selectionEnd);
    if (selectedBlock?.type === "normal") {
      const lineBlock = getLineBlockAtSelection(params.markdown, params.selectionStart, params.selectionEnd);
      if (!selectedText || lineBlock.text.includes(selectedText)) {
        return { ...lineBlock, method: "selection" };
      }
    }
  }

  if (
    typeof params.sourceStartOffset === "number" &&
    typeof params.sourceEndOffset === "number" &&
    params.sourceStartOffset >= 0 &&
    params.sourceEndOffset >= params.sourceStartOffset
  ) {
    const offsetBlock = normalBlocks.find(
      (block) =>
        block.start <= params.sourceStartOffset! &&
        params.sourceEndOffset! <= block.end &&
        (!params.sourceBlock || block.text.trim() === params.sourceBlock.trim()) &&
        (!selectedText || block.text.includes(selectedText) || !params.sourceBlock?.includes(selectedText))
    );
    if (offsetBlock) return { ...sourceRangeFromSemanticBlock(offsetBlock), method: "selection" };
  }

  const exactSource = params.sourceBlock?.trim();
  if (exactSource) {
    const exact = normalBlocks.find((block) => block.text.trim() === exactSource);
    if (exact) return { ...sourceRangeFromSemanticBlock(exact), method: "exact-source" };
  }

  if (params.sourceBlockHash) {
    const hash = normalBlocks.find((block) => block.hash === params.sourceBlockHash);
    if (hash) return { ...sourceRangeFromSemanticBlock(hash), method: "hash" };
  }

  if (selectedText) {
    const selected = normalBlocks.find((block) => block.text.includes(selectedText));
    if (selected) return { ...sourceRangeFromSemanticBlock(selected), method: "selected-text" };
  }

  return null;
}

function findSemanticSourceIndex(blocks: SemanticBlock[], source: SourceBlockRange): number {
  return blocks.findIndex(
    (block) =>
      block.type === "normal" &&
      block.start === source.start &&
      block.end === source.end &&
      block.text.trim() === source.text.trim()
  );
}

function previousNormalBlockText(blocks: SemanticBlock[], sourceIndex: number): string {
  const source = blocks[sourceIndex];
  for (let index = sourceIndex - 1; index >= 0; index -= 1) {
    if (blocks[index].type === "heading") break;
    if (blocks[index].type === "normal" && blocks[index].start !== source.start) return blocks[index].text;
  }
  return "";
}

function nextNormalBlockText(blocks: SemanticBlock[], sourceIndex: number): string {
  const source = blocks[sourceIndex];
  for (let index = sourceIndex + 1; index < blocks.length; index += 1) {
    if (blocks[index].type === "heading") break;
    if (blocks[index].type === "normal" && blocks[index].start !== source.start) return blocks[index].text;
  }
  return "";
}

function findSemanticBlockAtSelection(
  markdown: string,
  selectionStart: number,
  selectionEnd: number
): SemanticBlock | null {
  const start = Math.max(0, selectionStart);
  const end = Math.max(start + 1, selectionEnd);
  return parseSemanticBlocks(markdown).find((block) => block.start < end && block.end >= start) ?? null;
}

function sourceRangeFromSemanticBlock(block: SemanticBlock): SourceBlockRange {
  return {
    start: block.start,
    end: block.end,
    text: block.text,
    hash: block.hash,
  };
}

function blockIndexNearOffset(blocks: SemanticBlock[], offset: number): number {
  const containing = blocks.findIndex((block) => block.start <= offset && offset <= block.end);
  if (containing >= 0) return containing;
  const next = blocks.findIndex((block) => block.start >= offset);
  return next >= 0 ? next : blocks.length;
}

function isBlankLine(line: MarkdownLine): boolean {
  return line.text.trim().length === 0;
}

function emptyRange(offset: number): SourceBlockRange {
  return { start: offset, end: offset, text: "", hash: stableHash("") };
}
