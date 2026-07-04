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
  buildGeneratedContentBlock,
  itemsFromVisibleMarkdown,
  proposalFromEditedMarkdown,
  recordFromMergeProposal,
} from "../ask/ClarificationMergeProposal";
import { resolveSourceBlockInLiveNote } from "./LiveClarificationState";
import { stableHash } from "../utils/hash";
import { createGeneratedContentId } from "../utils/ids";
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
  verification: ApplyMarkerVerification;
}

export class StaleProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleProposalError";
  }
}

export class ApplyVerificationError extends Error {
  verification: ApplyMarkerVerification;

  constructor(verification: ApplyMarkerVerification) {
    super(applyVerificationMessage(verification));
    this.name = "ApplyVerificationError";
    this.verification = verification;
  }
}

export interface ApplyMarkerVerification {
  ok: boolean;
  appliedClarificationId?: string;
  appliedGeneratedId?: string;
  appliedItemIds: string[];
  missingClarificationId?: string;
  missingGeneratedId?: string;
  missingItemIds: string[];
}

export interface LearningOsMarkers {
  clarificationIds: string[];
  itemIds: string[];
  generatedIds: string[];
}

export interface MarkerPreservationVerification {
  ok: boolean;
  missingClarificationIds: string[];
  missingItemIds: string[];
  missingGeneratedIds: string[];
}

const noteApplyLocks = new Map<string, Promise<void>>();

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
  return withNoteApplyLock(params.job.notePath, () => applyAskJobProposalUnlocked(params));
}

async function applyAskJobProposalUnlocked(params: {
  app: App;
  jobStore: AskJobStore;
  clarificationStore: ClarificationStore;
  settings: LearningOsSettings;
  job: AskJob;
  editedVisibleMarkdown?: string;
}): Promise<ApplyAskJobProposalResult> {
  const mergeProposal = params.job.mergeProposal;
  if (!mergeProposal) {
    throw new Error("This job does not have a merge proposal yet.");
  }
  const sourceFile = params.app.vault.getAbstractFileByPath(params.job.notePath);
  if (!sourceFile || !("extension" in sourceFile)) {
    throw new Error(`Source note not found: ${params.job.notePath}`);
  }

  const original = await params.app.vault.read(sourceFile as TFile);
  const preExistingMarkers = collectLearningOsMarkers(original);
  const liveMatch = findLiveClarificationMatch(original, params.job);
  const currentVisibleMarkdown = liveMatch ? original.slice(liveMatch.blockStart, liveMatch.blockEnd) : "";
  const existingRecord = await existingRecordForJob(params.job, params.clarificationStore);
  const liveRecordFromMarker =
    liveMatch && (!existingRecord || existingRecord.id !== liveMatch.clarificationId)
      ? await params.clarificationStore.readRecord(liveMatch.clarificationId)
      : null;
  const latestRecord = liveMatch ? liveRecordFromMarker ?? existingRecord : null;
  const proposal = params.editedVisibleMarkdown
    ? proposalFromEditedMarkdown({
        proposal: mergeProposal,
        editedMarkdown: params.editedVisibleMarkdown,
      })
    : mergeProposal;
  if (proposal.action === "generated-content") {
    return applyGeneratedContentProposal({
      ...params,
      sourceFile: sourceFile as TFile,
      original,
      preExistingMarkers,
      proposal,
    });
  }
  const stale = detectStaleProposal({
    job: params.job,
    latestRecord,
    currentVisibleMarkdown,
    proposalVisibleMarkdown: params.editedVisibleMarkdown ?? mergeProposal.proposedVisibleMarkdown,
  });

  const mergeBaseRecord = currentVisibleMarkdown
    ? recordWithLiveVisibleItems(latestRecord, currentVisibleMarkdown, params.job, params.settings, liveMatch?.clarificationId)
    : latestRecord;
  const operationResult = params.editedVisibleMarkdown
    ? recordFromEditedVisibleMarkdown({
        job: params.job,
        proposal: mergeProposal,
        editedVisibleMarkdown: params.editedVisibleMarkdown,
        existingRecord: mergeBaseRecord,
        settings: params.settings,
      })
    : recordFromLiveOperations({
        job: params.job,
        proposal,
        existingRecord: mergeBaseRecord,
        settings: params.settings,
      });
  const record = ensureUniqueClarificationId(operationResult.record, original, liveMatch?.clarificationId);
  const visible = buildClarificationBlock(record, params.settings);
  const next = applyClarificationMarkdown(original, params.job, record, visible);

  await params.app.vault.modify(sourceFile as TFile, next.markdown);
  const after = await params.app.vault.read(sourceFile as TFile);
  const verification = verifyAppliedMarkers(after, {
    appliedClarificationId: record.id,
    appliedItemIds: operationResult.changedItemIds,
  });
  if (!verification.ok) {
    await params.app.vault.modify(sourceFile as TFile, original);
    const failedAt = new Date().toISOString();
    await params.jobStore.saveJob(
      {
        ...params.job,
        status: "failed",
        updated: failedAt,
        appliedClarificationId: record.id,
        appliedItemIds: operationResult.changedItemIds,
        relatedItemIds: Array.from(new Set([...(params.job.relatedItemIds ?? []), ...operationResult.changedItemIds])),
        targetClarificationId: record.id,
        error: {
          message: applyVerificationMessage(verification),
          code: "apply-verification-failed",
          retryable: true,
          missingClarificationId: verification.missingClarificationId,
          missingItemIds: verification.missingItemIds,
          notePath: params.job.notePath,
          sourceBlockHash: params.job.sourceBlockHash,
          targetClarificationId: record.id,
        },
      },
      "failed"
    );
    throw new ApplyVerificationError(verification);
  }
  const preservation = verifyMarkerPreservation(after, preExistingMarkers);
  if (!preservation.ok) {
    await params.app.vault.modify(sourceFile as TFile, original);
    await savePreservationFailedJob({
      jobStore: params.jobStore,
      job: params.job,
      notePath: params.job.notePath,
      preservation,
      appliedClarificationId: record.id,
      appliedItemIds: operationResult.changedItemIds,
    });
    throw new Error(applyPreservationMessage(preservation));
  }
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
    markdown: after,
    appliedAs: next.appliedAs,
    staleDetected: stale.stale,
    safeMerged: stale.stale,
    verification,
  };
}

