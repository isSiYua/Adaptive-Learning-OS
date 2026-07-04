import { findAllClarificationAnnotations, parseLiveClarificationItemsFromBlock } from "../ask/ClarificationBlock";
import type { AskJob, ClarificationItem, ClarificationRecord } from "../types";

export interface MarkdownCleanupInput {
  path: string;
  content: string;
}

export interface LiveClarificationMarker {
  id: string;
  notePath: string;
  marker: string;
}

export interface DeletedClarificationItem {
  clarificationId: string;
  item: ClarificationItem;
  notePath: string;
}

export interface DanglingItemMarker {
  clarificationId: string;
  itemId: string;
  notePath: string;
}

export interface OrphanCleanupPlan {
  liveClarificationIds: Set<string>;
  liveItemIdsByClarificationId: Map<string, Set<string>>;
  liveAskIdsByClarificationId: Map<string, Set<string>>;
  liveMarkers: LiveClarificationMarker[];
  orphanClarifications: ClarificationRecord[];
  deletedItems: DeletedClarificationItem[];
  danglingItemMarkers: DanglingItemMarker[];
  danglingMarkers: LiveClarificationMarker[];
  orphanJobs: AskJob[];
  askJobsMissingClarificationRecords: AskJob[];
  askJobsReferencingOrphanClarifications: AskJob[];
  appliedJobsMissingItemMarkers: AskJob[];
  archivedJobs: AskJob[];
  appliedJobsMissingMarkers: AskJob[];
}

export function extractLiveClarificationIds(markdown: string): Set<string> {
  return new Set(extractLiveClarificationMarkers([{ path: "(unknown)", content: markdown }]).map((marker) => marker.id));
}

export function extractLiveClarificationMarkers(markdownFiles: Array<string | MarkdownCleanupInput>): LiveClarificationMarker[] {
  const markers: LiveClarificationMarker[] = [];
  const obsidianComment = /%%\s*learnos-clarification-id:\s*(clar-[^%\s]+)\s*%%/g;
  const htmlComment = /<!--\s*learnos-clarification-id:\s*(clar-[^>\s]+)\s*-->/g;

  for (const file of markdownFiles) {
    const notePath = typeof file === "string" ? "(unknown)" : file.path;
    const content = typeof file === "string" ? file : file.content;
    for (const pattern of [obsidianComment, htmlComment]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        markers.push({
          id: match[1],
          notePath,
          marker: match[0],
        });
      }
    }
  }

  return markers;
}

export function buildOrphanCleanupPlan(params: {
  markdownFiles: Array<string | MarkdownCleanupInput>;
  clarificationRecords: ClarificationRecord[];
  askJobs: AskJob[];
}): OrphanCleanupPlan {
  const liveMarkers = extractLiveClarificationMarkers(params.markdownFiles);
  const liveItemIdsByClarificationId = extractLiveItemIdsByClarificationId(params.markdownFiles);
  const liveAskIdsByClarificationId = extractLiveAskIdsByClarificationId(params.markdownFiles);
  addBackendAskIdsForLiveItems(liveAskIdsByClarificationId, liveItemIdsByClarificationId, params.clarificationRecords);
  const liveAskIds = unionSets(Array.from(liveAskIdsByClarificationId.values()));
  const liveClarificationIds = new Set(liveMarkers.map((marker) => marker.id));
  const recordIds = new Set(params.clarificationRecords.map((record) => record.id));

  const orphanClarifications = params.clarificationRecords.filter(
    (record) => !liveClarificationIds.has(record.id)
  );
  const orphanIds = new Set(orphanClarifications.map((record) => record.id));
  const danglingMarkers = liveMarkers.filter((marker) => !recordIds.has(marker.id));
  const deletedItems = params.clarificationRecords.flatMap((record) => {
    if (!liveClarificationIds.has(record.id)) return [];
    const liveItemIds = liveItemIdsByClarificationId.get(record.id) ?? new Set<string>();
    return record.items
      .filter((item) => !liveItemIds.has(item.id))
      .map((item) => ({
        clarificationId: record.id,
        item,
        notePath: record.notePath,
      }));
  });
  const backendItemIdsByClarificationId = new Map(
    params.clarificationRecords.map((record) => [record.id, new Set(record.items.map((item) => item.id))])
  );
  const danglingItemMarkers = Array.from(liveItemIdsByClarificationId.entries()).flatMap(
    ([clarificationId, liveItemIds]) => {
      const backendItemIds = backendItemIdsByClarificationId.get(clarificationId) ?? new Set<string>();
      const notePath = liveMarkers.find((marker) => marker.id === clarificationId)?.notePath ?? "(unknown)";
      return Array.from(liveItemIds)
        .filter((itemId) => !backendItemIds.has(itemId))
        .map((itemId) => ({ clarificationId, itemId, notePath }));
    }
  );
  const askJobsMissingClarificationRecords = params.askJobs.filter(
    (job) => {
      if (jobHasLiveAskId(job, liveAskIds)) return false;
      const clarificationIds = referencedClarificationIds(job);
      return clarificationIds.some(
        (clarificationId) => !recordIds.has(clarificationId) && !liveClarificationIds.has(clarificationId)
      );
    }
  );
  const askJobsReferencingOrphanClarifications = params.askJobs.filter(
    (job) => {
      if (jobHasLiveAskId(job, liveAskIds)) return false;
      const clarificationIds = referencedClarificationIds(job);
      return clarificationIds.some(
        (clarificationId) => recordIds.has(clarificationId) && orphanIds.has(clarificationId)
      );
    }
  );
  const archivedJobs = params.askJobs.filter((job) => job.status === "archived");
  const appliedJobsMissingMarkers = params.askJobs.filter(
    (job) => job.status === "applied" && !jobHasLiveAskId(job, liveAskIds) && missingLiveMarker(job, liveClarificationIds)
  );
  const appliedJobsMissingItemMarkers = params.askJobs.filter((job) => {
    if (job.status !== "applied") return false;
    const clarificationId = targetClarificationId(job);
    if (!clarificationId || !liveClarificationIds.has(clarificationId)) return false;
    const liveAskIds = liveAskIdsByClarificationId.get(clarificationId) ?? new Set<string>();
    if (jobHasLiveAskId(job, liveAskIds)) {
      return false;
    }
    const referencedItemIds = targetItemIds(job);
    const liveItemIds = liveItemIdsByClarificationId.get(clarificationId) ?? new Set<string>();
    if (referencedItemIds.length > 0) {
      return referencedItemIds.some((itemId) => !liveItemIds.has(itemId));
    }
    return liveAskIds.size > 0;
  });
  const orphanJobs = uniqueJobs([
    ...askJobsMissingClarificationRecords,
    ...askJobsReferencingOrphanClarifications,
    ...appliedJobsMissingMarkers,
    ...appliedJobsMissingItemMarkers,
  ]);

  return {
    liveClarificationIds,
    liveItemIdsByClarificationId,
    liveAskIdsByClarificationId,
    liveMarkers,
    orphanClarifications,
    deletedItems,
    danglingItemMarkers,
    danglingMarkers,
    orphanJobs,
    askJobsMissingClarificationRecords,
    askJobsReferencingOrphanClarifications,
    appliedJobsMissingItemMarkers,
    archivedJobs,
    appliedJobsMissingMarkers,
  };
}

