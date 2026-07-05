import { conceptIdFromName } from "./ConceptNormalize";
import { KNOWLEDGE_SCHEMA_VERSION, type KnowledgeConcept, type KnowledgeCounts, type KnowledgeEvidence, type KnowledgeItem, type KnowledgeItemStatusCounts, type KnowledgeSourceRef } from "./KnowledgeTypes";
import { stableHash } from "../utils/hash";
import { toLocalIsoString } from "../utils/dates";
import type { KnowledgeDb } from "./KnowledgeDb";

export class KnowledgeRepository {
  private db: KnowledgeDb;

  constructor(db: KnowledgeDb) {
    this.db = db;
  }

  upsertConcept(concept: Omit<KnowledgeConcept, "id" | "createdAt" | "updatedAt"> & { id?: string }): { id: string; created: boolean } {
    const now = toLocalIsoString();
    const id = concept.id ?? conceptIdFromName(concept.name);
    const existing = this.db.get<{ id: string }>("SELECT id FROM concepts WHERE id = ?", [id]);
    this.db.run(
      `INSERT INTO concepts (
        id, name, aliases_json, abstraction_level, coverage, mastery, confidence, status, summary,
        strong_points_json, weak_points_json, unknown_points_json, created_at, updated_at, last_touched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        aliases_json = COALESCE(excluded.aliases_json, concepts.aliases_json),
        abstraction_level = COALESCE(excluded.abstraction_level, concepts.abstraction_level),
        coverage = MAX(COALESCE(concepts.coverage, 0), COALESCE(excluded.coverage, 0)),
        mastery = MAX(COALESCE(concepts.mastery, 0), COALESCE(excluded.mastery, 0)),
        confidence = MAX(COALESCE(concepts.confidence, 0), COALESCE(excluded.confidence, 0)),
        status = COALESCE(excluded.status, concepts.status),
        summary = COALESCE(excluded.summary, concepts.summary),
        strong_points_json = COALESCE(excluded.strong_points_json, concepts.strong_points_json),
        weak_points_json = COALESCE(excluded.weak_points_json, concepts.weak_points_json),
        unknown_points_json = COALESCE(excluded.unknown_points_json, concepts.unknown_points_json),
        updated_at = excluded.updated_at,
        last_touched_at = excluded.last_touched_at`,
      [
        id,
        concept.name,
        jsonOrNull(concept.aliases),
        concept.abstractionLevel ?? null,
        concept.coverage ?? 0,
        concept.mastery ?? 0,
        concept.confidence ?? 0,
        concept.status ?? "seen",
        concept.summary ?? "Indexed from Learning OS item. No strong mastery evidence yet.",
        jsonOrNull(concept.strongPoints ?? []),
        jsonOrNull(concept.weakPoints ?? []),
        jsonOrNull(concept.unknownPoints ?? []),
        now,
        now,
        now,
      ]
    );
    return { id, created: !existing };
  }

  getItem(itemId: string): KnowledgeItem | null {
    const row = this.db.get<Record<string, string | null>>("SELECT * FROM items WHERE item_id = ?", [itemId]);
    return row ? itemFromRow(row) : null;
  }

  upsertItem(item: KnowledgeItem): { created: boolean; contentChanged: boolean; previousHash?: string } {
    const now = toLocalIsoString();
    const existing = this.getItem(item.itemId);
    this.db.run(
      `INSERT INTO items (
        item_id, container_id, container_type, note_path, title, content_hash, content_summary,
        concept_ids_json, status, created_at, updated_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(item_id) DO UPDATE SET
        container_id = excluded.container_id,
        container_type = excluded.container_type,
        note_path = excluded.note_path,
        title = excluded.title,
        content_hash = excluded.content_hash,
        content_summary = excluded.content_summary,
        concept_ids_json = excluded.concept_ids_json,
        status = excluded.status,
        updated_at = excluded.updated_at,
        last_seen_at = excluded.last_seen_at`,
      [
        item.itemId,
        item.containerId ?? null,
        item.containerType ?? "unknown",
        item.notePath ?? null,
        item.title ?? null,
        item.contentHash ?? null,
        item.contentSummary ?? null,
        JSON.stringify(item.conceptIds ?? []),
        item.status ?? "active",
        item.createdAt ?? existing?.createdAt ?? now,
        item.updatedAt ?? now,
        item.lastSeenAt ?? now,
      ]
    );
    return {
      created: !existing,
      contentChanged: Boolean(existing?.contentHash && item.contentHash && existing.contentHash !== item.contentHash),
      previousHash: existing?.contentHash,
    };
  }

