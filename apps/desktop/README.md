# Classmate 桌面版

个人 AI 实时课堂助手桌面端，基于 Electron + React，自动管理内置本地服务，提供 WASAPI 系统音频采集、实时字幕、课堂事件抽取、知识图谱、混合检索、分层摘要、综合报告和 Word/PDF 导出。

## 🎯 产品定位

Classmate 不是简单的"录音加总结"工具，而是面向个人学习者的**课堂知识整理系统**。它围绕以下核心原则设计：

- **证据优先**：所有 AI 提取的结论必须可回溯到原始字幕时间戳，不允许凭空生成
- **增量演进**：从音频 → 字幕 → 事件 → 知识图谱 → 摘要 → 报告，形成完整的资料链
- **本地优先**：数据保存在本机，关键处理（ASR、Embedding）可选本地模型，不依赖云端
- **零部署**：一键启动，Electron 自动管理内置服务生命周期

## ✨ 功能概览

### 课堂采集与转录

- **系统音频采集**：通过 WASAPI Loopback 捕获电脑播放音频，不依赖麦克风或外放，不干扰他人
- **VAD 动态分段**：语音活动检测自动分割音频，避免长段连续处理
- **本地 faster-whisper ASR**：支持 `large-v3-turbo`、`medium` 等多种模型，离线可用
- **不可变字幕**：`transcript_segments` 作为事实源，已落库字幕不被派生处理覆盖或删除
- **纠错保留**：支持字幕纠错，但原始版本始终可查

### 课堂事件抽取

- **智能识别**：自动从字幕中抽取以下类型的课堂事件：
  - `KEYPOINT` - 重点
  - `DEFINITION` - 定义
  - `EXAMPLE` - 例子
  - `EMPHASIS` - 强调
  - `TASK` - 任务
  - `HOMEWORK` - 作业
  - `EXAM` - 考试
  - `DEADLINE` - 截止日期
  - `TOPIC_CHANGE` - 主题切换
  - `QUESTION` - 问题
  - `CORRECTION` - 纠正
- **证据绑定**：每条事件至少引用一个真实字幕 ID、时间范围和原文短句
- **置信度标注**：自动标注识别置信度，低置信度内容标记为需复审

### 知识图谱

- **实体归一化**：自动归并同义概念，避免重复节点
- **关系去重**：识别并合并重复关系，保持图谱整洁
- **力导向图可视化**：使用 `react-force-graph-2d` 展示节点与关系
- **节点类型**：支持 `concept`（概念）、`topic`（主题）、`task`（任务）、`person`（人物）、`resource`（资源）
- **交互式编辑**：支持搜索、筛选、编辑定义、调整重要度、删除节点

### 混合检索

- **中文词法检索**：基于 SQLite FTS 的关键词匹配
- **向量检索**：使用 BGE 等模型生成语义向量，支持语义相似搜索
- **融合排序**：综合词法匹配度和语义相似度，返回最优结果
- **证据追溯**：检索结果附带字幕时间点，可跳转到原始字幕位置

### 课堂问答

- **有证据约束**：问答结果必须基于课堂记录，证据不足时明确拒答
- **通用知识补充**：允许补充通用知识，但必须与课堂原话分开标识
- **多轮对话**：支持上下文保持的连续问答

### 分层摘要

- **课次增量摘要**：每节课结束后自动生成增量摘要
- **支持重新生成**：可手动触发重新生成摘要，优化结果
- **Markdown 渲染**：使用 `react-markdown` 渲染富文本摘要

### 综合报告

- **灵活范围**：支持按单日、周报、课程总结、实训报告和自定义日期范围生成
- **十天实训预设**：提供十天实训报告快捷模板，但不强制固定周期
- **质量门槛**：七天以上报告正文不少于 2000 中文字符，目标约 3000 字
- **报告结构**：包含学习目标、环境与方法、逐次学习内容、核心知识体系、任务与实践、学习反思、总结

### 导出功能

