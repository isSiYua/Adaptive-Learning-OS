import { buildClarificationBlock } from "./ClarificationBlock";
import { parseAiResponseJson } from "./AiResponseParser";
import { parseAskCards } from "./AskCardParser";
import { createClarificationId, createInteractionId } from "../utils/ids";
import { toLocalIsoString } from "../utils/dates";
import { stableHash } from "../utils/hash";
import type { ClarificationRecord, LearningOsSettings, ParsedAskCard } from "../types";

export interface LegacyConversionResult {
  markdown: string;
  records: ClarificationRecord[];
  skipped: number;
}

export function convertLegacyAskCards(
  markdown: string,
  notePath: string,
  settings: Pick<
    LearningOsSettings,
    "uiLanguage" | "answerLanguage"
  >,
  now = new Date()
): LegacyConversionResult {
  const parsed = parseAskCards(markdown);
  const records: ClarificationRecord[] = [];
  let skipped = 0;
  let nextMarkdown = markdown;

  for (const legacy of [...parsed].reverse()) {
    if (legacy.errors.length > 0) {
      skipped += 1;
      continue;
    }

    const record = legacyToRecord(legacy, notePath, settings, now);
    if (!record) {
      skipped += 1;
      continue;
    }

    records.unshift(record);
    const visible = buildClarificationBlock(record, settings);
    nextMarkdown = `${nextMarkdown.slice(0, legacy.startIndex)}${visible}${nextMarkdown.slice(
      legacy.endIndex
    )}`;
  }

  return { markdown: nextMarkdown, records, skipped };
}

function legacyToRecord(
  legacy: ParsedAskCard,
  notePath: string,
  settings: Pick<LearningOsSettings, "uiLanguage" | "answerLanguage">,
  now: Date
): ClarificationRecord | null {
  const fields = legacy.fields;
  const concept = stringValue(fields.concept) || "unknown";
  const created = stringValue(fields.created) || toLocalIsoString(now);
  const rawKeyAnswer = stringValue(fields.key_answer) ?? "";
  const parsedJson = parseAiResponseJson(rawKeyAnswer);
  const keyAnswer = parsedJson?.keyAnswer || rawKeyAnswer;
  const explanation =
    stringValue(fields.my_takeaway) || parsedJson?.suggestedTakeaway || parsedJson?.keyAnswer || keyAnswer;
  const sourceBlock = stringValue(fields.source_sentence) || "";
  const question = stringValue(fields.question) || "";

  if (!explanation && !keyAnswer) return null;

  const id = stringValue(fields.id)?.replace(/^ask-/, "clar-") || createClarificationId(concept, now);
  const interactionId = createInteractionId(now);
  return {
    schemaVersion: 1,
    id,
    notePath,
    sourceBlock,
    sourceBlockHash: stableHash(sourceBlock),
    headingPath: [],
    detectedConcept: concept,
    language: settings.answerLanguage,
    uiLanguage: settings.uiLanguage,
    created,
    updated: toLocalIsoString(now),
    items: [
      {
        id: `${id}-item-1`,
        targetText: concept,
        itemTitle: concept === "unknown" ? "Clarification" : concept,
        question,
        explanation,
        created,
        updated: toLocalIsoString(now),
        relatedInteractionIds: [interactionId],
      },
    ],
    interactions: [
      {
        id: interactionId,
        type: "new-item",
        selectedText: sourceBlock,
        question,
        rawAnswer: parsedJson?.answer || stringValue(fields.full_answer) || "",
        keyAnswer,
        suggestedExplanation: explanation,
        provider: "legacy-ask-card",
        created,
      },
    ],
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
