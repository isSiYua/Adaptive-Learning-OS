export const KNOWLEDGE_SCHEMA_VERSION = 1;

export type KnowledgeSourceType =
  | "ask"
  | "apply"
  | "manual_note"
  | "manual_edit"
  | "delete"
  | "review"
  | "self_explanation"
  | "ai_check"
  | "tutorial_generation"
  | "import"
  | "rebuild";

export type KnowledgeSignalType =
  | "coverage"
  | "confusion"
  | "correction"
  | "mastery"
  | "forgetting"
  | "misconception_candidate"
  | "stability";

export type KnowledgeConceptStatus = "unknown" | "seen" | "learning" | "familiar" | "solid" | "stale" | "archived";
export type KnowledgeItemContainerType = "clarification" | "generated-content" | "manual-note" | "unknown";
export type KnowledgeItemStatus = "active" | "missing" | "deleted" | "archived" | "orphan";
export type KnowledgeSourceRefType =
  | "note"
  | "tutorial"
  | "raw"
  | "transform"
  | "extract"
  | "ask-job"
  | "clarification"
  | "generated-content"
  | "external";

export interface KnowledgeConcept {
  id: string;
  name: string;
  aliases?: string[];
  abstractionLevel?: number;
  coverage?: number;
  mastery?: number;
  confidence?: number;
  status?: KnowledgeConceptStatus;
  summary?: string;
  strongPoints?: string[];
  weakPoints?: string[];
  unknownPoints?: string[];
  createdAt: string;
  updatedAt: string;
  lastTouchedAt?: string;
}

export interface KnowledgeItem {
  itemId: string;
  containerId?: string;
  containerType?: KnowledgeItemContainerType;
  notePath?: string;
  title?: string;
  contentHash?: string;
  contentSummary?: string;
  conceptIds?: string[];
  status?: KnowledgeItemStatus;
  createdAt?: string;
  updatedAt?: string;
  lastSeenAt?: string;
}

export interface KnowledgeEvidence {
  id: string;
  conceptId?: string;
  sourceType: KnowledgeSourceType;
  signalType: KnowledgeSignalType;
  strength?: number;
  confidence?: number;
  summary: string;
  notePath?: string;
  itemId?: string;
  jobId?: string;
  reviewId?: string;
  sourceRefId?: string;
  createdAt: string;
}

export interface KnowledgeSourceRef {
  id: string;
  conceptId?: string;
  sourceType: KnowledgeSourceRefType;
  path?: string;
  sourceHash?: string;
  title?: string;
  status?: "active" | "missing" | "deleted" | "archived" | "external";
  lastSeenAt?: string;
}

export interface KnowledgeCounts {
  concepts: number;
  items: number;
  evidence: number;
  sourceRefs: number;
  missingItems: number;
}

export interface KnowledgeItemStatusCounts {
  total: number;
  active: number;
  missingDeleted: number;
}

export interface KnowledgeRebuildSummary extends KnowledgeCounts {
  scannedNotes: number;
  indexedItems: number;
  createdConcepts: number;
  updatedItems: number;
  manualEdits: number;
  missingItemsMarked: number;
  askEvidence: number;
}