- **Word（DOCX）导出**：使用 OpenXML SDK 生成，包含命名样式、标题层级、A4 页面、页眉页脚和页码
- **PDF 导出**：通过 Python Worker 生成，确保中文字体、分页正确
- **可追溯性**：导出文档中的引用可追溯到课堂时间点

### API 格式支持

- **OpenAI Chat Completions**：标准 `/v1/chat/completions` 接口，兼容性最广
- **OpenAI Responses API**：新版 `/v1/responses` 接口
- **Claude（Anthropic Messages）**：使用 `/v1/messages` 格式，支持 Claude 模型

### 悬浮窗

- **始终置顶**：独立于主窗口，始终显示在最上层
- **可拖动**：支持自由拖动定位
- **收起/展开**：支持紧凑模式和展开模式
- **快捷操作**：可开始/停止采集，查看当前状态

## 🛠️ 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 主进程 | Electron | 36+ |
| 主进程 | Node.js | 22+ |
| 渲染进程 | React | 19.2.3 |
| 状态管理 | TanStack Query | 5.x |
| 样式 | Tailwind CSS | 4.x |
| 构建工具 | electron-vite | 3.x |
| 构建工具 | Vite | 6.x |
| 服务端打包 | esbuild | 0.25.x |
| 图谱可视化 | react-force-graph-2d | 1.27.x |
| Markdown 渲染 | react-markdown | 10.x |
| 图标 | lucide-react | 0.515.x |
| 内置服务 | Fastify | - |
| 数据库 | SQLite（better-sqlite3） | - |
| 共享类型 | Zod | - |

## 📁 项目结构

```
.
├── apps/
│   ├── desktop/              # Electron 桌面端
│   │   ├── src/
│   │   │   ├── main/
│   │   │   │   └── index.ts     # 主进程：窗口管理、服务生命周期、托盘、悬浮窗
│   │   │   ├── preload/
│   │   │   │   └── index.ts     # preload 脚本：受限 IPC 桥接
│   │   │   └── renderer/
│   │   │       ├── src.tsx      # 渲染进程入口
│   │   │       ├── desktop.d.ts  # 全局类型声明
│   │   │       ├── hooks/
│   │   │       │   └── useDashboard.ts  # Dashboard 数据 + SSE + 健康状态
│   │   │       ├── lib/
│   │   │       │   └── api.ts   # 本地 HTTP API 客户端
│   │   │       └── ui/
│   │   │           ├── App.tsx           # 主界面：所有视图容器
│   │   │           ├── GraphView.tsx     # 知识图谱力导向图 + 节点侧栏
│   │   │           └── OverlayApp.tsx    # 悬浮窗界面
│   │   ├── build/icon.ico       # 应用图标
│   │   ├── electron.vite.config.ts
│   │   └── package.json
│   └── server/               # Fastify 内置服务端
│       ├── src/
│       │   ├── ai/                # AI 服务：Provider、Settings、Local Embedding
│       │   ├── capture/           # 音频采集：ASR、Capture Service
│       │   ├── classroom/         # 课堂数据：Transcript Service/Repository
│       │   ├── courses/           # 课程管理：Course Service/Repository
│       │   ├── dashboard/         # 仪表盘：Dashboard Repository/Routes
│       │   ├── jobs/              # 后台任务：Job Repository/Runner
│       │   ├── knowledge/         # 知识图谱：Semantic、Retrieval、Deadline
│       │   ├── reports/           # 报告生成：Report Service/Repository
│       │   ├── summaries/         # 摘要服务：Summary Service/Routes
│       │   ├── shared/            # 共享模块：Config、Database、Errors、Migrations
│       │   ├── app.ts             # Fastify 应用配置
│       │   └── index.ts           # 服务入口
│       └── tests/                 # 单元测试和集成测试
├── packages/
│   └── shared/               # 跨端共享类型（Zod Schema）
│       └── src/index.ts      # 所有领域类型定义
├── scripts/                  # 辅助脚本
├── .env.example              # 环境变量模板（不含真实密钥）
├── .gitignore
├── AGENTS.md                 # 开发规范
├── package.json              # Monorepo 根配置
└── tsconfig.base.json        # TypeScript 基础配置
```

## 🚀 快速开始

