# Classmate Agent

个人 AI 实时课堂助手，覆盖桌面端（Windows）与移动端（Android）。桌面端通过 WASAPI Loopback 捕获系统音频，移动端通过 Android `AudioPlaybackCapture` 捕获允许录制的播放音频，两端均提供本地 ASR、证据追踪、知识图谱、混合检索、分层摘要、综合报告与导出能力。

## 仓库结构

```
.
├── apps/
│   ├── desktop/              # Electron 桌面端（Windows）
│   ├── mobile/               # Expo/React Native 移动端（Android）
│   └── server/               # Fastify 内置服务端（桌面端使用）
├── packages/
│   └── shared/               # 跨端共享 Zod Schema
├── services/
│   └── ai-worker/            # Python ASR、Embedding、PDF Worker（桌面端）
├── tools/
│   ├── audio-capture/        # .NET WASAPI Loopback 采集器（桌面端）
│   └── report-export/        # .NET OpenXML DOCX 导出器（桌面端）
├── .env.example              # 环境变量模板（仅占位值）
├── AGENTS.md                 # 仓库级开发规范
└── README.md                 # 本文件
```

## 桌面端

基于 Electron + React，自动管理内置本地服务，提供 WASAPI 系统音频采集、实时字幕、课堂事件抽取、知识图谱、混合检索、分层摘要、综合报告和 Word/PDF 导出。

### 核心能力

- **系统音频采集**：WASAPI Loopback 捕获电脑播放音频，不依赖麦克风
- **本地 ASR**：faster-whisper 支持 `large-v3-turbo`、`medium` 等模型，离线可用
- **证据优先**：`transcript_segments` 为事实源，AI 提取结论必须可回溯到原始字幕
- **知识图谱**：实体归一化、关系去重、力导向图可视化
- **混合检索**：SQLite FTS 词法匹配 + BGE 向量语义检索融合排序
- **分层摘要**：课次增量摘要，支持重新生成与纠正
- **综合报告**：单日/周报/课程总结/实训报告/自定义范围，七天以上正文不少于 2000 非空白字符
- **导出**：OpenXML DOCX（命名样式、A4 页面、页眉页脚页码）与 PDF（中文字体、分页审计）
- **悬浮窗**：始终置顶、可拖动、收起/展开、开始/停止采集
- **API 格式**：OpenAI Chat Completions、OpenAI Responses、Claude Messages
- **本地优先**：数据保存在本机，ASR/Embedding 可选本地模型，服务仅监听 `127.0.0.1`

详细文档见 [apps/desktop/README.md](apps/desktop/README.md)。

### 桌面端快速开始

1. 安装 Node.js 20+、Python 3.11+、.NET 8 SDK、FFmpeg
2. 复制 `.env.example` 为 `.env`，填入中转 API 信息
3. `npm install` && `npm run db:migrate`
4. `python -m pip install -r services/ai-worker/requirements.txt`
5. `dotnet build tools/audio-capture -c Release` && `dotnet build tools/report-export -c Release`
6. `npm run dev`

## 移动端

独立的 Expo/React Native 移动客户端，不依赖桌面端或服务端。用户自行配置 OpenAI 兼容中转 API Key（BYOK），所有课程资料保存在设备本地 SQLite。

### 核心能力

- **Android 系统音频捕获**：Android 10+ 通过 `AudioPlaybackCapture` 与每次显式的 `MediaProjection` 授权捕获其他 App 允许录制的播放音频
- **本地 ASR**：Vosk `vosk-model-small-cn-0.22` 设备内识别，音频不上传云端
- **BYOK 模式**：API Key 通过 `expo-secure-store` 加密保存，普通存储中不出现密钥
- **本地数据库**：课程、字幕、事件、知识、任务、摘要、报告全部保存在设备 SQLite
- **课堂悬浮窗**：可拖动、显示捕获计时、实时字幕预览、音频信号指示、数据量显示、停止捕获、返回主界面
- **AI 工作流**：字幕事实抽取、事件识别、概念归一化、任务提取（含截止日期解析与 `needsReview`）、课次摘要、知识问答（证据约束）、综合报告
- **离线模式**：provider 切换为 `mock` 时使用本地模拟，无需真实 API 即可验证界面与数据流
- **模型选择**：聊天模型与 Embedding 模型独立选择，从上游 `/models` 实时获取候选项
- **报告导出**：DOCX（`docx` 库）与 PDF（`expo-print`），保存到设备可访问目录

### 移动端安全边界

- **音频不上传**：原始音频和音频 Chunk 仅在设备内处理，云端只接收用户主动提交的字幕文本
- **Key 不泄露**：API Key 仅保存在 `expo-secure-store`，不出现在 SQLite、AsyncStorage、日志或版本控制
- **DRM 尊重**：不实现绕过 DRM、平台权限、付费或访问控制的捕获能力；受保护内容时明确失败
- **前台服务**：捕获期间使用前台服务与持续通知；系统级悬浮窗单独请求 `SYSTEM_ALERT_WINDOW`

