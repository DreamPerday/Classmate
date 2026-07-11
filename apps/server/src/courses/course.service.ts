import type { Course, CourseSession } from "@classmate/shared";
import { id } from "../shared/ids.js";
import { NotFoundError } from "../shared/errors.js";
import { eventBus } from "../shared/event-bus.js";
import { CourseRepository } from "./course.repository.js";

export class CourseService {
  constructor(private readonly repository: CourseRepository) {}
  list(): Course[] { return this.repository.list(); }
  create(input: { name: string; code?: string | undefined; instructor?: string | undefined; description?: string | undefined }): Course {
    const now = new Date().toISOString(); return this.repository.insert({ id: id("course"), name: input.name, code: input.code ?? null, instructor: input.instructor ?? null, description: input.description ?? null, createdAt: now, updatedAt: now });
  }
  listSessions(courseId?: string): CourseSession[] { return this.repository.listSessions(courseId); }
  createSession(input: { courseId: string; title: string; dayIndex: number }): CourseSession {
    if (!this.repository.find(input.courseId)) throw new NotFoundError("Course", input.courseId);
    const value = this.repository.insertSession({ id: id("session"), courseId: input.courseId, title: input.title, dayIndex: input.dayIndex, status: "planned", startedAt: null, endedAt: null, currentTopic: null, createdAt: new Date().toISOString() });
    eventBus.publish({ type: "session", payload: value }); return value;
  }
  setStatus(sessionId: string, status: CourseSession["status"]): CourseSession {
    if (!this.repository.findSession(sessionId)) throw new NotFoundError("Session", sessionId);
    this.repository.updateSessionStatus(sessionId, status); const value = this.repository.findSession(sessionId)!;
    eventBus.publish({ type: "session", payload: value }); return value;
  }
}
