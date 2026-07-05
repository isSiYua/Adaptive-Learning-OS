import { stableHash } from "../utils/hash";

const QUESTION_SUFFIX = /(?:是什么|是啥|什么意思|的含义|含义|怎么理解|为什么|why|what is|meaning of)\s*[?？!！.。]*$/i;

export function conceptNameFromTitle(title: string): string {
  let name = title
    .replace(/^\*+|\*+$/g, "")
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  name = name.replace(QUESTION_SUFFIX, "").trim();
  name = name.replace(/[?？!！]+$/g, "").trim();
  return name || "Untitled concept";
}

export function conceptIdFromName(name: string): string {
  const normalized = name.normalize("NFKC").trim().toLowerCase();
  const asciiSlug = normalized
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (asciiSlug) {
    return `${asciiSlug}-${stableHash(normalized).slice(0, 6)}`;
  }

  return `concept-${stableHash(normalized || name).slice(0, 12)}`;
}
