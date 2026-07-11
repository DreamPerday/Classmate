import { contextBridge, ipcRenderer } from "electron";
type ServiceStatus = {
  state: "starting" | "ready" | "error";
  detail: string;
  logPath: string | null;
  managed: boolean;
};
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  version: process.versions.electron,
  toggleOverlay: () => ipcRenderer.invoke("desktop:toggle-overlay"),
  hideOverlay: () => ipcRenderer.invoke("desktop:hide-overlay"),
  openMain: () => ipcRenderer.invoke("desktop:open-main"),
  minimizeMain: () => ipcRenderer.invoke("desktop:minimize-main"),
  getMainState: () => ipcRenderer.invoke("desktop:get-main-state"),
  getOverlayState: () => ipcRenderer.invoke("desktop:get-overlay-state"),
  setOverlayCompact: (compact: boolean) =>
    ipcRenderer.invoke("desktop:set-overlay-compact", compact),
  getServiceStatus: () => ipcRenderer.invoke("desktop:get-service-status"),
  onServiceStatus: (listener: (status: ServiceStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: ServiceStatus) =>
      listener(status);
    ipcRenderer.on("desktop:service-status", handler);
    return () => ipcRenderer.removeListener("desktop:service-status", handler);
  },
});
