import { stableHash } from "../utils/hash";

export type InlineDraftKind = "clarification" | "generated-content" | "unknown";

export interface InlineDraftItem {
  draftItemId: string;
  title: string;
  content: string;
  rawMarkdown: string;
}

export interface InlineDraftBlock {
  draftId: string;
  jobId?: string;
  kind: InlineDraftKind;
  targetContainerId?: string;
  createdAt?: string;
  draftContentHash: string;
  blockStart: number;
  blockEnd: number;
  rawMarkdown: string;
  items: InlineDraftItem[];
}

export function hasInlineDraftMarkers(markdown: string): boolean {
  return /<!--\s*learnos-draft-id:\s*[^>]+-->/i.test(markdown);
}

export function findAllInlineDraftBlocks(markdown: string): InlineDraftBlock[] {
  const blocks: InlineDraftBlock[] = [];
  const pattern = /<!--\s*learnos-draft-id:\s*([^>\s]+)\s*-->/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const blockStart = findLearningOsCalloutStart(markdown, match.index);
    const blockEnd = findLearningOsCalloutEnd(markdown, match.index + match[0].length);
    const rawMarkdown = markdown.slice(blockStart, blockEnd);
    blocks.push({
      draftId: match[1],
      jobId: readDraftField(rawMarkdown, "job-id"),
      kind: draftKind(readDraftField(rawMarkdown, "kind")),
      targetContainerId: readDraftField(rawMarkdown, "target-container-id"),
      createdAt: readDraftField(rawMarkdown, "created-at"),
      draftContentHash: stableHash(rawMarkdown),
      blockStart,
      blockEnd,
      rawMarkdown,
      items: parseInlineDraftItems(rawMarkdown),
    });
  }
  return dedupeDrafts(blocks);
}

export function parseInlineDraftItems(blockMarkdown: string): InlineDraftItem[] {
  const matches = Array.from(blockMarkdown.matchAll(/<!--\s*learnos-draft-item-id:\s*([^>\s]+)\s*-->/g));
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? blockMarkdown.length : blockMarkdown.length;
    const rawMarkdown = blockMarkdown.slice(start, end).trim();
    const plain = stripQuotePrefixes(rawMarkdown)
      .replace(/<!--\s*learnos-draft-item-id:\s*[^>]+\s*-->/, "")
      .trim();
    const titleMatch = plain.match(/^\*\*([^*]+)\*\*\s*(.*)$/s);
    return {
      draftItemId: match[1],
      title: titleMatch?.[1]?.trim() || "Untitled draft item",
      content: (titleMatch?.[2] ?? plain).trim(),
      rawMarkdown,
    };
  });
}

function readDraftField(markdown: string, field: string): string | undefined {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`<!--\\s*learnos-draft-${escaped}:\\s*([^>]+?)\\s*-->`, "i"));
  return match?.[1]?.trim();
}

function draftKind(value: string | undefined): InlineDraftKind {
  if (value === "clarification" || value === "generated-content") return value;
  return "unknown";
}

function stripQuotePrefixes(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => line.replace(/^\s*>\s?/, ""))
    .join("\n")
    .trim();
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

function dedupeDrafts(blocks: InlineDraftBlock[]): InlineDraftBlock[] {
  const seen = new Set<string>();
  return blocks.filter((block) => {
    if (seen.has(block.draftId)) return false;
    seen.add(block.draftId);
    return true;
  });
}
