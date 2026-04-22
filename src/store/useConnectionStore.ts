import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from './secureStorage';

interface ConnectionState {
  brokerageConnected: boolean;
  /** true while the user is inside the SnapTrade browser portal */
  isConnecting: boolean;
  setBrokerageConnected: (val: boolean) => void;
  setConnecting: (val: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      brokerageConnected: false,
      isConnecting: false,
      setBrokerageConnected: (val) => set({ brokerageConnected: val }),
      setConnecting: (val) => set({ isConnecting: val }),
    }),
    {
      name: 'connection-store',
      storage: createJSONStorage(() => secureStorage),
      // Only persist the connection flag — isConnecting is always ephemeral.
      partialize: (state) => ({ brokerageConnected: state.brokerageConnected }),
    },
  ),
);
