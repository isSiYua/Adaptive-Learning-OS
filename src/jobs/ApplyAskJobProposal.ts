import {
  buildClarificationBlock,
  findAllClarificationAnnotations,
  findClarificationForSourceBlock,
  liveItemsToClarificationItems,
  normalizeClarificationItemExplanation,
  normalizeClarificationItemTitle,
  parseLiveClarificationItemsFromBlock,
  replaceClarificationBlock,
} from "../ask/ClarificationBlock";
import {
  itemsFromVisibleMarkdown,
  proposalFromEditedMarkdown,
  recordFromMergeProposal,
} from "../ask/ClarificationMergeProposal";
import { stableHash } from "../utils/hash";
import type { App, TFile } from "obsidian";
import type { ClarificationStore } from "../storage/ClarificationStore";
import type { AskJobStore } from "../storage/AskJobStore";
import type {
  AskJob,
  ClarificationItem,
  ClarificationMergeOperation,
  ClarificationMergeProposal,
  ClarificationRecord,
  LearningOsSettings,
} from "../types";

export interface ApplyAskJobProposalResult {
  record: ClarificationRecord;
  markdown: string;
  appliedAs: "created" | "updated";
  staleDetected: boolean;
  safeMerged: boolean;
}

export class StaleProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleProposalError";
  }
}

export async function applyAskJobProposal(params: {
  app: App;
  jobStore: AskJobStore;
  clarificationStore: ClarificationStore;
  settings: LearningOsSettings;
  job: AskJob;
  editedVisibleMarkdown?: string;
}): Promise<ApplyAskJobProposalResult> {
  if (!params.job.mergeProposal) {
    throw new Error("This job does not have a merge proposal yet.");
  }

  const sourceFile = params.app.vault.getAbstractFileByPath(params.job.notePath);
  if (!sourceFile || !("extension" in sourceFile)) {
    throw new Error(`Source note not found: ${params.job.notePath}`);
  }

  const original = await params.app.vault.read(sourceFile as TFile);
  const liveMatch = findLiveClarificationMatch(original, params.job);
  const currentVisibleMarkdown = liveMatch ? original.slice(liveMatch.blockStart, liveMatch.blockEnd) : "";
  const existingRecord = await existingRecordForJob(params.job, params.clarificationStore);
  const latestRecord =
    existingRecord ??
    (liveMatch ? await params.clarificationStore.readRecord(liveMatch.clarificationId) : null);
  const proposal = params.editedVisibleMarkdown
    ? proposalFromEditedMarkdown({
        proposal: params.job.mergeProposal,
        editedMarkdown: params.editedVisibleMarkdown,
      })
    : params.job.mergeProposal;
  const stale = detectStaleProposal({
    job: params.job,
    latestRecord,
    currentVisibleMarkdown,
    proposalVisibleMarkdown: params.editedVisibleMarkdown ?? params.job.mergeProposal.proposedVisibleMarkdown,
  });

  const mergeBaseRecord = currentVisibleMarkdown
    ? recordWithLiveVisibleItems(latestRecord, currentVisibleMarkdown, params.job, params.settings, liveMatch?.clarificationId)
    : latestRecord;
  const operationResult = recordFromLiveOperations({
    job: params.job,
    proposal,
    existingRecord: mergeBaseRecord,
    settings: params.settings,
  });
  const record = operationResult.record;
  const visible = buildClarificationBlock(record, params.settings);
  const next = applyClarificationMarkdown(original, params.job, record, visible);

  await params.app.vault.modify(sourceFile as TFile, next.markdown);
  await params.clarificationStore.saveRecord(record, next.appliedAs);
  await params.jobStore.updateStatus(
    {
      ...params.job,
      appliedClarificationId: record.id,
      appliedItemIds: operationResult.changedItemIds,
      relatedItemIds: Array.from(new Set([...(params.job.relatedItemIds ?? []), ...operationResult.changedItemIds])),
      targetClarificationId: record.id,
    },
    "applied",
    record.updated,
    "applied"
  );

  return {
    record,
    markdown: next.markdown,
    appliedAs: next.appliedAs,
    staleDetected: stale.stale,
    safeMerged: stale.stale,
  };
}

