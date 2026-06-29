import type { MetricDefinition, StockSnapshot } from "../electron/shared/types";

export function getSnapshotMetricValue(snapshot: StockSnapshot, metric: MetricDefinition) {
  return snapshot.values?.[metric.id] ?? snapshot[metric.id as keyof StockSnapshot];
}

export function formatValue(snapshot: StockSnapshot, metric: MetricDefinition): string {
  return formatMetricValue(getSnapshotMetricValue(snapshot, metric), metric);
}

export function formatMetricValue(value: unknown, metric: Pick<MetricDefinition, "type">): string {
  if (value === null || value === undefined || value === "") return "-";

  if (metric.type === "currency" && typeof value === "number") {
    return formatCompactCurrency(value);
  }

  if (metric.type === "percent" && typeof value === "number") {
    return `${value.toFixed(2)}%`;
  }

  if (metric.type === "number" && typeof value === "number") {
    return value.toLocaleString("en-US", {
      maximumFractionDigits: 2
    });
  }

  if (metric.type === "date" && typeof value === "string") {
    return formatDate(value);
  }

  return String(value);
}

function formatCompactCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  });
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

export function formatFetchedAt(value?: string): string {
  if (!value) return "Never refreshed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown refresh";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