export function applyClarificationMarkdown(
  markdown: string,
  job: AskJob,
  record: ClarificationRecord,
  visible: string
): { markdown: string; appliedAs: "created" | "updated" } {
  const existingMatch = findAllClarificationAnnotations(markdown).find(
    (match) => match.clarificationId === record.id
  );
  if (existingMatch) {
    return {
      markdown: replaceClarificationBlock(markdown, existingMatch, visible),
      appliedAs: "updated",
    };
  }

  const sourceMatch = findSourceBlockRange(markdown, job);
  if (!sourceMatch.exists) {
    throw new Error(
      sourceMatch.inconsistent
        ? `Source resolution failed: selected text "${job.selectedText}" is not in the recorded source block.`
        : "Source resolution failed: source block is no longer present in the live note."
    );
  }
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

async function applyGeneratedContentProposal(params: {
  app: App;
  jobStore: AskJobStore;
  clarificationStore: ClarificationStore;
  settings: LearningOsSettings;
  job: AskJob;
  editedVisibleMarkdown?: string;
  sourceFile: TFile;
  original: string;
  preExistingMarkers: LearningOsMarkers;
  proposal: ClarificationMergeProposal;
}): Promise<ApplyAskJobProposalResult> {
  const generatedId = extractGeneratedId(params.editedVisibleMarkdown ?? params.proposal.proposedVisibleMarkdown) ??
    params.proposal.generatedId ??
    createGeneratedContentId(params.job.detectedConcept ?? params.job.selectedText ?? "content");
  const visible = params.editedVisibleMarkdown?.trim()
    ? ensureGeneratedId(params.editedVisibleMarkdown, generatedId)
    : buildGeneratedContentBlock({ ...params.proposal, generatedId }, params.settings);
  const appliedItemIds = collectLearningOsMarkers(visible).itemIds;
  if (appliedItemIds.length === 0) {
    throw new Error("Generated-content proposal has no item to apply. Regenerate the answer before applying.");
  }
  const next = applyGeneratedContentMarkdown(params.original, params.job, generatedId, visible);

  await params.app.vault.modify(params.sourceFile, next.markdown);
  const after = await params.app.vault.read(params.sourceFile);
  const verification = verifyAppliedMarkers(after, {
    appliedGeneratedId: generatedId,
    appliedItemIds,
  });
  if (!verification.ok) {
    await params.app.vault.modify(params.sourceFile, params.original);
    await saveApplyVerificationFailedJob({
      jobStore: params.jobStore,
      job: params.job,
      notePath: params.job.notePath,
      verification,
      appliedItemIds,
    });
    throw new ApplyVerificationError(verification);
  }
  const preservation = verifyMarkerPreservation(after, params.preExistingMarkers);
  if (!preservation.ok) {
    await params.app.vault.modify(params.sourceFile, params.original);
    await savePreservationFailedJob({
      jobStore: params.jobStore,
      job: params.job,
      notePath: params.job.notePath,
      preservation,
      appliedGeneratedId: generatedId,
      appliedItemIds,
    });
    throw new Error(applyPreservationMessage(preservation));
  }

  const now = new Date().toISOString();
  const record = generatedRecordForResult(params.job, generatedId, params.proposal, appliedItemIds, params.settings, now);
  await params.jobStore.updateStatus(
    {
      ...params.job,
      appliedItemIds,
      relatedItemIds: Array.from(new Set([...(params.job.relatedItemIds ?? []), ...appliedItemIds])),
      mergeProposal: {
        ...params.proposal,
        generatedId,
        proposedVisibleMarkdown: visible,
      },
    },
    "applied",
    now,
    "applied"
  );

  return {
    record,
    markdown: after,
    appliedAs: next.appliedAs,
    staleDetected: false,
    safeMerged: false,
    verification,
  };
}

function applyGeneratedContentMarkdown(
  markdown: string,
  job: AskJob,
  generatedId: string,
  visible: string
): { markdown: string; appliedAs: "created" | "updated" } {
  const existing = findAllGeneratedAnnotations(markdown).find((match) => match.generatedId === generatedId);
  if (existing) {
    return {
      markdown: `${markdown.slice(0, existing.blockStart)}${ensureBlockSpacing(visible)}${markdown
        .slice(existing.blockEnd)
        .replace(/^\n+/, "")}`,
      appliedAs: "updated",
    };
  }
  const sourceMatch = findSourceBlockRange(markdown, job);
  if (sourceMatch.exists) {
    return {
      markdown: `${markdown.slice(0, sourceMatch.end).replace(/\s*$/, "")}\n\n${ensureBlockSpacing(visible)}${markdown
        .slice(sourceMatch.end)
        .replace(/^\n+/, "")}`,
      appliedAs: "created",
    };
  }
  const fallbackOffset = generatedContentFallbackOffset(markdown, job);
  return {
    markdown: `${markdown.slice(0, fallbackOffset).replace(/\s*$/, "")}\n\n${ensureBlockSpacing(visible)}${markdown
      .slice(fallbackOffset)
      .replace(/^\n+/, "")}`,
    appliedAs: "created",
  };
}

function generatedContentFallbackOffset(markdown: string, job: AskJob): number {
  const heading = findHeadingSectionForPath(markdown, job.headingPath);
  return heading?.end ?? markdown.length;
}

function findHeadingSectionForPath(markdown: string, headingPath: string[]): { start: number; end: number } | null {
  const headingNames = [...headingPath].reverse().map((item) => item.trim()).filter(Boolean);
  if (headingNames.length === 0) return null;
  const pattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
  const matches: Array<{ start: number; end: number; level: number; title: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      level: match[1].length,
      title: match[2].trim(),
    });
  }
  let selected: { start: number; end: number; level: number; title: string } | null = null;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    if (headingNames.includes(matches[index].title)) {
      selected = matches[index];
      break;
    }
  }
  if (!selected) return null;
  const next = matches.find((item) => item.start > selected.start && item.level <= selected.level);
  return { start: selected.start, end: next?.start ?? markdown.length };
}

