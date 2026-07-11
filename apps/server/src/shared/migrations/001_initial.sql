CREATE TABLE courses (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT, instructor TEXT, description TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL, day_index INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'planned',
  started_at TEXT, ended_at TEXT, current_topic TEXT, created_at TEXT NOT NULL,
  UNIQUE(course_id, day_index)
);
CREATE TABLE transcript_segments (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL, start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, text TEXT NOT NULL,
  confidence REAL, language TEXT NOT NULL DEFAULT 'zh', audio_path TEXT, is_final INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, UNIQUE(session_id, sequence)
);
CREATE TABLE transcript_fts (text TEXT NOT NULL, segment_id TEXT PRIMARY KEY, session_id TEXT NOT NULL);
CREATE TRIGGER transcript_ai AFTER INSERT ON transcript_segments BEGIN
  INSERT INTO transcript_fts(text, segment_id, session_id) VALUES (new.text, new.id, new.session_id);
END;
CREATE TRIGGER transcript_ad AFTER DELETE ON transcript_segments BEGIN
  DELETE FROM transcript_fts WHERE segment_id = old.id;
END;
CREATE TABLE semantic_events (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, importance INTEGER NOT NULL,
  confidence REAL NOT NULL, deadline_raw TEXT, deadline_resolved TEXT, needs_review INTEGER NOT NULL DEFAULT 0,
  evidence_json TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(session_id, fingerprint)
);
CREATE TABLE knowledge_nodes (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  canonical_name TEXT NOT NULL, normalized_name TEXT NOT NULL, kind TEXT NOT NULL, definition TEXT,
  importance INTEGER NOT NULL, confidence REAL NOT NULL, evidence_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(course_id, normalized_name)
);
CREATE TABLE knowledge_fts (canonical_name TEXT NOT NULL, definition TEXT NOT NULL, node_id TEXT PRIMARY KEY, course_id TEXT NOT NULL);
CREATE TABLE knowledge_edges (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  relation TEXT NOT NULL, weight REAL NOT NULL, evidence_event_id TEXT REFERENCES semantic_events(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL, UNIQUE(source_id, target_id, relation)
);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, title TEXT NOT NULL, detail TEXT NOT NULL,
  deadline_raw TEXT, deadline_resolved TEXT, status TEXT NOT NULL DEFAULT 'open', importance INTEGER NOT NULL,
  confidence REAL NOT NULL, needs_review INTEGER NOT NULL, evidence_event_id TEXT NOT NULL REFERENCES semantic_events(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE summaries (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE, level TEXT NOT NULL, period_key TEXT NOT NULL,
  content_md TEXT NOT NULL, evidence_event_ids_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(course_id, level, period_key)
);
CREATE TABLE embeddings (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, model TEXT NOT NULL, dimensions INTEGER NOT NULL,
  vector_json TEXT NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(entity_type, entity_id, model)
);
CREATE TABLE reports (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, title TEXT NOT NULL, content_md TEXT NOT NULL, source_summary_ids_json TEXT NOT NULL,
  docx_path TEXT, pdf_path TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3, run_after TEXT NOT NULL,
  locked_at TEXT, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_sessions_course ON sessions(course_id, day_index);
CREATE INDEX idx_transcript_session_time ON transcript_segments(session_id, start_ms);
CREATE INDEX idx_events_session_time ON semantic_events(session_id, created_at);
CREATE INDEX idx_tasks_course_status ON tasks(course_id, status);
CREATE INDEX idx_jobs_status_run_after ON jobs(status, run_after);
