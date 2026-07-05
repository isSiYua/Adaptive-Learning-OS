import assert from "node:assert/strict";
import test from "node:test";
import { KnowledgeDb } from "../src/knowledge/KnowledgeDb.ts";
import { KnowledgeRepository } from "../src/knowledge/KnowledgeRepository.ts";
import { conceptIdFromName, conceptNameFromTitle } from "../src/knowledge/ConceptNormalize.ts";
import { rebuildKnowledgeIndex } from "../src/knowledge/KnowledgeIndexer.ts";
import { exportKnowledgeSummary } from "../src/knowledge/KnowledgeExport.ts";
import { backupKnowledgeDb } from "../src/knowledge/KnowledgeBackup.ts";

test("KnowledgeData DB initializes schema and meta idempotently", async () => {
  const db = await KnowledgeDb.fromBytes();
  assert.equal(db.getMeta("schema_version"), "1");
  for (const table of ["concepts", "items", "evidence", "source_refs", "concept_edges", "meta"]) {
    const row = db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]);
    assert.equal(row?.name, table);
  }
  const bytes = db.exportBytes();
  db.close();

  const reopened = await KnowledgeDb.fromBytes(bytes);
  assert.equal(reopened.getMeta("schema_version"), "1");
  reopened.close();
});

test("KnowledgeRepository upserts concepts, items, evidence, and aliases", async () => {
  const db = await KnowledgeDb.fromBytes();
  const repo = new KnowledgeRepository(db);
  const concept = repo.upsertConcept({
    name: "NMS",
    aliases: ["Non-Maximum Suppression"],
    coverage: 0.2,
    mastery: 0,
    confidence: 0.3,
  });
  const again = repo.upsertConcept({ id: concept.id, name: "NMS", coverage: 0.5, confidence: 0.4 });
  assert.equal(again.created, false);

  repo.upsertItem({
    itemId: "item-nms",
    containerId: "clar-nms",
    containerType: "clarification",
    notePath: "CV.md",
    title: "NMS",
    contentHash: "hash-a",
    contentSummary: "NMS removes overlapping boxes.",
    conceptIds: [concept.id],
    status: "active",
  });
  const itemUpdate = repo.upsertItem({
    itemId: "item-nms",
    containerId: "clar-nms",
    containerType: "clarification",
    notePath: "CV.md",
    title: "NMS",
    contentHash: "hash-b",
    contentSummary: "NMS keeps the best box and suppresses overlaps.",
    conceptIds: [concept.id],
    status: "active",
  });
  assert.equal(itemUpdate.contentChanged, true);

  repo.insertEvidence({
    conceptId: concept.id,
    sourceType: "rebuild",
    signalType: "coverage",
    summary: "Indexed from a live item.",
    itemId: "item-nms",
  });
  assert.equal(repo.counts().concepts, 1);
  assert.equal(repo.counts().items, 1);
  assert.equal(repo.counts().evidence, 1);
  assert.deepEqual(repo.listConcepts()[0].aliases, ["Non-Maximum Suppression"]);
  db.close();
});

test("concept normalization keeps local IDs safe without pretending to translate", () => {
  assert.equal(conceptNameFromTitle("梯度是啥？"), "梯度");
  assert.match(conceptIdFromName("梯度"), /^concept-/);
  assert.match(conceptIdFromName("Object Detection"), /^object-detection-/);
});

test("rebuild indexes Learning OS items, detects manual edits and missing items", async () => {
  const db = await KnowledgeDb.fromBytes();
  const firstNote = `# CV

> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-nms -->
>
> <!-- learnos-item-id: item-nms -->
> **NMS** Non-maximum suppression removes overlapping boxes.`;

  let summary = rebuildKnowledgeIndex(db, {
    markdownFiles: [{ path: "CV.md", content: firstNote }],
    askJobs: [
      {
        schemaVersion: 1,
        id: "ask-1",
        status: "applied",
        created: "2026-07-04T00:00:00+02:00",
        updated: "2026-07-04T00:00:00+02:00",
        notePath: "CV.md",
        headingPath: [],
        selectedText: "NMS",
        sourceBlock: "",
        sourceBlockHash: "abc",
        targetItemId: "item-nms",
        userQuestion: "Why does NMS suppress boxes?",
        answerLanguage: "en",
        uiLanguage: "en",
        providerMode: "manual",
        prompt: "",
      },
    ],
  });
  assert.equal(summary.indexedItems, 1);
  assert.equal(summary.concepts, 1);
  assert.equal(summary.askEvidence, 1);

  const editedNote = firstNote.replace("removes overlapping boxes", "keeps the best box and suppresses overlaps");
  summary = rebuildKnowledgeIndex(db, { markdownFiles: [{ path: "CV.md", content: editedNote }] });
  assert.equal(summary.manualEdits, 1);

  summary = rebuildKnowledgeIndex(db, { markdownFiles: [{ path: "CV.md", content: "# CV\n\nNo Learning OS item." }] });
  assert.equal(summary.missingItems, 1);
  db.close();
});

test("export and backup write KnowledgeData artifacts", async () => {
  const db = await KnowledgeDb.fromBytes();
  const repo = new KnowledgeRepository(db);
  const concept = repo.upsertConcept({ name: "YOLOv3", coverage: 0.2, confidence: 0.3 });
  repo.upsertItem({
    itemId: "item-yolo",
    title: "YOLOv3",
    contentHash: "hash-y",
    conceptIds: [concept.id],
    status: "active",
  });

  const fileStore = new MemoryFileStore();
  const exportSummary = await exportKnowledgeSummary(db, fileStore, ".learning-os");
  assert.equal(exportSummary.counts.concepts, 1);
  assert.match(fileStore.text.get(".learning-os/knowledge/exports/concepts.json"), /YOLOv3/);
  assert.match(fileStore.text.get(".learning-os/knowledge/exports/mastery_summary.md"), /KnowledgeData Summary/);

  await fileStore.writeBinary(".learning-os/knowledge/knowledge.sqlite", bytesToArrayBuffer(db.exportBytes()));
  const backupPath = await backupKnowledgeDb(fileStore, ".learning-os");
  assert.match(backupPath, /^\.learning-os\/knowledge\/backups\/knowledge-\d{8}-\d{6}\.sqlite$/);
  assert.equal(fileStore.binary.has(backupPath), true);
  db.close();
});

class MemoryFileStore {
  text = new Map();
  binary = new Map();

  async ensureKnowledgeFolders() {}
  async ensureDataFolders() {}

  async exists(path) {
    return this.text.has(path) || this.binary.has(path);
  }

  async readBinary(path) {
    return this.binary.get(path) ?? null;
  }

  async writeBinary(path, content) {
    this.binary.set(path, content);
  }

  async copyFile(fromPath, toPath) {
    const content = await this.readBinary(fromPath);
    if (content) await this.writeBinary(toPath, content);
  }

  async writeJson(path, record) {
    this.text.set(path, `${JSON.stringify(record, null, 2)}\n`);
  }

  async writeText(path, content) {
    this.text.set(path, content);
  }
}

function bytesToArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
