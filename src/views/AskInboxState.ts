import type { AskJob, AskJobStatus } from "../types";

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

export const INBOX_TABS: InboxTab[] = [
  { id: "running", statuses: ["running", "queued"], zh: "处理中", en: "Running" },
  { id: "ready", statuses: ["completed"], zh: "待处理", en: "Ready" },
  { id: "failed", statuses: ["failed"], zh: "失败", en: "Failed" },
  { id: "history", statuses: ["applied", "archived", "cancelled"], zh: "历史记录", en: "History" },
];

export function jobsForGroup(jobs: AskJob[], group: InboxStatusGroup): AskJob[] {
  return jobs.filter((job) => group.statuses.includes(job.status));
}

export function jobsForTab(jobs: AskJob[], tabId: InboxTabId): AskJob[] {
  const tab = INBOX_TABS.find((item) => item.id === tabId);
  if (!tab) return [];
  return sortJobsForTab(
    jobs.filter((job) => tab.statuses.includes(job.status)),
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
  return jobs.filter((job) => job.status === "completed");
}

export function activeJobs(jobs: AskJob[]): AskJob[] {
  return jobs.filter((job) => isActiveStatus(job.status));
}

export function historyJobs(jobs: AskJob[]): AskJob[] {
  return jobs.filter((job) => isHistoryStatus(job.status));
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
