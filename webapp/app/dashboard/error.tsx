"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to Sentry with dashboard context
    Sentry.captureException(error, {
      tags: { section: "dashboard" },
    });
  }, [error]);

  const isStaleData = error.message?.includes("stale") || error.message?.includes("NAV");
  const isAuthError = error.message?.includes("401") || error.message?.includes("unauthorized");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 space-y-6">
      <div className="p-4 bg-red-500/10 rounded-full">
        <AlertTriangle className="w-10 h-10 text-red-400" />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-white">
          {isAuthError
            ? "Session expired"
            : isStaleData
            ? "Portfolio data is stale"
            : "Failed to load dashboard"}
        </h2>
        <p className="text-sm text-gray-400 max-w-md">
          {isAuthError
            ? "Your session has expired. Please sign in again."
            : isStaleData
            ? "Your portfolio prices haven't updated in over 24 hours. NAV and all metrics may be incorrect."
            : "An error occurred while loading your portfolio. Your data is safe — this is a display issue."}
        </p>
        {error.digest && (
          <p className="text-xs text-gray-600 font-mono mt-2">
            Ref: {error.digest}
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
        {isAuthError && (
          <a
            href="/"
            className="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-white text-sm rounded-md transition-colors"
          >
            Sign in
          </a>
        )}
      </div>
    </div>
  );
}
