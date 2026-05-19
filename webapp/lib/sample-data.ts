/**
 * Browser-side Schwab CSV generators.
 * Produces realistic sample data that the engine's normaliser can parse.
 * No server call needed — runs entirely in the browser.
 */

const ACCOUNT_REF = "SCHWAB-DEMO-7421";

const HOLDINGS = [
  { symbol: "VOO",  description: "Vanguard S&P 500 ETF",       qty: 35, cost: 465.00, price: 510.20 },
  { symbol: "QQQ",  description: "Invesco Nasdaq-100 ETF",      qty: 20, cost: 420.50, price: 468.75 },
  { symbol: "AAPL", description: "Apple Inc",                   qty: 50, cost: 175.30, price: 211.40 },
  { symbol: "MSFT", description: "Microsoft Corp",              qty: 15, cost: 390.00, price: 432.80 },
  { symbol: "NVDA", description: "NVIDIA Corp",                 qty: 60, cost:  82.00, price: 109.60 },
  { symbol: "GOOGL",description: "Alphabet Inc Class A",        qty: 25, cost: 170.00, price: 173.20 },
  { symbol: "JPM",  description: "JPMorgan Chase & Co",         qty: 20, cost: 196.50, price: 234.90 },
  { symbol: "JNJ",  description: "Johnson & Johnson",           qty: 20, cost: 148.00, price: 155.30 },
  { symbol: "XOM",  description: "Exxon Mobil Corp",            qty: 25, cost: 115.00, price: 114.80 },
];

const CASH = 5000.00;

// ── Holdings CSV (Schwab Positions format) ────────────────────────────────────
export function makeSchwabHoldingsCsv(): string {
  const header = [
    `"Positions for account ${ACCOUNT_REF} as of 04/30/2026"`,
    "",
    "Symbol,Description,Quantity,Price,Price Change %,Price Change $,Market Value," +
    "Day Change %,Day Change $,Cost Basis,Gain/Loss %,Gain/Loss $," +
    "Ratings,Reinvest Dividends?,Capital Gains?,% Of Account,Security Type",
  ];

  const rows = HOLDINGS.map(({ symbol, description, qty, cost, price }) => {
    const totalCost = (qty * cost).toFixed(2);
    const mktVal   = (qty * price).toFixed(2);
    const gl       = (qty * price - qty * cost).toFixed(2);
    const glPct    = ((qty * price / (qty * cost) - 1) * 100).toFixed(2);
    return `${symbol},"${description}",${qty},${price.toFixed(2)},,,${mktVal},,,${totalCost},${glPct},${gl},,,,,`;
  });

  const cashRow = `"Cash & Cash Investments","Cash & Cash Investments",,,,,${ CASH.toFixed(2) },,,,,,,,,,Cash and Money Market`;
  return [...header, ...rows, cashRow].join("\n");
}