export function verifyAppliedMarkers(
  markdown: string,
  expected: { appliedClarificationId?: string; appliedGeneratedId?: string; appliedItemIds: string[] }
): ApplyMarkerVerification {
  const hasClarification =
    !expected.appliedClarificationId ||
    markerExists(markdown, "learnos-clarification-id", expected.appliedClarificationId);
  const hasGenerated =
    !expected.appliedGeneratedId || markerExists(markdown, "learnos-generated-id", expected.appliedGeneratedId);
  const missingItemIds = expected.appliedItemIds.filter(
    (itemId) => !markerExists(markdown, "learnos-item-id", itemId)
  );
  return {
    ok: hasClarification && hasGenerated && missingItemIds.length === 0,
    appliedClarificationId: expected.appliedClarificationId,
    appliedGeneratedId: expected.appliedGeneratedId,
    appliedItemIds: expected.appliedItemIds,
    missingClarificationId: hasClarification ? undefined : expected.appliedClarificationId,
    missingGeneratedId: hasGenerated ? undefined : expected.appliedGeneratedId,
    missingItemIds,
  };
}

export function collectLearningOsMarkers(markdown: string): LearningOsMarkers {
  return {
    clarificationIds: uniqueMatches(markdown, /<!--\s*learnos-clarification-id:\s*([^>\s]+)\s*-->|%%\s*learnos-clarification-id:\s*([^%\s]+)\s*%%/g),
    itemIds: uniqueMatches(markdown, /<!--\s*learnos-item-id:\s*([^>;\s]+)(?:;\s*ask-ids:\s*[^>]+)?\s*-->/g),
    generatedIds: uniqueMatches(markdown, /<!--\s*learnos-generated-id:\s*([^>\s]+)\s*-->/g),
  };
}

