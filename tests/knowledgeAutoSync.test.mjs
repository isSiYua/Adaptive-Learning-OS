import assert from "node:assert/strict";
import test from "node:test";
import { findAllInlineDraftBlocks } from "../src/ask/InlineDraftBlock.ts";
import { KnowledgeDb, saveKnowledgeDb } from "../src/knowledge/KnowledgeDb.ts";
import { scanLearningOsItemsInNote } from "../src/knowledge/KnowledgeMarkdownScanner.ts";
import { KnowledgeRepository } from "../src/knowledge/KnowledgeRepository.ts";
import { formatKnowledgeDataGlobalSummary } from "../src/knowledge/KnowledgeSummaryFormat.ts";
import {
  KnowledgeNoteSyncDebouncer,
  noteHasFinalLearningOsMarkers,
  syncKnowledgeDataForNote,
} from "../src/knowledge/KnowledgeSync.ts";

test("KnowledgeData auto init creates and reopens the SQLite store", async () => {
  const fileStore = new MemoryFileStore();
  const db = await KnowledgeDb.fromFileStore(fileStore, ".learning-os");
  await saveKnowledgeDb(fileStore, ".learning-os", db);
  db.close();

  assert.equal(fileStore.binary.has(".learning-os/knowledge/knowledge.sqlite"), true);
  const reopened = await KnowledgeDb.fromFileStore(fileStore, ".learning-os");
  assert.equal(reopened.getMeta("schema_version"), "1");
  reopened.close();
});

test("sync after Apply upserts live item, concept, source refs, apply evidence, and ask evidence", async () => {
  const db = await KnowledgeDb.fromBytes();
  const summary = syncKnowledgeDataForNote(db, {
    notePath: "CV.md",
    markdown: noteWithItems([
      ["item-nms", "NMS", "Non-maximum suppression removes overlapping boxes."],
    ]),
    mode: "apply",
    appliedItemIds: ["item-nms"],
    askJobs: [askJob({ id: "ask-nms", notePath: "CV.md", appliedItemIds: ["item-nms"] })],
    now: "2026-07-05T12:00:00+02:00",
  });

  assert.equal(summary.skipped, false);
  assert.equal(summary.indexedItems, 1);
  assert.equal(summary.createdConcepts, 1);
  assert.equal(summary.items, 1);
  assert.equal(summary.applyEvidence, 1);
  assert.equal(summary.askEvidence, 1);
  assert.equal(summary.sourceRefs, 3);
  assert.equal(db.get("SELECT COUNT(*) AS count FROM evidence WHERE source_type = 'apply'")?.count, 1);
  assert.equal(db.get("SELECT COUNT(*) AS count FROM evidence WHERE source_type = 'ask'")?.count, 1);
  assert.equal(db.getMeta("last_auto_sync_mode"), "apply");
  db.close();
});

test("KnowledgeData note sync debounce coalesces repeated note modify events", async () => {
  let calls = 0;
  const debouncer = new KnowledgeNoteSyncDebouncer({
    delayMs: 10,
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    cancel: (timer) => clearTimeout(timer),
  });

  debouncer.queue("CV.md", () => {
    calls += 1;
  });
  debouncer.queue("CV.md", () => {
    calls += 1;
  });

  await sleep(40);
  assert.equal(calls, 1);
});

test("debounced note-level sync records manual edit hash changes", async () => {
  const db = await KnowledgeDb.fromBytes();
  const first = noteWithItems([["item-nms", "NMS", "NMS removes overlapping boxes."]]);
  syncKnowledgeDataForNote(db, {
    notePath: "CV.md",
    markdown: first,
    mode: "apply",
    appliedItemIds: ["item-nms"],
    now: "2026-07-05T12:00:00+02:00",
  });

  const edited = noteWithItems([["item-nms", "NMS", "NMS keeps the best box and suppresses overlaps."]]);
  const summary = syncKnowledgeDataForNote(db, {
    notePath: "CV.md",
    markdown: edited,
    mode: "note-modify",
    trackManualEdits: true,
    now: "2026-07-05T12:01:00+02:00",
  });

  assert.equal(summary.manualEdits, 1);
  assert.equal(db.get("SELECT COUNT(*) AS count FROM evidence WHERE source_type = 'manual_edit'")?.count, 1);
  const item = new KnowledgeRepository(db).getItem("item-nms");
  assert.ok(item?.contentHash);
  db.close();
});