// ── Transactions CSV (Schwab Transactions format) ─────────────────────────────
export function makeSchwabTransactionsCsv(): string {
  type Row = { date: string; action: string; symbol: string; description: string; qty: string; price: string; fees: string; amount: string };
  const rows: Row[] = [];

  const start = new Date("2024-05-13");
  const fmt   = (d: Date) => d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

  const tx = (date: Date, action: string, symbol: string, description: string,
               qty: number, price: number, fees: number, amount: number) =>
    rows.push({
      date:    fmt(date),
      action,
      symbol,
      description,
      qty:     qty ? qty.toFixed(4) : "",
      price:   price ? price.toFixed(4) : "",
      fees:    fees.toFixed(2),
      amount:  amount.toFixed(2),
    });

  // Initial deposit
  tx(start, "MoneyLink Deposit", "", "Initial transfer from bank", 0, 0, 0, 65000);

  // Buy all positions day 2
  for (const { symbol, description, qty, cost } of HOLDINGS) {
    tx(addDays(start, 1), "Buy", symbol, description, qty, cost, 0, -(qty * cost));
  }

  // Dividends
  const divs: [string, number, number][] = [
    ["VOO",  90, 1.65], ["VOO", 180, 1.72], ["VOO", 270, 1.68],
    ["VOO", 365, 1.71], ["VOO", 455, 1.78], ["VOO", 545, 1.82],
    ["QQQ",  85, 0.62], ["QQQ", 175, 0.64], ["QQQ", 265, 0.61],
    ["QQQ", 360, 0.67], ["QQQ", 450, 0.70],
    ["AAPL",  70, 0.25], ["AAPL", 160, 0.25], ["AAPL", 250, 0.25],
    ["AAPL", 345, 0.25], ["AAPL", 435, 0.25],
    ["MSFT",  80, 0.75], ["MSFT", 170, 0.75], ["MSFT", 260, 0.83],
    ["MSFT", 355, 0.83],
    ["JPM",   75, 1.15], ["JPM", 165, 1.15], ["JPM", 255, 1.25],
    ["JPM",  350, 1.25],
    ["JNJ",   72, 1.24], ["JNJ", 162, 1.24], ["JNJ", 252, 1.24],
    ["JNJ",  347, 1.24],
    ["XOM",   68, 0.95], ["XOM", 158, 0.95], ["XOM", 248, 0.99],
    ["XOM",  343, 0.99],
  ];
  const holdingQty: Record<string, number> = Object.fromEntries(HOLDINGS.map(h => [h.symbol, h.qty]));
  for (const [symbol, offset, divPs] of divs) {
    const qty = holdingQty[symbol] ?? 0;
    tx(addDays(start, offset), "Cash Dividend", symbol, `${symbol} Quarterly Dividend`, 0, 0, 0, qty * divPs);
  }

  // DCA buys
  const dca: [number, string, number, number][] = [
    [ 90, "VOO",  3, 472],
    [120, "NVDA", 10, 96],
    [180, "QQQ",  2, 438],
    [240, "AAPL", 5, 195],
    [300, "MSFT", 2, 415],
    [400, "JPM",  3, 218],
    [480, "VOO",  2, 498],
  ];
  for (const [offset, symbol, qty, price] of dca) {
    const desc = HOLDINGS.find(h => h.symbol === symbol)?.description ?? symbol;
    tx(addDays(start, offset), "Buy", symbol, desc, qty, price, 0, -(qty * price));
  }

  // One sell
  tx(addDays(start, 200), "Sell", "JNJ", "Johnson & Johnson — partial", 2, 144.50, 0, 289);

  // Sort by parsed date
  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const fields = ["Date", "Action", "Symbol", "Description", "Quantity", "Price", "Fees & Comm", "Amount"];
  const csvRows = rows.map(r =>
    [r.date, r.action, r.symbol, `"${r.description}"`, r.qty, r.price, r.fees, r.amount].join(",")
  );

  return [
    `"Transactions for account ${ACCOUNT_REF}"`,
    "",
    fields.join(","),
    ...csvRows,
    '"Transactions Total","","","","","","",""',
  ].join("\n");
}

// ── File helpers ──────────────────────────────────────────────────────────────
export function csvToFile(content: string, filename: string): File {
  return new File([content], filename, { type: "text/csv" });
}

export function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const sampleHoldingsFile  = () => csvToFile(makeSchwabHoldingsCsv(),     "schwab_holdings_sample.csv");
export const sampleTransactionsFile = () => csvToFile(makeSchwabTransactionsCsv(), "schwab_transactions_sample.csv");

export const PORTFOLIO_SUMMARY = {
  positions:    HOLDINGS.length,
  totalInvested: HOLDINGS.reduce((s, h) => s + h.qty * h.cost, 0) + CASH,
  currentValue:  HOLDINGS.reduce((s, h) => s + h.qty * h.price, 0) + CASH,
  tickers:       HOLDINGS.map(h => h.symbol),
};
