import type { MetricDefinition } from "./types.js";

export const fixedColumnIds = ["symbol", "price", "status", "fetchedAt"] as const;

export const defaultMetricDefinitions: MetricDefinition[] = [
  {
    id: "pe",
    label: "P/E",
    type: "number",
    width: 96,
    description: "Trailing price-to-earnings ratio from CNBC.",
    source: "cnbc",
    cnbcLabel: "P/E Ratio",
    removable: false
  },
  {
    id: "forwardPe",
    label: "Fwd P/E",
    type: "number",
    width: 112,
    description: "Forward price-to-earnings ratio from CNBC.",
    source: "cnbc",
    cnbcLabel: "Forward P/E 1 Yr.",
    removable: false
  },
  {
    id: "earningsDate",
    label: "Earnings",
    type: "date",
    width: 132,
    description: "Next earnings date from CNBC.",
    source: "cnbc",
    cnbcLabel: "Earnings Date",
    removable: false
  },
  {
    id: "dividendDate",
    label: "Dividend Date",
    type: "date",
    width: 140,
    description: "Next dividend date from CNBC.",
    source: "cnbc",
    cnbcLabel: "Ex-Dividend Date",
    removable: false
  },
  {
    id: "marketCap",
    label: "Market Cap",
    type: "currency",
    width: 140,
    description: "Company market capitalization from CNBC.",
    source: "cnbc",
    cnbcLabel: "Market Cap",
    removable: false
  },
  {
    id: "eps",
    label: "EPS",
    type: "number",
    width: 96,
    description: "Earnings per share from CNBC.",
    source: "cnbc",
    cnbcLabel: "EPS (TTM)",
    removable: false
  },
  {
    id: "forwardEps",
    label: "Fwd EPS",
    type: "number",
    width: 112,
    description: "Calculated from Price divided by Forward P/E.",
    source: "formula",
    formula: "price / forwardPe",
    removable: false
  },
  {
    id: "revenue",
    label: "Revenue",
    type: "currency",
    width: 132,
    description: "Revenue from CNBC.",
    source: "cnbc",
    cnbcLabel: "Revenue",
    removable: false
  },
  {
    id: "netMargin",
    label: "Net Margin",
    type: "percent",
    width: 128,
    description: "Net margin percentage from CNBC.",
    source: "cnbc",
    cnbcLabel: "Net Profit Margin",
    removable: false
  }
];
