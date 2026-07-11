import { config as loadEnv } from "dotenv";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const root = process.env.CLASSMATE_ROOT ? resolve(process.env.CLASSMATE_ROOT) : resolve(import.meta.dirname, "../../../..");
loadEnv({ path: resolve(root, ".env") });

const schema = z.object({
  HOST: z.literal("127.0.0.1").default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1024).max(65535).default(4317),
  DATABASE_PATH: z.string().default("./data/classmate.db"),
  DATA_DIR: z.string().default("./data"), OUTPUT_DIR: z.string().default("./output"),
  AI_PROVIDER: z.enum(["ollama", "openai", "mock"]).default("ollama"),
  OLLAMA_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_CHAT_MODEL: z.string().default("qwen3:8b"), OLLAMA_EMBED_MODEL: z.string().default("nomic-embed-text"),
  OPENAI_API_KEY: z.string().optional(), OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_API_FORMAT: z.enum(["openai-chat", "openai-responses", "claude"]).default("openai-chat"),
  OPENAI_CHAT_MODEL: z.string().optional(), OPENAI_EMBED_MODEL: z.string().default("text-embedding-3-small"),
  LOCAL_EMBED_DEVICE: z.string().default("auto"),
  ASR_PROVIDER: z.enum(["faster-whisper", "openai", "mock"]).default("faster-whisper"),
  WHISPER_MODEL: z.string().default("large-v3-turbo"), WHISPER_DEVICE: z.string().default("auto"), WHISPER_COMPUTE_TYPE: z.string().default("auto"),
  PYTHON_EXECUTABLE: z.string().default("python"), AUDIO_CAPTURE_EXECUTABLE: z.string().default("./tools/audio-capture/bin/Release/net8.0-windows/AudioCapture.exe"),
  DOCX_EXPORT_EXECUTABLE: z.string().default("./tools/report-export/bin/Release/net8.0/ReportExport.exe")
});
const env = schema.parse(process.env);
export const config = {
  host: env.HOST, port: env.PORT, root,
  databasePath: resolve(root, env.DATABASE_PATH), dataDir: resolve(root, env.DATA_DIR), outputDir: resolve(root, env.OUTPUT_DIR),
  ai: { provider: env.AI_PROVIDER, ollamaBaseUrl: env.OLLAMA_BASE_URL, ollamaChatModel: env.OLLAMA_CHAT_MODEL, ollamaEmbedModel: env.OLLAMA_EMBED_MODEL,
    openaiApiKey: env.OPENAI_API_KEY, openaiBaseUrl: env.OPENAI_BASE_URL, openaiApiFormat: env.OPENAI_API_FORMAT, openaiChatModel: env.OPENAI_CHAT_MODEL, openaiEmbedModel: env.OPENAI_EMBED_MODEL, localEmbedDevice: env.LOCAL_EMBED_DEVICE },
  asr: { provider: env.ASR_PROVIDER, model: env.WHISPER_MODEL, device: env.WHISPER_DEVICE, computeType: env.WHISPER_COMPUTE_TYPE },
  executables: { python: env.PYTHON_EXECUTABLE, audioCapture: resolve(root, env.AUDIO_CAPTURE_EXECUTABLE), docxExport: resolve(root, env.DOCX_EXPORT_EXECUTABLE) }
} as const;
[config.dataDir, config.outputDir, resolve(config.dataDir, "inbox"), resolve(config.outputDir, "docx"), resolve(config.outputDir, "pdf")].forEach((dir) => mkdirSync(dir, { recursive: true }));
