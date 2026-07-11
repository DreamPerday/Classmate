import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Mic2,
  Minus,
  Sparkles,
  Square,
} from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { useDashboard } from "../hooks/useDashboard";
export function OverlayApp() {
  const [compact, setCompact] = useState(false);
  const [commandError, setCommandError] = useState<string>();
  const { data, error, online, serviceStatus } = useDashboard();
  const query = useQueryClient();
  const active = data?.activeSession,
    recording = active?.status === "recording",
    latest = data?.recentTranscript.at(-1),
    event = data?.recentEvents[0];
  const capture = useMutation({
    mutationFn: async () => {
      if (!active) throw new Error("没有可用课堂");
      return recording
        ? api.captureStop(active.id)
        : api.captureStart(active.id);
    },
    onSuccess: () => query.invalidateQueries({ queryKey: ["dashboard"] }),
    onError: (captureError) => setCommandError(errorMessage(captureError)),
  });
  useEffect(() => {
    const bridge = window.desktop;
    if (!bridge) {
      setCommandError("桌面控制未加载");
      return;
    }
    void bridge
      .getOverlayState()
      .then((state) => setCompact(state.compact))
      .catch(() => setCommandError("无法读取悬浮窗状态"));
  }, []);
  async function compactWindow() {
    const bridge = window.desktop;
    if (!bridge) return setCommandError("桌面控制未加载");
    try {
      setCommandError(undefined);
      const state = await bridge.setOverlayCompact(!compact);
      setCompact(state.compact);
    } catch {
      setCommandError("收起悬浮窗失败");
    }
  }
  async function openMain() {
    const bridge = window.desktop;
    if (!bridge) return setCommandError("桌面控制未加载");
    try {
      const state = await bridge.openMain();
      if (!state.visible) throw new Error("主窗口未显示");
      setCommandError(undefined);
    } catch {
      setCommandError("打开主窗口失败");
    }
  }
  async function hideOverlay() {
    const bridge = window.desktop;
    if (!bridge) return setCommandError("桌面控制未加载");
    try {
      const state = await bridge.hideOverlay();
      if (state.visible) throw new Error("悬浮窗仍可见");
    } catch {
      setCommandError("隐藏悬浮窗失败");
    }
  }
  return (
    <main className="h-[100dvh] overflow-hidden rounded-[8px] border border-[#bac4bc] bg-[#f8faf7]/95 shadow-2xl backdrop-blur">
      <header className="window-drag flex h-[54px] items-center gap-3 border-b border-[#dce2dc] px-3">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${recording ? "bg-[#bd4e3d] pulse-dot" : online ? "bg-[#3b8067]" : "bg-[#929992]"}`}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {active?.title ?? "Classmate 课堂助手"}
          </div>
          <div className="truncate text-[10px] text-[#737c74]">
            {commandError ??
              (recording
              ? "正在采集系统音频"
              : online
                ? "等待开始课堂"
                : serviceStatus?.state === "error"
                  ? "本地服务启动失败"
                  : "本地服务未连接")}
          </div>
        </div>
        <button
          title={recording ? "结束采集" : "开始采集"}
          disabled={!active || capture.isPending}
          onClick={() => capture.mutate()}
          className={`window-no-drag grid h-8 w-8 shrink-0 place-items-center rounded-[5px] text-white disabled:opacity-40 ${recording ? "bg-[#a94536]" : "bg-[#285f4e]"}`}
        >
          {recording ? <Square size={14} /> : <Mic2 size={15} />}
        </button>
        <button
          title={compact ? "展开" : "收起"}
          onClick={compactWindow}
          className="window-no-drag grid h-8 w-8 place-items-center rounded-[5px] text-[#59615b] hover:bg-[#e8ece7]"
        >
          {compact ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        <button
          title="打开主窗口"
          onClick={() => void openMain()}
          className="window-no-drag grid h-8 w-8 place-items-center rounded-[5px] text-[#59615b] hover:bg-[#e8ece7]"
        >
          <ExternalLink size={15} />
        </button>
        <button
          title="隐藏悬浮窗"
          onClick={() => void hideOverlay()}
          className="window-no-drag grid h-8 w-8 place-items-center rounded-[5px] text-[#59615b] hover:bg-[#e8ece7]"
        >
          <Minus size={16} />
        </button>
      </header>
      {!compact && (
        <div className="grid h-[196px] min-h-0 grid-rows-2">
          <section className="min-h-0 overflow-auto px-4 py-3 scrollbar">
            <div className="mb-1 text-[10px] font-semibold uppercase text-[#7c847d]">
              最新字幕
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#303630]">
              {latest?.text ??
                (error
                  ? errorMessage(error)
                  : "识别到课堂语音后，字幕会显示在这里。")}
            </p>
          </section>
          <section className="flex min-h-0 items-start gap-2 overflow-auto border-t border-[#e0e4df] bg-[#f1f4ef] px-4 py-3 scrollbar">
            <Sparkles size={14} className="mt-0.5 shrink-0 text-[#a66535]" />
            <div className="min-w-0">
              <div className="break-words text-xs font-semibold leading-5">
                {event?.title ?? "等待课堂重点"}
              </div>
              <div className="mt-1 whitespace-pre-wrap break-words text-[10px] leading-4 text-[#747c75]">
                {event?.content ?? "重点、任务和截止时间将在此提示"}
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
