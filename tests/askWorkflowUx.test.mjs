import assert from "node:assert/strict";
import test from "node:test";
import { AnthropicCompatibleProvider } from "../src/ai/AnthropicCompatibleProvider.ts";
import { OpenAICompatibleProvider } from "../src/ai/OpenAICompatibleProvider.ts";
import { buildAskPrompt } from "../src/ask/AskPromptBuilder.ts";
import { detectAskIntent, generatedContentMissingWarning } from "../src/ask/AskIntent.ts";
import { sanitizeMathInMarkdown } from "../src/ask/MarkdownSanitizer.ts";
import {
  appendTakeaways,
  buildFollowUpMergePrompt,
  parseFollowUpMergeResponse,
} from "../src/ask/FollowUpMergePromptBuilder.ts";
import {
  SelectionContextCollector,
  buildExpandedHeadingPath,
  getAdjacentParagraphAfter,
  getAdjacentParagraphAfterOffset,
  getAdjacentParagraphBefore,
  getAdjacentParagraphBeforeOffset,
  getAdjacentLineAfterOffset,
  getAdjacentLineBeforeOffset,
} from "../src/editor/SelectionContextCollector.ts";
import {
  detectAskSourceMode,
  getLineBlockAtSelection,
  resolveOriginalProseContext,
  getSemanticSourceBlockAtSelection,
  getSourceBlockAtSelection,
  parseSemanticBlocks,
} from "../src/editor/SourceBlock.ts";
import {
  findLearningOsContainerAtSelection,
  learningOsItemContextFromBlock,
} from "../src/ask/LearningOsSourceMapping.ts";
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

function fakeEditor(markdown, selection, selectionStart, selectionEnd) {
  return {
    getSelection: () => selection,
    getValue: () => markdown,
    getCursor: (which) => offsetToPos(markdown, which === "to" ? selectionEnd : selectionStart),
  };
}

function offsetToPos(markdown, offset) {
  const before = markdown.slice(0, offset);
  const lines = before.split(/\r?\n/);
  return { line: lines.length - 1, ch: lines[lines.length - 1].length };
}

function resolveLearningOsItemForSelection(markdown, selectedText) {
  const selectionStart = markdown.indexOf(selectedText);
  assert.notEqual(selectionStart, -1, selectedText);
  const selectionEnd = selectionStart + selectedText.length;
  const container = findLearningOsContainerAtSelection(markdown, selectionStart, selectionEnd);
  assert.ok(container, selectedText);
  const block = markdown.slice(container.blockStart, container.blockEnd);
  const context = learningOsItemContextFromBlock({
    blockMarkdown: block,
    containerId: container.containerId,
    selectedText,
    selectionStartInBlock: selectionStart - container.blockStart,
    fallbackItems: [],
  });
  assert.ok(context, selectedText);
  return { container, context, block };
}

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

