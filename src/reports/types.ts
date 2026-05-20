export type ReportType = "portfolio_summary" | "holdings" | "performance" | "transactions";
export type ReportFormat = "csv" | "xlsx" | "pdf";
export type ReportStatus = "pending" | "processing" | "ready" | "failed";

export interface Report {
  id:               string;
  user_id:          string;
  report_type:      ReportType;
  format:           ReportFormat;
  status:           ReportStatus;
  file_path:        string | null;
  file_size_bytes:  number | null;
  error_message:    string | null;
  date_range_start: string | null;
  date_range_end:   string | null;
  created_at:       string;
  expires_at:       string;
}

export interface GenerateReportRequest {
  report_type:       ReportType;
  format:            ReportFormat;
  date_range_start?: string; // YYYY-MM-DD
  date_range_end?:   string;
}

export interface GenerateReportResponse {
  report_id:    string;
  download_url: string;
  expires_at:   string;
}

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  portfolio_summary: "Portfolio Summary",
  holdings:          "Holdings",
  performance:       "Performance",
  transactions:      "Transaction History",
};

export const REPORT_FORMAT_LABELS: Record<ReportFormat, string> = {
  csv:  "CSV",
  xlsx: "Excel",
  pdf:  "PDF",
};

export const REPORT_FORMAT_ICONS: Record<ReportFormat, string> = {
  csv:  "file-text-o",
  xlsx: "table",
  pdf:  "file-pdf-o",
};
