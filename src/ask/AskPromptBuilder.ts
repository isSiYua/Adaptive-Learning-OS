import { answerLanguageInstruction } from "./ClarificationUpdatePromptBuilder";
import { askIntentPromptLine } from "./AskIntent";
import { latexMathFormattingRule, structuredJsonOutputRule } from "./PromptRules";
import type { AskRequest } from "../types";

export function buildAskPrompt(request: AskRequest): string {
  const context = request.context;
  const sourceMode = context.askSourceMode ?? "normal-note";

  return `# Learning OS Inline Question

You are helping the user with an inline request in an Obsidian learning note.

The user's request is the primary task.
The selected sentence, source block, nearby context, and heading path are context only.

If the user asks to explain, clarify, or understand the selected text, explain it in context.
If the user asks to generate, write, rewrite, translate, brainstorm, compare, summarize, or transform something, do that task directly.
Do not ignore the user's request in order to explain the selected sentence.
If no user question is provided, default to explaining the selected sentence in context.

${answerLanguageInstruction(request.context.answerLanguage ?? "auto")}

${latexMathFormattingRule(request.context.answerLanguage ?? "auto")}

## Selected sentence

${request.selectedText}

## Ask source mode

${sourceMode}

${sourceContextSections(request)}

## Heading path

${context.headingPath.join(" > ") || "(none)"}

## User question

${request.userQuestion}

## Intent

${askIntentPromptLine(request.userQuestion)}

## Relevant concept

${context.detectedConceptIds[0] ?? "(none)"}

## Instructions

1. First identify the user's intent from the User question.
2. Directly answer the user's question. If a user question is provided, answer that question directly.
3. Use Selected sentence / Source block / Nearby context only when relevant to the user's request.
4. If the user asks for generated content, produce the requested content directly.
5. If the user asks to explain the selected text, explain it in context.
6. If no user question is provided, explain the selected sentence in context.
7. Do not summarize the whole note unless the user asks for a summary.
8. Do not invent sources. If factual accuracy is uncertain, say so briefly.
9. Produce a concise takeaway suitable for note insertion only when appropriate.
10. Return valid JSON only.
11. When Ask source mode is clarification-item or generated-content-item, treat the selected Learning OS item as the main context; use the original source block only as background.

指令优先级：
1. 直接回答用户的问题。
2. 选中文本、原段落、标题路径和上下文只是背景信息。
3. 如果用户要求“生成/输出/写一个故事/例子/测试内容/翻译/公式/代码”，必须生成对应内容。
4. 即使生成内容和原文不完全相关，也要先满足用户的明确请求。
5. 不要把“给我一个 csgo 小故事”这种请求改写成对选中文本的普通解释。

${structuredJsonOutputRule(request.context.answerLanguage ?? "auto")}

## Required JSON format

{
  "answer": "Detailed explanation.",
  "key_answer": "One concise answer.",
  "suggested_takeaway": "Concise clarification item explanation suitable for the note.",
  "mastery_signal": "neutral",
  "review_needed": false
}

mastery_signal must be one of: neutral, weak, resolved.
`;
}

function sourceContextSections(request: AskRequest): string {
  const context = request.context;
  const sourceMode = context.askSourceMode ?? "normal-note";
  if (sourceMode === "normal-note") {
    return `## Source block

${context.sourceBlock || request.selectedText}

## Nearby context before

${context.nearbyBefore}

## Nearby context after

${context.nearbyAfter}`;
  }
  return learningOsItemContext(context);
}

function learningOsItemContext(context: AskRequest["context"]): string {
  if (!context.selectedLearningOsItem) {
    return `## Original source block background

${context.originalSourceBlockBackground ?? context.sourceBlock ?? "(none)"}

## Original nearby context before

${context.nearbyBefore || "(none)"}

## Original nearby context after

${context.nearbyAfter || "(none)"}`;
  }
  const label =
    context.askSourceMode === "generated-content-item"
      ? "Selected generated content item"
      : "Selected clarification item";
  const siblingItems = context.siblingLearningOsItems ?? [];
  return `## ${label}

Container ID:
${context.selectedLearningOsItem.containerId}

Item ID:
${context.selectedLearningOsItem.itemId}

Item title:
${context.selectedLearningOsItem.itemTitle}

Item content:
${context.selectedLearningOsItem.itemContent}

## Other items in the same Learning OS block

${
  siblingItems.length > 0
    ? siblingItems.map((item) => `- ${item.itemTitle}: ${item.itemContent}`).join("\n")
    : "(none)"
}

## Original source block background

${context.originalSourceBlockBackground ?? context.sourceBlock ?? "(none)"}

## Original nearby context before

${context.nearbyBefore || "(none)"}

## Original nearby context after

${context.nearbyAfter || "(none)"}`;
}
