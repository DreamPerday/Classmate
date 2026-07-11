import { db, transaction } from "../shared/database.js";
import { id } from "../shared/ids.js";

export type Job = { id: string; type: string; payload: Record<string, unknown>; status: string; attempts: number; maxAttempts: number };
export class JobRepository {
  recoverInterrupted():void{const now=new Date().toISOString();db.prepare("UPDATE jobs SET status='retry',run_after=?,locked_at=NULL,updated_at=? WHERE status='running'").run(now,now);}
  enqueue(type: string, payload: Record<string, unknown>, idempotencyKey: string): void {
    const now = new Date().toISOString();
    db.prepare(`INSERT OR IGNORE INTO jobs(id,type,payload_json,status,attempts,max_attempts,run_after,created_at,updated_at,idempotency_key) VALUES (?,?,?,'pending',0,3,?,?,?,?)`)
      .run(id("job"), type, JSON.stringify(payload), now, now, now, idempotencyKey);
  }
  claim(): Job | null {
    return transaction(() => {
      const row = db.prepare(`SELECT * FROM jobs WHERE status IN ('pending','retry') AND run_after <= ? ORDER BY CASE type WHEN 'transcribe_audio' THEN 0 WHEN 'semantic_batch' THEN 1 WHEN 'summarize_session' THEN 2 ELSE 3 END, created_at LIMIT 1`).get(new Date().toISOString()) as any;
      if (!row) return null;
      db.prepare("UPDATE jobs SET status='running', locked_at=?, attempts=attempts+1, updated_at=? WHERE id=?").run(new Date().toISOString(), new Date().toISOString(), row.id);
      return { id: row.id, type: row.type, payload: JSON.parse(row.payload_json), status: "running", attempts: row.attempts + 1, maxAttempts: row.max_attempts };
    });
  }
  complete(jobId: string): void { db.prepare("UPDATE jobs SET status='completed', updated_at=? WHERE id=?").run(new Date().toISOString(), jobId); }
  fail(job: Job, error: unknown): void {
    const retry = job.attempts < job.maxAttempts; const runAfter = new Date(Date.now() + 2 ** job.attempts * 1000).toISOString();
    db.prepare("UPDATE jobs SET status=?, run_after=?, last_error=?, updated_at=? WHERE id=?").run(retry ? "retry" : "dead", runAfter, error instanceof Error ? error.message : String(error), new Date().toISOString(), job.id);
  }
  counts(): Record<string, number> { return Object.fromEntries((db.prepare("SELECT status, count(*) count FROM jobs GROUP BY status").all() as any[]).map((r) => [r.status, r.count])); }
}
