import { useCallback, useEffect, useRef, useState } from "react";
import {
  createScenario,
  deleteScenario,
  listScenarios,
  pollScenario,
  runScenario,
  toggleBookmark,
  updateScenario,
} from "../service";
import type { CreateScenarioInput, Scenario, ScenarioRun } from "../types";

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 120; // 6 minutes

interface UseScenarioReturn {
  scenarios:      Scenario[];
  isLoadingList:  boolean;
  listError:      string | null;

  activeRun:      ScenarioRun | null;
  isRunning:      boolean;
  runError:       string | null;

  create:         (input: CreateScenarioInput) => Promise<Scenario>;
  update:         (id: string, input: Partial<CreateScenarioInput>) => Promise<Scenario>;
  remove:         (id: string) => Promise<void>;
  bookmark:       (id: string, value: boolean) => Promise<void>;
  run:            (scenarioId: string, monthlySavings?: number) => Promise<void>;
  cancelPoll:     () => void;
  refreshList:    () => Promise<void>;
  clearRun:       () => void;
}

export function useScenario(): UseScenarioReturn {
  const [scenarios,     setScenarios]     = useState<Scenario[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError,     setListError]     = useState<string | null>(null);

  const [activeRun,  setActiveRun]  = useState<ScenarioRun | null>(null);
  const [isRunning,  setIsRunning]  = useState(false);
  const [runError,   setRunError]   = useState<string | null>(null);

  const pollTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount   = useRef(0);
  const currentRunId = useRef<string | null>(null);

  // ── List ──────────────────────────────────────────────────────────────────
  const refreshList = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);
    try {
      setScenarios(await listScenarios());
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load scenarios");
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => { refreshList(); }, [refreshList]);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const create = useCallback(async (input: CreateScenarioInput) => {
    const s = await createScenario(input);
    setScenarios(prev => [s, ...prev]);
    return s;
  }, []);

  const update = useCallback(async (id: string, input: Partial<CreateScenarioInput>) => {
    const s = await updateScenario(id, input);
    setScenarios(prev => prev.map(x => x.id === id ? s : x));
    return s;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteScenario(id);
    setScenarios(prev => prev.filter(x => x.id !== id));
  }, []);

  const bookmark = useCallback(async (id: string, value: boolean) => {
    await toggleBookmark(id, value);
    setScenarios(prev => prev.map(x => x.id === id ? { ...x, is_bookmarked: value } : x));
  }, []);

  // ── Run & poll ────────────────────────────────────────────────────────────
  const stopPoll = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const cancelPoll = useCallback(() => {
    stopPoll();
    setIsRunning(false);
    currentRunId.current = null;
  }, [stopPoll]);

  const clearRun = useCallback(() => {
    stopPoll();
    setActiveRun(null);
    setIsRunning(false);
    setRunError(null);
    currentRunId.current = null;
  }, [stopPoll]);

  const startPolling = useCallback((runId: string) => {
    pollCount.current = 0;
    currentRunId.current = runId;

    pollTimer.current = setInterval(async () => {
      if (currentRunId.current !== runId) { stopPoll(); return; }

      pollCount.current += 1;
      if (pollCount.current > MAX_POLL_ATTEMPTS) {
        stopPoll();
        setIsRunning(false);
        setRunError("Simulation timed out — please try again");
        return;
      }

      try {
        const run = await pollScenario(runId);
        setActiveRun(run);

        if (run.status === "complete" || run.status === "failed" || run.status === "expired") {
          stopPoll();
          setIsRunning(false);
          if (run.status === "failed") {
            setRunError(run.error ?? "Simulation failed");
          }
          // Refresh scenario list so last_run_at updates
          refreshList();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // 404 = function not deployed or run not found; 401/403 = auth issue.
        // These are permanent failures — stop polling immediately.
        const isPermanent = /poll-scenario (404|401|403)/.test(msg);
        if (isPermanent) {
          stopPoll();
          setIsRunning(false);
          setRunError("Simulation service unavailable — please try again later");
          console.error("poll-scenario permanent error:", msg);
        } else {
          // Transient network hiccup — keep polling
          console.warn("poll-scenario transient error:", e);
        }
      }
    }, POLL_INTERVAL_MS);
  }, [stopPoll, refreshList]);

  const run = useCallback(async (scenarioId: string, monthlySavings = 1000) => {
    stopPoll();
    setRunError(null);
    setActiveRun(null);
    setIsRunning(true);

    try {
      const { run_id } = await runScenario(scenarioId, monthlySavings);
      setActiveRun({ run_id, status: "queued", started_at: null, completed_at: null, error: null, results: null });
      startPolling(run_id);
    } catch (e) {
      setIsRunning(false);
      setRunError(e instanceof Error ? e.message : "Failed to start simulation");
    }
  }, [stopPoll, startPolling]);

  // Cleanup on unmount
  useEffect(() => () => { stopPoll(); }, [stopPoll]);

  return {
    scenarios,
    isLoadingList,
    listError,
    activeRun,
    isRunning,
    runError,
    create,
    update,
    remove,
    bookmark,
    run,
    cancelPoll,
    refreshList,
    clearRun,
  };
}
