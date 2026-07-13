import type {
  ApiEnvelope,
  ApiProblem,
  Course,
  CourseSession,
  Dashboard,
  KnowledgeNode,
  ReportRequest,
  SessionSummary,
  TranscriptSegment,
  SemanticEvent,
  ClassroomTask,
} from "@classmate/shared";
const base = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4317";
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ApiProblem,
  ) {
    super(problem.detail);
  }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error("OFFLINE");
  }
  if (!response.ok) throw new ApiError(response.status, await response.json());
  return ((await response.json()) as ApiEnvelope<T>).data;
}
export type ApiFormat = "openai-chat" | "openai-responses" | "claude";
export type AiSettings = {
  provider: "openai" | "ollama" | "mock";
  chatModel: string;
  embeddingModel: string;
  baseUrl: string;
  apiFormat: ApiFormat;
  apiKey?: string;
  hasKey: boolean;
};
export type UpstreamModel = {
  id: string;
  ownedBy: string | null;
  created: number | null;
  kind: "chat" | "embedding" | "unknown";
};
export const api = {
  dashboard: (courseId?: string, sessionId?: string) => {
    const query = new URLSearchParams();
    if (courseId) query.set("courseId", courseId);
    if (sessionId) query.set("sessionId", sessionId);
    const suffix = query.size ? `?${query.toString()}` : "";
    return request<Dashboard>(`/api/dashboard${suffix}`);
  },
  createCourse: (body: object) =>
    request<Course>("/api/courses", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteCourse: (id: string) =>
    request<{ deleted: boolean }>(`/api/courses/${id}`, { method: "DELETE" }),
  exportCourse: (id: string) =>
    request<any>(`/api/courses/${id}/export`),
  importCourse: (payload: any, options: any) =>
    request<{ courseId: string; sessionCount: number }>(`/api/courses/import`, {
      method: "POST",
      body: JSON.stringify({ payload, options }),
    }),
  createSession: (body: object) =>
    request<CourseSession>("/api/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteSession: (id: string) =>
    request<{ deleted: boolean }>(`/api/sessions/${id}`, { method: "DELETE" }),
  sessionStatus: (id: string, status: CourseSession["status"]) =>
    request<CourseSession>(`/api/sessions/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  captureStart: (id: string) =>
    request(`/api/sessions/${id}/capture/start`, {
      method: "POST",
      body: "{}",
    }),
  captureStop: (id: string) =>
    request(`/api/sessions/${id}/capture/stop`, { method: "POST", body: "{}" }),
  updateTask: (id: string, status: "open" | "done" | "dismissed") =>
    request(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  ask: (courseId: string, question: string) =>
    request<{
      answer: string;
      sources: Array<{
        entityId: string;
        content: string;
        startMs: number | null;
      }>;
    }>("/api/ask", {
      method: "POST",
      body: JSON.stringify({ courseId, question }),
    }),
  generateReport: (courseId: string, options: ReportRequest = {}) =>
    request<{ id: string }>(`/api/courses/${courseId}/reports/comprehensive`, {
      method: "POST",
      body: JSON.stringify(options),
    }),
  reports: (courseId: string) =>
    request<any[]>(`/api/courses/${courseId}/reports`),
  reportDownload: (courseId: string, id: string, format: "docx" | "pdf" | "md") =>
    `${base}/api/reports/${id}/download/${format}?courseId=${encodeURIComponent(courseId)}`,
  deleteReport: (id: string) =>
    request<{ deleted: boolean }>(`/api/reports/${id}`, { method: "DELETE" }),
  aiSettings: () => request<AiSettings>("/api/ai/settings"),
  aiModels: (provider: AiSettings["provider"]) =>
    request<UpstreamModel[]>(`/api/ai/models?provider=${provider}`),
  saveAiSettings: (
    settings: Pick<AiSettings, "provider" | "chatModel" | "embeddingModel" | "baseUrl" | "apiFormat" | "apiKey">,
  ) =>
    request<AiSettings>("/api/ai/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    }),
  testAi: () =>
    request<{ ok: boolean; detail: string }>("/api/ai/test", {
      method: "POST",
      body: "{}",
    }),
  reindexAi: () =>
    request<{ queued: boolean; model: string }>("/api/ai/reindex", {
      method: "POST",
      body: "{}",
    }),
  ready: async (): Promise<{
    status: string;
    checks: { database: boolean; ai: { ok: boolean; detail: string } };
  }> => {
    let response: Response;
    try {
      response = await fetch(`${base}/ready`);
    } catch {
      throw new Error("OFFLINE");
    }
    if (!response.ok && response.status !== 503)
      throw new ApiError(response.status, await response.json());
    const body = await response.json();
    return (body as ApiEnvelope<{
      status: string;
      checks: { database: boolean; ai: { ok: boolean; detail: string } };
    }>).data ?? body;
  },
  eventsUrl: `${base}/api/events`,
  sessionSummary: (sessionId: string) =>
    request<SessionSummary | null>(`/api/sessions/${sessionId}/summary`),
  regenerateSummary: (sessionId: string) =>
    request<{ queued: boolean }>(
      `/api/sessions/${sessionId}/summary/regenerate`,
      { method: "POST", body: "{}" },
    ),
  sessionTranscripts: (sessionId: string) =>
    request<TranscriptSegment[]>(
      `/api/sessions/${sessionId}/transcripts?limit=all`,
    ),
  sessionEvents: (sessionId: string) =>
    request<SemanticEvent[]>(`/api/sessions/${sessionId}/events`),
  sessionTasks: (sessionId: string) =>
    request<ClassroomTask[]>(`/api/sessions/${sessionId}/tasks`),
  courseSummaries: (courseId: string) =>
    request<any[]>(`/api/courses/${courseId}/summaries`),
  nodeEvidence: (nodeId: string) =>
    request<
      Array<{
        event: SemanticEvent;
        segments: TranscriptSegment[];
      }>
    >(`/api/nodes/${nodeId}/evidence`),
  nodeTasks: (nodeId: string) =>
    request<ClassroomTask[]>(`/api/nodes/${nodeId}/tasks`),
  updateNode: (
    nodeId: string,
    patch: { definition?: string; importance?: number },
  ) =>
    request<KnowledgeNode>(`/api/nodes/${nodeId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteNode: (nodeId: string) =>
    request<{ deleted: boolean }>(`/api/nodes/${nodeId}`, {
      method: "DELETE",
    }),
  updateTaskFull: (
    taskId: string,
    patch: {
      title?: string;
      detail?: string;
      deadlineRaw?: string | null;
      deadlineResolved?: string | null;
      status?: "open" | "done" | "dismissed";
      importance?: number;
    },
  ) =>
    request<ClassroomTask>(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteTask: (taskId: string) =>
    request<{ deleted: boolean }>(`/api/tasks/${taskId}`, {
      method: "DELETE",
    }),
  taskEvidence: (taskId: string) =>
    request<{
      event: SemanticEvent;
      segments: TranscriptSegment[];
    } | null>(`/api/tasks/${taskId}/evidence`),
};
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError)
    return error.status === 422
      ? "输入内容不符合要求"
      : error.status === 503
        ? "本地模型或辅助进程不可用"
        : "操作失败，请查看服务日志";
  if (error instanceof Error && error.message === "OFFLINE")
    return "无法连接本地服务，请确认服务已经启动";
  return "发生未预期错误";
}
