import assert from "node:assert/strict";
import test from "node:test";
import {
  applyClarificationDecision,
  answerLanguageInstruction,
  buildClarificationUpdatePrompt,
  parseClarificationUpdateDecision,
} from "../src/ask/ClarificationUpdatePromptBuilder.ts";
import {
  buildClarificationBlock,
  findClarificationForSourceBlock,
  findClarificationNearSelection,
  replaceClarificationBlock,
} from "../src/ask/ClarificationBlock.ts";
import { getSourceBlockAtSelection } from "../src/editor/SourceBlock.ts";

const baseRecord = {
  schemaVersion: 1,
  id: "clar-20260703-loocv",
  notePath: "ML.md",
  sourceBlock:
    "$MSE_{1}= (y_{1}-\\hat{y}_{1})^{2}$ provides an approximately unbiased estimate for the test error. It is a poor estimate because it is highly variable, since it is based upon a single observation $(x_{1},y_{1})$.",
  sourceBlockHash: "abc123",
  sourceStartOffset: 0,
  sourceEndOffset: 220,
  headingPath: ["Resampling", "Leave-One-Out Cross-Validation"],
  detectedConcept: "loocv",
  language: "auto",
  uiLanguage: "zh",
  created: "2026-07-03T05:03:18+02:00",
  updated: "2026-07-03T05:03:18+02:00",
  items: [
    {
      id: "item-unbiased",
      targetText: "unbiased estimate",
      itemTitle: "为什么叫“无偏（unbiased）”？",
      question: "为什么叫无偏估计？",
      explanation:
        "模型用了 $n-1$ 条数据训练，已经很接近用全部数据训练的状态；拿留出的 1 条数据来测误差，平均来说不会系统性高估或低估 test error。",
      created: "2026-07-03T05:03:18+02:00",
      updated: "2026-07-03T05:03:18+02:00",
      relatedInteractionIds: ["ask-1"],
    },
  ],
  interactions: [],
};

test("clarification block renders one Chinese item with clarification marker", () => {
  const block = buildClarificationBlock(baseRecord);

  assert.match(block, /> \[!tip\]- 💡 我的理解/);
  assert.match(block, /\*\*为什么叫“无偏（unbiased）”？\*\*/);
  assert.match(block, /%% learnos-clarification-id: clar-20260703-loocv %%\n\n/);
  assert.equal(block.includes("learnos-ask-id"), false);
});

test("clarification block renders multiple items, English title, and inline LaTeX", () => {
  const block = buildClarificationBlock({
    ...baseRecord,
    uiLanguage: "en",
    items: [
      ...baseRecord.items,
      {
        id: "item-mse",
        targetText: "$MSE_1$",
        itemTitle: "What is $MSE_1$?",
        question: "What is MSE_1?",
        explanation: "$MSE_1=(y_1-\\hat y_1)^2$ is the squared error on the first validation sample.",
        created: baseRecord.created,
        updated: baseRecord.updated,
        relatedInteractionIds: ["ask-2"],
      },
    ],
  });

  assert.match(block, /> \[!tip\]- 💡 My understanding/);
  assert.match(block, />/);
  assert.match(block, /\$MSE_1=\(y_1-\\hat y_1\)\^2\$/);
  assert.equal((block.match(/learnos-clarification-id/g) ?? []).length, 1);
});

test("source paragraph with no clarification creates a source block range", () => {
  const markdown = `First paragraph.

Second paragraph has unbiased estimate and highly variable.`;
  const start = markdown.indexOf("unbiased estimate");
  const source = getSourceBlockAtSelection(markdown, start, start + "unbiased estimate".length);

  assert.equal(source.text, "Second paragraph has unbiased estimate and highly variable.");
  assert.equal(source.hash.length > 0, true);
});

test("selection in same source paragraph finds adjacent clarification block", () => {
  const sourceParagraph = baseRecord.sourceBlock;
  const markdown = `${sourceParagraph}

${buildClarificationBlock(baseRecord)}

Next paragraph.`;
  const start = markdown.indexOf("highly variable");
  const source = getSourceBlockAtSelection(markdown, start, start + "highly variable".length);
  const match = findClarificationForSourceBlock(markdown, source.start, source.end);

  assert.equal(match?.clarificationId, baseRecord.id);
});

test("selection inside existing clarification updates same record", () => {
  const markdown = `${baseRecord.sourceBlock}

${buildClarificationBlock(baseRecord)}

Next paragraph.`;
  const start = markdown.indexOf("test error");
  const match = findClarificationNearSelection(markdown, start, start + "test error".length);

  assert.equal(match?.clarificationId, baseRecord.id);
});

