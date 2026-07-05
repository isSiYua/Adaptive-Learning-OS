import { conceptIdFromName, conceptNameFromTitle } from "./ConceptNormalize";
import { KnowledgeRepository, sourceRefId } from "./KnowledgeRepository";
import { scanLearningOsItemsInNote } from "./KnowledgeMarkdownScanner";
import { stableHash } from "../utils/hash";
import { toLocalIsoString } from "../utils/dates";
import type { KnowledgeDb } from "./KnowledgeDb";
import type { KnowledgeCounts } from "./KnowledgeTypes";
import type { AskJob } from "../types";

export type KnowledgeSyncMode = "apply" | "note-modify";

export interface SyncKnowledgeDataForNoteInput {
  notePath: string;
  markdown: string;
  mode: KnowledgeSyncMode;
  askJobs?: AskJob[];
  appliedItemIds?: string[];
  trackManualEdits?: boolean;
  markMissing?: boolean;
  now?: string;
}

export interface KnowledgeNoteSyncSummary extends KnowledgeCounts {
  skipped: boolean;
  reason?: string;
  notePath: string;
  indexedItems: number;
  createdConcepts: number;
  updatedItems: number;
  manualEdits: number;
  missingItemsMarked: number;
  applyEvidence: number;
  askEvidence: number;
}

export class KnowledgeNoteSyncDebouncer {
  private timers = new Map<string, unknown>();
  private delayMs: number;
  private schedule: (callback: () => void, delayMs: number) => unknown;
  private cancel: (timer: unknown) => void;

  constructor(options?: {
    delayMs?: number;
    schedule?: (callback: () => void, delayMs: number) => unknown;
    cancel?: (timer: unknown) => void;
  }) {
    this.delayMs = options?.delayMs ?? 1200;
    this.schedule = options?.schedule ?? ((callback, delayMs) => window.setTimeout(callback, delayMs));
    this.cancel = options?.cancel ?? ((timer) => window.clearTimeout(timer as number));
  }

  queue(key: string, task: () => void): void {
    const existing = this.timers.get(key);
    if (existing !== undefined) {
      this.cancel(existing);
    }
    const timer = this.schedule(() => {
      this.timers.delete(key);
      task();
    }, this.delayMs);
    this.timers.set(key, timer);
  }

  clearAll(): void {
    for (const timer of this.timers.values()) {
      this.cancel(timer);
    }
    this.timers.clear();
  }
}

export function noteHasFinalLearningOsMarkers(markdown: string): boolean {
  return /<!--\s*learnos-(?:clarification-id|generated-id|item-id):\s*[^>]+-->/i.test(markdown);
}

