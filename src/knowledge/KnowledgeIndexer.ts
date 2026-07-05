import { conceptIdFromName, conceptNameFromTitle } from "./ConceptNormalize";
import { KnowledgeRepository, sourceRefId } from "./KnowledgeRepository";
import { scanLearningOsItems, type KnowledgeMarkdownFile } from "./KnowledgeMarkdownScanner";
import { stableHash } from "../utils/hash";
import { toLocalIsoString } from "../utils/dates";
import type { KnowledgeDb } from "./KnowledgeDb";
import type { KnowledgeRebuildSummary } from "./KnowledgeTypes";
import type { AskJob } from "../types";

export interface RebuildKnowledgeIndexInput {
  markdownFiles: KnowledgeMarkdownFile[];
  askJobs?: AskJob[];
}

export function rebuildKnowledgeIndex(db: KnowledgeDb, input: RebuildKnowledgeIndexInput): KnowledgeRebuildSummary {
  const repo = new KnowledgeRepository(db);
  const now = toLocalIsoString();
  const scannedItems = scanLearningOsItems(input.markdownFiles);
  const seenItemIds = new Set<string>();
  const itemConceptIds = new Map<string, string[]>();
  let createdConcepts = 0;
  let updatedItems = 0;
  let manualEdits = 0;
  let askEvidence = 0;

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

    const sourceId = repo.upsertSourceRef({
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
    if (itemResult.contentChanged) {
      manualEdits += 1;
      repo.insertEvidence({
        id: `ev-edit-${stableHash([scanned.itemId, itemResult.previousHash ?? "", scanned.contentHash].join("|"))}`,
        conceptId,
        sourceType: "manual_edit",
        signalType: "correction",
        strength: 0.35,
        confidence: 0.35,
        summary: "User changed the live Learning OS item content since the previous knowledge index.",
        notePath: scanned.notePath,
        itemId: scanned.itemId,
        sourceRefId: sourceId,
        createdAt: now,
      });
    }

    repo.insertEvidence({
      id: `ev-coverage-${stableHash([conceptId, scanned.itemId, scanned.contentHash].join("|"))}`,
      conceptId,
      sourceType: "manual_note",
      signalType: "coverage",
      strength: 0.2,
      confidence: 0.25,
      summary: `Concept appears in a live Learning OS item in ${scanned.notePath}.`,
      notePath: scanned.notePath,
      itemId: scanned.itemId,
      sourceRefId: sourceId,
      createdAt: now,
    });

    seenItemIds.add(scanned.itemId);
    itemConceptIds.set(scanned.itemId, [conceptId]);
  }

  for (const itemId of repo.markMissingItems(seenItemIds)) {
    const priorConceptIds = itemConceptIds.get(itemId) ?? repo.getItem(itemId)?.conceptIds ?? [];
    const conceptId = priorConceptIds[0];
    repo.insertEvidence({
      id: `ev-missing-${stableHash([itemId, conceptId ?? ""].join("|"))}`,
      conceptId,
      sourceType: "delete",
      signalType: "stability",
      strength: 0.1,
      confidence: 0.2,
      summary: "A previously indexed Learning OS item was not found during rebuild and was marked missing.",
      itemId,
      createdAt: now,
    });
  }

  for (const job of input.askJobs ?? []) {
    const linkedItemIds = new Set([job.targetItemId, job.proposedItemId, ...(job.appliedItemIds ?? []), ...(job.relatedItemIds ?? [])].filter(Boolean) as string[]);
    for (const itemId of linkedItemIds) {
      const item = repo.getItem(itemId);
      const conceptId = item?.conceptIds?.[0];
      if (!item || !conceptId) continue;
      repo.insertEvidence({
        id: `ev-ask-${stableHash([job.id, itemId, conceptId].join("|"))}`,
        conceptId,
        sourceType: "ask",
        signalType: "confusion",
        strength: 0.2,
        confidence: 0.25,
        summary: summarize(job.userQuestion || "User asked about this Learning OS item."),
        notePath: job.notePath,
        itemId,
        jobId: job.id,
        sourceRefId: repo.upsertSourceRef({
          id: sourceRefId([conceptId, "ask-job", job.id]),
          conceptId,
          sourceType: "ask-job",
          path: `ask-jobs/${job.id}.json`,
          sourceHash: job.sourceBlockHash,
          title: job.userQuestion,
          status: "active",
          lastSeenAt: now,
        }),
        createdAt: now,
      });
      askEvidence += 1;
    }
  }

  db.setMeta("last_rebuild_at", now);
  const counts = repo.counts();
  return {
    ...counts,
    scannedNotes: input.markdownFiles.length,
    indexedItems: scannedItems.length,
    createdConcepts,
    updatedItems,
    manualEdits,
    missingItemsMarked: counts.missingItems,
    askEvidence,
  };
}

function summarize(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}
