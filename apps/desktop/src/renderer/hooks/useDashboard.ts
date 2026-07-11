import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
type AiHealth = { ok: boolean; detail: string } | null;
export function useDashboard(courseId?: string, sessionId?: string) {
  const client = useQueryClient();
  const [online, setOnline] = useState(false);
  const [serviceStatus, setServiceStatus] =
    useState<DesktopServiceStatus | null>(null);
  const [aiHealth, setAiHealth] = useState<AiHealth>(null);
  const query = useQuery({
    queryKey: ["dashboard", courseId, sessionId],
    queryFn: () => api.dashboard(courseId, sessionId),
  });
  useEffect(() => {
    const bridge = window.desktop;
    if (!bridge) return;
    void bridge.getServiceStatus().then(setServiceStatus);
    return bridge.onServiceStatus(setServiceStatus);
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const result = await api.ready();
        if (!cancelled) setAiHealth(result.checks.ai);
      } catch {
        if (!cancelled) setAiHealth({ ok: false, detail: "无法读取 AI 健康状态" });
      }
    }
    void poll();
    const timer = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const source = new EventSource(api.eventsUrl);
    source.onopen = () => setOnline(true);
    source.onerror = () => setOnline(false);
    for (const event of [
      "transcript",
      "semantic",
      "task",
      "session",
      "job",
      "report",
    ])
      source.addEventListener(
        event,
        () => void client.invalidateQueries({ queryKey: ["dashboard"] }),
      );
    return () => source.close();
  }, [client]);
  return { ...query, online, serviceStatus, aiHealth };
}
