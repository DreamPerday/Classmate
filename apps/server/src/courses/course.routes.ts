import type { FastifyInstance } from "fastify";
import { CreateCourseSchema, CreateSessionSchema } from "@classmate/shared";
import { CourseService } from "./course.service.js";

export async function courseRoutes(app: FastifyInstance, service: CourseService): Promise<void> {
  app.get("/api/courses", async (request) => ({ data: service.list(), requestId: request.id }));
  app.post("/api/courses", async (request, reply) => { const value = service.create(CreateCourseSchema.parse(request.body)); return reply.code(201).send({ data: value, requestId: request.id }); });
  app.get("/api/sessions", async (request) => ({ data: service.listSessions((request.query as { courseId?: string }).courseId), requestId: request.id }));
  app.post("/api/sessions", async (request, reply) => { const value = service.createSession(CreateSessionSchema.parse(request.body)); return reply.code(201).send({ data: value, requestId: request.id }); });
  app.post("/api/sessions/:id/status", async (request) => { const body = request.body as { status: "planned" | "recording" | "processing" | "completed" | "failed" }; return { data: service.setStatus((request.params as { id: string }).id, body.status), requestId: request.id }; });
}

