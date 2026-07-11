# Classmate 桌面版

个人 AI 实时课堂助手桌面端，基于 Electron + React，自动管理内置本地服务，提供 WASAPI 系统音频采集、实时字幕、课堂事件抽取、知识图谱、混合检索、分层摘要、综合报告和 Word/PDF 导出。

## 功能概览

- **系统音频采集**：通过 WASAPI Loopback 捕获电脑播放音频，不依赖麦克风或外放。
- **实时字幕**：VAD 动态分段，本地 faster-whisper ASR，带时间戳且不可变的原始字幕。
- **课堂事件**：自动抽取重点、定义、例子、纠正、作业、考试、任务和截止日期，每条事件可回溯到字幕证据。
- **知识图谱**：实体归一化、关系去重、置信度标注，力导向图可视化，支持搜索、筛选、编辑定义和删除节点。
- **混合检索**：中文词法检索与向量检索融合，返回证据和课堂时间点。
- **课堂问答**：有证据约束的问答，证据不足时明确拒答。
- **分层摘要**：课次增量摘要，支持重新生成，Markdown 渲染。
- **综合报告**：按课程或日期范围生成，支持单日、周报、课程总结、实训报告和自定义范围；十天实训为快捷预设。
- **导出**：Word（DOCX）与 PDF 导出，报告可编辑、可阅读、可追溯。
- **多 API 格式**：支持 OpenAI Chat Completions、OpenAI Responses API 和 Claude（Anthropic Messages）三种请求格式。
- **悬浮窗**：始终置顶的课堂悬浮窗，可拖动、收起、隐藏，支持开始/停止采集。
- **零部署**：Electron 自动启动和关闭内置回环服务，数据保存在本机。

## 技术栈

| 层级 | 技术 |
|------|------|
| 主进程 | Electron 36、Node.js 22 |
| 渲染进程 | React 19、TanStack Query 5、Tailwind CSS 4 |
| 构建工具 | electron-vite 3、Vite 6、esbuild |
| 图谱可视化 | react-force-graph-2d |
| Markdown 渲染 | react-markdown 10 |
| 图标 | lucide-react |
| 内置服务 | Fastify（自动拉起，监听 127.0.0.1） |
| 共享类型 | packages/shared（Zod Schema） |

## 目录结构

```
apps/desktop/
├── src/
│   ├── main/
│   │   └── index.ts          # Electron 主进程：窗口管理、内置服务生命周期、托盘、悬浮窗
│   ├── preload/
│   │   └── index.ts          # preload 脚本：受限 IPC 桥接
│   └── renderer/
│       ├── src.tsx           # 渲染进程入口
│       ├── desktop.d.ts      # 全局类型声明
│       ├── hooks/
│       │   └── useDashboard.ts  # Dashboard 数据 + SSE + 服务/AI 健康状态
│       ├── lib/
│       │   └── api.ts        # 本地 HTTP API 客户端
│       └── ui/
│           ├── App.tsx       # 主界面：Live/Review/Graph/Tasks/Report/Settings 视图
│           ├── GraphView.tsx # 知识图谱力导向图 + 节点侧栏
│           └── OverlayApp.tsx # 悬浮窗界面
├── build/
│   └── icon.ico              # 应用图标
├── electron.vite.config.ts   # electron-vite 配置
├── package.json
└── tsconfig.json
```

## 环境要求

- Node.js 20+
- Python 3.11+（ASR/Embedding/PDF Worker）
- .NET 8 SDK（音频采集器与 DOCX 导出器）
- FFmpeg
- Windows 10/11（WASAPI 系统音频采集需要 Windows）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在项目根目录复制 `.env.example` 为 `.env`，填入中转 API 信息：

```bash
cp .env.example .env
```

关键配置项：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AI_PROVIDER` | AI 提供方：`openai`/`ollama`/`mock` | `ollama` |
| `OPENAI_BASE_URL` | 中转 API 基础地址 | `https://api.openai.com/v1` |
| `OPENAI_API_FORMAT` | API 请求格式：`openai-chat`/`openai-responses`/`claude` | `openai-chat` |
| `OPENAI_API_KEY` | 中转 API 密钥（仅本地服务读取，不暴露到界面） | — |
| `OPENAI_CHAT_MODEL` | 默认聊天模型 | — |
| `OPENAI_EMBED_MODEL` | 向量模型，支持 `local:BAAI/bge-small-zh-v1.5` | `local:BAAI/bge-small-zh-v1.5` |
| `WHISPER_MODEL` | Whisper ASR 模型 | `large-v3-turbo` |

### 3. 构建辅助工具

```bash
dotnet build tools/audio-capture -c Release
dotnet build tools/report-export -c Release
```

### 4. 安装 Python 依赖

```bash
python -m pip install -r services/ai-worker/requirements.txt
```

### 5. 数据库迁移

```bash
npm run db:migrate
```

### 6. 启动开发模式

```bash
npm run dev
```

Electron 将自动启动内置本地服务（监听 `127.0.0.1:4317`），主窗口和悬浮窗同时可用。

### 7. 打包发布

```bash
npm run dist:win
```

生成 NSIS 安装包到 `release/` 目录。

## API 格式选择

桌面端支持三种上游 API 请求格式，可在「设置 → 模型与连接」页面切换：

| 格式 | 说明 | 适用场景 |
|------|------|----------|
| **OpenAI Chat** | 标准 `/v1/chat/completions` 接口 | 兼容性最广，大多数中转均支持 |
| **OpenAI Responses** | 新版 `/v1/responses` 接口 | 上游支持 Responses API 的中转 |
| **Claude** | Anthropic Messages 格式 `/v1/messages` | 使用 Claude 模型或支持 Anthropic 格式的中转 |

切换格式后保存即可生效，无需重启。连接地址也可在界面中直接编辑，保存后立即使用新地址获取模型列表和发起请求。

## 架构要点

- **服务生命周期**：Electron 主进程在 dev 模式用 `tsx watch` 拉起内置服务，打包后用 `server/index.cjs`。退出时仅关闭自己启动的服务。
- **安全边界**：渲染进程不访问 Node API、文件系统或进程；仅通过受限 preload IPC 和本地 HTTP API 通信。API Key 仅由本地服务读取，不在界面显示或保存。
- **数据不变量**：`transcript_segments` 是事实源，已落库字幕不被派生处理覆盖。事件、知识节点、摘要、报告均为可重新生成的派生数据。
- **三态健康指示**：顶栏分离显示服务进程状态、SSE 连接状态和 AI 上游健康状态。
- **回环绑定**：服务只监听 `127.0.0.1`，CORS 使用显式来源，不允许通配符。

## 常用命令

```bash
# 开发
npm run dev -w @classmate/desktop

# 类型检查
npm run typecheck -w @classmate/desktop

# 构建
npm run build -w @classmate/desktop

# 打包 Windows 安装包
npm run dist:win -w @classmate/desktop

# 运行测试
npm run test -w @classmate/desktop

# 内置服务单独打包（供 electron-builder 使用）
npm run bundle:service -w @classmate/desktop
```

## 隐私与安全

- API Key 仅保存在本地 `.env` 或系统环境变量中，由服务端进程读取，桌面界面不读取、不显示、不保存密钥。
- 原始音频和字幕保存在本机 `data/` 目录，不自动上传。
- 第三方中转只接触用户主动发送的字幕文本、问题和报告上下文。
- 导出文件默认写入用户明确可访问的本地 `output/` 目录。
- `.env` 已被 `.gitignore` 排除，不会进入版本控制。
