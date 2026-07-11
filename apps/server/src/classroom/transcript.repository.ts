import type { TranscriptSegment } from "@classmate/shared";
import { db } from "../shared/database.js";

export const transcript = (r: any): TranscriptSegment => ({ id: r.id, sessionId: r.session_id, sequence: r.sequence, startMs: r.start_ms, endMs: r.end_ms, text: r.text, confidence: r.confidence, language: r.language, audioPath: r.audio_path, latencyMs:r.latency_ms??null, isFinal: Boolean(r.is_final), createdAt: r.created_at });
export class TranscriptRepository {
  nextSequence(sessionId: string): number { return ((db.prepare("SELECT max(sequence) value FROM transcript_segments WHERE session_id=?").get(sessionId) as any)?.value ?? -1) + 1; }
  insert(value: TranscriptSegment): TranscriptSegment { db.prepare(`INSERT INTO transcript_segments(id,session_id,sequence,start_ms,end_ms,text,confidence,language,audio_path,latency_ms,is_final,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(value.id,value.sessionId,value.sequence,value.startMs,value.endMs,value.text,value.confidence,value.language,value.audioPath,value.latencyMs,value.isFinal?1:0,value.createdAt); return value; }
  find(id: string): TranscriptSegment | null { const row=db.prepare("SELECT * FROM transcript_segments WHERE id=?").get(id); return row?transcript(row):null; }
  listRecent(sessionId: string, limit=120): TranscriptSegment[] {
    const rows = limit > 0
      ? (db.prepare("SELECT * FROM transcript_segments WHERE session_id=? ORDER BY sequence DESC LIMIT ?").all(sessionId, limit) as any[])
      : (db.prepare("SELECT * FROM transcript_segments WHERE session_id=? ORDER BY sequence DESC").all(sessionId) as any[]);
    return rows.reverse().map(transcript);
  }
  listByIds(ids: string[]): TranscriptSegment[] { if (!ids.length) return []; const marks=ids.map(()=>"?").join(","); return (db.prepare(`SELECT * FROM transcript_segments WHERE id IN (${marks}) ORDER BY sequence`).all(...ids) as any[]).map(transcript); }
  unprocessedWindow(sessionId: string, maxSegments=12): TranscriptSegment[] {
    return (db.prepare(`SELECT t.* FROM transcript_segments t WHERE t.session_id=? AND NOT EXISTS (SELECT 1 FROM semantic_events e WHERE e.session_id=t.session_id AND e.evidence_json LIKE '%' || t.id || '%') ORDER BY t.sequence LIMIT ?`).all(sessionId,maxSegments) as any[]).map(transcript);
  }
}
