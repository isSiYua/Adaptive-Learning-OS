import { KNOWLEDGE_SCHEMA_VERSION } from "./KnowledgeTypes";
import { toLocalIsoString } from "../utils/dates";
import type { KnowledgeDb } from "./KnowledgeDb";

export function bootstrapKnowledgeSchema(db: KnowledgeDb): void {
  const now = toLocalIsoString();

  db.exec(`
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases_json TEXT,
  abstraction_level INTEGER,
  coverage REAL DEFAULT 0,
  mastery REAL DEFAULT 0,
  confidence REAL DEFAULT 0,
  status TEXT,
  summary TEXT,
  strong_points_json TEXT,
  weak_points_json TEXT,
  unknown_points_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_touched_at TEXT
);

CREATE TABLE IF NOT EXISTS concept_edges (
  parent_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  weight REAL DEFAULT 1,
  created_at TEXT NOT NULL,
  PRIMARY KEY (parent_id, child_id, relation_type)
);

CREATE TABLE IF NOT EXISTS items (
  item_id TEXT PRIMARY KEY,
  container_id TEXT,
  container_type TEXT,
  note_path TEXT,
  title TEXT,
  content_hash TEXT,
  content_summary TEXT,
  concept_ids_json TEXT,
  status TEXT,
  created_at TEXT,
  updated_at TEXT,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  concept_id TEXT,
  source_type TEXT,
  signal_type TEXT,
  strength REAL,
  confidence REAL,
  summary TEXT,
  note_path TEXT,
  item_id TEXT,
  job_id TEXT,
  review_id TEXT,
  source_ref_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_refs (
  id TEXT PRIMARY KEY,
  concept_id TEXT,
  source_type TEXT,
  path TEXT,
  source_hash TEXT,
  title TEXT,
  status TEXT,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  concept_id TEXT,
  item_id TEXT,
  scheduled_at TEXT,
  completed_at TEXT,
  result TEXT,
  quality_score REAL,
  next_review_at TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_evidence_concept_id ON evidence(concept_id);
CREATE INDEX IF NOT EXISTS idx_evidence_item_id ON evidence(item_id);
CREATE INDEX IF NOT EXISTS idx_evidence_created_at ON evidence(created_at);
CREATE INDEX IF NOT EXISTS idx_items_note_path ON items(note_path);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_source_refs_path ON source_refs(path);
CREATE INDEX IF NOT EXISTS idx_concept_edges_parent ON concept_edges(parent_id);
CREATE INDEX IF NOT EXISTS idx_concept_edges_child ON concept_edges(child_id);
`);

  db.run("INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)", ["created_at", now]);
  db.setMeta("schema_version", String(KNOWLEDGE_SCHEMA_VERSION));
  db.setMeta("updated_at", now);
}
