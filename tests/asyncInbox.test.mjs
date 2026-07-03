import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildClarificationBlock } from "../src/ask/ClarificationBlock.ts";
import {
  buildClarificationRebasePrompt,
  createFallbackMergeProposal,
  parseClarificationMergeProposal,
  proposalPreviewMarkdown,
  recordFromMergeProposal,
} from "../src/ask/ClarificationMergeProposal.ts";
import { applyClarificationMarkdown, detectStaleProposal } from "../src/jobs/ApplyAskJobProposal.ts";
import { AskJobStore } from "../src/storage/AskJobStore.ts";
import {
  buildOrphanCleanupPlan,
  cleanupJobsForArchive,
  cleanupJobsForDelete,
  extractLiveClarificationIds,
} from "../src/cleanup/OrphanCleanup.ts";
import {
  actionSetForJob,
  emptyStateKind,
  historyJobs,
  jobsForGroup,
  jobsForTab,
  nextJobIdInTab,
  nextReadyJobIdAfterApply,
  readyCount,
  resolveSelectedJobId,
  resolveSelectedJobIdForTab,
  tabCounts,
  INBOX_STATUS_GROUPS,
} from "../src/views/AskInboxState.ts";

const settings = {
  uiLanguage: "zh",
  answerLanguage: "auto",
};

const job = {
  schemaVersion: 1,
  id: "job-20260703-120000-abc123",
  status: "completed",
  created: "2026-07-03T12:00:00+02:00",
  updated: "2026-07-03T12:01:00+02:00",
  notePath: "Stats/LOOCV.md",
  headingPath: ["Resampling", "LOOCV"],
  selectedText: "unbiased estimate",
  sourceBlock:
    "$MSE_{1}$ provides an approximately unbiased estimate for the test error. It is a poor estimate because it is highly variable.",
  sourceBlockHash: "hash-source",
  sourceStartOffset: 14,
  sourceEndOffset: 139,
  detectedConcept: "loocv",
  userQuestion: "为什么叫无偏估计？",
  answerLanguage: "auto",
  uiLanguage: "zh",
  providerMode: "openai-compatible",
  providerPreset: "openai",
  model: "gpt-4.1-mini",
  prompt: "prompt",
  rawAnswer: "raw answer",
  parsedAnswer: {
    answer: "raw answer",
    key_answer: "key",
    suggested_takeaway: "takeaway",
    mastery_signal: "weak",
    review_needed: true,
  },
};

const existingRecord = {
  schemaVersion: 1,
  id: "clar-20260703-loocv",
  notePath: "Stats/LOOCV.md",
  sourceBlock: job.sourceBlock,
  sourceBlockHash: "hash-source",
  sourceStartOffset: 14,
  sourceEndOffset: 139,
  headingPath: ["Resampling", "LOOCV"],
  detectedConcept: "loocv",
  language: "auto",
  uiLanguage: "zh",
  created: "2026-07-03T12:00:00+02:00",
  updated: "2026-07-03T12:00:00+02:00",
  items: [
    {
      id: "item-unbiased",
      targetText: "unbiased estimate",
      itemTitle: "为什么叫无偏？",
      question: "为什么叫无偏估计？",
      explanation: "旧解释保留。",
      created: "2026-07-03T12:00:00+02:00",
      updated: "2026-07-03T12:00:00+02:00",
      relatedInteractionIds: ["ask-old"],
    },
  ],
  interactions: [],
};

test("AskJobStore persists queued running completed failed applied and archived jobs", async () => {
  const fileStore = new MemoryFileStore();
  const store = new AskJobStore(fileStore, ".learning-os");

  await store.saveJob({ ...job, status: "queued" }, "created");
  let jobs = await store.listJobs();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, "queued");

  const running = await store.updateStatus(jobs[0], "running", "2026-07-03T12:01:00+02:00");
  const completed = await store.updateStatus(running, "completed", "2026-07-03T12:02:00+02:00", "completed");
  const failed = await store.updateStatus(completed, "failed", "2026-07-03T12:03:00+02:00", "failed");
  const applied = await store.updateStatus(failed, "applied", "2026-07-03T12:04:00+02:00", "applied");
  await store.updateStatus(applied, "archived", "2026-07-03T12:05:00+02:00", "archived");

  jobs = await store.listJobs();
  assert.equal(jobs[0].status, "archived");
  assert.equal(fileStore.jsonl.length, 6);
});

