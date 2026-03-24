import { create } from 'zustand';

interface ConnectionState {
  brokerageConnected: boolean;
  /** true while the user is inside the SnapTrade browser portal */
  isConnecting: boolean;
  setBrokerageConnected: (val: boolean) => void;
  setConnecting: (val: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  brokerageConnected: false,
  isConnecting: false,
  setBrokerageConnected: (val) => set({ brokerageConnected: val }),
  setConnecting: (val) => set({ isConnecting: val }),
}));
