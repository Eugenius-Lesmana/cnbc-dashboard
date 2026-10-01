# CNBC Stock Dashboard

A desktop dashboard for tracking a watchlist of stocks. It scrapes each quote page on CNBC, shows the metrics you
choose in a sortable table, and lets you add your own **formula columns** (for example, price divided by a metric).
Built for a financial advisor who wanted his own columns, in his own order, instead of a fixed screen.

Built with Electron, React, TypeScript and Vite. Windows installer via electron-builder.

> **Unofficial.** Not affiliated with CNBC. It reads public quote pages for personal and educational use; check CNBC's
> terms before relying on it. Nothing here is financial advice.

## What it does

- **Watchlist.** Add and remove tickers. Refresh one or all; requests run concurrently (4 at a time) with a
  15-second timeout, so one stalled page cannot hang a refresh.
- **Nine built-in metrics:** P/E, forward P/E, EPS, forward EPS (price ÷ forward P/E), market cap, revenue, net
  margin, next earnings date and next dividend date.
- **Pick and reorder columns.** Choose which metrics show and drag columns into the order you want. Sort by any
  column. Your layout is saved between sessions.
- **Add any metric CNBC shows.** Give the label as it appears on the page and the type (number, percent, currency,
  date, text). The app checks it against the live page first and tells you if it cannot be found or parsed.
- **Formula columns.** Combine metrics with `+ - * /` and parentheses, for example `price / eps`. A formula returns
  *empty* rather than a wrong number when an input is missing, not numeric, or the divisor is zero.

## Run it

```bash
npm install
npm run dev        # Vite + Electron with hot reload
npm test           # unit tests
npm run build      # type-check, bundle, and build the Windows installer into release/
```

Requires Node 20 or later.

## How it is organised

```
electron/main.ts                  window, IPC handlers, persistence (electron-store), refresh concurrency
electron/providers/cnbcProvider.ts  fetches a quote page, extracts metrics, parses CNBC's number/date formats
electron/shared/formula.ts        formula tokenizer and evaluator (shunting-yard, no eval)
electron/shared/defaultMetrics.ts the nine built-in metric definitions
src/main.tsx                      the React interface
tests/                            unit tests for parsing and formulas
```

Formulas are parsed by a small tokenizer and evaluated with reverse Polish notation. There is no `eval`, and only
metric ids, numbers, operators and parentheses are accepted.

## Tests

`npm test` runs 31 unit tests covering the number, percent, scaled-number (`12.5B`) and date parsers, and the formula
engine. Writing them found two real bugs, both now fixed:

- **Negative values lost their sign.** The number parser removed every hyphen, so an EPS of `-1.25` or a margin of
  `-0.45%` was read as positive. Only a lone dash (CNBC's "no data" marker) should be treated as empty.
- **A date inside a formula became its year.** `price / earningsDate` divided by `2026`, because `parseFloat` stops at
  the first non-digit. Formulas now accept only values that are fully numeric.

## Known limitations

- **It scrapes HTML.** If CNBC changes its page markup the parsers need updating. This has already happened once.
- **No unary minus in formulas** (write `0 - eps`, not `-eps`).
- **Refresh is manual.** There is no scheduled refresh in this version.
- Prices are whatever CNBC shows at the moment of the request, which can be delayed.

## History

This is the third version of a tool I built for the same user as his needs grew. The first was a Python scraper
writing to Excel, with a desktop table; the second stored the watchlist in Firebase and added add/remove and
pagination; this one is a rebuild in TypeScript after CNBC changed its page structure, with configurable columns and
formulas.

## Licence

MIT. See [`LICENSE`](LICENSE).
