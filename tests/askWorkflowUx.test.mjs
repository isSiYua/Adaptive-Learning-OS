import assert from "node:assert/strict";
import test from "node:test";
import { AnthropicCompatibleProvider } from "../src/ai/AnthropicCompatibleProvider.ts";
import { OpenAICompatibleProvider } from "../src/ai/OpenAICompatibleProvider.ts";
import {
  appendTakeaways,
  buildFollowUpMergePrompt,
  parseFollowUpMergeResponse,
} from "../src/ask/FollowUpMergePromptBuilder.ts";
import { parseAiResponseJson, parseAiResponseOrFallback } from "../src/ask/AiResponseParser.ts";
import { convertLegacyAskCards } from "../src/ask/LegacyAskCardConverter.ts";
import {
  buildVisibleClarification,
  findAnnotationNearSelection,
  replaceAnnotationBlock,
  stripVisibleMetadataForTest,
} from "../src/ask/VisibleClarification.ts";

const baseSettings = {
  uiLanguage: "zh",
  answerLanguage: "auto",
  clarificationInsertionStyle: "callout-collapsed",
  showQuestionInVisibleClarification: false,
};

const record = {
  schemaVersion: 1,
  id: "ask-20260703-032318-ridge-regression",
  concept: "ridge-regression",
  notePath: "Machine Learning/Ridge Regression.md",
  sourceSentence:
    "Ridge regression adds an L2 penalty to shrink coefficients and reduce overfitting.",
  question: "为什么 L2 penalty 可以减少 overfitting？",
  rawAnswer: "Full answer with $\\lambda$.",
  keyAnswer: "Ridge penalizes large squared coefficients.",
  myTakeaway:
    "我可以把 L2 penalty 理解为：Ridge 在预测误差之外惩罚过大的系数，让模型更稳定。",
  masterySignal: "weak",
  reviewNeeded: true,
  created: "2026-07-03T03:23:18+02:00",
  updated: "2026-07-03T03:23:18+02:00",
  followUps: [],
};

test("AI parser handles pure JSON, Chinese, and LaTeX", () => {
  const parsed = parseAiResponseJson(`{
    "answer": "详细解释 $\\\\lambda \\\\sum_j \\\\beta_j^2$",
    "key_answer": "一句话答案",
    "suggested_takeaway": "我可以这样理解：不要把系数越小越好当成绝对规则。",
    "mastery_signal": "weak",
    "review_needed": true
  }`);

  assert.equal(parsed?.answer.includes("\\lambda"), true);
  assert.equal(parsed?.keyAnswer, "一句话答案");
  assert.equal(parsed?.suggestedTakeaway.includes("系数越小越好"), true);
  assert.equal(parsed?.masterySignal, "weak");
  assert.equal(parsed?.reviewNeeded, true);
});

test("AI parser handles the exact valid Chinese JSON from Phase 1.1 brief", () => {
  const parsed = parseAiResponseJson(`{
    "answer": "Ridge 会在普通预测误差之外加入 L2 penalty，用来惩罚过大的系数。这样模型不会太依赖某些特征，通常可以降低 variance，但如果惩罚太强，也会增加 bias 并导致 underfitting。",
    "key_answer": "Ridge 通过惩罚过大的平方系数来降低模型对训练数据噪声的敏感性。",
    "suggested_takeaway": "我可以把 Ridge 理解为：它不是让系数越小越好，而是在预测误差之外惩罚过大的系数，用增加一点 bias 换取降低 variance。",
    "mastery_signal": "weak",
    "review_needed": true
  }`);

  assert.equal(
    parsed?.answer,
    "Ridge 会在普通预测误差之外加入 L2 penalty，用来惩罚过大的系数。这样模型不会太依赖某些特征，通常可以降低 variance，但如果惩罚太强，也会增加 bias 并导致 underfitting。"
  );
  assert.equal(parsed?.keyAnswer, "Ridge 通过惩罚过大的平方系数来降低模型对训练数据噪声的敏感性。");
  assert.equal(
    parsed?.suggestedTakeaway,
    "我可以把 Ridge 理解为：它不是让系数越小越好，而是在预测误差之外惩罚过大的系数，用增加一点 bias 换取降低 variance。"
  );
  assert.equal(parsed?.masterySignal, "weak");
  assert.equal(parsed?.reviewNeeded, true);
});

