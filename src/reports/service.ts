import { supabase } from "@/src/lib/supabase";
import type { GenerateReportRequest, GenerateReportResponse, Report } from "./types";

const FUNCTION_NAME = "generate-report";

/**
 * Invokes the generate-report edge function.
 * Returns the download URL on success, throws on error.
 */
export async function generateReport(
  req: GenerateReportRequest,
): Promise<GenerateReportResponse> {
  const { data, error } = await supabase.functions.invoke<GenerateReportResponse>(
    FUNCTION_NAME,
    { body: req },
  );
  if (error) throw new Error(error.message ?? "Report generation failed");
  if (!data?.download_url) throw new Error("No download URL returned");
  return data;
}

/**
 * Fetches the report history for the current user, most recent first.
 * Returns at most `limit` records.
 */
export async function listReports(limit = 20): Promise<Report[]> {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Report[];
}

/** Deletes a report record (and its storage file, handled by edge fn / cron). */
export async function deleteReport(reportId: string): Promise<void> {
  const { error } = await supabase.from("reports").delete().eq("id", reportId);
  if (error) throw new Error(error.message);
}

/** Returns true if the current user has at least one active connected account. */
export async function checkConnectedProfile(): Promise<boolean> {
  // Check brokerage_accounts (new multi-account table)
  const { count: bc } = await supabase
    .from("brokerage_accounts")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  if ((bc ?? 0) > 0) return true;

  // Fall back: snaptrade_connections (legacy single-account)
  const { data: snap } = await supabase
    .from("snaptrade_connections")
    .select("account_id")
    .maybeSingle();
  if (snap?.account_id) return true;

  // Last resort: any portfolio snapshot means they've synced before
  const { count: sc } = await supabase
    .from("portfolio_snapshots")
    .select("id", { count: "exact", head: true });
  return (sc ?? 0) > 0;
}
