/**
 * generate-report — Supabase Edge Function
 *
 * Generates downloadable financial reports (CSV, XLSX, PDF) for authenticated
 * users who have a connected brokerage/bank account.
 *
 * POST /functions/v1/generate-report
 * Body: { report_type, format, date_range_start?, date_range_end? }
 *
 * Returns: { report_id, download_url, expires_at }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "xlsx";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// ── Env ───────────────────────────────────────────────────────────────────────

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SIGNED_URL_EXPIRES  = 86400; // 24 h in seconds

// ── Types ─────────────────────────────────────────────────────────────────────

type ReportType = "portfolio_summary" | "holdings" | "performance" | "transactions";
type Format     = "csv" | "xlsx" | "pdf";

interface RequestBody {
  report_type:       ReportType;
  format:            Format;
  date_range_start?: string; // ISO date string YYYY-MM-DD
  date_range_end?:   string;
}

interface HoldingRow {
  symbol: string; name: string; sector: string;
  quantity: number; avg_cost: number; current_price: number;
  market_value: number; unrealized_pnl: number; unrealized_pnl_pct: number;
}

interface TransactionRow {
  transaction_type: string; executed_at: string; symbol: string;
  quantity: number; price: number; net_amount: number; fees: number; account_name: string;
}

interface PerformanceRow {
  period: string; total_return_pct: number; sharpe_ratio: number;
  alpha: number; beta: number; max_drawdown: number; volatility: number;
}

interface SummaryRow {
  total_value: number; cash_balance: number; invested_value: number;
  total_pnl: number; total_pnl_pct: number; position_count: number;
}

// ── CORS headers ──────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin":  Deno.env.get("ALLOWED_ORIGIN") ?? "https://platstock.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

// ── Supabase admin client (bypasses RLS for data fetching) ────────────────────

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function verifyUser(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

async function hasConnectedProfile(userId: string): Promise<boolean> {
  const sb = adminClient();
  // Check brokerage_accounts (new multi-account table)
  const { count: bc } = await sb
    .from("brokerage_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true);
  if ((bc ?? 0) > 0) return true;
  // Fall back to snaptrade_connections (legacy single-account)
  const { data: snap } = await sb
    .from("snaptrade_connections")
    .select("account_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (snap?.account_id) return true;
  // Fall back: any portfolio snapshot means they had data at some point
  const { count: sc } = await sb
    .from("portfolio_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return (sc ?? 0) > 0;
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

// ── Snapshot helpers (guaranteed tables) ─────────────────────────────────────

async function getLatestSnapshot(userId: string) {
  const sb = adminClient();
  const { data } = await sb
    .from("portfolio_snapshots")
    .select("snapshot, captured_at")
    .eq("user_id", userId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function getAllSnapshots(userId: string) {
  const sb = adminClient();
  const { data } = await sb
    .from("portfolio_snapshots")
    .select("snapshot, captured_at")
    .eq("user_id", userId)
    .order("captured_at", { ascending: true });
  return data ?? [];
}

// ── Data fetchers (view-first, snapshot fallback) ─────────────────────────────

async function fetchHoldings(userId: string): Promise<HoldingRow[]> {
  const sb = adminClient();
  // Try the view first
  const { data: viewData, error: viewErr } = await sb
    .from("query_holdings")
    .select("symbol,name,sector,quantity,avg_cost,current_price,market_value,unrealized_pnl,unrealized_pnl_pct")
    .eq("user_id", userId)
    .order("market_value", { ascending: false });
  if (!viewErr && viewData?.length) return viewData as HoldingRow[];

  // Fallback: extract from latest portfolio snapshot
  const snap = await getLatestSnapshot(userId);
  if (!snap) return [];
  const positions: any[] = snap.snapshot?.positions ?? [];
  return positions.map((p: any) => ({
    symbol:             p.symbol?.raw_symbol ?? p.symbol?.id ?? String(p.symbol ?? ""),
    name:               p.symbol?.description ?? "",
    sector:             p.symbol?.type ?? "",
    quantity:           Number(p.units ?? p.quantity ?? 0),
    avg_cost:           Number(p.average_purchase_price ?? 0),
    current_price:      Number(p.price ?? 0),
    market_value:       Number(p.units ?? p.quantity ?? 0) * Number(p.price ?? 0),
    unrealized_pnl:     Number(p.open_pnl ?? 0),
    unrealized_pnl_pct: Number(p.fractional_units ?? 0),
  })).filter(h => h.quantity > 0).sort((a, b) => b.market_value - a.market_value);
}

async function fetchTransactions(
  userId: string,
  startDate?: string,
  endDate?: string,
): Promise<TransactionRow[]> {
  const sb = adminClient();
  // Try transactions table directly (always exists)
  let q = sb
    .from("transactions")
    .select("transaction_type, settled_at, symbol, quantity, price, net_amount, fee, notes")
    .eq("user_id", userId)
    .order("settled_at", { ascending: false });
  if (startDate) q = q.gte("settled_at", startDate);
  if (endDate)   q = q.lte("settled_at", endDate + "T23:59:59Z");
  const { data, error } = await q.limit(1000);
  if (!error && data?.length) {
    return data.map((t: any) => ({
      transaction_type: t.transaction_type,
      executed_at:      t.settled_at,
      symbol:           t.symbol ?? "",
      quantity:         Number(t.quantity ?? 0),
      price:            Number(t.price ?? 0),
      net_amount:       Number(t.net_amount ?? 0),
      fees:             Number(t.fee ?? 0),
      account_name:     t.notes ?? "—",
    }));
  }
  return [];
}

async function fetchPerformance(userId: string): Promise<PerformanceRow[]> {
  const sb = adminClient();
  // Try view first
  const { data: viewData, error: viewErr } = await sb
    .from("query_performance")
    .select("period,total_return_pct,sharpe_ratio,alpha,beta,max_drawdown,volatility")
    .eq("user_id", userId);
  if (!viewErr && viewData?.length) return viewData as PerformanceRow[];

  // Compute basic performance from snapshots
  const snaps = await getAllSnapshots(userId);
  if (snaps.length < 2) return [];

  const totalValue = (snap: any) => {
    const pos = snap.snapshot?.positions ?? [];
    const bal = snap.snapshot?.balances ?? [];
    return pos.reduce((s: number, p: any) => s + Number(p.units ?? 0) * Number(p.price ?? 0), 0)
         + bal.reduce((s: number, b: any) => s + Number(b.cash ?? 0), 0);
  };

  const first = totalValue(snaps[0]);
  const last  = totalValue(snaps[snaps.length - 1]);
  const ret   = first > 0 ? ((last - first) / first) * 100 : 0;
  const nDays = Math.round((new Date(snaps[snaps.length - 1].captured_at).getTime() - new Date(snaps[0].captured_at).getTime()) / 86400000);

  return [{
    period:          `${nDays} days`,
    total_return_pct: round(ret) ?? 0,
    sharpe_ratio:    0,
    alpha:           0,
    beta:            1,
    max_drawdown:    0,
    volatility:      0,
  }];
}

async function fetchSummary(userId: string): Promise<SummaryRow | null> {
  const sb = adminClient();
  // Try view first
  const { data: viewData, error: viewErr } = await sb
    .from("query_portfolio_summary")
    .select("total_value,cash_balance,invested_value,total_pnl,total_pnl_pct,position_count")
    .eq("user_id", userId)
    .maybeSingle();
  if (!viewErr && viewData) return viewData as SummaryRow;

  // Fallback from snapshot
  const snap = await getLatestSnapshot(userId);
  if (!snap) return null;
  const positions: any[] = snap.snapshot?.positions ?? [];
  const balances: any[]  = snap.snapshot?.balances  ?? [];
  const totalPos = positions.reduce((s: number, p: any) => s + Number(p.units ?? 0) * Number(p.price ?? 0), 0);
  const cash     = balances.reduce((s: number, b: any) => s + Number(b.cash ?? 0), 0);
  const pnl      = positions.reduce((s: number, p: any) => s + Number(p.open_pnl ?? 0), 0);
  return {
    total_value:    round(totalPos + cash) ?? 0,
    cash_balance:   round(cash) ?? 0,
    invested_value: round(totalPos) ?? 0,
    total_pnl:      round(pnl) ?? 0,
    total_pnl_pct:  round(totalPos > 0 ? (pnl / (totalPos - pnl)) * 100 : 0) ?? 0,
    position_count: positions.filter((p: any) => Number(p.units ?? 0) > 0).length,
  };
}

// ── Format generators ─────────────────────────────────────────────────────────

function toCsv(headers: string[], rows: (string | number | null)[][]): Uint8Array {
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [headers, ...rows].map(r => r.map(escape).join(",")).join("\n");
  return new TextEncoder().encode(lines);
}

function toXlsx(headers: string[], rows: (string | number | null)[][], sheetName: string): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Bold header row
  for (let c = 0; c < headers.length; c++) {
    const cell = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[cell]) continue;
    ws[cell].s = { font: { bold: true }, fill: { fgColor: { rgb: "1E293B" } } };
  }

  // Auto-width
  ws["!cols"] = headers.map((h, i) => {
    const maxLen = Math.max(h.length, ...rows.map(r => String(r[i] ?? "").length));
    return { wch: Math.min(maxLen + 2, 40) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(buf);
}

async function toPdf(
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number | null)[][],
): Promise<Uint8Array> {
  const doc   = await PDFDocument.create();
  const bold  = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg   = await doc.embedFont(StandardFonts.Helvetica);

  const MARGIN     = 40;
  const PAGE_W     = 842; // A4 landscape width
  const PAGE_H     = 595;
  const ROW_H      = 18;
  const HEADER_H   = 28;
  const COL_W      = Math.min(140, Math.floor((PAGE_W - MARGIN * 2) / headers.length));
  const dark       = rgb(0.07, 0.09, 0.13);   // #131720
  const accent     = rgb(0.23, 0.51, 0.96);   // #3b82f6
  const light      = rgb(0.95, 0.96, 0.98);
  const mutedColor = rgb(0.55, 0.58, 0.62);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y    = PAGE_H - MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y    = PAGE_H - MARGIN;
  };

  // Title block
  page.drawRectangle({ x: 0, y: PAGE_H - 70, width: PAGE_W, height: 70, color: dark });
  page.drawText("Platstock", { x: MARGIN, y: PAGE_H - 28, size: 14, font: bold, color: accent });
  page.drawText(title,     { x: MARGIN, y: PAGE_H - 46, size: 11, font: bold, color: rgb(1,1,1) });
  page.drawText(subtitle,  { x: MARGIN, y: PAGE_H - 62, size: 8,  font: reg,  color: mutedColor });
  y = PAGE_H - 80;

  // Table header
  const drawHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - HEADER_H + 4, width: PAGE_W - MARGIN * 2, height: HEADER_H, color: accent });
    headers.forEach((h, i) => {
      page.drawText(h.toUpperCase(), {
        x: MARGIN + i * COL_W + 4, y: y - 10,
        size: 7, font: bold, color: rgb(1,1,1),
        maxWidth: COL_W - 6,
      });
    });
    y -= HEADER_H;
  };

  drawHeader();

  rows.forEach((row, ri) => {
    if (y < MARGIN + ROW_H + 10) { newPage(); drawHeader(); }
    if (ri % 2 === 0) {
      page.drawRectangle({ x: MARGIN, y: y - ROW_H + 4, width: PAGE_W - MARGIN * 2, height: ROW_H, color: light });
    }
    row.forEach((cell, ci) => {
      const text = cell == null ? "—" : String(cell);
      const isNum = typeof cell === "number";
      const isNeg = isNum && (cell as number) < 0;
      page.drawText(text, {
        x: MARGIN + ci * COL_W + 4, y: y - 10,
        size: 7, font: reg,
        color: isNeg ? rgb(0.94, 0.27, 0.27) : dark,
        maxWidth: COL_W - 6,
      });
    });
    y -= ROW_H;
  });

  const bytes = await doc.save();
  return bytes;
}

// ── Report builders ───────────────────────────────────────────────────────────

type ReportPayload = { headers: string[]; rows: (string | number | null)[][]; sheetName: string; title: string; subtitle: string };

async function buildHoldings(userId: string): Promise<ReportPayload> {
  const data = await fetchHoldings(userId);
  const headers = ["Symbol","Name","Sector","Qty","Avg Cost","Price","Market Value","Unrealized P&L","P&L %"];
  const rows = data.map(h => [
    h.symbol, h.name, h.sector,
    h.quantity, round(h.avg_cost), round(h.current_price),
    round(h.market_value), round(h.unrealized_pnl), round(h.unrealized_pnl_pct),
  ]);
  return { headers, rows, sheetName: "Holdings", title: "Holdings Report", subtitle: `${data.length} positions` };
}

async function buildTransactions(userId: string, start?: string, end?: string): Promise<ReportPayload> {
  const data = await fetchTransactions(userId, start, end);
  const headers = ["Type","Date","Symbol","Qty","Price","Net Amount","Fees","Account"];
  const rows = data.map(t => [
    t.transaction_type, fmtDate(t.executed_at), t.symbol,
    t.quantity, round(t.price), round(t.net_amount), round(t.fees), t.account_name,
  ]);
  return { headers, rows, sheetName: "Transactions", title: "Transaction History", subtitle: `${data.length} transactions` };
}

async function buildPerformance(userId: string): Promise<ReportPayload> {
  const data = await fetchPerformance(userId);
  const headers = ["Period","Return %","Sharpe","Alpha","Beta","Max Drawdown","Volatility"];
  const rows = data.map(p => [
    p.period, round(p.total_return_pct), round(p.sharpe_ratio),
    round(p.alpha), round(p.beta), round(p.max_drawdown), round(p.volatility),
  ]);
  return { headers, rows, sheetName: "Performance", title: "Performance Report", subtitle: `${data.length} periods` };
}

async function buildSummary(userId: string): Promise<ReportPayload> {
  const s = await fetchSummary(userId);
  const headers = ["Metric","Value"];
  const rows: (string | number | null)[][] = s ? [
    ["Total Portfolio Value", round(s.total_value)],
    ["Cash Balance",          round(s.cash_balance)],
    ["Invested Value",        round(s.invested_value)],
    ["Total P&L ($)",         round(s.total_pnl)],
    ["Total P&L (%)",         round(s.total_pnl_pct)],
    ["Open Positions",        s.position_count],
  ] : [["No data", null]];
  return { headers, rows, sheetName: "Summary", title: "Portfolio Summary", subtitle: new Date().toDateString() };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round(n: number | null | undefined, dp = 2): number | null {
  if (n == null) return null;
  return Math.round(n * 10 ** dp) / 10 ** dp;
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return iso; }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return err("Method not allowed", 405);

  // Auth
  const userId = await verifyUser(req.headers.get("authorization"));
  if (!userId) return err("Unauthorized", 401);

  // Connected profile gate
  const connected = await hasConnectedProfile(userId);
  if (!connected) return err("Report generation requires a connected brokerage account", 403);

  // Parse body
  let body: RequestBody;
  try { body = await req.json() as RequestBody; }
  catch { return err("Invalid JSON body"); }

  const { report_type, format, date_range_start, date_range_end } = body;

  const validTypes:   ReportType[] = ["portfolio_summary","holdings","performance","transactions"];
  const validFormats: Format[]     = ["csv","xlsx","pdf"];
  if (!validTypes.includes(report_type))   return err(`Invalid report_type: ${report_type}`);
  if (!validFormats.includes(format))      return err(`Invalid format: ${format}`);

  const sb = adminClient();

  // Create pending report record
  const { data: reportRow, error: insertErr } = await sb
    .from("reports")
    .insert({
      user_id:          userId,
      report_type,
      format,
      status:           "processing",
      date_range_start: date_range_start ?? null,
      date_range_end:   date_range_end   ?? null,
    })
    .select("id, expires_at")
    .single();

  if (insertErr || !reportRow) return err("Failed to create report record", 500);
  const reportId  = reportRow.id as string;
  const expiresAt = reportRow.expires_at as string;

  try {
    // Build data
    let payload: ReportPayload;
    switch (report_type) {
      case "holdings":          payload = await buildHoldings(userId);                                 break;
      case "transactions":      payload = await buildTransactions(userId, date_range_start, date_range_end); break;
      case "performance":       payload = await buildPerformance(userId);                              break;
      case "portfolio_summary": payload = await buildSummary(userId);                                  break;
    }

    // Generate file bytes
    let bytes: Uint8Array;
    let mimeType: string;
    let ext: string;

    switch (format) {
      case "csv": {
        bytes    = toCsv(payload.headers, payload.rows);
        mimeType = "text/csv";
        ext      = "csv";
        break;
      }
      case "xlsx": {
        bytes    = toXlsx(payload.headers, payload.rows, payload.sheetName);
        mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        ext      = "xlsx";
        break;
      }
      case "pdf": {
        bytes    = await toPdf(payload.title, payload.subtitle, payload.headers, payload.rows);
        mimeType = "application/pdf";
        ext      = "pdf";
        break;
      }
    }

    // Upload to storage: {user_id}/{report_id}.{ext}
    const filePath = `${userId}/${reportId}.${ext}`;
    const { error: uploadErr } = await sb.storage
      .from("reports")
      .upload(filePath, bytes, { contentType: mimeType, upsert: false });

    if (uploadErr) throw new Error(`Storage upload: ${uploadErr.message}`);

    // Generate signed URL (24 h)
    const { data: signed, error: signErr } = await sb.storage
      .from("reports")
      .createSignedUrl(filePath, SIGNED_URL_EXPIRES);

    if (signErr || !signed?.signedUrl) throw new Error("Failed to create signed URL");

    // Mark report ready
    await sb.from("reports").update({
      status:          "ready",
      file_path:       filePath,
      file_size_bytes: bytes.byteLength,
    }).eq("id", reportId);

    return json({ report_id: reportId, download_url: signed.signedUrl, expires_at: expiresAt });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await sb.from("reports").update({ status: "failed", error_message: msg }).eq("id", reportId);
    return err(`Report generation failed: ${msg}`, 500);
  }
});
