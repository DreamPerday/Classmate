import { db } from "../shared/database.js";
import { transaction } from "../shared/database.js";
import { id } from "../shared/ids.js";
import { NotFoundError } from "../shared/errors.js";

export type CourseExportPayload = {
  format: "classmate-course";
  version: 1;
  exportedAt: string;
  course: { name: string; createdAt: string };
  sessions: Array<{
    title: string;
    dayIndex: number;
    createdAt: string;
    transcripts: Array<{ text: string; startMs: number; endMs: number; createdAt: string }>;
    events: Array<{ type: string; title: string; content: string; importance: number; transcriptIndex: number; createdAt: string }>;
    tasks: Array<{ title: string; detail: string; deadlineRaw: string | null; deadlineResolved: string | null; status: "open" | "done" | "dismissed"; importance: number; confidence: number; needsReview: boolean; transcriptIndex: number }>;
    summary: { contentMd: string; evidenceIds: string[]; createdAt: string } | null;
  }>;
  knowledgeNodes: Array<{ name: string; definition: string | null; importance: number }>;
  knowledgeEdges: Array<{ sourceName: string; targetName: string; relation: string }>;
};

export type ImportOptions = {
  mode: "new" | "merge";
  targetCourseId?: string;
  newCourseName?: string;
  sessionOrder?: number[];
};

function fingerprint(title: string, content: string): string {
  const text = `${title}|${content}`.slice(0, 200);
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return `fp_${Math.abs(hash).toString(36)}`;
}

export function exportCourse(courseId: string): CourseExportPayload {
  const course = db.prepare("SELECT id, name, created_at FROM courses WHERE id=?").get(courseId) as any;
  if (!course) throw new NotFoundError("Course", courseId);

  const sessions = db.prepare("SELECT id, title, day_index, created_at FROM sessions WHERE course_id=? ORDER BY day_index").all(courseId) as any[];
  const sessionBlocks = sessions.map((session) => {
    const transcripts = db.prepare("SELECT id, text, start_ms, end_ms, created_at FROM transcript_segments WHERE session_id=? ORDER BY sequence").all(session.id) as any[];
    const transcriptIndex = new Map<string, number>();
    transcripts.forEach((t, i) => transcriptIndex.set(t.id, i));

    const events = db.prepare("SELECT id, type, title, content, importance, created_at FROM semantic_events WHERE session_id=? ORDER BY created_at").all(session.id) as any[];
    const eventTranscriptMap = new Map<string, string>();
    const eventRows = db.prepare("SELECT id, evidence_json FROM semantic_events WHERE session_id=?").all(session.id) as any[];
    for (const er of eventRows) {
      try {
        const evidence = JSON.parse(er.evidence_json || "[]") as any[];
        const firstSeg = evidence.find((e: any) => e.segmentId)?.segmentId;
        if (firstSeg) eventTranscriptMap.set(er.id, firstSeg);
      } catch { /* ignore */ }
    }

    const tasks = db.prepare("SELECT title, detail, deadline_raw, deadline_resolved, status, importance, confidence, needs_review, evidence_event_id FROM tasks WHERE session_id=? ORDER BY status, title").all(session.id) as any[];
    const taskEventTranscript = new Map<string, string>();
    for (const t of tasks) {
      const ev = eventTranscriptMap.get(t.evidence_event_id);
      if (ev) taskEventTranscript.set(t.title, ev);
    }

    const summary = db.prepare("SELECT content_md, evidence_event_ids_json, created_at FROM summaries WHERE session_id=? ORDER BY revision DESC LIMIT 1").get(session.id) as any;

    return {
      title: session.title,
      dayIndex: session.day_index,
      createdAt: session.created_at,
      transcripts: transcripts.map((t) => ({ text: t.text, startMs: t.start_ms, endMs: t.end_ms, createdAt: t.created_at })),
      events: events.map((e) => ({
        type: e.type, title: e.title, content: e.content, importance: e.importance,
        transcriptIndex: transcriptIndex.get(eventTranscriptMap.get(e.id) ?? "") ?? 0,
        createdAt: e.created_at,
      })),
      tasks: tasks.map((t) => ({
        title: t.title, detail: t.detail, deadlineRaw: t.deadline_raw, deadlineResolved: t.deadline_resolved,
        status: t.status as "open" | "done" | "dismissed", importance: t.importance, confidence: t.confidence,
        needsReview: Boolean(t.needs_review),
        transcriptIndex: transcriptIndex.get(taskEventTranscript.get(t.title) ?? "") ?? 0,
      })),
      summary: summary ? { contentMd: summary.content_md, evidenceIds: JSON.parse(summary.evidence_event_ids_json || "[]"), createdAt: summary.created_at } : null,
    };
  });

  const nodes = db.prepare("SELECT canonical_name, definition, importance FROM knowledge_nodes WHERE course_id=? ORDER BY importance DESC, canonical_name").all(courseId) as any[];
  const edges = db.prepare("SELECT a.canonical_name sourceName, b.canonical_name targetName, e.relation FROM knowledge_edges e JOIN knowledge_nodes a ON a.id=e.source_id JOIN knowledge_nodes b ON b.id=e.target_id WHERE e.course_id=?").all(courseId) as any[];

  return {
    format: "classmate-course", version: 1, exportedAt: new Date().toISOString(),
    course: { name: course.name, createdAt: course.created_at },
    sessions: sessionBlocks,
    knowledgeNodes: nodes.map((n) => ({ name: n.canonical_name, definition: n.definition, importance: n.importance })),
    knowledgeEdges: edges.map((e) => ({ sourceName: e.sourceName, targetName: e.targetName, relation: e.relation })),
  };
}

