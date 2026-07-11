import type { TranscriptSegment } from "@classmate/shared";
import { CourseRepository } from "../courses/course.repository.js";
import { NotFoundError, ValidationError } from "../shared/errors.js";
import { eventBus } from "../shared/event-bus.js";
import { fingerprint, id } from "../shared/ids.js";
import { JobRepository } from "../jobs/job.repository.js";
import { TranscriptRepository } from "./transcript.repository.js";

export class TranscriptService {
  constructor(private readonly repository: TranscriptRepository, private readonly courses: CourseRepository, private readonly jobs: JobRepository) {}
  ingest(input: { sessionId: string; startMs: number; endMs: number; text: string; confidence?: number | undefined; audioPath?: string | undefined; latencyMs?:number|undefined }): TranscriptSegment {
    if (!this.courses.findSession(input.sessionId)) throw new NotFoundError("Session", input.sessionId);
    if (input.endMs <= input.startMs) throw new ValidationError("endMs 必须大于 startMs");
    const value = this.repository.insert({ id:id("seg"),sessionId:input.sessionId,sequence:this.repository.nextSequence(input.sessionId),startMs:input.startMs,endMs:input.endMs,text:input.text.trim(),confidence:input.confidence??null,language:"zh",audioPath:input.audioPath??null,latencyMs:input.latencyMs??null,isFinal:true,createdAt:new Date().toISOString() });
    this.jobs.enqueue("semantic_batch", { sessionId: input.sessionId }, fingerprint("semantic", input.sessionId, String(Math.floor(value.sequence / 3))));
    this.jobs.enqueue("embed_segment", { segmentId: value.id }, fingerprint("embed", value.id));
    eventBus.publish({type:"transcript",payload:value}); return value;
  }
  listRecent(sessionId: string, limit?: number): TranscriptSegment[] { return this.repository.listRecent(sessionId,limit); }
}