### 环境要求

- **Node.js** 20+
- **Python** 3.11+（用于 ASR、Embedding、PDF Worker）
- **.NET 8 SDK**（用于音频采集器和 DOCX 导出器）
- **FFmpeg**（系统 PATH 中可用）
- **Windows 10/11**（WASAPI 系统音频采集需要 Windows）

### 安装步骤

#### 1. 安装 Node.js 依赖

```bash
npm install
```

#### 2. 配置环境变量

在项目根目录复制 `.env.example` 为 `.env`，填入中转 API 信息：

```bash
cp .env.example .env
```

**关键配置项**：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AI_PROVIDER` | AI 提供方：`openai`/`ollama`/`mock` | `ollama` |
| `OPENAI_BASE_URL` | 中转 API 基础地址 | `https://api.openai.com/v1` |
| `OPENAI_API_FORMAT` | API 请求格式：`openai-chat`/`openai-responses`/`claude` | `openai-chat` |
| `OPENAI_API_KEY` | 中转 API 密钥（仅本地服务读取） | — |
| `OPENAI_CHAT_MODEL` | 默认聊天模型 | — |
| `OPENAI_EMBED_MODEL` | 向量模型，支持 `local:BAAI/bge-small-zh-v1.5` | `local:BAAI/bge-small-zh-v1.5` |
| `WHISPER_MODEL` | Whisper ASR 模型 | `large-v3-turbo` |
| `WHISPER_DEVICE` | ASR 运行设备：`auto`/`cpu`/`cuda` | `auto` |
| `LOCAL_EMBED_DEVICE` | 本地 Embedding 运行设备 | `auto` |

> ⚠️ **安全提示**：`.env` 文件包含敏感信息（如 API Key），已被 `.gitignore` 排除，**绝不提交到版本控制**。

#### 3. 构建 .NET 辅助工具

```bash
dotnet build tools/audio-capture -c Release
dotnet build tools/report-export -c Release
```

#### 4. 安装 Python 依赖

```bash
python -m pip install -r services/ai-worker/requirements.txt
```

#### 5. 数据库迁移

```bash
npm run db:migrate
```

#### 6. 启动开发模式

```bash
npm run dev
```

Electron 将自动启动内置本地服务（监听 `127.0.0.1:4317`），主窗口和悬浮窗同时可用。

#### 7. 打包发布

```bash
npm run dist:win
```

生成 NSIS 安装包到 `release/` 目录。

#### 8. 创建桌面快捷方式

**方法一：使用安装包自动创建**

运行 NSIS 安装包时，勾选"创建桌面快捷方式"选项，安装程序会自动在桌面创建快捷方式。

**方法二：手动创建快捷方式**

1. 在项目根目录创建启动脚本 `start-classmate.bat`：

   ```bat
   @echo off
   cd /d "%~dp0"
   echo Starting Classmate...
   npm run dev
   pause
   ```

2. 右键点击 `start-classmate.bat`，选择"发送到" → "桌面快捷方式"

3. 右键点击桌面上的快捷方式，选择"属性"，可以修改以下设置：
   - **目标**：确保指向正确的 `start-classmate.bat` 路径
   - **起始位置**：设置为项目根目录
   - **运行方式**：选择"最小化"，避免终端窗口干扰课堂

**方法三：使用 PowerShell 脚本（推荐）**

项目已提供 `scripts/start-classmate.ps1` 脚本，可直接使用：

