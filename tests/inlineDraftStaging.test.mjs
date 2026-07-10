import assert from "node:assert/strict";
import test from "node:test";
import { buildClarificationBlock } from "../src/ask/ClarificationBlock.ts";
import { buildGeneratedContentBlock, createFallbackMergeProposal } from "../src/ask/ClarificationMergeProposal.ts";
import { applyAskJobProposal } from "../src/jobs/ApplyAskJobProposal.ts";
import { findAllInlineDraftBlocks, hasInlineDraftMarkers, removeInlineDraftBlock } from "../src/ask/InlineDraftBlock.ts";
import {
  inlineDraftStatusMessage,
  prepareInlineDraftApply,
  stageInlineDraftForJob,
} from "../src/ask/InlineDraftStaging.ts";

const settings = {
  enableExperimentalInlineDraftStaging: true,
  uiLanguage: "zh",
  answerLanguage: "auto",
};

const baseJob = {
  schemaVersion: 1,
  id: "job-inline-001",
  status: "completed",
  created: "2026-07-05T10:00:00+02:00",
  updated: "2026-07-05T10:01:00+02:00",
  notePath: "Stats/LOOCV.md",
  headingPath: ["LOOCV"],
  selectedText: "unbiased estimate",
  sourceBlock: "LOOCV gives an unbiased estimate.",
  sourceBlockHash: "hash-source-loocv",
  sourceStartOffset: 0,
  sourceEndOffset: "LOOCV gives an unbiased estimate.".length,
  askSourceMode: "normal-note",
  proposedItemId: "item-unbiased-new",
  userQuestion: "为什么无偏？",
  answerLanguage: "auto",
  uiLanguage: "zh",
  providerMode: "openai-compatible",
  providerPreset: "openai",
  model: "test-model",
  prompt: "prompt",
  rawAnswer: "平均来说不会系统性偏高或偏低。",
  mergeProposal: {
    schemaVersion: 1,
    action: "create-clarification",
    proposedItems: [
      {
        id: "item-unbiased-new",
        targetText: "unbiased estimate",
        itemTitle: "为什么无偏？",
        question: "为什么无偏？",
        explanation: "平均来说不会系统性偏高或偏低。",
        created: "2026-07-05T10:00:00+02:00",
        updated: "2026-07-05T10:01:00+02:00",
        relatedInteractionIds: ["job-inline-001"],
      },
    ],
    proposedVisibleMarkdown: "> **为什么无偏？** 平均来说不会系统性偏高或偏低。",
  },
};

const clarificationRecord = {
  schemaVersion: 1,
  id: "clar-loocv",
  notePath: "Stats/LOOCV.md",
  sourceBlock: baseJob.sourceBlock,
  sourceBlockHash: baseJob.sourceBlockHash,
  headingPath: ["LOOCV"],
  language: "auto",
  uiLanguage: "zh",
  created: "2026-07-05T09:00:00+02:00",
  updated: "2026-07-05T09:00:00+02:00",
  items: [
    {
      id: "item-existing",
      targetText: "LOOCV",
      itemTitle: "LOOCV",
      question: "LOOCV 是什么？",
      explanation: "逐一留出一个样本做验证。",
      created: "2026-07-05T09:00:00+02:00",
      updated: "2026-07-05T09:00:00+02:00",
      relatedInteractionIds: ["ask-old"],
    },
  ],
  interactions: [],
};

const adjacentTipRecord = {
  ...clarificationRecord,
  id: "clar-adjacent-tip",
  items: [
    {
      ...clarificationRecord.items[0],
      id: "item-adjacent-tip",
      targetText: "多尺度预测",
      itemTitle: "多尺度预测",
      question: "多尺度预测是什么？",
      explanation: "是让模型在不同分辨率上检测不同大小的物体。",
    },
  ],
};

test("normal note Ask stages an inline draft without final item markers", () => {
  const markdown = `${baseJob.sourceBlock}\n\nNext paragraph.`;
  const result = stageInlineDraftForJob({
    markdown,
    job: baseJob,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });

  assert.equal(result.changed, true);
  assert.equal(result.status, "created");
  assert.equal(hasInlineDraftMarkers(result.markdown), true);
  assert.equal((result.markdown.match(/learnos-draft-id/g) ?? []).length, 1);
  assert.equal((result.markdown.match(/learnos-draft-item-id/g) ?? []).length, 1);
  assert.equal((result.markdown.match(/learnos-item-id/g) ?? []).length, 0);

  const draft = findAllInlineDraftBlocks(result.markdown)[0];
  assert.equal(draft.kind, "clarification");
  assert.equal(draft.operation, "add-item");
  assert.equal(draft.sourceBlockHash, "hash-source-loocv");
  assert.equal(draft.items[0].title, "为什么无偏？");
});

test("normal-note add-item operation replaces generic AI item id with job proposed item id", async () => {
  const source = "竞赛算法、高级动态规划、线段树、树状数组、高级图论。";
  const oldBlock = buildClarificationBlock(
    {
      ...clarificationRecord,
      id: "clar-old-item-one",
      sourceBlock: "Old unrelated source.",
      sourceBlockHash: "old-hash",
      items: [
        {
          ...clarificationRecord.items[0],
          id: "item-1",
          targetText: "old",
          itemTitle: "Old",
          explanation: "Unrelated historical item.",
        },
      ],
    },
    settings
  );
  const job = {
    ...baseJob,
    id: "job-runtime-item-one",
    notePath: "测试.md",
    selectedText: "竞赛算法",
    sourceBlock: source,
    sourceBlockHash: "hash-competition-source",
    sourceStartOffset: undefined,
    sourceEndOffset: undefined,
    askSourceMode: "normal-note",
    proposedItemId: "item-20260710-185006-这是啥",
    targetItemId: "item-1",
    userQuestion: "这是啥",
    mergeProposal: {
      ...baseJob.mergeProposal,
      action: "add-item",
      targetItemId: "item-1",
      proposedItems: [
        {
          ...baseJob.mergeProposal.proposedItems[0],
          id: "item-1",
          targetText: "竞赛算法",
          itemTitle: "竞赛算法",
          question: "这是啥",
          explanation: "竞赛算法是算法竞赛中常用的高效算法与数据结构集合。",
        },
      ],
      operations: [
        {
          op: "add-item",
          itemId: "item-1",
          targetText: "竞赛算法",
          itemTitle: "竞赛算法",
          explanation: "竞赛算法是算法竞赛中常用的高效算法与数据结构集合。",
        },
      ],
      proposedVisibleMarkdown: "> **竞赛算法** 竞赛算法是算法竞赛中常用的高效算法与数据结构集合。",
    },
  };
  const staged = stageInlineDraftForJob({
    markdown: `${oldBlock}${source}\n\nTail.`,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });

  assert.match(staged.markdown, /learnos-draft-item-id: draft-item-20260710-185006-这是啥/);
  assert.doesNotMatch(staged.markdown, /learnos-draft-item-id: draft-item-1/);

  const fakeApp = new FakeApp(`${oldBlock}${source}\n\nTail.`, job.notePath);
  await applyAskJobProposal({
    app: fakeApp,
    jobStore: new FakeJobStore(),
    clarificationStore: new FakeClarificationStore(null),
    settings: { ...settings, schemaVersion: 1 },
    job,
  });

  assert.equal(countMatches(fakeApp.modifiedMarkdown, /learnos-item-id: item-1/g), 1);
  assert.equal(countMatches(fakeApp.modifiedMarkdown, /learnos-item-id: item-20260710-185006-这是啥/g), 1);
  assert.match(fakeApp.modifiedMarkdown, /竞赛算法是算法竞赛中常用的高效算法/);
});

