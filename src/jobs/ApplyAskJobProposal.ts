import {
  buildClarificationBlock,
  findAllClarificationAnnotations,
  findClarificationForSourceBlock,
  replaceClarificationBlock,
} from "../ask/ClarificationBlock";
import {
  proposalFromEditedMarkdown,
  recordFromMergeProposal,
} from "../ask/ClarificationMergeProposal";
import { stableHash } from "../utils/hash";
import type { App, TFile } from "obsidian";
import type { ClarificationStore } from "../storage/ClarificationStore";
import type { AskJobStore } from "../storage/AskJobStore";
import type { AskJob, ClarificationRecord, LearningOsSettings } from "../types";

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

  if (stale.liveBlockHasManualEdits) {
    throw new StaleProposalError(
      params.settings.uiLanguage === "en"
        ? "The visible clarification block changed outside Learning OS. Rebase before applying to avoid overwriting manual edits."
        : "当前可见理解块已经在 Learning OS 外被修改。请先重新合并，避免覆盖手动编辑。"
    );
  }

  const record = recordFromMergeProposal({
    job: params.job,
    proposal,
    existingRecord: latestRecord,
    settings: params.settings,
  });
  const visible = buildClarificationBlock(record, params.settings);
  const next = applyClarificationMarkdown(original, params.job, record, visible);

  await params.app.vault.modify(sourceFile as TFile, next.markdown);
  await params.clarificationStore.saveRecord(record, next.appliedAs);
  await params.jobStore.updateStatus(params.job, "applied", record.updated, "applied");

  return {
    record,
    markdown: next.markdown,
    appliedAs: next.appliedAs,
    staleDetected: stale.stale,
    safeMerged: stale.stale && !stale.liveBlockHasManualEdits,
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
  const liveBlockHasManualEdits =
    Boolean(params.currentVisibleMarkdown && latest) &&
    stableHash(params.currentVisibleMarkdown) !== stableHash(renderedLatest) &&
    !params.currentVisibleMarkdown.includes(params.proposalVisibleMarkdown.trim());

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
  if (job.existingClarificationId) {
    return clarificationStore.readRecord(job.existingClarificationId);
  }
  return clarificationStore.findByNotePathAndSourceHash(job.notePath, job.sourceBlockHash);
}

export function findLiveClarificationMatch(markdown: string, job: AskJob) {
  const matches = findAllClarificationAnnotations(markdown);
  if (job.existingClarificationId) {
    const byId = matches.find((match) => match.clarificationId === job.existingClarificationId);
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
