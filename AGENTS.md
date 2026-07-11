# Classmate Agent 开发规范

本文件是仓库级长期约束。任何在本仓库中工作的 Agent 或开发者都必须先阅读本文件，再修改代码。

## 1. 工具与工作区规则

- 所有终端命令必须以 `rtk` 为前缀，包括 `npm`、`npx`、`node`、`python`、`dotnet` 和 PowerShell 子进程。
- PowerShell 内置命令通过 `rtk pwsh -NoProfile -Command ...` 执行。
- 手工文件修改必须使用 `apply_patch`；格式化器、依赖安装和编译器生成物除外。
- 工作区可能存在用户修改。不得重置、覆盖或清理与当前目标无关的内容。
- 优先使用 `rg`/`rg --files` 搜索，不使用递归 `grep`。
- 不得把真实 API Key、音频、完整课堂字幕或用户报告写入日志、测试快照、README、示例配置或提交文件。

## 2. 产品目标

Classmate 是个人独立使用的 AI 实时课堂助手，不是简单的“录音加总结”工具。最终版本必须覆盖：

1. Windows WASAPI 系统音频采集、VAD 动态分段和本地 faster-whisper ASR。
2. 带时间戳且不可变的原始字幕，支持纠错但不覆盖原始证据。
3. 结构化课堂事件：重点、定义、例子、纠正、作业、考试、任务和截止日期。
4. 具有实体归一化、关系去重、置信度和字幕证据的知识图谱。
5. 中文词法检索与向量检索融合，并返回证据和课堂时间点。
6. 有证据约束的课堂问答、分层增量摘要和按课程或日期范围生成的综合报告；十天实训只是预设模板，不是固定周期。
7. Word 与 PDF 导出，报告必须可编辑、可阅读、可追溯并经过结构审计。
8. OpenAI 兼容中转、Ollama、离线确定性模式以及本地 Embedding 模型。
9. 从上游动态获取模型列表，聊天模型与 Embedding 模型独立选择并真实调用验证。
10. Electron 主窗口和始终置顶的课堂悬浮窗。
11. 无需用户部署服务端：Electron 自动启动和关闭内置回环服务，数据保存在本机。
12. 独立移动端：设备本地存储，用户自行设置 API Key，直接调用中转 API，不依赖桌面端或 Fastify 服务。

## 3. 明确的平台边界

### Windows 桌面端

- 使用 WASAPI Loopback 捕获电脑内部播放音频，不依赖麦克风或外放。
- Electron 负责 UI、悬浮窗和内置服务生命周期。
- .NET/NAudio 辅助进程只负责音频采集；Python Worker 负责 ASR、Embedding 和 PDF；Node 服务负责数据库、任务队列与领域编排。
- 服务只能监听 `127.0.0.1`，CORS 必须使用显式来源，不允许通配符。

### 移动端

- 使用 Expo/React Native、Expo Router 和受控的 Android 原生模块。
- Android 10+ 通过 `AudioPlaybackCapture` 与每次显式的 `MediaProjection` 系统授权捕获其他 App 允许捕获的播放音频。DRM、受保护内容和源 App 主动禁止捕获时必须明确失败，不得声称万能监听。
- iOS 不允许第三方 App 捕获其他 App 的系统音频；仅保留手工字幕等降级入口，不伪造系统音频能力。
- Android 系统音频只在设备内转为 PCM 并由本地 ASR 模型识别。原始音频和音频 Chunk 不得上传到 OpenAI 兼容中转；云端只接收用户主动提交的字幕文本和报告上下文。
- Android 捕获使用前台服务和持续通知；系统级悬浮窗必须单独请求 `SYSTEM_ALERT_WINDOW`，仅在用户主动启用后显示，并提供计时、停止捕获和返回应用。
- 移动端直接调用用户配置的 OpenAI 兼容 API。API Key 必须使用 `expo-secure-store` 保存，SQLite 或普通 AsyncStorage 中不得出现密钥。
- 移动端所有课程、字幕、事件、知识、任务、摘要和报告数据保存在设备 SQLite 中。
- 移动端离线时仍可查看和编辑既有资料；本地 ASR 可离线运行，需要云模型的操作应明确显示等待网络，不伪装为已完成。

