import { defaultMetricDefinitions } from "../electron/shared/defaultMetrics";
import { evaluateFormula, getFormulaIdentifiers, validateFormulaSyntax } from "../electron/shared/formula";
import type { AddMetricRequest, AppData, DashboardApi, MetricDefinition, StockSnapshot } from "../electron/shared/types";

const fallbackKey = "stock-dashboard:fallback-data";

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

const fallbackData: AppData = {
  watchlist: defaultWatchlist,
  settings: {
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
  },
  snapshots: {},
  metricDefinitions: defaultMetricDefinitions
};

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

function readFallbackData(): AppData {
  const raw = localStorage.getItem(fallbackKey);
  if (!raw) return fallbackData;

  try {
    const parsed = JSON.parse(raw) as AppData;
    const shouldApplyCurrentSeed = parsed.settings.watchlistSeedVersion === undefined;
    const metricDefinitions = normalizeMetricDefinitions(parsed.metricDefinitions);
    const enabledMetricIds = parsed.settings.enabledMetricIds.filter((id) =>
      metricDefinitions.some((metric) => metric.id === id)
    );

    const normalizedData = {
      ...fallbackData,
      ...parsed,
      watchlist: shouldApplyCurrentSeed ? defaultWatchlist : parsed.watchlist,
      metricDefinitions,
      settings: {
        ...fallbackData.settings,
        ...parsed.settings,
        enabledMetricIds
      },
      snapshots: parsed.snapshots ?? {}
    };

    normalizedData.settings.watchlistSeedVersion = fallbackData.settings.watchlistSeedVersion;

    if (shouldApplyCurrentSeed || !parsed.metricDefinitions || enabledMetricIds.length !== parsed.settings.enabledMetricIds.length) {
      writeFallbackData(normalizedData);
    }

    return normalizedData;
  } catch {
    return fallbackData;
  }
}

function writeFallbackData(data: AppData) {
  localStorage.setItem(fallbackKey, JSON.stringify(data));
}

const browserFallbackApi: DashboardApi = {
  async getData() {
    return readFallbackData();
  },
  async addStock(symbol: string) {
    const nextSymbol = symbol.trim().toUpperCase();
    const data = readFallbackData();

    if (nextSymbol && !data.watchlist.includes(nextSymbol)) {
      data.watchlist = [...data.watchlist, nextSymbol].sort();
      data.snapshots[nextSymbol] = {
        symbol: nextSymbol,
        status: "idle"
      };
      writeFallbackData(data);
    }

    return data;
  },
  async removeStock(symbol: string) {
    const nextSymbol = symbol.trim().toUpperCase();
    const data = readFallbackData();
    data.watchlist = data.watchlist.filter((item) => item !== nextSymbol);
    delete data.snapshots[nextSymbol];
    writeFallbackData(data);
    return data;
  },
  async updateMetrics(enabledMetricIds: string[]) {
    const data = readFallbackData();
    data.settings.enabledMetricIds = enabledMetricIds;
    writeFallbackData(data);
    return data;
  },
  async addMetric(request: AddMetricRequest) {
    const data = readFallbackData();
    const label = request.label.trim();
    if (!label) throw new Error("Column name cannot be empty.");

    if (request.kind === "cnbc") {
      throw new Error("CNBC metric validation is only available in the Electron app window.");
    }

    validateFormulaSyntax(request.formula);
    const identifiers = getFormulaIdentifiers(request.formula);
    const allowedIds = new Set(["price", ...data.metricDefinitions.map((metric) => metric.id)]);
    const unknownIdentifier = identifiers.find((identifier) => !allowedIds.has(identifier));
    if (unknownIdentifier) throw new Error(`Formula uses unknown metric "${unknownIdentifier}".`);

    const id = createMetricId(label, data.metricDefinitions.map((metric) => metric.id));
    data.metricDefinitions.push({
      id,
      label,
      type: request.type,
      width: 128,
      description: `Formula: ${request.formula}`,
      source: "formula",
      formula: request.formula,
      removable: true
    });
    data.settings.enabledMetricIds.push(id);
    for (const snapshot of Object.values(data.snapshots)) {
      snapshot.values = { price: snapshot.price ?? null, ...snapshot.values };
      snapshot.values[id] = evaluateFormula(request.formula, snapshot.values);
    }
    writeFallbackData(data);
    return data;
  },
  async removeMetric(metricId: string) {
    const data = readFallbackData();
    const metric = data.metricDefinitions.find((item) => item.id === metricId);
    if (!metric?.removable) return data;
    data.metricDefinitions = data.metricDefinitions.filter((item) => item.id !== metricId);
    data.settings.enabledMetricIds = data.settings.enabledMetricIds.filter((id) => id !== metricId);
    for (const snapshot of Object.values(data.snapshots)) delete snapshot.values?.[metricId];
    writeFallbackData(data);
    return data;
  },
  async refreshStocks(symbols?: string[]) {
    const data = readFallbackData();
    const requestedSymbols = symbols?.length ? symbols : data.watchlist;
    const now = new Date().toISOString();

    for (const symbol of requestedSymbols) {
      const snapshot: StockSnapshot = data.snapshots[symbol] ?? { symbol };
      data.snapshots[symbol] = {
        ...snapshot,
        status: "error",
        error: "Live refresh is only available in the Electron app window.",
        fetchedAt: now
      };
    }

    writeFallbackData(data);
    return data;
  },
  onData() {
    return () => undefined;
  }
};

export const dashboardApi: DashboardApi = window.dashboard ?? browserFallbackApi;
