import {
  findAllClarificationAnnotations,
  findClarificationForSourceBlock,
  liveItemsToClarificationItems,
  parseLiveClarificationItemsFromBlock,
} from "../ask/ClarificationBlock";
import { stableHash } from "../utils/hash";
import type { App, TFile } from "obsidian";
import type { AskJob, ClarificationItem, ClarificationRecord, LearningOsSettings } from "../types";
import type { LiveClarificationItem } from "../ask/ClarificationBlock";

export type LiveClarificationState =
  | {
      kind: "block-live";
      notePath: string;
      clarificationId: string;
      liveBlockMarkdown: string;
      liveItems: LiveClarificationItem[];
      liveBlockHash: string;
    }
  | {
      kind: "block-deleted";
      notePath: string;
      oldClarificationId?: string;
      reason: "clarification-marker-missing";
      sourceBlockStillExists: boolean;
    }
  | {
      kind: "item-deleted";
      notePath: string;
      clarificationId: string;
      liveBlockMarkdown: string;
      deletedItemId: string;
      liveItems: LiveClarificationItem[];
      liveBlockHash: string;
    }
  | {
      kind: "no-prior-block";
      notePath: string;
      sourceBlockStillExists: boolean;
    };

export async function resolveLiveClarificationState(params: {
  app: App;
  job: AskJob;
  fallbackItems?: ClarificationItem[];
}): Promise<LiveClarificationState> {
  const sourceFile = params.app.vault.getAbstractFileByPath(params.job.notePath);
  if (!sourceFile || !("extension" in sourceFile)) {
    return {
      kind: explicitClarificationId(params.job) ? "block-deleted" : "no-prior-block",
      notePath: params.job.notePath,
      oldClarificationId: explicitClarificationId(params.job) ?? undefined,
      reason: "clarification-marker-missing",
      sourceBlockStillExists: false,
    } as LiveClarificationState;
  }
  const markdown = await params.app.vault.read(sourceFile as TFile);
  return resolveLiveClarificationStateFromMarkdown(markdown, params.job, params.fallbackItems ?? []);
}

export function resolveLiveClarificationStateFromMarkdown(
  markdown: string,
  job: AskJob,
  fallbackItems: ClarificationItem[] = []
): LiveClarificationState {
  const matches = findAllClarificationAnnotations(markdown);
  const explicitId = explicitClarificationId(job);
  const explicitMatch = explicitId ? matches.find((match) => match.clarificationId === explicitId) : null;
  const sourceRange = resolveSourceBlockInLiveNote(markdown, job);
  const adjacentMatch = findClarificationForSourceBlock(markdown, sourceRange.start, sourceRange.end);
  const liveMatch =
    explicitMatch && (!sourceRange.exists || adjacentMatch?.clarificationId === explicitMatch.clarificationId)
      ? explicitMatch
      : adjacentMatch;

  if (!liveMatch) {
    if (explicitId) {
      return {
        kind: "block-deleted",
        notePath: job.notePath,
        oldClarificationId: explicitId,
        reason: "clarification-marker-missing",
        sourceBlockStillExists: sourceRange.exists,
      };
    }
    return {
      kind: "no-prior-block",
      notePath: job.notePath,
      sourceBlockStillExists: sourceRange.exists,
    };
  }

  const liveBlockMarkdown = markdown.slice(liveMatch.blockStart, liveMatch.blockEnd);
  const liveItems = parseLiveClarificationItemsFromBlock(liveBlockMarkdown, fallbackItems);
  const targetItemId = job.targetItemId;
  if (targetItemId && !liveItems.some((item) => item.item.id === targetItemId)) {
    return {
      kind: "item-deleted",
      notePath: job.notePath,
      clarificationId: liveMatch.clarificationId,
      liveBlockMarkdown,
      deletedItemId: targetItemId,
      liveItems,
      liveBlockHash: stableHash(liveBlockMarkdown),
    };
  }

  return {
    kind: "block-live",
    notePath: job.notePath,
    clarificationId: liveMatch.clarificationId,
    liveBlockMarkdown,
    liveItems,
    liveBlockHash: stableHash(liveBlockMarkdown),
  };
}

export function recordFromLiveClarificationState(params: {
  state: LiveClarificationState;
  job: AskJob;
  backendRecord: ClarificationRecord | null;
  settings: Pick<LearningOsSettings, "uiLanguage" | "answerLanguage">;
}): ClarificationRecord | null {
  if (params.state.kind !== "block-live" && params.state.kind !== "item-deleted") return null;
  const now = new Date().toISOString();
  const items = liveItemsToClarificationItems(params.state.liveItems);
  return {
    schemaVersion: 1,
    id: params.state.clarificationId,
    notePath: params.backendRecord?.notePath ?? params.job.notePath,
    sourceBlock: params.backendRecord?.sourceBlock ?? params.job.sourceBlock,
    sourceBlockHash: params.backendRecord?.sourceBlockHash ?? params.job.sourceBlockHash,
    sourceStartOffset: params.backendRecord?.sourceStartOffset ?? params.job.sourceStartOffset,
    sourceEndOffset: params.backendRecord?.sourceEndOffset ?? params.job.sourceEndOffset,
    headingPath: params.backendRecord?.headingPath ?? params.job.headingPath,
    detectedConcept: params.backendRecord?.detectedConcept ?? params.job.detectedConcept,
    language: params.backendRecord?.language ?? params.settings.answerLanguage,
    uiLanguage: params.backendRecord?.uiLanguage ?? params.settings.uiLanguage,
    created: params.backendRecord?.created ?? params.job.created,
    updated: params.backendRecord?.updated ?? now,
    interactions: params.backendRecord?.interactions ?? [],
    items,
    contentHash: params.state.liveBlockHash,
  };
}

