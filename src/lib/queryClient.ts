import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 4 minutes. A background refetch fires
      // only after this window closes, keeping the UI snappy on tab switches.
      staleTime: 4 * 60_000,

      // Keep unused query data in the cache for 10 minutes so navigating back
      // to a screen shows instant data while a background refetch happens.
      gcTime: 10 * 60_000,

      // Retry once on network errors; financial data shouldn't hammer servers.
      retry: 1,
      retryDelay: 2_000,

      // Refetch when the app comes back to the foreground (user switched away
      // and returned) — same signal the AppState listener used to handle.
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
