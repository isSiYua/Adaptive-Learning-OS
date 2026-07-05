import { KNOWLEDGE_SCHEMA_VERSION, type KnowledgeCounts } from "./KnowledgeTypes";
import { KnowledgeRepository } from "./KnowledgeRepository";
import { toLocalIsoString } from "../utils/dates";
import type { KnowledgeDb } from "./KnowledgeDb";
import type { FileStore } from "../storage/FileStore";

export interface KnowledgeExportSummary {
  generatedAt: string;
  counts: KnowledgeCounts;
  paths: {
    concepts: string;
    knowledgeSummary: string;
    masterySummary: string;
  };
}

export async function exportKnowledgeSummary(
  db: KnowledgeDb,
  fileStore: FileStore,
  dataFolder: string
): Promise<KnowledgeExportSummary> {
  await fileStore.ensureKnowledgeFolders();
  const repo = new KnowledgeRepository(db);
  const concepts = repo.listConcepts();
  const counts = repo.counts();
  const generatedAt = toLocalIsoString();
  const base = `${dataFolder}/knowledge/exports`;
  const conceptsPath = `${base}/concepts.json`;
  const summaryPath = `${base}/knowledge_summary.json`;
  const masteryPath = `${base}/mastery_summary.md`;

  await fileStore.writeJson(
    conceptsPath,
    concepts.map((concept) => ({
      id: concept.id,
      name: concept.name,
      aliases: concept.aliases ?? [],
      abstractionLevel: concept.abstractionLevel,
      coverage: concept.coverage ?? 0,
      mastery: concept.mastery ?? 0,
      confidence: concept.confidence ?? 0,
      status: concept.status ?? "seen",
      summary: concept.summary ?? "",
      strongPoints: concept.strongPoints ?? [],
      weakPoints: concept.weakPoints ?? [],
      unknownPoints: concept.unknownPoints ?? [],
      updatedAt: concept.updatedAt,
    }))
  );

  await fileStore.writeJson(summaryPath, {
    schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
    generatedAt,
    counts,
  });

  await fileStore.writeText(masteryPath, renderMasterySummary(generatedAt, counts, concepts));

  return {
    generatedAt,
    counts,
    paths: {
      concepts: conceptsPath,
      knowledgeSummary: summaryPath,
      masterySummary: masteryPath,
    },
  };
}

function renderMasterySummary(generatedAt: string, counts: KnowledgeCounts, concepts: ReturnType<KnowledgeRepository["listConcepts"]>): string {
  const lines = [
    "# KnowledgeData Summary",
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Counts",
    `- Concepts: ${counts.concepts}`,
    `- Items: ${counts.items}`,
    `- Evidence: ${counts.evidence}`,
    `- Source refs: ${counts.sourceRefs}`,
    `- Missing items: ${counts.missingItems}`,
    "",
    "## Concepts",
  ];

  if (concepts.length === 0) {
    lines.push("", "No concepts indexed yet.");
  }

  for (const concept of concepts) {
    lines.push(
      "",
      `### ${concept.name}`,
      `- ID: ${concept.id}`,
      `- Coverage: ${concept.coverage ?? 0}`,
      `- Mastery: ${concept.mastery ?? 0}`,
      `- Confidence: ${concept.confidence ?? 0}`,
      `- Status: ${concept.status ?? "seen"}`,
      `- Summary: ${concept.summary ?? ""}`
    );
  }

  return `${lines.join("\n")}\n`;
}
