import type { FastifyInstance } from "fastify";
import { AiSettingsInputSchema } from "./settings.repository.js";
import { AiSettingsService } from "./settings.service.js";
export async function aiSettingsRoutes(app:FastifyInstance,service:AiSettingsService):Promise<void>{
  app.get("/api/ai/settings",async request=>({data:service.get(),requestId:request.id}));
  app.patch("/api/ai/settings",async request=>({data:service.save(AiSettingsInputSchema.parse(request.body)),requestId:request.id}));
  app.get("/api/ai/models",async request=>({data:await service.listModels((request.query as{provider?:"openai"|"ollama"|"mock"}).provider),requestId:request.id}));
  app.post("/api/ai/test",async request=>({data:await service.test(),requestId:request.id}));
  app.post("/api/ai/reindex",async request=>({data:service.reindex(),requestId:request.id}));
}
