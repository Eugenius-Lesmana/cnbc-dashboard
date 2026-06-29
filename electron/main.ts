import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Store from "electron-store";
import pLimit from "p-limit";
import { fetchCnbcStock, validateCnbcMetric } from "./providers/cnbcProvider.js";
import { defaultMetricDefinitions } from "./shared/defaultMetrics.js";
import { evaluateFormula, getFormulaIdentifiers, validateFormulaSyntax } from "./shared/formula.js";
import type { AddMetricRequest, AppData, DashboardSettings, MetricDefinition, StockSnapshot } from "./shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

type StoreShape = {
  appData: AppData;
};

const defaultSettings: DashboardSettings = {
  enabledMetricIds: [
    "pe",
    "forwardPe",
    "earningsDate",
    "dividendDate",
    "marketCap",
    "eps",
    "forwardEps",
    "revenue",
    "netMargin"
  ],
  refreshConcurrency: 4,
  watchlistSeedVersion: 2
};

const defaultWatchlist = [
  "JPM",
  "GS",
  "C",
  "V",
  "BRK.B",
  "UNH",
  "LLY",
  "NVO",
  "VRT",
  "CSCO",
  "IBM",
  "AAPL",
  "MSFT",
  "GOOG",
  "AMZN",
  "NFLX",
  "META",
  "CRM",
  "ADBE",
  "NVDA",
  "ASML",
  "AVGO",
  "PANW",
  "ORCL",
  "AMD",
  "TSM",
  "RBLX",
  "PLTR",
  "ARM",
  "NOW",
  "DELL",
  "CRWD",
  "SPOT",
  "CRWV",
  "DB",
  "AZN-GB",
  "REL-GB",
  "HSBA-GB",
  "BA.-GB",
  "RR.-GB",
  "JMAT-GB",
  "RMS-FR",
  "MC-FR",
  "AIR-FR",
  "9988-HK",
  "700-HK",
  "3690-HK",
  "1810-HK",
  "1211-HK"
];

const defaultAppData: AppData = {
  watchlist: defaultWatchlist,
  settings: defaultSettings,
  snapshots: {},
  metricDefinitions: defaultMetricDefinitions
};

const store = new Store<StoreShape>({
  name: "stock-dashboard",
  defaults: {
    appData: defaultAppData
  }
});

let mainWindow: BrowserWindow | null = null;

function getData(): AppData {
  const data = store.get("appData");
  const shouldApplyCurrentSeed = data.settings.watchlistSeedVersion === undefined;
  const metricDefinitions = normalizeMetricDefinitions(data.metricDefinitions);
  const enabledMetricIds = data.settings.enabledMetricIds.filter((metricId) =>
    metricDefinitions.some((metric) => metric.id === metricId)
  );
  const shouldPersistNormalization =
    shouldApplyCurrentSeed || !data.metricDefinitions || enabledMetricIds.length !== data.settings.enabledMetricIds.length;

  const normalizedData = {
    ...defaultAppData,
    ...data,
    watchlist: shouldApplyCurrentSeed ? defaultWatchlist : data.watchlist,
    metricDefinitions,
    settings: {
      ...defaultSettings,
      ...data.settings,
      enabledMetricIds: enabledMetricIds.length ? enabledMetricIds : defaultSettings.enabledMetricIds
    },
    snapshots: {
      ...data.snapshots
    }
  };

  normalizedData.settings.watchlistSeedVersion = defaultSettings.watchlistSeedVersion;

  if (shouldPersistNormalization) {
    setData(normalizedData);
  }

  return normalizedData;
}

function setData(data: AppData) {
  store.set("appData", data);
}

function publishData() {
  mainWindow?.webContents.send("dashboard:data", getData());
}

function normalizeMetricDefinitions(savedDefinitions?: MetricDefinition[]) {
  const definitionsById = new Map(defaultMetricDefinitions.map((metric) => [metric.id, metric]));

  for (const metric of savedDefinitions ?? []) {
    if (metric.id === "price") continue;
    definitionsById.set(metric.id, {
      ...metric,
      width: metric.width ?? 120,
      description: metric.description ?? "",
      removable: metric.removable ?? true
    });
  }

  return [...definitionsById.values()];
}

