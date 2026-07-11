import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import {
  AlertTriangle,
  Database,
  FileText,
  ListTodo,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type {
  KnowledgeEdge,
  KnowledgeNode,
  SemanticEvent,
  TranscriptSegment,
} from "@classmate/shared";
import { api, errorMessage } from "../lib/api";

type Node = KnowledgeNode & { x?: number; y?: number };
type Link = KnowledgeEdge & { source: string | Node; target: string | Node };
type KindFilter = "all" | KnowledgeNode["kind"];
type SideTab = "definition" | "evidence" | "tasks" | "actions";

const KIND_LABEL: Record<KnowledgeNode["kind"], string> = {
  concept: "概念",
  topic: "主题",
  task: "任务",
  person: "人物",
  resource: "资源",
};

export function GraphView({
  nodes,
  edges,
}: {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}) {
  const ref = useRef<ForceGraphMethods<Node, Link> | undefined>(undefined);
  const [selected, setSelected] = useState<Node | null>(null);
  const [keyword, setKeyword] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

  const filteredNodes = useMemo(() => {
    const lower = keyword.trim().toLowerCase();
    return nodes.filter((n) => {
      if (kindFilter !== "all" && n.kind !== kindFilter) return false;
      if (!lower) return true;
      return (
        n.canonicalName.toLowerCase().includes(lower) ||
        (n.definition ?? "").toLowerCase().includes(lower)
      );
    });
  }, [nodes, keyword, kindFilter]);

  const visibleIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.id)),
    [filteredNodes],
  );
  const filteredEdges = useMemo(
    () =>
      edges.filter(
        (e) => visibleIds.has(e.sourceId) && visibleIds.has(e.targetId),
      ),
    [edges, visibleIds],
  );

  useEffect(() => {
    const timer = setTimeout(() => ref.current?.zoomToFit(500, 50), 300);
    return () => clearTimeout(timer);
  }, [filteredNodes.length]);

  useEffect(() => {
    if (selected && !visibleIds.has(selected.id)) setSelected(null);
  }, [selected, visibleIds]);

  const draw = useCallback(
    (node: Node, ctx: CanvasRenderingContext2D, scale: number) => {
      const r = 4 + node.importance * 0.45;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, Math.PI * 2);
      ctx.fillStyle =
        node.kind === "topic"
          ? "#c95f3f"
          : node.kind === "task"
            ? "#b7832f"
            : "#2f765f";
      ctx.fill();
      if (scale > 1.25 || node.importance >= 8) {
        ctx.font = `${Math.max(10, 12 / scale)}px Microsoft YaHei UI`;
        ctx.fillStyle = "#282d29";
        ctx.fillText(
          node.canonicalName,
          (node.x ?? 0) + r + 3,
          (node.y ?? 0) + 4 / scale,
        );
      }
    },
    [],
  );

  if (!nodes.length) return <EmptyGraph />;

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden bg-[#eef0eb]">
      <div className="absolute left-4 top-4 z-10 flex w-[min(520px,calc(100%-32px))] items-center gap-2 rounded-[6px] border border-[#d5d9d3] bg-white px-3 py-2 shadow-sm">
        <Search size={15} className="shrink-0 text-[#737b74]" />
        <input
          aria-label="搜索概念"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="按名称或定义搜索..."
          className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {keyword && (
          <button
            type="button"
            title="清除搜索"
            onClick={() => setKeyword("")}
            className="grid h-6 w-6 place-items-center rounded text-[#737b74] hover:bg-[#eef1ec]"
          >
            <X size={13} />
          </button>
        )}
        <select
          aria-label="类型筛选"
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as KindFilter)}
          className="h-7 shrink-0 rounded-[4px] border border-[#ccd3cb] bg-white px-2 text-xs font-medium"
        >
          <option value="all">全部类型</option>
          {(Object.keys(KIND_LABEL) as KnowledgeNode["kind"][]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <button
          type="button"
          title="重置视图"
          onClick={() => ref.current?.zoomToFit(500, 50)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[4px] border border-[#ccd3cb] bg-white text-[#59615b] hover:bg-[#f2f4f0]"
        >
          <RefreshCw size={13} />
        </button>
      </div>
      <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-[5px] border border-[#d5d9d3] bg-white/90 px-3 py-1.5 text-[11px] text-[#6a716b] shadow-sm">
        显示 {filteredNodes.length} / {nodes.length} 个节点 ·{" "}
        {filteredEdges.length} 条关系
      </div>
      <ForceGraph2D
        ref={ref}
        graphData={{
          nodes: filteredNodes as Node[],
          links: filteredEdges.map((e) => ({
            ...e,
            source: e.sourceId,
            target: e.targetId,
          })) as Link[],
        }}
        nodeCanvasObject={draw}
        nodePointerAreaPaint={(n, c, ctx) => {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, 10, 0, Math.PI * 2);
          ctx.fill();
        }}
        linkColor={() => "#aeb5ad"}
        linkWidth={(link) => 1 + link.weight}
        linkDirectionalParticles={1}
        linkDirectionalParticleWidth={1.5}
        cooldownTicks={80}
        onNodeClick={(n) => setSelected(n as Node)}
      />
      {selected && (
        <NodeSidePanel node={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function NodeSidePanel({
  node,
  onClose,
}: {
  node: KnowledgeNode;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SideTab>("definition");
  return (
    <aside className="absolute bottom-4 right-4 top-16 z-10 flex w-80 flex-col overflow-hidden rounded-[6px] border border-[#d5d9d3] bg-white shadow-lg">
      <header className="flex items-start justify-between gap-2 border-b border-[#e7eae4] px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase text-[#778078]">
            {KIND_LABEL[node.kind]}
          </div>
          <h3 className="mt-0.5 truncate text-base font-semibold">
            {node.canonicalName}
          </h3>
          <div className="mt-1 text-[11px] text-[#778078]">
            重要度 {node.importance}/10 · {node.evidenceCount} 条证据
          </div>
        </div>
        <button
          type="button"
          title="关闭"
          onClick={onClose}
          className="grid h-7 w-7 shrink-0 place-items-center rounded text-[#737b74] hover:bg-[#eef1ec]"
        >
          <X size={14} />
        </button>
      </header>
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[#e7eae4] px-2">
        {(
          [
            { id: "definition" as const, label: "定义", icon: Pencil },
            { id: "evidence" as const, label: "证据", icon: FileText },
            { id: "tasks" as const, label: "关联任务", icon: ListTodo },
            { id: "actions" as const, label: "操作", icon: Database },
          ]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex h-7 flex-1 items-center justify-center gap-1 rounded-[4px] text-[11px] font-semibold ${tab === t.id ? "bg-[#edf3ee] text-[#245a49]" : "text-[#6b736c] hover:bg-[#f3f5f1]"}`}
          >
            <t.icon size={12} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto scrollbar">
        {tab === "definition" ? (
          <DefinitionTab node={node} />
        ) : tab === "evidence" ? (
          <EvidenceTab nodeId={node.id} />
        ) : tab === "tasks" ? (
          <TasksTab nodeId={node.id} />
        ) : (
          <ActionsTab node={node} onClose={onClose} />
        )}
      </div>
    </aside>
  );
}

function DefinitionTab({ node }: { node: KnowledgeNode }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [definition, setDefinition] = useState(node.definition ?? "");
  const [importance, setImportance] = useState(node.importance);
  const mutation = useMutation({
    mutationFn: () => api.updateNode(node.id, { definition, importance }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setEditing(false);
    },
    onError: (e) => alert(errorMessage(e)),
  });
  if (editing) {
    return (
      <div className="space-y-3 px-4 py-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#59615b]">
            定义
          </span>
          <textarea
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            rows={5}
            className="w-full resize-none rounded-[5px] border border-[#ccd3cb] bg-white px-3 py-2 text-sm leading-6"
          />
        </label>
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
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex h-8 flex-1 items-center justify-center gap-1 rounded-[5px] bg-[#285f4e] text-xs font-semibold text-white disabled:opacity-50"
          >
            保存
          </button>
          <button
            type="button"
            onClick={() => {
              setDefinition(node.definition ?? "");
              setImportance(node.importance);
              setEditing(false);
            }}
            className="flex h-8 flex-1 items-center justify-center rounded-[5px] border border-[#ccd3cb] text-xs font-semibold text-[#59615b]"
          >
            取消
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="px-4 py-3">
      <p className="whitespace-pre-wrap text-sm leading-6 text-[#4a524c]">
        {node.definition || "尚无稳定定义，等待更多课堂证据。"}
      </p>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-3 flex h-8 items-center gap-1 rounded-[5px] border border-[#ccd3cb] px-3 text-xs font-semibold text-[#2f6754] hover:bg-[#f2f4f0]"
      >
        <Pencil size={12} />
        编辑定义与重要度
      </button>
    </div>
  );
}

function EvidenceTab({ nodeId }: { nodeId: string }) {
  const query = useQuery({
    queryKey: ["node-evidence", nodeId],
    queryFn: () => api.nodeEvidence(nodeId),
  });
  if (query.isLoading)
    return <PanelHint text="正在加载证据..." />;
  if (query.error)
    return <PanelHint text={errorMessage(query.error)} tone="error" />;
  if (!query.data?.length)
    return <PanelHint text="暂无直接关联的证据事件。" />;
  return (
    <div className="divide-y divide-[#e9ebe5]">
      {query.data.map(({ event, segments }) => (
        <article key={event.id} className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase text-[#a65f35]">
              {eventLabel(event.type)}
            </span>
            <span className="text-[10px] text-[#8b918c]">
              重要度 {event.importance}
            </span>
          </div>
          <h4 className="mt-1 text-sm font-semibold">{event.title}</h4>
          <p className="mt-1 text-xs leading-5 text-[#6c736d]">
            {event.content}
          </p>
          {segments.length > 0 && (
            <ul className="mt-2 space-y-1 border-l-2 border-[#dde1d8] pl-3">
              {segments.map((s) => (
                <li key={s.id} className="text-[11px] leading-5 text-[#5b625c]">
                  <span className="font-mono text-[#9aa09a]">
                    [{formatMs(s.startMs)}]
                  </span>{" "}
                  {s.text}
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

function TasksTab({ nodeId }: { nodeId: string }) {
  const query = useQuery({
    queryKey: ["node-tasks", nodeId],
    queryFn: () => api.nodeTasks(nodeId),
  });
  if (query.isLoading) return <PanelHint text="正在加载关联任务..." />;
  if (query.error)
    return <PanelHint text={errorMessage(query.error)} tone="error" />;
  if (!query.data?.length)
    return <PanelHint text="暂无名称匹配此节点的任务。" />;
  return (
    <ul className="divide-y divide-[#e9ebe5]">
      {query.data.map((t) => (
        <li key={t.id} className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-[10px] font-bold uppercase ${t.status === "done" ? "text-[#3b8067]" : t.status === "dismissed" ? "text-[#9aa09a]" : "text-[#a65f35]"}`}
            >
              {t.status === "done"
                ? "已完成"
                : t.status === "dismissed"
                  ? "已忽略"
                  : "待办"}
            </span>
            <span className="text-[10px] text-[#8b918c]">
              重要度 {t.importance}
            </span>
          </div>
          <h4 className="mt-1 text-sm font-semibold">{t.title}</h4>
          {t.detail && (
            <p className="mt-1 text-xs leading-5 text-[#6c736d]">{t.detail}</p>
          )}
          {t.deadlineResolved && (
            <div className="mt-1 text-[11px] text-[#8c5c38]">
              截止 {new Date(t.deadlineResolved).toLocaleDateString("zh-CN")}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function ActionsTab({
  node,
  onClose,
}: {
  node: KnowledgeNode;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const mutation = useMutation({
    mutationFn: () => api.deleteNode(node.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (e) => {
      alert(errorMessage(e));
      setConfirming(false);
    },
  });
  return (
    <div className="space-y-4 px-4 py-4">
      <div className="rounded-[5px] border border-[#e7eae4] bg-[#f6f8f4] px-3 py-2 text-xs leading-5 text-[#59615b]">
        删除节点会同时删除所有连接到此节点的边。节点删除后不可恢复，但课堂证据（事件与字幕）保留。
      </div>
      {confirming ? (
        <div className="space-y-2 rounded-[5px] border border-[#e6b6ad] bg-[#fbf0ed] px-3 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#9b4433]">
            <AlertTriangle size={14} />
            确认删除"{node.canonicalName}"？
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="flex h-8 flex-1 items-center justify-center gap-1 rounded-[5px] bg-[#a94536] text-xs font-semibold text-white disabled:opacity-50"
            >
              <Trash2 size={12} />
              {mutation.isPending ? "删除中" : "确认删除"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex h-8 flex-1 items-center justify-center rounded-[5px] border border-[#ccd3cb] text-xs font-semibold text-[#59615b]"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-[5px] border border-[#e6b6ad] bg-[#fbf0ed] text-xs font-semibold text-[#9b4433] hover:bg-[#f6e4df]"
        >
          <Trash2 size={13} />
          删除此节点
        </button>
      )}
    </div>
  );
}

function PanelHint({
  text,
  tone = "muted",
}: {
  text: string;
  tone?: "muted" | "error";
}) {
  return (
    <div className="grid place-items-center px-4 py-8 text-center">
      <p
        className={`text-xs ${tone === "error" ? "text-[#9b4433]" : "text-[#8a918b]"}`}
      >
        {text}
      </p>
    </div>
  );
}

function EmptyGraph() {
  return (
    <div className="grid h-full min-h-[420px] place-items-center bg-[#eef0eb] text-center">
      <div>
        <div className="mx-auto mb-3 h-12 w-12 rounded-full border border-dashed border-[#96a099]" />
        <p className="font-medium">知识网络尚未形成</p>
        <p className="mt-1 text-sm text-[#747b75]">
          录制或导入课堂内容后，概念与关系会在这里出现。
        </p>
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
