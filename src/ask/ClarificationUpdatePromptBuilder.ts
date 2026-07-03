import type {
  AnswerLanguage,
  AskInteraction,
  ClarificationItem,
  ClarificationRecord,
  ClarificationUpdateDecision,
  SelectionContext,
  UiLanguage,
} from "../types";

export function buildClarificationUpdatePrompt(params: {
  record: ClarificationRecord;
  context: SelectionContext;
  question: string;
  rawAnswer: string;
  answerLanguage: AnswerLanguage;
}): string {
  return `# Learning OS Clarification Update

You are updating a structured "My understanding" clarification block in an Obsidian learning note.

The user has asked a new question about either:
- the original source paragraph, or
- an existing explanation inside the clarification block.

Your task:
- decide whether to update an existing clarification item or add a new item,
- preserve useful previous explanations,
- merge overlapping content,
- keep the final visible note concise and readable.

${answerLanguageInstruction(params.answerLanguage)}

## Source block

${params.record.sourceBlock}

## Existing clarification items

${JSON.stringify(params.record.items, null, 2)}

## New selected text

${params.context.selectedText}

## New user question

${params.question}

## New AI answer / raw explanation

${params.rawAnswer}

## Output requirements

Return valid JSON only.

{
  "action": "update-item | add-item",
  "target_item_id": "existing item id if update-item, otherwise null",
  "new_or_updated_item": {
    "targetText": "text this item explains",
    "itemTitle": "short bold title for visible note",
    "explanation": "concise explanation for visible note"
  },
  "full_visible_markdown": "the complete updated content inside the callout, without the callout title and without hidden marker",
  "reason": "brief reason for the merge/update decision",
  "language": "zh | en"
}
`;
}

export function parseClarificationUpdateDecision(input: string): ClarificationUpdateDecision | null {
  const jsonText = extractJsonObject(input);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const item = parsed.new_or_updated_item as Record<string, unknown> | undefined;
    const action = parsed.action === "update-item" ? "update-item" : "add-item";
    const itemTitle = stringField(item?.itemTitle);
    const explanation = stringField(item?.explanation);
    if (!itemTitle || !explanation) return null;

    return {
      action,
      targetItemId: stringField(parsed.target_item_id) ?? null,
      item: {
        targetText: stringField(item?.targetText) ?? "",
        itemTitle,
        explanation,
      },
      fullVisibleMarkdown: stringField(parsed.full_visible_markdown) ?? "",
      reason: stringField(parsed.reason) ?? "",
      language: parsed.language === "en" ? "en" : "zh",
    };
  } catch {
    return null;
  }
}

export function applyClarificationDecision(params: {
  record: ClarificationRecord;
  decision: ClarificationUpdateDecision;
  interaction: AskInteraction;
  nowIso: string;
}): ClarificationRecord {
  const nextItems = [...params.record.items];
  const targetIndex =
    params.decision.action === "update-item" && params.decision.targetItemId
      ? nextItems.findIndex((item) => item.id === params.decision.targetItemId)
      : -1;

  if (targetIndex >= 0) {
    const current = nextItems[targetIndex];
    nextItems[targetIndex] = {
      ...current,
      targetText: params.decision.item.targetText || current.targetText,
      itemTitle: params.decision.item.itemTitle,
      question: params.interaction.question,
      explanation: params.decision.item.explanation,
      updated: params.nowIso,
      relatedInteractionIds: unique([...current.relatedInteractionIds, params.interaction.id]),
    };
  } else {
    nextItems.push({
      id: createItemId(params.decision.item.itemTitle, nextItems.length + 1),
      targetText: params.decision.item.targetText,
      itemTitle: params.decision.item.itemTitle,
      question: params.interaction.question,
      explanation: params.decision.item.explanation,
      created: params.nowIso,
      updated: params.nowIso,
      relatedInteractionIds: [params.interaction.id],
    });
  }

  return {
    ...params.record,
    updated: params.nowIso,
    items: nextItems,
    interactions: [...params.record.interactions, params.interaction],
  };
}

export function createFallbackDecision(params: {
  selectedText: string;
  question: string;
  explanation: string;
  language: UiLanguage;
}): ClarificationUpdateDecision {
  return {
    action: "add-item",
    targetItemId: null,
    item: {
      targetText: params.selectedText,
      itemTitle: params.question || params.selectedText,
      explanation: params.explanation,
    },
    fullVisibleMarkdown: "",
    reason: "Fallback item created without structured AI merge.",
    language: params.language,
  };
}

export function answerLanguageInstruction(language: AnswerLanguage): string {
  if (language === "zh") {
    return "Answer in Chinese, keeping professional terms in English when appropriate.";
  }
  if (language === "en") {
    return "Answer in English.";
  }
  return "Answer in the same language as the user's question. If the question is Chinese, answer in Chinese while keeping professional terms in English when appropriate. If the question is English, answer in English.";
}

function createItemId(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `item-${slug || index}`;
}

function extractJsonObject(input: string): string | null {
  const trimmed = input.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const source = fenced ? fenced[1].trim() : trimmed;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return source.slice(start, end + 1);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
