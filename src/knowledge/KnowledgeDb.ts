import initSqlJs from "sql.js/dist/sql-asm.js";
import { runKnowledgeMigrations } from "./KnowledgeMigrations";
import { KNOWLEDGE_SCHEMA_VERSION } from "./KnowledgeTypes";
import { toLocalIsoString } from "../utils/dates";
import type { FileStore } from "../storage/FileStore";
import type { BindParams, Database, SqlJsStatic, SqlValue } from "sql.js";

export const KNOWLEDGE_DB_RELATIVE_PATH = "knowledge/knowledge.sqlite";

let sqlModulePromise: Promise<SqlJsStatic> | null = null;

export class KnowledgeDb {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  static async fromBytes(bytes?: Uint8Array | null): Promise<KnowledgeDb> {
    const SQL = await loadSqlModule();
    const db = new KnowledgeDb(bytes && bytes.byteLength > 0 ? new SQL.Database(bytes) : new SQL.Database());
    runKnowledgeMigrations(db);
    return db;
  }

  static async fromFileStore(fileStore: FileStore, dataFolder: string): Promise<KnowledgeDb> {
    await fileStore.ensureKnowledgeFolders();
    const content = await fileStore.readBinary(knowledgeDbPath(dataFolder));
    return KnowledgeDb.fromBytes(content ? new Uint8Array(content) : null);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params?: BindParams): void {
    this.db.run(sql, params);
  }

  query<T extends Record<string, SqlValue>>(sql: string, params?: BindParams): T[] {
    const statement = this.db.prepare(sql);
    try {
      if (params) statement.bind(params);
      const rows: T[] = [];
      while (statement.step()) {
        rows.push(statement.getAsObject() as T);
      }
      return rows;
    } finally {
      statement.free();
    }
  }

  get<T extends Record<string, SqlValue>>(sql: string, params?: BindParams): T | null {
    return this.query<T>(sql, params)[0] ?? null;
  }

  getMeta(key: string): string | null {
    const row = this.get<{ value: string }>("SELECT value FROM meta WHERE key = ?", [key]);
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.run(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value]
    );
  }

  touchMeta(): void {
    this.setMeta("schema_version", String(KNOWLEDGE_SCHEMA_VERSION));
    this.setMeta("updated_at", toLocalIsoString());
  }

  exportBytes(): Uint8Array {
    return this.db.export();
  }

  close(): void {
    this.db.close();
  }
}

export async function saveKnowledgeDb(fileStore: FileStore, dataFolder: string, db: KnowledgeDb): Promise<void> {
  db.touchMeta();
  const bytes = db.exportBytes();
  const content = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(content).set(bytes);
  await fileStore.writeBinary(knowledgeDbPath(dataFolder), content);
}

export function knowledgeDbPath(dataFolder: string): string {
  return `${dataFolder}/${KNOWLEDGE_DB_RELATIVE_PATH}`;
}

async function loadSqlModule(): Promise<SqlJsStatic> {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs();
  }
  return sqlModulePromise;
}
