const { contextBridge, ipcRenderer } = require("electron");

const dashboard = {
  getData: () => ipcRenderer.invoke("dashboard:getData"),
  addStock: (symbol) => ipcRenderer.invoke("dashboard:addStock", symbol),
  removeStock: (symbol) => ipcRenderer.invoke("dashboard:removeStock", symbol),
  updateMetrics: (enabledMetricIds) => ipcRenderer.invoke("dashboard:updateMetrics", enabledMetricIds),
  addMetric: (request) => ipcRenderer.invoke("dashboard:addMetric", request),
  removeMetric: (metricId) => ipcRenderer.invoke("dashboard:removeMetric", metricId),
  refreshStocks: (symbols) => ipcRenderer.invoke("dashboard:refreshStocks", symbols),
  onData: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("dashboard:data", listener);
    return () => ipcRenderer.removeListener("dashboard:data", listener);
  }
};

contextBridge.exposeInMainWorld("dashboard", dashboard);