test("merge proposal parser supports update item and preview markdown uses clarification marker", () => {
  const proposal = parseClarificationMergeProposal(`{
    "action": "update-item",
    "target_item_id": "item-unbiased",
    "proposed_items": [
      {
        "id": "item-unbiased",
        "targetText": "unbiased estimate",
        "itemTitle": "为什么叫无偏？",
        "question": "为什么叫无偏估计？",
        "explanation": "新解释合并旧内容。"
      }
    ],
    "proposed_visible_markdown": "> **为什么叫无偏？** 新解释合并旧内容。",
    "reasoning": "same term",
    "confidence": "high"
  }`);

  assert.equal(proposal?.action, "update-item");
  assert.equal(proposal?.targetItemId, "item-unbiased");

  const preview = proposalPreviewMarkdown({
    job: { ...job, existingClarificationId: existingRecord.id },
    proposal,
    existingRecord,
    settings,
  });
  assert.match(preview, /%% learnos-clarification-id: clar-20260703-loocv %%/);
  assert.equal(preview.includes("learnos-ask-id"), false);
});

test("fallback proposal adds a new item for existing clarification", () => {
  const proposal = createFallbackMergeProposal({
    job: { ...job, selectedText: "highly variable", userQuestion: "为什么 highly variable？" },
    existingRecord,
    explanation: "因为只基于一个 validation observation。",
    nowIso: "2026-07-03T12:02:00+02:00",
  });

  const record = recordFromMergeProposal({
    job,
    proposal,
    existingRecord,
    settings,
    nowIso: "2026-07-03T12:03:00+02:00",
  });

  assert.equal(record.items.length, 2);
  assert.equal(record.items[0].explanation, "旧解释保留。");
  assert.match(record.items[1].explanation, /validation observation/);
});

test("applyClarificationMarkdown inserts a new reviewed proposal below the source paragraph", () => {
  const proposal = createFallbackMergeProposal({
    job,
    existingRecord: null,
    explanation: "无偏表示平均上不会系统性高估或低估 test error。",
    nowIso: "2026-07-03T12:02:00+02:00",
  });
  const record = recordFromMergeProposal({
    job,
    proposal,
    existingRecord: null,
    settings,
    nowIso: "2026-07-03T12:03:00+02:00",
  });
  const markdown = `# Resampling\n\n${job.sourceBlock}\n\nNext paragraph.`;
  const visible = buildClarificationBlock(record, settings);

  const result = applyClarificationMarkdown(markdown, job, record, visible);

  assert.equal(result.appliedAs, "created");
  assert.match(result.markdown, /learnos-clarification-id: clar-/);
  assert.match(result.markdown, /%%\n\nNext paragraph\./);
});

test("applyClarificationMarkdown updates existing block without duplicate marker", () => {
  const visibleOld = buildClarificationBlock(existingRecord, settings);
  const markdown = `# Resampling\n\n${job.sourceBlock}\n\n${visibleOld}Next paragraph.`;
  const proposal = createFallbackMergeProposal({
    job: { ...job, existingClarificationId: existingRecord.id },
    existingRecord,
    explanation: "新解释。",
    nowIso: "2026-07-03T12:02:00+02:00",
  });
  const record = recordFromMergeProposal({
    job: { ...job, existingClarificationId: existingRecord.id },
    proposal,
    existingRecord,
    settings,
    nowIso: "2026-07-03T12:03:00+02:00",
  });
  const visibleNew = buildClarificationBlock(record, settings);

  const result = applyClarificationMarkdown(
    markdown,
    { ...job, existingClarificationId: existingRecord.id },
    record,
    visibleNew
  );

  assert.equal(result.appliedAs, "updated");
  assert.equal((result.markdown.match(/learnos-clarification-id/g) ?? []).length, 1);
  assert.match(result.markdown, /%% learnos-clarification-id: clar-20260703-loocv %%\n\nNext paragraph\./);
});