## 4. 架构与目录所有权

```text
apps/server       Fastify 本地 API、领域服务、SQLite、后台任务
apps/desktop      Electron 主进程、React 桌面 UI、悬浮窗
apps/mobile       Expo/React Native 独立移动客户端
packages/shared   纯 TypeScript Zod Schema 和跨端领域类型
services/ai-worker  Python ASR、Embedding、PDF Worker
tools/audio-capture .NET WASAPI Loopback 采集器
tools/report-export .NET OpenXML DOCX 导出器
```

- 服务端保持 Controller/Route -> Service -> Repository 边界。
- React/Electron Renderer 不得访问 Node API、文件系统或进程；仅通过受限 preload IPC 和本地 HTTP API。
- 移动端不得导入服务端运行时代码，只能复用纯 TypeScript 类型或算法。
- 不为单次调用创建抽象；共享抽象必须消除真实重复或维护跨端契约。

## 5. 数据与证据不变量

- `transcript_segments` 是事实源。已落库字幕不得被派生处理覆盖或删除。
- 事件、知识节点、关系、摘要、向量和报告都是可重新生成的派生数据。
- 每个课堂事件必须至少引用一个真实字幕 ID、时间范围和原文短句。
- 每条知识关系必须保留来源字幕或来源事件；无证据关系不得进入正式图谱。
- 相对日期同时保存老师原话、解析结果、课程时区和 `needsReview`。不确定时不能伪造精确日期。
- 增量摘要允许新增、合并、纠正和删除错误派生结论；不得采用永久“只增加不修改”策略。
- 问答证据不足时必须明确拒答。通用知识补充必须与课堂原话分开标识。
- Embedding 记录以 `(entityType, entityId, model)` 唯一；不同模型向量可以并存，切换模型后必须能重建索引。

## 6. AI 与模型接入

- API Base URL 统一规范化到版本路径，但不得假设中转实现完整 Responses 或 Realtime API。
- OpenAI 兼容层优先使用中转实际支持的 Chat Completions；接口能力必须通过真实最小请求验证。
- `/models` 返回的模型只是候选项。图片模型不得出现在聊天选择中；聊天与 Embedding 列表分别筛选。
- 上游没有 Embedding 模型时，允许选择 `local:BAAI/bge-small-zh-v1.5`。
- Windows 中文模型下载默认支持可覆盖的 Hugging Face 镜像；Worker 标准输入输出必须固定 UTF-8。
- 结构化模型输出必须通过 Zod/JSON Schema 校验。无效输出进入可重试任务，不得直接写入领域表。
- API Key 不得由桌面 Renderer 读取或返回。移动端因明确为 BYOK 客户端，仅在设置表单中短暂持有并立即写入 SecureStore。

## 7. 后台任务与可靠性

- ASR、语义提取、摘要、向量重建和报告生成使用持久化任务。
- 所有任务必须有幂等键、最大重试次数、指数退避和最后错误。
- 应用启动时必须把进程中断遗留的 `running` 任务恢复到 `retry`。
- 长任务不得阻塞 HTTP 线程或 UI；状态通过查询或 SSE 更新。
- Worker 异常退出、设备切换、断网和模型调用失败必须可恢复，并保留原始音频与字幕。

## 8. UI/UX 约束

