"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type WsStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

export interface LiveTick {
  price:     number;
  volume:    number;
  timestamp: number; // ms
}

interface FinnhubTrade {
  p: number; // price
  s: string; // symbol
  t: number; // timestamp ms
  v: number; // volume
}

const RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

export function useFinnhubWs(symbols: string[]) {
  const token  = process.env.NEXT_PUBLIC_FINNHUB_TOKEN;
  const wsRef  = useRef<WebSocket | null>(null);
  const retry  = useRef(0);
  const timer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(true); // false after unmount

  const [status,     setStatus]     = useState<WsStatus>("idle");
  const [liveQuotes, setLiveQuotes] = useState<Record<string, LiveTick>>({});

  const subscribe = useCallback((ws: WebSocket) => {
    symbols.forEach(sym =>
      ws.send(JSON.stringify({ type: "subscribe", symbol: sym }))
    );
  }, [symbols.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const unsubscribe = useCallback((ws: WebSocket) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    symbols.forEach(sym =>
      ws.send(JSON.stringify({ type: "unsubscribe", symbol: sym }))
    );
  }, [symbols.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = useCallback(() => {
    if (!token || !active.current) return;

    setStatus("connecting");
    const ws = new WebSocket(`wss://ws.finnhub.io?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!active.current) { ws.close(); return; }
      retry.current = 0;
      setStatus("connected");
      subscribe(ws);
    };

    ws.onmessage = (evt: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(evt.data) as { type: string; data?: FinnhubTrade[] };
        if (msg.type !== "trade" || !msg.data?.length) return;

        setLiveQuotes(prev => {
          const next = { ...prev };
          for (const t of msg.data!) {
            const cur = next[t.s];
            // Keep the most recent tick per symbol
            if (!cur || t.t >= cur.timestamp) {
              next[t.s] = { price: t.p, volume: t.v, timestamp: t.t };
            }
          }
          return next;
        });
      } catch {
        // malformed frame — ignore
      }
    };

    ws.onclose = () => {
      if (!active.current) return;
      const delay = RECONNECT_DELAYS[Math.min(retry.current, RECONNECT_DELAYS.length - 1)];
      retry.current++;
      setStatus("reconnecting");
      timer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      setStatus("error");
      ws.close(); // triggers onclose → reconnect
    };
  }, [token, subscribe]);

  useEffect(() => {
    active.current = true;
    connect();

    return () => {
      active.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (wsRef.current) {
        unsubscribe(wsRef.current);
        wsRef.current.close();
      }
    };
  }, [connect, unsubscribe]);

  return { liveQuotes, status };
}