```powershell
# 创建快捷方式
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Classmate.lnk")
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PWD\scripts\start-classmate.ps1`""
$Shortcut.WorkingDirectory = "$PWD"
$Shortcut.IconLocation = "$PWD\apps\desktop\build\icon.ico"
$Shortcut.Save()
```

**方法四：开发模式快捷启动**

如果经常在开发模式下使用，可以创建以下批处理文件 `dev-start.bat`：

```bat
@echo off
title Classmate Development
cd /d "%~dp0"
echo Installing dependencies if needed...
if not exist node_modules (
    npm install
)
echo Starting development server...
npm run dev
```

> 💡 **提示**：打包后的应用安装完成后，会自动在桌面和开始菜单创建快捷方式，无需手动操作。

## 🎮 界面功能详解

### 主界面视图

#### LiveView（实时课堂视图）
- **实时字幕**：滚动显示当前识别的字幕片段
- **课堂状态**：显示录制状态、时长、当前主题
- **快捷操作**：开始/停止采集、查看本课总结

#### SessionReviewView（课次回顾视图）
- **完整字幕**：按时间顺序显示本课所有字幕
- **AI 摘要**：Markdown 格式的课次增量摘要
- **事件列表**：按类型分组显示抽取的课堂事件
- **任务列表**：显示本课相关的待办任务
- **新课次入口**：便捷创建同一课程的下一课次

#### GraphView（知识图谱视图）
- **力导向图**：可视化展示知识节点与关系
- **搜索/筛选**：支持按关键词搜索、按类型筛选节点
- **节点侧栏**：查看节点详情、编辑定义、调整重要度、删除节点
- **证据查看**：查看与节点关联的事件和字幕原文

#### TasksView（任务中心视图）
- **任务列表**：支持按状态、课次筛选，按截止日期/重要度/创建时间排序
- **任务详情**：可展开查看完整信息、编辑、查看课堂证据、删除

#### ReportView（报告视图）
- **报告列表**：显示已生成的报告
- **报告生成**：选择日期范围和模板类型生成新报告
- **导出**：一键导出 Word 或 PDF

#### SettingsView（设置视图）
- **运行方式**：选择中转 API、Ollama 或离线演示模式
- **模型选择**：独立选择对话模型和向量模型
- **连接地址**：可编辑的中转 API 基础地址
- **API 格式**：选择 OpenAI Chat / OpenAI Responses / Claude
- **密钥状态**：显示 API Key 配置状态（不显示密钥内容）
- **测试连接**：保存并测试 AI 连接
- **重建索引**：重新构建向量检索索引

### 悬浮窗

- **计时显示**：显示当前采集时长
- **状态指示**：显示采集状态（空闲/录制中）
- **快捷控制**：开始/停止采集
- **窗口切换**：点击可打开主窗口

## 🔌 API 格式选择

桌面端支持三种上游 API 请求格式，可在「设置 → 模型与连接」页面切换：

| 格式 | 说明 | 适用场景 |
|------|------|----------|
| **OpenAI Chat** | 标准 `/v1/chat/completions` 接口 | 兼容性最广，大多数中转均支持 |
| **OpenAI Responses** | 新版 `/v1/responses` 接口 | 上游支持 Responses API 的中转 |
| **Claude** | Anthropic Messages 格式 `/v1/messages` | 使用 Claude 模型或支持 Anthropic 格式的中转 |

切换格式后保存即可生效，无需重启。连接地址也可在界面中直接编辑，保存后立即使用新地址获取模型列表和发起请求。

### API Key 配置

桌面版支持在设置界面直接配置 API Key：

1. 在「设置 → 模型与连接」页面找到"API Key"输入框
2. 输入您的中转 API 密钥（格式如 `sk-...`）
3. 点击"保存"按钮，密钥将加密保存在本地数据库
4. 密钥不会在界面上显示完整内容（使用密码输入框）
5. 服务器 API 响应中不包含密钥，确保传输安全

> 💡 **提示**：API Key 优先从数据库读取，如果数据库中未配置，则回退使用 `.env` 文件中的 `OPENAI_API_KEY`。

## 🏗️ 架构要点

### 服务生命周期

- **开发模式**：Electron 主进程使用 `tsx watch` 拉起内置服务
- **生产模式**：打包后使用 `server/index.cjs`（通过 esbuild 生成）
- **优雅退出**：Electron 退出时仅关闭自己启动的服务，不影响系统中其他进程

### 安全边界

- **渲染进程隔离**：渲染进程不访问 Node API、文件系统或进程
- **受限 IPC**：仅通过 preload 脚本暴露有限的 IPC 通道
- **本地 API**：渲染进程通过 HTTP 与本地服务通信
- **密钥保护**：API Key 保存在本地数据库中，不在界面显示完整内容；服务器 API 响应中不包含密钥

### 数据不变量

- **事实源**：`transcript_segments` 是唯一事实源，不可变
- **派生数据**：事件、知识节点、关系、摘要、向量、报告均为可重新生成的派生数据
- **证据链**：每条知识关系必须保留来源字幕或来源事件
- **日期处理**：相对日期同时保存老师原话、解析结果、课程时区和 `needsReview`，不确定时不伪造精确日期

### 健康状态指示

顶栏分离显示三种状态：

1. **服务进程状态**：本地服务是否正常运行
2. **SSE 连接状态**：服务器发送事件连接是否正常
3. **AI 上游健康状态**：每 10 秒轮询 `/ready` 端点，检查 AI 连接

### 回环绑定

- 服务只监听 `127.0.0.1`
- CORS 使用显式来源，不允许通配符

## 📋 常用命令

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

# 服务端单独运行
npm run dev -w @classmate/server

# 数据库迁移
npm run db:migrate -w @classmate/server

# 运行所有测试
npm run test

# 类型检查所有工作区
npm run typecheck
```

