import { contextBridge, ipcRenderer } from "electron";
import type { AppData } from "./shared/types.js";

const dashboard = {
  getData: () => ipcRenderer.invoke("dashboard:getData") as Promise<AppData>,
  addStock: (symbol: string) => ipcRenderer.invoke("dashboard:addStock", symbol) as Promise<AppData>,
  removeStock: (symbol: string) => ipcRenderer.invoke("dashboard:removeStock", symbol) as Promise<AppData>,
  updateMetrics: (enabledMetricIds: string[]) =>
    ipcRenderer.invoke("dashboard:updateMetrics", enabledMetricIds) as Promise<AppData>,
  refreshStocks: (symbols?: string[]) => ipcRenderer.invoke("dashboard:refreshStocks", symbols) as Promise<AppData>,
  onData: (callback: (data: AppData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: AppData) => callback(data);
    ipcRenderer.on("dashboard:data", listener);
    return () => ipcRenderer.removeListener("dashboard:data", listener);
  }
};

contextBridge.exposeInMainWorld("dashboard", dashboard);