test("stale second job merges into latest record without overwriting first applied item", () => {
  const latest = {
    ...existingRecord,
    revision: 2,
    contentHash: "hash-after-a",
    items: [
      {
        ...existingRecord.items[0],
        id: "item-a",
        itemTitle: "A 的解释",
        explanation: "A 已经应用。",
      },
    ],
  };
  const proposal = createFallbackMergeProposal({
    job: { ...job, id: "job-b", userQuestion: "B 是什么？", selectedText: "B" },
    existingRecord: null,
    explanation: "B 的解释。",
    nowIso: "2026-07-03T12:10:00+02:00",
  });
  const next = recordFromMergeProposal({
    job: { ...job, id: "job-b", userQuestion: "B 是什么？", selectedText: "B" },
    proposal,
    existingRecord: latest,
    settings,
    nowIso: "2026-07-03T12:11:00+02:00",
  });

  assert.equal(next.items.length, 2);
  assert.equal(next.items[0].explanation, "A 已经应用。");
  assert.equal(next.items[1].explanation, "B 的解释。");
});

test("current live block differing from rendered latest record is treated as manual stale edit", () => {
  const rendered = buildClarificationBlock(existingRecord, settings);
  const manual = rendered.replace("旧解释保留。", "旧解释保留。手动加的一句。");
  const stale = detectStaleProposal({
    job: {
      ...job,
      existingClarificationId: existingRecord.id,
      baseClarificationRevision: 1,
      baseClarificationContentHash: "base",
      baseVisibleBlockHash: "base-visible",
    },
    latestRecord: existingRecord,
    currentVisibleMarkdown: manual,
    proposalVisibleMarkdown: "> **B** B 的解释。",
  });

  assert.equal(stale.stale, true);
  assert.equal(stale.liveBlockHasManualEdits, true);
});

test("rebase prompt includes current live content, stale proposal, and pending answer", () => {
  const prompt = buildClarificationRebasePrompt({
    job,
    latestRecord: existingRecord,
    currentVisibleMarkdown: "> **A** current live content",
    staleProposalMarkdown: "> **B** stale proposal",
    rawAnswer: "pending answer",
    answerLanguage: "auto",
  });

  assert.match(prompt, /current live content/);
  assert.match(prompt, /stale proposal/);
  assert.match(prompt, /pending answer/);
});

test("post-apply selection chooses next ready job, previous ready job, then clears", () => {
  const jobs = [
    { ...job, id: "job-a", status: "completed", updated: "2026-07-03T12:03:00+02:00" },
    { ...job, id: "job-b", status: "completed", updated: "2026-07-03T12:02:00+02:00" },
    { ...job, id: "job-c", status: "completed", updated: "2026-07-03T12:01:00+02:00" },
  ];

  assert.equal(nextReadyJobIdAfterApply(jobs, "job-a"), "job-b");
  assert.equal(nextReadyJobIdAfterApply(jobs, "job-c"), "job-b");
  assert.equal(nextReadyJobIdAfterApply([jobs[0]], "job-a"), null);
  assert.equal(resolveSelectedJobId([{ ...jobs[0], status: "applied" }], "job-a", false), null);
});

test("history jobs are hidden by active groups and shown only by history groups", () => {
  const jobs = [
    { ...job, id: "ready", status: "completed" },
    { ...job, id: "applied", status: "applied" },
    { ...job, id: "archived", status: "archived" },
    { ...job, id: "failed", status: "failed" },
  ];
  const activeGroups = INBOX_STATUS_GROUPS.filter((group) => !group.history);
  const activeIds = activeGroups.flatMap((group) => jobsForGroup(jobs, group).map((item) => item.id));

  assert.deepEqual(activeIds.sort(), ["failed", "ready"]);
  assert.deepEqual(historyJobs(jobs).map((item) => item.id).sort(), ["applied", "archived"]);
});

test("inbox tabs filter running ready failed and history jobs", () => {
  const jobs = [
    { ...job, id: "queued", status: "queued" },
    { ...job, id: "running", status: "running" },
    { ...job, id: "ready", status: "completed" },
    { ...job, id: "failed", status: "failed" },
    { ...job, id: "applied", status: "applied" },
    { ...job, id: "archived", status: "archived" },
    { ...job, id: "cancelled", status: "cancelled" },
  ];

  assert.deepEqual(jobsForTab(jobs, "running").map((item) => item.id).sort(), ["queued", "running"]);
  assert.deepEqual(jobsForTab(jobs, "ready").map((item) => item.id), ["ready"]);
  assert.deepEqual(jobsForTab(jobs, "failed").map((item) => item.id), ["failed"]);
  assert.deepEqual(jobsForTab(jobs, "history").map((item) => item.id).sort(), [
    "applied",
    "archived",
    "cancelled",
  ]);
  assert.deepEqual(tabCounts(jobs), {
    running: 2,
    ready: 1,
    failed: 1,
    history: 3,
  });
});