## 🐛 故障排查

### 服务启动失败

**现象**：主窗口显示"无法连接本地服务"

**排查步骤**：

1. 检查端口 4317 是否被占用：
   ```bash
   netstat -ano | findstr :4317
   ```

2. 查看服务日志（开发模式下在终端输出，生产模式在 `data/` 目录）

3. 确认 `.env` 配置正确，数据库目录可写

### ASR 识别失败

**现象**：字幕区域一直显示"等待音频..."

**排查步骤**：

1. 确认 FFmpeg 已安装并在系统 PATH 中
2. 确认 Python 依赖已安装：
   ```bash
   python -m pip install -r services/ai-worker/requirements.txt
   ```
3. 确认 Whisper 模型已下载（首次运行会自动下载）
4. 检查音频采集器是否正常工作：
   ```bash
   dotnet run --project tools/audio-capture
   ```

### AI 连接失败

**现象**：顶栏 AI 状态显示错误，测试连接失败

**排查步骤**：

1. 确认 `.env` 中的 `OPENAI_API_KEY` 和 `OPENAI_BASE_URL` 正确
2. 确认网络可以访问中转地址
3. 尝试在浏览器中访问 `${OPENAI_BASE_URL}/models`
4. 检查 API 格式选择是否与中转支持的格式匹配

### 报告生成失败

**现象**：报告列表中显示"失败"状态

**排查步骤**：

1. 检查任务队列状态
2. 确认 `.NET` 导出器已构建
3. 确认输出目录 `output/` 存在且可写
4. 查看服务日志中的具体错误信息

## 🔒 隐私与安全

- **API Key 保护**：仅保存在本地 `.env` 或系统环境变量中，由服务端进程读取，桌面界面不读取、不显示、不保存密钥
- **本地数据存储**：原始音频和字幕保存在本机 `data/` 目录，不自动上传
- **最小化数据传输**：第三方中转只接触用户主动发送的字幕文本、问题和报告上下文
- **安全导出**：导出文件默认写入用户明确可访问的本地 `output/` 目录
- **版本控制安全**：`.env` 已被 `.gitignore` 排除，不会进入版本控制
- **日志脱敏**：日志中自动脱敏 `Authorization` 头和 API Key

## 🤝 贡献指南

### 代码规范

- 所有终端命令必须以 `rtk` 为前缀
- 遵循 `AGENTS.md` 中的开发规范
- TypeScript 类型检查必须通过
- 新增功能需添加相应的测试

### 提交规范

使用 Conventional Commits 格式：

```
feat: 新增功能描述
fix: 修复问题描述
docs: 更新文档
refactor: 重构代码
test: 添加或修改测试
style: 代码风格调整
```

### PR 流程

1. 创建功能分支
2. 提交代码并通过测试
3. 发起 Pull Request
4. 等待审查和合并

## 📄 许可证

MIT License

## 📞 联系方式

如有问题或建议，欢迎提交 Issue 或 Pull Request。
