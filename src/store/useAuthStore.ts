import { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

interface AuthState {
  session: Session | null;
  user: User | null;
  initialized: boolean;
  isLoading: boolean; // For handling low-latency transitions
  setSession: (session: Session | null) => void;
  setInitialized: (val: boolean) => void;
  setLoading: (val: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  initialized: false,
  isLoading: false,
  setSession: (session) => set({ session, user: session?.user ?? null, isLoading: false }),
  setInitialized: (val) => set({ initialized: val }),
  setLoading: (val) => set({ isLoading: val }),
}));