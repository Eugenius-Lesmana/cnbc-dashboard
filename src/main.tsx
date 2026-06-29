import React from "react";
import ReactDOM from "react-dom/client";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Columns3,
  GripVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X
} from "lucide-react";
import type { AddMetricRequest, AppData, MetricDefinition, MetricType, StockSnapshot } from "../electron/shared/types";
import { dashboardApi } from "./dashboardApi";
import { formatFetchedAt, formatMetricValue, formatValue, getSnapshotMetricValue } from "./format";
import "./styles.css";

type SortState = {
  metricId: string;
  direction: "asc" | "desc";
};

const staleAfterMs = 10 * 60 * 1000;

const emptyData: AppData = {
  watchlist: [],
  settings: {
    enabledMetricIds: [],
    refreshConcurrency: 4
  },
  snapshots: {},
  metricDefinitions: []
};

function App() {
  const [data, setData] = React.useState<AppData>(emptyData);
  const [symbol, setSymbol] = React.useState("");
  const [sort, setSort] = React.useState<SortState>({ metricId: "symbol", direction: "asc" });
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [draggedMetricId, setDraggedMetricId] = React.useState<string | null>(null);
  const [isAddColumnOpen, setIsAddColumnOpen] = React.useState(false);
  const [columnKind, setColumnKind] = React.useState<"cnbc" | "formula">("cnbc");
  const [columnLabel, setColumnLabel] = React.useState("");
  const [columnDisplayName, setColumnDisplayName] = React.useState("");
  const [columnType, setColumnType] = React.useState<MetricType>("number");
  const [columnFormula, setColumnFormula] = React.useState("");
  const [columnError, setColumnError] = React.useState("");
  const [isAddingColumn, setIsAddingColumn] = React.useState(false);

  React.useEffect(() => {
    void dashboardApi.getData().then(setData);
    return dashboardApi.onData(setData);
  }, []);

  const metricById = React.useMemo(
    () => new Map<string, MetricDefinition>(data.metricDefinitions.map((metric) => [metric.id, metric])),
    [data.metricDefinitions]
  );
  const enabledMetrics = React.useMemo(
    () =>
      data.settings.enabledMetricIds
        .map((metricId) => metricById.get(metricId))
        .filter((metric): metric is MetricDefinition => Boolean(metric)),
    [data.settings.enabledMetricIds, metricById]
  );
  const rows = React.useMemo(() => {
    return data.watchlist
      .map((item) => data.snapshots[item] ?? ({ symbol: item, status: "idle" } satisfies StockSnapshot))
      .sort((a, b) => compareRows(a, b, sort, enabledMetrics));
  }, [data, enabledMetrics, sort]);

  async function addStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSymbol = symbol.trim().toUpperCase();
    if (!nextSymbol) return;
    setSymbol("");
    const nextData = await dashboardApi.addStock(nextSymbol);
    setData(nextData);
    if (!isEditMode) {
      void refreshStocks([nextSymbol]);
    }
  }

  async function refreshStocks(symbols?: string[]) {
    if (isEditMode) return;
    setIsRefreshing(true);
    try {
      const nextData = await dashboardApi.refreshStocks(symbols);
      setData(nextData);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function toggleMetric(metric: MetricDefinition) {
    const current = data.settings.enabledMetricIds;
    const next = current.includes(metric.id)
      ? current.filter((id) => id !== metric.id)
      : [...current, metric.id];

    const nextData = await dashboardApi.updateMetrics(next);
    setData(nextData);
  }

  async function reorderMetrics(nextMetricIds: string[]) {
    const nextData = await dashboardApi.updateMetrics(nextMetricIds);
    setData(nextData);
  }

  function moveMetric(metricId: string, direction: -1 | 1) {
    const current = data.settings.enabledMetricIds;
    const currentIndex = current.indexOf(metricId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.length) return;

    const next = [...current];
    const [moved] = next.splice(currentIndex, 1);
    next.splice(nextIndex, 0, moved);
    void reorderMetrics(next);
  }

  function dropMetric(targetMetricId: string) {
    if (!draggedMetricId || draggedMetricId === targetMetricId) {
      setDraggedMetricId(null);
      return;
    }

    const current = data.settings.enabledMetricIds;
    const draggedIndex = current.indexOf(draggedMetricId);
    const targetIndex = current.indexOf(targetMetricId);
    if (draggedIndex < 0 || targetIndex < 0) {
      setDraggedMetricId(null);
      return;
    }

    const next = [...current];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(targetIndex, 0, moved);
    setDraggedMetricId(null);
    void reorderMetrics(next);
  }

  function updateSort(metricId: string) {
    if (isEditMode) return;
    setSort((current) => {
      if (current.metricId !== metricId) {
        return { metricId, direction: "asc" };
      }
      return {
        metricId,
        direction: current.direction === "asc" ? "desc" : "asc"
      };
    });
  }

  async function addColumn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setColumnError("");
    setIsAddingColumn(true);

    try {
      const request: AddMetricRequest =
        columnKind === "cnbc"
          ? {
              kind: "cnbc",
              label: columnLabel,
              displayName: columnDisplayName,
              type: columnType,
              sampleSymbol: data.watchlist[0]
            }
          : {
              kind: "formula",
              label: columnLabel,
              formula: columnFormula,
              type: columnType
            };

      const nextData = await dashboardApi.addMetric(request);
      setData(nextData);
      setColumnLabel("");
      setColumnDisplayName("");
      setColumnFormula("");
      setColumnType("number");
      setIsAddColumnOpen(false);
    } catch (error) {
      setColumnError(error instanceof Error ? error.message : "Could not add column.");
    } finally {
      setIsAddingColumn(false);
    }
  }

  async function removeMetric(metricId: string) {
    const nextData = await dashboardApi.removeMetric(metricId);
    setData(nextData);
  }

  const loadingCount = rows.filter((row) => row.status === "loading").length;
  const errorCount = rows.filter((row) => row.status === "error").length;
  const staleCount = rows.filter((row) => row.status === "ready" && isSnapshotStale(row)).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Stock Dashboard</h1>
          <p>{data.watchlist.length} stocks tracked | {enabledMetrics.length} metrics shown</p>
        </div>
        <div className="topbar-actions">
          <form className="symbol-form" onSubmit={addStock}>
            <Search size={17} aria-hidden="true" />
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              placeholder="Add ticker"
              aria-label="Add ticker"
            />
            <button type="submit">
              <Plus size={17} aria-hidden="true" />
              Add
            </button>
          </form>
          <button
            className={isEditMode ? "secondary-action active" : "secondary-action"}
            type="button"
            onClick={() => setIsEditMode((current) => !current)}
          >
            {isEditMode ? <Check size={17} aria-hidden="true" /> : <Pencil size={17} aria-hidden="true" />}
            {isEditMode ? "Done" : "Edit columns"}
          </button>
          <button
            className="primary-action"
            type="button"
            onClick={() => void refreshStocks()}
            disabled={isRefreshing || isEditMode}
            title={isEditMode ? "Finish editing columns before refreshing." : "Refresh all stocks"}
          >
            <RefreshCw size={17} className={isRefreshing ? "spin" : ""} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      <section className="status-row" aria-label="Dashboard status">
        <div>
          <span className="status-value">{loadingCount}</span>
          <span className="status-label">Refreshing</span>
        </div>
        <div>
          <span className="status-value">{errorCount}</span>
          <span className="status-label">Failed</span>
        </div>
        <div>
          <span className="status-value">{staleCount}</span>
          <span className="status-label">Stale</span>
        </div>
        <div>
          <span className="status-value">{data.settings.refreshConcurrency}</span>
          <span className="status-label">Parallel requests</span>
        </div>
      </section>

      <section className={isEditMode ? "metric-panel edit-active" : "metric-panel"} aria-label="Metric columns">
        <div className="panel-title">
          <Columns3 size={18} aria-hidden="true" />
          <span>{isEditMode ? "Column edit mode" : "Columns"}</span>
        </div>
        <div className="metric-list">
          {data.metricDefinitions.map((metric) => (
            <span key={metric.id} className="metric-chip-wrap">
              <button
                type="button"
                className={data.settings.enabledMetricIds.includes(metric.id) ? "metric-chip active" : "metric-chip"}
                onClick={() => void toggleMetric(metric)}
                title={metric.description}
              >
                {metric.label}
              </button>
              {metric.removable ? (
                <button
                  type="button"
                  className="metric-remove"
                  onClick={() => void removeMetric(metric.id)}
                  title={`Remove ${metric.label}`}
                  aria-label={`Remove ${metric.label}`}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              ) : null}
            </span>
          ))}
          <button type="button" className="add-column-button" onClick={() => setIsAddColumnOpen(true)}>
            <Plus size={15} aria-hidden="true" />
            Add column
          </button>
        </div>
      </section>

      <section className="table-frame" aria-label="Stock comparison table">
        <div className="table-scroller">
          <table>
            <thead>
              <tr>
                <th className="sticky symbol-column">
                  <button type="button" onClick={() => updateSort("symbol")}>
                    Symbol
                    <SortIcon sort={sort} metricId="symbol" />
                  </button>
                </th>
                <th className="sticky price-column">
                  <button type="button" onClick={() => updateSort("price")}>
                    Price
                    <SortIcon sort={sort} metricId="price" />
                  </button>
                </th>
                <th className="sticky status-column">Status</th>
                <th className="sticky refreshed-column">
                  <button type="button" onClick={() => updateSort("fetchedAt")}>
                    Last refreshed
                    <SortIcon sort={sort} metricId="fetchedAt" />
                  </button>
                </th>
                {enabledMetrics.map((metric) => (
                  <th
                    key={metric.id}
                    className={draggedMetricId === metric.id ? "metric-header dragging" : "metric-header"}
                    style={{ minWidth: isEditMode ? Math.max(metric.width, 154) : metric.width }}
                    draggable={isEditMode}
                    onDragStart={() => setDraggedMetricId(metric.id)}
                    onDragOver={(event) => {
                      if (isEditMode) event.preventDefault();
                    }}
                    onDrop={() => dropMetric(metric.id)}
                    onDragEnd={() => setDraggedMetricId(null)}
                  >
                    {isEditMode ? (
                      <div className="edit-header-controls">
                        <GripVertical size={15} aria-hidden="true" />
                        <span>{metric.label}</span>
                        <button
                          type="button"
                          onClick={() => moveMetric(metric.id, -1)}
                          disabled={data.settings.enabledMetricIds.indexOf(metric.id) === 0}
                          title={`Move ${metric.label} left`}
                          aria-label={`Move ${metric.label} left`}
                        >
                          <ArrowLeft size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveMetric(metric.id, 1)}
                          disabled={data.settings.enabledMetricIds.indexOf(metric.id) === data.settings.enabledMetricIds.length - 1}
                          title={`Move ${metric.label} right`}
                          aria-label={`Move ${metric.label} right`}
                        >
                          <ArrowRight size={14} aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => updateSort(metric.id)}>
                        {metric.label}
                        <SortIcon sort={sort} metricId={metric.id} />
                      </button>
                    )}
                  </th>
                ))}
                <th className="action-column">Actions</th>
              </tr>
            </thead>
            {isEditMode ? (
              <tbody>
                <tr>
                  <td className="edit-placeholder" colSpan={enabledMetrics.length + 5}>
                    Table data is hidden while editing columns.
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {rows.map((row) => (
                  <tr key={row.symbol}>
                    <td className="sticky symbol-column">
                      <strong>{row.symbol}</strong>
                    </td>
                    <td className="sticky price-column">{formatMetricValue(row.price, { type: "currency" })}</td>
                    <td className="sticky status-column">
                      <StatusPill snapshot={row} />
                    </td>
                    <td className="sticky refreshed-column">{formatFetchedAt(row.fetchedAt)}</td>
                    {enabledMetrics.map((metric) => (
                      <td key={metric.id}>{formatValue(row, metric)}</td>
                    ))}
                    <td className="action-column">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => void refreshStocks([row.symbol])}
                        title={`Refresh ${row.symbol}`}
                        aria-label={`Refresh ${row.symbol}`}
                      >
                        <RefreshCw size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        onClick={() => void dashboardApi.removeStock(row.symbol).then(setData)}
                        title={`Remove ${row.symbol}`}
                        aria-label={`Remove ${row.symbol}`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      </section>

      {isAddColumnOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={addColumn}>
            <div className="modal-header">
              <h2>Add column</h2>
              <button type="button" className="icon-button" onClick={() => setIsAddColumnOpen(false)} aria-label="Close">
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="segmented-control" role="tablist" aria-label="Column type">
              <button
                type="button"
                className={columnKind === "cnbc" ? "active" : ""}
                onClick={() => {
                  setColumnKind("cnbc");
                  setColumnError("");
                }}
              >
                CNBC metric
              </button>
              <button
                type="button"
                className={columnKind === "formula" ? "active" : ""}
                onClick={() => {
                  setColumnKind("formula");
                  setColumnError("");
                }}
              >
                Custom formula
              </button>
            </div>

            {columnKind === "cnbc" ? (
              <>
                <label className="field">
                  <span>CNBC metric label</span>
                  <input
                    value={columnLabel}
                    onChange={(event) => setColumnLabel(event.target.value)}
                    placeholder="Example: Dividend"
                    required
                  />
                </label>
                <label className="field">
                  <span>Display name</span>
                  <input
                    value={columnDisplayName}
                    onChange={(event) => setColumnDisplayName(event.target.value)}
                    placeholder="Leave blank to use the CNBC label"
                  />
                </label>
              </>
            ) : (
              <>
                <label className="field">
                  <span>Column name</span>
                  <input
                    value={columnLabel}
                    onChange={(event) => setColumnLabel(event.target.value)}
                    placeholder="Example: P/E to dividend"
                    required
                  />
                </label>
                <label className="field">
                  <span>Formula</span>
                  <input
                    value={columnFormula}
                    onChange={(event) => setColumnFormula(event.target.value)}
                    placeholder="Example: pe / dividend"
                    required
                  />
                </label>
                <div className="formula-help">
                  <span>Available metric ids</span>
                  <div>
                    <button type="button" onClick={() => setColumnFormula((value) => `${value} price`.trim())}>
                      price
                    </button>
                    {data.metricDefinitions.map((metric) => (
                      <button
                        key={metric.id}
                        type="button"
                        onClick={() => setColumnFormula((value) => `${value} ${metric.id}`.trim())}
                      >
                        {metric.id}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <label className="field">
              <span>Value type</span>
              <select value={columnType} onChange={(event) => setColumnType(event.target.value as MetricType)}>
                <option value="number">Number</option>
                <option value="currency">Currency</option>
                <option value="percent">Percent</option>
                {columnKind === "cnbc" ? (
                  <>
                    <option value="date">Date</option>
                    <option value="text">Text</option>
                  </>
                ) : null}
              </select>
            </label>

            {columnError ? <div className="form-error">{columnError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="secondary-action" onClick={() => setIsAddColumnOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary-action" disabled={isAddingColumn}>
                {isAddingColumn ? "Checking..." : "Add column"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function compareRows(a: StockSnapshot, b: StockSnapshot, sort: SortState, metrics: MetricDefinition[]) {
  const direction = sort.direction === "asc" ? 1 : -1;
  if (sort.metricId === "symbol") {
    return a.symbol.localeCompare(b.symbol) * direction;
  }

  if (sort.metricId === "status") {
    return (String(a.status ?? "").localeCompare(String(b.status ?? "")) || a.symbol.localeCompare(b.symbol)) * direction;
  }

  if (sort.metricId === "fetchedAt") {
    const aTime = a.fetchedAt ? new Date(a.fetchedAt).getTime() : 0;
    const bTime = b.fetchedAt ? new Date(b.fetchedAt).getTime() : 0;
    return (aTime - bTime || a.symbol.localeCompare(b.symbol)) * direction;
  }

  const metric = metrics.find((item) => item.id === sort.metricId);
  const aValue = sort.metricId === "price" ? a.price : metric ? getSnapshotMetricValue(a, metric) : undefined;
  const bValue = sort.metricId === "price" ? b.price : metric ? getSnapshotMetricValue(b, metric) : undefined;
  const aMissing = aValue === null || aValue === undefined || aValue === "";
  const bMissing = bValue === null || bValue === undefined || bValue === "";

  if (aMissing && bMissing) return a.symbol.localeCompare(b.symbol);
  if (aMissing) return 1;
  if (bMissing) return -1;

  if (metric?.type === "date") {
    return (String(aValue).localeCompare(String(bValue)) || a.symbol.localeCompare(b.symbol)) * direction;
  }

  if (typeof aValue === "number" && typeof bValue === "number") {
    return (aValue - bValue || a.symbol.localeCompare(b.symbol)) * direction;
  }

  return (String(aValue).localeCompare(String(bValue)) || a.symbol.localeCompare(b.symbol)) * direction;
}

function SortIcon({ sort, metricId }: { sort: SortState; metricId: string }) {
  if (sort.metricId !== metricId) return null;
  return sort.direction === "asc" ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />;
}

function StatusPill({ snapshot }: { snapshot: StockSnapshot }) {
  if (snapshot.status === "loading") return <span className="pill loading">Loading</span>;
  if (snapshot.status === "error") return <span className="pill error" title={snapshot.error}>Failed</span>;
  if (snapshot.status === "ready") {
    return isSnapshotStale(snapshot) ? <span className="pill stale">Stale</span> : <span className="pill ready">Fresh</span>;
  }
  return <span className="pill idle">Not loaded</span>;
}

function isSnapshotStale(snapshot: StockSnapshot) {
  const refreshedAt = snapshot.fetchedAt ? new Date(snapshot.fetchedAt).getTime() : 0;
  return refreshedAt <= 0 || Date.now() - refreshedAt > staleAfterMs;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
