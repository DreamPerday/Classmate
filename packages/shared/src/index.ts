import { z } from "zod";

export const EventTypeSchema = z.enum([
  "KEYPOINT", "DEFINITION", "EXAMPLE", "EMPHASIS", "TASK", "HOMEWORK",
  "EXAM", "DEADLINE", "TOPIC_CHANGE", "QUESTION", "CORRECTION"
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const EvidenceSchema = z.object({
  transcriptId: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  quote: z.string().min(1)
});

export const SemanticEventSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  type: EventTypeSchema,
  title: z.string().min(1),
  content: z.string().min(1),
  importance: z.number().int().min(1).max(10),
  confidence: z.number().min(0).max(1),
  deadlineRaw: z.string().nullable(),
  deadlineResolved: z.string().datetime().nullable(),
  needsReview: z.boolean(),
  evidence: z.array(EvidenceSchema).min(1),
  createdAt: z.string().datetime()
});
export type SemanticEvent = z.infer<typeof SemanticEventSchema>;

export const TranscriptSegmentSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  sequence: z.number().int().nonnegative(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable(),
  language: z.string().default("zh"),
  audioPath: z.string().nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  isFinal: z.boolean(),
  createdAt: z.string().datetime()
});
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

export const CourseSchema = z.object({
  id: z.string(), name: z.string().min(1), code: z.string().nullable(),
  instructor: z.string().nullable(), description: z.string().nullable(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime()
});
export type Course = z.infer<typeof CourseSchema>;

export const SessionSchema = z.object({
  id: z.string(), courseId: z.string(), title: z.string(), dayIndex: z.number().int().min(1).max(365),
  status: z.enum(["planned", "recording", "processing", "completed", "failed"]),
  startedAt: z.string().datetime().nullable(), endedAt: z.string().datetime().nullable(),
  currentTopic: z.string().nullable(), createdAt: z.string().datetime()
});
export type CourseSession = z.infer<typeof SessionSchema>;

export const KnowledgeNodeSchema = z.object({
  id: z.string(), courseId: z.string(), canonicalName: z.string(), kind: z.enum(["concept", "topic", "task", "person", "resource"]),
  definition: z.string().nullable(), importance: z.number().int().min(1).max(10),
  confidence: z.number().min(0).max(1), evidenceCount: z.number().int().nonnegative()
});
export type KnowledgeNode = z.infer<typeof KnowledgeNodeSchema>;

export const KnowledgeEdgeSchema = z.object({
  id: z.string(), courseId: z.string(), sourceId: z.string(), targetId: z.string(),
  relation: z.enum(["PART_OF", "PREREQUISITE", "RELATED_TO", "EXPLAINS", "CONTRASTS_WITH", "APPLIES_TO", "ASSIGNED_IN"]),
  weight: z.number().min(0).max(1), evidenceEventId: z.string().nullable()
});
export type KnowledgeEdge = z.infer<typeof KnowledgeEdgeSchema>;

export const TaskSchema = z.object({
  id: z.string(), courseId: z.string(), sessionId: z.string(), title: z.string(), detail: z.string(),
  deadlineRaw: z.string().nullable(), deadlineResolved: z.string().datetime().nullable(),
  status: z.enum(["open", "done", "dismissed"]), importance: z.number().int().min(1).max(10),
  confidence: z.number().min(0).max(1), needsReview: z.boolean(), evidenceEventId: z.string()
});
export type ClassroomTask = z.infer<typeof TaskSchema>;

export const SessionSummarySchema = z.object({
  id: z.string(), courseId: z.string(), sessionId: z.string(), level: z.string(),
  periodKey: z.string(), contentMd: z.string(), evidenceIds: z.array(z.string()), revision: z.number().int()
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const DashboardSchema = z.object({
  courses: z.array(CourseSchema), sessions: z.array(SessionSchema), activeSession: SessionSchema.nullable(),
  recentTranscript: z.array(TranscriptSegmentSchema), recentEvents: z.array(SemanticEventSchema),
  tasks: z.array(TaskSchema), graph: z.object({ nodes: z.array(KnowledgeNodeSchema), edges: z.array(KnowledgeEdgeSchema) }),
  activeSessionSummary: SessionSummarySchema.nullable(),
  stats: z.object({ transcriptMinutes: z.number(), concepts: z.number().int(), openTasks: z.number().int(), completedDays: z.number().int() })
});
export type Dashboard = z.infer<typeof DashboardSchema>;

export const AskRequestSchema = z.object({ courseId: z.string(), question: z.string().min(2).max(1000), sessionId: z.string().optional() });
export const CreateCourseSchema = z.object({ name: z.string().min(1).max(120), code: z.string().max(40).optional(), instructor: z.string().max(80).optional(), description: z.string().max(1000).optional() });
export const CreateSessionSchema = z.object({ courseId: z.string(), title: z.string().min(1).max(160), dayIndex: z.number().int().min(1).max(365) });
export const IngestTranscriptSchema = z.object({ sessionId: z.string(), startMs: z.number().int().nonnegative(), endMs: z.number().int().positive(), text: z.string().min(1), confidence: z.number().min(0).max(1).optional(), audioPath: z.string().optional() });
export const ReportRequestSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  startDay: z.number().int().min(1).max(365).optional(),
  endDay: z.number().int().min(1).max(365).optional()
}).refine((value) => value.startDay === undefined || value.endDay === undefined || value.startDay <= value.endDay, {
  message: "startDay 不能大于 endDay"
});
export type ReportRequest = z.infer<typeof ReportRequestSchema>;

export type ApiEnvelope<T> = { data: T; requestId: string };
export type ApiProblem = { title: string; status: number; detail: string; code: string; requestId: string };
