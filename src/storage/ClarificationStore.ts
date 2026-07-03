import { yearMonthSlug } from "../utils/dates";
import { stableHash } from "../utils/hash";
import { FileStore } from "./FileStore";
import type { ClarificationLogRecord, ClarificationRecord } from "../types";

export class ClarificationStore {
  constructor(private fileStore: FileStore, private dataFolder: string) {}

  async readRecord(id: string): Promise<ClarificationRecord | null> {
    return this.fileStore.readJson<ClarificationRecord>(this.recordPath(id));
  }

  async listRecords(): Promise<ClarificationRecord[]> {
    const files = await this.fileStore.listFiles(`${this.dataFolder}/clarifications`);
    const records: ClarificationRecord[] = [];
    for (const file of files.filter((path) => path.endsWith(".json"))) {
      const record = await this.fileStore.readJson<ClarificationRecord>(file);
      if (record) records.push(record);
    }
    return records;
  }

  async findByNotePathAndSourceHash(
    notePath: string,
    sourceBlockHash: string
  ): Promise<ClarificationRecord | null> {
    const records = await this.listRecords();
    return (
      records.find(
        (record) => record.notePath === notePath && record.sourceBlockHash === sourceBlockHash
      ) ?? null
    );
  }

  async saveRecord(
    record: ClarificationRecord,
    type: ClarificationLogRecord["type"]
  ): Promise<void> {
    const previous = await this.readRecord(record.id);
    const normalized = normalizeClarificationRecord(record, previous);
    await this.fileStore.writeJson(this.recordPath(record.id), normalized);
    await this.fileStore.appendJsonl(`${this.dataFolder}/logs/clarifications-${yearMonthSlug()}.jsonl`, {
      schemaVersion: 1,
      id: normalized.id,
      updated: normalized.updated,
      notePath: normalized.notePath,
      sourceBlockHash: normalized.sourceBlockHash,
      itemCount: normalized.items.length,
      interactionCount: normalized.interactions.length,
      type,
    } satisfies ClarificationLogRecord);
  }

  private recordPath(id: string): string {
    return `${this.dataFolder}/clarifications/${id}.json`;
  }

  recordPathForId(id: string): string {
    return this.recordPath(id);
  }
}

export function clarificationContentHash(record: Pick<ClarificationRecord, "items">): string {
  return stableHash(
    JSON.stringify(
      record.items.map((item) => ({
        id: item.id,
        targetText: item.targetText,
        itemTitle: item.itemTitle,
        question: item.question,
        explanation: item.explanation,
      }))
    )
  );
}

function normalizeClarificationRecord(
  record: ClarificationRecord,
  previous: ClarificationRecord | null
): ClarificationRecord {
  const contentHash = clarificationContentHash(record);
  const previousRevision = previous?.revision ?? 0;
  const previousHash = previous?.contentHash ?? "";
  const revision =
    previous && previousHash === contentHash ? previousRevision || 1 : Math.max(1, previousRevision + 1);

  return {
    ...record,
    revision,
    contentHash,
  };
}