export function syncKnowledgeDataForNote(
  db: KnowledgeDb,
  input: SyncKnowledgeDataForNoteInput
): KnowledgeNoteSyncSummary {
  const repo = new KnowledgeRepository(db);
  if (!noteHasFinalLearningOsMarkers(input.markdown)) {
    return emptySummary(repo.counts(), input.notePath, "no-final-learning-os-markers");
  }

  const now = input.now ?? toLocalIsoString();
  const scannedItems = scanLearningOsItemsInNote(input.notePath, input.markdown);
  const seenItemIds = new Set<string>();
  const appliedItemIds = new Set(input.appliedItemIds ?? scannedItems.map((item) => item.itemId));
  const jobs = input.askJobs ?? [];
  const trackManualEdits = input.trackManualEdits ?? true;
  const markMissing = input.markMissing ?? true;
  let createdConcepts = 0;
  let updatedItems = 0;
  let manualEdits = 0;
  let applyEvidence = 0;
  let askEvidence = 0;

  const noteSourceRefId = repo.upsertSourceRef({
    id: sourceRefId(["note", input.notePath]),
    sourceType: "note",
    path: input.notePath,
    sourceHash: stableHash(input.markdown),
    title: input.notePath.split("/").pop() ?? input.notePath,
    status: "active",
    lastSeenAt: now,
  });

  for (const scanned of scannedItems) {
    const conceptName = conceptNameFromTitle(scanned.title);
    const conceptId = conceptIdFromName(conceptName);
    const conceptResult = repo.upsertConcept({
      id: conceptId,
      name: conceptName,
      coverage: 0.2,
      mastery: 0,
      confidence: 0.25,
      status: "seen",
      summary: "Indexed from a live Learning OS item. No strong mastery evidence yet.",
      strongPoints: [],
      weakPoints: [],
      unknownPoints: [],
    });
    if (conceptResult.created) createdConcepts += 1;

    const itemSourceRefId = repo.upsertSourceRef({
      id: sourceRefId([conceptId, scanned.notePath, scanned.containerId, scanned.itemId]),
      conceptId,
      sourceType: scanned.containerType === "generated-content" ? "generated-content" : "clarification",
      path: scanned.notePath,
      sourceHash: scanned.contentHash,
      title: scanned.title,
      status: "active",
      lastSeenAt: now,
    });

    const itemResult = repo.upsertItem({
      itemId: scanned.itemId,
      containerId: scanned.containerId,
      containerType: scanned.containerType,
      notePath: scanned.notePath,
      title: scanned.title,
      contentHash: scanned.contentHash,
      contentSummary: summarize(scanned.content),
      conceptIds: [conceptId],
      status: "active",
      updatedAt: now,
      lastSeenAt: now,
    });
    if (!itemResult.created) updatedItems += 1;
    if (trackManualEdits && input.mode === "note-modify" && itemResult.contentChanged) {
      manualEdits += 1;
      repo.insertEvidence({
        id: `ev-edit-${stableHash([scanned.itemId, itemResult.previousHash ?? "", scanned.contentHash].join("|"))}`,
        conceptId,
        sourceType: "manual_edit",
        signalType: "correction",
        strength: 0.35,
        confidence: 0.35,
        summary: "User changed the live Learning OS item content since the previous knowledge sync.",
        notePath: scanned.notePath,
        itemId: scanned.itemId,
        sourceRefId: itemSourceRefId,
        createdAt: now,
      });
    }

    if (input.mode === "apply" && appliedItemIds.has(scanned.itemId)) {
      applyEvidence += 1;
      repo.insertEvidence({
        id: `ev-apply-${stableHash([scanned.itemId, scanned.contentHash, jobs[0]?.id ?? ""].join("|"))}`,
        conceptId,
        sourceType: "apply",
        signalType: "coverage",
        strength: 0.3,
        confidence: 0.35,
        summary: `User applied a Learning OS item into ${scanned.notePath}.`,
        notePath: scanned.notePath,
        itemId: scanned.itemId,
        jobId: jobs[0]?.id,
        sourceRefId: itemSourceRefId,
        createdAt: now,
      });
    }

    for (const job of jobsForItem(jobs, scanned.itemId)) {
      const jobSourceRefId = repo.upsertSourceRef({
        id: sourceRefId([conceptId, "ask-job", job.id]),
        conceptId,
        sourceType: "ask-job",
        path: `ask-jobs/${job.id}.json`,
        sourceHash: job.sourceBlockHash,
        title: job.userQuestion,
        status: "active",
        lastSeenAt: now,
      });
      askEvidence += 1;
      repo.insertEvidence({
        id: `ev-ask-${stableHash([job.id, scanned.itemId, conceptId].join("|"))}`,
        conceptId,
        sourceType: "ask",
        signalType: "confusion",
        strength: 0.2,
        confidence: 0.25,
        summary: summarize(job.userQuestion || "User asked about this Learning OS item."),
        notePath: job.notePath,
        itemId: scanned.itemId,
        jobId: job.id,
        sourceRefId: jobSourceRefId,
        createdAt: now,
      });
    }

    repo.insertEvidence({
      id: `ev-coverage-${stableHash([conceptId, scanned.itemId, scanned.contentHash, noteSourceRefId].join("|"))}`,
      conceptId,
      sourceType: "manual_note",
      signalType: "coverage",
      strength: 0.2,
      confidence: 0.25,
      summary: `Concept appears in a live Learning OS item in ${scanned.notePath}.`,
      notePath: scanned.notePath,
      itemId: scanned.itemId,
      sourceRefId: itemSourceRefId,
      createdAt: now,
    });

    seenItemIds.add(scanned.itemId);
  }

  let missingItemsMarked = 0;
  if (markMissing) {
    const missingItems = repo.markMissingItemsForNote(input.notePath, seenItemIds);
    missingItemsMarked = missingItems.length;
    for (const item of missingItems) {
      const conceptId = item.conceptIds?.[0];
      repo.insertEvidence({
        id: `ev-missing-note-${stableHash([input.notePath, item.itemId, conceptId ?? ""].join("|"))}`,
        conceptId,
        sourceType: "delete",
        signalType: "stability",
        strength: 0.1,
        confidence: 0.2,
        summary: "A previously indexed Learning OS item marker is missing from this note.",
        notePath: input.notePath,
        itemId: item.itemId,
        createdAt: now,
      });
    }
  }

  db.setMeta("last_auto_sync_at", now);
  db.setMeta("last_auto_sync_mode", input.mode);
  db.setMeta("last_auto_sync_note_path", input.notePath);

  return {
    ...repo.counts(),
    skipped: false,
    notePath: input.notePath,
    indexedItems: scannedItems.length,
    createdConcepts,
    updatedItems,
    manualEdits,
    missingItemsMarked,
    applyEvidence,
    askEvidence,
  };
}

function jobsForItem(jobs: AskJob[], itemId: string): AskJob[] {
  return jobs.filter((job) => {
    const linked = new Set(
      [job.targetItemId, job.proposedItemId, ...(job.appliedItemIds ?? []), ...(job.relatedItemIds ?? [])].filter(
        Boolean
      ) as string[]
    );
    return linked.has(itemId);
  });
}

function emptySummary(counts: KnowledgeCounts, notePath: string, reason: string): KnowledgeNoteSyncSummary {
  return {
    ...counts,
    skipped: true,
    reason,
    notePath,
    indexedItems: 0,
    createdConcepts: 0,
    updatedItems: 0,
    manualEdits: 0,
    missingItemsMarked: 0,
    applyEvidence: 0,
    askEvidence: 0,
  };
}

function summarize(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}