export function applyClarificationMarkdown(
  markdown: string,
  job: AskJob,
  record: ClarificationRecord,
  visible: string
): { markdown: string; appliedAs: "created" | "updated" } {
  const existingMatch = findAllClarificationAnnotations(markdown).find(
    (match) => match.clarificationId === record.id || match.clarificationId === job.existingClarificationId
  );
  if (existingMatch) {
    return {
      markdown: replaceClarificationBlock(markdown, existingMatch, visible),
      appliedAs: "updated",
    };
  }

  const sourceMatch = findSourceBlockRange(markdown, job);
  const adjacent = findClarificationForSourceBlock(markdown, sourceMatch.start, sourceMatch.end);
  if (adjacent) {
    return {
      markdown: replaceClarificationBlock(markdown, adjacent, visible),
      appliedAs: "updated",
    };
  }

  return {
    markdown: `${markdown.slice(0, sourceMatch.end).replace(/\s*$/, "")}\n\n${visible}${markdown
      .slice(sourceMatch.end)
      .replace(/^\n+/, "")}`,
    appliedAs: "created",
  };
}

export interface StaleProposalCheck {
  stale: boolean;
  liveBlockHasManualEdits: boolean;
  reasons: string[];
}

export function detectStaleProposal(params: {
  job: AskJob;
  latestRecord: ClarificationRecord | null;
  currentVisibleMarkdown: string;
  proposalVisibleMarkdown: string;
}): StaleProposalCheck {
  const reasons: string[] = [];
  const latest = params.latestRecord;

  if (
    latest &&
    typeof params.job.baseClarificationRevision === "number" &&
    latest.revision !== params.job.baseClarificationRevision
  ) {
    reasons.push("backend-revision-changed");
  }

  if (
    latest &&
    params.job.baseClarificationContentHash &&
    latest.contentHash !== params.job.baseClarificationContentHash
  ) {
    reasons.push("backend-content-hash-changed");
  }

  if (
    params.currentVisibleMarkdown &&
    params.job.baseVisibleBlockHash &&
    stableHash(params.currentVisibleMarkdown) !== params.job.baseVisibleBlockHash
  ) {
    reasons.push("live-visible-block-changed");
  }

  if (latest && latest.items.some((item) => !proposalContainsItem(params.proposalVisibleMarkdown, item))) {
    reasons.push("latest-items-not-in-proposal");
  }

  const renderedLatest = latest ? buildClarificationBlock(latest, { uiLanguage: latest.uiLanguage }) : "";
  const proposalText = params.proposalVisibleMarkdown.trim();
  const liveBlockHasManualEdits =
    Boolean(params.currentVisibleMarkdown && latest) &&
    stableHash(params.currentVisibleMarkdown) !== stableHash(renderedLatest) &&
    !(proposalText.length > 0 && params.currentVisibleMarkdown.includes(proposalText));

  return {
    stale: reasons.length > 0 || liveBlockHasManualEdits,
    liveBlockHasManualEdits,
    reasons,
  };
}

async function existingRecordForJob(
  job: AskJob,
  clarificationStore: ClarificationStore
): Promise<ClarificationRecord | null> {
  const explicitId = job.existingClarificationId ?? job.targetClarificationId ?? job.appliedClarificationId;
  if (explicitId) {
    return clarificationStore.readRecord(explicitId);
  }
  return clarificationStore.findByNotePathAndSourceHash(job.notePath, job.sourceBlockHash);
}

export function findLiveClarificationMatch(markdown: string, job: AskJob) {
  const matches = findAllClarificationAnnotations(markdown);
  const explicitId = job.existingClarificationId ?? job.targetClarificationId ?? job.appliedClarificationId;
  if (explicitId) {
    const byId = matches.find((match) => match.clarificationId === explicitId);
    if (byId) return byId;
  }

  const sourceMatch = findSourceBlockRange(markdown, job);
  return findClarificationForSourceBlock(markdown, sourceMatch.start, sourceMatch.end);
}

