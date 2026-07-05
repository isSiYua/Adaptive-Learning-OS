import type { KnowledgeCounts, KnowledgeEvidence, KnowledgeItemStatusCounts } from "./KnowledgeTypes";

export function formatKnowledgeDataGlobalSummary(input: {
  counts: KnowledgeCounts;
  itemCounts: KnowledgeItemStatusCounts;
  lastRebuild: string;
  lastAutoSync: string;
  latestEvidence: KnowledgeEvidence[];
}): string {
  const evidenceLines =
    input.latestEvidence.length > 0
      ? input.latestEvidence.map((evidence, index) => `${index + 1}. ${formatEvidenceLine(evidence)}`)
      : ["none"];

  return [
    "KnowledgeData Global Summary",
    "Scope: whole vault/project",
    `Concepts: ${input.counts.concepts}`,
    `Total indexed items: ${input.itemCounts.total}`,
    `Active items: ${input.itemCounts.active}`,
    `Missing/deleted items: ${input.itemCounts.missingDeleted}`,
    `Evidence: ${input.counts.evidence}`,
    `Source refs: ${input.counts.sourceRefs}`,
    `Last rebuild: ${input.lastRebuild}`,
    `Last auto sync: ${input.lastAutoSync}`,
    "Latest evidence:",
    ...evidenceLines,
  ].join("\n");
}

function formatEvidenceLine(evidence: KnowledgeEvidence): string {
  const itemPart = evidence.itemId ? ` - ${evidence.itemId}` : "";
  return `${evidence.sourceType}/${evidence.signalType}${itemPart} - ${truncate(evidence.summary, 96)}`;
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}
