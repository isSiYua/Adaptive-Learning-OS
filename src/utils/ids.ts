import { timestampSlug } from "./dates";

export function slugify(value: string, fallback = "selection"): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || fallback;
}

export function createAskCardId(concept: string, date = new Date()): string {
  return `ask-${timestampSlug(date)}-${slugify(concept, "concept")}`;
}

export function createClarificationId(concept: string, date = new Date()): string {
  return `clar-${timestampSlug(date)}-${String(date.getMilliseconds()).padStart(3, "0")}-${Math.random()
    .toString(36)
    .slice(2, 8)}-${slugify(concept, "paragraph")}`;
}

export function createGeneratedContentId(concept: string, date = new Date()): string {
  return `gen-${timestampSlug(date)}-${String(date.getMilliseconds()).padStart(3, "0")}-${Math.random()
    .toString(36)
    .slice(2, 8)}-${slugify(concept, "content")}`;
}

export function createClarificationItemId(value: string, date = new Date()): string {
  return `item-${timestampSlug(date)}-${slugify(value, "clarification")}`;
}

export function createInteractionId(date = new Date()): string {
  return `ask-${timestampSlug(date)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createAskJobId(date = new Date()): string {
  return `job-${timestampSlug(date)}-${Math.random().toString(36).slice(2, 8)}`;
}
