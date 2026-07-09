import { createContext, useContext } from 'react';

export const DrawerContext = createContext<() => void>(() => {});
export const useOpenDrawer = () => useContext(DrawerContext);