### 移动端技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Expo | 57.0.4 |
| 运行时 | React Native | 0.86.0 |
| 路由 | Expo Router | 57.0.4 |
| 状态 | TanStack Query | 5.x |
| 数据库 | expo-sqlite | 57.0.0 |
| 密钥存储 | expo-secure-store | 57.0.0 |
| 导出 | expo-print / docx | - |
| 校验 | Zod | 4.x |
| 本地 ASR | Vosk | vosk-model-small-cn-0.22 |
| 原生模块 | Kotlin | Android 10+ |

### 移动端项目结构

```
apps/mobile/
├── android/app/src/main/java/cn/classmate/mobile/
│   ├── CaptureOverlayController.kt    # 系统悬浮窗（计时、预览、信号、停止）
│   ├── PlaybackCaptureService.kt       # 前台服务 + AudioPlaybackCapture + Vosk ASR
│   ├── CapturePermissionActivity.kt    # MediaProjection 授权引导
│   ├── CaptureStateStore.kt            # 捕获状态持久化（SharedPreferences）
│   ├── PendingSegmentStore.kt          # 识别字幕暂存（SharedPreferences）
│   ├── LocalAsrModelManager.kt         # Vosk 模型下载与解压
│   ├── SystemCaptureModule.kt          # React Native 原生模块桥接
│   └── SystemCapturePackage.kt         # 原生模块注册
├── app/(tabs)/                         # Expo Router 页面
│   ├── index.tsx                       # 课堂主页（采集控制、字幕列表）
│   ├── settings.tsx                    # 设置（BYOK、模型选择、provider 切换）
│   ├── knowledge.tsx                   # 知识图谱
│   ├── tasks.tsx                       # 任务中心
│   └── reports.tsx                     # 报告生成与导出
├── services/
│   ├── ai.ts                           # AI 请求、模型列表、事实抽取、问答、摘要、报告
│   └── database.ts                     # SQLite 初始化、CRUD、检索
├── types/domain.ts                     # 领域类型
└── components/ui/                      # 通用 UI 组件
```

### 移动端快速开始

#### 环境要求

- Node.js 20+
- Android Studio（或独立 Android SDK + JDK 17）
- Android 10+ 设备或模拟器（系统音频捕获需要 Android 10+）
- OpenAI 兼容中转 API（用户自行配置）

#### 构建步骤

1. 安装依赖：
   ```bash
   cd apps/mobile
   npm install
   ```

2. 生成 JS Bundle（调试 APK 内嵌使用）：
   ```bash
   npx expo export --platform android --output-dir scripts/avd-verify/assets
   # 或使用项目内脚本生成内嵌 bundle
   ```

3. 构建调试 APK：
   ```bash
   cd android
   .\gradlew.bat assembleDebug
   ```

   输出位于 `android/app/build/outputs/apk/debug/app-debug.apk`。

4. 安装到设备/模拟器：
   ```bash
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

5. 类型检查：
   ```bash
   npm run typecheck
   ```

#### 使用流程

1. 启动应用，进入「设置」页
2. 填入中转 API Base URL（如 `https://your-relay.example.com/v1`）
3. 填入 API Key 并保存（Key 加密存储于 SecureStore，界面不回显）
4. 点击「获取模型」拉取上游模型列表
5. 分别选择聊天模型与 Embedding 模型
6. 点击「测试连接」验证连通性
7. 返回「课堂」页，点击「开始捕获」
8. 系统弹出 MediaProjection 授权对话框，选择要捕获的音频源
9. 授权后悬浮窗出现，开始计时与识别
10. 点击悬浮窗「停止」按钮结束捕获
11. 字幕自动保存到本地数据库，点击「整理」触发 AI 事实抽取
12. 在「知识」「任务」「报告」页查看派生数据

#### 离线模式

在设置页将 provider 切换为「离线模拟」即可使用 mock 模式，无需真实 API 即可验证完整界面与数据流。

## 共享原则

- **证据不变量**：`transcript_segments` 是事实源，已落库字幕不被派生处理覆盖或删除
- **证据绑定**：每个课堂事件至少引用一个真实字幕 ID、时间范围和原文短句
- **日期处理**：相对日期同时保存老师原话、解析结果和 `needsReview`，不确定时不伪造精确日期
- **问答约束**：证据不足时明确拒答，通用知识补充必须与课堂原话分开标识
- **任务区分**：不得根据「老师布置任务」推断「学生已完成任务」，个人完成情况只能来自用户确认

## 安全与隐私

- `.env` 已被 `.gitignore` 排除，绝不提交真实密钥
- API Key 在桌面端仅由服务端进程读取，渲染进程不接触；在移动端通过 SecureStore 加密保存
- 日志自动脱敏 `Authorization` 头和 API Key
- 导出文件默认写入用户明确可访问的本地目录，不自动上传
- 移动端不向中转上传原始音频或音频 Chunk，仅发送用户主动提交的字幕文本

## 开发命令

所有终端命令须加 `rtk` 前缀（见 `AGENTS.md`）。

```powershell
# 桌面端
npm run dev -w @classmate/desktop
npm run typecheck -w @classmate/desktop
npm run dist:win -w @classmate/desktop

# 移动端
npm run typecheck -w @classmate/mobile
cd apps/mobile/android; .\gradlew.bat assembleDebug

# 服务端
npm run dev -w @classmate/server
npm run db:migrate -w @classmate/server

# 全量验证
npm run build
npm run test
npm run audit
```

## 许可证

MIT License