export function verifyMarkerPreservation(
  markdown: string,
  before: LearningOsMarkers
): MarkerPreservationVerification {
  const after = collectLearningOsMarkers(markdown);
  return {
    ok:
      missingFrom(before.clarificationIds, after.clarificationIds).length === 0 &&
      missingFrom(before.itemIds, after.itemIds).length === 0 &&
      missingFrom(before.generatedIds, after.generatedIds).length === 0,
    missingClarificationIds: missingFrom(before.clarificationIds, after.clarificationIds),
    missingItemIds: missingFrom(before.itemIds, after.itemIds),
    missingGeneratedIds: missingFrom(before.generatedIds, after.generatedIds),
  };
}

async function withNoteApplyLock<T>(notePath: string, fn: () => Promise<T>): Promise<T> {
  const previous = noteApplyLocks.get(notePath) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = previous.catch(() => undefined).then(() => gate);
  noteApplyLocks.set(notePath, current);
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (noteApplyLocks.get(notePath) === current) {
      noteApplyLocks.delete(notePath);
    }
  }
}

async function saveApplyVerificationFailedJob(params: {
  jobStore: AskJobStore;
  job: AskJob;
  notePath: string;
  verification: ApplyMarkerVerification;
  appliedClarificationId?: string;
  appliedGeneratedId?: string;
  appliedItemIds: string[];
}): Promise<void> {
  const failedAt = new Date().toISOString();
  await params.jobStore.saveJob(
    {
      ...params.job,
      status: "failed",
      updated: failedAt,
      appliedClarificationId: params.appliedClarificationId,
      appliedItemIds: params.appliedItemIds,
      relatedItemIds: Array.from(new Set([...(params.job.relatedItemIds ?? []), ...params.appliedItemIds])),
      targetClarificationId: params.appliedClarificationId,
      error: {
        message: applyVerificationMessage(params.verification),
        code: "apply-verification-failed",
        retryable: true,
        missingClarificationId: params.verification.missingClarificationId,
        missingGeneratedId: params.verification.missingGeneratedId,
        missingItemIds: params.verification.missingItemIds,
        notePath: params.notePath,
        sourceBlockHash: params.job.sourceBlockHash,
        targetClarificationId: params.appliedClarificationId,
      },
    },
    "failed"
  );
}

