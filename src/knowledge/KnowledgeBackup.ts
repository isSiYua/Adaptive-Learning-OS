import { KnowledgeDb, knowledgeDbPath, saveKnowledgeDb } from "./KnowledgeDb";
import { timestampSlug } from "../utils/dates";
import type { FileStore } from "../storage/FileStore";

export async function backupKnowledgeDb(fileStore: FileStore, dataFolder: string): Promise<string> {
  await fileStore.ensureKnowledgeFolders();
  if (!(await fileStore.exists(knowledgeDbPath(dataFolder)))) {
    const db = await KnowledgeDb.fromFileStore(fileStore, dataFolder);
    await saveKnowledgeDb(fileStore, dataFolder, db);
    db.close();
  }

  const backupPath = `${dataFolder}/knowledge/backups/knowledge-${timestampSlug()}.sqlite`;
  await fileStore.copyFile(knowledgeDbPath(dataFolder), backupPath);
  return backupPath;
}
