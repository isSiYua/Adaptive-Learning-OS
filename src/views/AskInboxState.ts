import type { AskJob, AskJobStatus } from "../types";
import { generatedContentMissingWarning } from "../ask/AskIntent";

export type InboxActionSet = "ready" | "failed" | "history" | "running";
export type InboxTabId = "running" | "ready" | "failed" | "history";

export interface InboxStatusGroup {
  id: "running" | "ready" | "failed" | "applied" | "archived" | "cancelled";
  statuses: AskJobStatus[];
  zh: string;
  en: string;
  history: boolean;
}

export const INBOX_STATUS_GROUPS: InboxStatusGroup[] = [
  { id: "running", statuses: ["running", "queued"], zh: "处理中", en: "Running", history: false },
  { id: "ready", statuses: ["completed"], zh: "待处理", en: "Ready to review", history: false },
  { id: "failed", statuses: ["failed"], zh: "失败", en: "Failed", history: false },
  { id: "applied", statuses: ["applied"], zh: "已应用", en: "Applied", history: true },
  { id: "archived", statuses: ["archived"], zh: "已归档", en: "Archived", history: true },
  { id: "cancelled", statuses: ["cancelled"], zh: "已取消", en: "Cancelled", history: true },
];

export interface InboxTab {
  id: InboxTabId;
  statuses: AskJobStatus[];
  zh: string;
  en: string;
}

export interface InboxRenderModel {
  jobs: AskJob[];
  tabJobs: AskJob[];
  selectedJob: AskJob | null;
  selectedJobId: string | null;
  showSelectedDetail: boolean;
  showStickyApply: boolean;
}

export const INBOX_TABS: InboxTab[] = [
  { id: "running", statuses: ["running", "queued"], zh: "处理中", en: "Running" },
  { id: "ready", statuses: ["completed"], zh: "待处理", en: "Ready" },
  { id: "failed", statuses: ["failed"], zh: "失败", en: "Failed" },
  { id: "history", statuses: ["applied", "archived", "cancelled"], zh: "历史记录", en: "History" },
];

export function jobsForGroup(jobs: AskJob[], group: InboxStatusGroup): AskJob[] {
  return uniqueJobsById(jobs).filter((job) => group.statuses.includes(job.status));
}

export function jobsForTab(jobs: AskJob[], tabId: InboxTabId): AskJob[] {
  const tab = INBOX_TABS.find((item) => item.id === tabId);
  if (!tab) return [];
  return sortJobsForTab(
    uniqueJobsById(jobs).filter((job) => tab.statuses.includes(job.status)),
    tabId
  );
}

export function countForTab(jobs: AskJob[], tabId: InboxTabId): number {
  return jobsForTab(jobs, tabId).length;
}

export function tabCounts(jobs: AskJob[]): Record<InboxTabId, number> {
  return {
    running: countForTab(jobs, "running"),
    ready: countForTab(jobs, "ready"),
    failed: countForTab(jobs, "failed"),
    history: countForTab(jobs, "history"),
  };
}

export function readyJobs(jobs: AskJob[]): AskJob[] {
  return uniqueJobsById(jobs).filter((job) => job.status === "completed");
}

export function activeJobs(jobs: AskJob[]): AskJob[] {
  return uniqueJobsById(jobs).filter((job) => isActiveStatus(job.status));
}

export function historyJobs(jobs: AskJob[]): AskJob[] {
  return uniqueJobsById(jobs).filter((job) => isHistoryStatus(job.status));
}

export function readyCount(jobs: AskJob[]): number {
  return readyJobs(jobs).length;
}

export function nextReadyJobIdAfterApply(jobs: AskJob[], appliedJobId: string): string | null {
  const ready = readyJobs(jobs);
  const currentIndex = ready.findIndex((job) => job.id === appliedJobId);
  if (currentIndex === -1) return ready[0]?.id ?? null;
  return ready[currentIndex + 1]?.id ?? ready[currentIndex - 1]?.id ?? null;
}

export function resolveSelectedJobId(
  jobs: AskJob[],
  selectedJobId: string | null,
  showHistory: boolean
): string | null {
  const selected = selectedJobId ? jobs.find((job) => job.id === selectedJobId) : null;
  if (selected && selected.status === "completed") return selected.id;
  if (selected && showHistory && isHistoryStatus(selected.status)) return selected.id;
  return readyJobs(jobs)[0]?.id ?? null;
}

export function resolveSelectedJobIdForTab(
  jobs: AskJob[],
  selectedJobId: string | null,
  tabId: InboxTabId
): string | null {
  const tabJobs = jobsForTab(jobs, tabId);
  if (selectedJobId && tabJobs.some((job) => job.id === selectedJobId)) return selectedJobId;
  return tabJobs[0]?.id ?? null;
}

