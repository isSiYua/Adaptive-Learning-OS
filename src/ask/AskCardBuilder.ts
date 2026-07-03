import { ASK_CARD_END, ASK_CARD_SCHEMA_VERSION, ASK_CARD_START } from "../constants";
import { quoteYamlString, stringifyYamlScalar } from "../utils/yaml";
import type { AskCard } from "../types";

export function buildAskCardBlock(card: AskCard, includeFullAnswer: boolean): string {
  const lines = [
    ASK_CARD_START,
    `schemaVersion: ${ASK_CARD_SCHEMA_VERSION}`,
    `id: ${quoteYamlString(card.id)}`,
    `concept: ${quoteYamlString(card.concept)}`,
    `status: ${quoteYamlString(card.status)}`,
    formatStringField("source_sentence", card.source_sentence),
    formatStringField("question", card.question),
    formatStringField("key_answer", card.key_answer),
    formatStringField("my_takeaway", card.my_takeaway),
    `mastery_signal: ${quoteYamlString(card.mastery_signal)}`,
    `review_needed: ${stringifyYamlScalar(card.review_needed)}`,
    `created: ${quoteYamlString(card.created)}`,
  ];

  if (includeFullAnswer && card.full_answer?.trim()) {
    lines.push("full_answer: |");
    for (const line of card.full_answer.trim().split(/\r?\n/)) {
      lines.push(`  ${line}`);
    }
  }

  lines.push(ASK_CARD_END);
  return lines.join("\n");
}

function formatStringField(key: string, value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.includes("\n") || normalized.length > 180) {
    const lines = [`${key}: |`];
    for (const line of normalized.split("\n")) {
      lines.push(`  ${line}`);
    }
    return lines.join("\n");
  }

  return `${key}: ${quoteYamlString(normalized)}`;
}