- 这是高频学习工具，界面应安静、紧凑、便于扫描，不使用营销式 Hero 或装饰性卡片堆叠。
- 命令按钮优先使用 Lucide/原生图标；陌生图标必须有 tooltip 或无障碍标签。
- 卡片圆角不超过 8px，禁止卡片套卡片。
- 所有动态区域使用稳定网格、最小高度和滚动边界，避免字幕和状态变化导致布局跳动。
- 桌面悬浮窗必须可拖动、置顶、收起、隐藏、打开主窗口，并能开始/停止当前课堂采集。
- 移动端使用原生标签导航、安全区、44pt/48dp 触控目标和系统无障碍语义。
- Android 移动悬浮窗必须可拖动、显示捕获计时、停止捕获并返回主界面；未获悬浮窗权限时使用持续通知和应用内控制降级。
- 不用可见长文解释功能或快捷键；操作状态通过简洁反馈、空状态和错误状态表达。

## 9. 安全与隐私

- `.env` 必须被忽略，`.env.example` 只能包含占位值。
- 日志必须脱敏 `Authorization`、API Key 和模型请求正文中的敏感字段。
- 导出文件默认写入用户明确可访问的本地目录，不自动上传。
- 第三方中转只接触用户主动发送的字幕文本、问题和报告上下文；移动端不得向中转上传原始音频或音频 Chunk，设置页必须说明本地/云端处理边界。
- 不实现绕过 DRM、平台权限、付费或访问控制的捕获能力。
- 用户在聊天或历史中暴露过的 Key 应视为需要轮换，不得在任何回复或代码中重复。

## 10. 开发与验证命令

所有命令仍须加 `rtk` 前缀。

```powershell
npm install
npm run build
npm run test
npm run audit
dotnet build tools/audio-capture -c Release
dotnet build tools/report-export -c Release
python services/ai-worker/main.py health
npm run bundle:service -w @classmate/desktop
npm run dist:win -w @classmate/desktop
npm run typecheck -w @classmate/mobile
npx expo-doctor apps/mobile
```

局部修改至少运行对应 workspace 的 build/typecheck/test。涉及跨端契约、任务系统、数据库或报告时必须运行根级验证。

## 11. 报告质量门槛

- 报告必须保存课程、起止日期、模板类型和证据范围；支持单日、周报、课程总结、实训报告和自定义范围，十天实训仅是快捷预设。
- 综合/实训模板至少包含：学习目的、环境与方法、范围内进展、核心知识、任务与实践、反思和总结；单日或周报按范围使用更紧凑结构。
- 七天以上或综合/实训模板正文不得少于 2000 个非空白字符，目标约 3000 个中文字符；短周期报告按证据量生成，不得为凑字数重复内容。
- 不得根据“老师布置任务”推断“学生已完成任务”。个人完成情况只能来自用户确认。
- DOCX 必须通过 OpenXML 校验，包含命名样式、标题层级、A4 页面、页眉页脚和页码。
- PDF 必须提取文本并渲染抽查，确保中文字体、分页、重叠和裁切正确。

## 12. 完成定义

只有以下证据全部存在时，才能声称最终版本完成：

- 桌面、服务端、共享包和移动端均可构建或通过类型检查。
- WASAPI 与 DOCX .NET 工具零错误构建；Python Worker 健康检查通过。
- 上游模型列表在运行时获取，所选聊天模型完成真实请求测试。
- 本地 BGE 对真实中文课堂文本生成向量，混合问答返回可追溯证据。
- 演示数据能按自选日期范围生成满足对应质量门槛的新报告，十天预设与非十天范围都可用，DOCX/PDF 文件存在并通过各自审计。
- Electron 能自动启动内置服务，主窗口与悬浮窗均可运行，退出后只关闭自己启动的服务。
- 移动端能在不连接本项目服务器的情况下保存 Key、获取模型、保存本地课堂资料并执行至少一条直接 AI 工作流。
- Android 10+ 能在系统授权后捕获允许录制的播放音频，使用设备内模型输出字幕且网络日志中不存在音频上传；拒绝授权、受保护内容和无音频时均有明确状态。
- Android 捕获期间前台通知与可选系统悬浮窗可运行，悬浮窗能够显示计时、停止捕获和返回应用；服务停止后无残留录音或悬浮窗。
- 真实密钥未出现在受版本控制文件、构建产物、日志或最终回复中。