async function savePreservationFailedJob(params: {
  jobStore: AskJobStore;
  job: AskJob;
  notePath: string;
  preservation: MarkerPreservationVerification;
  appliedClarificationId?: string;
  appliedGeneratedId?: string;
  appliedItemIds: string[];
}): Promise<void> {
  const failedAt = new Date().toISOString();
  await params.jobStore.saveJob(
    {
      ...params.job,
      status: "failed",
      updated: failedAt,
      appliedClarificationId: params.appliedClarificationId,
      appliedItemIds: params.appliedItemIds,
      relatedItemIds: Array.from(new Set([...(params.job.relatedItemIds ?? []), ...params.appliedItemIds])),
      targetClarificationId: params.appliedClarificationId,
      error: {
        message: applyPreservationMessage(params.preservation),
        code: "apply-preservation-failed",
        retryable: true,
        missingClarificationIds: params.preservation.missingClarificationIds,
        missingItemIds: params.preservation.missingItemIds,
        missingGeneratedIds: params.preservation.missingGeneratedIds,
        notePath: params.notePath,
        sourceBlockHash: params.job.sourceBlockHash,
        targetClarificationId: params.appliedClarificationId,
      },
    },
    "failed"
  );
}

function markerExists(markdown: string, markerName: string, id: string): boolean {
  const escaped = escapeRegExp(id);
  return new RegExp(`<!--\\s*${markerName}:\\s*${escaped}(?:\\s|;|-->)`, "m").test(markdown);
}