test("AI parser handles fenced JSON and prose around JSON", () => {
  const fenced = parseAiResponseJson(`Here is the answer:

\`\`\`json
{"answer":"A","key_answer":"K","suggested_takeaway":"T","mastery_signal":"resolved","review_needed":false}
\`\`\`

Hope this helps.`);

  assert.equal(fenced?.answer, "A");
  assert.equal(fenced?.masterySignal, "resolved");
  assert.equal(fenced?.reviewNeeded, false);
});

test("AI parser fallback keeps invalid response as raw answer", () => {
  const parsed = parseAiResponseOrFallback("not json at all");

  assert.equal(parsed.parsed, false);
  assert.equal(parsed.answer, "not json at all");
  assert.equal(parsed.keyAnswer, "");
  assert.equal(parsed.reviewNeeded, false);
});

test("AI parser tolerates missing optional fields", () => {
  const parsed = parseAiResponseJson(`{"key_answer":"K"}`);

  assert.equal(parsed?.answer, "");
  assert.equal(parsed?.keyAnswer, "K");
  assert.equal(parsed?.suggestedTakeaway, "");
  assert.equal(parsed?.masterySignal, "neutral");
  assert.equal(parsed?.reviewNeeded, false);
});

test("visible clarification callout is clean and hides question by default", () => {
  const block = buildVisibleClarification(record, baseSettings);

  assert.match(block, /> \[!tip\]- 💡 我的理解/);
  assert.match(block, /%% learnos-ask-id: ask-20260703-032318-ridge-regression %%/);
  assert.equal(block.includes(record.question), false);
  assert.equal(stripVisibleMetadataForTest(block), true);
  assert.equal(block.includes(record.rawAnswer), false);
});

test("visible clarification supports inline and hidden-only styles", () => {
  const inline = buildVisibleClarification(record, {
    ...baseSettings,
    clarificationInsertionStyle: "inline",
  });
  const hidden = buildVisibleClarification(record, {
    ...baseSettings,
    clarificationInsertionStyle: "hidden-only",
  });

  assert.match(inline, /^💡 我的理解：/);
  assert.equal(hidden, "%% learnos-ask-id: ask-20260703-032318-ridge-regression %%\n\n");
});

