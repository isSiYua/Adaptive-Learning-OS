import { ASK_CARD_END, ASK_CARD_START } from "../constants";
import { parseYamlScalar } from "../utils/yaml";
import type { AskCard, MasterySignal, ParsedAskCard } from "../types";

export function parseAskCards(markdown: string): ParsedAskCard[] {
  const cards: ParsedAskCard[] = [];
  let searchStart = 0;

  while (searchStart < markdown.length) {
    const startIndex = markdown.indexOf(ASK_CARD_START, searchStart);
    if (startIndex === -1) break;

    const contentStart = startIndex + ASK_CARD_START.length;
    const endIndex = markdown.indexOf(ASK_CARD_END, contentStart);
    if (endIndex === -1) {
      cards.push({
        card: {},
        raw: markdown.slice(startIndex),
        startIndex,
        endIndex: markdown.length,
        errors: ["Missing Ask Card closing marker."],
        fields: {},
      });
      break;
    }

    const raw = markdown.slice(startIndex, endIndex + ASK_CARD_END.length);
    const body = markdown.slice(contentStart, endIndex).replace(/^\r?\n/, "");
    const { fields, errors } = parseAskCardFields(body);
    cards.push({
      card: fieldsToAskCard(fields),
      raw,
      startIndex,
      endIndex: endIndex + ASK_CARD_END.length,
      errors,
      fields,
    });

    searchStart = endIndex + ASK_CARD_END.length;
  }

  return cards;
}

function parseAskCardFields(body: string): {
  fields: Record<string, string | boolean | number>;
  errors: string[];
} {
  const fields: Record<string, string | boolean | number> = {};
  const errors: string[] = [];
  const lines = body.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    const blockMatch = /^([A-Za-z0-9_-]+):\s*\|\s*$/.exec(line);
    if (blockMatch) {
      const key = blockMatch[1];
      const blockLines: string[] = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
        index += 1;
        blockLines.push(lines[index].replace(/^ {1,2}/, ""));
      }
      fields[key] = blockLines.join("\n");
      continue;
    }

    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) {
      errors.push(`Could not parse line: ${line}`);
      continue;
    }

    fields[match[1]] = parseYamlScalar(match[2]);
  }

  return { fields, errors };
}

function fieldsToAskCard(fields: Record<string, string | boolean | number>): Partial<AskCard> {
  return {
    schemaVersion: numberField(fields.schemaVersion),
    id: stringField(fields.id),
    concept: stringField(fields.concept),
    status: stringField(fields.status) as AskCard["status"],
    source_sentence: stringField(fields.source_sentence),
    question: stringField(fields.question),
    key_answer: stringField(fields.key_answer),
    my_takeaway: stringField(fields.my_takeaway),
    mastery_signal: masterySignalField(fields.mastery_signal),
    review_needed: booleanField(fields.review_needed),
    created: stringField(fields.created),
    full_answer: stringField(fields.full_answer),
    fields,
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function booleanField(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function masterySignalField(value: unknown): MasterySignal | undefined {
  return value === "neutral" || value === "weak" || value === "resolved" ? value : undefined;
}
