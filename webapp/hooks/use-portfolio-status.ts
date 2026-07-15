"use client";

import useSWR from "swr";
import { engine } from "@/lib/engine";
import { getJwt } from "@/lib/jwt";

interface PortfolioStatus {
  snapshot_count:  number;
  holdings_count:  number;
  last_computed_at: string | null;
  last_synced_at:  string | null;
}

export function usePortfolioStatus() {
  const { data, isLoading } = useSWR<PortfolioStatus>(
    "portfolio-status",
    async () => engine.portfolio.status(await getJwt()),
    {
      revalidateOnFocus:      false,
      revalidateOnReconnect:  false,
      dedupingInterval:       60_000,
    },
  );

  const hasData =
    !isLoading &&
    ((data?.snapshot_count ?? 0) > 0 || (data?.holdings_count ?? 0) > 0);

  return { hasData, isLoading, status: data ?? null };
}