test("replace clarification block does not duplicate marker or glue next paragraph", () => {
  const markdown = `${baseRecord.sourceBlock}

${buildClarificationBlock(baseRecord)}Next paragraph.`;
  const match = findClarificationNearSelection(markdown, markdown.indexOf("unbiased"), markdown.indexOf("unbiased") + 8);
  const updated = replaceClarificationBlock(
    markdown,
    match,
    buildClarificationBlock({
      ...baseRecord,
      items: [{ ...baseRecord.items[0], explanation: "Updated explanation." }],
    })
  );

  assert.equal((updated.match(/learnos-clarification-id/g) ?? []).length, 1);
  assert.match(updated, /%% learnos-clarification-id: clar-20260703-loocv %%\n\nNext paragraph/);
});

test("AI decision parser supports update existing item", () => {
  const decision = parseClarificationUpdateDecision(`{
    "action": "update-item",
    "target_item_id": "item-unbiased",
    "new_or_updated_item": {
      "targetText": "unbiased estimate",
      "itemTitle": "为什么叫“无偏（unbiased）”？",
      "explanation": "无偏指平均来说不会系统性高估或低估 test error；这里的 $MSE_1$ 是第一个验证样本的平方误差。"
    },
    "full_visible_markdown": "",
    "reason": "merged MSE detail into existing unbiased item",
    "language": "zh"
  }`);
  const next = applyClarificationDecision({
    record: baseRecord,
    decision,
    interaction: {
      id: "ask-2",
      type: "follow-up",
      selectedText: "$MSE_1$",
      question: "这个 $MSE_1$ 是什么？",
      rawAnswer: "raw",
      keyAnswer: "key",
      suggestedExplanation: "suggested",
      provider: "test",
      created: "2026-07-03T05:20:00+02:00",
    },
    nowIso: "2026-07-03T05:20:00+02:00",
  });

  assert.equal(next.items.length, 1);
  assert.equal(next.items[0].relatedInteractionIds.includes("ask-2"), true);
  assert.match(next.items[0].explanation, /\$MSE_1\$/);
});

test("AI decision parser supports add new item", () => {
  const decision = parseClarificationUpdateDecision(`{
    "action": "add-item",
    "target_item_id": null,
    "new_or_updated_item": {
      "targetText": "highly variable",
      "itemTitle": "为什么说 highly variable？",
      "explanation": "因为误差只来自一个验证样本，单次结果会很不稳定。"
    },
    "full_visible_markdown": "",
    "reason": "new concept",
    "language": "zh"
  }`);
  const next = applyClarificationDecision({
    record: baseRecord,
    decision,
    interaction: {
      id: "ask-3",
      type: "follow-up",
      selectedText: "highly variable",
      question: "为什么说 highly variable？",
      rawAnswer: "raw",
      keyAnswer: "key",
      suggestedExplanation: "suggested",
      provider: "test",
      created: "2026-07-03T05:22:00+02:00",
    },
    nowIso: "2026-07-03T05:22:00+02:00",
  });

  assert.equal(next.items.length, 2);
  assert.equal(next.items[1].targetText, "highly variable");
});

test("answer language instructions support Auto Chinese and English behavior", () => {
  assert.match(answerLanguageInstruction("auto"), /same language/);
  assert.match(answerLanguageInstruction("zh"), /Chinese/);
  assert.match(answerLanguageInstruction("en"), /English/);
});

test("clarification update prompt includes compact context, not entire note", () => {
  const prompt = buildClarificationUpdatePrompt({
    record: baseRecord,
    context: {
      notePath: "ML.md",
      noteTitle: "ML",
      selectedText: "highly variable",
      headingPath: ["Resampling"],
      currentHeading: "Resampling",
      parentHeading: null,
      nearbyBefore: "short before",
      nearbyAfter: "short after",
      frontmatter: {},
      detectedConceptIds: ["loocv"],
      sourceBlock: baseRecord.sourceBlock,
      sourceBlockHash: baseRecord.sourceBlockHash,
      sourceSentenceTruncated: false,
      originalSelectionLength: 15,
      answerLanguage: "auto",
    },
    question: "为什么说 highly variable？",
    rawAnswer: "Because it uses one sample.",
    answerLanguage: "auto",
  });

  assert.match(prompt, /Existing clarification items/);
  assert.match(prompt, /highly variable/);
  assert.equal(prompt.includes("some unrelated whole note"), false);
});
