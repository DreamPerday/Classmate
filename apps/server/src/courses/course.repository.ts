import type { Course, CourseSession } from "@classmate/shared";
import { db } from "../shared/database.js";

const course = (r: any): Course => ({ id: r.id, name: r.name, code: r.code, instructor: r.instructor, description: r.description, createdAt: r.created_at, updatedAt: r.updated_at });
const session = (r: any): CourseSession => ({ id: r.id, courseId: r.course_id, title: r.title, dayIndex: r.day_index, status: r.status, startedAt: r.started_at, endedAt: r.ended_at, currentTopic: r.current_topic, createdAt: r.created_at });
export class CourseRepository {
  list(): Course[] { return (db.prepare("SELECT * FROM courses ORDER BY updated_at DESC").all() as any[]).map(course); }
  find(id: string): Course | null { const row = db.prepare("SELECT * FROM courses WHERE id=?").get(id); return row ? course(row) : null; }
  insert(value: Course): Course { db.prepare("INSERT INTO courses(id,name,code,instructor,description,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(value.id, value.name, value.code, value.instructor, value.description, value.createdAt, value.updatedAt); return value; }
  listSessions(courseId?: string): CourseSession[] { const rows = courseId ? db.prepare("SELECT * FROM sessions WHERE course_id=? ORDER BY day_index DESC").all(courseId) : db.prepare("SELECT * FROM sessions ORDER BY created_at DESC").all(); return (rows as any[]).map(session); }
  findSession(id: string): CourseSession | null { const row = db.prepare("SELECT * FROM sessions WHERE id=?").get(id); return row ? session(row) : null; }
  insertSession(value: CourseSession): CourseSession { db.prepare("INSERT INTO sessions(id,course_id,title,day_index,status,started_at,ended_at,current_topic,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(value.id, value.courseId, value.title, value.dayIndex, value.status, value.startedAt, value.endedAt, value.currentTopic, value.createdAt); return value; }
  updateSessionStatus(id: string, status: CourseSession["status"]): void {
    const now = new Date().toISOString();
    db.prepare(`UPDATE sessions SET status=?, started_at=CASE WHEN ?='recording' AND started_at IS NULL THEN ? ELSE started_at END, ended_at=CASE WHEN ?='completed' THEN ? ELSE ended_at END WHERE id=?`).run(status, status, now, status, now, id);
  }
}

