export type MetricType = "number" | "currency" | "percent" | "date" | "text";

export type MetricDefinition = {
  id: string;
  label: string;
  type: MetricType;
  width: number;
  description: string;
  source: "cnbc" | "formula";
  cnbcLabel?: string;
  formula?: string;
  removable?: boolean;
};

export type StockSnapshot = {
  symbol: string;
  status?: "idle" | "loading" | "ready" | "error";
  error?: string;
  fetchedAt?: string;
  price?: number | null;
  marketCap?: number | null;
  eps?: number | null;
  pe?: number | null;
  forwardPe?: number | null;
  forwardEps?: number | null;
  revenue?: number | null;
  netMargin?: number | null;
  earningsDate?: string | null;
  dividendDate?: string | null;
  values?: Record<string, string | number | null>;
  rawCnbcMetrics?: Record<string, string>;
};

export type DashboardSettings = {
  enabledMetricIds: string[];
  refreshConcurrency: number;
  watchlistSeedVersion?: number;
};

export type AppData = {
  watchlist: string[];
  settings: DashboardSettings;
  snapshots: Record<string, StockSnapshot>;
  metricDefinitions: MetricDefinition[];
};

export type AddCnbcMetricRequest = {
  kind: "cnbc";
  label: string;
  displayName?: string;
  type: MetricType;
  sampleSymbol?: string;
};

export type AddFormulaMetricRequest = {
  kind: "formula";
  label: string;
  formula: string;
  type: MetricType;
};

export type AddMetricRequest = AddCnbcMetricRequest | AddFormulaMetricRequest;

export type DashboardApi = {
  getData: () => Promise<AppData>;
  addStock: (symbol: string) => Promise<AppData>;
  removeStock: (symbol: string) => Promise<AppData>;
  updateMetrics: (enabledMetricIds: string[]) => Promise<AppData>;
  addMetric: (request: AddMetricRequest) => Promise<AppData>;
  removeMetric: (metricId: string) => Promise<AppData>;
  refreshStocks: (symbols?: string[]) => Promise<AppData>;
  onData: (callback: (data: AppData) => void) => () => void;
};
