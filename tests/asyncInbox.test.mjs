import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildClarificationBlock } from "../src/ask/ClarificationBlock.ts";
import { generatedContentMissingWarning } from "../src/ask/AskIntent.ts";
import { resolveAskModelRoute, shouldSuggestProForQuestion } from "../src/ai/ModelRouting.ts";
import {
  buildGeneratedContentBlock,
  buildClarificationMergePrompt,
  buildClarificationRebasePrompt,
  createFallbackMergeProposal,
  normalizeProposalForAskIntent,
  parseClarificationMergeProposal,
  primaryProposalSourceText,
  proposalPreviewMarkdown,
  recordFromMergeProposal,
} from "../src/ask/ClarificationMergeProposal.ts";
import {
  applyAskJobProposal,
  applyClarificationMarkdown,
  collectLearningOsMarkers,
  detectStaleProposal,
  verifyAppliedMarkers,
  verifyMarkerPreservation,
} from "../src/jobs/ApplyAskJobProposal.ts";
import { AskJobService } from "../src/jobs/AskJobService.ts";
import {
  recordFromLiveClarificationState,
  resolveSourceBlockInLiveNote,
  resolveLiveClarificationStateFromMarkdown,
} from "../src/jobs/LiveClarificationState.ts";
import { liveAwareProposalForState, sourceDeletedApplyPolicy } from "../src/jobs/LiveAwareMerge.ts";
import { AskJobStore } from "../src/storage/AskJobStore.ts";
import {
  askIdsForJob,
  buildOrphanCleanupPlan,
  cleanupJobsForArchive,
  cleanupJobsForDelete,
  extractLiveClarificationIds,
  referencedClarificationIds,
  targetItemIds,
} from "../src/cleanup/OrphanCleanup.ts";
import {
  actionSetForJob,
  displayAnswerForJob,
  emptyStateKind,
  historyJobs,
  jobsForGroup,
  jobsForTab,
  nextJobIdInTab,
  nextReadyJobIdAfterApply,
  readyCount,
  resolveSelectedJobId,
  resolveSelectedJobIdForTab,
  sortJobsForTab,
  tabCounts,
  INBOX_STATUS_GROUPS,
} from "../src/views/AskInboxState.ts";
import {
  findLearnOsClarificationAnchor,
  findLearnOsItemAnchor,
  findSourceAnchor,
} from "../src/views/AskSourceNavigation.ts";
import { stableHash as stableHashForTest } from "../src/utils/hash.ts";

const settings = {
  uiLanguage: "zh",
  answerLanguage: "auto",
  defaultAskModel: "deepseek-v4-flash",
  deepAskModel: "deepseek-v4-pro",
  modelRoutingMode: "suggest",
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

test("AskJobService does not enqueue duplicate applied question", async () => {
  const fileStore = new MemoryFileStore();
  const store = new AskJobStore(fileStore, ".learning-os");
  const sourceAnchorKey = `${job.notePath}#${job.sourceBlockHash}#${job.headingPath.join(">")}`;
  await store.saveJob(
    {
      ...job,
      id: "job-existing-applied",
      status: "applied",
      sourceAnchorKey,
    },
    "applied"
  );
  const service = new AskJobService(
    store,
    { recordPathForId: (id) => `.learning-os/clarifications/${id}.json` },
    () => ({ ...settings, schemaVersion: 1, providerMode: "manual", maxConcurrentAskJobs: 2 })
  );
  const created = await service.createBackgroundJob({
    question: job.userQuestion,
    context: {
      notePath: job.notePath,
      noteTitle: "LOOCV",
      selectedText: job.selectedText,
      headingPath: job.headingPath,
      currentHeading: "LOOCV",
      parentHeading: "Resampling",
      nearbyBefore: "",
      nearbyAfter: "",
      frontmatter: {},
      detectedConceptIds: [job.detectedConcept],
      sourceBlock: job.sourceBlock,
      sourceBlockHash: job.sourceBlockHash,
      sourceStartOffset: job.sourceStartOffset,
      sourceEndOffset: job.sourceEndOffset,
      answerLanguage: "auto",
      sourceSentenceTruncated: false,
      originalSelectionLength: job.selectedText.length,
    },
  });
  const jobs = await store.listJobs();

  assert.equal(created.id, "job-existing-applied");
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, "applied");
});

test("model routing defaults normal Auto asks to Flash and suggests Pro without auto-upgrade", () => {
  const normal = resolveAskModelRoute({
    settings,
    question: "梯度是啥？",
    selection: { choice: "auto" },
  });
  const complex = resolveAskModelRoute({
    settings,
    question: "帮我严格检查这个插件架构和数据一致性 bug",
    selection: { choice: "auto" },
  });
  const declined = resolveAskModelRoute({
    settings,
    question: "帮我严格检查这个插件架构和数据一致性 bug",
    selection: { choice: "auto", suggestedProDecision: "declined" },
  });
  const accepted = resolveAskModelRoute({
    settings,
    question: "帮我严格检查这个插件架构和数据一致性 bug",
    selection: { choice: "auto", suggestedProDecision: "accepted" },
  });
  const proRerun = resolveAskModelRoute({
    settings,
    question: "梯度是啥？",
    selection: {
      choice: "pro",
      routingReason: "user-regenerate-with-pro",
      rerunOfJobId: "job-original",
    },
  });

  assert.equal(shouldSuggestProForQuestion("帮我严格检查这个插件架构和数据一致性 bug"), true);
  assert.equal(normal.selectedModel, "deepseek-v4-flash");
  assert.equal(normal.routingReason, "default-flash-for-normal-ask");
  assert.equal(complex.selectedModel, "deepseek-v4-flash");
  assert.equal(complex.routingReason, "suggest-pro-available-default-flash");
  assert.equal(declined.selectedModel, "deepseek-v4-flash");
  assert.equal(declined.routingReason, "suggested-pro-but-user-chose-flash");
  assert.equal(accepted.selectedModel, "deepseek-v4-pro");
  assert.equal(accepted.routingReason, "suggested-pro-user-confirmed");
  assert.equal(proRerun.selectedModel, "deepseek-v4-pro");
  assert.equal(proRerun.modelRoutingMode, "manual");
  assert.equal(proRerun.routingReason, "user-regenerate-with-pro");
  assert.equal(proRerun.rerunOfJobId, "job-original");
});

test("AskJobService records selected model routing metadata", async () => {
  const fileStore = new MemoryFileStore();
  const store = new AskJobStore(fileStore, ".learning-os");
  const service = new AskJobService(
    store,
    { recordPathForId: (id) => `.learning-os/clarifications/${id}.json` },
    () => ({
      ...settings,
      schemaVersion: 1,
      providerMode: "manual",
      providerPreset: "deepseek",
      providerModel: "legacy-model",
      maxConcurrentAskJobs: 2,
    })
  );
  const created = await service.createBackgroundJob({
    question: "梯度是啥？",
    modelSelection: { choice: "auto" },
    context: {
      notePath: job.notePath,
      noteTitle: "LOOCV",
      selectedText: job.selectedText,
      headingPath: job.headingPath,
      currentHeading: "LOOCV",
      parentHeading: "Resampling",
      nearbyBefore: "",
      nearbyAfter: "",
      frontmatter: {},
      detectedConceptIds: [job.detectedConcept],
      sourceBlock: job.sourceBlock,
      sourceBlockHash: job.sourceBlockHash,
      sourceStartOffset: job.sourceStartOffset,
      sourceEndOffset: job.sourceEndOffset,
      answerLanguage: "auto",
      sourceSentenceTruncated: false,
      originalSelectionLength: job.selectedText.length,
    },
  });

  assert.equal(created.model, "deepseek-v4-flash");
  assert.equal(created.selectedModel, "deepseek-v4-flash");
  assert.equal(created.requestedModel, "auto");
  assert.equal(created.modelRoutingMode, "suggest");
  assert.equal(created.routingReason, "default-flash-for-normal-ask");

  const proCreated = await service.createBackgroundJob({
    question: "帮我严格检查这个插件架构和数据一致性 bug",
    modelSelection: { choice: "pro" },
    context: {
      notePath: "Stats/Deep.md",
      noteTitle: "Deep",
      selectedText: "architecture",
      headingPath: ["Deep"],
      currentHeading: "Deep",
      parentHeading: null,
      nearbyBefore: "",
      nearbyAfter: "",
      frontmatter: {},
      detectedConceptIds: ["architecture"],
      sourceBlock: "architecture",
      sourceBlockHash: "hash-architecture",
      answerLanguage: "auto",
      sourceSentenceTruncated: false,
      originalSelectionLength: "architecture".length,
    },
  });

  assert.equal(proCreated.model, "deepseek-v4-pro");
  assert.equal(proCreated.selectedModel, "deepseek-v4-pro");
  assert.equal(proCreated.requestedModel, "pro");
  assert.equal(proCreated.modelRoutingMode, "manual");
  assert.equal(proCreated.routingReason, "user-selected-pro");
});

test("source navigation finds item anchors with flexible html comment spacing", () => {
  const markdown = `> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-loocv -->
>
> <!--learnos-item-id: item-unbiased-->
> **为什么叫无偏？** explanation
>
> <!-- learnos-item-id: item-variable; ask-ids: ask-1 -->
> **highly variable** explanation`;

  const first = findLearnOsItemAnchor(markdown, "item-unbiased");
  const second = findLearnOsItemAnchor(markdown, "item-variable");

  assert.equal(first?.kind, "item");
  assert.equal(first?.line, 3);
  assert.equal(second?.kind, "item");
  assert.equal(second?.line, 6);
});

