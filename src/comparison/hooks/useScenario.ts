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

const POLL_INITIAL_MS   = 1_000;   // first poll after 1s
const POLL_MAX_MS       = 10_000;  // cap backoff at 10s per poll
const MAX_POLL_ATTEMPTS = 60;      // 60 attempts × avg ~5s spacing ≈ ~5 min total

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

  const pollTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCount    = useRef(0);
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
      clearTimeout(pollTimer.current);
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

  // Progressive-backoff polling: 1s → 2s → 4s → 8s → 10s (capped)
  // Avoids hammering the server during the expected slow-start of a simulation
  // while still giving fast feedback when results come back quickly.
  const scheduleNextPoll = useCallback((runId: string) => {
    if (currentRunId.current !== runId) return;

    pollCount.current += 1;
    if (pollCount.current > MAX_POLL_ATTEMPTS) {
      setIsRunning(false);
      setRunError("Simulation timed out — please try again");
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 10s (cap)
    const delay = Math.min(POLL_INITIAL_MS * Math.pow(2, pollCount.current - 1), POLL_MAX_MS);

    pollTimer.current = setTimeout(async () => {
      if (currentRunId.current !== runId) return;

      try {
        const run = await pollScenario(runId);
        setActiveRun(run);

        if (run.status === "complete" || run.status === "failed" || run.status === "expired") {
          setIsRunning(false);
          if (run.status === "failed") setRunError(run.error ?? "Simulation failed");
          refreshList();
        } else {
          scheduleNextPoll(runId);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // 404/401/403 = permanent (function missing or auth issue) — stop immediately.
        const isPermanent = /poll-scenario (404|401|403)/.test(msg);
        if (isPermanent) {
          setIsRunning(false);
          setRunError("Simulation service unavailable — please try again later");
          console.error("poll-scenario permanent error:", msg);
        } else {
          // Transient network hiccup — continue polling with backoff
          console.warn("poll-scenario transient error:", e);
          scheduleNextPoll(runId);
        }
      }
    }, delay);
  }, [refreshList]);

  const startPolling = useCallback((runId: string) => {
    pollCount.current = 0;
    currentRunId.current = runId;
    scheduleNextPoll(runId);
  }, [scheduleNextPoll]);

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

  // Cancel scheduled poll on unmount — stops timeout chain cleanly
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