test("visible clarification can show question when enabled", () => {
  const block = buildVisibleClarification(record, {
    ...baseSettings,
    showQuestionInVisibleClarification: true,
  });

  assert.match(block, /\*\*问题\*\*/);
  assert.match(block, new RegExp(record.question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("existing annotation detection finds selection inside clarification", () => {
  const markdown = `Ridge sentence.

${buildVisibleClarification(record, baseSettings)}

Next paragraph.`;
  const selectionStart = markdown.indexOf("L2 penalty");
  const selectionEnd = selectionStart + "L2 penalty".length;
  const match = findAnnotationNearSelection(markdown, selectionStart, selectionEnd);

  assert.equal(match?.askId, record.id);
});

test("existing annotation detection finds adjacent paragraph annotation and can replace it", () => {
  const markdown = `Ridge regression adds an L2 penalty.

${buildVisibleClarification(record, baseSettings)}

Next paragraph.`;
  const selectionStart = markdown.indexOf("Ridge regression");
  const selectionEnd = selectionStart + "Ridge regression adds an L2 penalty.".length;
  const match = findAnnotationNearSelection(markdown, selectionStart, selectionEnd);
  const replacement = buildVisibleClarification(
    { ...record, myTakeaway: "更新后的理解。" },
    baseSettings
  );
  const updated = replaceAnnotationBlock(markdown, match, replacement);

  assert.equal(match?.askId, record.id);
  assert.match(updated, /更新后的理解/);
  assert.equal((updated.match(/learnos-ask-id/g) ?? []).length, 1);
});

test("marker spacing keeps following paragraph separate after replacement", () => {
  const original = `Ridge.

${buildVisibleClarification(record, baseSettings)}This is useful when features are correlated.`;
  const selectionStart = original.indexOf("Ridge.");
  const match = findAnnotationNearSelection(original, selectionStart, selectionStart + 6);
  const updated = replaceAnnotationBlock(
    original,
    match,
    buildVisibleClarification({ ...record, myTakeaway: "新的理解。" }, baseSettings)
  );

  assert.match(updated, /%% learnos-ask-id: ask-20260703-032318-ridge-regression %%\n\nThis is useful/);
  assert.equal((updated.match(/learnos-ask-id/g) ?? []).length, 1);
});

test("multiple ask blocks keep one marker per block", () => {
  const second = { ...record, id: "ask-20260703-second", myTakeaway: "第二条理解。" };
  const markdown = `${buildVisibleClarification(record, baseSettings)}
Middle paragraph.

${buildVisibleClarification(second, baseSettings)}`;

  assert.equal((markdown.match(/learnos-ask-id/g) ?? []).length, 2);
  assert.equal((markdown.match(/%%%%/g) ?? []).length, 0);
});

test("AskCardRecord serializes as indented human-readable JSON and preserves followUps", () => {
  const withFollowUp = {
    ...record,
    followUps: [
      {
        id: `${record.id}-follow-up-1`,
        question: "bias 和 variance 是什么？",
        rawAnswer: "raw",
        keyAnswer: "key",
        myTakeaway: "takeaway",
        created: record.updated,
      },
    ],
  };
  const serialized = JSON.stringify(withFollowUp, null, 2);
  const parsed = JSON.parse(serialized);

  assert.match(serialized, /\n  "schemaVersion": 1/);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.followUps.length, 1);
});

test("legacy converter creates clean visible block and external record", () => {
  const legacy = `Before

>>> ASK_CARD
id: "ask-legacy"
concept: "ridge-regression"
source_sentence: "Ridge regression adds an L2 penalty."
question: "为什么？"
key_answer: "{\\"answer\\":\\"raw\\",\\"key_answer\\":\\"key\\",\\"suggested_takeaway\\":\\"takeaway\\",\\"mastery_signal\\":\\"weak\\",\\"review_needed\\":true}"
my_takeaway: ""
mastery_signal: "weak"
review_needed: true
created: "2026-07-03T03:23:18+02:00"
<<<

After`;

  const result = convertLegacyAskCards(legacy, "Note.md", baseSettings);

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].interactions[0].rawAnswer, "raw");
  assert.equal(result.records[0].items[0].explanation, "takeaway");
  assert.equal(result.records[0].id, "clar-legacy");
  assert.equal(result.markdown.includes(">>> ASK_CARD"), false);
  assert.match(result.markdown, /learnos-clarification-id: clar-legacy/);
  assert.equal(result.markdown.includes("learnos-ask-id"), false);
});

test("legacy converter leaves malformed block unchanged", () => {
  const legacy = `>>> ASK_CARD
id: "broken"`;
  const result = convertLegacyAskCards(legacy, "Note.md", baseSettings);

  assert.equal(result.records.length, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.markdown, legacy);
});

test("follow-up merge prompt preserves old and new inputs and parser maps merged_takeaway", () => {
  const prompt = buildFollowUpMergePrompt({
    existingRecord: {
      ...record,
      myTakeaway:
        "我记住了：Ridge = 压缩但不删除，Lasso = 可以删到 0。Ridge 保留所有特征，只是让它们更温和。",
    },
    context: {
      notePath: "Note.md",
      noteTitle: "Note",
      selectedText: "bias and variance",
      headingPath: ["Regularization", "Ridge Regression"],
      currentHeading: "Ridge Regression",
      parentHeading: "Regularization",
      nearbyBefore: "",
      nearbyAfter: "",
      frontmatter: {},
      detectedConceptIds: ["ridge-regression"],
      sourceSentenceTruncated: false,
      originalSelectionLength: 17,
    },
    newQuestion: "这里的 bias 和 variance 是什么意思？",
    newRawAnswer: "Ridge lowers variance but may increase bias.",
    newKeyAnswer: "Bias up, variance down.",
    newTakeaway: "Ridge 通过惩罚过大的系数降低 variance，但惩罚太强会增加 bias。",
  });
  const parsed = parseFollowUpMergeResponse(`{
    "merged_takeaway": "我记住了：Ridge 会压缩系数但通常不删除特征；相比 Lasso 可以把系数变成 0，Ridge 更像是让所有特征影响变温和。它通过惩罚过大的系数降低 variance，但惩罚太强会增加 bias，导致 underfitting。",
    "reason": "保留 Ridge/Lasso 对比，并加入 bias/variance。",
    "mastery_signal": "weak",
    "review_needed": true
  }`);

  assert.match(prompt, /Ridge = 压缩但不删除/);
  assert.match(prompt, /这里的 bias 和 variance 是什么意思/);
  assert.equal(parsed?.mergedTakeaway.includes("Ridge 会压缩系数"), true);
  assert.equal(parsed?.reason.includes("bias/variance"), true);
  assert.equal(parsed?.masterySignal, "weak");
  assert.equal(parsed?.reviewNeeded, true);
});

test("append follow-up mode keeps old content safe", () => {
  const appended = appendTakeaways("旧理解。", "新理解。");
  assert.equal(appended, "旧理解。\n\n补充：新理解。");
  assert.equal(appendTakeaways("旧理解。", "旧理解。"), "旧理解。");
});

test("OpenAI-compatible provider only calls fetch when ask is invoked", async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                '{"answer":"raw","key_answer":"key","suggested_takeaway":"takeaway","mastery_signal":"neutral","review_needed":false}',
            },
          },
        ],
      }),
    };
  };

  try {
    const provider = new OpenAICompatibleProvider({
      providerApiKey: "test-key",
      providerBaseUrl: "https://example.test",
      providerChatCompletionsPath: "/chat/completions",
      providerModel: "model",
      providerTemperature: 0.2,
      providerMaxTokens: 100,
    });

    assert.equal(calls, 0);
    const response = await provider.ask({
      userQuestion: "Q",
      selectedText: "S",
      language: "Chinese",
      responseStyle: "normal",
      context: {
        notePath: "Note.md",
        noteTitle: "Note",
        selectedText: "S",
        headingPath: [],
        currentHeading: null,
        parentHeading: null,
        nearbyBefore: "",
        nearbyAfter: "",
        frontmatter: {},
        detectedConceptIds: [],
        sourceSentenceTruncated: false,
        originalSelectionLength: 1,
      },
    });

    assert.equal(calls, 1);
    assert.equal(response.suggestedTakeaway, "takeaway");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Anthropic-compatible provider only calls fetch when ask is invoked", async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => ({
        content: [
          {
            type: "text",
            text: '{"answer":"raw","key_answer":"key","suggested_takeaway":"takeaway","mastery_signal":"neutral","review_needed":false}',
          },
        ],
      }),
    };
  };

  try {
    const provider = new AnthropicCompatibleProvider({
      providerApiKey: "test-key",
      providerBaseUrl: "https://example.test",
      providerMessagesPath: "/v1/messages",
      providerModel: "claude-test",
      providerTemperature: 0.2,
      providerMaxTokens: 100,
    });

    assert.equal(calls, 0);
    const response = await provider.ask({
      userQuestion: "Q",
      selectedText: "S",
      language: "Chinese",
      responseStyle: "normal",
      context: {
        notePath: "Note.md",
        noteTitle: "Note",
        selectedText: "S",
        headingPath: [],
        currentHeading: null,
        parentHeading: null,
        nearbyBefore: "",
        nearbyAfter: "",
        frontmatter: {},
        detectedConceptIds: [],
        sourceSentenceTruncated: false,
        originalSelectionLength: 1,
      },
    });

    assert.equal(calls, 1);
    assert.equal(response.suggestedTakeaway, "takeaway");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