test("source navigation falls back from missing item id to clarification id", () => {
  const markdown = `Paragraph.

> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-loocv -->
>
> <!-- learnos-item-id: item-live -->
> **Live item** explanation`;
  const anchor = findSourceAnchor(markdown, {
    ...job,
    targetItemId: "item-missing",
    appliedClarificationId: "clar-loocv",
  });

  assert.equal(findLearnOsClarificationAnchor(markdown, "clar-loocv")?.line, 3);
  assert.equal(anchor.kind, "clarification");
  assert.equal(anchor.line, 3);
});

test("source navigation falls back to source offset when anchors are missing", () => {
  const markdown = "Line one\nLine two source\nLine three";
  const anchor = findSourceAnchor(markdown, {
    ...job,
    targetItemId: "item-missing",
    appliedClarificationId: "clar-missing",
    sourceStartOffset: markdown.indexOf("Line two"),
    sourceEndOffset: markdown.indexOf("Line two") + "Line two source".length,
  });

  assert.equal(anchor.kind, "source-offset");
  assert.equal(anchor.line, 1);
  assert.equal(anchor.ch, 0);
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
  assert.match(preview, /<!-- learnos-clarification-id: clar-20260703-loocv -->/);
  assert.match(preview, /<!-- learnos-item-id: item-unbiased -->/);
  assert.doesNotMatch(preview, /ask-ids:/);
  assert.equal(preview.includes("learnos-ask-id"), false);
});

test("merge and rebase prompts include strict LaTeX formatting rules", () => {
  const mergePrompt = buildClarificationMergePrompt({
    job,
    existingRecord,
    rawAnswer: "Use $MSE_1$.",
    answerLanguage: "zh",
  });
  const rebasePrompt = buildClarificationRebasePrompt({
    job,
    latestRecord: existingRecord,
    currentVisibleMarkdown: buildClarificationBlock(existingRecord, settings),
    staleProposalMarkdown: "> **Old** text",
    rawAnswer: "Use $MSE_1$.",
    answerLanguage: "zh",
  });

  assert.match(mergePrompt, /数学公式必须使用 Obsidian 可渲染的 LaTeX 分隔符/);
  assert.match(rebasePrompt, /不要把数学公式放进反引号/);
  assert.match(rebasePrompt, /只返回 valid JSON/);
});

test("visible clarification sanitizes math in backticks without changing code", () => {
  const block = buildClarificationBlock(
    {
      ...existingRecord,
      items: [
        {
          ...existingRecord.items[0],
          explanation: "公式 `$MSE_1$` 和 `\\frac{a}{b}` 应该渲染，但 `pnpm install` 保持代码。",
        },
      ],
    },
    settings
  );

  assert.match(block, /\$MSE_1\$/);
  assert.match(block, /\$\\frac\{a\}\{b\}\$/);
  assert.match(block, /`pnpm install`/);
  assert.doesNotMatch(block, /`\$MSE_1\$`/);
});

test("Inbox answer display uses parsed answer instead of raw JSON when available", () => {
  const rawJson = '{"answer":"Parsed **answer** with $MSE_1$","key_answer":"key","suggested_takeaway":"takeaway"}';
  const display = displayAnswerForJob({
    ...job,
    rawAnswer: rawJson,
    parsedAnswer: {
      answer: "Parsed **answer** with $MSE_1$",
      key_answer: "key",
      suggested_takeaway: "takeaway",
      mastery_signal: "neutral",
      review_needed: false,
    },
  });

  assert.equal(display, "Parsed **answer** with $MSE_1$");
  assert.equal(display.includes('"answer"'), false);
});

test("proposal source prioritizes raw answer for explicit generated-content requests", () => {
  const storyJob = {
    ...job,
    userQuestion: "输出一个虎与狼的故事，其他的都不要管",
    rawAnswer: "从前，森林里有一只虎与狼，它们学会了合作。",
    parsedAnswer: {
      answer: "",
      key_answer: "AI 应该过滤无关内容。",
      suggested_takeaway: "快速学习有效输入。",
      mastery_signal: "neutral",
      review_needed: false,
    },
  };
  const prompt = buildClarificationMergePrompt({
    job: storyJob,
    existingRecord,
    rawAnswer: storyJob.rawAnswer,
    answerLanguage: "zh",
  });

  assert.match(prompt, /用户的问题是主要指令之一/);
  assert.match(prompt, /虎与狼/);
  assert.equal(primaryProposalSourceText(storyJob), "从前，森林里有一只虎与狼，它们学会了合作。");
});