  markMissingItems(activeItemIds: Set<string>): string[] {
    const now = toLocalIsoString();
    const active = this.listActiveItems();
    const missing = active.filter((item) => !activeItemIds.has(item.itemId));
    for (const item of missing) {
      this.db.run("UPDATE items SET status = ?, updated_at = ? WHERE item_id = ?", ["missing", now, item.itemId]);
    }
    return missing.map((item) => item.itemId);
  }

  markMissingItemsForNote(notePath: string, activeItemIds: Set<string>): KnowledgeItem[] {
    const now = toLocalIsoString();
    const active = this.db
      .query<Record<string, string | null>>("SELECT * FROM items WHERE status = 'active' AND note_path = ? ORDER BY item_id", [notePath])
      .map(itemFromRow);
    const missing = active.filter((item) => !activeItemIds.has(item.itemId));
    for (const item of missing) {
      this.db.run("UPDATE items SET status = ?, updated_at = ? WHERE item_id = ?", ["missing", now, item.itemId]);
    }
    return missing;
  }

  listActiveItems(): KnowledgeItem[] {
    return this.db
      .query<Record<string, string | null>>("SELECT * FROM items WHERE status = 'active' ORDER BY item_id")
      .map(itemFromRow);
  }

  listConcepts(): KnowledgeConcept[] {
    return this.db
      .query<Record<string, string | number | null>>("SELECT * FROM concepts ORDER BY lower(name)")
      .map(conceptFromRow);
  }