export function cleanupJobsForArchive(plan: OrphanCleanupPlan): AskJob[] {
  return uniqueJobs([
    ...plan.orphanJobs,
    ...plan.archivedJobs,
    ...plan.appliedJobsMissingMarkers,
    ...plan.appliedJobsMissingItemMarkers,
  ]);
}

export function cleanupJobsForDelete(plan: OrphanCleanupPlan): AskJob[] {
  return uniqueJobs([
    ...plan.orphanJobs,
    ...plan.archivedJobs,
    ...plan.appliedJobsMissingMarkers,
    ...plan.appliedJobsMissingItemMarkers,
  ]);
}

export function targetClarificationId(job: AskJob): string | null {
  return referencedClarificationIds(job)[0] ?? null;
}

export function referencedClarificationIds(job: AskJob): string[] {
  const ids = new Set<string>();
  collectClarificationIdValue(job.existingClarificationId, ids);
  collectClarificationIdValue(job.existingClarificationRecordPath, ids);
  collectClarificationIdValue(job.mergeProposal?.clarificationId, ids);
  collectClarificationMarkerIds(job.mergeProposal?.proposedVisibleMarkdown, ids);
  const dynamicJob = job as unknown as Record<string, unknown>;
  collectClarificationIdValue(dynamicJob.appliedClarificationId, ids);
  collectClarificationIdValue(dynamicJob.targetClarificationId, ids);
  collectClarificationIdValue(dynamicJob.clarificationId, ids);
  collectClarificationIdsFromObject(dynamicJob.metadata, ids);
  collectClarificationIdsFromObject(dynamicJob.proposal, ids);
  return Array.from(ids);
}

export function targetItemIds(job: AskJob): string[] {
  const ids = new Set<string>();
  collectItemIdValue(job.targetItemId, ids);
  collectItemIdValue(job.proposedItemId, ids);
  collectItemIdValue(job.relatedItemIds, ids);
  collectItemIdValue(job.appliedItemIds, ids);
  collectItemIdValue(job.mergeProposal?.targetItemId, ids);
  collectItemIdValue(job.mergeProposal?.operations, ids);
  collectItemIdValue(job.mergeProposal?.proposedItems, ids);
  collectItemMarkerIds(job.mergeProposal?.proposedVisibleMarkdown, ids);
  const dynamicJob = job as unknown as Record<string, unknown>;
  collectItemIdValue(dynamicJob.itemId, ids);
  collectItemIdValue(dynamicJob.targetItemId, ids);
  collectItemIdValue(dynamicJob.relatedItemIds, ids);
  collectItemIdValue(dynamicJob.appliedItemIds, ids);
  return Array.from(ids);
}