test("raw plain-text answer is fallback proposal content when parsed fields are empty", () => {
  const storyJob = {
    ...job,
    id: "job-tiger-wolf",
    proposedItemId: "item-tiger-wolf-story",
    selectedText: "过滤无关内容",
    userQuestion: "输出一个虎与狼的故事，其他的都不要管",
    rawAnswer: "虎与狼在森林里争夺食物，最后用协作解决了问题。",
    parsedAnswer: {},
  };
  const proposal = createFallbackMergeProposal({
    job: storyJob,
    existingRecord: null,
    explanation: primaryProposalSourceText(storyJob),
    nowIso: "2026-07-03T12:02:00+02:00",
  });

  assert.match(proposal.proposedItems[0].explanation, /虎与狼/);
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
  assert.match(result.markdown, /learnos-item-id: item-/);
  assert.match(result.markdown, /\n\nNext paragraph\./);
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
  assert.match(result.markdown, /learnos-item-id: item-unbiased/);
  assert.match(result.markdown, /\n\nNext paragraph\./);
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

test("applyAskJobProposal preserves manually edited live block and merges pending item", async () => {
  const manualBlock = buildClarificationBlock(existingRecord, settings).replace(
    "旧解释保留。",
    "旧解释保留。手动保留的一句。"
  );
  const markdown = `# Resampling\n\n${job.sourceBlock}\n\n${manualBlock}Next paragraph.`;
  const pendingJob = {
    ...job,
    id: "job-manual-safe-merge",
    existingClarificationId: existingRecord.id,
    baseVisibleBlockHash: "old-visible-hash",
    userQuestion: "B 是什么？",
    selectedText: "B",
    mergeProposal: createFallbackMergeProposal({
      job: { ...job, id: "job-manual-safe-merge", userQuestion: "B 是什么？", selectedText: "B" },
      existingRecord,
      explanation: "B 的解释。",
      nowIso: "2026-07-03T12:12:00+02:00",
    }),
  };
  const fakeApp = new FakeApp(markdown, job.notePath);
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(existingRecord);

  const result = await applyAskJobProposal({
    app: fakeApp,
    jobStore: fakeJobStore,
    clarificationStore: fakeClarificationStore,
    settings: { ...settings, schemaVersion: 1 },
    job: pendingJob,
  });

  assert.equal(result.safeMerged, true);
  assert.match(fakeApp.modifiedMarkdown, /手动保留的一句/);
  assert.match(fakeApp.modifiedMarkdown, /B 的解释/);
  assert.match(fakeApp.modifiedMarkdown, /learnos-item-id: item-unbiased/);
  assert.equal(fakeJobStore.status, "applied");
});

test("pending job after deleted clarification creates fresh content without resurrecting old items", async () => {
  const markdown = `# Resampling\n\n${job.sourceBlock}\n\nNext paragraph.`;
  const pendingJob = {
    ...job,
    id: "job-deleted-block-pending",
    existingClarificationId: existingRecord.id,
    targetClarificationId: existingRecord.id,
    proposedItemId: "item-new-only",
    selectedText: "highly variable",
    userQuestion: "highly variable 是什么？",
    mergeProposal: {
      schemaVersion: 1,
      action: "add-item",
      clarificationId: existingRecord.id,
      targetItemId: null,
      proposedItems: [
        existingRecord.items[0],
        {
          ...existingRecord.items[0],
          id: "item-new-only",
          targetText: "highly variable",
          itemTitle: "highly variable",
          question: "highly variable 是什么？",
          explanation: "新问题的解释。",
          relatedInteractionIds: ["ask-deleted-block-pending"],
        },
      ],
      operations: [
        {
          op: "add-item",
          itemId: "item-new-only",
          targetText: "highly variable",
          itemTitle: "highly variable",
          explanation: "新问题的解释。",
        },
      ],
      proposedVisibleMarkdown: buildClarificationBlock(
        {
          ...existingRecord,
          items: [
            existingRecord.items[0],
            {
              ...existingRecord.items[0],
              id: "item-new-only",
              itemTitle: "highly variable",
              explanation: "新问题的解释。",
            },
          ],
        },
        settings
      ),
      reasoning: "stale proposal from deleted block",
      confidence: "medium",
    },
  };
  const fakeApp = new FakeApp(markdown, job.notePath);
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(null);

  const result = await applyAskJobProposal({
    app: fakeApp,
    jobStore: fakeJobStore,
    clarificationStore: fakeClarificationStore,
    settings: { ...settings, schemaVersion: 1 },
    job: pendingJob,
  });

  assert.equal(result.appliedAs, "created");
  assert.match(fakeApp.modifiedMarkdown, /新问题的解释/);
  assert.doesNotMatch(fakeApp.modifiedMarkdown, /旧解释保留/);
  assert.equal((fakeApp.modifiedMarkdown.match(/learnos-item-id/g) ?? []).length, 1);
});

test("live resolver detects deleted clarification block without cleanup and preview ignores stale old items", () => {
  const markdown = `# Resampling\n\n${job.sourceBlock}\n\nNext paragraph.`;
  const staleJob = {
    ...job,
    existingClarificationId: existingRecord.id,
    targetClarificationId: existingRecord.id,
    proposedItemId: "item-csgo-story",
    userQuestion: "给我一个 csgo 小故事",
    rawAnswer: "一名 CSGO 队员在残局中冷静封烟，帮助队伍翻盘。",
    mergeProposal: {
      schemaVersion: 1,
      action: "add-item",
      clarificationId: existingRecord.id,
      targetItemId: null,
      proposedItems: [
        existingRecord.items[0],
        {
          ...existingRecord.items[0],
          id: "item-csgo-story",
          itemTitle: "CSGO 小故事",
          explanation: "一名 CSGO 队员在残局中冷静封烟，帮助队伍翻盘。",
        },
      ],
      proposedVisibleMarkdown: buildClarificationBlock(
        {
          ...existingRecord,
          items: [
            existingRecord.items[0],
            {
              ...existingRecord.items[0],
              id: "item-csgo-story",
              itemTitle: "CSGO 小故事",
              explanation: "一名 CSGO 队员在残局中冷静封烟，帮助队伍翻盘。",
            },
          ],
        },
        settings
      ),
      reasoning: "stale",
      confidence: "medium",
    },
  };
  const state = resolveLiveClarificationStateFromMarkdown(markdown, staleJob, existingRecord.items);
  const liveRecord = recordFromLiveClarificationState({
    state,
    job: staleJob,
    backendRecord: existingRecord,
    settings,
  });
  const preview = liveAwareProposalForState({
    job: staleJob,
    liveState: state,
    liveRecord,
    settings,
  });

  assert.equal(state.kind, "block-deleted");
  assert.match(preview?.visible ?? "", /CSGO/);
  assert.doesNotMatch(preview?.visible ?? "", /旧解释保留/);
  assert.equal((preview?.visible.match(/learnos-item-id/g) ?? []).length, 1);
});

test("live resolver treats deleted target item as new item instead of restoring it", async () => {
  const twoItemRecord = {
    ...existingRecord,
    items: [
      existingRecord.items[0],
      {
        ...existingRecord.items[0],
        id: "item-live-b",
        itemTitle: "Live B",
        explanation: "B 仍然存在。",
      },
    ],
  };
  const liveBlock = buildClarificationBlock({ ...twoItemRecord, items: [twoItemRecord.items[1]] }, settings);
  const markdown = `# Resampling\n\n${job.sourceBlock}\n\n${liveBlock}Next paragraph.`;
  const pendingJob = {
    ...job,
    id: "job-target-item-deleted",
    existingClarificationId: twoItemRecord.id,
    targetItemId: "item-unbiased",
    proposedItemId: "item-new-after-delete",
    mergeProposal: {
      schemaVersion: 1,
      action: "update-item",
      clarificationId: twoItemRecord.id,
      targetItemId: "item-unbiased",
      proposedItems: [
        {
          ...twoItemRecord.items[0],
          explanation: "新解释不应该恢复旧 item id。",
        },
      ],
      operations: [
        {
          op: "update-item",
          itemId: "item-unbiased",
          targetText: "unbiased estimate",
          itemTitle: "为什么叫无偏？",
          explanation: "新解释不应该恢复旧 item id。",
        },
      ],
      proposedVisibleMarkdown: "> **为什么叫无偏？** 新解释不应该恢复旧 item id。",
      reasoning: "stale target",
      confidence: "medium",
    },
  };
  const fakeApp = new FakeApp(markdown, job.notePath);
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(twoItemRecord);

  await applyAskJobProposal({
    app: fakeApp,
    jobStore: fakeJobStore,
    clarificationStore: fakeClarificationStore,
    settings: { ...settings, schemaVersion: 1 },
    job: pendingJob,
  });

  assert.match(fakeApp.modifiedMarkdown, /B 仍然存在/);
  assert.match(fakeApp.modifiedMarkdown, /新解释不应该恢复旧 item id/);
  assert.doesNotMatch(fakeApp.modifiedMarkdown, /learnos-item-id: item-unbiased/);
  assert.match(fakeApp.modifiedMarkdown, /learnos-item-id: item-new-after-delete/);
});

test("live-aware preview uses modified live item text as the current base", () => {
  const modifiedBlock = buildClarificationBlock(existingRecord, settings).replace(
    "旧解释保留。",
    "用户运行期间手动修改后的解释。"
  );
  const markdown = `# Resampling\n\n${job.sourceBlock}\n\n${modifiedBlock}Next paragraph.`;
  const state = resolveLiveClarificationStateFromMarkdown(
    markdown,
    { ...job, existingClarificationId: existingRecord.id, targetItemId: "item-unbiased" },
    existingRecord.items
  );
  const liveRecord = recordFromLiveClarificationState({
    state,
    job,
    backendRecord: existingRecord,
    settings,
  });
  const preview = liveAwareProposalForState({
    job: {
      ...job,
      existingClarificationId: existingRecord.id,
      mergeProposal: createFallbackMergeProposal({
        job: { ...job, existingClarificationId: existingRecord.id },
        existingRecord,
        explanation: "新增解释。",
      }),
    },
    liveState: state,
    liveRecord,
    settings,
  });

  assert.equal(state.kind, "block-live");
  assert.match(preview?.visible ?? "", /用户运行期间手动修改后的解释/);
});

test("missing generated content creates a warning instead of silently treating it as normal", () => {
  const warning = generatedContentMissingWarning(
    "给我一个 csgo 小故事",
    "选中的句子表示这里不需要继续分析。"
  );

  assert.match(warning ?? "", /AI 回答没有包含你要求的内容/);
  assert.match(warning ?? "", /csgo 小故事/);
});

test("applyAskJobProposal applies manually edited proposal text instead of regenerated stored proposal", async () => {
  const markdown = `# Resampling\n\n${job.sourceBlock}\n\nNext paragraph.`;
  const longText = "这是一段很长的机器生成建议，用户已经不想要。";
  const pendingJob = {
    ...job,
    id: "job-edited-proposal",
    proposedItemId: "item-edited-proposal",
    mergeProposal: createFallbackMergeProposal({
      job: { ...job, id: "job-edited-proposal", proposedItemId: "item-edited-proposal" },
      existingRecord: null,
      explanation: longText,
      nowIso: "2026-07-03T12:12:00+02:00",
    }),
  };
  const fakeApp = new FakeApp(markdown, job.notePath);
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(null);

  await applyAskJobProposal({
    app: fakeApp,
    jobStore: fakeJobStore,
    clarificationStore: fakeClarificationStore,
    settings: { ...settings, schemaVersion: 1 },
    job: pendingJob,
    editedVisibleMarkdown: "**AI应灵活处理并过滤无关内容** 虎与狼小故事，测试下。",
  });

  assert.match(fakeApp.modifiedMarkdown, /虎与狼小故事，测试下。/);
  assert.doesNotMatch(fakeApp.modifiedMarkdown, new RegExp(longText));
});

test("apply operation preserves unrelated live items byte-for-byte", async () => {
  const multiRecord = {
    ...existingRecord,
    items: [
      existingRecord.items[0],
      {
        ...existingRecord.items[0],
        id: "item-b",
        itemTitle: "B 项",
        explanation: "B 用户手动保留内容。",
      },
      {
        ...existingRecord.items[0],
        id: "item-c",
        itemTitle: "C 项",
        explanation: "C 用户手动保留内容。",
      },
    ],
  };
  const markdown = `# Resampling\n\n${job.sourceBlock}\n\n${buildClarificationBlock(multiRecord, settings)}Next paragraph.`;
  const pendingJob = {
    ...job,
    id: "job-update-only-a",
    existingClarificationId: multiRecord.id,
    mergeProposal: {
      schemaVersion: 1,
      action: "update-item",
      clarificationId: multiRecord.id,
      targetItemId: "item-unbiased",
      proposedItems: [
        {
          ...multiRecord.items[0],
          explanation: "A 更新后的解释。",
        },
      ],
      operations: [
        {
          op: "update-item",
          itemId: "item-unbiased",
          targetText: "unbiased estimate",
          itemTitle: "为什么叫无偏？",
          explanation: "A 更新后的解释。",
        },
      ],
      proposedVisibleMarkdown: "> **为什么叫无偏？** A 更新后的解释。",
      reasoning: "update A only",
      confidence: "high",
    },
  };
  const fakeApp = new FakeApp(markdown, job.notePath);
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(multiRecord);

  await applyAskJobProposal({
    app: fakeApp,
    jobStore: fakeJobStore,
    clarificationStore: fakeClarificationStore,
    settings: { ...settings, schemaVersion: 1 },
    job: pendingJob,
  });

  assert.match(fakeApp.modifiedMarkdown, /A 更新后的解释/);
  assert.match(fakeApp.modifiedMarkdown, /\*\*B 项\*\* B 用户手动保留内容。/);
  assert.match(fakeApp.modifiedMarkdown, /\*\*C 项\*\* C 用户手动保留内容。/);
});

test("apply verification fails instead of marking applied when an expected item marker is missing", async () => {
  const dashboardSource = "A dashboard source paragraph.";
  const markdown = `# Resampling\n\n${dashboardSource}\n\nNext paragraph.`;
  const pendingJob = {
    ...job,
    id: "job-verification-missing-marker",
    proposedItemId: "q-dashboard",
    selectedText: "dashboard",
    sourceBlock: dashboardSource,
    sourceBlockHash: "dashboard-source",
    userQuestion: "dashboard 是什么？",
    mergeProposal: createFallbackMergeProposal({
      job: {
        ...job,
        id: "job-verification-missing-marker",
        proposedItemId: "q-dashboard",
        selectedText: "dashboard",
        sourceBlock: dashboardSource,
        sourceBlockHash: "dashboard-source",
        userQuestion: "dashboard 是什么？",
      },
      existingRecord: null,
      explanation: "Dashboard 解释。",
      nowIso: "2026-07-03T12:12:00+02:00",
    }),
  };
  const fakeApp = new FakeApp(markdown, job.notePath, (next) =>
    next.replace(/> <!-- learnos-item-id: q-dashboard -->\n/g, "")
  );
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(null);

  await assert.rejects(
    () =>
      applyAskJobProposal({
        app: fakeApp,
        jobStore: fakeJobStore,
        clarificationStore: fakeClarificationStore,
        settings: { ...settings, schemaVersion: 1 },
        job: pendingJob,
      }),
    /Apply verification failed/
  );

  assert.equal(fakeJobStore.status, "failed");
  assert.equal(fakeJobStore.savedJob.error.code, "apply-verification-failed");
  assert.deepEqual(fakeJobStore.savedJob.error.missingItemIds, ["q-dashboard"]);
  assert.equal(fakeClarificationStore.savedRecord, null);
  assert.equal(verifyAppliedMarkers(fakeApp.modifiedMarkdown, {
    appliedClarificationId: fakeJobStore.savedJob.appliedClarificationId,
    appliedItemIds: ["q-dashboard"],
  }).ok, false);
});

test("concurrent create clarification applies in one note keep all item markers", async () => {
  const sourceLines = [
    "6. LLM Agent 生成诊断报告。",
    "7. ROS2 仿真机器人接收任务，例如前往设备 A 检查。",
    "8. 系统记录每一步工具调用和执行结果。",
    "9. 高风险操作需要 human approval。",
    "10. 前端 dashboard 展示设备状态、机器人状态、AI 诊断结果。",
  ];
  const initialMarkdown = sourceLines.join("\n");
  const fakeApp = new FakeApp(initialMarkdown, "测试.md");
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(null);
  const makeJob = (id, selectedText, sourceBlock, proposedItemId, explanation) => {
    const nextJob = {
      ...job,
      id,
      notePath: "测试.md",
      headingPath: [],
      sourceBlock,
      sourceBlockHash: "unused",
      sourceStartOffset: initialMarkdown.indexOf(sourceBlock),
      sourceEndOffset: initialMarkdown.indexOf(sourceBlock) + sourceBlock.length,
      selectedText,
      userQuestion: `${selectedText} 是什么？`,
      proposedItemId,
      existingClarificationId: undefined,
      targetClarificationId: undefined,
    };
    return {
      ...nextJob,
      mergeProposal: createFallbackMergeProposal({
        job: nextJob,
        existingRecord: null,
        explanation,
        nowIso: "2026-07-03T12:12:00+02:00",
      }),
    };
  };
  const jobs = [
    makeJob("job-llm-agent", "LLM Agent", sourceLines[0], "llm-agent", "LLM Agent 解释。"),
    makeJob("job-dashboard", "dashboard", sourceLines[4], "q-dashboard", "Dashboard 解释。"),
    makeJob("job-ros2", "ROS2", sourceLines[1], "item-ros2", "ROS2 解释。"),
  ];

  await Promise.all(
    jobs.map((nextJob) =>
      applyAskJobProposal({
        app: fakeApp,
        jobStore: fakeJobStore,
        clarificationStore: fakeClarificationStore,
        settings: { ...settings, schemaVersion: 1 },
        job: nextJob,
      })
    )
  );

  assert.match(fakeApp.modifiedMarkdown, /learnos-item-id: llm-agent/);
  assert.match(fakeApp.modifiedMarkdown, /learnos-item-id: q-dashboard/);
  assert.match(fakeApp.modifiedMarkdown, /learnos-item-id: item-ros2/);
  assert.equal(fakeJobStore.appliedJobs.length, 3);
});

test("stale offset after insertion still resolves dashboard source line outside clarification blocks", async () => {
  const beforeDashboard = "6. LLM Agent 生成诊断报告。";
  const dashboardLine = "10. 前端 dashboard 展示设备状态、机器人状态、AI 诊断结果。";
  const initialMarkdown = `${beforeDashboard}\n${dashboardLine}`;
  const insertedBlock = buildClarificationBlock(
    {
      ...existingRecord,
      id: "clar-existing",
      notePath: "测试.md",
      sourceBlock: beforeDashboard,
      items: [{ ...existingRecord.items[0], id: "llm-agent", itemTitle: "LLM Agent", explanation: "LLM 解释。" }],
    },
    settings
  );
  const mutatedMarkdown = `${beforeDashboard}\n\n${insertedBlock}${dashboardLine}`;
  const dashboardJob = {
    ...job,
    id: "job-dashboard-stale-offset",
    notePath: "测试.md",
    selectedText: "dashboard",
    sourceBlock: dashboardLine,
    sourceBlockHash: "unused",
    sourceStartOffset: initialMarkdown.indexOf(dashboardLine),
    sourceEndOffset: initialMarkdown.indexOf(dashboardLine) + dashboardLine.length,
    proposedItemId: "q-dashboard",
    existingClarificationId: undefined,
    targetClarificationId: undefined,
    mergeProposal: createFallbackMergeProposal({
      job: {
        ...job,
        id: "job-dashboard-stale-offset",
        notePath: "测试.md",
        selectedText: "dashboard",
        sourceBlock: dashboardLine,
        proposedItemId: "q-dashboard",
        userQuestion: "dashboard 是什么？",
      },
      existingRecord: null,
      explanation: "Dashboard 解释。",
      nowIso: "2026-07-03T12:12:00+02:00",
    }),
  };
  const resolved = resolveSourceBlockInLiveNote(mutatedMarkdown, dashboardJob);
  const fakeApp = new FakeApp(mutatedMarkdown, "测试.md");
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(null);

  await applyAskJobProposal({
    app: fakeApp,
    jobStore: fakeJobStore,
    clarificationStore: fakeClarificationStore,
    settings: { ...settings, schemaVersion: 1 },
    job: dashboardJob,
  });

  assert.equal(resolved.method, "exact-source");
  assert.equal(mutatedMarkdown.slice(resolved.start, resolved.end), dashboardLine);
  assert.match(fakeApp.modifiedMarkdown, new RegExp(`${escapeRegExp(dashboardLine)}\\n\\n> \\[!tip\\]-`));
});

test("selectedText sourceBlock mismatch avoids appending dashboard to ROS2 block", async () => {
  const ros2Line = "7. ROS2 仿真机器人接收任务，例如前往设备 A 检查。";
  const dashboardLine = "10. 前端 dashboard 展示设备状态、机器人状态、AI 诊断结果。";
  const ros2Record = {
    ...existingRecord,
    id: "clar-ros2",
    notePath: "测试.md",
    sourceBlock: ros2Line,
    items: [{ ...existingRecord.items[0], id: "item-ros2", itemTitle: "ROS2", explanation: "ROS2 解释。" }],
  };
  const markdown = `${ros2Line}\n\n${buildClarificationBlock(ros2Record, settings)}${dashboardLine}`;
  const mismatchJob = {
    ...job,
    id: "job-dashboard-mismatch",
    notePath: "测试.md",
    selectedText: "dashboard",
    sourceBlock: ros2Line,
    sourceBlockHash: "unused",
    proposedItemId: "q-dashboard",
    existingClarificationId: "clar-ros2",
    targetClarificationId: "clar-ros2",
    mergeProposal: createFallbackMergeProposal({
      job: {
        ...job,
        id: "job-dashboard-mismatch",
        notePath: "测试.md",
        selectedText: "dashboard",
        sourceBlock: ros2Line,
        proposedItemId: "q-dashboard",
        userQuestion: "dashboard 是什么？",
      },
      existingRecord: ros2Record,
      explanation: "Dashboard 解释。",
      nowIso: "2026-07-03T12:12:00+02:00",
    }),
  };
  const resolved = resolveSourceBlockInLiveNote(markdown, mismatchJob);
  const fakeApp = new FakeApp(markdown, "测试.md");
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(ros2Record);

  await applyAskJobProposal({
    app: fakeApp,
    jobStore: fakeJobStore,
    clarificationStore: fakeClarificationStore,
    settings: { ...settings, schemaVersion: 1 },
    job: mismatchJob,
  });

  assert.equal(resolved.inconsistent, true);
  assert.equal(resolved.method, "selected-text");
  const ros2Block = fakeApp.modifiedMarkdown.slice(
    fakeApp.modifiedMarkdown.indexOf("clar-ros2"),
    fakeApp.modifiedMarkdown.indexOf(dashboardLine)
  );
  assert.doesNotMatch(ros2Block, /q-dashboard/);
  assert.match(fakeApp.modifiedMarkdown, new RegExp(`${escapeRegExp(dashboardLine)}\\n\\n> \\[!tip\\]-`));
});

test("order-independent apply keeps source-bound blocks and all previous item markers", async () => {
  const sourceLines = [
    "6. LLM Agent 生成诊断报告。",
    "7. ROS2 仿真机器人接收任务，例如前往设备 A 检查。",
    "8. 系统记录每一步工具调用和执行结果。",
    "9. 高风险操作需要 human approval。",
    "10. 前端 dashboard 展示设备状态、机器人状态、AI 诊断结果。",
  ];
  const initialMarkdown = sourceLines.join("\n");
  const fakeApp = new FakeApp(initialMarkdown, "测试.md");
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(null);
  const makeJob = (id, selectedText, sourceBlock, proposedItemId, explanation) => {
    const nextJob = {
      ...job,
      id,
      notePath: "测试.md",
      headingPath: [],
      sourceBlock,
      sourceBlockHash: stableHashForTest(sourceBlock),
      sourceStartOffset: initialMarkdown.indexOf(sourceBlock),
      sourceEndOffset: initialMarkdown.indexOf(sourceBlock) + sourceBlock.length,
      selectedText,
      userQuestion: `${selectedText} 是什么？`,
      proposedItemId,
      existingClarificationId: undefined,
      targetClarificationId: undefined,
    };
    return {
      ...nextJob,
      mergeProposal: createFallbackMergeProposal({
        job: nextJob,
        existingRecord: null,
        explanation,
        nowIso: "2026-07-03T12:12:00+02:00",
      }),
    };
  };
  const llmJob = makeJob("job-llm-order", "LLM Agent", sourceLines[0], "llm-agent", "LLM Agent 解释。");
  const dashboardJob = makeJob("job-dashboard-order", "dashboard", sourceLines[4], "item-dashboard", "Dashboard 解释。");
  const ros2Job = makeJob("job-ros2-order", "ROS2", sourceLines[1], "ros2-explanation", "ROS2 解释。");

  for (const nextJob of [dashboardJob, llmJob, ros2Job]) {
    await applyAskJobProposal({
      app: fakeApp,
      jobStore: fakeJobStore,
      clarificationStore: fakeClarificationStore,
      settings: { ...settings, schemaVersion: 1 },
      job: nextJob,
    });
  }

  assert.match(fakeApp.modifiedMarkdown, /learnos-item-id: item-dashboard/);
  assert.match(fakeApp.modifiedMarkdown, /learnos-item-id: llm-agent/);
  assert.match(fakeApp.modifiedMarkdown, /learnos-item-id: ros2-explanation/);
  assert.match(fakeApp.modifiedMarkdown, new RegExp(`${escapeRegExp(sourceLines[0])}\\n\\n> \\[!tip\\][\\s\\S]*?learnos-item-id: llm-agent`));
  assert.match(fakeApp.modifiedMarkdown, new RegExp(`${escapeRegExp(sourceLines[1])}\\n\\n> \\[!tip\\][\\s\\S]*?learnos-item-id: ros2-explanation`));
  assert.match(fakeApp.modifiedMarkdown, new RegExp(`${escapeRegExp(sourceLines[4])}\\n\\n> \\[!tip\\][\\s\\S]*?learnos-item-id: item-dashboard`));
  assert.equal(fakeJobStore.appliedJobs.length, 3);
});

test("pre-existing marker preservation failure rolls back and does not mark applied", async () => {
  const sourceLine = "6. LLM Agent 生成诊断报告。";
  const dashboardRecord = {
    ...existingRecord,
    id: "clar-dashboard-existing",
    notePath: "测试.md",
    sourceBlock: sourceLine,
    sourceBlockHash: stableHashForTest(sourceLine),
    items: [
      {
        ...existingRecord.items[0],
        id: "item-dashboard",
        itemTitle: "Dashboard",
        explanation: "Dashboard 解释。",
      },
    ],
  };
  const original = `${sourceLine}\n\n${buildClarificationBlock(dashboardRecord, settings)}Next paragraph.`;
  const nextJob = {
    ...job,
    id: "job-preservation-fails",
    notePath: "测试.md",
    selectedText: "LLM Agent",
    sourceBlock: sourceLine,
    sourceBlockHash: dashboardRecord.sourceBlockHash,
    proposedItemId: "llm-agent",
    userQuestion: "LLM Agent 是什么？",
    mergeProposal: createFallbackMergeProposal({
      job: {
        ...job,
        id: "job-preservation-fails",
        notePath: "测试.md",
        selectedText: "LLM Agent",
        sourceBlock: sourceLine,
        sourceBlockHash: dashboardRecord.sourceBlockHash,
        proposedItemId: "llm-agent",
        userQuestion: "LLM Agent 是什么？",
      },
      existingRecord: dashboardRecord,
      explanation: "LLM Agent 解释。",
      nowIso: "2026-07-03T12:12:00+02:00",
    }),
  };
  let writes = 0;
  const fakeApp = new FakeApp(original, "测试.md", (next) => {
    writes += 1;
    if (writes === 1) return next.replace(/> <!-- learnos-item-id: item-dashboard -->\n> \*\*Dashboard\*\* Dashboard 解释。\n?>?\n?/, "");
    return next;
  });
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(dashboardRecord);

  await assert.rejects(
    () =>
      applyAskJobProposal({
        app: fakeApp,
        jobStore: fakeJobStore,
        clarificationStore: fakeClarificationStore,
        settings: { ...settings, schemaVersion: 1 },
        job: nextJob,
      }),
    /Apply preservation failed/
  );

  assert.equal(fakeJobStore.status, "failed");
  assert.equal(fakeJobStore.savedJob.error.code, "apply-preservation-failed");
  assert.deepEqual(fakeJobStore.savedJob.error.missingItemIds, ["item-dashboard"]);
  assert.equal(fakeApp.modifiedMarkdown, original);
});

test("generated content proposal uses note callout and not my-understanding clarification", () => {
  const generatedJob = {
    ...job,
    selectedText: "Entropy of Confusion",
    userQuestion: "给我生成一个 cs2 职业选手 niko 的小趣事",
    rawAnswer: "NiKo 在 CS2 训练里常被队友调侃：他试枪时像在给地图做精密体检。",
    parsedAnswer: {
      answer: "NiKo 在 CS2 训练里常被队友调侃：他试枪时像在给地图做精密体检。",
      key_answer: "生成了一个 NiKo / CS2 小趣事。",
      suggested_takeaway: "NiKo 在 CS2 训练里常被队友调侃：他试枪时像在给地图做精密体检。",
      mastery_signal: "neutral",
      review_needed: false,
    },
  };
  const proposal = createFallbackMergeProposal({
    job: generatedJob,
    existingRecord: null,
    explanation: primaryProposalSourceText(generatedJob),
    nowIso: "2026-07-03T12:02:00+02:00",
  });
  const preview = buildGeneratedContentBlock(proposal, settings);

  assert.equal(proposal.action, "generated-content");
  assert.match(preview, /> \[!note\]- ✍️ AI 生成内容/);
  assert.match(preview, /learnos-generated-id: gen-/);
  assert.match(preview, /learnos-item-id:/);
  assert.match(preview, /NiKo|niko/i);
  assert.doesNotMatch(preview, /\[!tip\]- 💡 我的理解/);
  assert.doesNotMatch(preview, /Entropy of Confusion/);
});

test("generate intent normalizes old add-item merge proposal to generated-content", () => {
  const generatedJob = {
    ...job,
    selectedText: "随机原文",
    userQuestion: "生成一个 niko 小趣事",
    rawAnswer: "在 Niko 小时候，他把准星画在作业本角落，假装每道题都是一次 clutch。",
    parsedAnswer: {
      answer: "在 Niko 小时候，他把准星画在作业本角落，假装每道题都是一次 clutch。",
      key_answer: "生成了一个 Niko 小趣事。",
      suggested_takeaway: "在 Niko 小时候，他把准星画在作业本角落，假装每道题都是一次 clutch。",
      mastery_signal: "neutral",
      review_needed: false,
    },
  };
  const wrongProposal = {
    schemaVersion: 1,
    action: "add-item",
    targetItemId: null,
    proposedItems: [
      {
        ...existingRecord.items[0],
        id: "niko-fun-fact",
        itemTitle: "Niko 小趣事",
        explanation: "在 Niko 小时候，他把准星画在作业本角落，假装每道题都是一次 clutch。",
      },
    ],
    proposedVisibleMarkdown: "> [!tip]- 💡 我的理解\n> **Niko 小趣事** ...",
    reasoning: "wrong old path",
    confidence: "medium",
  };
  const normalized = normalizeProposalForAskIntent({
    job: generatedJob,
    existingRecord,
    proposal: wrongProposal,
    explanation: primaryProposalSourceText(generatedJob),
  });
  const preview = proposalPreviewMarkdown({
    job: generatedJob,
    proposal: normalized,
    existingRecord: null,
    settings,
  });

  assert.equal(normalized.action, "generated-content");
  assert.match(preview, /\[!note\]- ✍️ AI 生成内容/);
  assert.doesNotMatch(preview, /\[!tip\]- 💡 我的理解/);
});

test("generate intent deterministically canonicalizes story proposals from parsed answer", () => {
  const babelJob = {
    ...job,
    selectedText: "巴别塔",
    userQuestion: "讲一个巴别塔的小故事",
    rawAnswer: "```json\n{\"answer\":\"通天塔越建越高，人们的语言却越分越散。最后，一个孩子用图画把大家重新连接起来。\",\"key_answer\":\"巴别塔故事\",\"suggested_takeaway\":\"故事讲了沟通的重要性。\"}\n```",
    parsedAnswer: {
      answer: "通天塔越建越高，人们的语言却越分越散。最后，一个孩子用图画把大家重新连接起来。",
      key_answer: "巴别塔故事",
      suggested_takeaway: "故事讲了沟通的重要性。",
      mastery_signal: "neutral",
      review_needed: false,
    },
  };
  const oldClarificationProposal = {
    schemaVersion: 1,
    action: "add-item",
    targetItemId: "babel-story",
    proposedItems: [
      {
        ...existingRecord.items[0],
        id: "babel-story",
        itemTitle: "巴别塔故事",
        explanation: "旧 clarification 形状，不应该被直接采用。",
      },
    ],
    proposedVisibleMarkdown: "> [!tip]- 💡 我的理解\n> **巴别塔故事** 旧形状",
    reasoning: "old merge path",
    confidence: "medium",
  };
  const normalized = normalizeProposalForAskIntent({
    job: babelJob,
    existingRecord,
    proposal: oldClarificationProposal,
    explanation: primaryProposalSourceText(babelJob),
  });
  const preview = proposalPreviewMarkdown({
    job: babelJob,
    proposal: normalized,
    existingRecord: null,
    settings,
  });

  assert.equal(normalized.action, "generated-content");
  assert.match(preview, /> \[!note\]- ✍️ AI 生成内容/);
  assert.match(preview, /learnos-generated-id: gen-/);
  assert.match(preview, /learnos-item-id:/);
  assert.match(preview, /通天塔越建越高/);
  assert.doesNotMatch(preview, /\[!tip\]- 💡 我的理解/);
  assert.doesNotMatch(preview, /旧 clarification 形状/);
});

test("generated content proposal for Babel story renders a non-empty item", () => {
  const babelJob = {
    ...job,
    selectedText: "巴别塔",
    userQuestion: "生成一个巴别塔的小故事",
    rawAnswer: "以下是关于数字巴别塔的一个小故事。人们把知识堆成高塔，却在不同术语里迷路，最后用共同注释重新理解彼此。",
    parsedAnswer: {
      answer: "以下是关于数字巴别塔的一个小故事。人们把知识堆成高塔，却在不同术语里迷路，最后用共同注释重新理解彼此。",
      key_answer: "生成了一个巴别塔小故事。",
      suggested_takeaway: "以下是关于数字巴别塔的一个小故事。人们把知识堆成高塔，却在不同术语里迷路，最后用共同注释重新理解彼此。",
      mastery_signal: "neutral",
      review_needed: false,
    },
  };
  const proposal = createFallbackMergeProposal({
    job: babelJob,
    existingRecord: null,
    explanation: primaryProposalSourceText(babelJob),
    nowIso: "2026-07-03T12:02:00+02:00",
  });
  const preview = proposalPreviewMarkdown({ job: babelJob, proposal, existingRecord: null, settings });

  assert.equal(generatedContentMissingWarning(babelJob.userQuestion, primaryProposalSourceText(babelJob)), null);
  assert.match(preview, /learnos-generated-id: gen-/);
  assert.match(preview, /learnos-item-id:/);
  assert.match(preview, /数字巴别塔|巴别塔/);
  assert.notEqual(preview.trim().split("\n").length <= 3, true);
});

test("source-deleted apply policy disables explanation jobs but allows generated-content fallback", () => {
  const deletedState = {
    kind: "no-prior-block",
    notePath: job.notePath,
    sourceBlockStillExists: false,
  };
  const explainPolicy = sourceDeletedApplyPolicy({
    job: { ...job, userQuestion: "这是什么意思？" },
    liveState: deletedState,
    uiLanguage: "zh",
  });
  const generatePolicy = sourceDeletedApplyPolicy({
    job: { ...job, userQuestion: "讲一个巴别塔的小故事" },
    liveState: deletedState,
    uiLanguage: "zh",
  });

  assert.match(explainPolicy.warning ?? "", /原文段落已被删除/);
  assert.match(explainPolicy.applyDisabledReason ?? "", /不会自动插入/);
  assert.match(generatePolicy.warning ?? "", /生成内容将插入/);
  assert.equal(generatePolicy.applyDisabledReason, undefined);
});

test("unsatisfied generation proposal does not create a fake pending note item", () => {
  const generatedJob = {
    ...job,
    selectedText: "Entropy of Confusion",
    userQuestion: "给我生成一个 cs2 职业选手 niko 的小趣事",
    rawAnswer: "Entropy of Confusion 是一个用于描述困惑程度的概念。",
    parsedAnswer: {
      answer: "Entropy of Confusion 是一个用于描述困惑程度的概念。",
      key_answer: "解释了困惑熵。",
      suggested_takeaway: "困惑熵描述困惑程度。",
      mastery_signal: "neutral",
      review_needed: false,
    },
  };
  const proposal = createFallbackMergeProposal({
    job: generatedJob,
    existingRecord: null,
    explanation: primaryProposalSourceText(generatedJob),
    nowIso: "2026-07-03T12:02:00+02:00",
  });

  assert.equal(proposal.action, "generated-content");
  assert.equal(generatedContentMissingWarning(generatedJob.userQuestion, primaryProposalSourceText(generatedJob)) !== null, true);
  assert.deepEqual(proposal.proposedItems, []);
  assert.doesNotMatch(proposal.proposedVisibleMarkdown, /待处理|Niko 趣事生成请求/);
});

test("generated content apply falls back to heading end when source block changed", async () => {
  const markdown = "# Topic\n\nThis paragraph changed after the ask was created.\n\nTail.";
  const generatedJob = {
    ...job,
    id: "job-generated-fallback-source",
    notePath: "Generated.md",
    headingPath: ["Topic"],
    selectedText: "old selected",
    sourceBlock: "Original source block no longer exists.",
    sourceBlockHash: "missing-source",
    sourceStartOffset: undefined,
    sourceEndOffset: undefined,
    userQuestion: "生成一个巴别塔的小故事",
    rawAnswer: "以下是关于巴别塔的一个小故事。大家搭起高塔寻找同一种语言。",
    parsedAnswer: {
      answer: "以下是关于巴别塔的一个小故事。大家搭起高塔寻找同一种语言。",
      key_answer: "生成了巴别塔小故事。",
      suggested_takeaway: "以下是关于巴别塔的一个小故事。大家搭起高塔寻找同一种语言。",
      mastery_signal: "neutral",
      review_needed: false,
    },
  };
  const proposal = createFallbackMergeProposal({
    job: generatedJob,
    existingRecord: null,
    explanation: primaryProposalSourceText(generatedJob),
    nowIso: "2026-07-03T12:02:00+02:00",
  });
  const fakeApp = new FakeApp(markdown, "Generated.md");
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(null);

  await applyAskJobProposal({
    app: fakeApp,
    jobStore: fakeJobStore,
    clarificationStore: fakeClarificationStore,
    settings: { ...settings, schemaVersion: 1 },
    job: { ...generatedJob, mergeProposal: proposal },
  });

  assert.equal(fakeJobStore.status, "applied");
  assert.match(fakeApp.modifiedMarkdown, /\[!note\]- ✍️ AI 生成内容/);
  assert.match(fakeApp.modifiedMarkdown, /巴别塔/);
  assert.match(fakeApp.modifiedMarkdown, /Tail\./);
});

test("multi-line clarification explanation applies as one compact item", async () => {
  const source = "此时，我们需要启用反向传播算法来修正叙事的梯度消失问题。";
  const markdown = `# AI\n\n${source}`;
  const multilineJob = {
    ...job,
    id: "job-grad-multiline",
    notePath: "AI.md",
    headingPath: ["AI"],
    selectedText: "梯度",
    sourceBlock: source,
    sourceBlockHash: stableHashForTest(source),
    proposedItemId: "grad-item",
    userQuestion: "梯度是啥？",
    mergeProposal: {
      schemaVersion: 1,
      action: "create-clarification",
      targetItemId: null,
      operations: [
        {
          op: "add-item",
          itemId: "grad-item",
          targetText: "梯度",
          itemTitle: "梯度是啥？",
          explanation:
            "梯度定义...\n\n直观比喻：站在山坡上。\n\n叙事比喻：从损失计算对前文的影响方向就是梯度。",
        },
      ],
      proposedItems: [
        {
          ...existingRecord.items[0],
          id: "grad-item",
          targetText: "梯度",
          itemTitle: "梯度是啥？",
          question: "梯度是啥？",
          explanation:
            "梯度定义...\n\n直观比喻：站在山坡上。\n\n叙事比喻：从损失计算对前文的影响方向就是梯度。",
        },
      ],
      proposedVisibleMarkdown: "",
      reasoning: "add gradient",
      confidence: "high",
    },
  };
  const fakeApp = new FakeApp(markdown, "AI.md");
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(null);

  await applyAskJobProposal({
    app: fakeApp,
    jobStore: fakeJobStore,
    clarificationStore: fakeClarificationStore,
    settings: { ...settings, schemaVersion: 1 },
    job: multilineJob,
  });

  assert.equal((fakeApp.modifiedMarkdown.match(/learnos-item-id/g) ?? []).length, 1);
  assert.match(fakeApp.modifiedMarkdown, /learnos-item-id: grad-item/);
  assert.match(fakeApp.modifiedMarkdown, /> \*\*梯度是啥？\*\* 梯度定义\.\.\./);
  assert.match(fakeApp.modifiedMarkdown, /> 直观比喻：站在山坡上。/);
  assert.match(fakeApp.modifiedMarkdown, /> 叙事比喻：从损失计算对前文的影响方向就是梯度。/);
  assert.doesNotMatch(fakeApp.modifiedMarkdown, /Clarification 5|Clarification 6|clarification-5|clarification-6/);
});

test("concurrent jobs with empty initial state merge into one live clarification by source anchor", async () => {
  const initialMarkdown = `# Resampling\n\n${job.sourceBlock}\n\nNext paragraph.`;
  const fakeApp = new FakeApp(initialMarkdown, job.notePath);
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(null);
  const sourceAnchorKey = `${job.notePath}#${job.sourceBlockHash}#${job.headingPath.join(">")}`;

  const jobs = ["A", "B", "C"].map((label, index) => {
    const nextJob = {
      ...job,
      id: `job-${label}`,
      existingClarificationId: undefined,
      targetClarificationId: undefined,
      sourceAnchorKey,
      proposedItemId: `item-${label}`,
      selectedText: label,
      userQuestion: `${label} 是什么？`,
    };
    return {
      ...nextJob,
      mergeProposal: createFallbackMergeProposal({
        job: nextJob,
        existingRecord: null,
        explanation: `${label} 的解释。`,
        nowIso: `2026-07-03T12:1${index}:00+02:00`,
      }),
    };
  });

  for (const nextJob of jobs) {
    await applyAskJobProposal({
      app: fakeApp,
      jobStore: fakeJobStore,
      clarificationStore: fakeClarificationStore,
      settings: { ...settings, schemaVersion: 1 },
      job: nextJob,
    });
  }

  assert.equal((fakeApp.modifiedMarkdown.match(/learnos-clarification-id/g) ?? []).length, 1);
  assert.equal((fakeApp.modifiedMarkdown.match(/learnos-item-id/g) ?? []).length, 3);
  assert.match(fakeApp.modifiedMarkdown, /A 的解释/);
  assert.match(fakeApp.modifiedMarkdown, /B 的解释/);
  assert.match(fakeApp.modifiedMarkdown, /C 的解释/);
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

test("inbox tab sorting and previous next follow visible order", () => {
  const jobs = [
    { ...job, id: "old-ready", status: "completed", created: "2026-07-03T12:00:00+02:00" },
    { ...job, id: "new-ready", status: "completed", created: "2026-07-03T12:02:00+02:00" },
    { ...job, id: "old-failed", status: "failed", created: "2026-07-03T12:00:00+02:00" },
    { ...job, id: "new-failed", status: "failed", created: "2026-07-03T12:02:00+02:00" },
    { ...job, id: "old-history", status: "applied", created: "2026-07-03T12:00:00+02:00" },
    { ...job, id: "new-history", status: "applied", created: "2026-07-03T12:02:00+02:00" },
  ];

  assert.deepEqual(sortJobsForTab(jobs.filter((item) => item.status === "completed"), "ready").map((item) => item.id), [
    "old-ready",
    "new-ready",
  ]);
  assert.deepEqual(sortJobsForTab(jobs.filter((item) => item.status === "failed"), "failed").map((item) => item.id), [
    "new-failed",
    "old-failed",
  ]);
  assert.deepEqual(jobsForTab(jobs, "history").map((item) => item.id), ["new-history", "old-history"]);
  assert.equal(nextJobIdInTab(jobs, "old-ready", "ready"), "new-ready");
  assert.equal(nextJobIdInTab(jobs, "new-failed", "failed"), "old-failed");
  assert.equal(nextJobIdInTab(jobs, "new-history", "history"), "old-history");
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
    "job-orphan",
  ]);
  assert.deepEqual(plan.askJobsMissingClarificationRecords.map((item) => item.id).sort(), [
    "job-applied-missing-marker",
  ]);
  assert.deepEqual(plan.askJobsReferencingOrphanClarifications.map((item) => item.id), ["job-orphan"]);
  assert.deepEqual(plan.archivedJobs.map((item) => item.id), ["job-archived"]);
  assert.deepEqual(plan.appliedJobsMissingMarkers.map((item) => item.id), ["job-applied-missing-marker"]);
  assert.deepEqual(cleanupJobsForArchive(plan).map((item) => item.id).sort(), [
    "job-applied-missing-marker",
    "job-archived",
    "job-orphan",
  ]);
  assert.deepEqual(cleanupJobsForDelete(plan).map((item) => item.id).sort(), [
    "job-applied-missing-marker",
    "job-archived",
    "job-orphan",
  ]);
});

test("cleanup extracts referenced clarification ids from paths, proposal markdown, and dynamic fields", () => {
  const dynamicJob = {
    ...job,
    existingClarificationId: undefined,
    existingClarificationRecordPath: ".learning-os/clarifications/clar-from-path.json",
    mergeProposal: {
      schemaVersion: 1,
      action: "add-item",
      proposedItems: [],
      proposedVisibleMarkdown: "> **A** text\n\n%% learnos-clarification-id: clar-from-marker %%",
    },
    targetClarificationId: "clar-from-target",
    metadata: {
      clarificationId: "clar-from-metadata",
    },
  };

  assert.deepEqual(referencedClarificationIds(dynamicJob).sort(), [
    "clar-from-marker",
    "clar-from-metadata",
    "clar-from-path",
    "clar-from-target",
  ]);
});

test("cleanup does not confuse clar-prefixed item ids with clarification ids", () => {
  const clarificationId = "clar-20260703-093137-paragraph";
  const record = {
    ...existingRecord,
    id: clarificationId,
    items: [
      { ...existingRecord.items[0], id: "clar-2", itemTitle: "定式", explanation: "定式解释。" },
      { ...existingRecord.items[0], id: "clar-3", itemTitle: "过度的压缩", explanation: "压缩解释。" },
      { ...existingRecord.items[0], id: "clar-4", itemTitle: "因地制宜", explanation: "因地制宜解释。" },
    ],
  };
  const liveBlock = buildClarificationBlock(record, settings).replace(
    /> <!-- learnos-item-id: clar-2(?:; ask-ids: [^>]+)? -->\n> \*\*定式\*\*.*\n?>?\n?/,
    ""
  );
  const jobs = [
    {
      ...job,
      id: "job-deleted-item",
      status: "applied",
      existingClarificationId: clarificationId,
      appliedItemIds: ["clar-2"],
      mergeProposal: {
        ...job.mergeProposal,
        clarificationId,
        proposedVisibleMarkdown: buildClarificationBlock({ ...record, items: [record.items[0]] }, settings),
      },
    },
    {
      ...job,
      id: "job-live-item",
      status: "applied",
      existingClarificationId: clarificationId,
      appliedItemIds: ["clar-3"],
      mergeProposal: {
        ...job.mergeProposal,
        clarificationId,
        proposedVisibleMarkdown: buildClarificationBlock({ ...record, items: [record.items[1]] }, settings),
      },
    },
  ];
  const plan = buildOrphanCleanupPlan({
    markdownFiles: [{ path: record.notePath, content: liveBlock }],
    clarificationRecords: [record],
    askJobs: jobs,
  });

  assert.deepEqual(referencedClarificationIds(jobs[0]), [clarificationId]);
  assert.deepEqual(targetItemIds(jobs[0]).sort(), ["clar-2"]);
  assert.equal(plan.orphanClarifications.length, 0);
  assert.equal(plan.askJobsMissingClarificationRecords.length, 0);
  assert.deepEqual(plan.deletedItems.map((item) => item.item.id), ["clar-2"]);
  assert.deepEqual(plan.appliedJobsMissingItemMarkers.map((item) => item.id), ["job-deleted-item"]);
  assert.deepEqual(cleanupJobsForDelete(plan).map((item) => item.id), ["job-deleted-item"]);
});

test("cleanup keeps applied history when the live ask id still exists", () => {
  const clarificationId = "clar-20260703-094324-paragraph";
  const record = {
    ...existingRecord,
    id: clarificationId,
    items: [
      {
        ...existingRecord.items[0],
        id: "obsidian-clarification-1",
        itemTitle: "Obsidian",
        explanation: "Obsidian explanation.",
        relatedInteractionIds: ["ask-20260703-094257-sos0gh"],
      },
      {
        ...existingRecord.items[0],
        id: "item-001",
        itemTitle: "什么是 “summaries 化”？",
        explanation: "Summaries explanation.",
        relatedInteractionIds: ["ask-20260703-094306-dk0c6u", "ask-20260703-094417-p1hwm2"],
      },
    ],
  };
  const fullBlock = buildClarificationBlock(record, settings);
  const liveBlock = fullBlock.replace(
    /> <!-- learnos-item-id: item-001(?:; ask-ids: [^>]+)? -->\n> \*\*什么是 “summaries 化”？\*\*.*\n?/,
    ""
  );
  const jobs = [
    {
      ...job,
      id: "job-20260703-094257-sos0gh",
      status: "applied",
      existingClarificationId: clarificationId,
      mergeProposal: {
        ...job.mergeProposal,
        clarificationId,
        proposedVisibleMarkdown: fullBlock,
      },
    },
    {
      ...job,
      id: "job-20260703-094306-dk0c6u",
      status: "applied",
      existingClarificationId: clarificationId,
      mergeProposal: {
        ...job.mergeProposal,
        clarificationId,
        proposedVisibleMarkdown: fullBlock,
      },
    },
    {
      ...job,
      id: "job-20260703-094417-p1hwm2",
      status: "applied",
      existingClarificationId: clarificationId,
      mergeProposal: {
        ...job.mergeProposal,
        clarificationId,
        proposedVisibleMarkdown: fullBlock,
      },
    },
  ];
  const plan = buildOrphanCleanupPlan({
    markdownFiles: [{ path: record.notePath, content: liveBlock }],
    clarificationRecords: [record],
    askJobs: jobs,
  });

  assert.deepEqual(askIdsForJob(jobs[0]), ["job-20260703-094257-sos0gh", "ask-20260703-094257-sos0gh"]);
  assert.equal(plan.orphanClarifications.length, 0);
  assert.deepEqual(plan.deletedItems.map((item) => item.item.id), ["item-001"]);
  assert.deepEqual(plan.appliedJobsMissingItemMarkers.map((item) => item.id).sort(), [
    "job-20260703-094306-dk0c6u",
    "job-20260703-094417-p1hwm2",
  ]);
  assert.deepEqual(cleanupJobsForDelete(plan).map((item) => item.id).sort(), [
    "job-20260703-094306-dk0c6u",
    "job-20260703-094417-p1hwm2",
  ]);
});

test("cleanup preserves live ask ids even when backend clarification JSON is missing", () => {
  const clarificationId = "clar-20260703-095156-paragraph";
  const fullBlock = `> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: ${clarificationId} -->
>
> <!-- learnos-item-id: item-001; ask-ids: ask-20260703-095131-9sueft -->
> **summaries 的含义** summaries explanation.
>
> <!-- learnos-item-id: obsidian-term; ask-ids: ask-20260703-095123-7c3q7f -->
> **Obsidian 笔记软件** obsidian explanation.`;
  const liveBlock = `> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: ${clarificationId} -->
>
> <!-- learnos-item-id: obsidian-term; ask-ids: ask-20260703-095123-7c3q7f -->
> **Obsidian 笔记软件** obsidian explanation.`;
  const jobs = [
    {
      ...job,
      id: "job-20260703-095123-7c3q7f",
      status: "applied",
      existingClarificationId: clarificationId,
      mergeProposal: {
        ...job.mergeProposal,
        clarificationId,
        proposedVisibleMarkdown: fullBlock,
      },
    },
    {
      ...job,
      id: "job-20260703-095131-9sueft",
      status: "applied",
      existingClarificationId: clarificationId,
      mergeProposal: {
        ...job.mergeProposal,
        clarificationId,
        proposedVisibleMarkdown: fullBlock,
      },
    },
  ];
  const plan = buildOrphanCleanupPlan({
    markdownFiles: [{ path: existingRecord.notePath, content: liveBlock }],
    clarificationRecords: [],
    askJobs: jobs,
  });

  assert.deepEqual(plan.danglingMarkers.map((marker) => marker.id), [clarificationId]);
  assert.equal(plan.askJobsMissingClarificationRecords.length, 0);
  assert.deepEqual(plan.appliedJobsMissingMarkers.map((item) => item.id), []);
  assert.deepEqual(plan.appliedJobsMissingItemMarkers.map((item) => item.id), [
    "job-20260703-095131-9sueft",
  ]);
  assert.deepEqual(cleanupJobsForDelete(plan).map((item) => item.id), [
    "job-20260703-095131-9sueft",
  ]);
});

test("cleanup never deletes a clarification record while its paragraph marker still exists", () => {
  const clarificationId = "clar-empty-live-paragraph";
  const record = {
    ...existingRecord,
    id: clarificationId,
    items: [
      {
        ...existingRecord.items[0],
        id: "item-empty-test",
        relatedInteractionIds: ["ask-empty-test"],
      },
    ],
  };
  const liveBlockWithoutItems = `> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: ${clarificationId} -->
>`;
  const plan = buildOrphanCleanupPlan({
    markdownFiles: [{ path: record.notePath, content: liveBlockWithoutItems }],
    clarificationRecords: [record],
    askJobs: [
      {
        ...job,
        id: "job-empty-test",
        status: "applied",
        existingClarificationId: clarificationId,
        appliedItemIds: ["item-empty-test"],
      },
    ],
  });

  assert.equal(plan.liveClarificationIds.has(clarificationId), true);
  assert.equal(plan.orphanClarifications.length, 0);
  assert.deepEqual(plan.deletedItems.map((item) => item.item.id), ["item-empty-test"]);
  assert.deepEqual(plan.appliedJobsMissingMarkers.map((item) => item.id), []);
  assert.deepEqual(cleanupJobsForDelete(plan).map((item) => item.id), ["job-empty-test"]);
});

test("cleanup categories are empty only when every backend record still has live note content", () => {
  const plan = buildOrphanCleanupPlan({
    markdownFiles: [
      {
        path: "Stats/LOOCV.md",
        content: buildClarificationBlock({ ...existingRecord, id: "clar-live" }, settings),
      },
    ],
    clarificationRecords: [{ ...existingRecord, id: "clar-live" }],
    askJobs: [
      {
        ...job,
        id: "job-live",
        status: "applied",
        existingClarificationId: "clar-live",
        appliedItemIds: ["item-unbiased"],
      },
    ],
  });

  assert.equal(plan.orphanClarifications.length, 0);
  assert.equal(plan.appliedJobsMissingMarkers.length, 0);
  assert.equal(plan.askJobsMissingClarificationRecords.length, 0);
  assert.equal(plan.askJobsReferencingOrphanClarifications.length, 0);
  assert.equal(plan.deletedItems.length, 0);
  assert.equal(plan.appliedJobsMissingItemMarkers.length, 0);
  assert.equal(plan.danglingItemMarkers.length, 0);
  assert.equal(plan.danglingMarkers.length, 0);
  assert.equal(plan.archivedJobs.length, 0);
});

test("cleanup distinguishes deleted item marker from edited item text", () => {
  const editedLiveBlock = buildClarificationBlock(existingRecord, settings).replace("旧解释保留。", "用户手动改过的解释。");
  const editedPlan = buildOrphanCleanupPlan({
    markdownFiles: [{ path: existingRecord.notePath, content: editedLiveBlock }],
    clarificationRecords: [existingRecord],
    askJobs: [
      {
        ...job,
        id: "job-item-live",
        status: "applied",
        existingClarificationId: existingRecord.id,
        appliedItemIds: ["item-unbiased"],
      },
    ],
  });

  assert.equal(editedPlan.deletedItems.length, 0);
  assert.equal(editedPlan.appliedJobsMissingItemMarkers.length, 0);

  const deletedItemBlock = editedLiveBlock.replace(
    /> <!-- learnos-item-id: item-unbiased(?:; ask-ids: [^>]+)? -->\n> \*\*为什么叫无偏？\*\*.*\n?/,
    ""
  );
  const deletedPlan = buildOrphanCleanupPlan({
    markdownFiles: [{ path: existingRecord.notePath, content: deletedItemBlock }],
    clarificationRecords: [existingRecord],
    askJobs: [
      {
        ...job,
        id: "job-item-deleted",
        status: "applied",
        existingClarificationId: existingRecord.id,
        appliedItemIds: ["item-unbiased"],
      },
    ],
  });

  assert.deepEqual(deletedPlan.deletedItems.map((item) => item.item.id), ["item-unbiased"]);
  assert.deepEqual(deletedPlan.appliedJobsMissingItemMarkers.map((item) => item.id), ["job-item-deleted"]);
  assert.deepEqual(cleanupJobsForArchive(deletedPlan).map((item) => item.id), ["job-item-deleted"]);
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

class FakeApp {
  constructor(markdown, path, modifyHook = null) {
    this.modifiedMarkdown = markdown;
    this.file = { path, extension: "md" };
    this.vault = {
      getAbstractFileByPath: (requestedPath) => (requestedPath === path ? this.file : null),
      read: async () => this.modifiedMarkdown,
      modify: async (_file, nextMarkdown) => {
        this.modifiedMarkdown = modifyHook ? modifyHook(nextMarkdown) : nextMarkdown;
      },
    };
  }
}

class FakeJobStore {
  constructor() {
    this.appliedJobs = [];
  }

  async updateStatus(_job, status) {
    this.status = status;
    const next = { ..._job, status };
    this.savedJob = next;
    if (status === "applied") this.appliedJobs.push(next);
    return next;
  }

  async saveJob(job) {
    this.status = job.status;
    this.savedJob = job;
  }
}

class FakeClarificationStore {
  constructor(record) {
    this.record = record;
    this.savedRecord = null;
  }

  async readRecord(id) {
    return this.record && id === this.record.id ? this.record : null;
  }

  async findByNotePathAndSourceHash() {
    return this.record;
  }

  async saveRecord(record) {
    this.savedRecord = record;
    this.record = record;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
