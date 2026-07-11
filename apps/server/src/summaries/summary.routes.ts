import type { FastifyInstance } from "fastify";
import { SummaryService } from "./summary.service.js";
import { SummaryRepository } from "./summary.repository.js";
export async function summaryRoutes(app: FastifyInstance, service: SummaryService, repo: SummaryRepository): Promise<void> {
  app.get("/api/sessions/:id/summary", async (request) => {
    const sessionId = (request.params as { id: string }).id;
    return { data: repo.getSession(sessionId), requestId: request.id };
  });
  app.get("/api/courses/:id/summaries", async (request) => {
    const courseId = (request.params as { id: string }).id;
    return { data: repo.listByCourse(courseId), requestId: request.id };
  });
  app.post("/api/sessions/:id/summary/regenerate", async (request) => {
    const sessionId = (request.params as { id: string }).id;
    await service.updateSession(sessionId, true);
    return { data: { queued: true }, requestId: request.id };
  });
}