function addBackendAskIdsForLiveItems(
  liveAskIdsByClarificationId: Map<string, Set<string>>,
  liveItemIdsByClarificationId: Map<string, Set<string>>,
  clarificationRecords: ClarificationRecord[]
): void {
  for (const record of clarificationRecords) {
    const liveItemIds = liveItemIdsByClarificationId.get(record.id);
    if (!liveItemIds) continue;
    const askIds = liveAskIdsByClarificationId.get(record.id) ?? new Set<string>();
    for (const item of record.items) {
      if (!liveItemIds.has(item.id)) continue;
      for (const askId of item.relatedInteractionIds) {
        askIds.add(askId);
      }
    }
    liveAskIdsByClarificationId.set(record.id, askIds);
  }
}

export function askIdsForJob(job: AskJob): string[] {
  const ids = new Set<string>();
  if (job.id) {
    ids.add(job.id);
    ids.add(job.id.startsWith("job-") ? `ask-${job.id.slice(4)}` : `ask-${job.id}`);
  }
  return Array.from(ids);
}

function missingLiveMarker(job: AskJob, liveClarificationIds: Set<string>): boolean {
  const clarificationId = targetClarificationId(job);
  return Boolean(clarificationId && !liveClarificationIds.has(clarificationId));
}

function jobHasLiveAskId(job: AskJob, liveAskIds: Set<string>): boolean {
  return askIdsForJob(job).some((askId) => liveAskIds.has(askId));
}

function uniqueJobs(jobs: AskJob[]): AskJob[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}

function unionSets<T>(sets: Set<T>[]): Set<T> {
  const union = new Set<T>();
  for (const set of sets) {
    for (const item of set) union.add(item);
  }
  return union;
}

function collectClarificationIdValue(value: unknown, ids: Set<string>): void {
  if (!value) return;
  if (typeof value === "string") {
    const pattern = /clar-[A-Za-z0-9_-]+/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value)) !== null) {
      ids.add(match[0]);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectClarificationIdValue(item, ids);
    return;
  }
}

function collectClarificationMarkerIds(value: unknown, ids: Set<string>): void {
  if (typeof value !== "string") return;
  for (const marker of extractLiveClarificationMarkers([value])) {
    ids.add(marker.id);
  }
}

function collectClarificationIdsFromObject(value: unknown, ids: Set<string>): void {
  if (!value || typeof value !== "object") return;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(record)) {
      const normalized = key.toLowerCase();
      if (normalized.includes("clarification")) {
        collectClarificationIdValue(item, ids);
      } else if (typeof item === "object") {
        collectClarificationIdsFromObject(item, ids);
      }
    }
  }
}

function extractLiveItemIdsByClarificationId(
  markdownFiles: Array<string | MarkdownCleanupInput>
): Map<string, Set<string>> {
  const byClarification = new Map<string, Set<string>>();
  for (const file of markdownFiles) {
    const content = typeof file === "string" ? file : file.content;
    for (const match of findAllClarificationAnnotations(content)) {
      const block = content.slice(match.blockStart, match.blockEnd);
      const itemIds = new Set(parseLiveClarificationItemsFromBlock(block).map((item) => item.item.id));
      byClarification.set(match.clarificationId, itemIds);
    }
  }
  return byClarification;
}

function extractLiveAskIdsByClarificationId(
  markdownFiles: Array<string | MarkdownCleanupInput>
): Map<string, Set<string>> {
  const byClarification = new Map<string, Set<string>>();
  for (const file of markdownFiles) {
    const content = typeof file === "string" ? file : file.content;
    for (const match of findAllClarificationAnnotations(content)) {
      const block = content.slice(match.blockStart, match.blockEnd);
      const askIds = new Set(
        parseLiveClarificationItemsFromBlock(block).flatMap((item) => item.item.relatedInteractionIds)
      );
      byClarification.set(match.clarificationId, askIds);
    }
  }
  return byClarification;
}

function collectItemIdValue(value: unknown, ids: Set<string>): void {
  if (!value) return;
  if (typeof value === "string") {
    const itemId = value.trim();
    if (/^[A-Za-z0-9_-]+$/.test(itemId)) {
      ids.add(itemId);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectItemIdValue(item, ids);
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(record)) {
      if (isItemIdField(key)) {
        collectItemIdValue(item, ids);
      } else if (Array.isArray(item) && (key === "operations" || key === "proposedItems" || key === "proposed_items")) {
        collectItemIdValue(item, ids);
      }
    }
  }
}

function collectItemMarkerIds(value: unknown, ids: Set<string>): void {
  if (typeof value !== "string") return;
  const pattern = /<!--\s*learnos-item-id:\s*([^>;\s]+)(?:;\s*ask-ids:\s*([^>]+?))?\s*-->/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    ids.add(match[1]);
  }
}

function isItemIdField(key: string): boolean {
  return [
    "id",
    "itemId",
    "item_id",
    "targetItemId",
    "target_item_id",
    "proposedItemId",
    "proposed_item_id",
    "relatedItemIds",
    "related_item_ids",
    "appliedItemIds",
    "applied_item_ids",
  ].includes(key);
}