test("tab selection resets to the first job in the selected filter", () => {
  const jobs = [
    { ...job, id: "ready-a", status: "completed" },
    { ...job, id: "ready-b", status: "completed" },
    { ...job, id: "failed-a", status: "failed" },
  ];

  assert.equal(resolveSelectedJobIdForTab(jobs, "ready-b", "ready"), "ready-b");
  assert.equal(resolveSelectedJobIdForTab(jobs, "ready-b", "failed"), "failed-a");
  assert.equal(resolveSelectedJobIdForTab(jobs, "missing", "running"), null);
  assert.equal(nextJobIdInTab(jobs, "ready-a", "ready"), "ready-b");
  assert.equal(nextJobIdInTab(jobs, "ready-b", "ready"), "ready-a");
});

test("ready count excludes applied and archived jobs while failed remains active", () => {
  const jobs = [
    { ...job, id: "ready", status: "completed" },
    { ...job, id: "applied", status: "applied" },
    { ...job, id: "archived", status: "archived" },
    { ...job, id: "failed", status: "failed" },
  ];
  const failedGroup = INBOX_STATUS_GROUPS.find((group) => group.id === "failed");

  assert.equal(readyCount(jobs), 1);
  assert.equal(jobsForGroup(jobs, failedGroup).length, 1);
});

test("applied history jobs have limited actions", () => {
  assert.equal(actionSetForJob({ ...job, status: "completed" }), "ready");
  assert.equal(actionSetForJob({ ...job, status: "applied" }), "history");
  assert.equal(actionSetForJob({ ...job, status: "archived" }), "history");
  assert.equal(actionSetForJob({ ...job, status: "failed" }), "failed");
});

test("empty state kinds distinguish no jobs, only history, and no ready", () => {
  assert.equal(emptyStateKind([]), "no-jobs");
  assert.equal(emptyStateKind([{ ...job, status: "applied" }]), "only-history");
  assert.equal(emptyStateKind([{ ...job, status: "running" }]), "no-ready");
  assert.equal(emptyStateKind([{ ...job, status: "completed" }]), "none");
});

test("orphan cleanup extracts live markers and detects orphan clarifications and jobs", () => {
  const markdown = `# Note

> [!tip]- 💡 我的理解
> kept

%% learnos-clarification-id: clar-live %%

<!-- learnos-clarification-id: clar-html -->`;

  const live = extractLiveClarificationIds(markdown);
  assert.equal(live.has("clar-live"), true);
  assert.equal(live.has("clar-html"), true);

  const plan = buildOrphanCleanupPlan({
    markdownFiles: [markdown],
    clarificationRecords: [
      { ...existingRecord, id: "clar-live" },
      { ...existingRecord, id: "clar-orphan" },
    ],
    askJobs: [
      { ...job, id: "job-live", existingClarificationId: "clar-live" },
      { ...job, id: "job-orphan", existingClarificationId: "clar-orphan" },
    ],
  });

  assert.deepEqual(plan.orphanClarifications.map((record) => record.id), ["clar-orphan"]);
  assert.deepEqual(plan.orphanJobs.map((item) => item.id), ["job-orphan"]);
});