test("Ask inside existing tip creates add-sibling draft and Apply uses live draft content", () => {
  const tip = buildClarificationBlock(clarificationRecord, settings);
  const markdown = `${baseJob.sourceBlock}\n\n${tip}Next paragraph.`;
  const job = {
    ...baseJob,
    id: "job-inline-tip",
    askSourceMode: "clarification-item",
    existingClarificationId: "clar-loocv",
    targetClarificationId: "clar-loocv",
    targetItemId: "item-existing",
    selectedLearningOsItem: {
      containerId: "clar-loocv",
      itemId: "item-existing",
      itemTitle: "LOOCV",
      itemContent: "逐一留出一个样本做验证。",
    },
  };
  const staged = stageInlineDraftForJob({
    markdown,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const editedDraft = staged.markdown.replace("平均来说不会系统性偏高或偏低。", "用户编辑后的 live draft 内容。");
  const preparation = prepareInlineDraftApply({
    markdown: editedDraft,
    job: { ...job, inlineDraft: { draftId: staged.draftId, status: staged.status } },
    settings,
    nowIso: "2026-07-05T10:03:00+02:00",
  });

  assert.equal(staged.status, "created");
  assert.equal(staged.operation, "add-sibling-item");
  assert.equal(staged.targetContainerId, "clar-loocv");
  assert.equal(preparation.kind, "ready");
  assert.match(preparation.editedVisibleMarkdown, /learnos-clarification-id: clar-loocv/);
  assert.match(preparation.editedVisibleMarkdown, /逐一留出一个样本做验证/);
  assert.match(preparation.editedVisibleMarkdown, /用户编辑后的 live draft 内容/);
  assert.match(preparation.editedVisibleMarkdown, /learnos-item-id: item-existing/);
  assert.match(preparation.editedVisibleMarkdown, /learnos-item-id: item-unbiased-new/);
});

test("Ask inside generated-content block creates add-sibling draft for the generated block", () => {
  const generated = buildGeneratedContentBlock(
    {
      generatedId: "gen-story",
      proposedItems: [
        {
          ...clarificationRecord.items[0],
          id: "item-story",
          itemTitle: "Story",
          explanation: "Original generated content.",
        },
      ],
    },
    settings
  );
  const markdown = `${baseJob.sourceBlock}\n\n${generated}Next paragraph.`;
  const job = {
    ...baseJob,
    id: "job-inline-generated",
    askSourceMode: "generated-content-item",
    selectedLearningOsItem: {
      containerId: "gen-story",
      itemId: "item-story",
      itemTitle: "Story",
      itemContent: "Original generated content.",
    },
    mergeProposal: {
      ...baseJob.mergeProposal,
      action: "generated-content",
      generatedId: "gen-story",
    },
  };
  const staged = stageInlineDraftForJob({
    markdown,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const preparation = prepareInlineDraftApply({
    markdown: staged.markdown,
    job: { ...job, inlineDraft: { draftId: staged.draftId, status: staged.status } },
    settings,
    nowIso: "2026-07-05T10:03:00+02:00",
  });

  assert.equal(staged.kind, "generated-content");
  assert.equal(staged.operation, "add-sibling-item");
  assert.equal(staged.targetContainerId, "gen-story");
  assert.equal(preparation.kind, "ready");
  assert.match(preparation.editedVisibleMarkdown, /learnos-generated-id: gen-story/);
  assert.match(preparation.editedVisibleMarkdown, /Original generated content/);
  assert.match(preparation.editedVisibleMarkdown, /learnos-item-id: item-unbiased-new/);
});

test("generated request inside an existing tip creates generated-content draft, not clarification target", () => {
  const tip = buildClarificationBlock(adjacentTipRecord, settings);
  const job = generatedStoryJob({
    id: "job-story-inside-tip-draft",
    selectedLearningOsItem: {
      containerId: "clar-adjacent-tip",
      itemId: "item-adjacent-tip",
      itemTitle: "多尺度预测",
      itemContent: "是让模型在不同分辨率上检测不同大小的物体。",
    },
  });
  const staged = stageInlineDraftForJob({
    markdown: `${tip}Tail.`,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const draft = findAllInlineDraftBlocks(staged.markdown)[0];

  assert.equal(staged.status, "created");
  assert.equal(draft.kind, "generated-content");
  assert.equal(draft.operation, "add-item");
  assert.equal(draft.targetContainerId, undefined);
  assert.doesNotMatch(draft.rawMarkdown, /learnos-item-id:/);
  assert.match(staged.markdown, /learnos-draft-kind: generated-content/);
});

test("applying generated draft from inside tip creates generated-content block without duplicating tip", async () => {
  const tip = buildClarificationBlock(adjacentTipRecord, settings);
  const job = generatedStoryJob({
    id: "job-story-inside-tip-apply",
    selectedLearningOsItem: {
      containerId: "clar-adjacent-tip",
      itemId: "item-adjacent-tip",
      itemTitle: "多尺度预测",
      itemContent: "是让模型在不同分辨率上检测不同大小的物体。",
    },
  });
  const staged = stageInlineDraftForJob({
    markdown: `${tip}Tail.`,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const finalMarkdown = await applyInlineDraft(staged.markdown, {
    ...job,
    inlineDraft: { draftId: staged.draftId, status: staged.status },
  }, adjacentTipRecord);

  assert.equal(countMatches(finalMarkdown, /learnos-clarification-id: clar-adjacent-tip/g), 1);
  assert.equal(countMatches(finalMarkdown, /learnos-item-id: item-adjacent-tip/g), 1);
  assert.equal(countMatches(finalMarkdown, /> \[!tip\]- 💡 我的理解/g), 1);
  assert.equal(countMatches(finalMarkdown, /> \[!note\]- ✍️ AI 生成内容/g), 1);
  assert.match(finalMarkdown, /learnos-generated-id: gen-/);
  assert.match(finalMarkdown, /learnos-item-id: item-story-generated/);
  assert.doesNotMatch(finalMarkdown, /learnos-draft-/);
  assert.equal(countMatches(finalMarkdown, /同时用放大镜和望远镜寻找不同大小的线索/g), 1);
  const tipOnly = finalMarkdown.slice(0, finalMarkdown.indexOf("> [!note]"));
  assert.doesNotMatch(tipOnly, /小故事/);
});

test("generated request inside tip with nearby generated block never merges into the tip", async () => {
  const tip = buildClarificationBlock(adjacentTipRecord, settings);
  const generated = buildGeneratedContentBlock(
    {
      generatedId: "gen-existing-story-block",
      proposedItems: [
        {
          ...clarificationRecord.items[0],
          id: "item-existing-story",
          itemTitle: "已有故事",
          explanation: "已有故事内容。",
        },
      ],
    },
    settings
  );
  const job = generatedStoryJob({
    id: "job-story-inside-tip-near-existing-generated",
    selectedLearningOsItem: {
      containerId: "clar-adjacent-tip",
      itemId: "item-adjacent-tip",
      itemTitle: "多尺度预测",
      itemContent: "是让模型在不同分辨率上检测不同大小的物体。",
    },
  });
  const staged = stageInlineDraftForJob({
    markdown: `${tip}${generated}Tail.`,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const finalMarkdown = await applyInlineDraft(staged.markdown, {
    ...job,
    inlineDraft: { draftId: staged.draftId, status: staged.status },
  }, adjacentTipRecord);

  assert.equal(countMatches(finalMarkdown, /learnos-clarification-id: clar-adjacent-tip/g), 1);
  assert.equal(countMatches(finalMarkdown, /learnos-item-id: item-adjacent-tip/g), 1);
  assert.match(finalMarkdown, /learnos-generated-id: gen-existing-story-block/);
  assert.match(finalMarkdown, /learnos-item-id: item-existing-story/);
  assert.match(finalMarkdown, /learnos-item-id: item-story-generated/);
  const tipOnly = finalMarkdown.slice(0, finalMarkdown.indexOf("> [!note]"));
  assert.doesNotMatch(tipOnly, /小故事/);
});

test("deleted draft is a no-op and target-missing preserves the draft", () => {
  const staged = stageInlineDraftForJob({
    markdown: `${baseJob.sourceBlock}\n\n${buildClarificationBlock(clarificationRecord, settings)}`,
    job: {
      ...baseJob,
      id: "job-inline-missing",
      askSourceMode: "clarification-item",
      selectedLearningOsItem: {
        containerId: "clar-loocv",
        itemId: "item-existing",
        itemTitle: "LOOCV",
        itemContent: "逐一留出一个样本做验证。",
      },
    },
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });

  const deleted = prepareInlineDraftApply({
    markdown: baseJob.sourceBlock,
    job: { ...baseJob, id: "job-inline-missing", inlineDraft: { draftId: staged.draftId, status: staged.status } },
    settings,
    nowIso: "2026-07-05T10:03:00+02:00",
  });
  assert.equal(deleted.kind, "deleted");

  const missingTarget = prepareInlineDraftApply({
    markdown: staged.markdown.replace(buildClarificationBlock(clarificationRecord, settings).trim(), ""),
    job: { ...baseJob, id: "job-inline-missing", inlineDraft: { draftId: staged.draftId, status: staged.status } },
    settings,
    nowIso: "2026-07-05T10:03:00+02:00",
  });
  assert.equal(missingTarget.kind, "target-missing");
  assert.match(inlineDraftStatusMessage(missingTarget.job, "zh"), /目标 Learning OS block 缺失/);
});

test("generated target deleted before Apply returns target-missing and preserves draft", () => {
  const generated = buildGeneratedContentBlock(
    {
      generatedId: "gen-delete-target",
      proposedItems: [
        {
          ...clarificationRecord.items[0],
          id: "item-delete-target",
          itemTitle: "Generated",
          explanation: "Generated content.",
        },
      ],
    },
    settings
  );
  const job = {
    ...baseJob,
    id: "job-generated-target-deleted",
    askSourceMode: "generated-content-item",
    selectedLearningOsItem: {
      containerId: "gen-delete-target",
      itemId: "item-delete-target",
      itemTitle: "Generated",
      itemContent: "Generated content.",
    },
    mergeProposal: {
      ...baseJob.mergeProposal,
      action: "generated-content",
      generatedId: "gen-delete-target",
    },
  };
  const staged = stageInlineDraftForJob({
    markdown: `${generated}Tail.`,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const markdownWithoutTarget = staged.markdown.replace(generated.trim(), "");
  const preparation = prepareInlineDraftApply({
    markdown: markdownWithoutTarget,
    job: { ...job, inlineDraft: { draftId: staged.draftId, status: staged.status } },
    settings,
    nowIso: "2026-07-05T10:03:00+02:00",
  });

  assert.equal(preparation.kind, "target-missing");
  assert.match(markdownWithoutTarget, /learnos-draft-id/);
  assert.doesNotMatch(markdownWithoutTarget, /learnos-item-id: item-unbiased-new/);
});

test("tip clarification question appends without copying Cloud Deployment tip", async () => {
  const cloudRecord = {
    ...clarificationRecord,
    id: "clar-20260705-212857-333-xls6lc-normal-note",
    items: [
      {
        ...clarificationRecord.items[0],
        id: "cloud-deployment-def",
        targetText: "Cloud Deployment",
        itemTitle: "Cloud Deployment（云部署）",
        question: "Cloud Deployment 是什么？",
        explanation:
          "Cloud Deployment（云部署）是指将应用程序、服务或基础设施部署到云平台（如 AWS、Azure、Google Cloud）上的过程。本补充模块 E 将专门讲解云部署的相关概念、策略和实践方法。",
      },
    ],
  };
  const tip = buildClarificationBlock(cloudRecord, settings);
  const job = clarificationInsideTipJob(
    "job-cloud-tip-what-is-this",
    cloudRecord,
    "aws-def",
    "AWS 是什么？",
    "AWS 是 Amazon Web Services，是常见的云平台之一。"
  );
  const staged = stageInlineDraftForJob({
    markdown: `${tip}Tail.`,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const finalMarkdown = await applyInlineDraft(staged.markdown, {
    ...job,
    inlineDraft: { draftId: staged.draftId, status: staged.status },
  }, cloudRecord);

  assert.equal(countMatches(finalMarkdown, /> \[!tip\]- 💡 我的理解/g), 1);
  assert.equal(countMatches(finalMarkdown, /learnos-clarification-id: clar-20260705-212857-333-xls6lc-normal-note/g), 1);
  assert.equal(countMatches(finalMarkdown, /learnos-item-id: cloud-deployment-def/g), 1);
  assert.equal(countMatches(finalMarkdown, /learnos-item-id: aws-def/g), 1);
  assert.doesNotMatch(finalMarkdown, /learnos-draft-/);
});

test("runtime Cloud Deployment tip target updates even when source block is not adjacent", async () => {
  const cloudRecord = cloudDeploymentRecord();
  const tip = buildClarificationBlock(cloudRecord, settings);
  const source = "补充模块 E: Cloud Deployment";
  const generated = buildGeneratedContentBlock(
    {
      generatedId: "gen-cloud-story-runtime",
      proposedItems: [
        {
          ...clarificationRecord.items[0],
          id: "item-cloud-story-runtime",
          itemTitle: "云部署小故事",
          explanation: "一个已经存在的云部署故事。",
        },
      ],
    },
    settings
  );
  const markdown = `${source}\n\n${generated}${tip}Tail.`;
  const job = {
    ...clarificationInsideTipJob(
      "job-runtime-cloud-tip-aws",
      cloudRecord,
      "aws-def",
      "AWS (Amazon Web Services)",
      "AWS 是 Amazon Web Services，是云部署常见目标平台之一。"
    ),
    selectedText: "AWS",
    sourceBlock: source,
    sourceBlockHash: "8cfe9d16",
    sourceStartOffset: 0,
    sourceEndOffset: source.length,
    userQuestion: "这是什么",
  };
  const staged = stageInlineDraftForJob({
    markdown,
    job,
    settings,
    nowIso: "2026-07-05T21:51:00.766Z",
  });
  const finalMarkdown = await applyInlineDraft(staged.markdown, {
    ...job,
    inlineDraft: { draftId: staged.draftId, status: staged.status },
  }, cloudRecord);

  assert.equal(countMatches(finalMarkdown, /> \[!tip\]- 💡 我的理解/g), 1);
  assert.equal(countMatches(finalMarkdown, /learnos-clarification-id: clar-20260705-212857-333-xls6lc-normal-note/g), 1);
  assert.equal(countMatches(finalMarkdown, /learnos-item-id: cloud-deployment-def/g), 1);
  assert.equal(countMatches(finalMarkdown, /learnos-item-id: aws-def/g), 1);
  assert.match(finalMarkdown, /learnos-generated-id: gen-cloud-story-runtime/);
  assert.doesNotMatch(finalMarkdown, /learnos-draft-/);
});

test("runtime generated block story fallback creates non-empty generated suggestion", () => {
  const job = runtimeGeneratedStoryJob({
    id: "job-runtime-generated-story-empty-suggestion",
    question: "讲一个云的小故事。",
    proposedItemId: "item-20260705-234904-讲一个云的小故事",
    answer:
      "从前有家智慧书店，网站从办公室旧电脑搬到云上。流量暴涨时云服务器自动扩容，促销结束后自动缩回。",
    key: "一个小故事说明云部署的弹性伸缩优势。",
    takeaway: "Cloud Deployment 的核心价值是弹性伸缩、按需付费、免运维。",
  });
  const proposal = createFallbackMergeProposal({
    job,
    existingRecord: null,
    explanation: job.parsedAnswer.answer,
    nowIso: "2026-07-05T21:50:24.147Z",
  });
  const draftJob = {
    ...job,
    mergeProposal: {
      ...proposal,
      generatedId: "gen-20260705-234359-425-rp7sfc-normal-note",
    },
  };
  const markdown = `${runtimeGeneratedCloudBlock()}Tail.`;
  const staged = stageInlineDraftForJob({
    markdown,
    job: draftJob,
    settings,
    nowIso: "2026-07-05T21:50:24.147Z",
  });

  assert.equal(job.rawAnswer.length > 0, true);
  assert.equal(Boolean(job.parsedAnswer.key_answer), true);
  assert.equal(proposal.proposedItems.length, 1);
  assert.match(proposal.proposedVisibleMarkdown, /> \[!note\]- ✍️ AI 生成内容/);
  assert.match(proposal.proposedVisibleMarkdown, /learnos-item-id: item-20260705-234904-讲一个云的小故事/);
  assert.equal(staged.status, "created");
  assert.equal(staged.kind, "generated-content");
  assert.equal(staged.targetContainerId, "gen-20260705-234359-425-rp7sfc-normal-note");
});

test("duplicate item marker during generated apply is rolled back and fails the job", async () => {
  const source = "Cloud Deployment source.";
  const original = `${source}\n\n> [!tip]- 💡 我的理解\n> <!-- learnos-clarification-id: clar-existing -->\n>\n> <!-- learnos-item-id: duplicate-item -->\n> **Existing** Existing item.\n\nTail.`;
  const job = {
    ...baseJob,
    id: "job-duplicate-generated-marker",
    notePath: "Generated.md",
    selectedText: "Cloud Deployment",
    sourceBlock: source,
    sourceBlockHash: "hash-cloud",
    sourceStartOffset: 0,
    sourceEndOffset: source.length,
    userQuestion: "编一个小故事",
    mergeProposal: {
      schemaVersion: 1,
      action: "generated-content",
      generatedId: "gen-duplicate-check",
      proposedItems: [
        {
          ...baseJob.mergeProposal.proposedItems[0],
          id: "duplicate-item",
          itemTitle: "重复故事",
          explanation: "这个输出会重复已有 item marker。",
        },
      ],
      proposedVisibleMarkdown: "",
    },
  };
  const fakeApp = new FakeApp(original, job.notePath);
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(null);

  await assert.rejects(
    applyAskJobProposal({
      app: fakeApp,
      jobStore: fakeJobStore,
      clarificationStore: fakeClarificationStore,
      settings: { ...settings, schemaVersion: 1 },
      job,
    }),
    /duplicate-marker/
  );
  assert.equal(fakeApp.modifiedMarkdown, original);
  assert.equal(fakeJobStore.savedJob.status, "failed");
  assert.equal(fakeJobStore.savedJob.error.code, "apply-duplicate-markers-failed");
});

test("unrelated historical duplicate marker does not block a safe generated apply", async () => {
  const source = "Cloud Deployment source.";
  const oldA =
    "> [!tip]- 💡 我的理解\n> <!-- learnos-clarification-id: clar-old-a -->\n>\n> <!-- learnos-item-id: item-old-duplicate -->\n> **Old A** Historical duplicate.";
  const oldB =
    "> [!tip]- 💡 我的理解\n> <!-- learnos-clarification-id: clar-old-b -->\n>\n> <!-- learnos-item-id: item-old-duplicate -->\n> **Old B** Historical duplicate.";
  const original = `${source}\n\n${oldA}\n\n${oldB}\n\nTail.`;
  const job = generatedApplyJob({
    id: "job-safe-with-historical-duplicate",
    source,
    generatedId: "gen-safe-with-historical-duplicate",
    itemId: "item-new-safe-story",
    explanation: "新的云部署故事，和历史重复 marker 无关。",
  });
  const fakeApp = new FakeApp(original, job.notePath);
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(null);

  await applyAskJobProposal({
    app: fakeApp,
    jobStore: fakeJobStore,
    clarificationStore: fakeClarificationStore,
    settings: { ...settings, schemaVersion: 1 },
    job,
  });

  assert.equal(fakeJobStore.savedJob.status, "applied");
  assert.equal(countMatches(fakeApp.modifiedMarkdown, /learnos-item-id: item-old-duplicate/g), 2);
  assert.match(fakeApp.modifiedMarkdown, /learnos-item-id: item-new-safe-story/);
});

test("worsening a historical duplicate marker is rolled back", async () => {
  const source = "Cloud Deployment source.";
  const original = `${source}\n\n> [!tip]- 💡 我的理解\n> <!-- learnos-clarification-id: clar-old-a -->\n>\n> <!-- learnos-item-id: item-old-duplicate -->\n> **Old A** Historical duplicate.\n\n> [!tip]- 💡 我的理解\n> <!-- learnos-clarification-id: clar-old-b -->\n>\n> <!-- learnos-item-id: item-old-duplicate -->\n> **Old B** Historical duplicate.\n\nTail.`;
  const job = generatedApplyJob({
    id: "job-worsens-historical-duplicate",
    source,
    generatedId: "gen-worsens-historical-duplicate",
    itemId: "item-old-duplicate",
    explanation: "这次 Apply 会把旧重复从两个变成三个。",
  });
  const fakeApp = new FakeApp(original, job.notePath);
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(null);

  await assert.rejects(
    applyAskJobProposal({
      app: fakeApp,
      jobStore: fakeJobStore,
      clarificationStore: fakeClarificationStore,
      settings: { ...settings, schemaVersion: 1 },
      job,
    }),
    /duplicate-marker/
  );
  assert.equal(fakeApp.modifiedMarkdown, original);
  assert.deepEqual(fakeJobStore.savedJob.error.duplicateItemIds, ["item-old-duplicate"]);
});

test("ambiguous generated target rolls back and preserves the inline draft", async () => {
  const targetA = buildGeneratedContentBlock(
    {
      generatedId: "gen-ambiguous-target",
      proposedItems: [
        {
          ...clarificationRecord.items[0],
          id: "item-ambiguous-target",
          itemTitle: "Target A",
          explanation: "First target copy.",
        },
      ],
    },
    settings
  );
  const targetB = buildGeneratedContentBlock(
    {
      generatedId: "gen-ambiguous-target",
      proposedItems: [
        {
          ...clarificationRecord.items[0],
          id: "item-ambiguous-target",
          itemTitle: "Target B",
          explanation: "Second target copy.",
        },
      ],
    },
    settings
  );
  const job = generatedBlockJob({
    id: "job-ambiguous-generated-target",
    question: "再编一个完全不同的故事",
    action: "generated-content",
    itemId: "item-new-story-for-ambiguous-target",
    itemTitle: "新故事",
    explanation: "目标重复时，这个 draft 应该保留。",
  });
  const ambiguousJob = {
    ...job,
    selectedLearningOsItem: {
      containerId: "gen-ambiguous-target",
      itemId: "item-ambiguous-target",
      itemTitle: "Target A",
      itemContent: "First target copy.",
    },
    targetItemId: "item-ambiguous-target",
  };
  const staged = stageInlineDraftForJob({
    markdown: `${targetA}${targetB}Tail.`,
    job: ambiguousJob,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const preparation = prepareInlineDraftApply({
    markdown: staged.markdown,
    job: { ...ambiguousJob, inlineDraft: { draftId: staged.draftId, status: staged.status } },
    settings,
    nowIso: "2026-07-05T10:04:00+02:00",
  });
  const fakeApp = new FakeApp(staged.markdown, ambiguousJob.notePath);
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(null);

  assert.equal(preparation.kind, "ready");
  await assert.rejects(
    applyAskJobProposal({
      app: fakeApp,
      jobStore: fakeJobStore,
      clarificationStore: fakeClarificationStore,
      settings: { ...settings, schemaVersion: 1 },
      job: preparation.job,
      editedVisibleMarkdown: preparation.editedVisibleMarkdown,
    }),
    /target Learning OS marker appears multiple times/
  );
  assert.equal(fakeApp.modifiedMarkdown, staged.markdown);
  assert.match(fakeApp.modifiedMarkdown, /learnos-draft-id/);
  assert.deepEqual(fakeJobStore.savedJob.error.ambiguousTargetGeneratedIds, ["gen-ambiguous-target"]);
  assert.deepEqual(fakeJobStore.savedJob.error.ambiguousTargetItemIds, ["item-ambiguous-target"]);
});

test("normal-note generated outputs stay below the selected source in apply order", async () => {
  const source = "Normal source paragraph for generated content.";
  let markdown = `# Topic\n\n${source}\n\n## Next\n\nAfter.`;
  const jobs = [
    generatedApplyJob({
      id: "job-generated-placement-one",
      source,
      generatedId: "gen-placement-one",
      itemId: "item-placement-one",
      explanation: "第一个故事。",
    }),
    generatedApplyJob({
      id: "job-generated-placement-two",
      source,
      generatedId: "gen-placement-two",
      itemId: "item-placement-two",
      explanation: "第二个故事。",
    }),
    generatedApplyJob({
      id: "job-generated-placement-three",
      source,
      generatedId: "gen-placement-three",
      itemId: "item-placement-three",
      explanation: "第三个故事。",
    }),
  ];

  for (const applyJob of jobs) {
    const fakeApp = new FakeApp(markdown, applyJob.notePath);
    await applyAskJobProposal({
      app: fakeApp,
      jobStore: new FakeJobStore(),
      clarificationStore: new FakeClarificationStore(null),
      settings: { ...settings, schemaVersion: 1 },
      job: applyJob,
    });
    markdown = fakeApp.modifiedMarkdown;
  }

  assert.equal(markdown.indexOf(source) < markdown.indexOf("item-placement-one"), true);
  assert.equal(markdown.indexOf("item-placement-one") < markdown.indexOf("item-placement-two"), true);
  assert.equal(markdown.indexOf("item-placement-two") < markdown.indexOf("item-placement-three"), true);
  assert.equal(markdown.indexOf("item-placement-three") < markdown.indexOf("## Next"), true);
});

test("inline draft removal deletes lazy continuation body without leaving duplicate story text", () => {
  const finalBlock =
    "> [!note]- ✍️ AI 生成内容\n> <!-- learnos-generated-id: gen-duplicate-body -->\n>\n> <!-- learnos-item-id: item-duplicate-body -->\n> **Story** UNIQUE-STORY-SENTENCE-ALPHA\n> UNIQUE-STORY-SENTENCE-BETA\n\n";
  const draftBlock =
    "> [!todo]- ✍️ Learning OS draft\n> <!-- learnos-draft-id: draft-job-duplicate-body -->\n> <!-- learnos-draft-job-id: job-duplicate-body -->\n> <!-- learnos-draft-kind: generated-content -->\n> <!-- learnos-draft-operation: add-item -->\n>\n> <!-- learnos-draft-item-id: draft-item-duplicate-body -->\n> **Story** UNIQUE-STORY-SENTENCE-ALPHA\nUNIQUE-STORY-SENTENCE-BETA\n\nTail.";
  const afterApply = `${finalBlock}${draftBlock}`;
  const draft = findAllInlineDraftBlocks(afterApply)[0];
  const withoutDraft = removeInlineDraftBlock(afterApply, draft);

  assert.equal(countMatches(withoutDraft, /UNIQUE-STORY-SENTENCE-ALPHA/g), 1);
  assert.equal(countMatches(withoutDraft, /UNIQUE-STORY-SENTENCE-BETA/g), 1);
  assert.equal(countMatches(withoutDraft, /learnos-draft/g), 0);
  assert.doesNotMatch(withoutDraft, /draft-item-duplicate-body/);
});

test("normal-note staging ignores stale offsets and uses the live source block", () => {
  const shiftedMarkdown = `Inserted paragraph before source.\n\n${baseJob.sourceBlock}\n\nTail.`;
  const staleOffsetJob = {
    ...baseJob,
    id: "job-stale-normal-offset",
    sourceStartOffset: 0,
    sourceEndOffset: baseJob.sourceBlock.length,
  };
  const staged = stageInlineDraftForJob({
    markdown: shiftedMarkdown,
    job: staleOffsetJob,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });

  assert.equal(staged.status, "created");
  assert.equal(staged.markdown.indexOf(baseJob.sourceBlock) < staged.markdown.indexOf("learnos-draft-id"), true);
  assert.equal(staged.markdown.indexOf("learnos-draft-id") < staged.markdown.indexOf("Tail."), true);
});

test("adjacent tip to note matrix keeps generated output below tip with unique body", async () => {
  const tip = buildClarificationBlock(adjacentTipRecord, settings);
  const existingGenerated = buildGeneratedContentBlock(
    {
      generatedId: "gen-adjacent-matrix-existing",
      proposedItems: [
        {
          ...clarificationRecord.items[0],
          id: "item-adjacent-matrix-existing",
          itemTitle: "Existing note",
          explanation: "Existing generated note.",
        },
      ],
    },
    settings
  );
  const job = generatedStoryJob({
    id: "job-adjacent-tip-to-note-generated",
    selectedLearningOsItem: {
      containerId: "clar-adjacent-tip",
      itemId: "item-adjacent-tip",
      itemTitle: "多尺度预测",
      itemContent: "是让模型在不同分辨率上检测不同大小的物体。",
    },
  });
  const uniqueJob = {
    ...job,
    mergeProposal: {
      ...job.mergeProposal,
      proposedItems: [
        {
          ...job.mergeProposal.proposedItems[0],
          explanation: "UNIQUE-STORY-SENTENCE-ALPHA。UNIQUE-STORY-SENTENCE-BETA。",
        },
      ],
    },
  };
  const staged = stageInlineDraftForJob({
    markdown: `${tip}${existingGenerated}Tail.`,
    job: uniqueJob,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const finalMarkdown = await applyInlineDraft(staged.markdown, {
    ...uniqueJob,
    inlineDraft: { draftId: staged.draftId, status: staged.status },
  }, adjacentTipRecord);

  assert.equal(finalMarkdown.indexOf("clar-adjacent-tip") < finalMarkdown.indexOf("UNIQUE-STORY-SENTENCE-ALPHA"), true);
  assert.equal(countMatches(finalMarkdown, /UNIQUE-STORY-SENTENCE-ALPHA/g), 1);
  assert.equal(countMatches(finalMarkdown, /UNIQUE-STORY-SENTENCE-BETA/g), 1);
  assert.equal(countMatches(finalMarkdown, /learnos-draft/g), 0);
  assert.equal(countMatches(finalMarkdown, /learnos-item-id: item-adjacent-tip/g), 1);
});

test("adjacent tip to note matrix keeps clarification inside the source tip", async () => {
  const tip = buildClarificationBlock(adjacentTipRecord, settings);
  const generated = generatedCloudStoryBlock();
  const job = clarificationInsideTipJob("job-adjacent-tip-to-note-clarification", adjacentTipRecord);
  const staged = stageInlineDraftForJob({
    markdown: `${tip}${generated}Tail.`,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const finalMarkdown = await applyInlineDraft(staged.markdown, {
    ...job,
    inlineDraft: { draftId: staged.draftId, status: staged.status },
  }, adjacentTipRecord);

  assert.equal(countMatches(finalMarkdown, /learnos-clarification-id: clar-adjacent-tip/g), 1);
  assert.equal(countMatches(finalMarkdown, /learnos-item-id: item-adjacent-tip/g), 1);
  assert.equal(countMatches(finalMarkdown, /learnos-item-id: item-unbiased-new/g), 1);
  assert.equal(countMatches(finalMarkdown, /learnos-generated-id: gen-cloud-story/g), 1);
});

test("adjacent note to tip matrix appends generated item to the source note", async () => {
  const generated = generatedCloudStoryBlock();
  const tip = buildClarificationBlock(adjacentTipRecord, settings);
  const job = generatedBlockJob({
    id: "job-adjacent-note-to-tip-generated",
    question: "编一个简短故事",
    action: "generated-content",
    itemId: "item-adjacent-note-generated",
    itemTitle: "相邻 note 新故事",
    explanation: "UNIQUE-NOTE-STORY-SENTENCE。",
  });
  const staged = stageInlineDraftForJob({
    markdown: `${generated}${tip}Tail.`,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const finalMarkdown = await applyInlineDraft(staged.markdown, {
    ...job,
    inlineDraft: { draftId: staged.draftId, status: staged.status },
  });

  assert.equal(countMatches(finalMarkdown, /learnos-generated-id: gen-cloud-story/g), 1);
  assert.equal(countMatches(finalMarkdown, /learnos-item-id: item-cloud-story/g), 1);
  assert.equal(countMatches(finalMarkdown, /learnos-item-id: item-adjacent-note-generated/g), 1);
  assert.equal(countMatches(finalMarkdown, /UNIQUE-NOTE-STORY-SENTENCE/g), 1);
  assert.equal(finalMarkdown.indexOf("item-adjacent-note-generated") < finalMarkdown.indexOf("clar-adjacent-tip"), true);
});

test("adjacent note to tip matrix inserts clarification directly below the source note", async () => {
  const generated = generatedCloudStoryBlock();
  const tip = buildClarificationBlock(adjacentTipRecord, settings);
  const job = generatedBlockJob({
    id: "job-adjacent-note-to-tip-clarification",
    question: "这是什么？",
    action: "add-item",
    itemId: "item-adjacent-note-clarification",
    itemTitle: "Claude 是什么？",
    explanation: "Claude 是故事里的主体，用来承载解释。",
  });
  const staged = stageInlineDraftForJob({
    markdown: `${generated}${tip}Tail.`,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const finalMarkdown = await applyInlineDraft(staged.markdown, {
    ...job,
    inlineDraft: { draftId: staged.draftId, status: staged.status },
  });

  assert.equal(finalMarkdown.indexOf("learnos-generated-id: gen-cloud-story") < finalMarkdown.indexOf("item-adjacent-note-clarification"), true);
  assert.equal(finalMarkdown.indexOf("item-adjacent-note-clarification") < finalMarkdown.indexOf("clar-adjacent-tip"), true);
  assert.equal(countMatches(finalMarkdown, /learnos-item-id: item-adjacent-note-clarification/g), 1);
  assert.equal(countMatches(finalMarkdown, /learnos-draft/g), 0);
});

test("complex continuous tip-note matrix applies final block next to the selected source container", async () => {
  const blocks = [
    matrixTip("clar-matrix-a", "item-matrix-a", "Tip A", "A source item content."),
    matrixGenerated("gen-matrix-b", "item-matrix-b", "Note B", "B source generated content."),
    matrixTip("clar-matrix-c", "item-matrix-c", "Tip C", "C source item content."),
    matrixGenerated("gen-matrix-d", "item-matrix-d", "Note D", "D source generated content."),
    matrixGenerated("gen-matrix-e", "item-matrix-e", "Note E", "E unrelated generated content."),
    matrixTip("clar-matrix-f", "item-matrix-f", "Tip F", "F source item content."),
    matrixGenerated("gen-matrix-g", "item-matrix-g", "Note G", "G unrelated generated content."),
  ];
  const baseMarkdown = `${blocks.join("")}Tail.`;
  const cases = [
    {
      name: "tip-a-to-generated",
      job: matrixTipToGeneratedJob("job-matrix-tip-a", "clar-matrix-a", "item-matrix-a", "Tip A", "A source item content.", "item-matrix-new-a"),
      before: "item-matrix-a",
      inserted: "item-matrix-new-a",
      after: "gen-matrix-b",
    },
    {
      name: "note-b-to-generated",
      job: matrixNoteToGeneratedJob("job-matrix-note-b", "gen-matrix-b", "item-matrix-b", "Note B", "B source generated content.", "item-matrix-new-b"),
      before: "item-matrix-b",
      inserted: "item-matrix-new-b",
      after: "clar-matrix-c",
    },
    {
      name: "tip-c-to-generated",
      job: matrixTipToGeneratedJob("job-matrix-tip-c", "clar-matrix-c", "item-matrix-c", "Tip C", "C source item content.", "item-matrix-new-c"),
      before: "item-matrix-c",
      inserted: "item-matrix-new-c",
      after: "gen-matrix-d",
    },
    {
      name: "note-d-to-clarification",
      job: matrixNoteToClarificationJob("job-matrix-note-d", "gen-matrix-d", "item-matrix-d", "Note D", "D source generated content.", "item-matrix-new-d"),
      before: "item-matrix-d",
      inserted: "item-matrix-new-d",
      after: "gen-matrix-e",
    },
    {
      name: "tip-f-to-generated",
      job: matrixTipToGeneratedJob("job-matrix-tip-f", "clar-matrix-f", "item-matrix-f", "Tip F", "F source item content.", "item-matrix-new-f"),
      before: "item-matrix-f",
      inserted: "item-matrix-new-f",
      after: "gen-matrix-g",
    },
  ];

  for (const item of cases) {
    const staged = stageInlineDraftForJob({
      markdown: baseMarkdown,
      job: item.job,
      settings,
      nowIso: "2026-07-05T10:02:00+02:00",
    });
    const finalMarkdown = await applyInlineDraft(staged.markdown, {
      ...item.job,
      inlineDraft: { draftId: staged.draftId, status: staged.status },
    });

    assert.equal(staged.status, "created", item.name);
    assert.equal(countMatches(finalMarkdown, new RegExp(`learnos-item-id: ${item.inserted}`, "g")), 1, item.name);
    assert.equal(finalMarkdown.indexOf(item.before) < finalMarkdown.indexOf(item.inserted), true, item.name);
    assert.equal(finalMarkdown.indexOf(item.inserted) < finalMarkdown.indexOf(item.after), true, item.name);
    assert.equal(countMatches(finalMarkdown, /learnos-draft/g), 0, item.name);
  }
});

test("adjacent generated before tip is preserved when applying a draft targeting the tip", async () => {
  const generated = buildGeneratedContentBlock(
    {
      generatedId: "gen-adjacent-inline-draft-test",
      proposedItems: [
        {
          ...clarificationRecord.items[0],
          id: "item-adjacent-generated",
          itemTitle: "Generated",
          explanation: "Generated content.",
        },
      ],
    },
    settings
  );
  const tipRecord = {
    ...adjacentTipRecord,
    id: "clar-adjacent-tip-h2",
    items: [{ ...adjacentTipRecord.items[0], id: "item-adjacent-tip-h2", itemTitle: "Tip", explanation: "Tip content." }],
  };
  const tip = buildClarificationBlock(tipRecord, settings);
  const job = clarificationInsideTipJob("job-adjacent-generated-before-tip", tipRecord);
  const staged = stageInlineDraftForJob({
    markdown: `${generated}${tip}Tail.`,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const finalMarkdown = await applyInlineDraft(staged.markdown, {
    ...job,
    inlineDraft: { draftId: staged.draftId, status: staged.status },
  }, tipRecord);

  assert.match(finalMarkdown, /learnos-generated-id: gen-adjacent-inline-draft-test/);
  assert.match(finalMarkdown, /learnos-item-id: item-adjacent-generated/);
  assert.match(finalMarkdown, /learnos-clarification-id: clar-adjacent-tip-h2/);
  assert.match(finalMarkdown, /learnos-item-id: item-adjacent-tip-h2/);
  assert.match(finalMarkdown, /learnos-item-id: item-unbiased-new/);
  assert.equal(countMatches(finalMarkdown, /learnos-item-id: item-adjacent-generated/g), 1);
});

test("adjacent generated after tip is preserved when applying a draft targeting the tip", async () => {
  const tipRecord = {
    ...adjacentTipRecord,
    id: "clar-adjacent-tip-2",
    items: [{ ...adjacentTipRecord.items[0], id: "item-adjacent-tip-2", itemTitle: "Tip", explanation: "Tip content." }],
  };
  const tip = buildClarificationBlock(tipRecord, settings);
  const generated = buildGeneratedContentBlock(
    {
      generatedId: "gen-adjacent-note-2-inline-draft-test",
      proposedItems: [
        {
          ...clarificationRecord.items[0],
          id: "item-adjacent-note-2",
          itemTitle: "Generated",
          explanation: "Generated content.",
        },
      ],
    },
    settings
  );
  const job = clarificationInsideTipJob("job-adjacent-generated-after-tip", tipRecord);
  const staged = stageInlineDraftForJob({
    markdown: `${tip}${generated}Tail.`,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const finalMarkdown = await applyInlineDraft(staged.markdown, {
    ...job,
    inlineDraft: { draftId: staged.draftId, status: staged.status },
  }, tipRecord);

  assert.match(finalMarkdown, /learnos-generated-id: gen-adjacent-note-2-inline-draft-test/);
  assert.match(finalMarkdown, /learnos-item-id: item-adjacent-note-2/);
  assert.match(finalMarkdown, /learnos-clarification-id: clar-adjacent-tip-2/);
  assert.match(finalMarkdown, /learnos-item-id: item-adjacent-tip-2/);
  assert.match(finalMarkdown, /learnos-item-id: item-unbiased-new/);
  assert.equal(countMatches(finalMarkdown, /learnos-item-id: item-adjacent-note-2/g), 1);
});

test("inline draft Apply preserves live sibling edits in target tip", async () => {
  const record = {
    ...adjacentTipRecord,
    id: "clar-sibling-edit",
    items: [{ ...adjacentTipRecord.items[0], id: "item-sibling-edit", itemTitle: "Sibling", explanation: "Original sibling." }],
  };
  const tip = buildClarificationBlock(record, settings);
  const job = clarificationInsideTipJob("job-sibling-edit", record);
  const staged = stageInlineDraftForJob({
    markdown: `${tip}Tail.`,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  }).markdown.replace("Original sibling.", "Manually edited sibling.");
  const finalMarkdown = await applyInlineDraft(staged, {
    ...job,
    inlineDraft: { draftId: `draft-${job.id}`, status: "created" },
  }, record);

  assert.match(finalMarkdown, /Manually edited sibling/);
  assert.match(finalMarkdown, /learnos-item-id: item-unbiased-new/);
  assert.doesNotMatch(finalMarkdown, /Original sibling/);
});

test("inline draft Apply does not restore a deleted sibling item in target tip", async () => {
  const record = {
    ...adjacentTipRecord,
    id: "clar-sibling-delete",
    items: [{ ...adjacentTipRecord.items[0], id: "item-sibling-delete", itemTitle: "Sibling", explanation: "Deleted sibling." }],
  };
  const tip = buildClarificationBlock(record, settings);
  const job = clarificationInsideTipJob("job-sibling-delete", record);
  const stagedResult = stageInlineDraftForJob({
    markdown: `${tip}Tail.`,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const liveWithoutSibling = stagedResult.markdown.replace(
    tip,
    `> [!tip]- 💡 我的理解\n> <!-- learnos-clarification-id: ${record.id} -->\n>\n\n`
  );
  const finalMarkdown = await applyInlineDraft(liveWithoutSibling, {
    ...job,
    inlineDraft: { draftId: stagedResult.draftId, status: stagedResult.status },
  }, record);

  assert.doesNotMatch(finalMarkdown, /item-sibling-delete/);
  assert.doesNotMatch(finalMarkdown, /Deleted sibling/);
  assert.match(finalMarkdown, /learnos-item-id: item-unbiased-new/);
});

test("multiple drafts under same target apply independently", async () => {
  const record = {
    ...adjacentTipRecord,
    id: "clar-multiple-drafts",
    items: [{ ...adjacentTipRecord.items[0], id: "item-multiple-base", itemTitle: "Base", explanation: "Base content." }],
  };
  const tip = buildClarificationBlock(record, settings);
  const jobA = clarificationInsideTipJob("job-multiple-draft-a", record, "item-draft-a", "Draft A", "A content.");
  const jobB = clarificationInsideTipJob("job-multiple-draft-b", record, "item-draft-b", "Draft B", "B content.");
  const stagedA = stageInlineDraftForJob({
    markdown: `${tip}Tail.`,
    job: jobA,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const stagedB = stageInlineDraftForJob({
    markdown: stagedA.markdown,
    job: jobB,
    settings,
    nowIso: "2026-07-05T10:03:00+02:00",
  });
  const afterA = await applyInlineDraft(stagedB.markdown, {
    ...jobA,
    inlineDraft: { draftId: stagedA.draftId, status: stagedA.status },
  }, record);

  assert.match(afterA, /learnos-item-id: item-draft-a/);
  assert.match(afterA, /learnos-draft-id: draft-job-multiple-draft-b/);
  assert.doesNotMatch(afterA, /learnos-draft-id: draft-job-multiple-draft-a/);

  const afterB = await applyInlineDraft(afterA, {
    ...jobB,
    inlineDraft: { draftId: stagedB.draftId, status: stagedB.status },
  }, record);
  assert.match(afterB, /learnos-item-id: item-draft-a/);
  assert.match(afterB, /learnos-item-id: item-draft-b/);
  assert.doesNotMatch(afterB, /learnos-draft-/);
});

test("deleted draft preparation has no final item to sync", () => {
  const staged = stageInlineDraftForJob({
    markdown: `${baseJob.sourceBlock}\n\nTail.`,
    job: baseJob,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const preparation = prepareInlineDraftApply({
    markdown: `${baseJob.sourceBlock}\n\nTail.`,
    job: { ...baseJob, inlineDraft: { draftId: staged.draftId, status: staged.status } },
    settings,
    nowIso: "2026-07-05T10:03:00+02:00",
  });

  assert.equal(preparation.kind, "deleted");
  assert.doesNotMatch(`${baseJob.sourceBlock}\n\nTail.`, /learnos-item-id: item-unbiased-new/);
});

test("Apply removes the live draft by marker identity after inserting a normal-note final block", () => {
  const markdown = `${baseJob.sourceBlock}\n\nNext paragraph.`;
  const staged = stageInlineDraftForJob({
    markdown,
    job: baseJob,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const preparation = prepareInlineDraftApply({
    markdown: staged.markdown,
    job: { ...baseJob, inlineDraft: { draftId: staged.draftId, status: staged.status } },
    settings,
    nowIso: "2026-07-05T10:03:00+02:00",
  });

  assert.equal(preparation.kind, "ready");
  const afterApply = `${baseJob.sourceBlock}\n\n${preparation.editedVisibleMarkdown}${staged.markdown
    .slice(baseJob.sourceEndOffset)
    .replace(/^\n+/, "")}`;
  const withoutDraft = preparation.removeDraft(afterApply);

  assert.doesNotMatch(withoutDraft, /learnos-draft-/);
  assert.match(withoutDraft, /> \[!tip\]- 💡 我的理解/);
  assert.match(withoutDraft, /learnos-item-id: item-unbiased-new/);
  assert.match(withoutDraft, /Next paragraph\./);
});

test("Apply removes the live draft by marker identity after replacing a target tip block", () => {
  const tip = buildClarificationBlock(clarificationRecord, settings);
  const markdown = `${baseJob.sourceBlock}\n\n${tip}Next paragraph.`;
  const job = {
    ...baseJob,
    id: "job-inline-tip-remove",
    askSourceMode: "clarification-item",
    existingClarificationId: "clar-loocv",
    targetClarificationId: "clar-loocv",
    targetItemId: "item-existing",
    selectedLearningOsItem: {
      containerId: "clar-loocv",
      itemId: "item-existing",
      itemTitle: "LOOCV",
      itemContent: "逐一留出一个样本做验证。",
    },
  };
  const staged = stageInlineDraftForJob({
    markdown,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const preparation = prepareInlineDraftApply({
    markdown: staged.markdown,
    job: { ...job, inlineDraft: { draftId: staged.draftId, status: staged.status } },
    settings,
    nowIso: "2026-07-05T10:03:00+02:00",
  });

  assert.equal(preparation.kind, "ready");
  const afterApply = staged.markdown.replace(tip, preparation.editedVisibleMarkdown);
  const withoutDraft = preparation.removeDraft(afterApply);

  assert.doesNotMatch(withoutDraft, /learnos-draft-/);
  assert.match(withoutDraft, /> \[!tip\]- 💡 我的理解/);
  assert.match(withoutDraft, /learnos-clarification-id: clar-loocv/);
  assert.match(withoutDraft, /learnos-item-id: item-existing/);
  assert.match(withoutDraft, /learnos-item-id: item-unbiased-new/);
  assert.match(withoutDraft, /Next paragraph\./);
});

test("Apply removes the live draft by marker identity after replacing a target generated-content block", () => {
  const generated = buildGeneratedContentBlock(
    {
      generatedId: "gen-story-remove",
      proposedItems: [
        {
          ...clarificationRecord.items[0],
          id: "item-story-remove",
          itemTitle: "Story",
          explanation: "Original generated content.",
        },
      ],
    },
    settings
  );
  const markdown = `${baseJob.sourceBlock}\n\n${generated}Next paragraph.`;
  const job = {
    ...baseJob,
    id: "job-inline-generated-remove",
    askSourceMode: "generated-content-item",
    selectedLearningOsItem: {
      containerId: "gen-story-remove",
      itemId: "item-story-remove",
      itemTitle: "Story",
      itemContent: "Original generated content.",
    },
    mergeProposal: {
      ...baseJob.mergeProposal,
      action: "generated-content",
      generatedId: "gen-story-remove",
    },
  };
  const staged = stageInlineDraftForJob({
    markdown,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const preparation = prepareInlineDraftApply({
    markdown: staged.markdown,
    job: { ...job, inlineDraft: { draftId: staged.draftId, status: staged.status } },
    settings,
    nowIso: "2026-07-05T10:03:00+02:00",
  });

  assert.equal(preparation.kind, "ready");
  const afterApply = staged.markdown.replace(generated, preparation.editedVisibleMarkdown);
  const withoutDraft = preparation.removeDraft(afterApply);

  assert.doesNotMatch(withoutDraft, /learnos-draft-/);
  assert.match(withoutDraft, /> \[!note\]- ✍️ AI 生成内容/);
  assert.match(withoutDraft, /learnos-generated-id: gen-story-remove/);
  assert.match(withoutDraft, /learnos-item-id: item-story-remove/);
  assert.match(withoutDraft, /learnos-item-id: item-unbiased-new/);
  assert.match(withoutDraft, /Next paragraph\./);
});

test("generated block generated request creates generated draft and applies into same generated block", async () => {
  const generated = generatedCloudStoryBlock();
  const job = generatedBlockJob({
    id: "job-generated-block-story",
    question: "再编一个小故事",
    action: "generated-content",
    itemId: "item-cloud-story-next",
    itemTitle: "新的小故事",
    explanation: "Claude 又发现一扇会发光的门。",
  });
  const staged = stageInlineDraftForJob({
    markdown: `${generated}Tail.`,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const draft = findAllInlineDraftBlocks(staged.markdown)[0];
  const finalMarkdown = await applyInlineDraft(staged.markdown, {
    ...job,
    inlineDraft: { draftId: staged.draftId, status: staged.status },
  });

  assert.equal(draft.kind, "generated-content");
  assert.equal(draft.operation, "add-sibling-item");
  assert.equal(draft.targetContainerId, "gen-cloud-story");
  assert.doesNotMatch(draft.rawMarkdown, /learnos-item-id:/);
  assert.equal(countMatches(finalMarkdown, /learnos-generated-id: gen-cloud-story/g), 1);
  assert.equal(countMatches(finalMarkdown, /learnos-item-id: item-cloud-story\s*-->/g), 1);
  assert.match(finalMarkdown, /learnos-item-id: item-cloud-story-next/);
  assert.equal(countMatches(finalMarkdown, /Claude 又发现一扇会发光的门/g), 1);
  assert.doesNotMatch(finalMarkdown, /learnos-draft-/);
});

test("generated block clarification question creates clarification draft and applies as tip near generated block", async () => {
  const generated = generatedCloudStoryBlock();
  const job = generatedBlockJob({
    id: "job-generated-block-clarification",
    question: "这是什么？",
    action: "add-item",
    itemId: "item-cloud-story-clarification",
    itemTitle: "Claude 故事的含义",
    explanation: "这里是在用故事说明模型生成内容的类比。",
  });
  const staged = stageInlineDraftForJob({
    markdown: `${generated}Tail.`,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const draft = findAllInlineDraftBlocks(staged.markdown)[0];
  const finalMarkdown = await applyInlineDraft(staged.markdown, {
    ...job,
    inlineDraft: { draftId: staged.draftId, status: staged.status },
  });

  assert.equal(draft.kind, "clarification");
  assert.equal(draft.operation, "add-item");
  assert.equal(draft.targetContainerId, undefined);
  assert.match(finalMarkdown, /learnos-generated-id: gen-cloud-story/);
  assert.match(finalMarkdown, /learnos-item-id: item-cloud-story/);
  assert.match(finalMarkdown, /> \[!tip\]- 💡 我的理解/);
  assert.match(finalMarkdown, /learnos-item-id: item-cloud-story-clarification/);
  assert.doesNotMatch(finalMarkdown, /learnos-draft-/);
  assert.equal(countMatches(finalMarkdown, /learnos-item-id: item-cloud-story\s*-->/g), 1);
});

test("generated block draft remains applyable when original selected text changes but target block remains", async () => {
  const generated = generatedCloudStoryBlock();
  const job = generatedBlockJob({
    id: "job-generated-block-source-edited",
    question: "再编一个小故事",
    action: "generated-content",
    itemId: "item-cloud-story-edited-source",
    itemTitle: "源文本变动后的小故事",
    explanation: "Claude 在源文本变化后仍然继续写故事。",
  });
  const staged = stageInlineDraftForJob({
    markdown: `${generated}Tail.`,
    job,
    settings,
    nowIso: "2026-07-05T10:02:00+02:00",
  });
  const editedSource = staged.markdown.replace("Claude 发现自己有一个奇怪的能力。", "Claude 的原始故事被用户改写了。");
  const finalMarkdown = await applyInlineDraft(editedSource, {
    ...job,
    inlineDraft: { draftId: staged.draftId, status: staged.status },
  });

  assert.match(finalMarkdown, /Claude 的原始故事被用户改写了/);
  assert.doesNotMatch(finalMarkdown, /Claude 发现自己有一个奇怪的能力。/);
  assert.match(finalMarkdown, /learnos-item-id: item-cloud-story-edited-source/);
  assert.doesNotMatch(finalMarkdown, /learnos-draft-/);
});

test("inline draft staging off leaves Inbox-only Apply unchanged", () => {
  const result = stageInlineDraftForJob({
    markdown: `${baseJob.sourceBlock}\n\nNext paragraph.`,
    job: baseJob,
    settings: { enableExperimentalInlineDraftStaging: false },
    nowIso: "2026-07-05T10:02:00+02:00",
  });

  assert.equal(result.changed, false);
  assert.equal(result.status, "fallback-inbox-only");
});

function generatedApplyJob({ id, source, generatedId, itemId, explanation }) {
  return {
    ...baseJob,
    id,
    notePath: "Generated.md",
    headingPath: ["Topic"],
    selectedText: source,
    sourceBlock: source,
    sourceBlockHash: `hash-${id}`,
    sourceStartOffset: 0,
    sourceEndOffset: source.length,
    userQuestion: "编一个小故事",
    proposedItemId: itemId,
    mergeProposal: {
      schemaVersion: 1,
      action: "generated-content",
      generatedId,
      proposedItems: [
        {
          ...baseJob.mergeProposal.proposedItems[0],
          id: itemId,
          targetText: source,
          itemTitle: "生成故事",
          question: "编一个小故事",
          explanation,
        },
      ],
      proposedVisibleMarkdown: "",
    },
  };
}

function generatedStoryJob(overrides = {}) {
  return {
    ...baseJob,
    id: overrides.id ?? "job-generated-story",
    askSourceMode: "clarification-item",
    selectedText: "多尺度预测",
    sourceBlock: "adjacent callout area",
    sourceBlockHash: "hash-adjacent-callout-area",
    sourceStartOffset: undefined,
    sourceEndOffset: undefined,
    proposedItemId: "item-story-generated",
    userQuestion: "编一个小故事",
    selectedLearningOsItem: overrides.selectedLearningOsItem,
    existingClarificationId: "clar-adjacent-tip",
    targetClarificationId: "clar-adjacent-tip",
    targetItemId: "item-adjacent-tip",
    mergeProposal: {
      ...baseJob.mergeProposal,
      action: "generated-content",
      generatedId: undefined,
      proposedItems: [
        {
          ...baseJob.mergeProposal.proposedItems[0],
          id: "item-story-generated",
          targetText: "多尺度预测",
          itemTitle: "小故事",
          question: "编一个小故事",
          explanation: "小故事里，多尺度预测像一位侦探，同时用放大镜和望远镜寻找不同大小的线索。",
        },
      ],
      proposedVisibleMarkdown: "> **小故事** 小故事里，多尺度预测像一位侦探。",
    },
  };
}

function generatedCloudStoryBlock() {
  return buildGeneratedContentBlock(
    {
      generatedId: "gen-cloud-story",
      proposedItems: [
        {
          ...clarificationRecord.items[0],
          id: "item-cloud-story",
          itemTitle: "claude 的小故事",
          explanation: "Claude 发现自己有一个奇怪的能力。",
        },
      ],
    },
    settings
  );
}

function cloudDeploymentRecord() {
  return {
    ...clarificationRecord,
    id: "clar-20260705-212857-333-xls6lc-normal-note",
    sourceBlock: "补充模块 E: Cloud Deployment",
    sourceBlockHash: "8cfe9d16",
    sourceStartOffset: 0,
    sourceEndOffset: "补充模块 E: Cloud Deployment".length,
    items: [
      {
        ...clarificationRecord.items[0],
        id: "cloud-deployment-def",
        targetText: "Cloud Deployment",
        itemTitle: "Cloud Deployment（云部署）",
        question: "Cloud Deployment 是什么？",
        explanation:
          "Cloud Deployment（云部署）是指将应用程序、服务或基础设施部署到云平台（如 AWS、Azure、Google Cloud）上的过程。",
      },
    ],
  };
}

function runtimeGeneratedCloudBlock() {
  return buildGeneratedContentBlock(
    {
      generatedId: "gen-20260705-234359-425-rp7sfc-normal-note",
      proposedItems: [
        {
          ...clarificationRecord.items[0],
          id: "item-20260705-225515-讲一个这个的小故事呗",
          itemTitle: "这个的小故事呗",
          explanation:
            "从前有一家小公司叫面包工坊，他们把订单系统迁移到了云平台，学会了弹性伸缩。",
        },
      ],
    },
    settings
  );
}

function runtimeGeneratedStoryJob({ id, question, proposedItemId, answer, key, takeaway }) {
  return {
    ...baseJob,
    id,
    askSourceMode: "generated-content-item",
    notePath: "测试.md",
    headingPath: ["测试", "Normal Note"],
    selectedText: "老旧的服务器",
    sourceBlock:
      "> **这个的小故事呗** 从前有一家小公司叫面包工坊，他们的订单系统跑在一台老旧的服务器上。",
    sourceBlockHash: "1f11efd8",
    sourceStartOffset: 17129,
    sourceEndOffset: 17425,
    detectedConcept: "normal-note",
    proposedItemId,
    userQuestion: question,
    rawAnswer: JSON.stringify({
      answer,
      key_answer: key,
      suggested_takeaway: takeaway,
      mastery_signal: "neutral",
      review_needed: false,
    }),
    parsedAnswer: {
      answer,
      key_answer: key,
      suggested_takeaway: takeaway,
      mastery_signal: "neutral",
      review_needed: false,
    },
    selectedLearningOsItem: {
      containerId: "gen-20260705-234359-425-rp7sfc-normal-note",
      itemId: "item-20260705-225515-讲一个这个的小故事呗",
      itemTitle: "这个的小故事呗",
      itemContent: "从前有一家小公司叫面包工坊，他们的订单系统跑在一台老旧的服务器上。",
    },
    siblingLearningOsItems: [
      {
        itemId: "cloud-deployment-def",
        itemTitle: "Cloud Deployment（云部署）",
        itemContent: "Cloud Deployment 是将应用部署到云平台上的过程。",
      },
    ],
    targetItemId: "item-20260705-225515-讲一个这个的小故事呗",
  };
}

function generatedBlockJob({ id, question, action, itemId, itemTitle, explanation }) {
  return {
    ...baseJob,
    id,
    askSourceMode: "generated-content-item",
    selectedText: "Claude 发现自己有一个奇怪的能力。",
    sourceBlock: "Claude 发现自己有一个奇怪的能力。",
    sourceBlockHash: "hash-cloud-story",
    sourceStartOffset: undefined,
    sourceEndOffset: undefined,
    proposedItemId: itemId,
    userQuestion: question,
    selectedLearningOsItem: {
      containerId: "gen-cloud-story",
      itemId: "item-cloud-story",
      itemTitle: "claude 的小故事",
      itemContent: "Claude 发现自己有一个奇怪的能力。",
    },
    targetItemId: "item-cloud-story",
    mergeProposal: {
      ...baseJob.mergeProposal,
      action,
      generatedId: action === "generated-content" ? "gen-cloud-story" : undefined,
      proposedItems: [
        {
          ...baseJob.mergeProposal.proposedItems[0],
          id: itemId,
          targetText: "Claude 发现自己有一个奇怪的能力。",
          itemTitle,
          question,
          explanation,
        },
      ],
      proposedVisibleMarkdown: `> **${itemTitle}** ${explanation}`,
    },
  };
}

function clarificationInsideTipJob(id, record, itemId = "item-unbiased-new", title = "为什么无偏？", explanation = "平均来说不会系统性偏高或偏低。") {
  return {
    ...baseJob,
    id,
    askSourceMode: "clarification-item",
    proposedItemId: itemId,
    existingClarificationId: record.id,
    targetClarificationId: record.id,
    targetItemId: record.items[0].id,
    selectedLearningOsItem: {
      containerId: record.id,
      itemId: record.items[0].id,
      itemTitle: record.items[0].itemTitle,
      itemContent: record.items[0].explanation,
    },
    mergeProposal: {
      ...baseJob.mergeProposal,
      action: "add-item",
      clarificationId: record.id,
      proposedItems: [
        {
          ...baseJob.mergeProposal.proposedItems[0],
          id: itemId,
          itemTitle: title,
          question: title,
          explanation,
        },
      ],
    },
  };
}

function matrixTip(containerId, itemId, title, explanation) {
  return buildClarificationBlock(
    {
      ...clarificationRecord,
      id: containerId,
      items: [
        {
          ...clarificationRecord.items[0],
          id: itemId,
          targetText: title,
          itemTitle: title,
          explanation,
        },
      ],
    },
    settings
  );
}

function matrixGenerated(containerId, itemId, title, explanation) {
  return buildGeneratedContentBlock(
    {
      generatedId: containerId,
      proposedItems: [
        {
          ...clarificationRecord.items[0],
          id: itemId,
          targetText: title,
          itemTitle: title,
          explanation,
        },
      ],
    },
    settings
  );
}

function matrixTipToGeneratedJob(id, containerId, itemId, title, content, proposedItemId) {
  return {
    ...baseJob,
    id,
    askSourceMode: "clarification-item",
    selectedText: title,
    sourceBlock: content,
    sourceBlockHash: `hash-${id}`,
    sourceStartOffset: undefined,
    sourceEndOffset: undefined,
    proposedItemId,
    userQuestion: "编一个小故事",
    existingClarificationId: containerId,
    targetClarificationId: containerId,
    targetItemId: itemId,
    selectedLearningOsItem: {
      containerId,
      itemId,
      itemTitle: title,
      itemContent: content,
    },
    mergeProposal: {
      ...baseJob.mergeProposal,
      action: "generated-content",
      generatedId: undefined,
      proposedItems: [
        {
          ...baseJob.mergeProposal.proposedItems[0],
          id: proposedItemId,
          targetText: title,
          itemTitle: `${title} story`,
          question: "编一个小故事",
          explanation: `${title} local generated story.`,
        },
      ],
      proposedVisibleMarkdown: `> **${title} story** ${title} local generated story.`,
    },
  };
}

function matrixNoteToGeneratedJob(id, containerId, itemId, title, content, proposedItemId) {
  return {
    ...baseJob,
    id,
    askSourceMode: "generated-content-item",
    selectedText: title,
    sourceBlock: content,
    sourceBlockHash: `hash-${id}`,
    sourceStartOffset: undefined,
    sourceEndOffset: undefined,
    proposedItemId,
    userQuestion: "再补一个故事",
    targetItemId: itemId,
    selectedLearningOsItem: {
      containerId,
      itemId,
      itemTitle: title,
      itemContent: content,
    },
    mergeProposal: {
      ...baseJob.mergeProposal,
      action: "generated-content",
      generatedId: containerId,
      proposedItems: [
        {
          ...baseJob.mergeProposal.proposedItems[0],
          id: proposedItemId,
          targetText: title,
          itemTitle: `${title} generated sibling`,
          question: "再补一个故事",
          explanation: `${title} local sibling generated story.`,
        },
      ],
      proposedVisibleMarkdown: `> **${title} generated sibling** ${title} local sibling generated story.`,
    },
  };
}

function matrixNoteToClarificationJob(id, containerId, itemId, title, content, proposedItemId) {
  return {
    ...matrixNoteToGeneratedJob(id, containerId, itemId, title, content, proposedItemId),
    userQuestion: "这是啥",
    mergeProposal: {
      ...baseJob.mergeProposal,
      action: "add-item",
      generatedId: undefined,
      proposedItems: [
        {
          ...baseJob.mergeProposal.proposedItems[0],
          id: proposedItemId,
          targetText: title,
          itemTitle: `${title} clarification`,
          question: "这是啥",
          explanation: `${title} local clarification.`,
        },
      ],
      proposedVisibleMarkdown: `> **${title} clarification** ${title} local clarification.`,
    },
  };
}

async function applyInlineDraft(markdown, job, clarificationRecordForStore = null) {
  const preparation = prepareInlineDraftApply({
    markdown,
    job,
    settings,
    nowIso: "2026-07-05T10:04:00+02:00",
  });
  assert.equal(preparation.kind, "ready");
  const fakeApp = new FakeApp(preparation.removeDraft(markdown), job.notePath);
  const fakeJobStore = new FakeJobStore();
  const fakeClarificationStore = new FakeClarificationStore(clarificationRecordForStore);
  await applyAskJobProposal({
    app: fakeApp,
    jobStore: fakeJobStore,
    clarificationStore: fakeClarificationStore,
    settings: { ...settings, schemaVersion: 1 },
    job: preparation.job,
    editedVisibleMarkdown: preparation.editedVisibleMarkdown,
  });
  return fakeApp.modifiedMarkdown;
}

function countMatches(value, pattern) {
  return value.match(pattern)?.length ?? 0;
}

class FakeApp {
  constructor(markdown, path) {
    this.modifiedMarkdown = markdown;
    this.file = { path, extension: "md" };
    this.vault = {
      getAbstractFileByPath: (requestedPath) => (requestedPath === path ? this.file : null),
      read: async () => this.modifiedMarkdown,
      modify: async (_file, nextMarkdown) => {
        this.modifiedMarkdown = nextMarkdown;
      },
    };
  }
}

class FakeJobStore {
  async updateStatus(job, status) {
    this.savedJob = { ...job, status };
    return this.savedJob;
  }

  async saveJob(job) {
    this.savedJob = job;
  }
}

class FakeClarificationStore {
  constructor(record) {
    this.record = record;
  }

  async readRecord(id) {
    return this.record && this.record.id === id ? this.record : null;
  }

  async findByNotePathAndSourceHash() {
    return this.record;
  }

  async saveRecord(record) {
    this.record = record;
  }
}
