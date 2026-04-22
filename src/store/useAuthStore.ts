import { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from './secureStorage';

interface AuthState {
  session: Session | null;
  user: User | null;
  initialized: boolean;
  isLoading: boolean; // For handling low-latency transitions
  setSession: (session: Session | null) => void;
  setInitialized: (val: boolean) => void;
  setLoading: (val: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      user: null,
      initialized: false,
      isLoading: false,
      setSession: (session) => set({ session, user: session?.user ?? null, isLoading: false }),
      setInitialized: (val) => set({ initialized: val }),
      setLoading: (val) => set({ isLoading: val }),
    }),
    {
      name: 'auth-store',
      storage: createJSONStorage(() => secureStorage),
      // Persist session + user so the app skips the loading spinner on warm
      // restarts. initialized is always reset to false so _layout.tsx still
      // calls getSession() to verify the token hasn't expired.
      partialize: (state) => ({ session: state.session, user: state.user }),
    },
  ),
);