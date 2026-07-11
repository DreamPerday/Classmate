import type { FastifyInstance } from "fastify";
import { IngestTranscriptSchema } from "@classmate/shared";
import { TranscriptService } from "./transcript.service.js";
export async function transcriptRoutes(app: FastifyInstance, service: TranscriptService): Promise<void> {
  app.post("/api/transcripts", async(request,reply)=>reply.code(201).send({data:service.ingest(IngestTranscriptSchema.parse(request.body)),requestId:request.id}));
  app.get("/api/sessions/:id/transcripts", async(request)=>{
    const raw=(request.query as any).limit??"120";
    const limit = raw==="all" ? 0 : Number(raw);
    return {data:service.listRecent((request.params as {id:string}).id,Number.isFinite(limit)?limit:120),requestId:request.id};
  });
}