export function inboxRenderModel(
  jobs: AskJob[],
  selectedJobId: string | null,
  tabId: InboxTabId
): InboxRenderModel {
  const uniqueJobs = uniqueJobsById(jobs);
  const resolvedSelectedJobId = resolveSelectedJobIdForTab(uniqueJobs, selectedJobId, tabId);
  const tabJobs = jobsForTab(uniqueJobs, tabId);
  const selectedJob = resolvedSelectedJobId ? uniqueJobs.find((job) => job.id === resolvedSelectedJobId) ?? null : null;
  return {
    jobs: uniqueJobs,
    tabJobs,
    selectedJob,
    selectedJobId: resolvedSelectedJobId,
    showSelectedDetail: Boolean(selectedJob),
    showStickyApply: tabId === "ready" && selectedJob?.status === "completed",
  };
}

export function nextJobIdInTab(jobs: AskJob[], currentJobId: string, tabId: InboxTabId): string | null {
  const tabJobs = jobsForTab(jobs, tabId);
  const currentIndex = tabJobs.findIndex((job) => job.id === currentJobId);
  if (currentIndex === -1) return tabJobs[0]?.id ?? null;
  return tabJobs[currentIndex + 1]?.id ?? tabJobs[currentIndex - 1]?.id ?? null;
}

export function sortJobsForTab(jobs: AskJob[], tabId: InboxTabId): AskJob[] {
  const direction = tabId === "ready" ? 1 : -1;
  return [...jobs].sort((a, b) => {
    const byTime = a.created.localeCompare(b.created) || a.updated.localeCompare(b.updated);
    if (byTime !== 0) return byTime * direction;
    return a.id.localeCompare(b.id) * direction;
  });
}

export function isActiveStatus(status: AskJobStatus): boolean {
  return status === "queued" || status === "running" || status === "completed" || status === "failed";
}

export function isHistoryStatus(status: AskJobStatus): boolean {
  return status === "applied" || status === "archived" || status === "cancelled";
}

export function actionSetForJob(job: AskJob): InboxActionSet {
  if (job.status === "completed") return "ready";
  if (job.status === "failed") return "failed";
  if (isHistoryStatus(job.status)) return "history";
  return "running";
}

export function emptyStateKind(jobs: AskJob[]): "none" | "no-jobs" | "only-history" | "no-ready" {
  if (jobs.length === 0) return "no-jobs";
  if (activeJobs(jobs).length === 0 && historyJobs(jobs).length > 0) return "only-history";
  if (readyCount(jobs) === 0) return "no-ready";
  return "none";
}

export function displayAnswerForJob(job: AskJob): string {
  return job.parsedAnswer?.answer?.trim() || job.rawAnswer?.trim() || "";
}

export function displaySourceTextForJob(job: AskJob): string {
  if (job.askSourceMode === "clarification-item" || job.askSourceMode === "generated-content-item") {
    const selected = job.selectedLearningOsItem;
    const title = selected?.itemTitle?.trim() ?? "";
    const content = selected?.itemContent?.trim() ?? "";
    const itemText = [title, content].filter(Boolean).join(title && content ? " " : "").trim();
    if (itemText) return itemText;
  }
  return job.sourceBlock;
}

export function displayProcessingStatusForJob(job: AskJob, nowMs = Date.now()): string {
  const stage = job.processingStage ?? (job.status === "running" ? "waiting-provider" : job.status);
  const labels: Record<string, string> = {
    queued: "正在排队",
    "waiting-provider": "正在等待模型",
    "parsing-answer": "正在解析回答",
    "building-proposal": "正在生成编辑建议",
    "writing-draft": "正在写入 draft",
    completed: "已完成",
    failed: "处理失败",
  };
  const queuedAt = job.timingDiagnostics?.queuedAt ? Date.parse(job.timingDiagnostics.queuedAt) : NaN;
  const elapsed = Number.isFinite(queuedAt) ? nowMs - queuedAt : undefined;
  const slow = elapsed !== undefined && elapsed > 60_000 ? "，处理时间较长" : "";
  return `${labels[stage] ?? "正在处理"}${slow}`;
}

export function applyDisabledReasonForJob(job: AskJob): string | undefined {
  if (job.status !== "completed") return "Job is not ready to apply.";
  if (hasApplyableInlineDraft(job)) return undefined;
  if (!job.mergeProposal) return "This job does not have a merge proposal yet.";
  if (
    job.mergeProposal.proposedItems.length === 0 &&
    !job.mergeProposal.proposedVisibleMarkdown.trim()
  ) {
    return "This job has no usable proposal to apply.";
  }
  return (
    job.applyDisabledReason ??
    generatedContentMissingWarning(job.userQuestion, job.parsedAnswer?.answer ?? job.rawAnswer ?? "") ??
    undefined
  );
}

export function hasApplyableInlineDraft(job: AskJob): boolean {
  return job.inlineDraft?.status === "created" || job.inlineDraft?.status === "existing-live-draft";
}

export function uniqueJobsById(jobs: AskJob[]): AskJob[] {
  const byId = new Map<string, AskJob>();
  for (const job of jobs) {
    const existing = byId.get(job.id);
    if (!existing || existing.updated <= job.updated) {
      byId.set(job.id, job);
    }
  }
  return Array.from(byId.values());
}