test("AI parser handles complex Markdown inside valid JSON answer", () => {
  const complex = JSON.stringify({
    answer:
      "在AI辅助学习流程的笔记中，“obsidian”指的是Obsidian这款基于Markdown的本地笔记软件。你之前提到希望学习文件能直接获得有效内容，而Obsidian正是常用作整理这些Markdown学习笔记的工具。\n\n另外，根据你的要求，以下是涵盖Markdown几乎所有常用格式的测试内容，你可以复制到Obsidian中查看渲染效果：\n\n# 标题1\n## 标题2\n### 标题3\n#### 标题4\n##### 标题5\n###### 标题6\n\n**加粗**  *斜体*  ***加粗斜体***  ~~删除线~~  `行内代码`\n\n> 引用块\n> 多行引用\n\n- 无序列表\n- 子项\n  - 子子项\n\n1. 有序列表\n2. 第二项\n\n---\n\n[链接](https://obsidian.md)\n![图片](https://obsidian.md/images/logo.png)\n\n| 表格 | 标题 |\n| --- | --- |\n| 单元格 | 内容 |\n\n```python\nprint('代码块')\n```\n\n脚注[^1]\n\n[^1]: 脚注内容\n\n- [x] 完成任务\n- [ ] 未完成\n\n:smile: (表情符号，需插件或支持) \n\nMath: $E=mc^2$ 或块级 $$x=\\\\frac{-b\\\\pm\\\\sqrt{b^2-4ac}}{2a}$$\n\n---\n*这是分隔线下面*",
    key_answer: "“obsidian”指代Obsidian笔记软件，它是Markdown笔记管理的核心工具。",
    suggested_takeaway: "Obsidian是一款支持Markdown的笔记软件，常用于构建个人知识库，当前AI辅助学习流程正是在这类工具中实践。",
    mastery_signal: "neutral",
    review_needed: false,
  });
  const parsed = parseAiResponseJson(complex);

  assert.equal(parsed?.answer.startsWith("在AI辅助学习流程的笔记中"), true);
  assert.match(parsed?.answer ?? "", /```python/);
  assert.match(parsed?.answer ?? "", /\| 表格 \| 标题 \|/);
  assert.match(parsed?.answer ?? "", /\$E=mc\^2\$/);
  assert.equal(parsed?.keyAnswer.length > 0, true);
  assert.equal(parsed?.suggestedTakeaway.length > 0, true);
  assert.equal(parsed?.masterySignal, "neutral");
  assert.equal(parsed?.reviewNeeded, false);
});

test("AI parser balanced scanner tolerates braces inside JSON strings", () => {
  const parsed = parseAiResponseJson(`Before {"answer":"Use {x} and } inside prose","key_answer":"K","suggested_takeaway":"T"} after`);

  assert.equal(parsed?.answer, "Use {x} and } inside prose");
  assert.equal(parsed?.keyAnswer, "K");
});

test("AI parser ignores non-json fenced code with braces inside JSON answer", () => {
  const raw = JSON.stringify({
    answer: "Code example:\n\n```js\nconst value = { a: 1 };\n```\n\nThen math $MSE_1$.",
    key_answer: "K",
    suggested_takeaway: "T",
  });
  const parsed = parseAiResponseJson(raw);

  assert.match(parsed?.answer ?? "", /const value = \{ a: 1 \}/);
  assert.equal(parsed?.keyAnswer, "K");
});

test("AI parser fallback keeps invalid response as raw answer", () => {
  const parsed = parseAiResponseOrFallback("not json at all");

  assert.equal(parsed.parsed, false);
  assert.equal(parsed.answer, "not json at all");
  assert.equal(parsed.keyAnswer, "");
  assert.equal(parsed.reviewNeeded, false);
});

test("math sanitizer fixes obvious formulas in backticks and preserves code", () => {
  const input = [
    "公式 `$MSE_1$` 应该渲染。",
    "分式 `\\frac{a}{b}` 也应该渲染。",
    "命令 `pnpm install` 保持代码。",
    "```ts",
    "`\\frac{a}{b}`",
    "```",
  ].join("\n");
  const sanitized = sanitizeMathInMarkdown(input);

  assert.match(sanitized, /公式 \$MSE_1\$ 应该渲染。/);
  assert.match(sanitized, /分式 \$\\frac\{a\}\{b\}\$ 也应该渲染。/);
  assert.match(sanitized, /`pnpm install`/);
  assert.match(sanitized, /```ts\n`\\frac\{a\}\{b\}`\n```/);
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

test("ask prompt context includes vault path and only adjacent paragraphs", () => {
  const headingPath = buildExpandedHeadingPath("AI/Workflow/AI 辅助学习流程.md", "AI 辅助学习流程", [
    "Learning OS Inline Question",
  ]);
  assert.deepEqual(headingPath, ["AI", "Workflow", "AI 辅助学习流程", "Learning OS Inline Question"]);

  const markdown = `First paragraph far away.

Nearby before paragraph.

Selected paragraph with project.

Nearby after paragraph.

Last paragraph far away.`;
  const selectedLine = 4;
  const before = getAdjacentParagraphBefore(markdown, selectedLine, 500);
  const after = getAdjacentParagraphAfter(markdown, selectedLine, 500);
  assert.equal(before, "Nearby before paragraph.");
  assert.equal(after, "Nearby after paragraph.");

  const prompt = buildAskPrompt({
    userQuestion: "这是啥？",
    selectedText: "project",
    language: "auto",
    responseStyle: "normal",
    context: {
      notePath: "AI/Workflow/AI 辅助学习流程.md",
      noteTitle: "AI 辅助学习流程",
      selectedText: "project",
      headingPath,
      currentHeading: "Learning OS Inline Question",
      parentHeading: "AI 辅助学习流程",
      nearbyBefore: before,
      nearbyAfter: after,
      frontmatter: {},
      detectedConceptIds: ["learning-os-inline-question"],
      sourceBlock: "Selected paragraph with project.",
      sourceBlockHash: "hash",
      sourceSentenceTruncated: false,
      originalSelectionLength: 7,
      answerLanguage: "auto",
    },
  });

  assert.match(prompt, /AI > Workflow > AI 辅助学习流程 > Learning OS Inline Question/);
  assert.match(prompt, /Nearby before paragraph\./);
  assert.match(prompt, /Nearby after paragraph\./);
  assert.doesNotMatch(prompt, /First paragraph far away/);
  assert.doesNotMatch(prompt, /Last paragraph far away/);
});

test("ask prompt includes strict LaTeX and JSON formatting rules", () => {
  const prompt = buildAskPrompt({
    userQuestion: "公式怎么理解？",
    selectedText: "MSE",
    language: "auto",
    responseStyle: "normal",
    context: {
      notePath: "Stats.md",
      noteTitle: "Stats",
      selectedText: "MSE",
      headingPath: [],
      currentHeading: null,
      parentHeading: null,
      nearbyBefore: "",
      nearbyAfter: "",
      frontmatter: {},
      detectedConceptIds: [],
      sourceBlock: "$MSE_1$",
      sourceBlockHash: "hash",
      sourceSentenceTruncated: false,
      originalSelectionLength: 3,
      answerLanguage: "zh",
    },
  });

  assert.match(prompt, /数学公式必须使用 Obsidian 可渲染的 LaTeX 分隔符/);
  assert.match(prompt, /不要把数学公式放进反引号/);
  assert.match(prompt, /只返回 valid JSON/);
  assert.match(prompt, /不要把 JSON 包进 Markdown code fence/);
});

test("ask prompt prioritizes direct generated-content requests", () => {
  const prompt = buildAskPrompt({
    userQuestion: "给我一个 csgo 小故事",
    selectedText: "析的吧？而且我应该不需要",
    context: {
      notePath: "AI/Workflow.md",
      noteTitle: "Workflow",
      selectedText: "析的吧？而且我应该不需要",
      headingPath: ["AI", "Workflow"],
      currentHeading: "Workflow",
      parentHeading: "AI",
      nearbyBefore: "before",
      nearbyAfter: "after",
      frontmatter: {},
      detectedConceptIds: [],
      sourceBlock: "这是一段学习流程讨论。",
      sourceBlockHash: "hash",
      answerLanguage: "zh",
      sourceSentenceTruncated: false,
      originalSelectionLength: 12,
    },
    language: "zh",
    responseStyle: "normal",
  });

  assert.match(prompt, /Directly answer the user's question/);
  assert.match(prompt, /Detected user intent: generate/);
  assert.match(prompt, /你必须在 answer 中生成该内容/);
  assert.match(prompt, /不要把“给我一个 csgo 小故事”这种请求改写成对选中文本的普通解释/);
});

test("nearby prompt context is recomputed from the selected source paragraph", () => {
  const before =
    "肯定第一步，也差不多就是做一个整本书的 summarize 的，差不多就是规划好大纲，然后保证整个 project 的大方向不偏离，保证即使上下文爆了，也会保证不偏离。";
  const source =
    "然后关于不吃整本书，我觉得应该是一个大内容一个吧？比如一个大章节，或者是一个大类别？然后这个大类别里面的知识点肯定还要和其他的大章节里面的知识点，如果有关联，肯定要有交叉的。";
  const after =
    "AI 一定是我的老师，但是我不希望定式，什么 5 句话说出本章要解决什么问题，过度的压缩没有必要，过度的废话同样没有必要，要因地适宜，具体问题具体分析，你觉得这一内容要详细就详细，这一内容要简略就简略。";
  const markdown = `${before}\n\n${source}\n\n${after}`;
  const selectedText = "肯定要有交叉的。";
  const selectionStart = markdown.indexOf(selectedText);
  const selectionEnd = selectionStart + selectedText.length;
  const sourceBlock = getSourceBlockAtSelection(markdown, selectionStart, selectionEnd);

  assert.equal(sourceBlock.text, source);
  assert.equal(getAdjacentParagraphBeforeOffset(markdown, sourceBlock.start, 2000), before);
  assert.equal(getAdjacentParagraphAfterOffset(markdown, sourceBlock.end, 2000), after);

  const prompt = buildAskPrompt({
    userQuestion: "这是什么意思？",
    selectedText,
    language: "auto",
    responseStyle: "normal",
    context: {
      notePath: "AI 辅助学习流程.md",
      noteTitle: "AI 辅助学习流程",
      selectedText,
      headingPath: [],
      currentHeading: null,
      parentHeading: null,
      nearbyBefore: before,
      nearbyAfter: after,
      frontmatter: {},
      detectedConceptIds: [],
      sourceBlock: source,
      sourceBlockHash: sourceBlock.hash,
      sourceSentenceTruncated: false,
      originalSelectionLength: selectedText.length,
      answerLanguage: "zh",
    },
  });

  assert.match(
    prompt,
    /## Selected sentence\n\n肯定要有交叉的。[\s\S]*## Source block\n\n然后关于不吃整本书/
  );
  assert.match(
    prompt,
    /## Nearby context before\n\n肯定第一步[\s\S]*## Nearby context after\n\nAI 一定是我的老师/
  );
  assert.match(prompt, /## Heading path\n\n\(none\)\n\n## User question\n\n这是什么意思？/);
});

test("AskIntent classifies Chinese explanation questions as explain", () => {
  assert.equal(detectAskIntent("梯度是啥？"), "explain");
  assert.equal(detectAskIntent("这是什么？"), "explain");
  assert.equal(detectAskIntent("啥意思？"), "explain");
  assert.equal(detectAskIntent("怎么理解？"), "explain");
});

test("AskIntent classifies Chinese and English generation requests as generate", () => {
  assert.equal(detectAskIntent("讲一个巴别塔的小故事"), "generate");
  assert.equal(detectAskIntent("讲个 Babel 小故事"), "generate");
  assert.equal(detectAskIntent("讲讲 Niko 小趣事"), "generate");
  assert.equal(detectAskIntent("生成一个巴别塔的小故事"), "generate");
  assert.equal(detectAskIntent("写一个巴别塔小故事"), "generate");
  assert.equal(detectAskIntent("编一个 niko 小趣事"), "generate");
  assert.equal(detectAskIntent("输出一个虎与狼的故事，其他的都不要管"), "generate");
  assert.equal(detectAskIntent("tell me a story about Babel"), "generate");
  assert.equal(detectAskIntent("give me a Niko fun fact"), "generate");
});

test("ask prompt includes selected clarification item as primary context", () => {
  const prompt = buildAskPrompt({
    userQuestion: "梯度是啥？",
    selectedText: "即梯度",
    language: "auto",
    responseStyle: "normal",
    context: {
      notePath: "AI.md",
      noteTitle: "AI",
      selectedText: "即梯度",
      headingPath: ["AI"],
      currentHeading: "AI",
      parentHeading: null,
      nearbyBefore: "",
      nearbyAfter: "",
      frontmatter: {},
      detectedConceptIds: [],
      sourceBlock: "此时，我们需要启用**反向传播算法**来修正叙事的梯度消失问题。",
      sourceBlockHash: "hash",
      answerLanguage: "zh",
      askSourceMode: "clarification-item",
      selectedLearningOsItem: {
        containerId: "clar-test",
        itemId: "backprop-item",
        itemTitle: "反向传播是啥？",
        itemContent: "反向传播（Backpropagation）是训练神经网络的核心算法。它会计算损失函数对参数的贡献（即梯度）。",
      },
      siblingLearningOsItems: [
        {
          itemId: "grad-explosion",
          itemTitle: "梯度爆炸",
          itemContent: "梯度值过大导致训练崩溃。",
        },
      ],
      originalSourceBlockBackground: "此时，我们需要启用**反向传播算法**来修正叙事的梯度消失问题。",
      sourceSentenceTruncated: false,
      originalSelectionLength: 3,
    },
  });

  assert.match(prompt, /## Ask source mode\n\nclarification-item/);
  assert.match(prompt, /## Selected clarification item[\s\S]*Item ID:\nbackprop-item/);
  assert.match(prompt, /Item title:\n反向传播是啥？/);
  assert.match(prompt, /Item content:\n反向传播（Backpropagation）/);
  assert.match(prompt, /## Other items in the same Learning OS block[\s\S]*梯度爆炸/);
  assert.match(prompt, /## Original source block background[\s\S]*启用\*\*反向传播算法\*\*/);
  assert.doesNotMatch(prompt, /## Source block/);
  assert.doesNotMatch(prompt, /## Nearby context before/);
  assert.match(prompt, /## Original nearby context before/);
});

test("ask prompt includes selected generated-content item as primary context", () => {
  const prompt = buildAskPrompt({
    userQuestion: "这个故事可以再短一点吗？",
    selectedText: "共同注释重新理解彼此",
    language: "auto",
    responseStyle: "normal",
    context: {
      notePath: "Stories.md",
      noteTitle: "Stories",
      selectedText: "共同注释重新理解彼此",
      headingPath: ["Stories"],
      currentHeading: "Stories",
      parentHeading: null,
      nearbyBefore: "",
      nearbyAfter: "",
      frontmatter: {},
      detectedConceptIds: [],
      sourceBlock: "原始学习段落。",
      sourceBlockHash: "hash",
      answerLanguage: "zh",
      askSourceMode: "generated-content-item",
      selectedLearningOsItem: {
        containerId: "gen-test",
        itemId: "babel-story",
        itemTitle: "巴别塔小故事",
        itemContent: "人们把知识堆成高塔，却在不同术语里迷路，最后用共同注释重新理解彼此。",
      },
      siblingLearningOsItems: [],
      originalSourceBlockBackground: "原始学习段落。",
      sourceSentenceTruncated: false,
      originalSelectionLength: 10,
    },
  });

  assert.match(prompt, /## Ask source mode\n\ngenerated-content-item/);
  assert.match(prompt, /## Selected generated content item[\s\S]*Item ID:\nbabel-story/);
  assert.match(prompt, /Item title:\n巴别塔小故事/);
  assert.match(prompt, /Item content:\n人们把知识堆成高塔/);
});

test("nearby context ignores adjacent Learning OS callout blocks", () => {
  const before = "上一段普通内容。";
  const source = "这一段包含 selected term。";
  const generated = `> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-test -->
>
> <!-- learnos-item-id: gen-story -->
> **故事** 这里是生成内容。`;
  const after = "下一段普通内容。";
  const markdown = `${before}\n\n${source}\n\n${generated}\n\n${after}`;
  const selectionStart = markdown.indexOf("selected");
  const selectionEnd = selectionStart + "selected".length;
  const sourceBlock = getLineBlockAtSelection(markdown, selectionStart, selectionEnd);

  assert.equal(getAdjacentLineAfterOffset(markdown, sourceBlock.end, 500), after);
  assert.doesNotMatch(getAdjacentLineAfterOffset(markdown, sourceBlock.end, 500), /\[!note\]|learnos-generated-id|故事/);
});

test("semantic source context skips whole Learning OS callouts between original paragraphs", () => {
  const before = "然而，现实的复杂性超出了线性代数的处理范畴。";
  const generated = `> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-context -->
>
> <!-- learnos-item-id: gen-story -->
> **故事** 这整块都不该进入 nearby context。`;
  const source = "这种纠缠状态导致了一个严重的工程学问题——注意力的热力学第二定律。";
  const clarification = `> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-context -->
>
> <!-- learnos-item-id: item-context -->
> **注意力热力学** 这整块也不该进入 nearby context。`;
  const after = "值得注意的是，所有的修辞手法都具有天然的越狱倾向。";
  const markdown = `${before}\n\n${generated}\n\n${source}\n\n${clarification}\n\n${after}`;
  const selectionStart = markdown.indexOf("注意力的热力学第二定律");
  const sourceBlock = getSemanticSourceBlockAtSelection(markdown, selectionStart, selectionStart + "注意力的热力学第二定律".length);
  const blocks = parseSemanticBlocks(markdown);

  assert.equal(blocks.some((block) => block.type === "learning-os-generated"), true);
  assert.equal(blocks.some((block) => block.type === "learning-os-clarification"), true);
  assert.equal(sourceBlock.text, source);
  assert.equal(getAdjacentLineBeforeOffset(markdown, sourceBlock.start, 1000), before);
  assert.equal(getAdjacentLineAfterOffset(markdown, sourceBlock.end, 1000), after);
  assert.doesNotMatch(getAdjacentLineBeforeOffset(markdown, sourceBlock.start, 1000), /learnos-|故事/);
  assert.doesNotMatch(getAdjacentLineAfterOffset(markdown, sourceBlock.end, 1000), /learnos-|注意力热力学/);
});

test("physical source mode keeps original prose selection as normal-note despite attached clarification", () => {
  const source =
    "这种纠缠状态导致了一个严重的工程学问题——**注意力的热力学第二定律**。即在一个封闭的叙事系统内，读者的困惑度总是趋于最大化。";
  const clarification = `> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-attached -->
>
> <!-- learnos-item-id: maxwell-demon -->
> **麦克斯韦妖是啥？** 麦克斯韦妖是物理学史上的一个思想实验。`;
  const markdown = `${source}\n\n${clarification}`;
  const selectionStart = markdown.indexOf("注意力的热力学第二定律");
  const selectionEnd = selectionStart + "注意力的热力学第二定律".length;
  const clarificationSelectionStart = markdown.indexOf("麦克斯韦妖");
  const generatedMarkdown = `${markdown}\n\n> [!note]- ✍️ AI 生成内容\n> <!-- learnos-generated-id: gen-story -->\n>\n> <!-- learnos-item-id: story -->\n> **故事** 生成内容。`;
  const generatedSelectionStart = generatedMarkdown.indexOf("生成内容");

  assert.equal(detectAskSourceMode(markdown, selectionStart, selectionEnd), "normal-note");
  assert.equal(
    detectAskSourceMode(markdown, clarificationSelectionStart, clarificationSelectionStart + "麦克斯韦妖".length),
    "clarification-item"
  );
  assert.equal(
    detectAskSourceMode(generatedMarkdown, generatedSelectionStart, generatedSelectionStart + "生成内容".length),
    "generated-content-item"
  );
});

test("runtime selection inside Learning OS item resolves source mode and target item marker", () => {
  const source = "补充模块 E: Cloud Deployment";
  const tip = `> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-20260705-212857-333-xls6lc-normal-note -->
>
> <!-- learnos-item-id: cloud-deployment-def -->
> **Cloud Deployment（云部署）** Cloud Deployment 是将应用部署到 AWS 等云平台上的过程。`;
  const generated = `> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-20260705-234359-425-rp7sfc-normal-note -->
>
> <!-- learnos-item-id: item-20260705-225515-讲一个这个的小故事呗 -->
> **这个的小故事呗** 从前有一家小公司叫面包工坊。`;
  const markdown = `${source}\n\n${tip}\n\n${generated}`;
  const tipSelectionStart = markdown.indexOf("AWS");
  const generatedSelectionStart = markdown.indexOf("面包工坊");
  const tipBlock = parseSemanticBlocks(markdown).find((block) => block.text.includes("cloud-deployment-def"));
  const generatedBlock = parseSemanticBlocks(markdown).find((block) =>
    block.text.includes("item-20260705-225515-讲一个这个的小故事呗")
  );
  const collector = new SelectionContextCollector({
    ...baseSettings,
    maxSelectedTextChars: 5000,
    maxContextBeforeChars: 5000,
    maxContextAfterChars: 5000,
  });
  const tipContext = collector.collect(fakeEditor(markdown, "AWS", tipSelectionStart, tipSelectionStart + "AWS".length), {
    file: { path: "测试.md", basename: "测试" },
  });
  const generatedContext = collector.collect(
    fakeEditor(markdown, "面包工坊", generatedSelectionStart, generatedSelectionStart + "面包工坊".length),
    { file: { path: "测试.md", basename: "测试" } }
  );

  assert.equal(detectAskSourceMode(markdown, tipSelectionStart, tipSelectionStart + "AWS".length), "clarification-item");
  assert.equal(
    detectAskSourceMode(markdown, generatedSelectionStart, generatedSelectionStart + "面包工坊".length),
    "generated-content-item"
  );
  assert.equal(tipBlock?.clarificationId, "clar-20260705-212857-333-xls6lc-normal-note");
  assert.match(tipBlock?.text ?? "", /learnos-item-id: cloud-deployment-def/);
  assert.equal(generatedBlock?.generatedId, "gen-20260705-234359-425-rp7sfc-normal-note");
  assert.match(generatedBlock?.text ?? "", /learnos-item-id: item-20260705-225515-讲一个这个的小故事呗/);
  assert.equal(tipContext.selectedText, "AWS");
  assert.equal(generatedContext.selectedText, "面包工坊");
});

test("Learning OS source mapping keeps adjacent callouts as separate containers", () => {
  const markdown = `> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-a -->
>
> <!-- learnos-item-id: item-a -->
> **Authentication** 是确认用户身份的过程。

> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-b -->
>
> <!-- learnos-item-id: item-b -->
> **Caching** 可以减少重复数据库访问。
>
> <!-- learnos-item-id: item-b-story -->
> **小故事** 缓存让数据库休息。

> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-c -->
>
> <!-- learnos-item-id: item-c -->
> **Observability** 用于理解系统内部运行状态。

> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-d -->
>
> <!-- learnos-item-id: item-d -->
> **Deployment** 是把应用发布到目标环境。

> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-e -->
>
> <!-- learnos-item-id: item-e -->
> **Monitoring** 用于持续观察系统指标。

> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-f -->
>
> <!-- learnos-item-id: item-f -->
> **Cost Control** 用于控制系统运行费用。

> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-g -->
>
> <!-- learnos-item-id: item-g -->
> **Tail** 结尾内容。`;

  const cases = [
    ["Authentication", "clar-a", "item-a", []],
    ["Caching", "gen-b", "item-b", ["item-b-story"]],
    ["小故事", "gen-b", "item-b-story", ["item-b"]],
    ["Observability", "clar-c", "item-c", []],
    ["Deployment", "gen-d", "item-d", []],
    ["Monitoring", "gen-e", "item-e", []],
    ["Cost Control", "clar-f", "item-f", []],
    ["Tail", "gen-g", "item-g", []],
  ];

  for (const [needle, containerId, itemId, siblingIds] of cases) {
    const actual = resolveLearningOsItemForSelection(markdown, needle);
    assert.equal(actual.container.containerId, containerId, needle);
    assert.equal(actual.context.selected.itemId, itemId, needle);
    assert.deepEqual(actual.context.siblings.map((item) => item.itemId), siblingIds, needle);
    assert.equal(actual.block.includes("clar-c") && containerId !== "clar-c", false, needle);
    assert.equal(actual.block.includes("gen-e") && containerId !== "gen-e", false, needle);
  }
});

test("Learning OS source mapping keeps lazy continuation but stops at the next callout", () => {
  const markdown = `> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-lazy -->
>
> <!-- learnos-item-id: item-lazy -->
> **First** 第一段

lazy continuation belongs here

> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-next -->
>
> <!-- learnos-item-id: item-next -->
> **Second** 第二个 Callout`;

  const lazy = resolveLearningOsItemForSelection(markdown, "lazy continuation");
  assert.equal(lazy.container.containerId, "clar-lazy");
  assert.equal(lazy.context.selected.itemId, "item-lazy");
  assert.match(lazy.block, /lazy continuation belongs here/);
  assert.doesNotMatch(lazy.block, /gen-next|Second/);

  const next = resolveLearningOsItemForSelection(markdown, "Second");
  assert.equal(next.container.containerId, "gen-next");
  assert.equal(next.context.selected.itemId, "item-next");
});

test("real source-local failure shapes map Observability Monitoring and Deployment to their own containers", () => {
  const markdown = `> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-final-b1 -->
>
> <!-- learnos-item-id: item-final-b1 -->
> **Authentication** 是确认用户身份的过程。

> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-final-b2 -->
>
> <!-- learnos-item-id: item-final-b2 -->
> **Caching** 可以减少重复数据库访问。
>
> <!-- learnos-item-id: item-story-b2 -->
> **小故事。** Caching story.

> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-final-b3 -->
>
> <!-- learnos-item-id: item-final-b3 -->
> **Observability** 用于理解系统内部运行状态。

> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-final-b4 -->
>
> <!-- learnos-item-id: item-final-b4 -->
> **Deployment** 是把应用发布到目标环境。

> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-final-b5 -->
>
> <!-- learnos-item-id: item-final-b5 -->
> **Monitoring** 用于持续观察系统指标。

> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-final-b6 -->
>
> <!-- learnos-item-id: item-final-b6 -->
> **Cost Control** 用于控制系统运行费用。`;

  const observability = resolveLearningOsItemForSelection(markdown, "解系统内");
  assert.equal(observability.container.containerId, "clar-final-b3");
  assert.equal(observability.context.selected.itemId, "item-final-b3");
  assert.equal(observability.context.selected.itemTitle, "Observability");

  const monitoring = resolveLearningOsItemForSelection(markdown, "Monitoring");
  assert.equal(monitoring.container.containerId, "gen-final-b5");
  assert.equal(monitoring.context.selected.itemId, "item-final-b5");
  assert.deepEqual(monitoring.context.siblings, []);

  const deployment = resolveLearningOsItemForSelection(markdown, "是把应用发布到目标环境");
  assert.equal(deployment.container.containerId, "gen-final-b4");
  assert.equal(deployment.context.selected.itemId, "item-final-b4");
  assert.deepEqual(deployment.context.siblings, []);
});

test("original prose context ignores Learning OS blocks and never duplicates source as nearby after", () => {
  const before =
    "然而，现实的复杂性超出了线性代数的处理范畴。当叙事时间轴被切割成普朗克尺度的离散切片时，原本连贯的因果链会遭遇阻碍。";
  const source =
    "这种纠缠状态导致了一个严重的工程学问题——**注意力的热力学第二定律**。即在一个封闭的叙事系统内，读者的困惑度总是趋于最大化。";
  const after =
    "值得注意的是，所有的修辞手法都具有天然的越狱倾向。拟人化不仅是一种文学工具，更是一种对抗虚无主义的病毒式攻击。";
  const generated = `> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-between -->
>
> <!-- learnos-item-id: generated-between -->
> **生成内容** 不应该被当作上下文。`;
  const clarification = `> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-between -->
>
> <!-- learnos-item-id: item-between -->
> **麦克斯韦妖** 不应该被当作上下文。`;
  const markdown = `# 元叙事\n\n${before}\n\n${generated}\n\n${source}\n\n${clarification}\n\n${after}`;
  const selectionStart = markdown.indexOf("注意力的热力学第二定律");
  const context = resolveOriginalProseContext({
    markdown,
    selectionStart,
    selectionEnd: selectionStart + "注意力的热力学第二定律".length,
    selectedText: "注意力的热力学第二定律",
  });

  assert.equal(context.sourceBlock?.text, source);
  assert.equal(context.nearbyBefore, before);
  assert.equal(context.nearbyAfter, after);
  assert.notEqual(context.nearbyAfter, source);
  assert.doesNotMatch(context.nearbyBefore, /learnos-|生成内容/);
  assert.doesNotMatch(context.nearbyAfter, /learnos-|麦克斯韦妖/);
});

test("original prose context resolves stale offsets by exact text among normal blocks", () => {
  const before = "上一段原文。";
  const source = "此时，我们需要启用**反向传播算法**来修正叙事的梯度消失问题。";
  const after = "下一段原文。";
  const staleCallout = `> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-stale -->
>
> <!-- learnos-item-id: item-stale -->
> **反向传播** 旧记录。`;
  const markdown = `${before}\n\n${staleCallout}\n\n${source}\n\n${after}`;
  const staleOffset = markdown.indexOf("旧记录");
  const context = resolveOriginalProseContext({
    markdown,
    sourceBlock: source,
    sourceBlockHash: "wrong-hash",
    sourceStartOffset: staleOffset,
    sourceEndOffset: staleOffset + "旧记录".length,
  });

  assert.equal(context.method, "exact-source");
  assert.equal(context.sourceBlock?.text, source);
  assert.equal(context.nearbyBefore, before);
  assert.equal(context.nearbyAfter, after);
});

test("generation satisfaction accepts Babel Tower story and rejects unrelated explanation", () => {
  assert.equal(
    generatedContentMissingWarning("生成一个巴别塔的小故事", "以下是关于数字巴别塔的一个小故事。人们把知识堆成高塔，却忘了彼此翻译。"),
    null
  );
  assert.equal(
    generatedContentMissingWarning("讲一个巴别塔的小故事", "通天塔越建越高，人们的语言却越分越散。最后，一个孩子用图画把大家重新连接起来。"),
    null
  );
  assert.equal(
    generatedContentMissingWarning("生成一个 niko 小趣事", "NiKo 有次在 CS2 训练里连续试了十几种投掷物路线，队友笑称他像是在给地图做体检。"),
    null
  );
  assert.notEqual(
    generatedContentMissingWarning("生成一个巴别塔的小故事", "Entropy of Confusion 是一个描述困惑程度的概念。"),
    null
  );
});

test("SelectionContextCollector extracts the exact Chinese source context from offsets", () => {
  const before =
    "肯定第一步，也差不多就是做一个整本书的 summarize 的，差不多就是规划好大纲，然后保证整个 project 的大方向不偏离，保证即使上下文爆了，也会保证不偏离。";
  const source =
    "然后关于不吃整本书，我觉得应该是一个大内容一个吧？比如一个大章节，或者是一个大类别？然后这个大类别里面的知识点肯定还要和其他的大章节里面的知识点，如果有关联，肯定要有交叉的。";
  const after =
    "AI 一定是我的老师，但是我不希望定式，什么 5 句话说出本章要解决什么问题，过度的压缩没有必要，过度的废话同样没有必要，要因地适宜，具体问题具体分析，你觉得这一内容要详细就详细，这一内容要简略就简略。";
  const markdown = `${before}\n\n${source}\n\n${after}`;
  const selectedText = "肯定要有交叉的。";
  const selectionStart = markdown.indexOf(selectedText);
  const selectionEnd = selectionStart + selectedText.length;
  const collector = new SelectionContextCollector({
    ...baseSettings,
    maxSelectedTextChars: 5000,
    maxContextBeforeChars: 5000,
    maxContextAfterChars: 5000,
  });
  const context = collector.collect(fakeEditor(markdown, selectedText, selectionStart, selectionEnd), {
    file: {
      path: "Projects/AI 辅助学习流程.md",
      basename: "AI 辅助学习流程",
    },
  });

  assert.equal(context.selectedText, selectedText);
  assert.equal(context.sourceBlock, source);
  assert.equal(context.nearbyBefore, before);
  assert.equal(context.nearbyAfter, after);
});

test("context extraction handles missing before or after paragraphs", () => {
  const firstMarkdown = "First selected paragraph.\n\nSecond paragraph.";
  const firstStart = firstMarkdown.indexOf("selected");
  const firstBlock = getSourceBlockAtSelection(firstMarkdown, firstStart, firstStart + "selected".length);
  assert.equal(firstBlock.text, "First selected paragraph.");
  assert.equal(getAdjacentParagraphBeforeOffset(firstMarkdown, firstBlock.start, 500), "");
  assert.equal(getAdjacentParagraphAfterOffset(firstMarkdown, firstBlock.end, 500), "Second paragraph.");

  const lastMarkdown = "First paragraph.\n\nLast selected paragraph.";
  const lastStart = lastMarkdown.indexOf("selected");
  const lastBlock = getSourceBlockAtSelection(lastMarkdown, lastStart, lastStart + "selected".length);
  assert.equal(lastBlock.text, "Last selected paragraph.");
  assert.equal(getAdjacentParagraphBeforeOffset(lastMarkdown, lastBlock.start, 500), "First paragraph.");
  assert.equal(getAdjacentParagraphAfterOffset(lastMarkdown, lastBlock.end, 500), "");
});

test("prompt context uses actual newline boundaries for source block extraction", () => {
  const before = "Previous paragraph.";
  const source = "and the selected sentence is here.";
  const after = "Next paragraph.";
  const markdown = `${before}\n${source}\n${after}`;
  const selectionStart = markdown.indexOf("selected sentence");
  const sourceBlock = getLineBlockAtSelection(markdown, selectionStart, selectionStart + "selected sentence".length);

  assert.equal(sourceBlock.text, source);
  assert.equal(getAdjacentLineBeforeOffset(markdown, sourceBlock.start, 500), before);
  assert.equal(getAdjacentLineAfterOffset(markdown, sourceBlock.end, 500), after);
});

test("prompt context skips blank lines around line-based source", () => {
  const markdown = "A\n\nB selected here\n\nC";
  const selectionStart = markdown.indexOf("selected");
  const sourceBlock = getLineBlockAtSelection(markdown, selectionStart, selectionStart + "selected".length);

  assert.equal(sourceBlock.text, "B selected here");
  assert.equal(getAdjacentLineBeforeOffset(markdown, sourceBlock.start, 500), "A");
  assert.equal(getAdjacentLineAfterOffset(markdown, sourceBlock.end, 500), "C");
});

test("prompt context keeps a long visual wrap without actual newline as one source line", () => {
  const markdown =
    "This is a very long Markdown source line with no actual newline before the selected sentence, so visual wrapping in Obsidian must not split it.";
  const selectionStart = markdown.indexOf("selected sentence");
  const sourceBlock = getLineBlockAtSelection(markdown, selectionStart, selectionStart + "selected sentence".length);

  assert.equal(sourceBlock.text, markdown);
  assert.equal(getAdjacentLineBeforeOffset(markdown, sourceBlock.start, 500), "");
  assert.equal(getAdjacentLineAfterOffset(markdown, sourceBlock.end, 500), "");
});

test("prompt context includes all selected lines for multi-line selection", () => {
  const markdown = "Line 1 before\nLine 2 selected start\nLine 3 selected end\nLine 4 after";
  const selectionStart = markdown.indexOf("selected start");
  const selectionEnd = markdown.indexOf("selected end") + "selected end".length;
  const sourceBlock = getLineBlockAtSelection(markdown, selectionStart, selectionEnd);

  assert.equal(sourceBlock.text, "Line 2 selected start\nLine 3 selected end");
  assert.equal(getAdjacentLineBeforeOffset(markdown, sourceBlock.start, 500), "Line 1 before");
  assert.equal(getAdjacentLineAfterOffset(markdown, sourceBlock.end, 500), "Line 4 after");
});

test("prompt context handles Chinese actual line breaks", () => {
  const line1 = "第一行提供上文。";
  const line2 = "第二行包含用户选中的肯定要有交叉的。";
  const line3 = "第三行提供下文。";
  const markdown = `${line1}\n${line2}\n${line3}`;
  const selectionStart = markdown.indexOf("肯定要有交叉的");
  const sourceBlock = getLineBlockAtSelection(markdown, selectionStart, selectionStart + "肯定要有交叉的".length);

  assert.equal(sourceBlock.text, line2);
  assert.equal(getAdjacentLineBeforeOffset(markdown, sourceBlock.start, 500), line1);
  assert.equal(getAdjacentLineAfterOffset(markdown, sourceBlock.end, 500), line3);
});

test("SelectionContextCollector uses line-based context when Chinese lines have no blank separator", () => {
  const line1 = "肯定第一步，是规划整本书的大纲。";
  const line2 = "第二行说如果有关联，肯定要有交叉的。";
  const line3 = "AI 一定是我的老师，但不要定式。";
  const markdown = `${line1}\n${line2}\n${line3}`;
  const selectedText = "肯定要有交叉的。";
  const selectionStart = markdown.indexOf(selectedText);
  const collector = new SelectionContextCollector({
    ...baseSettings,
    maxSelectedTextChars: 5000,
    maxContextBeforeChars: 5000,
    maxContextAfterChars: 5000,
  });
  const context = collector.collect(
    fakeEditor(markdown, selectedText, selectionStart, selectionStart + selectedText.length),
    {
      file: {
        path: "AI 辅助学习流程.md",
        basename: "AI 辅助学习流程",
      },
    }
  );

  assert.equal(context.selectedText, selectedText);
  assert.equal(context.sourceBlock, line2);
  assert.equal(context.nearbyBefore, line1);
  assert.equal(context.nearbyAfter, line3);
});

test("heading path is not mixed into nearby context when a previous paragraph exists", () => {
  const markdown = "## Topic\n\nParagraph A\n\nParagraph B selected";
  const selectedLine = 4;

  assert.deepEqual(buildExpandedHeadingPath("Note.md", "Note", ["Topic"]), ["Note", "Topic"]);
  assert.equal(getAdjacentParagraphBefore(markdown, selectedLine, 500), "Paragraph A");
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
    assert.equal(response.answer, "raw");
    assert.match(response.rawAnswer, /"answer":"raw"/);
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
    assert.equal(response.answer, "raw");
    assert.match(response.rawAnswer, /"answer":"raw"/);
    assert.equal(response.suggestedTakeaway, "takeaway");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