function findSourceBlockRange(markdown: string, job: AskJob): { start: number; end: number } {
  if (
    typeof job.sourceStartOffset === "number" &&
    typeof job.sourceEndOffset === "number" &&
    markdown.slice(job.sourceStartOffset, job.sourceEndOffset).trim() === job.sourceBlock.trim()
  ) {
    return { start: job.sourceStartOffset, end: job.sourceEndOffset };
  }

  const index = markdown.indexOf(job.sourceBlock);
  if (index >= 0) {
    return { start: index, end: index + job.sourceBlock.length };
  }

  const selectedIndex = markdown.indexOf(job.selectedText);
  if (selectedIndex >= 0) {
    let start = selectedIndex;
    while (start > 0 && markdown.slice(start - 2, start) !== "\n\n") start -= 1;
    let end = selectedIndex + job.selectedText.length;
    while (end < markdown.length && markdown.slice(end, end + 2) !== "\n\n") end += 1;
    return { start, end };
  }

  return { start: markdown.length, end: markdown.length };
}

function proposalContainsItem(
  proposalVisibleMarkdown: string,
  item: { itemTitle: string; explanation: string }
): boolean {
  const proposal = proposalVisibleMarkdown.toLowerCase();
  return (
    proposal.includes(item.itemTitle.toLowerCase()) ||
    (item.explanation.length > 24 && proposal.includes(item.explanation.slice(0, 24).toLowerCase()))
  );
}

function recordWithLiveVisibleItems(
  latestRecord: ClarificationRecord | null,
  currentVisibleMarkdown: string,
  job: AskJob,
  settings: Pick<LearningOsSettings, "uiLanguage" | "answerLanguage">,
  liveClarificationId?: string
): ClarificationRecord {
  const liveItems = parseLiveClarificationItemsFromBlock(currentVisibleMarkdown, latestRecord?.items ?? []);
  const items = liveItemsToClarificationItems(liveItems);
  if (items.length === 0 && latestRecord) return latestRecord;
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: latestRecord?.id ?? liveClarificationId ?? job.existingClarificationId ?? job.targetClarificationId ?? job.mergeProposal?.clarificationId ?? "",
    notePath: latestRecord?.notePath ?? job.notePath,
    sourceBlock: latestRecord?.sourceBlock ?? job.sourceBlock,
    sourceBlockHash: latestRecord?.sourceBlockHash ?? job.sourceBlockHash,
    sourceStartOffset: latestRecord?.sourceStartOffset ?? job.sourceStartOffset,
    sourceEndOffset: latestRecord?.sourceEndOffset ?? job.sourceEndOffset,
    headingPath: latestRecord?.headingPath ?? job.headingPath,
    detectedConcept: latestRecord?.detectedConcept ?? job.detectedConcept,
    language: latestRecord?.language ?? settings.answerLanguage,
    uiLanguage: latestRecord?.uiLanguage ?? settings.uiLanguage,
    created: latestRecord?.created ?? job.created,
    updated: latestRecord?.updated ?? now,
    interactions: latestRecord?.interactions ?? [],
    items,
    contentHash: stableHash(currentVisibleMarkdown),
  };
}

function recordFromLiveOperations(params: {
  job: AskJob;
  proposal: ClarificationMergeProposal;
  existingRecord: ClarificationRecord | null;
  settings: Pick<LearningOsSettings, "uiLanguage" | "answerLanguage">;
}): { record: ClarificationRecord; changedItemIds: string[] } {
  const operations = operationsForProposal(params.proposal, params.existingRecord?.items ?? [], params.job);
  if (!params.existingRecord || operations.length === 0) {
    const record = recordFromMergeProposal(params);
    return { record, changedItemIds: record.items.map((item) => item.id) };
  }

  const shellProposal: ClarificationMergeProposal = {
    ...params.proposal,
    action: operations[0]?.op === "update-item" ? "update-item" : "add-item",
    targetItemId: operations[0]?.op === "update-item" ? operations[0].itemId : null,
    proposedItems: operations.map((operation) => operationToItem(operation, params.existingRecord?.items ?? [])),
  };
  const shell = recordFromMergeProposal({
    ...params,
    proposal: shellProposal,
  });
  const interactionId = shell.interactions[shell.interactions.length - 1]?.id;
  const items = applyOperationsToItems(params.existingRecord.items, operations, interactionId, shell.updated);
  return {
    record: {
      ...shell,
      items,
    },
    changedItemIds: operations.map((operation) => operation.itemId),
  };
}

