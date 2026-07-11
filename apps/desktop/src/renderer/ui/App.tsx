import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Markdown from "react-markdown";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Cpu,
  Database,
  FileText,
  GraduationCap,
  Layers3,
  ListTodo,
  Mic2,
  MonitorUp,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  TimerReset,
  Trash2,
  X,
} from "lucide-react";
import type {
  ClassroomTask,
  CourseSession,
  Dashboard,
  SemanticEvent,
  TranscriptSegment,
} from "@classmate/shared";
import {
  api,
  errorMessage,
  type AiSettings,
  type ApiFormat,
  type UpstreamModel,
} from "../lib/api";
import { useDashboard } from "../hooks/useDashboard";
const GraphView = lazy(() =>
  import("./GraphView").then((module) => ({ default: module.GraphView })),
);
type View = "live" | "review" | "knowledge" | "tasks" | "reports" | "settings";
const nav = [
  { id: "live" as const, label: "实时课堂", icon: Radio },
  { id: "knowledge" as const, label: "知识网络", icon: BrainCircuit },
  { id: "tasks" as const, label: "任务中心", icon: CheckCircle2 },
  { id: "reports" as const, label: "学习报告", icon: FileText },
];
export function App() {
  const [selectedCourse, setSelectedCourse] = useState<string>();
  const [selectedSession, setSelectedSession] = useState<string>();
  const [view, setView] = useState<View>("live");
  const [courseModal, setCourseModal] = useState(false);
  const [sessionModal, setSessionModal] = useState(false);
  const { data, isLoading, error, online, serviceStatus, aiHealth } =
    useDashboard(selectedCourse, selectedSession);
  useEffect(() => {
    if (!selectedCourse && data?.courses[0])
      setSelectedCourse(data.courses[0].id);
  }, [data, selectedCourse]);
  useEffect(() => {
    if (!data?.sessions.length) {
      if (selectedSession) setSelectedSession(undefined);
      return;
    }
    if (!selectedSession || !data.sessions.some((item) => item.id === selectedSession)) {
      setSelectedSession(data.activeSession?.id ?? data.sessions[0]?.id);
    }
  }, [data, selectedSession]);
  return (
    <main className="noise grid h-[100dvh] grid-cols-[220px_minmax(0,1fr)] bg-[#f4f5f2]">
      <Sidebar
        view={view}
        setView={setView}
        data={data}
        selectedCourse={selectedCourse}
        onCourseChange={(courseId) => {
          setSelectedCourse(courseId);
          setSelectedSession(undefined);
        }}
        selectedSession={selectedSession}
        setSelectedSession={setSelectedSession}
        onCourse={() => setCourseModal(true)}
        onNewSession={() => setSessionModal(true)}
      />
      <section className="grid h-full min-h-0 min-w-0 grid-rows-[54px_minmax(0,1fr)] overflow-hidden">
        <Topbar
          data={data}
          online={online}
          serviceStatus={serviceStatus}
          aiHealth={aiHealth}
          onSession={() => setSessionModal(true)}
        />
        <div
          className={`h-full min-h-0 ${view === "live" ? "overflow-hidden" : "overflow-auto scrollbar"}`}
        >
          {isLoading ? (
            <Loading />
          ) : error ? (
            <ErrorState
              message={
                serviceStatus?.state === "error"
                  ? `本地服务启动失败：${serviceStatus.detail}`
                  : !online
                    ? "SSE 连接中断，无法接收实时更新"
                    : aiHealth && !aiHealth.ok
                      ? `AI 上游异常：${aiHealth.detail}`
                      : errorMessage(error)
              }
            />
          ) : view === "settings" ? (
            <SettingsView />
          ) : view === "knowledge" ? (
            <KnowledgeView data={data!} />
          ) : view === "review" ? (
            <SessionReviewView
              data={data!}
              onBack={() => setView("live")}
              onNewSession={() => setSessionModal(true)}
            />
          ) : view === "tasks" ? (
            <TasksView data={data!} />
          ) : view === "reports" ? (
            <ReportsView data={data!} />
          ) : !data?.courses.length ? (
            <Welcome onCreate={() => setCourseModal(true)} />
          ) : (
            <LiveView data={data} onViewReview={() => setView("review")} />
          )}
        </div>
      </section>
      {courseModal && (
        <CreateCourseModal
          close={() => setCourseModal(false)}
          onCreated={(id) => {
            setSelectedCourse(id);
            setCourseModal(false);
          }}
        />
      )}{" "}
      {sessionModal && data && selectedCourse && (
        <CreateSessionModal
          courseId={selectedCourse}
          nextDay={Math.max(0, ...data.sessions.map((item) => item.dayIndex)) + 1}
          onCreated={setSelectedSession}
          close={() => setSessionModal(false)}
        />
      )}
    </main>
  );
}
function Sidebar({
  view,
  setView,
  data,
  selectedCourse,
  onCourseChange,
  selectedSession,
  setSelectedSession,
  onCourse,
  onNewSession,
}: {
  view: View;
  setView: (v: View) => void;
  data: Dashboard | undefined;
  selectedCourse: string | undefined;
  onCourseChange: (id: string) => void;
  selectedSession: string | undefined;
  setSelectedSession: (id: string) => void;
  onCourse: () => void;
  onNewSession: () => void;
}) {
  const orderedSessions = [...(data?.sessions ?? [])].sort(
    (left, right) => left.dayIndex - right.dayIndex,
  );
  const selectedIndex = orderedSessions.findIndex(
    (item) => item.id === selectedSession,
  );
  return (
    <aside className="flex min-h-0 flex-col border-r border-[#dce0da] bg-[#eceee9] px-3 pb-3 pt-5">
      <div className="mb-7 flex items-center gap-3 px-2">
        <div className="grid h-9 w-9 place-items-center rounded-[6px] bg-[#285f4e] text-white">
          <GraduationCap size={20} />
        </div>
        <div>
          <div className="font-semibold leading-tight">Classmate</div>
          <div className="text-[11px] text-[#737b74]">课堂智能体</div>
        </div>
      </div>
      <label className="mb-1 px-2 text-[11px] font-semibold uppercase text-[#818981]">
        当前课程
      </label>
      <div className="relative mb-5">
        <select
          aria-label="当前课程"
          className="h-10 w-full appearance-none rounded-[5px] border border-[#d6dad4] bg-white px-3 pr-8 text-sm font-medium"
          value={selectedCourse ?? ""}
          onChange={(e) => onCourseChange(e.target.value)}
        >
          <option value="" disabled>
            选择课程
          </option>
          {data?.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-3 text-[#747c75]"
          size={16}
        />
      </div>
      <label className="mb-1 px-2 text-[11px] font-semibold uppercase text-[#818981]">
        当前课堂
      </label>
      <div className="mb-5 grid grid-cols-[32px_minmax(0,1fr)_32px] gap-1">
        <button
          type="button"
          title="上一课次"
          aria-label="上一课次"
          disabled={selectedIndex <= 0}
          onClick={() => setSelectedSession(orderedSessions[selectedIndex - 1]!.id)}
          className="grid h-10 place-items-center rounded-[5px] border border-[#d6dad4] bg-white text-[#59615b] disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="relative min-w-0">
          <select
            aria-label="当前课堂"
            value={selectedSession ?? ""}
            onChange={(event) => setSelectedSession(event.target.value)}
            disabled={!orderedSessions.length}
            className="h-10 w-full appearance-none rounded-[5px] border border-[#d6dad4] bg-white px-2 pr-7 text-xs font-medium disabled:opacity-45"
          >
            {!orderedSessions.length && <option value="">暂无课堂</option>}
            {orderedSessions.map((session) => (
              <option key={session.id} value={session.id}>
                第 {session.dayIndex} 课次 · {session.title}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2 top-3 text-[#747c75]"
            size={15}
          />
        </div>
        <button
          type="button"
          title="下一课次"
          aria-label="下一课次"
          disabled={selectedIndex < 0 || selectedIndex >= orderedSessions.length - 1}
          onClick={() => setSelectedSession(orderedSessions[selectedIndex + 1]!.id)}
          className="grid h-10 place-items-center rounded-[5px] border border-[#d6dad4] bg-white text-[#59615b] disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      {selectedCourse && (
        <button
          type="button"
          onClick={onNewSession}
          title="为当前课程新建下一课次"
          className="mb-5 flex h-9 w-full items-center justify-center gap-2 rounded-[5px] border border-dashed border-[#9aaea9] bg-[#f1f4ee] text-xs font-semibold text-[#2f6754] hover:bg-[#e8ece4]"
        >
          <Plus size={14} />
          新建下一课次
        </button>
      )}
      <nav className="space-y-1">
        {nav.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`flex h-10 w-full items-center gap-3 rounded-[5px] px-3 text-sm transition ${view === item.id ? "bg-white font-semibold text-[#245a49] shadow-sm" : "text-[#59615b] hover:bg-white/60"}`}
          >
            <item.icon size={17} />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="mt-auto border-t border-[#d7dbd5] pt-3">
        <button
          onClick={() => {
            const bridge = window.desktop;
            if (!bridge) return alert("桌面控制未加载，请重启应用");
            void bridge
              .toggleOverlay()
              .catch(() => alert("无法切换课堂悬浮窗"));
          }}
          className="flex h-10 w-full items-center gap-3 rounded-[5px] px-3 text-sm text-[#59615b] hover:bg-white"
        >
          <MonitorUp size={17} />
          课堂悬浮窗
        </button>
        <button
          onClick={onCourse}
          className="flex h-10 w-full items-center gap-3 rounded-[5px] px-3 text-sm text-[#59615b] hover:bg-white"
        >
          <Plus size={17} />
          新建课程
        </button>
        <button
          title="模型设置"
          onClick={() => setView("settings")}
          className={`flex h-10 w-full items-center gap-3 rounded-[5px] px-3 text-sm ${view === "settings" ? "bg-white font-semibold text-[#245a49] shadow-sm" : "text-[#59615b] hover:bg-white"}`}
        >
          <Settings2 size={17} />
          模型与连接
        </button>
      </div>
    </aside>
  );
}
function Topbar({
  data,
  online,
  serviceStatus,
  aiHealth,
  onSession,
}: {
  data: Dashboard | undefined;
  online: boolean;
  serviceStatus: DesktopServiceStatus | null;
  aiHealth: { ok: boolean; detail: string } | null;
  onSession: () => void;
}) {
  const course =
      data?.courses.find((c) => c.id === data.activeSession?.courseId) ??
      data?.courses[0],
    hasCourse = Boolean(data?.courses.length);
  return (
    <header className="flex items-center justify-between border-b border-[#dde1da] bg-[#f8f9f6]/90 px-5">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">
          {course?.name ?? "课堂工作台"}
        </div>
        <div className="text-[11px] text-[#7a827b]">
          {data?.activeSession
            ? `第 ${data.activeSession.dayIndex} 课次 · ${data.activeSession.title}`
            : "等待创建课堂"}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3 text-xs">
            <span
              title={`服务进程：${serviceStatus?.state === "ready" ? "运行中" : serviceStatus?.state === "error" ? `错误 - ${serviceStatus.detail}` : serviceStatus?.state === "starting" ? "启动中" : "未知"}`}
              className={`flex items-center gap-1 ${serviceStatus?.state === "ready" ? "text-[#34725d]" : "text-[#a44e3d]"}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${serviceStatus?.state === "ready" ? "bg-[#3c8b6d] pulse-dot" : "bg-[#bd5b48]"}`}
              />
              进程
            </span>
            <span
              title={`实时连接：${online ? "已连接 SSE" : "SSE 已断开"}`}
              className={`flex items-center gap-1 ${online ? "text-[#34725d]" : "text-[#a44e3d]"}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${online ? "bg-[#3c8b6d]" : "bg-[#bd5b48]"}`}
              />
              实时
            </span>
            <span
              title={`AI 上游：${aiHealth ? (aiHealth.ok ? "正常" : aiHealth.detail) : "检测中"}`}
              className={`flex items-center gap-1 ${aiHealth?.ok ? "text-[#34725d]" : aiHealth ? "text-[#a44e3d]" : "text-[#6a7077]"}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${aiHealth?.ok ? "bg-[#3c8b6d]" : aiHealth ? "bg-[#bd5b48]" : "bg-[#5f656c]"}`}
              />
              AI
            </span>
          </div>
        <button
          disabled={!hasCourse}
          title={hasCourse ? "新建课堂" : "请先新建课程"}
          onClick={onSession}
          className="flex h-8 items-center gap-2 rounded-[5px] border border-[#cfd5ce] bg-white px-3 text-xs font-semibold hover:bg-[#f2f4f0] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Plus size={14} />
          新建课堂
        </button>
      </div>
    </header>
  );
}
function LiveView({ data, onViewReview }: { data: Dashboard; onViewReview: () => void }) {
  const query = useQueryClient();
  const [busy, setBusy] = useState(false);
  const active = data.activeSession;
  const recording = active?.status === "recording";
  async function toggle() {
    if (!active) return;
    setBusy(true);
    try {
      recording
        ? await api.captureStop(active.id)
        : await api.captureStart(active.id);
      await query.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <section className="grid grid-cols-[1fr_auto] items-center border-b border-[#dfe3dc] bg-white px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${recording ? "bg-[#bb4d3c] pulse-dot" : "bg-[#8c948d]"}`}
            />
            <h1 className="text-lg font-semibold">
              {active?.title ?? "尚未创建课堂"}
            </h1>
          </div>
          <p className="mt-1 text-sm text-[#717872]">
            {recording
              ? "正在采集系统音频并生成可追溯课堂记忆"
              : active
                ? "课堂已就绪，可开始系统音频采集"
                : "请先新建今天的课堂"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!recording && active && (
            <button
              onClick={onViewReview}
              title="查看本课的完整字幕、AI 摘要、事件与任务"
              className="flex h-10 items-center gap-2 rounded-[6px] border border-[#c4cabf] bg-white px-4 text-sm font-semibold text-[#245a49] hover:bg-[#f0f4ee]"
            >
              <BookOpen size={16} />
              查看本课总结
            </button>
          )}
          <button
            disabled={!active || busy}
            onClick={toggle}
            className={`flex h-10 items-center gap-2 rounded-[6px] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 ${recording ? "bg-[#a94536] hover:bg-[#92382c]" : "bg-[#285f4e] hover:bg-[#204e40]"}`}
          >
            {recording ? (
              <>
                <Square size={16} />
                结束采集
              </>
            ) : (
              <>
                <Mic2 size={17} />
                开始采集
              </>
            )}
          </button>
        </div>
      </section>
      <section className="grid h-full min-h-0 grid-cols-[minmax(420px,1.45fr)_minmax(300px,.8fr)] divide-x divide-[#dfe3dc] overflow-hidden">
        <TranscriptPanel
          segments={data.recentTranscript}
          recording={recording}
        />
        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
          <Stats stats={data.stats} />
          <EventPanel events={data.recentEvents} />
          {data.courses[0] && (
            <AskBox
              courseId={
                data.courses.find((c) => c.id === active?.courseId)?.id ??
                data.courses[0].id
              }
            />
          )}
        </div>
      </section>
    </div>
  );
}
function SessionReviewView({
  data,
  onBack,
  onNewSession,
}: {
  data: Dashboard;
  onBack: () => void;
  onNewSession: () => void;
}) {
  const active = data.activeSession;
  const sessionId = active?.id;
  const [tab, setTab] = useState<"summary" | "events" | "tasks">("summary");
  const queryClient = useQueryClient();
  const transcripts = useQuery({
    queryKey: ["session-transcripts", sessionId],
    queryFn: () => api.sessionTranscripts(sessionId!),
    enabled: Boolean(sessionId),
  });
  const sessionTasks = useQuery({
    queryKey: ["session-tasks", sessionId],
    queryFn: () => api.sessionTasks(sessionId!),
    enabled: Boolean(sessionId),
  });
  const regen = useMutation({
    mutationFn: () => api.regenerateSummary(sessionId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => alert(errorMessage(e)),
  });
  if (!active) {
    return (
      <div className="grid h-full place-items-center">
        <Empty title="没有可回顾的课次" detail="请先选择一个课次。" />
      </div>
    );
  }
  const summary = data.activeSessionSummary;
  const events = data.recentEvents.filter((e) => e.sessionId === sessionId);
  const tasks =
    sessionTasks.data ?? data.tasks.filter((t) => t.sessionId === sessionId);
  const segments = transcripts.data ?? [];
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
      <header className="flex items-center justify-between gap-4 border-b border-[#dfe3dc] bg-white px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            title="返回实时课堂"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[5px] border border-[#d6dad4] bg-white text-[#59615b] hover:bg-[#f2f4f0]"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">
              第 {active.dayIndex} 课次 · {active.title}
            </h1>
            <p className="text-xs text-[#7a827b]">
              综合回顾 · 完整字幕 · AI 摘要 · 事件 · 任务
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => regen.mutate()}
          disabled={regen.isPending}
          title="基于本课所有事件重新生成 AI 摘要"
          className="flex h-9 items-center gap-2 rounded-[5px] border border-[#cfd5ce] bg-white px-3 text-xs font-semibold hover:bg-[#f2f4f0] disabled:opacity-50"
        >
          <RefreshCw size={14} className={regen.isPending ? "animate-spin" : ""} />
          {regen.isPending ? "正在重新生成" : "重新生成摘要"}
        </button>
      </header>
      <section className="grid h-full min-h-0 grid-cols-[minmax(420px,1.4fr)_minmax(360px,1fr)] divide-x divide-[#dfe3dc] overflow-hidden">
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#fafbf8]">
          <div className="flex h-12 items-center justify-between border-b border-[#e1e4df] px-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen size={16} className="text-[#39745f]" />
              完整字幕
            </div>
            <div className="text-xs text-[#7b827c]">
              {transcripts.isLoading ? "加载中..." : `${segments.length} 个片段`}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4 scrollbar">
            {segments.length ? (
              segments.map((s) => (
                <article
                  key={s.id}
                  className="grid grid-cols-[56px_1fr] gap-3 border-b border-[#e9ebe7] py-3"
                >
                  <time className="pt-0.5 font-mono text-xs text-[#8a918b]">
                    {formatMs(s.startMs)}
                  </time>
                  <div>
                    <p className="text-[15px] leading-7 text-[#303530]">{s.text}</p>
                    <div className="mt-1 text-[11px] text-[#929892]">
                      {s.confidence === null
                        ? "置信度待定"
                        : `识别置信度 ${Math.round(s.confidence * 100)}%`}
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <Empty
                title={transcripts.isLoading ? "正在加载字幕" : "本课暂无字幕"}
                detail="字幕会在采集结束后保留完整时间戳与音频证据。"
              />
            )}
          </div>
        </div>
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
          <div className="flex h-12 items-center gap-1 border-b border-[#e1e4df] px-3">
            {(
              [
                { id: "summary" as const, label: "AI 摘要", icon: Sparkles },
                { id: "events" as const, label: `事件 (${events.length})`, icon: FileText },
                { id: "tasks" as const, label: `任务 (${tasks.length})`, icon: ListTodo },
              ]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex h-9 items-center gap-1.5 rounded-[5px] px-3 text-xs font-semibold ${tab === t.id ? "bg-[#edf3ee] text-[#245a49]" : "text-[#6b736c] hover:bg-[#f3f5f1]"}`}
              >
                <t.icon size={14} />
                {t.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto scrollbar">
            {tab === "summary" ? (
              <div className="px-5 py-4">
                {summary ? (
                  <article className="max-w-none text-[#303530]">
                    <Markdown
                      components={{
                        h1: ({ node, ...props }) => (
                          <h1 className="mt-4 mb-2 text-base font-bold first:mt-0" {...props} />
                        ),
                        h2: ({ node, ...props }) => (
                          <h2 className="mt-4 mb-2 text-sm font-bold first:mt-0" {...props} />
                        ),
                        h3: ({ node, ...props }) => (
                          <h3 className="mt-3 mb-1 text-sm font-semibold first:mt-0" {...props} />
                        ),
                        p: ({ node, ...props }) => (
                          <p className="my-2 text-sm leading-6" {...props} />
                        ),
                        ul: ({ node, ...props }) => (
                          <ul className="my-2 list-disc pl-5 text-sm leading-6" {...props} />
                        ),
                        ol: ({ node, ...props }) => (
                          <ol className="my-2 list-decimal pl-5 text-sm leading-6" {...props} />
                        ),
                        li: ({ node, ...props }) => <li className="my-1" {...props} />,
                        strong: ({ node, ...props }) => (
                          <strong className="font-semibold text-[#1f2620]" {...props} />
                        ),
                        code: ({ node, ...props }) => (
                          <code
                            className="rounded bg-[#eef1ec] px-1 py-0.5 font-mono text-xs"
                            {...props}
                          />
                        ),
                        blockquote: ({ node, ...props }) => (
                          <blockquote
                            className="my-2 border-l-2 border-[#c4cabf] pl-3 text-[#5b635c]"
                            {...props}
                          />
                        ),
                      }}
                    >
                      {summary.contentMd}
                    </Markdown>
                  </article>
                ) : (
                  <Empty
                    title="尚未生成 AI 摘要"
                    detail="结束采集时会自动基于本课事件生成摘要，也可点击右上角手动重新生成。"
                  />
                )}
              </div>
            ) : tab === "events" ? (
              <div className="px-4 py-3">
                {events.length ? (
                  events.map((e) => (
                    <article key={e.id} className="border-t border-[#e7e9e5] py-3 first:border-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase text-[#a65f35]">
                          {eventLabel(e.type)}
                        </span>
                        <span className="text-[10px] text-[#8b918c]">
                          重要度 {e.importance}
                        </span>
                      </div>
                      <h3 className="mt-1 text-sm font-semibold">{e.title}</h3>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#6c736d]">
                        {e.content}
                      </p>
                    </article>
                  ))
                ) : (
                  <Empty title="本课暂无事件" detail="语义事件会随字幕同步抽取。" />
                )}
              </div>
            ) : (
              <div className="divide-y divide-[#dfe3dc]">
                {tasks.length ? (
                  tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      sessionTitle={`第 ${active.dayIndex} 课次 · ${active.title}`}
                    />
                  ))
                ) : (
                  <Empty title="本课暂无任务" detail="识别到作业或截止时间后会自动出现。" />
                )}
              </div>
            )}
          </div>
        </div>
      </section>
      <footer className="flex items-center justify-between border-t border-[#dfe3dc] bg-[#f4f6f2] px-6 py-3">
        <div className="text-xs text-[#6b736c]">
          {active.status === "completed"
            ? "本课已结束，可开始下一课次。"
            : active.status === "recording"
              ? "本课正在采集中，结束采集后会自动生成最终摘要。"
              : "本课尚未开始采集。"}
        </div>
        <button
          type="button"
          onClick={onNewSession}
          className="flex h-10 items-center gap-2 rounded-[6px] bg-[#285f4e] px-4 text-sm font-semibold text-white hover:bg-[#204e40]"
        >
          <Plus size={16} />
          开始新课次
        </button>
      </footer>
    </div>
  );
}
function TranscriptPanel({
  segments,
  recording,
}: {
  segments: TranscriptSegment[];
  recording: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const latestId = segments.at(-1)?.id;
  useEffect(() => {
    const element = scroller.current;
    if (element && followLatest.current) {
      element.scrollTo({ top: element.scrollHeight });
    }
  }, [latestId]);
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#fafbf8]">
      <div className="flex h-12 items-center justify-between border-b border-[#e1e4df] px-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Activity size={16} className="text-[#39745f]" />
          实时字幕
        </div>
        <div className="text-xs text-[#7b827c]">{segments.length} 个片段</div>
      </div>
      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          followLatest.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 48;
        }}
        className="min-h-0 flex-1 overflow-auto px-5 py-4 scrollbar"
        aria-live="polite"
      >
        {segments.length ? (
          segments.map((s) => (
            <article
              key={s.id}
              className="grid grid-cols-[56px_1fr] gap-3 border-b border-[#e9ebe7] py-3"
            >
              <time className="pt-0.5 font-mono text-xs text-[#8a918b]">
                {formatMs(s.startMs)}
              </time>
              <div>
                <p className="text-[15px] leading-7 text-[#303530]">{s.text}</p>
                <div className="mt-1 text-[11px] text-[#929892]">
                  {s.confidence === null
                    ? "置信度待定"
                    : `识别置信度 ${Math.round(s.confidence * 100)}%`}
                  {s.latencyMs !== null &&
                    ` · 转写延迟 ${(s.latencyMs / 1000).toFixed(1)} 秒`}
                </div>
              </div>
            </article>
          ))
        ) : (
          <Empty
            title={recording ? "正在等待语音" : "还没有课堂字幕"}
            detail={
              recording
                ? "检测到有效语音后会自动出现。"
                : "开始采集后，字幕会保留时间戳和音频证据。"
            }
          />
        )}
      </div>
    </div>
  );
}
function Stats({ stats }: { stats: Dashboard["stats"] }) {
  return (
    <div className="grid grid-cols-4 divide-x divide-[#e0e4de] border-b border-[#e0e4de] bg-white">
      {[
        [stats.transcriptMinutes.toFixed(0), "分钟"],
        [stats.concepts, "概念"],
        [stats.openTasks, "待办"],
        [stats.completedDays, "课次完成"],
      ].map(([v, l]) => (
        <div className="px-3 py-3 text-center" key={l}>
          <div className="text-lg font-semibold text-[#2f5e4e]">{v}</div>
          <div className="text-[10px] text-[#858d86]">{l}</div>
        </div>
      ))}
    </div>
  );
}
function EventPanel({ events }: { events: SemanticEvent[] }) {
  return (
    <div className="h-full min-h-0 overflow-auto bg-white px-4 py-3 scrollbar">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Sparkles size={16} className="text-[#b16d34]" />
        课堂理解
      </div>
      {events.length ? (
        events.map((e) => (
          <article key={e.id} className="border-t border-[#e7e9e5] py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase text-[#a65f35]">
                {eventLabel(e.type)}
              </span>
              <span className="text-[10px] text-[#8b918c]">
                重要度 {e.importance}
              </span>
            </div>
            <h3 className="mt-1 text-sm font-semibold">{e.title}</h3>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#6c736d]">
              {e.content}
            </p>
          </article>
        ))
      ) : (
        <Empty
          title="等待语义事件"
          detail="重点、定义、纠正和任务会在这里归并。"
        />
      )}
    </div>
  );
}
function AskBox({ courseId }: { courseId: string }) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<string>();
  const mutation = useMutation({
    mutationFn: () => api.ask(courseId, q),
    onSuccess: (r) => setResult(r.answer),
  });
  return (
    <div className="border-t border-[#dfe3dc] bg-[#f4f6f2] p-4">
      {result && (
        <p className="mb-3 max-h-28 overflow-auto text-xs leading-5 text-[#4e574f] scrollbar">
          {result}
        </p>
      )}
      {mutation.error && (
        <p className="mb-2 text-xs text-[#9b4433]">
          {errorMessage(mutation.error)}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) mutation.mutate();
        }}
        className="flex gap-2"
      >
        <label className="sr-only" htmlFor="ask">
          向课堂提问
        </label>
        <input
          id="ask"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="问刚刚讲过的内容..."
          className="h-9 min-w-0 flex-1 rounded-[5px] border border-[#ced5cd] bg-white px-3 text-sm"
        />
        <button
          title="搜索课堂记录"
          disabled={mutation.isPending || !q.trim()}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[5px] bg-[#285f4e] text-white disabled:opacity-45"
        >
          <Search size={16} />
        </button>
      </form>
    </div>
  );
}
function KnowledgeView({ data }: { data: Dashboard }) {
  return (
    <div className="grid h-full min-h-[calc(100dvh-54px)] grid-rows-[64px_minmax(0,1fr)]">
      <header className="flex items-center justify-between border-b border-[#dfe3dc] bg-white px-6">
        <div>
          <h1 className="text-lg font-semibold">知识网络</h1>
          <p className="text-xs text-[#777f78]">
            {data.graph.nodes.length} 个概念 · {data.graph.edges.length} 条关系
          </p>
        </div>
        <div className="flex gap-4 text-xs text-[#687069]">
          <span className="flex items-center gap-2">
            <i className="h-2.5 w-2.5 rounded-full bg-[#2f765f]" />
            概念
          </span>
          <span className="flex items-center gap-2">
            <i className="h-2.5 w-2.5 rounded-full bg-[#c95f3f]" />
            主题
          </span>
          <span className="flex items-center gap-2">
            <i className="h-2.5 w-2.5 rounded-full bg-[#b7832f]" />
            任务
          </span>
        </div>
      </header>
      <Suspense fallback={<Loading />}>
        <GraphView nodes={data.graph.nodes} edges={data.graph.edges} />
      </Suspense>
    </div>
  );
}
function TasksView({ data }: { data: Dashboard }) {
  const [statusFilter, setStatusFilter] = useState<
    "all" | "open" | "done" | "dismissed"
  >("all");
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"deadline" | "importance" | "created">(
    "deadline",
  );
  const orderedSessions = [...data.sessions].sort(
    (a, b) => a.dayIndex - b.dayIndex,
  );
  const sessionMap = new Map(orderedSessions.map((s) => [s.id, s]));
  const filtered = data.tasks
    .filter((t) => (statusFilter === "all" ? true : t.status === statusFilter))
    .filter((t) =>
      sessionFilter === "all" ? true : t.sessionId === sessionFilter,
    )
    .sort((a, b) => {
      if (sortBy === "importance") return b.importance - a.importance;
      if (sortBy === "created") return 0;
      const da = a.deadlineResolved ?? "9999";
      const db = b.deadlineResolved ?? "9999";
      return da.localeCompare(db);
    });
  const openCount = data.tasks.filter((t) => t.status === "open").length;
  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">任务中心</h1>
          <p className="mt-1 text-sm text-[#747c75]">
            所有任务保留老师原话、解析日期和证据引用。
          </p>
        </div>
        <span className="text-sm font-semibold text-[#9b4e39]">
          {openCount} 项待完成
        </span>
      </header>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[6px] border border-[#dfe3dc] bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#59615b]">状态</span>
          <div className="flex rounded-[5px] border border-[#cfd5ce] bg-[#f3f5f1] p-0.5">
            {(
              [
                { id: "all" as const, label: "全部" },
                { id: "open" as const, label: "待办" },
                { id: "done" as const, label: "已完成" },
                { id: "dismissed" as const, label: "已忽略" },
              ]
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStatusFilter(s.id)}
                className={`h-7 px-2.5 text-[11px] font-semibold ${statusFilter === s.id ? "rounded-[4px] bg-white text-[#285f4e] shadow-sm" : "text-[#6b736c]"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#59615b]">课次</span>
          <select
            aria-label="按课次筛选"
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="h-8 rounded-[5px] border border-[#ccd3cb] bg-white px-2 text-xs font-medium"
          >
            <option value="all">全部课次</option>
            {orderedSessions.map((s) => (
              <option key={s.id} value={s.id}>
                第 {s.dayIndex} 课次 · {s.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#59615b]">排序</span>
          <select
            aria-label="排序方式"
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as "deadline" | "importance" | "created")
            }
            className="h-8 rounded-[5px] border border-[#ccd3cb] bg-white px-2 text-xs font-medium"
          >
            <option value="deadline">按截止日期</option>
            <option value="importance">按重要度</option>
            <option value="created">按创建时间</option>
          </select>
        </div>
        <span className="ml-auto text-[11px] text-[#858c86]">
          共 {filtered.length} 条
        </span>
      </div>
      <div className="divide-y divide-[#dfe3dc] border-y border-[#dfe3dc] bg-white">
        {filtered.length ? (
          filtered.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              sessionTitle={
                sessionMap.get(t.sessionId)?.title ??
                `第 ${sessionMap.get(t.sessionId)?.dayIndex ?? "?"} 课次`
              }
            />
          ))
        ) : (
          <Empty
            title={data.tasks.length ? "没有符合条件的任务" : "暂无课堂任务"}
            detail={
              data.tasks.length
                ? "尝试调整筛选条件。"
                : "识别到作业、实验或截止时间后会自动出现。"
            }
          />
        )}
      </div>
    </div>
  );
}
function TaskRow({
  task,
  sessionTitle,
}: {
  task: ClassroomTask;
  sessionTitle: string;
}) {
  const query = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [detail, setDetail] = useState(task.detail);
  const [deadlineRaw, setDeadlineRaw] = useState(task.deadlineRaw ?? "");
  const [importance, setImportance] = useState(task.importance);
  const [status, setStatus] = useState(task.status);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const toggleMutation = useMutation({
    mutationFn: () =>
      api.updateTask(task.id, task.status === "done" ? "open" : "done"),
    onSuccess: () => query.invalidateQueries({ queryKey: ["dashboard"] }),
    onError: (error) => alert(errorMessage(error)),
  });
  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateTaskFull(task.id, {
        title,
        detail,
        deadlineRaw: deadlineRaw || null,
        importance,
        status,
      }),
    onSuccess: () => {
      query.invalidateQueries({ queryKey: ["dashboard"] });
      setEditing(false);
    },
    onError: (error) => alert(errorMessage(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteTask(task.id),
    onSuccess: () => query.invalidateQueries({ queryKey: ["dashboard"] }),
    onError: (error) => {
      alert(errorMessage(error));
      setConfirmingDelete(false);
    },
  });
  const evidence = useQuery({
    queryKey: ["task-evidence", task.id],
    queryFn: () => api.taskEvidence(task.id),
    enabled: expanded && Boolean(task.evidenceEventId),
  });
  return (
    <article className="px-4">
      <div className="grid grid-cols-[40px_minmax(0,1fr)_auto_auto] items-start gap-3 py-4">
        <label
          title={task.status === "done" ? "恢复为待办" : "标记完成"}
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-[5px] hover:bg-[#edf2ed]"
        >
          <input
            type="checkbox"
            aria-label={`${task.status === "done" ? "恢复为待办" : "标记完成"}：${task.title}`}
            checked={task.status === "done"}
            disabled={toggleMutation.isPending}
            onChange={() => toggleMutation.mutate()}
            className="h-[18px] w-[18px] accent-[#34725d] disabled:opacity-40"
          />
        </label>
        <div className="min-w-0">
          <h3
            className={`text-sm font-semibold ${task.status === "done" ? "line-through text-[#858c86]" : ""}`}
          >
            {task.title}
          </h3>
          <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-[#858c86]">
            <span>{sessionTitle}</span>
            <span>置信度 {Math.round(task.confidence * 100)}%</span>
            <span>重要度 {task.importance}/10</span>
            {task.needsReview && (
              <span className="flex items-center gap-1 text-[#a35a3d]">
                <CircleAlert size={12} />
                需要确认日期
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-[#8c5c38]">
          <CalendarClock size={15} />
          {task.deadlineResolved
            ? new Date(task.deadlineResolved).toLocaleDateString("zh-CN")
            : (task.deadlineRaw ?? "未说明")}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "收起" : "展开详情、证据与编辑"}
          className="grid h-8 w-8 place-items-center rounded-[5px] text-[#59615b] hover:bg-[#edf2ed]"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-[#e7eae4] py-4">
          {editing ? (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#59615b]">
                  标题
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-9 w-full rounded-[5px] border border-[#ccd3cb] bg-white px-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#59615b]">
                  详情
                </span>
                <textarea
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-[5px] border border-[#ccd3cb] bg-white px-3 py-2 text-sm leading-6"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[#59615b]">
                    截止日期原话
                  </span>
                  <input
                    value={deadlineRaw}
                    onChange={(e) => setDeadlineRaw(e.target.value)}
                    placeholder="如：下周五前"
                    className="h-9 w-full rounded-[5px] border border-[#ccd3cb] bg-white px-3 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[#59615b]">
                    状态
                  </span>
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as ClassroomTask["status"])
                    }
                    className="h-9 w-full rounded-[5px] border border-[#ccd3cb] bg-white px-3 text-sm"
                  >
                    <option value="open">待办</option>
                    <option value="done">已完成</option>
                    <option value="dismissed">已忽略</option>
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#59615b]">
                  重要度：{importance}
                </span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={importance}
                  onChange={(e) => setImportance(Number(e.target.value))}
                  className="w-full accent-[#34725d]"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="flex h-9 flex-1 items-center justify-center gap-1 rounded-[5px] bg-[#285f4e] text-xs font-semibold text-white disabled:opacity-50"
                >
                  <Save size={13} />
                  {saveMutation.isPending ? "保存中" : "保存修改"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTitle(task.title);
                    setDetail(task.detail);
                    setDeadlineRaw(task.deadlineRaw ?? "");
                    setImportance(task.importance);
                    setStatus(task.status);
                    setEditing(false);
                  }}
                  className="flex h-9 flex-1 items-center justify-center rounded-[5px] border border-[#ccd3cb] text-xs font-semibold text-[#59615b]"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {task.detail && (
                <p className="text-sm leading-6 text-[#4e574f]">{task.detail}</p>
              )}
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#59615b]">
                  <FileText size={13} />
                  课堂证据
                </div>
                {evidence.isLoading ? (
                  <p className="text-xs text-[#8a918b]">正在加载证据...</p>
                ) : evidence.error ? (
                  <p className="text-xs text-[#9b4433]">
                    {errorMessage(evidence.error)}
                  </p>
                ) : evidence.data ? (
                  <div className="rounded-[5px] border border-[#e7eae4] bg-[#f6f8f4] px-3 py-2">
                    <div className="text-[10px] font-bold uppercase text-[#a65f35]">
                      {eventLabel(evidence.data.event.type)}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold">
                      {evidence.data.event.title}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#6c736d]">
                      {evidence.data.event.content}
                    </p>
                    {evidence.data.segments.length > 0 && (
                      <ul className="mt-2 space-y-1 border-l-2 border-[#dde1d8] pl-3">
                        {evidence.data.segments.map((s) => (
                          <li
                            key={s.id}
                            className="text-[11px] leading-5 text-[#5b625c]"
                          >
                            <span className="font-mono text-[#9aa09a]">
                              [{formatMs(s.startMs)}]
                            </span>{" "}
                            {s.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[#8a918b]">
                    此任务未关联具体证据事件。
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="flex h-8 items-center gap-1 rounded-[5px] border border-[#ccd3cb] px-3 text-xs font-semibold text-[#2f6754] hover:bg-[#f2f4f0]"
                >
                  <Pencil size={12} />
                  编辑任务
                </button>
                {confirmingDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#9b4433]">
                      确认删除？
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                      className="flex h-8 items-center gap-1 rounded-[5px] bg-[#a94536] px-3 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <Trash2 size={12} />
                      确认
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="flex h-8 items-center rounded-[5px] border border-[#ccd3cb] px-3 text-xs font-semibold text-[#59615b]"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="flex h-8 items-center gap-1 rounded-[5px] border border-[#e6b6ad] bg-[#fbf0ed] px-3 text-xs font-semibold text-[#9b4433] hover:bg-[#f6e4df]"
                  >
                    <Trash2 size={12} />
                    删除任务
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
function ReportsView({ data }: { data: Dashboard }) {
  const courseId =
    data.courses.find((c) => c.id === data.activeSession?.courseId)?.id ??
    data.courses[0]?.id;
  const [scope, setScope] = useState<"all" | "range">("all");
  const minDay = data.sessions.length
      ? Math.min(...data.sessions.map((session) => session.dayIndex))
      : 1,
    maxDay = data.sessions.length
      ? Math.max(...data.sessions.map((session) => session.dayIndex))
      : 1;
  const [startDay, setStartDay] = useState(minDay),
    [endDay, setEndDay] = useState(maxDay);
  const queryClient = useQueryClient();
  const reports = useQuery({
    queryKey: ["reports", courseId],
    queryFn: () => api.reports(courseId!),
    enabled: Boolean(courseId),
    refetchInterval: 3000,
  });
  const mutation = useMutation({
    mutationFn: () =>
      api.generateReport(
        courseId!,
        scope === "all" ? {} : { startDay, endDay },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["reports", courseId] }),
    onError: (error) => alert(errorMessage(error)),
  });
  const total = data.sessions.length,
    completed = data.stats.completedDays,
    progress = total ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <header className="mb-7">
        <h1 className="text-xl font-semibold">学习报告</h1>
        <p className="mt-1 text-sm text-[#747c75]">
          按全部课堂或指定课次范围生成可编辑、可追溯的综合报告。
        </p>
      </header>
      <section className="grid grid-cols-[minmax(0,1fr)_300px] gap-8 border-y border-[#dce0da] bg-white p-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#2f6754]">
            <Layers3 size={17} />
            综合学习报告
          </div>
          <h2 className="text-2xl font-semibold leading-tight">
            把已有课堂证据整理成一份可审核的学习报告
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#687069]">
            报告覆盖学习目标、逐次内容、核心知识、任务与实践、反思和总结。只纳入真实存在的课堂，不补写课次编号空缺，也不推断任务已经完成。
          </p>
          <button
            onClick={() => mutation.mutate()}
            disabled={
              !courseId ||
              !total ||
              mutation.isPending ||
              (scope === "range" && startDay > endDay)
            }
            className="mt-5 flex h-10 items-center gap-2 rounded-[6px] bg-[#285f4e] px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            <FileText size={16} />
            {mutation.isPending ? "正在生成..." : "生成综合报告"}
          </button>
        </div>
        <div className="border-l border-[#e0e4de] pl-6">
          <div className="text-xs font-semibold uppercase text-[#808880]">
            报告范围
          </div>
          <div className="mt-3 flex rounded-[6px] border border-[#cfd5ce] bg-[#f3f5f1] p-1">
            <button
              onClick={() => setScope("all")}
              className={`h-8 flex-1 text-xs font-semibold ${scope === "all" ? "rounded-[4px] bg-white text-[#285f4e] shadow-sm" : "text-[#6b736c]"}`}
            >
              全部课堂
            </button>
            <button
              onClick={() => setScope("range")}
              className={`h-8 flex-1 text-xs font-semibold ${scope === "range" ? "rounded-[4px] bg-white text-[#285f4e] shadow-sm" : "text-[#6b736c]"}`}
            >
              自定义范围
            </button>
          </div>
          {scope === "range" && (
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <input
                aria-label="起始课次"
                type="number"
                min={1}
                max={365}
                value={startDay}
                onChange={(event) => setStartDay(Number(event.target.value))}
                className="h-9 min-w-0 rounded-[5px] border border-[#ccd3cb] px-2 text-sm"
              />
              <span className="text-xs text-[#858c86]">至</span>
              <input
                aria-label="结束课次"
                type="number"
                min={1}
                max={365}
                value={endDay}
                onChange={(event) => setEndDay(Number(event.target.value))}
                className="h-9 min-w-0 rounded-[5px] border border-[#ccd3cb] px-2 text-sm"
              />
            </div>
          )}
          <div className="mt-5 text-3xl font-semibold text-[#2d6251]">
            {completed}
            <span className="text-base text-[#909790]"> / {total} 次完成</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e2e6e0]">
            <div
              className="h-full bg-[#3d8169]"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-[#7c847d]">
            当前课程共记录 {total} 次课堂，可随时生成阶段报告。
          </p>
        </div>
      </section>
      <section className="mt-7">
        <h2 className="mb-3 text-sm font-semibold">报告历史</h2>
        <div className="divide-y divide-[#dfe3dc] border-y border-[#dfe3dc] bg-white">
          {reports.data?.length ? (
            reports.data.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {report.title}
                  </div>
                  <div className="mt-1 text-xs text-[#858c86]">
                    {report.status === "completed"
                      ? "导出完成"
                      : report.status === "failed"
                        ? "生成失败"
                        : "后台处理中"}
                  </div>
                </div>
                {report.status === "completed" && courseId && (
                  <div className="flex shrink-0 gap-2">
                    <a
                      title="下载 Word 格式报告"
                      className="rounded-[5px] border border-[#cfd5ce] px-3 py-1.5 text-xs font-semibold hover:bg-[#f2f4f0]"
                      href={api.reportDownload(courseId, report.id, "docx")}
                    >
                      导出 Word
                    </a>
                    <a
                      title="下载 PDF 格式报告"
                      className="rounded-[5px] border border-[#cfd5ce] px-3 py-1.5 text-xs font-semibold hover:bg-[#f2f4f0]"
                      href={api.reportDownload(courseId, report.id, "pdf")}
                    >
                      导出 PDF
                    </a>
                  </div>
                )}
              </div>
            ))
          ) : (
            <Empty
              title="暂无报告"
              detail="生成后会在这里保留历史版本和导出文件。"
            />
          )}
        </div>
      </section>
    </div>
  );
}
function SettingsView() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["ai-settings"],
    queryFn: api.aiSettings,
  });
  type AiSettingsForm = {
    provider: AiSettings["provider"];
    chatModel: AiSettings["chatModel"];
    embeddingModel: AiSettings["embeddingModel"];
    baseUrl: AiSettings["baseUrl"];
    apiFormat: AiSettings["apiFormat"];
    apiKey: string;
  };
  const [form, setForm] = useState<AiSettingsForm>();
  useEffect(() => {
    if (settings.data && !form)
      setForm({
        provider: settings.data.provider,
        chatModel: settings.data.chatModel,
        embeddingModel: settings.data.embeddingModel,
        baseUrl: settings.data.baseUrl,
        apiFormat: settings.data.apiFormat ?? "openai-chat",
        apiKey: "",
      });
  }, [settings.data, form]);
  const models = useQuery({
    queryKey: ["ai-models", form?.provider, form?.baseUrl, form?.apiFormat],
    queryFn: () => api.aiModels(form!.provider),
    enabled: Boolean(form),
    retry: false,
  });
  const save = useMutation({
    mutationFn: () => api.saveAiSettings(form!),
    onSuccess: async (value) => {
      setForm({
        provider: value.provider,
        chatModel: value.chatModel,
        embeddingModel: value.embeddingModel,
        baseUrl: value.baseUrl,
        apiFormat: value.apiFormat ?? "openai-chat",
        apiKey: form!.apiKey,
      });
      await queryClient.invalidateQueries({ queryKey: ["ai-settings"] });
    },
  });
  const test = useMutation({
    mutationFn: async () => {
      await api.saveAiSettings(form!);
      return api.testAi();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["ai-settings"] }),
  });
  const reindex = useMutation({ mutationFn: api.reindexAi });
  if (settings.isLoading || !form) return <Loading />;
  if (settings.error)
    return <ErrorState message={errorMessage(settings.error)} />;
  const chatModels = modelOptions(
      models.data ?? [],
      "chat",
      form.chatModel,
      form.provider,
    ),
    embeddingModels = modelOptions(
      models.data ?? [],
      "embedding",
      form.embeddingModel,
      form.provider,
    );
  function provider(value: AiSettings["provider"]) {
    setForm((current) =>
      current
        ? {
            ...current,
            provider: value,
            chatModel:
              value === "openai"
                ? "gpt-5.6-luna"
                : value === "ollama"
                  ? "qwen2.5:7b"
                  : "mock:deterministic",
            embeddingModel:
              value === "openai"
                ? "local:BAAI/bge-small-zh-v1.5"
                : value === "ollama"
                  ? "nomic-embed-text"
                  : "mock:hash-64",
          }
        : current,
    );
    test.reset();
  }
  return (
    <div className="mx-auto max-w-4xl px-6 py-7">
      <header className="mb-7">
        <div className="flex items-center gap-2 text-[#2f6754]">
          <Cpu size={19} />
          <h1 className="text-xl font-semibold text-[#252b26]">模型与连接</h1>
        </div>
        <p className="mt-2 text-sm text-[#747c75]">
          对话模型与向量模型独立选择。密钥仅由本地服务读取，不会发送到桌面界面。
        </p>
      </header>
      <section className="border-y border-[#dce0da] bg-white">
        <SettingRow
          title="运行方式"
          detail="中转 API、本机 Ollama 或离线演示模式"
        >
          <div className="flex rounded-[6px] border border-[#cfd5ce] bg-[#f3f5f1] p-1">
            {(["openai", "ollama", "mock"] as const).map((value) => (
              <button
                key={value}
                onClick={() => provider(value)}
                className={`h-8 px-3 text-xs font-semibold ${form.provider === value ? "rounded-[4px] bg-white text-[#285f4e] shadow-sm" : "text-[#6b736c]"}`}
              >
                {value === "openai"
                  ? "中转 API"
                  : value === "ollama"
                    ? "Ollama"
                    : "离线演示"}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow
          title="对话与理解模型"
          detail="用于事件提取、课堂问答、摘要和综合报告"
        >
          <ModelSelect
            value={form.chatModel}
            models={chatModels}
            loading={models.isFetching}
            onChange={(chatModel) => setForm({ ...form, chatModel })}
          />
        </SettingRow>
        <SettingRow
          title="向量模型"
          detail="用于中文语义检索，可独立使用本地 BGE"
        >
          <ModelSelect
            value={form.embeddingModel}
            models={embeddingModels}
            loading={models.isFetching}
            onChange={(embeddingModel) => setForm({ ...form, embeddingModel })}
          />
        </SettingRow>
        <SettingRow
          title="连接地址"
          detail="中转 API 的基础地址，保存后立即生效；留空则恢复 .env 默认值"
        >
          <input
            type="text"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            placeholder="https://api.example.com/v1"
            className="h-10 w-[360px] max-w-full rounded-[5px] border border-[#ccd3cb] bg-white px-3 font-mono text-xs text-[#252b26] focus:border-[#285f4e] focus:outline-none"
          />
        </SettingRow>
        <SettingRow
          title="API 格式"
          detail="选择中转支持的请求格式；OpenAI Chat 兼容性最广，Responses 为新版接口，Claude 使用 Anthropic Messages 格式"
        >
          <div className="flex rounded-[6px] border border-[#cfd5ce] bg-[#f3f5f1] p-1">
            {(
              [
                { value: "openai-chat", label: "OpenAI Chat" },
                { value: "openai-responses", label: "OpenAI Responses" },
                { value: "claude", label: "Claude" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setForm({ ...form, apiFormat: option.value as ApiFormat });
                  test.reset();
                }}
                className={`h-8 px-3 text-xs font-semibold ${form.apiFormat === option.value ? "rounded-[4px] bg-white text-[#285f4e] shadow-sm" : "text-[#6b736c]"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow
          title="API Key"
          detail="中转 API 密钥，仅保存在本地数据库，不会在界面显示完整内容"
        >
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            placeholder="sk-..."
            className="h-10 w-[360px] max-w-full rounded-[5px] border border-[#ccd3cb] bg-white px-3 font-mono text-xs text-[#252b26] focus:border-[#285f4e] focus:outline-none"
          />
        </SettingRow>
      </section>
      {models.error && (
        <Notice tone="error">{errorMessage(models.error)}</Notice>
      )}
      {save.error && <Notice tone="error">{errorMessage(save.error)}</Notice>}
      {test.data && (
        <Notice tone={test.data.ok ? "success" : "error"}>
          {test.data.detail}
        </Notice>
      )}
      {test.error && <Notice tone="error">{errorMessage(test.error)}</Notice>}
      {reindex.data && (
        <Notice tone="success">
          已提交 {reindex.data.model} 的检索索引重建任务
        </Notice>
      )}
      {reindex.error && (
        <Notice tone="error">{errorMessage(reindex.error)}</Notice>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={() => reindex.mutate()}
          disabled={reindex.isPending}
          className="flex h-10 items-center gap-2 rounded-[6px] border border-[#cbd2ca] bg-white px-4 text-sm font-semibold disabled:opacity-50"
        >
          <Database size={16} />
          {reindex.isPending ? "提交中" : "重建索引"}
        </button>
        <button
          onClick={() => models.refetch()}
          disabled={models.isFetching}
          className="flex h-10 items-center gap-2 rounded-[6px] border border-[#cbd2ca] bg-white px-4 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={models.isFetching ? "animate-spin" : ""}
          />
          刷新模型
        </button>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || !form.chatModel || !form.embeddingModel}
          className="flex h-10 items-center gap-2 rounded-[6px] bg-[#285f4e] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Save size={16} />
          {save.isPending ? "保存中" : "保存选择"}
        </button>
        <button
          onClick={() => test.mutate()}
          disabled={test.isPending || save.isPending}
          className="flex h-10 items-center gap-2 rounded-[6px] bg-[#9a5438] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Activity size={16} />
          {test.isPending ? "测试中" : "保存并测试"}
        </button>
      </div>
    </div>
  );
}
function SettingRow({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(240px,1fr)_minmax(300px,1.2fr)] items-center gap-6 border-b border-[#e2e5e0] px-5 py-5 last:border-0">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-[#7b827c]">{detail}</p>
      </div>
      <div className="flex justify-end">{children}</div>
    </div>
  );
}
function ModelSelect({
  value,
  models,
  loading,
  onChange,
}: {
  value: string;
  models: string[];
  loading: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative w-[360px] max-w-full">
      <select
        aria-label="模型"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full appearance-none rounded-[5px] border border-[#ccd3cb] bg-white px-3 pr-9 text-sm"
        disabled={loading && !models.length}
      >
        {models.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
      {loading ? (
        <RefreshCw
          size={15}
          className="pointer-events-none absolute right-3 top-3 animate-spin text-[#737b74]"
        />
      ) : (
        <ChevronDown
          size={15}
          className="pointer-events-none absolute right-3 top-3 text-[#737b74]"
        />
      )}
    </div>
  );
}
function modelOptions(
  models: UpstreamModel[],
  kind: UpstreamModel["kind"],
  selected: string,
  provider: AiSettings["provider"],
): string[] {
  const values = models
    .filter(
      (model) =>
        model.kind === kind ||
        (kind === "chat" && model.kind === "unknown" && provider !== "openai"),
    )
    .map((model) => model.id);
  if (selected && !values.includes(selected)) values.unshift(selected);
  return values;
}
function Notice({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mt-4 border-l-2 px-4 py-3 text-sm ${tone === "success" ? "border-[#3b8067] bg-[#edf5f0] text-[#2c6854]" : "border-[#b2523e] bg-[#f8efec] text-[#94412f]"}`}
    >
      {children}
    </div>
  );
}
function CreateCourseModal({
  close,
  onCreated,
}: {
  close: () => void;
  onCreated: (id: string) => void;
}) {
  const query = useQueryClient();
  const mutation = useMutation({
    mutationFn: (body: object) => api.createCourse(body),
    onSuccess: async (value) => {
      await query.invalidateQueries({ queryKey: ["dashboard"] });
      onCreated(value.id);
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    mutation.mutate({
      name: f.get("name"),
      code: f.get("code") || undefined,
      instructor: f.get("instructor") || undefined,
    });
  }
  return (
    <Modal title="新建课程" close={close}>
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="课程名称"
          name="name"
          required
          placeholder="例如：数据库原理"
        />
        <Field label="课程编号" name="code" placeholder="可选" />
        <Field label="授课教师" name="instructor" placeholder="可选" />
        {mutation.error && (
          <Notice tone="error">{errorMessage(mutation.error)}</Notice>
        )}
        <Submit pending={mutation.isPending} label="创建课程" />
      </form>
    </Modal>
  );
}
function CreateSessionModal({
  courseId,
  nextDay,
  onCreated,
  close,
}: {
  courseId: string;
  nextDay: number;
  onCreated: (id: string) => void;
  close: () => void;
}) {
  const query = useQueryClient();
  const defaultTitle = `第 ${nextDay} 课次`;
  const today = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const mutation = useMutation({
    mutationFn: (body: object) => api.createSession(body),
    onSuccess: async (session) => {
      await query.invalidateQueries({ queryKey: ["dashboard"] });
      onCreated(session.id);
      close();
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    mutation.mutate({
      courseId,
      title: f.get("title"),
      dayIndex: Number(f.get("dayIndex")),
    });
  }
  return (
    <Modal title="新建课堂" close={close}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-[5px] border border-[#e0e4de] bg-[#f6f8f4] px-3 py-2 text-xs text-[#59615b]">
          <span className="font-semibold text-[#2f6754]">今日：</span>
          {today}
        </div>
        <Field
          label="课堂标题"
          name="title"
          required
          defaultValue={defaultTitle}
          placeholder="如：索引与 B+Tree（可留空使用默认）"
        />
        <Field
          label="课次编号（第几天）"
          name="dayIndex"
          type="number"
          defaultValue={nextDay}
        />
        {mutation.error && (
          <Notice tone="error">{errorMessage(mutation.error)}</Notice>
        )}
        <Submit pending={mutation.isPending} label="创建课堂" />
      </form>
    </Modal>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1f2621]/30 p-4">
      <section
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-[8px] border border-[#d8ddd6] bg-white p-5 shadow-2xl"
      >
        <header className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            title="关闭"
            onClick={close}
            className="grid h-8 w-8 place-items-center rounded-[5px] hover:bg-[#eff1ed]"
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Field({
  label,
  name,
  type = "text",
  ...props
}: {
  label: string;
  name: string;
  type?: string;
  [key: string]: unknown;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        {...props}
        className="h-10 w-full rounded-[5px] border border-[#ccd3cb] bg-white px-3 text-sm"
      />
    </label>
  );
}
function Submit({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      disabled={pending}
      className="flex h-10 w-full items-center justify-center gap-2 rounded-[6px] bg-[#285f4e] text-sm font-semibold text-white disabled:opacity-50"
    >
      {pending ? <TimerReset size={16} /> : <Plus size={16} />} {label}
    </button>
  );
}
function Welcome({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid min-h-[calc(100dvh-54px)] place-items-center px-6">
      <div className="max-w-lg text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-[8px] bg-[#dce8df] text-[#285f4e]">
          <BookOpen size={30} />
        </div>
        <h1 className="mt-6 text-2xl font-semibold">建立第一门课程</h1>
        <p className="mt-2 text-sm leading-7 text-[#707871]">
          课程是字幕、知识图谱、任务和综合报告的长期容器。创建后即可开始系统音频采集。
        </p>
        <button
          onClick={onCreate}
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-[6px] bg-[#285f4e] px-4 text-sm font-semibold text-white"
        >
          <Plus size={17} />
          新建课程
        </button>
      </div>
    </div>
  );
}
function Loading() {
  return (
    <div className="space-y-3 p-6" aria-label="加载中">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-20 animate-pulse rounded-[6px] bg-[#e3e6e1]"
        />
      ))}
    </div>
  );
}
function ErrorState({ message }: { message: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <CircleAlert className="mx-auto text-[#ad533f]" />
        <p className="mt-3 font-semibold">无法载入工作台</p>
        <p className="mt-1 text-sm text-[#747c75]">{message}</p>
      </div>
    </div>
  );
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="grid min-h-36 place-items-center px-4 text-center">
      <div>
        <p className="text-sm font-medium text-[#5f675f]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[#8a918b]">{detail}</p>
      </div>
    </div>
  );
}
function eventLabel(type: SemanticEvent["type"]): string {
  return {
    KEYPOINT: "重点",
    DEFINITION: "定义",
    EXAMPLE: "例子",
    EMPHASIS: "强调",
    TASK: "任务",
    HOMEWORK: "作业",
    EXAM: "考试",
    DEADLINE: "截止",
    TOPIC_CHANGE: "主题",
    QUESTION: "问题",
    CORRECTION: "纠正",
  }[type];
}
function formatMs(ms: number): string {
  const t = Math.floor(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