function createMetricId(label: string, existingIds: string[]) {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 42) || "metric";
  let candidate = base;
  let suffix = 2;

  while (existingIds.includes(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function getFormulaValueMap(snapshot: StockSnapshot, metricDefinitions: MetricDefinition[]) {
  const values: Record<string, string | number | null | undefined> = {
    price: snapshot.price ?? null,
    ...snapshot.values
  };

  for (const metric of metricDefinitions) {
    if (metric.id in values) continue;
    values[metric.id] = snapshot[metric.id as keyof StockSnapshot] as string | number | null | undefined;
  }

  return values;
}

function recomputeFormulaMetrics(data: AppData) {
  const formulaMetrics = data.metricDefinitions.filter((metric) => metric.source === "formula" && metric.formula);
  if (!formulaMetrics.length) return data;

  for (const snapshot of Object.values(data.snapshots)) {
    snapshot.values = {
      price: snapshot.price ?? null,
      ...snapshot.values
    };

    for (const metric of formulaMetrics) {
      snapshot.values[metric.id] = evaluateFormula(metric.formula ?? "", getFormulaValueMap(snapshot, data.metricDefinitions));
    }
  }

  return data;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: "#f5f7fb",
    title: "Stock Dashboard",
    webPreferences: {
      preload: path.join(__dirname, "../electron/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const label = ["verbose", "info", "warning", "error"][level] ?? "log";
    console.log(`[renderer:${label}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[renderer:gone] ${details.reason}`);
  });

  if (isDev) {
    await mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

ipcMain.handle("dashboard:getData", () => getData());

ipcMain.handle("dashboard:addStock", async (_event, rawSymbol: string) => {
  const symbol = rawSymbol.trim().toUpperCase();
  if (!symbol) return getData();

  const data = getData();
  if (!data.watchlist.includes(symbol)) {
    data.watchlist.push(symbol);
    data.watchlist.sort();
    data.snapshots[symbol] = {
      symbol,
      status: "idle"
    };
    setData(data);
  }

  publishData();
  return getData();
});

ipcMain.handle("dashboard:removeStock", async (_event, rawSymbol: string) => {
  const symbol = rawSymbol.trim().toUpperCase();
  const data = getData();
  data.watchlist = data.watchlist.filter((item) => item !== symbol);
  delete data.snapshots[symbol];
  setData(data);
  publishData();
  return getData();
});

ipcMain.handle("dashboard:updateMetrics", async (_event, enabledMetricIds: string[]) => {
  const data = getData();
  const allowedIds = new Set(data.metricDefinitions.map((metric) => metric.id));
  data.settings.enabledMetricIds = enabledMetricIds.filter((metricId) => allowedIds.has(metricId));
  setData(data);
  publishData();
  return getData();
});

ipcMain.handle("dashboard:addMetric", async (_event, request: AddMetricRequest) => {
  const data = getData();
  const label = request.label.trim();
  if (!label) throw new Error("Column name cannot be empty.");

  const existingIds = data.metricDefinitions.map((metric) => metric.id);
  const id = createMetricId(label, existingIds);
  let metric: MetricDefinition;

  if (request.kind === "cnbc") {
    const cnbcLabel = request.displayName ? request.label.trim() : label;
    const displayName = request.displayName?.trim() || label;
    const sampleSymbol = request.sampleSymbol?.trim().toUpperCase() || data.watchlist[0];
    if (!sampleSymbol) throw new Error("Add at least one stock before adding a CNBC metric.");

    await validateCnbcMetric(sampleSymbol, cnbcLabel, request.type);

    metric = {
      id,
      label: displayName,
      type: request.type,
      width: 128,
      description: `CNBC metric: ${cnbcLabel}`,
      source: "cnbc",
      cnbcLabel,
      removable: true
    };
  } else {
    validateFormulaSyntax(request.formula);
    const identifiers = getFormulaIdentifiers(request.formula);
    const allowedIds = new Set(["price", ...data.metricDefinitions.map((item) => item.id)]);
    const unknownIdentifier = identifiers.find((identifier) => !allowedIds.has(identifier));
    if (unknownIdentifier) {
      throw new Error(`Formula uses unknown metric "${unknownIdentifier}".`);
    }

    const sampleValues = Object.values(data.snapshots)
      .filter((snapshot) => snapshot.status === "ready")
      .map((snapshot) => evaluateFormula(request.formula, getFormulaValueMap(snapshot, data.metricDefinitions)));

    if (!sampleValues.some((value) => value !== null)) {
      throw new Error("Formula did not return a valid number for any refreshed stock. Refresh data or adjust the formula.");
    }

    metric = {
      id,
      label,
      type: request.type,
      width: 128,
      description: `Formula: ${request.formula}`,
      source: "formula",
      formula: request.formula,
      removable: true
    };
  }

  data.metricDefinitions.push(metric);
  data.settings.enabledMetricIds.push(metric.id);
  recomputeFormulaMetrics(data);
  setData(data);
  publishData();
  return getData();
});

ipcMain.handle("dashboard:removeMetric", async (_event, metricId: string) => {
  const data = getData();
  const metric = data.metricDefinitions.find((item) => item.id === metricId);
  if (!metric?.removable) return data;

  data.metricDefinitions = data.metricDefinitions.filter((item) => item.id !== metricId);
  data.settings.enabledMetricIds = data.settings.enabledMetricIds.filter((id) => id !== metricId);
  for (const snapshot of Object.values(data.snapshots)) {
    delete snapshot.values?.[metricId];
  }
  setData(data);
  publishData();
  return getData();
});

ipcMain.handle("dashboard:refreshStocks", async (_event, symbols?: string[]) => {
  const data = getData();
  const requestedSymbols = (symbols?.length ? symbols : data.watchlist).map((item: string) => item.toUpperCase());
  const limit = pLimit(data.settings.refreshConcurrency);

  for (const symbol of requestedSymbols) {
    data.snapshots[symbol] = {
      ...data.snapshots[symbol],
      symbol,
      status: "loading"
    };
  }
  setData(data);
  publishData();

  await Promise.all(
    requestedSymbols.map((symbol) =>
      limit(async () => {
        let nextSnapshot: StockSnapshot;
        try {
          nextSnapshot = await fetchCnbcStock(symbol, getData().metricDefinitions);
        } catch (error) {
          nextSnapshot = {
            ...getData().snapshots[symbol],
            symbol,
            status: "error",
            error: error instanceof Error ? error.message : "Unknown refresh error",
            fetchedAt: new Date().toISOString()
          };
        }

        const latest = getData();
        latest.snapshots[symbol] = nextSnapshot;
        setData(latest);
        publishData();
      })
    )
  );

  return getData();
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
