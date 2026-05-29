import { useCallback, useEffect, useState } from "react";
import { fetchBehavioralProfile, triggerProfileRebuild } from "../service";
import type { BehavioralProfile } from "../types";

interface UseBehavioralProfileReturn {
  profile:     BehavioralProfile | null;
  isLoading:   boolean;
  isRebuilding: boolean;
  error:       string | null;
  refresh:     () => Promise<void>;
  rebuild:     () => Promise<void>;
}

export function useBehavioralProfile(): UseBehavioralProfileReturn {
  const [profile,      setProfile]      = useState<BehavioralProfile | null>(null);
  const [isLoading,    setIsLoading]    = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setProfile(await fetchBehavioralProfile());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load behavioral profile");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const rebuild = useCallback(async () => {
    setIsRebuilding(true);
    setError(null);
    try {
      await triggerProfileRebuild();
      // Give the engine a moment to process before refreshing
      await new Promise(r => setTimeout(r, 4_000));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rebuild profile");
    } finally {
      setIsRebuilding(false);
    }
  }, [refresh]);

  return { profile, isLoading, isRebuilding, error, refresh, rebuild };
}
