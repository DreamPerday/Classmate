import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
} from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { join, resolve } from "node:path";
let mainWindow: BrowserWindow | null = null,
  overlayWindow: BrowserWindow | null = null,
  tray: Tray | null = null;
let serviceProcess: ChildProcess | null = null;
let quitting = false;
let overlayCompact = false;
let expandedOverlaySize: [number, number] = [380, 250];
type ServiceStatus = {
  state: "starting" | "ready" | "error";
  detail: string;
  logPath: string | null;
  managed: boolean;
};
type OverlayState = {
  visible: boolean;
  compact: boolean;
  bounds: { x: number; y: number; width: number; height: number };
};
let serviceStatus: ServiceStatus = {
  state: "starting",
  detail: "正在启动本地服务",
  logPath: null,
  managed: false,
};
const preload = () => join(__dirname, "../preload/index.js");
function applicationRoot(): string {
  return app.isPackaged
    ? process.resourcesPath
    : resolve(__dirname, "../../../..");
}
function applicationIcon(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "icon.ico")
    : join(applicationRoot(), "apps/desktop/build/icon.ico");
}
async function serviceReady(): Promise<boolean> {
  try {
    return (
      await fetch("http://127.0.0.1:4317/health", {
        signal: AbortSignal.timeout(800),
      })
    ).ok;
  } catch {
    return false;
  }
}
function updateServiceStatus(status: ServiceStatus): ServiceStatus {
  serviceStatus = status;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("desktop:service-status", status);
    }
  }
  return status;
}
async function startLocalService(): Promise<void> {
  if (await serviceReady()) {
    updateServiceStatus({
      state: "ready",
      detail: "本地服务已连接",
      logPath: null,
      managed: false,
    });
    return;
  }
  const root = applicationRoot();
  const entry = app.isPackaged
    ? join(root, "server/index.cjs")
    : join(root, "apps/server/src/index.ts");
  const developmentRunner = join(root, "node_modules/tsx/dist/cli.mjs");
  const args = app.isPackaged
    ? [entry]
    : [developmentRunner, "watch", entry];
  for (const path of app.isPackaged ? [entry] : [developmentRunner, entry]) {
    if (!existsSync(path)) throw new Error(`内置服务文件不存在: ${path}`);
  }
  const userData = app.getPath("userData"),
    logPath = join(userData, "local-service.log"),
    log = createWriteStream(join(userData, "local-service.log"), {
      flags: "a",
    });
  updateServiceStatus({
    state: "starting",
    detail: "正在启动本地服务",
    logPath,
    managed: true,
  });
  serviceProcess = spawn(process.execPath, args, {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      CLASSMATE_ROOT: root,
      DATABASE_PATH: join(userData, "classmate.db"),
      DATA_DIR: join(userData, "data"),
      OUTPUT_DIR: join(userData, "output"),
      HF_ENDPOINT: process.env.HF_ENDPOINT ?? "https://hf-mirror.com",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serviceProcess.stdout?.pipe(log);
  serviceProcess.stderr?.pipe(log);
  serviceProcess.once("exit", (code, signal) => {
    serviceProcess = null;
    log.end();
    if (!quitting && serviceStatus.state !== "error") {
      updateServiceStatus({
        state: "error",
        detail: `本地服务已退出（${code ?? signal ?? "未知原因"}）`,
        logPath,
        managed: true,
      });
    }
  });
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    if (await serviceReady()) {
      updateServiceStatus({
        state: "ready",
        detail: "本地服务运行正常",
        logPath,
        managed: true,
      });
      return;
    }
    if (serviceProcess?.exitCode !== null) break;
  }
  const detail = `本地服务启动失败，请查看日志：${logPath}`;
  updateServiceStatus({
    state: "error",
    detail,
    logPath,
    managed: true,
  });
  throw new Error(detail);
}
function rendererUrl(query = ""): string | undefined {
  return process.env.ELECTRON_RENDERER_URL
    ? `${process.env.ELECTRON_RENDERER_URL}${query}`
    : undefined;
}
function loadRenderer(win: BrowserWindow, query = ""): void {
  const url = rendererUrl(query);
  if (url) void win.loadURL(url);
  else
    void win.loadFile(
      join(__dirname, "../renderer/index.html"),
      query ? { query: { overlay: "1" } } : undefined,
    );
}
function mainWindowState(): {
  visible: boolean;
  focused: boolean;
  minimized: boolean;
} {
  return {
    visible: Boolean(mainWindow?.isVisible()),
    focused: Boolean(mainWindow?.isFocused()),
    minimized: Boolean(mainWindow?.isMinimized()),
  };
}
function showMainWindow(): {
  visible: boolean;
  focused: boolean;
  minimized: boolean;
} {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show();
  mainWindow?.focus();
  return mainWindowState();
}
function minimizeMainWindow(): ReturnType<typeof mainWindowState> {
  mainWindow?.minimize();
  return mainWindowState();
}
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: "#f4f5f2",
    show: false,
    icon: applicationIcon(),
    title: "Classmate",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: preload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  loadRenderer(mainWindow);
}
function createOverlay(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;
  overlayWindow = new BrowserWindow({
    width: 380,
    height: 250,
    minWidth: 320,
    minHeight: 56,
    maxWidth: 560,
    maxHeight: 520,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: preload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  overlayWindow.setAlwaysOnTop(true, "floating");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.once("ready-to-show", () => {
    overlayWindow?.showInactive();
    updateTrayMenu();
  });
  overlayWindow.on("closed", () => {
    overlayWindow = null;
    overlayCompact = false;
    updateTrayMenu();
  });
  loadRenderer(overlayWindow, "?overlay=1");
  return overlayWindow;
}
function updateTrayMenu(): void {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开 Classmate", click: showMainWindow },
      {
        label: overlayWindow?.isVisible() ? "隐藏课堂悬浮窗" : "显示课堂悬浮窗",
        click: toggleOverlay,
      },
      { type: "separator" },
      { label: "退出 Classmate", click: quitApplication },
    ]),
  );
}
function overlayState(overlay = createOverlay()): OverlayState {
  return {
    visible: overlay.isVisible(),
    compact: overlayCompact,
    bounds: overlay.getBounds(),
  };
}
function toggleOverlay(): OverlayState {
  const overlay = createOverlay();
  overlay.isVisible() ? overlay.hide() : overlay.showInactive();
  updateTrayMenu();
  return overlayState(overlay);
}
function hideOverlay(): OverlayState {
  const overlay = createOverlay();
  overlay.hide();
  updateTrayMenu();
  return overlayState(overlay);
}
function setOverlayCompact(compact: boolean): OverlayState {
  const overlay = createOverlay();
  if (compact === overlayCompact) return overlayState(overlay);
  overlayCompact = compact;
  if (compact) {
    const [width = 380, height = 250] = overlay.getContentSize();
    expandedOverlaySize = [width, Math.max(250, height)];
    overlay.setContentSize(width, 56, false);
    overlay.setResizable(false);
  } else {
    overlay.setResizable(true);
    overlay.setContentSize(
      expandedOverlaySize[0],
      expandedOverlaySize[1],
      false,
    );
  }
  return overlayState(overlay);
}
function quitApplication(): void {
  quitting = true;
  overlayWindow?.destroy();
  mainWindow?.destroy();
  serviceProcess?.kill();
  app.quit();
}
function createTray(): void {
  const image = nativeImage.createFromPath(applicationIcon());
  tray = new Tray(image);
  tray.setToolTip("Classmate 课堂智能体");
  tray.on("click", showMainWindow);
  updateTrayMenu();
}
app.commandLine.appendSwitch("force-renderer-accessibility");
if (!app.isPackaged && process.env.CLASSMATE_DEBUG_PORT) {
  app.commandLine.appendSwitch(
    "remote-debugging-port",
    process.env.CLASSMATE_DEBUG_PORT,
  );
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
}
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);
  app.whenReady().then(async () => {
    ipcMain.handle("desktop:toggle-overlay", () => toggleOverlay());
    ipcMain.handle("desktop:hide-overlay", () => hideOverlay());
    ipcMain.handle("desktop:open-main", () => showMainWindow());
    ipcMain.handle("desktop:minimize-main", () => minimizeMainWindow());
    ipcMain.handle("desktop:get-main-state", () => mainWindowState());
    ipcMain.handle("desktop:get-overlay-state", () => overlayState());
    ipcMain.handle("desktop:set-overlay-compact", (_event, compact: boolean) =>
      setOverlayCompact(Boolean(compact)),
    );
    ipcMain.handle("desktop:get-service-status", () => serviceStatus);
    try {
      await startLocalService();
    } catch (error) {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
    createWindow();
    createOverlay();
    createTray();
    app.on("activate", showMainWindow);
  });
}
app.on("before-quit", () => {
  quitting = true;
  serviceProcess?.kill();
});
app.on("window-all-closed", () => {});
