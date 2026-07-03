import type { MasterySignal } from "../types";

export interface ParsedAiResponseJson {
  answer: string;
  keyAnswer: string;
  suggestedTakeaway: string;
  masterySignal: MasterySignal;
  reviewNeeded: boolean;
  parsed: boolean;
}

export function parseAiResponseJson(input: string): ParsedAiResponseJson | null {
  const jsonText = extractJsonObject(input);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const keyAnswer = stringField(parsed.key_answer) ?? stringField(parsed.keyAnswer);
    const suggestedTakeaway =
      stringField(parsed.suggested_takeaway) ?? stringField(parsed.suggestedTakeaway);

    if (!keyAnswer && !suggestedTakeaway) return null;

    return {
      answer: stringField(parsed.answer) ?? "",
      keyAnswer: keyAnswer ?? "",
      suggestedTakeaway: suggestedTakeaway ?? "",
      masterySignal: masterySignalField(parsed.mastery_signal) ?? "neutral",
      reviewNeeded: booleanField(parsed.review_needed) ?? false,
      parsed: true,
    };
  } catch {
    return null;
  }
}

export function parseAiResponseOrFallback(input: string): ParsedAiResponseJson {
  return (
    parseAiResponseJson(input) ?? {
      answer: input.trim(),
      keyAnswer: "",
      suggestedTakeaway: "",
      masterySignal: "neutral",
      reviewNeeded: false,
      parsed: false,
    }
  );
}

function extractJsonObject(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const unfenced = fenced ? fenced[1].trim() : trimmed;

  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  return unfenced.slice(start, end + 1);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function booleanField(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function masterySignalField(value: unknown): MasterySignal | undefined {
  return value === "neutral" || value === "weak" || value === "resolved" ? value : undefined;
}