export function liveStateWarning(state: LiveClarificationState, uiLanguage: LearningOsSettings["uiLanguage"]): string | null {
  if (state.kind === "block-deleted") {
    return uiLanguage === "en"
      ? "The original clarification block is no longer in the current note. This proposal will create fresh content from this AI answer only and will not restore the old block."
      : "原“我的理解”块已从当前笔记中删除。此建议将只根据这次 AI 回答创建新内容，不会恢复旧块。";
  }
  if (state.kind === "item-deleted") {
    return uiLanguage === "en"
      ? "The original target item is no longer in the current note. This proposal will not restore that deleted item."
      : "原目标理解项已从当前笔记中删除。此建议不会恢复这个已删除的 item。";
  }
  return null;
}

function explicitClarificationId(job: AskJob): string | null {
  return job.existingClarificationId ?? job.targetClarificationId ?? job.appliedClarificationId ?? null;
}

export interface ResolvedSourceBlock {
  start: number;
  end: number;
  exists: boolean;
  inconsistent: boolean;
  method: "offset" | "hash" | "exact-source" | "selected-text" | "missing";
}

export function resolveSourceBlockInLiveNote(markdown: string, job: AskJob): ResolvedSourceBlock {
  const ignoredRanges = findAllClarificationAnnotations(markdown).map((match) => ({
    start: match.blockStart,
    end: match.blockEnd,
  })).concat(findAllGeneratedRanges(markdown));
  const inconsistent = hasSelectedSourceMismatch(job);

  const inlineGeneratedAnchor = resolveInlineDraftGeneratedSourceAnchor(markdown, job);
  if (inlineGeneratedAnchor) return inlineGeneratedAnchor;

  if (
    !inconsistent &&
    typeof job.sourceStartOffset === "number" &&
    typeof job.sourceEndOffset === "number" &&
    !rangesOverlapAny(job.sourceStartOffset, job.sourceEndOffset, ignoredRanges) &&
    markdown.slice(job.sourceStartOffset, job.sourceEndOffset).trim() === job.sourceBlock.trim()
  ) {
    return { start: job.sourceStartOffset, end: job.sourceEndOffset, exists: true, inconsistent, method: "offset" };
  }

  if (!inconsistent) {
    const hashMatch = findCandidateBlock(markdown, ignoredRanges, (text) => stableHash(text) === job.sourceBlockHash);
    if (hashMatch) return { ...hashMatch, exists: true, inconsistent, method: "hash" };

    const exactMatch = findCandidateBlock(markdown, ignoredRanges, (text) => text.trim() === job.sourceBlock.trim());
    if (exactMatch) return { ...exactMatch, exists: true, inconsistent, method: "exact-source" };
  }

  const selectedMatch = findSelectedTextBlock(markdown, ignoredRanges, job.selectedText);
  if (selectedMatch) {
    return { ...selectedMatch, exists: true, inconsistent, method: "selected-text" };
  }

  return { start: markdown.length, end: markdown.length, exists: false, inconsistent, method: "missing" };
}

function resolveInlineDraftGeneratedSourceAnchor(markdown: string, job: AskJob): ResolvedSourceBlock | null {
  if (!job.inlineDraft || job.askSourceMode !== "generated-content-item") return null;
  const source = job.sourceBlock.trim();
  if (!source || !source.includes("learnos-generated-id")) return null;
  const sourceStartOffset = job.sourceStartOffset;
  const sourceEndOffset = job.sourceEndOffset;
  const offsetMatch =
    typeof sourceStartOffset === "number" &&
    typeof sourceEndOffset === "number" &&
    sourceStartOffset >= 0 &&
    sourceEndOffset <= markdown.length &&
    markdown.slice(sourceStartOffset, sourceEndOffset).trim() === source;
  if (offsetMatch) {
    return {
      start: sourceStartOffset,
      end: sourceEndOffset,
      exists: true,
      inconsistent: false,
      method: "offset",
    };
  }
  const index = markdown.indexOf(source);
  if (index >= 0) {
    return {
      start: index,
      end: index + source.length,
      exists: true,
      inconsistent: false,
      method: "exact-source",
    };
  }
  return null;
}

function findAllGeneratedRanges(markdown: string): Array<{ start: number; end: number }> {
  const pattern = /<!--\s*learnos-generated-id:\s*gen-[^>\s]+\s*-->/g;
  const ranges: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    ranges.push({
      start: findCalloutBlockStart(markdown, match.index),
      end: findCalloutBlockEnd(markdown, match.index + match[0].length),
    });
  }
  return ranges;
}

