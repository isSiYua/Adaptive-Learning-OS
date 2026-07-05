import { Notice, type App } from "obsidian";
import { backupKnowledgeDb } from "./KnowledgeBackup";
import { KnowledgeDb, saveKnowledgeDb } from "./KnowledgeDb";
import { exportKnowledgeSummary } from "./KnowledgeExport";
import { rebuildKnowledgeIndex } from "./KnowledgeIndexer";
import { KnowledgeRepository } from "./KnowledgeRepository";
import { formatKnowledgeDataGlobalSummary } from "./KnowledgeSummaryFormat";
import type { FileStore } from "../storage/FileStore";
import type { AskJob } from "../types";

export interface KnowledgeCommandContext {
  app: App;
  fileStore: FileStore;
  dataFolder: string;
  listAskJobs: () => Promise<AskJob[]>;
}

export async function initializeKnowledgeData(context: KnowledgeCommandContext): Promise<void> {
  const db = await KnowledgeDb.fromFileStore(context.fileStore, context.dataFolder);
  await saveKnowledgeDb(context.fileStore, context.dataFolder, db);
  db.close();
  new Notice("Learning OS KnowledgeData initialized.");
}

export async function rebuildKnowledgeDataIndex(context: KnowledgeCommandContext): Promise<void> {
  const db = await KnowledgeDb.fromFileStore(context.fileStore, context.dataFolder);
  const markdownFiles = await Promise.all(
    context.app.vault.getMarkdownFiles().map(async (file) => ({
      path: file.path,
      content: await context.app.vault.read(file),
    }))
  );
  const summary = rebuildKnowledgeIndex(db, {
    markdownFiles,
    askJobs: await context.listAskJobs(),
  });
  await saveKnowledgeDb(context.fileStore, context.dataFolder, db);
  db.close();
  new Notice(
    `KnowledgeData rebuilt: ${summary.indexedItems} item(s), ${summary.concepts} concept(s), ${summary.evidence} evidence record(s).`
  );
}

export async function exportKnowledgeDataSummary(context: KnowledgeCommandContext): Promise<void> {
  const db = await KnowledgeDb.fromFileStore(context.fileStore, context.dataFolder);
  const summary = await exportKnowledgeSummary(db, context.fileStore, context.dataFolder);
  await saveKnowledgeDb(context.fileStore, context.dataFolder, db);
  db.close();
  new Notice(`KnowledgeData exported: ${summary.counts.concepts} concept(s).`);
}

export async function backupKnowledgeData(context: KnowledgeCommandContext): Promise<void> {
  const backupPath = await backupKnowledgeDb(context.fileStore, context.dataFolder);
  new Notice(`KnowledgeData backup created: ${backupPath}`);
}

export async function showKnowledgeDataSummary(context: KnowledgeCommandContext): Promise<void> {
  const db = await KnowledgeDb.fromFileStore(context.fileStore, context.dataFolder);
  const repo = new KnowledgeRepository(db);
  const counts = repo.counts();
  const itemCounts = repo.itemStatusCounts();
  const latestEvidence = repo.latestEvidence(5);
  const lastRebuild = db.getMeta("last_rebuild_at") ?? "never";
  const lastAutoSync = db.getMeta("last_auto_sync_at") ?? "never";
  db.close();

  new Notice(
    formatKnowledgeDataGlobalSummary({
      counts,
      itemCounts,
      lastRebuild,
      lastAutoSync,
      latestEvidence,
    }),
    12000
  );
}
