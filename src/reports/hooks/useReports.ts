"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Linking from "expo-linking";
import {
  checkConnectedProfile,
  deleteReport,
  generateReport,
  listReports,
} from "../service";
import type { GenerateReportRequest, Report } from "../types";

export interface UseReportsReturn {
  reports:          Report[];
  isConnected:      boolean;
  isCheckingAccess: boolean;
  isGenerating:     boolean;
  isLoading:        boolean;
  error:            string | null;
  generate:         (req: GenerateReportRequest) => Promise<void>;
  remove:           (reportId: string) => Promise<void>;
  refresh:          () => Promise<void>;
}

export function useReports(): UseReportsReturn {
  const [reports,          setReports]          = useState<Report[]>([]);
  const [isConnected,      setIsConnected]      = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isGenerating,     setIsGenerating]     = useState(false);
  const [isLoading,        setIsLoading]        = useState(false);
  const [error,            setError]            = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => { return () => { mounted.current = false; }; }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listReports();
      if (mounted.current) setReports(data);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Failed to load reports");
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, []);

  // Check connected profile on mount
  useEffect(() => {
    let active = true;
    setIsCheckingAccess(true);
    checkConnectedProfile()
      .then(connected => { if (active) setIsConnected(connected); })
      .catch(() => { if (active) setIsConnected(false); })
      .finally(() => { if (active) setIsCheckingAccess(false); });
    return () => { active = false; };
  }, []);

  // Load history once access is confirmed
  useEffect(() => {
    if (!isCheckingAccess && isConnected) refresh();
  }, [isCheckingAccess, isConnected, refresh]);

  const generate = useCallback(async (req: GenerateReportRequest) => {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await generateReport(req);
      // Open the signed download URL
      await Linking.openURL(result.download_url);
      // Refresh the list so the new record appears
      await refresh();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      if (mounted.current) setIsGenerating(false);
    }
  }, [refresh]);

  const remove = useCallback(async (reportId: string) => {
    try {
      await deleteReport(reportId);
      if (mounted.current) setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Delete failed");
    }
  }, []);

  return {
    reports,
    isConnected,
    isCheckingAccess,
    isGenerating,
    isLoading,
    error,
    generate,
    remove,
    refresh,
  };
}
