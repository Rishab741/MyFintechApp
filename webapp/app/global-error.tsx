"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-[#0d1117]">
        <div className="text-center space-y-4 px-4">
          <div className="text-red-500 text-5xl">⚠</div>
          <h1 className="text-xl font-semibold text-white">
            Something went wrong
          </h1>
          <p className="text-sm text-gray-400 max-w-sm">
            An unexpected error occurred. The error has been reported and our
            team will investigate.
          </p>
          {error.digest && (
            <p className="text-xs text-gray-600 font-mono">
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
