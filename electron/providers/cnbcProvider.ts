import * as cheerio from "cheerio";
import { defaultMetricDefinitions } from "../shared/defaultMetrics.js";
import { evaluateFormula } from "../shared/formula.js";
import type { MetricDefinition, MetricType, StockSnapshot } from "../shared/types.js";

const CNBC_BASE_URL = "https://www.cnbc.com/quotes";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function safeFloat(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/,/g, "").replace(/[–-]/g, "").trim();
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseScaledNumber(value: string | null | undefined): number | null {
  if (!value || value === "-") return null;
  const cleaned = value.replace(/,/g, "").trim();
  const suffix = cleaned.slice(-1).toUpperCase();
  const number = Number.parseFloat(cleaned.slice(0, -1));
  const multiplier: Record<string, number> = {
    T: 1_000_000_000_000,
    B: 1_000_000_000,
    M: 1_000_000
  };

  if (Number.isFinite(number) && multiplier[suffix]) {
    return number * multiplier[suffix];
  }

  return safeFloat(cleaned);
}

export function parsePercent(value: string | null | undefined): number | null {
  if (!value || value === "-") return null;
  return safeFloat(value.replace("%", ""));
}

export function parseCnbcDate(value: string | null | undefined): string | null {
  if (!value || value === "-") return null;
  const cleaned = value.replace("(est)", "").trim();
  const parts = cleaned.split("/");
  if (parts.length !== 3) return null;

  const [month, day, year] = parts.map((item) => Number.parseInt(item, 10));
  if (!month || !day || !year) return null;

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

function normalizeLabel(label: string) {
  return label.toLowerCase().replace(/\s+/g, " ").trim();
}

function getRawMetric(rawMetrics: Record<string, string>, label: string) {
  const normalizedLabel = normalizeLabel(label);
  const exactKey = Object.keys(rawMetrics).find((key) => normalizeLabel(key) === normalizedLabel);
  return exactKey ? rawMetrics[exactKey] : undefined;
}

function textAt($: cheerio.CheerioAPI, sections: ReturnType<cheerio.CheerioAPI>, sectionIndex: number, itemIndex: number) {
  return sections
    .eq(sectionIndex)
    .find("li.Summary-stat")
    .eq(itemIndex)
    .find("span.Summary-value")
    .text()
    .trim();
}

function collectRawMetrics($: cheerio.CheerioAPI) {
  const rawMetrics: Record<string, string> = {};

  $("li.Summary-stat").each((_index, element) => {
    const label = $(element).find("span.Summary-label").first().text().trim();
    const value = $(element).find("span.Summary-value").first().text().trim();
    if (label && value) {
      rawMetrics[label] = value;
    }
  });

  return rawMetrics;
}

function parseCnbcMetricValue(value: string | undefined, type: MetricType) {
  if (!value || value === "-") return null;
  if (type === "currency") return parseScaledNumber(value);
  if (type === "percent") return parsePercent(value);
  if (type === "number") return safeFloat(value);
  if (type === "date") return parseCnbcDate(value);
  return value;
}

function buildValues(snapshot: StockSnapshot, rawMetrics: Record<string, string>, metricDefinitions: MetricDefinition[]) {
  const values: Record<string, string | number | null> = {
    price: snapshot.price ?? null
  };

  for (const metric of metricDefinitions) {
    if (metric.source === "cnbc" && metric.cnbcLabel) {
      values[metric.id] = parseCnbcMetricValue(getRawMetric(rawMetrics, metric.cnbcLabel), metric.type);
    }
  }

  values.pe ??= snapshot.pe ?? null;
  values.forwardPe ??= snapshot.forwardPe ?? null;
  values.earningsDate ??= snapshot.earningsDate ?? null;
  values.dividendDate ??= snapshot.dividendDate ?? null;
  values.marketCap ??= snapshot.marketCap ?? null;
  values.eps ??= snapshot.eps ?? null;
  values.revenue ??= snapshot.revenue ?? null;
  values.netMargin ??= snapshot.netMargin ?? null;

  for (const metric of metricDefinitions) {
    if (metric.source === "formula" && metric.formula) {
      values[metric.id] = evaluateFormula(metric.formula, values);
    }
  }

  return values;
}

export async function fetchCnbcStock(
  symbol: string,
  metricDefinitions: MetricDefinition[] = defaultMetricDefinitions
): Promise<StockSnapshot> {
  const response = await fetch(`${CNBC_BASE_URL}/${encodeURIComponent(symbol)}`, {
    headers: {
      "User-Agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`CNBC returned ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const lastPriceText =
    $(".QuoteStrip-dataContainerQuoteStrip-extendedHours .QuoteStrip-lastPrice").first().text().trim() ||
    $(".QuoteStrip-lastPriceStripContainer .QuoteStrip-lastPrice").first().text().trim() ||
    $(".QuoteStrip-lastPrice").first().text().trim();

  const sections = $("div.Summary-subsection");
  const rawCnbcMetrics = collectRawMetrics($);
  const price = safeFloat(lastPriceText);
  const forwardPe =
    safeFloat(getRawMetric(rawCnbcMetrics, "Forward P/E 1 Yr.")) ??
    safeFloat(getRawMetric(rawCnbcMetrics, "Forward P/E")) ??
    safeFloat(textAt($, sections, 1, 2));

  const snapshot: StockSnapshot = {
    symbol: symbol.toUpperCase(),
    status: "ready",
    fetchedAt: new Date().toISOString(),
    price,
    marketCap: parseScaledNumber(getRawMetric(rawCnbcMetrics, "Market Cap")) ?? parseScaledNumber(textAt($, sections, 0, 8)),
    eps: safeFloat(getRawMetric(rawCnbcMetrics, "EPS (TTM)")) ?? safeFloat(textAt($, sections, 1, 0)),
    pe: safeFloat(getRawMetric(rawCnbcMetrics, "P/E Ratio")) ?? safeFloat(textAt($, sections, 1, 1)),
    forwardPe,
    forwardEps: forwardPe && price ? Number((price / forwardPe).toFixed(2)) : null,
    revenue: parseScaledNumber(getRawMetric(rawCnbcMetrics, "Revenue")) ?? parseScaledNumber(textAt($, sections, 1, 5)),
    netMargin: parsePercent(getRawMetric(rawCnbcMetrics, "Net Profit Margin")) ?? parsePercent(textAt($, sections, 1, 7)),
    earningsDate: parseCnbcDate(getRawMetric(rawCnbcMetrics, "Earnings Date")) ?? parseCnbcDate(textAt($, sections, 2, 0)),
    dividendDate: parseCnbcDate(getRawMetric(rawCnbcMetrics, "Ex-Dividend Date")) ?? parseCnbcDate(textAt($, sections, 2, 1)),
    rawCnbcMetrics
  };

  snapshot.values = buildValues(snapshot, rawCnbcMetrics, metricDefinitions);
  snapshot.forwardEps = typeof snapshot.values.forwardEps === "number" ? snapshot.values.forwardEps : snapshot.forwardEps;

  return snapshot;
}

export async function validateCnbcMetric(symbol: string, label: string, type: MetricType) {
  const snapshot = await fetchCnbcStock(symbol, []);
  const rawValue = getRawMetric(snapshot.rawCnbcMetrics ?? {}, label);
  const parsedValue = parseCnbcMetricValue(rawValue, type);

  if (rawValue === undefined) {
    throw new Error(`CNBC did not return a metric named "${label}" for ${symbol}.`);
  }

  if (parsedValue === null && type !== "text") {
    throw new Error(`CNBC returned "${rawValue}" for "${label}", but it could not be parsed as ${type}.`);
  }

  return { rawValue, parsedValue };
}
