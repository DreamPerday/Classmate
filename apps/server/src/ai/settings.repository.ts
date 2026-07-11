import { z } from "zod";
import { config } from "../shared/config.js";
import { db, transaction } from "../shared/database.js";

export const ApiFormatSchema = z.enum(["openai-chat", "openai-responses", "claude"]);
export type ApiFormat = z.infer<typeof ApiFormatSchema>;

export const AiSettingsInputSchema = z.object({
  provider: z.enum(["openai", "ollama", "mock"]),
  chatModel: z.string().min(1).max(200),
  embeddingModel: z.string().min(1).max(200),
  baseUrl: z.string().min(1).max(500).optional(),
  apiFormat: ApiFormatSchema.optional()
});
export type AiSettingsInput = z.infer<typeof AiSettingsInputSchema>;
export type AiRuntimeSettings = AiSettingsInput & { baseUrl: string; hasKey: boolean };
export type UpstreamModel = { id: string; ownedBy: string | null; created: number | null; kind: "chat" | "embedding" | "unknown" };

export function normalizeOpenAiBaseUrl(value: string): string {
  const trimmed=value.replace(/\/+$/,"");
  return /\/v\d+$/i.test(trimmed)?trimmed:`${trimmed}/v1`;
}

export class AiSettingsRepository {
  get(): AiRuntimeSettings {
    const rows=db.prepare("SELECT key,value FROM app_settings WHERE key LIKE 'ai.%'").all() as Array<{key:string;value:string}>;
    const saved=Object.fromEntries(rows.map(row=>[row.key,row.value]));
    const provider=(saved["ai.provider"]??config.ai.provider) as AiSettingsInput["provider"];
    const apiFormat=(saved["ai.apiFormat"]??config.ai.openaiApiFormat??"openai-chat") as ApiFormat;
    const defaultBaseUrl=provider==="ollama"?config.ai.ollamaBaseUrl:normalizeOpenAiBaseUrl(config.ai.openaiBaseUrl);
    const baseUrl=saved["ai.baseUrl"]??defaultBaseUrl;
    return {
      provider,
      chatModel:saved["ai.chatModel"]??config.ai.openaiChatModel??config.ai.ollamaChatModel,
      embeddingModel:saved["ai.embeddingModel"]??(provider==="ollama"?config.ai.ollamaEmbedModel:config.ai.openaiEmbedModel),
      baseUrl,
      apiFormat,
      hasKey:provider!=="openai"||Boolean(config.ai.openaiApiKey)
    };
  }
  save(input:AiSettingsInput):AiRuntimeSettings {
    const now=new Date().toISOString();
    const entries:Record<string,string>={"ai.provider":input.provider,"ai.chatModel":input.chatModel,"ai.embeddingModel":input.embeddingModel};
    if(input.baseUrl)entries["ai.baseUrl"]=input.baseUrl;
    if(input.apiFormat)entries["ai.apiFormat"]=input.apiFormat;
    transaction(()=>{for(const[key,value]of Object.entries(entries))db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(key,value,now);});
    return this.get();
  }
}

export function modelKind(id:string):UpstreamModel["kind"]{
  const value=id.toLowerCase();
  if(/embed|embedding|bge|e5-|gte-|nomic/.test(value))return"embedding";
  if(/image|dall-e|whisper|transcri|audio|speech|tts/.test(value))return"unknown";
  if(/gpt|claude|gemini|qwen|deepseek|llama|mistral|glm|kimi|chat|o\d/.test(value))return"chat";
  return"unknown";
}