function hasSelectedSourceMismatch(job: AskJob): boolean {
  const selected = normalizeForMatch(job.selectedText);
  const source = normalizeForMatch(job.sourceBlock);
  return selected.length > 0 && source.length > 0 && !source.includes(selected);
}

function normalizeForMatch(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function findCandidateBlock(
  markdown: string,
  ignoredRanges: Array<{ start: number; end: number }>,
  predicate: (text: string) => boolean
): { start: number; end: number } | null {
  for (const candidate of candidateSourceBlocks(markdown, ignoredRanges)) {
    if (predicate(candidate.text.trim())) return { start: candidate.start, end: candidate.end };
  }
  return null;
}

function findSelectedTextBlock(
  markdown: string,
  ignoredRanges: Array<{ start: number; end: number }>,
  selectedText: string
): { start: number; end: number } | null {
  const selected = selectedText.trim();
  if (!selected) return null;
  for (const candidate of candidateSourceBlocks(markdown, ignoredRanges)) {
    const offset = candidate.text.indexOf(selected);
    if (offset >= 0) return { start: candidate.start, end: candidate.end };
  }
  return null;
}

function candidateSourceBlocks(
  markdown: string,
  ignoredRanges: Array<{ start: number; end: number }>
): Array<{ start: number; end: number; text: string }> {
  const candidates: Array<{ start: number; end: number; text: string }> = [];
  for (const range of nonIgnoredRanges(markdown, ignoredRanges)) {
    const text = markdown.slice(range.start, range.end);
    candidates.push(...lineCandidates(text, range.start));
    candidates.push(...paragraphCandidates(text, range.start));
  }
  return dedupeCandidates(candidates).filter((candidate) => candidate.text.trim().length > 0);
}

function nonIgnoredRanges(
  markdown: string,
  ignoredRanges: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  const sorted = [...ignoredRanges].sort((a, b) => a.start - b.start);
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const ignored of sorted) {
    if (cursor < ignored.start) ranges.push({ start: cursor, end: ignored.start });
    cursor = Math.max(cursor, ignored.end);
  }
  if (cursor < markdown.length) ranges.push({ start: cursor, end: markdown.length });
  return ranges;
}

function lineCandidates(text: string, baseOffset: number): Array<{ start: number; end: number; text: string }> {
  const candidates: Array<{ start: number; end: number; text: string }> = [];
  let cursor = 0;
  for (const line of text.split("\n")) {
    const start = baseOffset + cursor;
    const end = start + line.length;
    if (line.trim()) candidates.push({ start, end, text: line });
    cursor += line.length + 1;
  }
  return candidates;
}

function paragraphCandidates(text: string, baseOffset: number): Array<{ start: number; end: number; text: string }> {
  const candidates: Array<{ start: number; end: number; text: string }> = [];
  const pattern = /\S[\s\S]*?(?=\n\s*\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0];
    const leadingWhitespace = raw.length - raw.trimStart().length;
    const trailingWhitespace = raw.length - raw.trimEnd().length;
    const start = baseOffset + match.index + leadingWhitespace;
    const end = baseOffset + match.index + raw.length - trailingWhitespace;
    const candidate = text.slice(start - baseOffset, end - baseOffset);
    if (candidate.trim()) candidates.push({ start, end, text: candidate });
  }
  return candidates;
}

function dedupeCandidates(
  candidates: Array<{ start: number; end: number; text: string }>
): Array<{ start: number; end: number; text: string }> {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.start}:${candidate.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rangesOverlapAny(
  start: number,
  end: number,
  ranges: Array<{ start: number; end: number }>
): boolean {
  return ranges.some((range) => start < range.end && range.start < end);
}

function findCalloutBlockStart(markdown: string, markerStart: number): number {
  const lineStart = markdown.lastIndexOf("\n", markerStart) + 1;
  let start = lineStart;
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

function findCalloutBlockEnd(markdown: string, markerEnd: number): number {
  let cursor = markerEnd;
  let previousWasQuoted = true;
  let afterBlank = false;
  while (cursor < markdown.length) {
    const nextBreak = markdown.indexOf("\n", cursor);
    if (nextBreak === -1) return markdown.length;
    const nextLineStart = nextBreak + 1;
    const nextLineEnd = markdown.indexOf("\n", nextLineStart);
    const line = markdown.slice(nextLineStart, nextLineEnd === -1 ? markdown.length : nextLineEnd);
    const trimmed = line.trim();
    if (!trimmed.startsWith(">") && trimmed !== "" && (!previousWasQuoted || afterBlank)) return nextBreak + 1;
    if (isTopLevelCalloutHeader(line)) return nextBreak + 1;
    if (trimmed === "") {
      afterBlank = true;
    } else {
      previousWasQuoted = trimmed.startsWith(">");
      afterBlank = false;
    }
    cursor = nextLineEnd === -1 ? markdown.length : nextLineEnd;
  }
  return markdown.length;
}

function isTopLevelCalloutHeader(line: string): boolean {
  return /^>\s*\[![^\]]+\]/.test(line.trim());
}