function operationsForProposal(
  proposal: ClarificationMergeProposal,
  liveItems: ClarificationItem[],
  job: AskJob
): ClarificationMergeOperation[] {
  if (proposal.operations && proposal.operations.length > 0) return proposal.operations;
  const liveIds = new Set(liveItems.map((item) => item.id));
  const liveTitles = new Set(liveItems.map((item) => item.itemTitle.trim().toLowerCase()));
  const targetItemId = proposal.targetItemId ?? job.targetItemId;
  if (targetItemId && proposal.proposedItems[0]) {
    return [itemToOperation("update-item", targetItemId, proposal.proposedItems[0])];
  }
  const newItems = proposal.proposedItems.filter(
    (item) => !liveIds.has(item.id) && !liveTitles.has(item.itemTitle.trim().toLowerCase())
  );
  const candidates = newItems.length > 0 ? newItems : proposal.proposedItems.slice(-1);
  return candidates.map((item) => itemToOperation("add-item", job.proposedItemId ?? item.id, item, job.proposedItemId));
}

function itemToOperation(
  op: ClarificationMergeOperation["op"],
  itemId: string,
  item: ClarificationItem,
  fallbackItemId?: string
): ClarificationMergeOperation {
  const itemTitle = normalizeClarificationItemTitle(item.itemTitle || item.targetText);
  return {
    op,
    itemId: itemId || fallbackItemId || item.id,
    targetText: item.targetText,
    itemTitle,
    explanation: normalizeClarificationItemExplanation(item.explanation, itemTitle),
  };
}

function operationToItem(operation: ClarificationMergeOperation, existingItems: ClarificationItem[]): ClarificationItem {
  const existing = existingItems.find((item) => item.id === operation.itemId);
  const now = new Date().toISOString();
  const itemTitle = normalizeClarificationItemTitle(operation.itemTitle || existing?.itemTitle || operation.targetText);
  return {
    id: operation.itemId,
    targetText: operation.targetText || existing?.targetText || operation.itemTitle,
    itemTitle,
    question: existing?.question ?? "",
    explanation: normalizeClarificationItemExplanation(operation.explanation, itemTitle),
    created: existing?.created ?? now,
    updated: now,
    relatedInteractionIds: existing?.relatedInteractionIds ?? [],
  };
}

function applyOperationsToItems(
  liveItems: ClarificationItem[],
  operations: ClarificationMergeOperation[],
  interactionId: string | undefined,
  updated: string
): ClarificationItem[] {
  const next = liveItems.map((item) => ({ ...item }));
  for (const operation of operations) {
    const existingIndex = next.findIndex((item) => item.id === operation.itemId);
    if (operation.op === "update-item" && existingIndex >= 0) {
      const current = next[existingIndex];
      const itemTitle = normalizeClarificationItemTitle(operation.itemTitle || current.itemTitle);
      next[existingIndex] = {
        ...current,
        targetText: operation.targetText || current.targetText,
        itemTitle,
        explanation: operation.explanation
          ? normalizeClarificationItemExplanation(operation.explanation, itemTitle)
          : current.explanation,
        updated,
        relatedInteractionIds: interactionId
          ? Array.from(new Set([...current.relatedInteractionIds, interactionId]))
          : current.relatedInteractionIds,
      };
      continue;
    }
    if (!next.some((item) => item.id === operation.itemId)) {
      const item = operationToItem(operation, []);
      next.push({
        ...item,
        updated,
        relatedInteractionIds: interactionId ? [interactionId] : item.relatedInteractionIds,
      });
    }
  }
  return next;
}