export function importCourse(payload: CourseExportPayload, options: ImportOptions): { courseId: string; sessionCount: number } {
  if (!payload || payload.format !== "classmate-course") throw new Error("无效的课程文件");
  const now = new Date().toISOString();
  const order = options.sessionOrder && options.sessionOrder.length ? options.sessionOrder : payload.sessions.map((_, i) => i);
  if (order.length !== payload.sessions.length) throw new Error("课次排序与导入课次数不匹配");
  for (const idx of order) { if (idx < 0 || idx >= payload.sessions.length) throw new Error("课次排序包含无效索引"); }

  let courseId: string;
  let dayIndexOffset = 0;
  const knowledgeNodeIds = new Map<string, string>();

  transaction(() => {
    if (options.mode === "merge") {
      if (!options.targetCourseId) throw new Error("合并导入需要指定目标课程");
      const target = db.prepare("SELECT id FROM courses WHERE id=?").get(options.targetCourseId) as any;
      if (!target) throw new NotFoundError("Course", options.targetCourseId);
      courseId = target.id;
      const existing = db.prepare("SELECT id, normalized_name FROM knowledge_nodes WHERE course_id=?").all(courseId) as any[];
      for (const node of existing) knowledgeNodeIds.set(node.normalized_name, node.id);
      const maxDay = db.prepare("SELECT MAX(day_index) as maxDay FROM sessions WHERE course_id=?").get(courseId) as any;
      dayIndexOffset = maxDay?.maxDay ?? 0;
    } else {
      courseId = id("course");
      const name = (options.newCourseName || payload.course.name).trim() || "导入课程";
      db.prepare("INSERT INTO courses(id, name, code, instructor, description, created_at, updated_at) VALUES (?, ?, NULL, NULL, NULL, ?, ?)").run(courseId, name, now, now);
    }

    for (let position = 0; position < order.length; position++) {
      const originalIdx = order[position]!;
      const session = payload.sessions[originalIdx]!;
      const sessionId = id("session");
      const dayIndex = dayIndexOffset + position + 1;
      const title = session.title || `第 ${dayIndex} 天`;
      db.prepare("INSERT INTO sessions(id, course_id, title, day_index, status, started_at, ended_at, current_topic, created_at) VALUES (?, ?, ?, ?, 'planned', NULL, NULL, NULL, ?)").run(sessionId, courseId, title, dayIndex, session.createdAt || now);

      const transcriptIdMap = new Map<number, string>();
      for (let i = 0; i < session.transcripts.length; i++) {
        const t = session.transcripts[i]!;
        const tid = id("seg");
        transcriptIdMap.set(i, tid);
        db.prepare("INSERT INTO transcript_segments(id, session_id, sequence, start_ms, end_ms, text, confidence, language, audio_path, is_final, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 'zh', NULL, 1, ?)").run(tid, sessionId, i, t.startMs, t.endMs, t.text, t.createdAt || now);
      }

      const eventIdMap = new Map<number, string>();
      for (const event of session.events) {
        const eventId = id("event");
        const segId = transcriptIdMap.get(event.transcriptIndex) ?? transcriptIdMap.get(0);
        const evidenceJson = segId ? JSON.stringify([{ segmentId: segId }]) : "[]";
        const fp = fingerprint(event.title, event.content);
        db.prepare("INSERT INTO semantic_events(id, session_id, type, title, content, importance, confidence, deadline_raw, deadline_resolved, needs_review, evidence_json, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?, ?)").run(eventId, sessionId, event.type, event.title, event.content, event.importance, 0.7, evidenceJson, fp, event.createdAt || now);
        if (segId) eventIdMap.set(event.transcriptIndex, eventId);
      }

      for (const task of session.tasks) {
        const segId = transcriptIdMap.get(task.transcriptIndex) ?? transcriptIdMap.get(0);
        let evidenceEventId = eventIdMap.get(task.transcriptIndex);
        if (!evidenceEventId) {
          const anyEvent = db.prepare("SELECT id FROM semantic_events WHERE session_id=? ORDER BY created_at LIMIT 1").get(sessionId) as any;
          if (anyEvent) evidenceEventId = anyEvent.id;
        }
        if (!evidenceEventId) continue;
        db.prepare("INSERT INTO tasks(id, course_id, session_id, title, detail, deadline_raw, deadline_resolved, status, importance, confidence, needs_review, evidence_event_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id("task"), courseId, sessionId, task.title, task.detail, task.deadlineRaw ?? null, task.deadlineResolved ?? null, task.status, task.importance, task.confidence, task.needsReview ? 1 : 0, evidenceEventId, now, now);
      }

      if (session.summary) {
        db.prepare("INSERT INTO summaries(id, course_id, session_id, level, period_key, content_md, evidence_event_ids_json, revision, created_at, updated_at) VALUES (?, ?, ?, 'session', ?, ?, ?, 1, ?, ?)").run(id("summary"), courseId, sessionId, sessionId, session.summary.contentMd, JSON.stringify(session.summary.evidenceIds), session.summary.createdAt || now, now);
      }
    }

    if (payload.knowledgeNodes) {
      for (const node of payload.knowledgeNodes) {
        const normalized = node.name.normalize("NFKC").toLocaleLowerCase();
        if (!knowledgeNodeIds.has(normalized)) {
          const nodeId = id("node");
          db.prepare("INSERT INTO knowledge_nodes(id, course_id, canonical_name, normalized_name, kind, definition, importance, confidence, evidence_count, created_at, updated_at) VALUES (?, ?, ?, ?, 'concept', ?, ?, 0.7, 1, ?, ?) ON CONFLICT(course_id, normalized_name) DO UPDATE SET definition=coalesce(excluded.definition, definition), importance=max(importance, excluded.importance)").run(nodeId, courseId, node.name, normalized, node.definition, node.importance, now, now);
          const saved = db.prepare("SELECT id FROM knowledge_nodes WHERE course_id=? AND normalized_name=?").get(courseId, normalized) as any;
          if (saved) knowledgeNodeIds.set(normalized, saved.id);
        } else {
          const existingId = knowledgeNodeIds.get(normalized)!;
          db.prepare("UPDATE knowledge_nodes SET definition=coalesce(definition, ?), importance=max(importance, ?), updated_at=? WHERE id=?").run(node.definition, node.importance, now, existingId);
        }
      }
    }

    if (payload.knowledgeEdges) {
      for (const edge of payload.knowledgeEdges) {
        const sourceId = knowledgeNodeIds.get(edge.sourceName.normalize("NFKC").toLocaleLowerCase());
        const targetId = knowledgeNodeIds.get(edge.targetName.normalize("NFKC").toLocaleLowerCase());
        if (!sourceId || !targetId) continue;
        db.prepare("INSERT OR IGNORE INTO knowledge_edges(id, course_id, source_id, target_id, relation, weight, evidence_event_id, created_at) VALUES (?, ?, ?, ?, ?, 1.0, NULL, ?)").run(id("edge"), courseId, sourceId, targetId, edge.relation, now);
      }
    }
  });

  return { courseId: courseId!, sessionCount: order.length };
}

export function deleteCourse(courseId: string): void {
  const course = db.prepare("SELECT id FROM courses WHERE id=?").get(courseId) as any;
  if (!course) throw new NotFoundError("Course", courseId);
  db.prepare("DELETE FROM courses WHERE id=?").run(courseId);
}

export function deleteSession(sessionId: string): void {
  const session = db.prepare("SELECT id FROM sessions WHERE id=?").get(sessionId) as any;
  if (!session) throw new NotFoundError("Session", sessionId);
  db.prepare("DELETE FROM sessions WHERE id=?").run(sessionId);
}

export function deleteReport(reportId: string): void {
  const report = db.prepare("SELECT id FROM reports WHERE id=?").get(reportId) as any;
  if (!report) throw new NotFoundError("Report", reportId);
  db.prepare("DELETE FROM reports WHERE id=?").run(reportId);
}