test("orphan cleanup detects dangling markers archived jobs and applied jobs missing markers", () => {
  const markdownFiles = [
    {
      path: "Stats/LOOCV.md",
      content: "%% learnos-clarification-id: clar-live %%\n%% learnos-clarification-id: clar-missing-json %%",
    },
  ];
  const plan = buildOrphanCleanupPlan({
    markdownFiles,
    clarificationRecords: [
      { ...existingRecord, id: "clar-live" },
      { ...existingRecord, id: "clar-orphan" },
    ],
    askJobs: [
      { ...job, id: "job-live", status: "applied", existingClarificationId: "clar-live" },
      { ...job, id: "job-orphan", status: "completed", existingClarificationId: "clar-orphan" },
      { ...job, id: "job-dangling", status: "completed", existingClarificationId: "clar-missing-json" },
      { ...job, id: "job-archived", status: "archived", existingClarificationId: "clar-live" },
      { ...job, id: "job-applied-missing-marker", status: "applied", existingClarificationId: "clar-no-marker" },
    ],
  });

  assert.deepEqual(plan.orphanClarifications.map((record) => record.id), ["clar-orphan"]);
  assert.deepEqual(plan.danglingMarkers.map((marker) => marker.id), ["clar-missing-json"]);
  assert.deepEqual(plan.orphanJobs.map((item) => item.id).sort(), [
    "job-applied-missing-marker",
    "job-dangling",
    "job-orphan",
  ]);
  assert.deepEqual(plan.askJobsMissingClarificationRecords.map((item) => item.id).sort(), [
    "job-applied-missing-marker",
    "job-dangling",
  ]);
  assert.deepEqual(plan.askJobsReferencingOrphanClarifications.map((item) => item.id), ["job-orphan"]);
  assert.deepEqual(plan.archivedJobs.map((item) => item.id), ["job-archived"]);
  assert.deepEqual(plan.appliedJobsMissingMarkers.map((item) => item.id), ["job-applied-missing-marker"]);
  assert.deepEqual(cleanupJobsForArchive(plan).map((item) => item.id).sort(), [
    "job-applied-missing-marker",
    "job-archived",
    "job-dangling",
    "job-orphan",
  ]);
  assert.deepEqual(cleanupJobsForDelete(plan).map((item) => item.id).sort(), [
    "job-applied-missing-marker",
    "job-archived",
    "job-dangling",
    "job-orphan",
  ]);
});

test("cleanup categories are empty only when every backend record still has live note content", () => {
  const plan = buildOrphanCleanupPlan({
    markdownFiles: [
      {
        path: "Stats/LOOCV.md",
        content: "%% learnos-clarification-id: clar-live %%",
      },
    ],
    clarificationRecords: [{ ...existingRecord, id: "clar-live" }],
    askJobs: [{ ...job, id: "job-live", status: "applied", existingClarificationId: "clar-live" }],
  });

  assert.equal(plan.orphanClarifications.length, 0);
  assert.equal(plan.appliedJobsMissingMarkers.length, 0);
  assert.equal(plan.askJobsMissingClarificationRecords.length, 0);
  assert.equal(plan.askJobsReferencingOrphanClarifications.length, 0);
  assert.equal(plan.danglingMarkers.length, 0);
  assert.equal(plan.archivedJobs.length, 0);
});

test("deleting an ask job record does not delete clarification data", async () => {
  const fileStore = new MemoryFileStore();
  const store = new AskJobStore(fileStore, ".learning-os");
  await fileStore.writeJson(".learning-os/clarifications/clar-live.json", existingRecord);
  await store.saveJob({ ...job, id: "job-history", status: "applied", existingClarificationId: "clar-live" }, "created");

  await store.deleteJob("job-history");

  assert.equal(await store.readJob("job-history"), null);
  assert.deepEqual(await fileStore.readJson(".learning-os/clarifications/clar-live.json"), existingRecord);
});

test("data model documentation explains Learning OS folders", () => {
  const doc = readFileSync(new URL("../docs/DATA_MODEL.md", import.meta.url), "utf8");
  for (const folder of ["ask-jobs", "clarifications", "ask-cards", "archive", "backups", "logs"]) {
    assert.match(doc, new RegExp(folder));
  }
  assert.match(doc, /Why Does a Deleted Note Block Still Appear in Inbox History/);
  assert.match(doc, /applied ask jobs whose target note marker is missing/);
  assert.match(doc, /Delete job record/);
});

class MemoryFileStore {
  constructor() {
    this.files = new Map();
    this.jsonl = [];
  }

  async readJson(path) {
    const value = this.files.get(path);
    return value ? JSON.parse(value) : null;
  }

  async writeJson(path, record) {
    this.files.set(path, `${JSON.stringify(record, null, 2)}\n`);
  }

  async listFiles(folder) {
    return Array.from(this.files.keys()).filter((path) => path.startsWith(folder));
  }

  async appendJsonl(_path, record) {
    this.jsonl.push(record);
  }

  async exists(path) {
    return this.files.has(path);
  }

  async deleteFile(path) {
    this.files.delete(path);
  }
}
