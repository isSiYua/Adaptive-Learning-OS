import { yearMonthSlug } from "../utils/dates";
import { FileStore } from "./FileStore";
import type { AskCardLogRecord, AskCardRecord, SelectionContext } from "../types";

export class AskCardStore {
  constructor(private fileStore: FileStore, private dataFolder: string) {}

  async readRecord(id: string): Promise<AskCardRecord | null> {
    return this.fileStore.readJson<AskCardRecord>(this.recordPath(id));
  }

  async writeRecord(record: AskCardRecord): Promise<void> {
    await this.fileStore.writeJson(this.recordPath(record.id), record);
  }

  async saveCreatedRecord(record: AskCardRecord, context: SelectionContext): Promise<void> {
    await this.writeRecord(record);
    await this.logAskCard(record, context, "created");
  }

  async saveFollowUpRecord(record: AskCardRecord, context: SelectionContext): Promise<void> {
    await this.writeRecord(record);
    await this.logAskCard(record, context, "follow-up");
  }

  async saveLegacyConvertedRecord(record: AskCardRecord, context: SelectionContext): Promise<void> {
    await this.writeRecord(record);
    await this.logAskCard(record, context, "legacy-converted");
  }

  async logAskCard(
    askRecord: AskCardRecord,
    context: SelectionContext,
    type: AskCardLogRecord["type"]
  ): Promise<void> {
    const logRecord: AskCardLogRecord = {
      schemaVersion: 1,
      id: askRecord.id,
      created: type === "created" || type === "legacy-converted" ? askRecord.created : undefined,
      updated: askRecord.updated,
      notePath: context.notePath,
      concept: askRecord.concept,
      sourceSentence: askRecord.sourceSentence,
      question: askRecord.question,
      myTakeaway: askRecord.myTakeaway,
      masterySignal: askRecord.masterySignal,
      reviewNeeded: askRecord.reviewNeeded,
      type,
    };

    await this.fileStore.appendJsonl(
      `${this.dataFolder}/logs/ask-cards-${yearMonthSlug()}.jsonl`,
      logRecord
    );
  }

  private recordPath(id: string): string {
    return `${this.dataFolder}/ask-cards/${id}.json`;
  }
}
