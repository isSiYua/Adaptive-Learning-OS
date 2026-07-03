import { yearMonthSlug } from "../utils/dates";
import type { FileStore } from "./FileStore";
import type { AskJob, AskJobLogRecord, AskJobStatus } from "../types";

export class AskJobStore {
  private fileStore: FileStore;
  private dataFolder: string;

  constructor(fileStore: FileStore, dataFolder: string) {
    this.fileStore = fileStore;
    this.dataFolder = dataFolder;
  }

  async readJob(id: string): Promise<AskJob | null> {
    return this.fileStore.readJson<AskJob>(this.jobPath(id));
  }

  async listJobs(): Promise<AskJob[]> {
    const files = await this.fileStore.listFiles(`${this.dataFolder}/ask-jobs`);
    const jobs: AskJob[] = [];
    for (const file of files.filter((path) => path.endsWith(".json"))) {
      const job = await this.fileStore.readJson<AskJob>(file);
      if (job) jobs.push(job);
    }
    return jobs.sort((a, b) => b.updated.localeCompare(a.updated));
  }

  async saveJob(job: AskJob, type: AskJobLogRecord["type"] = "status"): Promise<void> {
    await this.fileStore.writeJson(this.jobPath(job.id), job);
    await this.fileStore.appendJsonl(`${this.dataFolder}/logs/ask-jobs-${yearMonthSlug()}.jsonl`, {
      schemaVersion: 1,
      id: job.id,
      status: job.status,
      updated: job.updated,
      notePath: job.notePath,
      sourceBlockHash: job.sourceBlockHash,
      type,
    } satisfies AskJobLogRecord);
  }

  async updateStatus(
    job: AskJob,
    status: AskJobStatus,
    updated: string,
    type: AskJobLogRecord["type"] = "status"
  ): Promise<AskJob> {
    const next = { ...job, status, updated };
    await this.saveJob(next, type);
    return next;
  }

  async deleteJob(id: string): Promise<void> {
    await this.fileStore.deleteFile(this.jobPath(id));
  }

  jobPath(id: string): string {
    return `${this.dataFolder}/ask-jobs/${id}.json`;
  }
}
