import { stableHash } from "../utils/hash";

export interface SourceBlockRange {
  start: number;
  end: number;
  text: string;
  hash: string;
}

export function getSourceBlockAtSelection(
  markdown: string,
  selectionStart: number,
  selectionEnd: number
): SourceBlockRange {
  let start = selectionStart;
  while (start > 0 && markdown.slice(start - 2, start) !== "\n\n") {
    start -= 1;
  }

  let end = selectionEnd;
  while (end < markdown.length && markdown.slice(end, end + 2) !== "\n\n") {
    end += 1;
  }

  const text = markdown.slice(start, end).trim();
  return { start, end, text, hash: stableHash(text) };
}

export function getSourceBlockBeforeOffset(markdown: string, offset: number): SourceBlockRange {
  let end = offset;
  while (end > 0 && /\s/.test(markdown[end - 1])) {
    end -= 1;
  }

  let start = end;
  while (start > 0 && markdown.slice(start - 2, start) !== "\n\n") {
    start -= 1;
  }

  const text = markdown.slice(start, end).trim();
  return { start, end, text, hash: stableHash(text) };
}
