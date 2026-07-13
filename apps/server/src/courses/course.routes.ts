import type { FastifyInstance } from "fastify";
import { CreateCourseSchema, CreateSessionSchema } from "@classmate/shared";
import { CourseService } from "./course.service.js";
import { exportCourse, importCourse, deleteCourse, deleteSession, type CourseExportPayload, type ImportOptions } from "./course-transfer.js";

export async function courseRoutes(app: FastifyInstance, service: CourseService): Promise<void> {
  app.get("/api/courses", async (request) => ({ data: service.list(), requestId: request.id }));
  app.post("/api/courses", async (request, reply) => { const value = service.create(CreateCourseSchema.parse(request.body)); return reply.code(201).send({ data: value, requestId: request.id }); });
  app.delete("/api/courses/:id", async (request) => { deleteCourse((request.params as { id: string }).id); return { data: { deleted: true }, requestId: request.id }; });
  app.get("/api/courses/:id/export", async (request) => { const payload = exportCourse((request.params as { id: string }).id); return { data: payload, requestId: request.id }; });
  app.post("/api/courses/import", async (request, reply) => {
    const body = request.body as { payload: CourseExportPayload; options: ImportOptions };
    const result = importCourse(body.payload, body.options);
    return reply.code(201).send({ data: result, requestId: request.id });
  });
  app.get("/api/sessions", async (request) => ({ data: service.listSessions((request.query as { courseId?: string }).courseId), requestId: request.id }));
  app.post("/api/sessions", async (request, reply) => { const value = service.createSession(CreateSessionSchema.parse(request.body)); return reply.code(201).send({ data: value, requestId: request.id }); });
  app.post("/api/sessions/:id/status", async (request) => { const body = request.body as { status: "planned" | "recording" | "processing" | "completed" | "failed" }; return { data: service.setStatus((request.params as { id: string }).id, body.status), requestId: request.id }; });
  app.delete("/api/sessions/:id", async (request) => { deleteSession((request.params as { id: string }).id); return { data: { deleted: true }, requestId: request.id }; });
}

