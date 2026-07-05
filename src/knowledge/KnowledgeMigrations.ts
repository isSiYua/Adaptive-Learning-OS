import { bootstrapKnowledgeSchema } from "./KnowledgeSchema";
import { KNOWLEDGE_SCHEMA_VERSION } from "./KnowledgeTypes";
import type { KnowledgeDb } from "./KnowledgeDb";

export function runKnowledgeMigrations(db: KnowledgeDb): void {
  const hasMetaTable = db.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'") !== null;
  const currentVersion = hasMetaTable ? Number(db.getMeta("schema_version") ?? 0) : 0;
  if (currentVersion > KNOWLEDGE_SCHEMA_VERSION) {
    throw new Error(`KnowledgeData schema ${currentVersion} is newer than this plugin supports.`);
  }

  if (currentVersion < 1) {
    bootstrapKnowledgeSchema(db);
    return;
  }

  bootstrapKnowledgeSchema(db);
}