test("debounced note-level sync marks missing known markers only within the modified note", async () => {
  const db = await KnowledgeDb.fromBytes();
  syncKnowledgeDataForNote(db, {
    notePath: "CV.md",
    markdown: noteWithItems([
      ["item-nms", "NMS", "NMS removes overlaps."],
      ["item-yolo", "YOLO", "YOLO predicts boxes in one pass."],
    ]),
    mode: "apply",
    appliedItemIds: ["item-nms", "item-yolo"],
    now: "2026-07-05T12:00:00+02:00",
  });
  syncKnowledgeDataForNote(db, {
    notePath: "Other.md",
    markdown: noteWithItems([["item-rl", "RL", "RL learns from rewards."]]),
    mode: "apply",
    appliedItemIds: ["item-rl"],
    now: "2026-07-05T12:00:00+02:00",
  });

  const summary = syncKnowledgeDataForNote(db, {
    notePath: "CV.md",
    markdown: noteWithItems([["item-nms", "NMS", "NMS removes overlaps."]]),
    mode: "note-modify",
    now: "2026-07-05T12:02:00+02:00",
  });

  assert.equal(summary.missingItemsMarked, 1);
  assert.equal(new KnowledgeRepository(db).getItem("item-yolo")?.status, "missing");
  assert.equal(new KnowledgeRepository(db).getItem("item-rl")?.status, "active");
  assert.equal(db.get("SELECT COUNT(*) AS count FROM evidence WHERE source_type = 'delete'")?.count, 1);
  db.close();
});

test("note-level sync skips notes without final Learning OS markers", async () => {
  const db = await KnowledgeDb.fromBytes();
  const summary = syncKnowledgeDataForNote(db, {
    notePath: "Plain.md",
    markdown: "# Plain\n\nNo markers here.",
    mode: "note-modify",
  });

  assert.equal(summary.skipped, true);
  assert.equal(summary.reason, "no-final-learning-os-markers");
  assert.equal(summary.items, 0);
  db.close();
});

test("inline draft parser reads draft blocks and KnowledgeData ignores them", () => {
  const markdown = `# Draft note

> [!warning]- Learning OS pending draft
> <!-- learnos-draft-id: draft-1 -->
> <!-- learnos-draft-job-id: ask-1 -->
> <!-- learnos-draft-kind: clarification -->
>
> <!-- learnos-draft-item-id: draft-item-1 -->
> **Draft NMS** Pending explanation.`;

  const drafts = findAllInlineDraftBlocks(markdown);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].draftId, "draft-1");
  assert.equal(drafts[0].jobId, "ask-1");
  assert.equal(drafts[0].items[0].title, "Draft NMS");
  assert.equal(noteHasFinalLearningOsMarkers(markdown), false);
  assert.equal(scanLearningOsItemsInNote("Draft.md", markdown).length, 0);
});

test("KnowledgeData global summary wording distinguishes total, active, missing, and latest evidence", () => {
  const summary = formatKnowledgeDataGlobalSummary({
    counts: {
      concepts: 21,
      items: 26,
      evidence: 91,
      sourceRefs: 60,
      missingItems: 2,
    },
    itemCounts: {
      total: 26,
      active: 24,
      missingDeleted: 2,
    },
    lastRebuild: "2026-07-05T00:10:57+02:00",
    lastAutoSync: "2026-07-05T01:13:27+02:00",
    latestEvidence: [
      evidence({ sourceType: "manual_note", signalType: "coverage", itemId: "item-a", summary: "Concept appears in a live Learning OS item in 测试.md." }),
      evidence({ sourceType: "apply", signalType: "coverage", itemId: "item-b", summary: "User applied a Learning OS item into 测试.md." }),
      evidence({ sourceType: "ask", signalType: "confusion", itemId: "item-b", summary: "这是哈" }),
    ],
  });

  assert.match(summary, /KnowledgeData Global Summary/);
  assert.match(summary, /Scope: whole vault\/project/);
  assert.match(summary, /Total indexed items: 26/);
  assert.match(summary, /Active items: 24/);
  assert.match(summary, /Missing\/deleted items: 2/);
  assert.match(summary, /1\. manual_note\/coverage - item-a/);
  assert.match(summary, /2\. apply\/coverage - item-b/);
  assert.match(summary, /3\. ask\/confusion - item-b/);
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
}

function noteWithItems(items) {
  return `# CV

> [!tip]- My understanding
> <!-- learnos-clarification-id: clar-cv -->
>
${items
  .map(([id, title, content]) => `> <!-- learnos-item-id: ${id} -->\n> **${title}** ${content}`)
  .join("\n>\n")}`;
}

function askJob(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "ask-1",
    status: "applied",
    created: "2026-07-05T12:00:00+02:00",
    updated: "2026-07-05T12:00:00+02:00",
    notePath: "CV.md",
    headingPath: [],
    selectedText: "NMS",
    sourceBlock: "",
    sourceBlockHash: "source-hash",
    targetItemId: "item-nms",
    userQuestion: "Why does this matter?",
    answerLanguage: "en",
    uiLanguage: "en",
    providerMode: "manual",
    prompt: "",
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    id: "ev-test",
    sourceType: "manual_note",
    signalType: "coverage",
    summary: "Test evidence.",
    createdAt: "2026-07-05T01:13:27+02:00",
    ...overrides,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