  insertEvidence(evidence: Omit<KnowledgeEvidence, "id" | "createdAt"> & { id?: string; createdAt?: string }): boolean {
    const id = evidence.id ?? evidenceId(evidence);
    this.db.run(
      `INSERT OR IGNORE INTO evidence (
        id, concept_id, source_type, signal_type, strength, confidence, summary,
        note_path, item_id, job_id, review_id, source_ref_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        evidence.conceptId ?? null,
        evidence.sourceType,
        evidence.signalType,
        evidence.strength ?? null,
        evidence.confidence ?? null,
        evidence.summary,
        evidence.notePath ?? null,
        evidence.itemId ?? null,
        evidence.jobId ?? null,
        evidence.reviewId ?? null,
        evidence.sourceRefId ?? null,
        evidence.createdAt ?? toLocalIsoString(),
      ]
    );
    return this.db.get<{ id: string }>("SELECT id FROM evidence WHERE id = ?", [id]) !== null;
  }

  upsertSourceRef(ref: KnowledgeSourceRef): string {
    const id = ref.id;
    this.db.run(
      `INSERT INTO source_refs (id, concept_id, source_type, path, source_hash, title, status, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        concept_id = excluded.concept_id,
        source_type = excluded.source_type,
        path = excluded.path,
        source_hash = excluded.source_hash,
        title = excluded.title,
        status = excluded.status,
        last_seen_at = excluded.last_seen_at`,
      [
        id,
        ref.conceptId ?? null,
        ref.sourceType,
        ref.path ?? null,
        ref.sourceHash ?? null,
        ref.title ?? null,
        ref.status ?? "active",
        ref.lastSeenAt ?? toLocalIsoString(),
      ]
    );
    return id;
  }

  counts(): KnowledgeCounts {
    const itemCounts = this.itemStatusCounts();
    return {
      concepts: count(this.db, "concepts"),
      items: itemCounts.total,
      evidence: count(this.db, "evidence"),
      sourceRefs: count(this.db, "source_refs"),
      missingItems: itemCounts.missingDeleted,
    };
  }

  itemStatusCounts(): KnowledgeItemStatusCounts {
    return {
      total: count(this.db, "items"),
      active: count(this.db, "items", "status = 'active'"),
      missingDeleted: count(this.db, "items", "status IN ('missing', 'deleted', 'orphan')"),
    };
  }

  latestEvidence(limit = 1): KnowledgeEvidence[] {
    return this.db
      .query<Record<string, string | number | null>>(
        `SELECT * FROM evidence
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
        [limit]
      )
      .map(evidenceFromRow);
  }
}

export function evidenceId(evidence: Omit<KnowledgeEvidence, "id" | "createdAt">): string {
  return `ev-${stableHash(
    [
      evidence.sourceType,
      evidence.signalType,
      evidence.conceptId ?? "",
      evidence.itemId ?? "",
      evidence.jobId ?? "",
      evidence.sourceRefId ?? "",
      evidence.summary,
    ].join("|")
  )}`;
}

export function sourceRefId(parts: Array<string | undefined>): string {
  return `src-${stableHash(parts.filter(Boolean).join("|"))}`;
}

function count(db: KnowledgeDb, table: string, where?: string): number {
  const row = db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ""}`);
  return Number(row?.count ?? 0);
}

function jsonOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function itemFromRow(row: Record<string, string | null>): KnowledgeItem {
  return {
    itemId: String(row.item_id),
    containerId: row.container_id ?? undefined,
    containerType: (row.container_type as KnowledgeItem["containerType"]) ?? "unknown",
    notePath: row.note_path ?? undefined,
    title: row.title ?? undefined,
    contentHash: row.content_hash ?? undefined,
    contentSummary: row.content_summary ?? undefined,
    conceptIds: parseJsonArray(row.concept_ids_json),
    status: (row.status as KnowledgeItem["status"]) ?? "active",
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    lastSeenAt: row.last_seen_at ?? undefined,
  };
}

function conceptFromRow(row: Record<string, string | number | null>): KnowledgeConcept {
  return {
    id: String(row.id),
    name: String(row.name),
    aliases: parseJsonArray(row.aliases_json),
    abstractionLevel: numberOrUndefined(row.abstraction_level),
    coverage: numberOrUndefined(row.coverage),
    mastery: numberOrUndefined(row.mastery),
    confidence: numberOrUndefined(row.confidence),
    status: (row.status as KnowledgeConcept["status"]) ?? "seen",
    summary: typeof row.summary === "string" ? row.summary : undefined,
    strongPoints: parseJsonArray(row.strong_points_json),
    weakPoints: parseJsonArray(row.weak_points_json),
    unknownPoints: parseJsonArray(row.unknown_points_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastTouchedAt: typeof row.last_touched_at === "string" ? row.last_touched_at : undefined,
  };
}

function evidenceFromRow(row: Record<string, string | number | null>): KnowledgeEvidence {
  return {
    id: String(row.id),
    conceptId: typeof row.concept_id === "string" && row.concept_id ? row.concept_id : undefined,
    sourceType: row.source_type as KnowledgeEvidence["sourceType"],
    signalType: row.signal_type as KnowledgeEvidence["signalType"],
    strength: numberOrUndefined(row.strength),
    confidence: numberOrUndefined(row.confidence),
    summary: String(row.summary ?? ""),
    notePath: typeof row.note_path === "string" && row.note_path ? row.note_path : undefined,
    itemId: typeof row.item_id === "string" && row.item_id ? row.item_id : undefined,
    jobId: typeof row.job_id === "string" && row.job_id ? row.job_id : undefined,
    reviewId: typeof row.review_id === "string" && row.review_id ? row.review_id : undefined,
    sourceRefId: typeof row.source_ref_id === "string" && row.source_ref_id ? row.source_ref_id : undefined,
    createdAt: String(row.created_at),
  };
}

function numberOrUndefined(value: string | number | null): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