function applyPreservationMessage(preservation: MarkerPreservationVerification): string {
  const missing = [
    preservation.missingClarificationIds.length > 0
      ? `clarifications ${preservation.missingClarificationIds.join(", ")}`
      : "",
    preservation.missingItemIds.length > 0 ? `items ${preservation.missingItemIds.join(", ")}` : "",
    preservation.missingGeneratedIds.length > 0
      ? `generated content ${preservation.missingGeneratedIds.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("; ");
  return `Apply preservation failed: writing this proposal would remove pre-existing Learning OS markers (${missing}). The note was rolled back.`;
}

function uniqueMatches(markdown: string, pattern: RegExp): string[] {
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(markdown)) !== null) {
    const id = match[1] ?? match[2];
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

function missingFrom(before: string[], after: string[]): string[] {
  const afterSet = new Set(after);
  return before.filter((id) => !afterSet.has(id));
}

function applyVerificationMessage(verification: ApplyMarkerVerification): string {
  const missing = [
    verification.missingClarificationId ? `clarification ${verification.missingClarificationId}` : "",
    verification.missingGeneratedId ? `generated content ${verification.missingGeneratedId}` : "",
    verification.missingItemIds.length > 0 ? `items ${verification.missingItemIds.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  return `Apply verification failed: missing ${missing || "expected markers"} in the live note.`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  const sourceMatch = findSourceBlockRange(markdown, job);
  const adjacent = sourceMatch.exists
    ? findClarificationForSourceBlock(markdown, sourceMatch.start, sourceMatch.end)
    : null;
  if (explicitId) {
    const byId = matches.find((match) => match.clarificationId === explicitId);
    if (byId && (!sourceMatch.exists || adjacent?.clarificationId === explicitId)) return byId;
  }

  return adjacent;
}

function findSourceBlockRange(markdown: string, job: AskJob) {
  return resolveSourceBlockInLiveNote(markdown, job);
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

function ensureUniqueClarificationId(
  record: ClarificationRecord,
  markdown: string,
  allowedExistingId?: string
): ClarificationRecord {
  const collision = findAllClarificationAnnotations(markdown).some(
    (match) => match.clarificationId === record.id && match.clarificationId !== allowedExistingId
  );
  if (!collision) return record;
  let suffix = 1;
  let id = `${record.id}-${suffix}`;
  const existingIds = new Set(findAllClarificationAnnotations(markdown).map((match) => match.clarificationId));
  while (existingIds.has(id)) {
    suffix += 1;
    id = `${record.id}-${suffix}`;
  }
  return { ...record, id };
}

function generatedRecordForResult(
  job: AskJob,
  generatedId: string,
  proposal: ClarificationMergeProposal,
  appliedItemIds: string[],
  settings: Pick<LearningOsSettings, "uiLanguage" | "answerLanguage">,
  nowIso: string
): ClarificationRecord {
  const items = proposal.proposedItems.filter((item) => appliedItemIds.includes(item.id));
  return {
    schemaVersion: 1,
    id: generatedId,
    notePath: job.notePath,
    sourceBlock: job.sourceBlock,
    sourceBlockHash: job.sourceBlockHash,
    sourceStartOffset: job.sourceStartOffset,
    sourceEndOffset: job.sourceEndOffset,
    headingPath: job.headingPath,
    detectedConcept: job.detectedConcept,
    language: settings.answerLanguage,
    uiLanguage: settings.uiLanguage,
    created: job.created,
    updated: nowIso,
    items,
    interactions: [],
  };
}

interface GeneratedAnnotationMatch {
  generatedId: string;
  markerStart: number;
  markerEnd: number;
  blockStart: number;
  blockEnd: number;
}

function findAllGeneratedAnnotations(markdown: string): GeneratedAnnotationMatch[] {
  const pattern = /<!--\s*learnos-generated-id:\s*(gen-[^>\s]+)\s*-->/g;
  const matches: GeneratedAnnotationMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const markerStart = match.index;
    const markerEnd = markerStart + match[0].length;
    matches.push({
      generatedId: match[1],
      markerStart,
      markerEnd,
      blockStart: findCalloutBlockStart(markdown, markerStart),
      blockEnd: findCalloutBlockEnd(markdown, markerEnd),
    });
  }
  return matches;
}

function extractGeneratedId(markdown: string): string | null {
  return /<!--\s*learnos-generated-id:\s*(gen-[^>\s]+)\s*-->/.exec(markdown)?.[1] ?? null;
}

function ensureGeneratedId(markdown: string, generatedId: string): string {
  if (/<!--\s*learnos-generated-id:\s*gen-[^>\s]+\s*-->/.test(markdown)) return ensureBlockSpacing(markdown);
  const lines = markdown.split("\n");
  const insertIndex = Math.min(lines.length, 1);
  lines.splice(insertIndex, 0, `> <!-- learnos-generated-id: ${generatedId} -->`);
  return ensureBlockSpacing(lines.join("\n"));
}

function ensureBlockSpacing(markdown: string): string {
  return `${markdown.trimEnd()}\n\n`;
}

function findCalloutBlockStart(markdown: string, markerStart: number): number {
  let start = markdown.lastIndexOf("\n", markerStart);
  while (start > 0) {
    const previousLineStart = markdown.lastIndexOf("\n", start - 1) + 1;
    const line = markdown.slice(previousLineStart, start);
    if (!line.trim().startsWith(">") && line.trim() !== "") break;
    start = previousLineStart - 1;
  }
  const next = start < 0 ? 0 : start + 1;
  return markdown.slice(next, markerStart).includes("[!note]") ? next : markdown.lastIndexOf("\n", markerStart) + 1;
}

function findCalloutBlockEnd(markdown: string, markerEnd: number): number {
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
  if (!params.existingRecord) {
    const freshProposal = proposalForFreshClarification(params.proposal, operations, params.job);
    const record = recordFromMergeProposal({
      ...params,
      proposal: freshProposal,
      existingRecord: null,
    });
    return { record, changedItemIds: record.items.map((item) => item.id) };
  }

  if (operations.length === 0) {
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

function recordFromEditedVisibleMarkdown(params: {
  job: AskJob;
  proposal: ClarificationMergeProposal;
  editedVisibleMarkdown: string;
  existingRecord: ClarificationRecord | null;
  settings: Pick<LearningOsSettings, "uiLanguage" | "answerLanguage">;
}): { record: ClarificationRecord; changedItemIds: string[] } {
  const editedItems = itemsFromVisibleMarkdown(params.editedVisibleMarkdown, params.proposal.proposedItems);
  if (editedItems.length === 0) {
    throw new Error("Edited proposal could not be parsed into clarification items.");
  }

  const editedProposal: ClarificationMergeProposal = {
    ...params.proposal,
    action: params.existingRecord ? "add-item" : "create-clarification",
    clarificationId: params.existingRecord ? params.proposal.clarificationId : undefined,
    targetItemId: null,
    operations: undefined,
    proposedItems: editedItems,
    proposedVisibleMarkdown: params.editedVisibleMarkdown,
  };
  const shell = recordFromMergeProposal({
    job: params.job,
    proposal: editedProposal,
    existingRecord: params.existingRecord,
    settings: params.settings,
  });
  const interactionId = shell.interactions[shell.interactions.length - 1]?.id;
  const nowIso = shell.updated;

  if (!params.existingRecord) {
    return {
      record: shell,
      changedItemIds: shell.items.map((item) => item.id),
    };
  }

  const next = params.existingRecord.items.map((item) => ({ ...item }));
  const changedItemIds: string[] = [];
  for (const editedItem of editedItems.map((item, index) => completeEditedItem(item, index + 1, interactionId, nowIso))) {
    const existingIndex = next.findIndex(
      (item) =>
        item.id === editedItem.id ||
        normalizeClarificationItemTitle(item.itemTitle).toLowerCase() ===
          normalizeClarificationItemTitle(editedItem.itemTitle).toLowerCase()
    );
    if (existingIndex >= 0) {
      const current = next[existingIndex];
      next[existingIndex] = {
        ...current,
        targetText: editedItem.targetText || current.targetText,
        itemTitle: editedItem.itemTitle,
        question: editedItem.question || current.question,
        explanation: editedItem.explanation,
        updated: nowIso,
        relatedInteractionIds: interactionId
          ? Array.from(new Set([...current.relatedInteractionIds, interactionId]))
          : current.relatedInteractionIds,
      };
      changedItemIds.push(current.id);
      continue;
    }
    next.push(editedItem);
    changedItemIds.push(editedItem.id);
  }

  return {
    record: {
      ...shell,
      items: next,
    },
    changedItemIds,
  };
}

function completeEditedItem(
  item: ClarificationItem,
  index: number,
  interactionId: string | undefined,
  nowIso: string
): ClarificationItem {
  const itemTitle = normalizeClarificationItemTitle(item.itemTitle || item.targetText || `Clarification ${index}`);
  return {
    ...item,
    id: item.id || createEditedItemId(itemTitle, index),
    targetText: item.targetText || itemTitle,
    itemTitle,
    explanation: normalizeClarificationItemExplanation(item.explanation, itemTitle),
    created: item.created || nowIso,
    updated: nowIso,
    relatedInteractionIds: interactionId
      ? Array.from(new Set([...(item.relatedInteractionIds ?? []), interactionId]))
      : item.relatedInteractionIds ?? [],
  };
}

function proposalForFreshClarification(
  proposal: ClarificationMergeProposal,
  operations: ClarificationMergeOperation[],
  job: AskJob
): ClarificationMergeProposal {
  const operationItems = operations.map((operation) => operationToItem(operation, []));
  const interactionId = interactionIdForJob(job.id);
  const jobItems = proposal.proposedItems.filter(
    (item) =>
      item.id === job.proposedItemId ||
      item.relatedInteractionIds.includes(interactionId) ||
      item.question === job.userQuestion
  );
  const proposedItems = operationItems.length > 0 ? operationItems : jobItems.length > 0 ? jobItems : proposal.proposedItems.slice(-1);

  return {
    ...proposal,
    clarificationId: undefined,
    action: "create-clarification",
    targetItemId: null,
    operations: undefined,
    proposedItems,
  };
}

function operationsForProposal(
  proposal: ClarificationMergeProposal,
  liveItems: ClarificationItem[],
  job: AskJob
): ClarificationMergeOperation[] {
  const liveIds = new Set(liveItems.map((item) => item.id));
  const liveTitles = new Set(liveItems.map((item) => item.itemTitle.trim().toLowerCase()));
  if (proposal.operations && proposal.operations.length > 0) {
    return proposal.operations.map((operation, index) => {
      if (operation.op === "update-item" && !liveIds.has(operation.itemId)) {
        return {
          ...operation,
          op: "add-item",
          itemId: job.proposedItemId ?? operation.itemId ?? createEditedItemId(operation.itemTitle, index + 1),
        };
      }
      return operation;
    });
  }
  const targetItemId = proposal.targetItemId ?? job.targetItemId;
  if (targetItemId && liveIds.has(targetItemId) && proposal.proposedItems[0]) {
    return [itemToOperation("update-item", targetItemId, proposal.proposedItems[0])];
  }
  const newItems = proposal.proposedItems.filter(
    (item) => !liveIds.has(item.id) && !liveTitles.has(item.itemTitle.trim().toLowerCase())
  );
  const candidates = newItems.length > 0 ? newItems : proposal.proposedItems.slice(-1);
  return candidates.map((item) => itemToOperation("add-item", job.proposedItemId ?? item.id, item, job.proposedItemId));
}

function createEditedItemId(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `item-${slug || index}`;
}

function interactionIdForJob(jobId: string): string {
  return `ask-${jobId.replace(/^job-/, "")}`;
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
