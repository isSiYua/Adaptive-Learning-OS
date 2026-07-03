import type { AskJob, ClarificationRecord } from "../types";

export interface MarkdownCleanupInput {
  path: string;
  content: string;
}

export interface LiveClarificationMarker {
  id: string;
  notePath: string;
  marker: string;
}

export interface OrphanCleanupPlan {
  liveClarificationIds: Set<string>;
  liveMarkers: LiveClarificationMarker[];
  orphanClarifications: ClarificationRecord[];
  danglingMarkers: LiveClarificationMarker[];
  orphanJobs: AskJob[];
  askJobsMissingClarificationRecords: AskJob[];
  askJobsReferencingOrphanClarifications: AskJob[];
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
  const liveClarificationIds = new Set(liveMarkers.map((marker) => marker.id));
  const recordIds = new Set(params.clarificationRecords.map((record) => record.id));

  const orphanClarifications = params.clarificationRecords.filter(
    (record) => !liveClarificationIds.has(record.id)
  );
  const orphanIds = new Set(orphanClarifications.map((record) => record.id));
  const danglingMarkers = liveMarkers.filter((marker) => !recordIds.has(marker.id));
  const askJobsMissingClarificationRecords = params.askJobs.filter(
    (job) => {
      const clarificationId = targetClarificationId(job);
      return Boolean(clarificationId && !recordIds.has(clarificationId));
    }
  );
  const askJobsReferencingOrphanClarifications = params.askJobs.filter(
    (job) => {
      const clarificationId = targetClarificationId(job);
      return Boolean(clarificationId && recordIds.has(clarificationId) && orphanIds.has(clarificationId));
    }
  );
  const archivedJobs = params.askJobs.filter((job) => job.status === "archived");
  const appliedJobsMissingMarkers = params.askJobs.filter(
    (job) => job.status === "applied" && missingLiveMarker(job, liveClarificationIds)
  );
  const orphanJobs = uniqueJobs([
    ...askJobsMissingClarificationRecords,
    ...askJobsReferencingOrphanClarifications,
    ...appliedJobsMissingMarkers,
  ]);

  return {
    liveClarificationIds,
    liveMarkers,
    orphanClarifications,
    danglingMarkers,
    orphanJobs,
    askJobsMissingClarificationRecords,
    askJobsReferencingOrphanClarifications,
    archivedJobs,
    appliedJobsMissingMarkers,
  };
}

export function cleanupJobsForArchive(plan: OrphanCleanupPlan): AskJob[] {
  return uniqueJobs([
    ...plan.orphanJobs,
    ...plan.archivedJobs,
    ...plan.appliedJobsMissingMarkers,
  ]);
}

export function cleanupJobsForDelete(plan: OrphanCleanupPlan): AskJob[] {
  return uniqueJobs([
    ...plan.orphanJobs,
    ...plan.archivedJobs,
    ...plan.appliedJobsMissingMarkers,
  ]);
}

export function targetClarificationId(job: AskJob): string | null {
  return job.existingClarificationId ?? job.mergeProposal?.clarificationId ?? null;
}

function missingLiveMarker(job: AskJob, liveClarificationIds: Set<string>): boolean {
  const clarificationId = targetClarificationId(job);
  return Boolean(clarificationId && !liveClarificationIds.has(clarificationId));
}

function uniqueJobs(jobs: AskJob[]): AskJob[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}
