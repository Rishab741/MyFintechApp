import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data stays fresh for 4 minutes before a background refetch is triggered.
      staleTime: 4 * 60_000,

      // Keep cached data for 20 minutes so navigating back to a screen shows
      // instant data while a background refetch completes. (Previously 10 min —
      // too short for users who quickly switch tabs and return.)
      gcTime: 20 * 60_000,

      // Retry up to 2 times on network errors; financial queries should not
      // hammer servers with a third attempt on a real outage.
      retry: (failureCount) => failureCount < 2,

      // Exponential backoff with jitter to prevent thundering-herd storms when
      // many queries fail simultaneously (e.g. brief network drop):
      //   attempt 1 → 1s ± 500ms
      //   attempt 2 → 2s ± 500ms
      retryDelay: (attempt) => attempt * 1_000 + Math.random() * 500,

      // Only refetch on window focus if data is already stale — prevents
      // unnecessary network calls on every tab switch during the 4-min fresh window.
      refetchOnWindowFocus: 'stale',

      // Active background refresh every 10 minutes even if the user keeps the
      // screen open — prevents data from silently drifting more than 10 min.
      refetchInterval: 10 * 60_000,

      // Don't stop background refresh when the window loses focus (mobile app
      // frequently backgrounds; we still want fresh data on return).
      refetchIntervalInBackground: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
