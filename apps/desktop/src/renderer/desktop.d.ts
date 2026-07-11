export {};
declare global {
  type DesktopServiceStatus = {
    state: "starting" | "ready" | "error";
    detail: string;
    logPath: string | null;
    managed: boolean;
  };
  type DesktopOverlayState = {
    visible: boolean;
    compact: boolean;
    bounds: { x: number; y: number; width: number; height: number };
  };
  interface Window {
    desktop?: {
      platform: string;
      version: string;
      toggleOverlay: () => Promise<DesktopOverlayState>;
      hideOverlay: () => Promise<DesktopOverlayState>;
      openMain: () =>
        Promise<{ visible: boolean; focused: boolean; minimized: boolean }>;
      minimizeMain: () =>
        Promise<{ visible: boolean; focused: boolean; minimized: boolean }>;
      getMainState: () =>
        Promise<{ visible: boolean; focused: boolean; minimized: boolean }>;
      getOverlayState: () => Promise<DesktopOverlayState>;
      setOverlayCompact: (compact: boolean) => Promise<DesktopOverlayState>;
      getServiceStatus: () => Promise<DesktopServiceStatus>;
      onServiceStatus: (
        listener: (status: DesktopServiceStatus) => void,
      ) => () => void;
    };
  }
}
