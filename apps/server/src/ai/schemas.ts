import { z } from "zod";
import { EventTypeSchema } from "@classmate/shared";

export const ExtractedEvidenceSchema = z.object({ segmentId: z.string(), quote: z.string().min(1) });
export const ExtractedEventSchema = z.object({
  type: EventTypeSchema, title: z.string().min(1), content: z.string().min(1),
  importance: z.number().int().min(1).max(10), confidence: z.number().min(0).max(1),
  deadlineRaw: z.string().nullable().default(null), evidence: z.array(ExtractedEvidenceSchema).min(1)
});
export const ExtractedConceptSchema = z.object({
  name: z.string().min(1), kind: z.enum(["concept", "topic", "task", "person", "resource"]),
  definition: z.string().nullable().default(null), importance: z.number().int().min(1).max(10),
  confidence: z.number().min(0).max(1), evidenceSegmentIds: z.array(z.string()).min(1)
});
export const ExtractedRelationSchema = z.object({
  source: z.string().min(1), target: z.string().min(1),
  relation: z.enum(["PART_OF", "PREREQUISITE", "RELATED_TO", "EXPLAINS", "CONTRASTS_WITH", "APPLIES_TO", "ASSIGNED_IN"]),
  weight: z.number().min(0).max(1), evidenceSegmentId: z.string()
});
export const SemanticBatchSchema = z.object({
  topic: z.string().nullable(), events: z.array(ExtractedEventSchema), concepts: z.array(ExtractedConceptSchema), relations: z.array(ExtractedRelationSchema)
});
export type SemanticBatch = z.infer<typeof SemanticBatchSchema>;

